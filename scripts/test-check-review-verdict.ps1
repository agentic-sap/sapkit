# test-check-review-verdict.ps1 - reproduction tests for the run-scoped
# review-gate checker (scripts/check-review-verdict.ps1 v2).
#
# Spec: docs/reference/designs/2026-07-16-integration-hardening-roadmap.md S2-B.
# Schema: docs/reference/templates/review-verdict.schema.json (v2).
# Origin: the v1 phase-axis suite (D-021 AC1-AC4); AC5 is a live-SAP criterion,
# out of scope here.
#
# Each case builds a throwaway git fixture repo under the OS temp dir (never
# the real repo) and drives the real checker as a fresh child process whose
# working directory is the fixture - exactly how the engine runs verify
# (cwd = repo root). The child sets both Set-Location and
# [Environment]::CurrentDirectory so native git and the relative -Verdict path
# both resolve against the fixture.
#
# Capture files live OUTSIDE the fixture so they never pollute git status.
# Fixtures are removed on exit.
#
# PowerShell 5.1 compatible. ASCII only. Dependencies: git only.

$ErrorActionPreference = "Stop"

$script:CheckerPath = Join-Path $PSScriptRoot "check-review-verdict.ps1"
if (-not (Test-Path -LiteralPath $script:CheckerPath)) {
    Write-Output "TEST_ABORT: checker not found at $script:CheckerPath"
    exit 1
}

$script:Fixtures = @()
$script:Pass = 0
$script:Fail = 0
$script:Rows = @()

# --- helpers ---------------------------------------------------------------

function New-Fixture {
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("crv-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    $script:Fixtures += $dir
    & git -C $dir init -q 2>$null | Out-Null
    & git -C $dir config user.email "test@example.com" 2>$null | Out-Null
    & git -C $dir config user.name  "crv-test"         2>$null | Out-Null
    & git -C $dir config commit.gpgsign false          2>$null | Out-Null
    & git -C $dir config core.autocrlf false           2>$null | Out-Null
    return $dir
}

function Write-Fixt($dir, $rel, $content) {
    $full = Join-Path $dir ($rel -replace '/', '\')
    $parent = Split-Path -Parent $full
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -LiteralPath $full -Value $content -Encoding ASCII
}

function Commit-All($dir, $msg) {
    & git -C $dir add -A 2>$null | Out-Null
    & git -C $dir commit -q -m $msg 2>$null | Out-Null
}

function Head-Of($dir) {
    return (& git -C $dir rev-parse HEAD 2>$null).Trim()
}

# Recompute the exact-subject hash exactly as the checker does: SHA256 over the
# UTF-8 bytes of `git ls-tree -r HEAD -- src`, LF-joined, no trailing newline.
function Src-Hash($dir) {
    $lines = & git -C $dir ls-tree -r HEAD -- src 2>$null
    $arr = @($lines | Where-Object { -not [string]::IsNullOrEmpty($_) })
    $joined = ($arr -join "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally { $sha.Dispose() }
}

$script:GoodBoundary = '{ "policy_profile": "P1", "transport_operations": 0, "sap_mutation_boundary": "unverified" }'

function Set-Verdict($dir, $runId, $verdict, $head, $srcHash, $findingsJson, $boundaryJson) {
    if ([string]::IsNullOrEmpty($boundaryJson)) { $boundaryJson = $script:GoodBoundary }
    $rel = ".harness/runs/$runId/review-verdict.json"
    $json = "{`n  ""run_id"": ""$runId"",`n  ""verdict"": ""$verdict"",`n  ""reviewed_head"": ""$head"",`n  ""reviewed_source_sha256"": ""$srcHash"",`n  ""boundary"": $boundaryJson,`n  ""findings"": $findingsJson`n}"
    Write-Fixt $dir $rel $json
    return $rel
}

# Run the real checker as a fresh child powershell rooted at the fixture.
function Invoke-Checker($dir, $runId, $verdictRel) {
    $cmd = "Set-Location -LiteralPath '$dir'; [Environment]::CurrentDirectory='$dir'; & '$script:CheckerPath' -RunId '$runId' -Verdict '$verdictRel'"
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1
    $exit = $LASTEXITCODE
    return [pscustomobject]@{ Exit = $exit; Out = ($out | Out-String) }
}

# Legacy phase-axis invocation - must be denied.
function Invoke-CheckerLegacy($dir, $phase, $verdictRel) {
    $cmd = "Set-Location -LiteralPath '$dir'; [Environment]::CurrentDirectory='$dir'; & '$script:CheckerPath' -Phase '$phase' -Verdict '$verdictRel'"
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1
    $exit = $LASTEXITCODE
    return [pscustomobject]@{ Exit = $exit; Out = ($out | Out-String) }
}

# Run the sha256-pin wrapper command form, rooted at the fixture.
function Invoke-Wrapper($dir, $runId, $pin) {
    $inner = "`$s='scripts/check-review-verdict.ps1'; if ((Get-FileHash `$s -Algorithm SHA256).Hash -ne '$pin') { Write-Output 'CHECKER_TAMPERED'; exit 1 }; & `$s -RunId '$runId' -Verdict '.harness/runs/$runId/review-verdict.json'"
    $cmd = "Set-Location -LiteralPath '$dir'; [Environment]::CurrentDirectory='$dir'; $inner"
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1
    $exit = $LASTEXITCODE
    return [pscustomobject]@{ Exit = $exit; Out = ($out | Out-String) }
}

function Check($name, $expectedExit, $result, $extraOk, $note) {
    if ($null -eq $extraOk) { $extraOk = $true }
    $ok = ($result.Exit -eq $expectedExit) -and $extraOk
    if ($ok) { $script:Pass++ } else { $script:Fail++ }
    $status = if ($ok) { "PASS" } else { "FAIL" }
    $script:Rows += [pscustomobject]@{
        Case = $name; Expected = $expectedExit; Actual = $result.Exit; Result = $status
    }
    Write-Output ("[{0}] {1} -- expected exit {2}, got {3}{4}" -f `
        $status, $name, $expectedExit, $result.Exit, $(if ($note) { " ($note)" } else { "" }))
    if (-not $ok) {
        Write-Output ("       reason line: " + ($result.Out -replace "`r?`n", " ").Trim())
    }
}

$MINOR = '[ { "bucket": "B1", "severity": "MINOR", "object": "ZCL_X", "finding": "naming" } ]'
$MAJOR = '[ { "bucket": "B2", "severity": "MAJOR", "object": "ZCL_X", "finding": "INNER vs LEFT JOIN drops rows" } ]'
$run   = "r-demo-001"

function Scaffold-Base($dir, $runId) {
    Write-Fixt $dir "src/zcl_foo.abap"                      "CLASS zcl_foo DEFINITION. ENDCLASS."
    Write-Fixt $dir ".harness/runs/$runId/index.json"       '{ "steps": [] }'
    Write-Fixt $dir ".harness/runs/$runId/contract.md"      "# run contract"
}

# --- test body -------------------------------------------------------------

try {

    # --- v1-derived cases (run axis) ---------------------------------------

    # Normal path: fresh PASS verdict, head+source pinned, only the verdict dirty.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        $r = Invoke-Checker $dir $run $rel
        Check "NORMAL PASS (only verdict dirty)" 0 $r $true "the happy path"
    }.Invoke()

    # Stale PASS committed in the previous commit, no dirty this attempt.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $shaA = Head-Of $dir
        $rel = Set-Verdict $dir $run "PASS" $shaA (Src-Hash $dir) $MINOR $null
        Commit-All $dir "c2 commit verdict (stale)"
        $r = Invoke-Checker $dir $run $rel
        Check "STALE committed PASS -> blocked" 1 $r $true "no dirty this attempt"
    }.Invoke()

    # Reviewer sneaks a code change: verdict + src/*.abap both dirty -> superset.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        Add-Content -LiteralPath (Join-Path $dir "src\zcl_foo.abap") -Value "* sneaked edit"
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "zcl_foo\.abap")
        Check "REVIEWER code edit -> blocked" 1 $r $extra "verdict + src both dirty"
    }.Invoke()

    # reviewed_head does not match current HEAD.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" ("0" * 40) (Src-Hash $dir) $MINOR $null
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "HEAD")
        Check "HEAD binding mismatch -> blocked" 1 $r $extra "head binding"
    }.Invoke()

    # FAIL verdict.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "FAIL" (Head-Of $dir) (Src-Hash $dir) $MAJOR $null
        $r = Invoke-Checker $dir $run $rel
        Check "FAIL verdict -> blocked" 1 $r $true "verdict != PASS"
    }.Invoke()

    # PASS that still carries a MAJOR finding.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MAJOR $null
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "MAJOR")
        Check "PASS-with-MAJOR -> blocked" 1 $r $extra "consistency check"
    }.Invoke()

    # Engine bookkeeping under THIS run + verdict dirty -> pass.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Write-Fixt $dir ".harness/runs/$run/step0-output.json" '{ "ok": true }'
        Write-Fixt $dir ".harness/runs/$run/run-summary.json"  '{ "ok": true }'
        Write-Fixt $dir ".harness/runs/$run/run-history.jsonl" '{"t":1}'
        Write-Fixt $dir ".harness/STATE.md"                    "# state"
        Commit-All $dir "c1 base + bookkeeping"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        Add-Content -LiteralPath (Join-Path $dir ".harness\runs\$run\index.json")        -Value " "
        Add-Content -LiteralPath (Join-Path $dir ".harness\runs\$run\step0-output.json") -Value " "
        Add-Content -LiteralPath (Join-Path $dir ".harness\runs\$run\run-summary.json")  -Value " "
        Add-Content -LiteralPath (Join-Path $dir ".harness\runs\$run\run-history.jsonl") -Value "`n{""t"":2}"
        Add-Content -LiteralPath (Join-Path $dir ".harness\STATE.md")                    -Value "more"
        $r = Invoke-Checker $dir $run $rel
        Check "EXCLUSION bookkeeping+verdict dirty -> pass" 0 $r $true "engine files excluded"
    }.Invoke()

    # Verdict file absent.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $r = Invoke-Checker $dir $run ".harness/runs/$run/review-verdict.json"
        $extra = ($r.Out -match "not found")
        Check "MISSING verdict file -> blocked" 1 $r $extra "fail-closed"
    }.Invoke()

    # Untracked NEW directory with a file inside must be seen (-uall).
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        Write-Fixt $dir "src/newpkg/sneak.abap" "CLASS sneak DEFINITION. ENDCLASS."
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "src/newpkg/sneak\.abap")
        Check "UALL nested untracked file -> blocked" 1 $r $extra "file inside new dir is seen"
    }.Invoke()

    # Malformed JSON.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        Write-Fixt $dir ".harness/runs/$run/review-verdict.json" "{ this is not valid json "
        $r = Invoke-Checker $dir $run ".harness/runs/$run/review-verdict.json"
        Check "MALFORMED json -> blocked" 1 $r $true "fail-closed parse"
    }.Invoke()

    # Missing reviewed_head field.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        Write-Fixt $dir ".harness/runs/$run/review-verdict.json" ('{ "run_id": "' + $run + '", "verdict": "PASS", "findings": [] }')
        $r = Invoke-Checker $dir $run ".harness/runs/$run/review-verdict.json"
        $extra = ($r.Out -match "reviewed_head")
        Check "MISSING reviewed_head -> blocked" 1 $r $extra "field required"
    }.Invoke()

    # --- v2 cases: run axis, source pin, boundary --------------------------

    # Legacy -Phase entry point is denied.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        $r = Invoke-CheckerLegacy $dir "1-demo" $rel
        $extra = ($r.Out -match "legacy -Phase")
        Check "LEGACY -Phase -> denied" 1 $r $extra "run axis only"
    }.Invoke()

    # run_id in the verdict must equal -RunId (no cross-run replay).
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        # verdict lives in $run's dir but claims a different run_id
        $head = Head-Of $dir
        $srcH = Src-Hash $dir
        $json = "{`n  ""run_id"": ""r-other-999"",`n  ""verdict"": ""PASS"",`n  ""reviewed_head"": ""$head"",`n  ""reviewed_source_sha256"": ""$srcH"",`n  ""boundary"": $script:GoodBoundary,`n  ""findings"": $MINOR`n}"
        Write-Fixt $dir $rel $json
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "run_id mismatch")
        Check "RUN_ID mismatch -> blocked" 1 $r $extra "no cross-run replay"
    }.Invoke()

    # Verdict path outside the run directory.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        Write-Fixt $dir "phases/1-demo/review-verdict.json" '{ "run_id": "r-demo-001", "verdict": "PASS" }'
        $r = Invoke-Checker $dir $run "phases/1-demo/review-verdict.json"
        $extra = ($r.Out -match "must live under")
        Check "VERDICT outside run dir -> blocked" 1 $r $extra "verdict must live in its run"
    }.Invoke()

    # Source byte change after review -> pinned hash is stale.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $staleHash = Src-Hash $dir
        # source changes and is committed -> blob sha changes -> pin goes stale
        Write-Fixt $dir "src/zcl_foo.abap" "CLASS zcl_foo DEFINITION. ENDCLASS. * changed"
        Commit-All $dir "c2 source change"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) $staleHash $MINOR $null
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "stale")
        Check "SOURCE hash stale -> blocked" 1 $r $extra "source byte change invalidates"
    }.Invoke()

    # Missing reviewed_source_sha256.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $head = Head-Of $dir
        Write-Fixt $dir ".harness/runs/$run/review-verdict.json" ('{ "run_id": "' + $run + '", "verdict": "PASS", "reviewed_head": "' + $head + '", "boundary": ' + $script:GoodBoundary + ', "findings": [] }')
        $r = Invoke-Checker $dir $run ".harness/runs/$run/review-verdict.json"
        $extra = ($r.Out -match "reviewed_source_sha256")
        Check "MISSING reviewed_source_sha256 -> blocked" 1 $r $extra "exact subject required"
    }.Invoke()

    # Missing boundary.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $head = Head-Of $dir
        $srcH = Src-Hash $dir
        Write-Fixt $dir ".harness/runs/$run/review-verdict.json" ('{ "run_id": "' + $run + '", "verdict": "PASS", "reviewed_head": "' + $head + '", "reviewed_source_sha256": "' + $srcH + '", "findings": [] }')
        $r = Invoke-Checker $dir $run ".harness/runs/$run/review-verdict.json"
        $extra = ($r.Out -match "boundary")
        Check "MISSING boundary -> blocked" 1 $r $extra "attestation required"
    }.Invoke()

    # Reviewer claims a Policy profile above P1.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $bad = '{ "policy_profile": "P3", "transport_operations": 0, "sap_mutation_boundary": "unverified" }'
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $bad
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "P0 or P1")
        Check "BOUNDARY policy P3 -> blocked" 1 $r $extra "reviewer may not exceed P1"
    }.Invoke()

    # Reviewer performed a transport operation (reads included).
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $bad = '{ "policy_profile": "P1", "transport_operations": 1, "sap_mutation_boundary": "unverified" }'
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $bad
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "transport")
        Check "BOUNDARY transport_operations=1 -> blocked" 1 $r $extra "reads count too"
    }.Invoke()

    # Dishonest boundary state (claiming the gap is closed).
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Commit-All $dir "c1 base"
        $bad = '{ "policy_profile": "P1", "transport_operations": 0, "sap_mutation_boundary": "verified" }'
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $bad
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "unverified")
        Check "BOUNDARY dishonest 'verified' -> blocked" 1 $r $extra "honest state is enforced"
    }.Invoke()

    # A reviewer must not touch another run's artifacts.
    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        Write-Fixt $dir ".harness/runs/r-other-002/index.json" '{ "steps": [] }'
        Commit-All $dir "c1 base + other run"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        Add-Content -LiteralPath (Join-Path $dir ".harness\runs\r-other-002\index.json") -Value " "
        $r = Invoke-Checker $dir $run $rel
        $extra = ($r.Out -match "r-other-002")
        Check "OTHER run touched -> blocked" 1 $r $extra "other runs are not bookkeeping"
    }.Invoke()

    # --- sha256-pin wrapper -------------------------------------------------

    {
        $dir = New-Fixture
        Scaffold-Base $dir $run
        New-Item -ItemType Directory -Path (Join-Path $dir "scripts") -Force | Out-Null
        $copied = Join-Path $dir "scripts\check-review-verdict.ps1"
        Copy-Item -LiteralPath $script:CheckerPath -Destination $copied -Force
        Commit-All $dir "c1 base + checker copy"
        $rel = Set-Verdict $dir $run "PASS" (Head-Of $dir) (Src-Hash $dir) $MINOR $null
        $pin = (Get-FileHash -LiteralPath $copied -Algorithm SHA256).Hash

        $r1 = Invoke-Wrapper $dir $run $pin
        $extra1 = (-not ($r1.Out -match "CHECKER_TAMPERED"))
        Check "PIN correct -> pass" 0 $r1 $extra1 "pin matches, checker runs"

        Add-Content -LiteralPath $copied -Value "#"
        $r2 = Invoke-Wrapper $dir $run $pin
        $extra2 = ($r2.Out -match "CHECKER_TAMPERED")
        Check "PIN tampered checker -> blocked" 1 $r2 $extra2 "sha256 mismatch"
    }.Invoke()

}
finally {
    foreach ($f in $script:Fixtures) {
        if ($f -and (Test-Path -LiteralPath $f)) {
            Remove-Item -LiteralPath $f -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- summary ---------------------------------------------------------------

Write-Output ""
Write-Output "==================== SUMMARY ===================="
$script:Rows | Format-Table -AutoSize | Out-String | Write-Output
Write-Output ("Total: {0}  Passed: {1}  Failed: {2}" -f ($script:Pass + $script:Fail), $script:Pass, $script:Fail)

if ($script:Fail -eq 0) {
    Write-Output "RESULT: ALL PASS"
    exit 0
} else {
    Write-Output "RESULT: FAILURES PRESENT"
    exit 1
}
