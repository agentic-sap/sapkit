# check-review-verdict.ps1 - run-scoped review-gate verdict checker (Track A).
#
# v2 (2026-07-16, roadmap S2-B): the axis is a RUN, not a phase. The legacy
# -Phase entry point is denied here as defense-in-depth; scripts/run-track-a.ps1
# denies it at the wrapper with exit 64 LEGACY_PHASE_DENY.
#
# Spec: docs/reference/designs/2026-07-16-integration-hardening-roadmap.md S2-B.
# Schema: docs/reference/templates/review-verdict.schema.json (v2).
# Decisions: D-021 (original gate), D-025 (role x P0-P4), D-027 (order), D-028.
#
# Invoked as the review step's OWN verify command, from the repo root:
#   & scripts/check-review-verdict.ps1 -RunId <id> `
#       -Verdict .harness/runs/<id>/review-verdict.json
# The engine runs verify with cwd = repo root, so both git and the relative
# -Verdict path resolve against the repo root. This script does NOT Set-Location:
# it operates on the current working directory, which keeps it testable against a
# throwaway fixture repo (see test-check-review-verdict.ps1).
#
# Judgment order:
#   (0) legacy -Phase supplied            -> deny (run axis only)
#   (1) run_id == -RunId                  (a verdict cannot be replayed into
#                                          another run)
#   (2) verdict == "PASS"                 (defense: a PASS that still carries a
#                                          MAJOR finding is internally
#                                          inconsistent -> reject)
#   (3) reviewed_head (40-hex) == current `git rev-parse HEAD`
#   (4) reviewed_source_sha256 == recomputed hash of the exact source subject
#       (SHA256 over UTF-8 bytes of `git ls-tree -r HEAD -- <SourcePath>`,
#        LF-joined, no trailing newline). A committed source byte change alters a
#       blob sha -> the verdict is stale. Uncommitted source edits are caught by
#       (6) instead, because the src file would show up in the dirty set.
#   (5) boundary attests P0/P1, transport_operations == 0,
#       sap_mutation_boundary == "unverified"
#   (6) equational dirty check: the dirty set, minus engine bookkeeping, must
#       equal EXACTLY { <Verdict> }. Empty fails (stale/committed PASS carries no
#       new dirty); any superset fails (reviewer sneaking other changes).
#
# Bookkeeping exclusion (v2 - deliberately TIGHTER than v1's blanket .harness/**):
#   - .harness/runs/<RunId>/{index.json,run-summary.json,run-history.jsonl,
#     step*-output.json}          -> engine-owned, excluded
#   - anything ELSE under .harness/runs/<RunId>/ -> NOT excluded, so the verdict
#     itself stays in the dirty set (v1 excluded .harness/** wholesale, which
#     would now swallow the verdict and make the equational check vacuous)
#   - .harness/runs/<other-run>/**              -> NOT excluded (a reviewer must
#     not touch another run)
#   - other .harness/* engine files (frozen GOAL.md/STATE.md, RULES.md, locks)
#     -> excluded
#
# git status uses -uall so untracked NEW directories are expanded into their
# files (plain --porcelain collapses a new dir to one line and hides the files
# inside it - measured 2026-07-11, .harness/STATE.md).
#
# Fail-closed everywhere: missing / unreadable / unparseable verdict, a missing
# field, a format mismatch, or any git failure -> exit 1 with a one-line reason
# on stdout. Only a fully satisfied verdict -> exit 0. Exactly one line is
# written on every path so the outcome is identifiable in the engine console log.
#
# PowerShell 5.1 compatible. ASCII only. No external dependencies (git only).

param(
    [string]$RunId,
    [string]$Verdict,
    [string]$SourcePath = "src",
    [string]$Phase
)

function Fail([string]$reason) {
    Write-Output "REVIEW_GATE_FAIL: $reason"
    exit 1
}

# --- (0) legacy phase axis is denied ---
if (-not [string]::IsNullOrWhiteSpace($Phase)) {
    Fail "legacy -Phase is not supported; use -RunId (run axis, roadmap S2-B)"
}

if ([string]::IsNullOrWhiteSpace($RunId))   { Fail "missing -RunId argument" }
if ([string]::IsNullOrWhiteSpace($Verdict)) { Fail "missing -Verdict argument" }

$runIdNorm = $RunId.Trim()
if ($runIdNorm -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
    Fail "run id has an unsupported format (got '$runIdNorm')"
}

# Normalize the passed verdict path to git's form (forward slashes, unquoted).
$verdictNorm = ($Verdict -replace '\\', '/').Trim().Trim('"')

# The verdict must live inside the run it judges.
$expectedDir = ".harness/runs/$runIdNorm/"
if (-not $verdictNorm.StartsWith($expectedDir)) {
    Fail "verdict path must live under $expectedDir (got '$verdictNorm')"
}

# --- read + parse verdict (fail-closed on any read/parse error) ---
if (-not (Test-Path -LiteralPath $Verdict -PathType Leaf)) {
    Fail "verdict file not found: $verdictNorm"
}
try {
    $raw = Get-Content -LiteralPath $Verdict -Raw -ErrorAction Stop
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    Fail "verdict JSON unreadable/unparseable: $($_.Exception.Message)"
}
if ($null -eq $obj) { Fail "verdict JSON is empty" }

# --- (1) run_id binding ---
$runIdField = $obj.run_id
if ($null -eq $runIdField) { Fail "run_id field missing" }
if ("$runIdField".Trim() -cne $runIdNorm) {
    Fail "run_id mismatch; verdict says '$runIdField' but -RunId is '$runIdNorm'"
}

# --- (2) verdict == PASS (+ MAJOR-consistency defense) ---
$verdictValue = $obj.verdict
if ($null -eq $verdictValue) { Fail "verdict field missing" }
if ($verdictValue -cne 'PASS') { Fail "verdict is not PASS (got '$verdictValue')" }

if ($null -ne $obj.findings) {
    foreach ($f in @($obj.findings)) {
        if ($null -ne $f -and "$($f.severity)".ToUpperInvariant() -eq 'MAJOR') {
            Fail "verdict is PASS but carries a MAJOR finding (inconsistent verdict)"
        }
    }
}

# --- (3) reviewed_head == current HEAD ---
$reviewedHead = $obj.reviewed_head
if ($null -eq $reviewedHead) { Fail "reviewed_head field missing" }
$reviewedHead = "$reviewedHead".Trim()
if ($reviewedHead -notmatch '^[0-9a-fA-F]{40}$') {
    Fail "reviewed_head is not a 40-hex commit sha (got '$reviewedHead')"
}
$currentHead = & git rev-parse HEAD 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentHead)) {
    Fail "git rev-parse HEAD failed (not a repo / no commit) - fail-closed"
}
$currentHead = $currentHead.Trim()
if ($reviewedHead.ToLowerInvariant() -ne $currentHead.ToLowerInvariant()) {
    Fail "reviewed_head ($reviewedHead) != current HEAD ($currentHead)"
}

# --- (4) reviewed_source_sha256 == recomputed exact-subject hash ---
$reviewedSrc = $obj.reviewed_source_sha256
if ($null -eq $reviewedSrc) { Fail "reviewed_source_sha256 field missing" }
$reviewedSrc = "$reviewedSrc".Trim()
if ($reviewedSrc -notmatch '^[0-9a-f]{64}$') {
    Fail "reviewed_source_sha256 is not 64-hex lowercase (got '$reviewedSrc')"
}

$treeLines = & git ls-tree -r HEAD -- $SourcePath 2>$null
if ($LASTEXITCODE -ne 0) {
    Fail "git ls-tree failed for source path '$SourcePath' (fail-closed)"
}
$treeArr = @($treeLines | Where-Object { -not [string]::IsNullOrEmpty($_) })
if ($treeArr.Count -eq 0) {
    Fail "no source subject at '$SourcePath' in HEAD - nothing to review (fail-closed)"
}
$joined = ($treeArr -join "`n")
try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
    $computed = (($sha256.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
} catch {
    Fail "source hash computation failed: $($_.Exception.Message)"
} finally {
    if ($null -ne $sha256) { $sha256.Dispose() }
}
if ($reviewedSrc -cne $computed) {
    Fail "reviewed_source_sha256 stale; verdict pinned $reviewedSrc but '$SourcePath' at HEAD hashes to $computed"
}

# --- (5) boundary attestation ---
$boundary = $obj.boundary
if ($null -eq $boundary) { Fail "boundary field missing" }

$policy = $boundary.policy_profile
if ($null -eq $policy) { Fail "boundary.policy_profile missing" }
$policy = "$policy".Trim()
if ($policy -cne 'P0' -and $policy -cne 'P1') {
    Fail "boundary.policy_profile must be P0 or P1 - a reviewer may not exceed P1 (got '$policy')"
}

$transportOps = $boundary.transport_operations
if ($null -eq $transportOps) { Fail "boundary.transport_operations missing" }
$transportInt = 0
if (-not [int]::TryParse("$transportOps", [ref]$transportInt)) {
    Fail "boundary.transport_operations is not an integer (got '$transportOps')"
}
if ($transportInt -ne 0) {
    Fail "boundary.transport_operations must be 0 - reviewers perform no transport operation, reads included (got $transportInt)"
}

$mutBoundary = $boundary.sap_mutation_boundary
if ($null -eq $mutBoundary) { Fail "boundary.sap_mutation_boundary missing" }
if ("$mutBoundary".Trim() -cne 'unverified') {
    Fail "boundary.sap_mutation_boundary must be recorded exactly as 'unverified' (got '$mutBoundary')"
}

# --- (6) equational dirty check ---
# -uall expands untracked new directories into individual files; core.quotepath
# off keeps non-ASCII paths raw (no octal escaping) for a clean compare.
$statusLines = & git -c core.quotepath=false status --porcelain -uall 2>$null
if ($LASTEXITCODE -ne 0) {
    Fail "git status failed (fail-closed)"
}

$runPrefix = ".harness/runs/$runIdNorm/"
function Test-Bookkeeping([string]$p, [string]$prefix) {
    # Inside THIS run: only the engine-owned files are bookkeeping. Everything
    # else (including the verdict) stays in the dirty set on purpose.
    if ($p.StartsWith($prefix)) {
        $rest = $p.Substring($prefix.Length)
        if ($rest -eq "index.json")        { return $true }
        if ($rest -eq "run-summary.json")  { return $true }
        if ($rest -eq "run-history.jsonl") { return $true }
        if ($rest -match '^step.*-output\.json$') { return $true }
        return $false
    }
    if ($p.StartsWith(".harness/")) {
        $rest2 = $p.Substring(".harness/".Length)
        # Another run's artifacts are NOT bookkeeping - a reviewer must not
        # touch a run it is not judging.
        if ($rest2.StartsWith("runs/")) { return $false }
        return $true
    }
    return $false
}

$relevant = New-Object System.Collections.Generic.List[string]
foreach ($line in @($statusLines)) {
    if ([string]::IsNullOrEmpty($line)) { continue }
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3)
    # rename/copy lines look like "old -> new"; the destination is what is dirty.
    if ($path -match " -> ") { $path = ($path -split " -> ", 2)[1] }
    $path = $path.Trim().Trim('"')
    if ([string]::IsNullOrEmpty($path)) { continue }
    if (Test-Bookkeeping $path $runPrefix) { continue }
    if (-not $relevant.Contains($path)) { [void]$relevant.Add($path) }
}

$expected = $verdictNorm
if ($relevant.Count -eq 0) {
    Fail "no reviewer-authored dirty change; expected exactly { $expected } (stale/committed verdict?)"
}
if ($relevant.Count -ne 1 -or $relevant[0] -cne $expected) {
    $got = ($relevant | Sort-Object) -join ", "
    Fail "dirty set mismatch; expected exactly { $expected }, got { $got }"
}

Write-Output "REVIEW_GATE_PASS: run=$runIdNorm, verdict=PASS, reviewed_head==HEAD ($currentHead), source==$computed, boundary=$policy/transport=0, dirty == { $expected }"
exit 0
