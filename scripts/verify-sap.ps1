# verify-sap.ps1 - verify wrapper for live-SAP targets (Phase 0a skeleton).
#
# Marker contract (DESIGN.md section 9 - failure classification):
#   CODE_FAIL - code defect; eligible as a rule-promotion candidate
#   ENV_FAIL  - connectivity/auth/system failure; never promote to rules
#   LOCK_FAIL - transient lock (transport/enqueue); never promote to rules
# vsp exits 1 on every error type, so classification relies on output
# pattern parsing only.
# TODO(Phase 0b): replace keyword heuristics with measured output patterns
#
# PowerShell 5.1 compatible. ASCII only.

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$VspArgs
)

# pinned by adapters/vsp/vsp.lock.json - keep in sync
$VSP = "D:\Claude for SAP\vsp-custom\build\vsp.exe"

if (-not (Test-Path -LiteralPath $VSP)) {
    Write-Output "ENV_FAIL: vsp binary not found at $VSP"
    exit 1
}

if (-not $VspArgs -or $VspArgs.Count -eq 0) {
    Write-Output "CODE_FAIL: no vsp arguments"
    exit 1
}

# Preflight: separate ENV_FAIL early via connectivity check.
$null = & $VSP system info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Output "ENV_FAIL: no SAP connectivity (vsp system info exit $LASTEXITCODE)"
    exit 1
}

# Run the actual verify command; capture stdout+stderr for classification.
$rawOutput = & $VSP @VspArgs 2>&1
$exitCode = $LASTEXITCODE
$text = ($rawOutput | ForEach-Object { $_.ToString() }) -join "`n"
if ($text) { Write-Output $text }

if ($exitCode -eq 0) {
    Write-Output "VERIFY_PASS"
    exit 0
}

# Heuristic classification (case-insensitive). TODO(Phase 0b): see header.
$lower = $text.ToLowerInvariant()
if ($lower -match "lock|enqueue|sperr") {
    Write-Output "LOCK_FAIL: transient lock detected (vsp exit $exitCode)"
} elseif ($lower -match "connection|timeout|unauthorized|401|403|dial tcp|no such host|refused") {
    Write-Output "ENV_FAIL: connectivity/auth failure (vsp exit $exitCode)"
} else {
    Write-Output "CODE_FAIL: vsp exit $exitCode"
}
exit 1
