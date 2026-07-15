# check-review-verdict.ps1 - unattended review-gate verdict checker (Track A Phase 3).
#
# Spec: docs/reference/designs/2026-07-13-unattended-review-gate.md (Key entities).
# Decision: docs/reference/DECISIONS.md D-021.
#
# Invoked as the review step's OWN verify command, from the repo root:
#     & scripts/check-review-verdict.ps1 -Phase <p> -Verdict phases/<p>/review-verdict.json
# The engine runs verify with cwd = repo root (execute.py:2399), so both git and
# the relative -Verdict path resolve against the repo root. This script does NOT
# Set-Location: it operates on the current working directory, which keeps it
# testable against a throwaway fixture repo (see test-check-review-verdict.ps1).
#
# Judgment order (spec):
#   (1) verdict == "PASS"   (defense: a PASS that still carries a MAJOR finding
#                            is internally inconsistent -> reject)
#   (2) reviewed_head (40-hex) == current `git rev-parse HEAD`
#   (3) equational dirty check: the dirty set, minus engine bookkeeping, must
#       equal EXACTLY { <Verdict> }. Empty fails (stale/committed PASS carries no
#       new dirty); any superset fails (reviewer sneaking other changes).
#
# Bookkeeping exclusion (spec, fixed list - changes only via spec revision):
#   phases/<p>/index.json, phases/<p>/step*-output.json,
#   phases/<p>/run-summary.json, phases/<p>/run-history.jsonl, .harness/**
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
    [string]$Phase,
    [string]$Verdict
)

function Fail([string]$reason) {
    Write-Output "REVIEW_GATE_FAIL: $reason"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($Phase))   { Fail "missing -Phase argument" }
if ([string]::IsNullOrWhiteSpace($Verdict)) { Fail "missing -Verdict argument" }

# Normalize the passed verdict path to git's form (forward slashes, unquoted).
$verdictNorm = ($Verdict -replace '\\', '/').Trim().Trim('"')

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

# --- (1) verdict == PASS (+ MAJOR-consistency defense) ---
$verdictValue = $obj.verdict
if ($null -eq $verdictValue) { Fail "verdict field missing" }
if ($verdictValue -cne 'PASS') { Fail "verdict is not PASS (got '$verdictValue')" }

# Spec Key entities: 'MAJOR >= 1 -> FAIL'. A PASS verdict that still lists a
# MAJOR finding contradicts its own contract - reject it.
if ($null -ne $obj.findings) {
    foreach ($f in @($obj.findings)) {
        if ($null -ne $f -and "$($f.severity)".ToUpperInvariant() -eq 'MAJOR') {
            Fail "verdict is PASS but carries a MAJOR finding (inconsistent verdict)"
        }
    }
}

# --- (2) reviewed_head == current HEAD ---
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

# --- (3) equational dirty check ---
# -uall expands untracked new directories into individual files; core.quotepath
# off keeps non-ASCII paths raw (no octal escaping) for a clean compare.
$statusLines = & git -c core.quotepath=false status --porcelain -uall 2>$null
if ($LASTEXITCODE -ne 0) {
    Fail "git status failed (fail-closed)"
}

$bookPrefix = "phases/$Phase/"
function Test-Bookkeeping([string]$p, [string]$prefix) {
    if ($p.StartsWith(".harness/")) { return $true }
    if (-not $p.StartsWith($prefix)) { return $false }
    $rest = $p.Substring($prefix.Length)
    if ($rest -eq "index.json")        { return $true }
    if ($rest -eq "run-summary.json")  { return $true }
    if ($rest -eq "run-history.jsonl") { return $true }
    if ($rest -match '^step.*-output\.json$') { return $true }
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
    if (Test-Bookkeeping $path $bookPrefix) { continue }
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

Write-Output "REVIEW_GATE_PASS: verdict=PASS, reviewed_head==HEAD ($currentHead), dirty == { $expected }"
exit 0
