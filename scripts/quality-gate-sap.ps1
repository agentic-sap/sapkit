# quality-gate-sap.ps1 - Stop-hook quality gate for ABAP/CDS sources.
# Collects changed and untracked .abap/.asddls files from git status and
# runs vsp lint on each. vsp lint exits non-zero only on Error-severity
# findings; Warnings pass (exit 0).
# PowerShell 5.1 compatible. ASCII only.

# pinned by adapters/vsp/vsp.lock.json - keep in sync
$VSP = "D:\Claude for SAP\vsp-custom\build\vsp.exe"

if (-not (Test-Path -LiteralPath $VSP)) {
    Write-Output "GATE_FAIL: vsp binary not found at $VSP (fail-closed; see adapters/vsp/vsp.lock.json)"
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

# -uall: expand untracked directories into individual files
# (plain --porcelain collapses a new dir to "dir/" and hides .abap files inside)
$statusLines = git status --porcelain -uall
if ($LASTEXITCODE -ne 0) {
    Write-Output "GATE_FAIL: git status failed (exit $LASTEXITCODE) - fail-closed"
    exit 1
}

$targets = @()
foreach ($line in @($statusLines)) {
    if (-not $line) { continue }
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3)
    # rename lines look like: R  old/path -> new/path (lint the new path)
    if ($path -match " -> ") {
        $path = ($path -split " -> ", 2)[1]
    }
    $path = $path.Trim().Trim('"')
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($ext -ne ".abap" -and $ext -ne ".asddls") { continue }
    # deleted files no longer exist on disk - nothing to lint
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $targets += $path
}

if ($targets.Count -eq 0) {
    Write-Output "GATE_PASS: no changed ABAP/CDS sources"
    exit 0
}

$failed = @()
foreach ($f in $targets) {
    & $VSP lint --file $f
    if ($LASTEXITCODE -ne 0) { $failed += $f }
}

if ($failed.Count -gt 0) {
    Write-Output ("GATE_FAIL: lint errors in: " + ($failed -join ", "))
    exit 1
}

Write-Output ("GATE_PASS: " + $targets.Count + " file(s) linted clean")
exit 0
