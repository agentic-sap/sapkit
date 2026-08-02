# test-promote-track-b-run.ps1 - tests for the Track B -> Guided bridge
# (scripts/promote-track-b-run.ps1).
#
# Spec: docs/reference/designs/2026-07-16-integration-hardening-roadmap.md S2-D.
# Pass criteria (§8.5): "bridge 정상/중복/hash mismatch/malformed tests PASS".
#
# Beyond those four, this suite pins the one-way claim itself: after a promotion
# the source .sapkit tree must be byte-identical (the bridge reads, never writes).
#
# Exit codes under test:
#   0 OK | 64 BAD_ARGS | 66 SOURCE_INVALID | 69 RUN_EXISTS | 70 TIER_DENY
#
# PowerShell 5.1 compatible. ASCII only.

$ErrorActionPreference = "Stop"

$script:BridgePath = Join-Path $PSScriptRoot "promote-track-b-run.ps1"
if (-not (Test-Path -LiteralPath $script:BridgePath)) {
    Write-Output "TEST_ABORT: bridge not found at $script:BridgePath"
    exit 1
}

$script:Fixtures = @()
$script:Pass = 0
$script:Fail = 0
$script:Rows = @()

# --- helpers ---------------------------------------------------------------

function New-Fixture {
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("ptb-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    $script:Fixtures += $dir
    return $dir
}

function Write-Fixt($dir, $rel, $content) {
    $full = Join-Path $dir ($rel -replace '/', '\')
    $parent = Split-Path -Parent $full
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    # -NoNewline keeps the hash deterministic across the fixture and the bridge.
    Set-Content -LiteralPath $full -Value $content -Encoding UTF8 -NoNewline
}

function Get-Sha256([string]$path) {
    return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$script:Obj = "ZR_FI_GL_LIST"

# Builds .sapkit/program/<obj>/{spec.md,approval.json}. Returns the source rel path.
function Write-Source($dir, $tier, $hashOverride, $approvalRaw) {
    $rel = ".sapkit/program/$script:Obj"
    Write-Fixt $dir "$rel/spec.md" "# Program Spec: $script:Obj`n## 1. Purpose`nList GL open items."
    $specFull = Join-Path $dir ("$rel/spec.md" -replace '/', '\')
    $h = if ($hashOverride) { $hashOverride } else { Get-Sha256 $specFull }
    if ($approvalRaw) {
        Write-Fixt $dir "$rel/approval.json" $approvalRaw
    } else {
        $json = @"
{
  "spec_sha256": "$h",
  "sid": "S4H",
  "client": "100",
  "tier": "$tier",
  "package": "`$TMP",
  "objects": ["$script:Obj"],
  "transport": "none"
}
"@
        Write-Fixt $dir "$rel/approval.json" $json
    }
    return $rel
}

# Snapshot every file under a subtree as path->sha256, to prove read-only.
function Snapshot-Tree($dir, $rel) {
    $root = Join-Path $dir ($rel -replace '/', '\')
    $map = @{}
    Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
        $map[$_.FullName.Substring($root.Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
    return $map
}

function Compare-Snapshot($a, $b) {
    if ($a.Count -ne $b.Count) { return $false }
    foreach ($k in $a.Keys) {
        if (-not $b.ContainsKey($k)) { return $false }
        if ($a[$k] -ne $b[$k]) { return $false }
    }
    return $true
}

# -File (not -Command): -Command normalizes the exit code to 0/1 and would
# collapse 64/66/69/70 (measured 2026-07-16, same trap as the wrapper suite).
function Invoke-Bridge($dir, [string[]]$bridgeArgs) {
    $prev = (Get-Location).Path
    try {
        Set-Location -LiteralPath $dir
        [Environment]::CurrentDirectory = $dir
        $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script:BridgePath @bridgeArgs 2>&1
        $exit = $LASTEXITCODE
        return [pscustomobject]@{ Exit = $exit; Out = ($out | Out-String) }
    } finally {
        Set-Location -LiteralPath $prev
        [Environment]::CurrentDirectory = $prev
    }
}

function Check($name, $expectedExit, $result, $extraOk) {
    if ($null -eq $extraOk) { $extraOk = $true }
    $ok = ($result.Exit -eq $expectedExit) -and $extraOk
    if ($ok) { $script:Pass++ } else { $script:Fail++ }
    $status = if ($ok) { "PASS" } else { "FAIL" }
    $script:Rows += [pscustomobject]@{
        Case = $name; Expected = $expectedExit; Actual = $result.Exit; Result = $status
    }
    Write-Output ("[{0}] {1} -- expected exit {2}, got {3}" -f $status, $name, $expectedExit, $result.Exit)
    if (-not $ok) { Write-Output ("       output: " + ($result.Out -replace "`r?`n", " ").Trim()) }
}

$run = "r-glopen-001"

# --- test body -------------------------------------------------------------

try {

    # --- normal promotion + one-way proof ---------------------------------

    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" $null $null
        $before = Snapshot-Tree $dir ".sapkit"
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')

        $runDir = Join-Path $dir ".harness\runs\$run"
        $made = (Test-Path -LiteralPath (Join-Path $runDir "manifest.json")) -and
                (Test-Path -LiteralPath (Join-Path $runDir "contract.md"))
        Check "NORMAL promotion -> 0 (+run dir created)" 0 $r $made

        $after = Snapshot-Tree $dir ".sapkit"
        Check "ONE-WAY: .sapkit byte-identical after promotion" 0 $r (Compare-Snapshot $before $after)

        # the manifest must freeze the contract fields
        $m = Get-Content -LiteralPath (Join-Path $runDir "manifest.json") -Raw | ConvertFrom-Json
        $frozen = ($m.run_id -eq $run) -and ($m.apply_path -eq 'mcp') -and
                  ($m.system.tier -eq 'dev') -and ($m.approved -eq $true) -and
                  ($m.spec_sha256 -match '^[0-9a-f]{64}$') -and
                  ($m.safety_state.unattended -eq 'sealed')
        Check "FREEZE: manifest pins spec/system/apply/safety" 0 $r $frozen
    }.Invoke()

    # --- duplicate run id -> 69 -------------------------------------------

    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" $null $null
        $r1 = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        $r2 = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        Check "DUPLICATE run id -> 69" 69 $r2 ($r1.Exit -eq 0)
    }.Invoke()

    # --- spec hash mismatch -> 66 -----------------------------------------

    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" ("a" * 64) $null
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        Check "HASH mismatch -> 66" 66 $r ($r.Out -match "hash mismatch")
    }.Invoke()

    # spec edited after approval -> hash drifts
    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" $null $null
        Add-Content -LiteralPath (Join-Path $dir ".sapkit\program\$script:Obj\spec.md") -Value "`n## sneaked change"
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        Check "SPEC edited after approval -> 66" 66 $r ($r.Out -match "changed after approval")
    }.Invoke()

    # --- malformed -> 66 --------------------------------------------------

    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" $null "{ this is not valid json "
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        Check "MALFORMED approval.json -> 66" 66 $r
    }.Invoke()

    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" $null '{ "sid": "S4H", "client": "100", "tier": "dev" }'
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        Check "MISSING spec_sha256 field -> 66" 66 $r ($r.Out -match "spec_sha256")
    }.Invoke()

    # --- missing source parts -> 66 ---------------------------------------

    {
        $dir = New-Fixture
        New-Item -ItemType Directory -Path (Join-Path $dir ".sapkit\program\$script:Obj") -Force | Out-Null
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', ".sapkit/program/$script:Obj", '-ApplyPath', 'mcp')
        Check "NO spec.md -> 66" 66 $r ($r.Out -match "spec.md")
    }.Invoke()

    {
        $dir = New-Fixture
        Write-Fixt $dir ".sapkit/program/$script:Obj/spec.md" "# spec"
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', ".sapkit/program/$script:Obj", '-ApplyPath', 'mcp')
        Check "NO approval.json -> 66" 66 $r ($r.Out -match "approval.json")
    }.Invoke()

    {
        $dir = New-Fixture
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', ".sapkit/program/NOPE", '-ApplyPath', 'mcp')
        Check "SOURCE dir missing -> 66" 66 $r
    }.Invoke()

    # --- non-DEV tier -> 70 -----------------------------------------------

    {
        $dir = New-Fixture
        $src = Write-Source $dir "qas" $null $null
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'mcp')
        Check "QAS tier -> 70 (R-003)" 70 $r ($r.Out -match "DEV only")
    }.Invoke()

    # --- bad args -> 64 ---------------------------------------------------

    {
        $dir = New-Fixture; $src = Write-Source $dir "dev" $null $null
        $r = Invoke-Bridge $dir @('-Source', $src, '-ApplyPath', 'mcp')
        Check "no -RunId -> 64" 64 $r
    }.Invoke()

    {
        $dir = New-Fixture; $src = Write-Source $dir "dev" $null $null
        $r = Invoke-Bridge $dir @('-RunId', '../escape', '-Source', $src, '-ApplyPath', 'mcp')
        Check "bad run id format -> 64" 64 $r
    }.Invoke()

    {
        $dir = New-Fixture; $src = Write-Source $dir "dev" $null $null
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'telepathy')
        Check "unknown -ApplyPath -> 64" 64 $r
    }.Invoke()

    {
        $dir = New-Fixture; $src = Write-Source $dir "dev" $null $null
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src)
        Check "missing -ApplyPath -> 64" 64 $r
    }.Invoke()

    # --- -WhatIf writes nothing -------------------------------------------

    {
        $dir = New-Fixture
        $src = Write-Source $dir "dev" $null $null
        $r = Invoke-Bridge $dir @('-RunId', $run, '-Source', $src, '-ApplyPath', 'vsp', '-WhatIf')
        $nothing = -not (Test-Path -LiteralPath (Join-Path $dir ".harness\runs\$run"))
        Check "-WhatIf -> 0 and writes nothing" 0 $r $nothing
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
