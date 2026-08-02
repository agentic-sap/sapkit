# promote-track-b-run.ps1 - one-way bridge: Track B (.sapkit draft) -> Guided run
# (.harness/runs/<run-id>/).
#
# Spec: docs/reference/designs/2026-07-16-integration-hardening-roadmap.md S2-D, §4.3.
# Decisions: D-025 (role x P0-P4), D-027 (one-way only; two-way sync rejected).
#
# WHY ONE-WAY: Track B (.sapkit) and Track A (.harness) each carry their own
# state/approval/review. Syncing both directions gives one piece of work two
# completion verdicts and two resume points (D-027 기각 (c)). So:
#   - .sapkit is READ-ONLY here. This script never writes into it.
#   - the ONLY output is one new .harness/runs/<run-id>/ directory.
#   - after promotion the frozen hashes in the run dir are authoritative; the
#     .sapkit files go back to being working material (roadmap §4.2).
#
# NOT auto-invoked. Direct never calls this (roadmap S2-D: "Direct에서는 자동
# 호출하지 않음") - promotion is an explicit human act, because it is the moment
# a draft becomes a contract.
#
# Exit codes (stable - tests depend on them):
#   0   OK              - run directory created (or -WhatIf validated)
#   64  BAD_ARGS        - missing/였malformed run id, unknown apply path
#   66  SOURCE_INVALID  - source missing / malformed / spec hash mismatch
#   69  RUN_EXISTS      - a run with this id already exists (no clobber)
#   70  TIER_DENY       - approval targets a non-DEV tier (R-003)
#
# Usage:
#   & scripts/promote-track-b-run.ps1 -RunId <id> `
#       -Source .sapkit/program/ZR_FI_GL_LIST -ApplyPath mcp
#
# PowerShell 5.1 compatible. ASCII only.

param(
    [string]$RunId,
    [string]$Source,
    [string]$ApplyPath,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

function Deny([int]$code, [string]$marker, [string]$reason) {
    Write-Output "${marker}: $reason"
    exit $code
}

function Get-Sha256([string]$path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $path).Path)
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally { $sha.Dispose() }
}

# --- (1) args -------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($RunId)) { Deny 64 "BAD_ARGS" "missing -RunId" }
$runId = $RunId.Trim()
if ($runId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
    Deny 64 "BAD_ARGS" "run id has an unsupported format (got '$runId')"
}
if ([string]::IsNullOrWhiteSpace($Source)) { Deny 64 "BAD_ARGS" "missing -Source (a .sapkit/program/<OBJECT> directory; a legacy .sc4sap path still works)" }

$validApply = @("mcp", "vsp", "abapgit")
if ([string]::IsNullOrWhiteSpace($ApplyPath)) {
    Deny 64 "BAD_ARGS" "missing -ApplyPath; one of: $($validApply -join ', ') (the apply path is frozen at promotion - roadmap §4.3)"
}
$apply = $ApplyPath.Trim().ToLowerInvariant()
if ($validApply -notcontains $apply) {
    Deny 64 "BAD_ARGS" "unknown -ApplyPath '$ApplyPath'; one of: $($validApply -join ', ')"
}

# --- (2) source must exist and be well-formed -> else 66 ------------------

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    Deny 66 "SOURCE_INVALID" "source directory not found: $Source"
}
$specPath     = Join-Path $Source "spec.md"
$approvalPath = Join-Path $Source "approval.json"

if (-not (Test-Path -LiteralPath $specPath -PathType Leaf)) {
    Deny 66 "SOURCE_INVALID" "no spec.md in $Source - only an approved spec can be promoted"
}
if (-not (Test-Path -LiteralPath $approvalPath -PathType Leaf)) {
    Deny 66 "SOURCE_INVALID" "no approval.json in $Source - promotion requires the human approval record"
}
try {
    $approval = Get-Content -LiteralPath $approvalPath -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
} catch {
    Deny 66 "SOURCE_INVALID" "approval.json unreadable/unparseable: $($_.Exception.Message)"
}
if ($null -eq $approval) { Deny 66 "SOURCE_INVALID" "approval.json is empty" }

foreach ($f in @("spec_sha256", "sid", "client", "tier")) {
    if ($null -eq $approval.$f -or [string]::IsNullOrWhiteSpace("$($approval.$f)")) {
        Deny 66 "SOURCE_INVALID" "approval.json is missing required field '$f'"
    }
}

$pinned = "$($approval.spec_sha256)".Trim().ToLowerInvariant()
if ($pinned -notmatch '^[0-9a-f]{64}$') {
    Deny 66 "SOURCE_INVALID" "approval.json spec_sha256 is not 64-hex (got '$pinned')"
}

# The whole point of the bridge: the spec we freeze must be the spec a human
# approved. A byte drift here means the draft moved after approval.
$actual = Get-Sha256 $specPath
if ($actual -cne $pinned) {
    Deny 66 "SOURCE_INVALID" "spec hash mismatch; approval.json pinned $pinned but spec.md hashes to $actual - the spec changed after approval, re-approve before promoting"
}

# --- (3) DEV tier only (R-003) -> else 70 --------------------------------

$tier = "$($approval.tier)".Trim().ToLowerInvariant()
if ($tier -cne "dev") {
    Deny 70 "TIER_DENY" "approval targets tier '$tier'; Track A promotes DEV only (R-003)"
}

# --- (4) no clobber -> else 69 -------------------------------------------

$runDir = ".harness/runs/$runId"
if (Test-Path -LiteralPath $runDir) {
    Deny 69 "RUN_EXISTS" "$runDir already exists; refusing to clobber an existing run (pick a new run id)"
}

# --- (5) freeze ----------------------------------------------------------

$objects = @()
if ($null -ne $approval.objects) { $objects = @($approval.objects | ForEach-Object { "$_" }) }
$package = "$($approval.package)".Trim()
$transportIntent = "$($approval.transport)".Trim()
if ([string]::IsNullOrWhiteSpace($transportIntent)) { $transportIntent = "none" }

if ($WhatIf) {
    Write-Output "PROMOTE_OK: run=$runId, source=$Source, spec=$actual, sid=$($approval.sid)/$($approval.client) tier=$tier, apply=$apply. -WhatIf: nothing written."
    exit 0
}

New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$manifest = [ordered]@{
    run_id           = $runId
    approved         = $true
    promoted_from    = ($Source -replace '\\', '/')
    spec_sha256      = $actual
    system           = [ordered]@{ sid = "$($approval.sid)"; client = "$($approval.client)"; tier = $tier }
    package          = $package
    objects          = $objects
    transport_intent = $transportIntent
    apply_path       = $apply
    safety_state     = [ordered]@{
        execution                 = "attended-only"
        unattended                = "sealed"
        historical_rv4_classifier = "open"
        sap_mutation_boundary     = "unverified"
    }
}
$manifestJson = ($manifest | ConvertTo-Json -Depth 6)
Set-Content -LiteralPath (Join-Path $runDir "manifest.json") -Value $manifestJson -Encoding UTF8

$contract = @"
# Run contract - $runId

> Frozen by ``scripts/promote-track-b-run.ps1`` from a Track B draft.
> **This file and ``manifest.json`` are the authority for this run.** The source
> ``.sapkit`` files are working material from here on - do not sync back
> (one-way only, D-027).

| Field | Value |
|---|---|
| run_id | ``$runId`` |
| promoted_from | ``$($Source -replace '\\', '/')`` |
| spec_sha256 | ``$actual`` |
| system | ``$($approval.sid)`` / client ``$($approval.client)`` / tier ``$tier`` |
| package | ``$package`` |
| objects | $(if ($objects.Count) { ($objects | ForEach-Object { "``$_``" }) -join ', ' } else { '(none listed)' }) |
| transport_intent | ``$transportIntent`` |
| apply_path | ``$apply`` |

## Completion contract

- SAP code from this run is **PROVISIONAL_WRITE** once applied; it is **not** done.
- **COMPLETE** requires BOTH an exact-subject fresh-context review ``R-PASS``
  (bound to ``spec_sha256`` above) AND a vsp-backed ``V-PASS`` (source read-back,
  syntax, activate, unit, ATC).
- An apply tool's success response never becomes completion evidence.

## Safety state (exact - do not edit)

``````
attended-only
unattended=sealed
historical_rv4_classifier=open
sap_mutation_boundary=unverified    (scope: reviewer + all attended children)
``````

## Staleness

If ``spec.md`` bytes change after this promotion, this run's review and
verification are **stale**. Re-promote under a new run id, or create an explicit
revision of this run. Do not edit the frozen hashes.
"@
Set-Content -LiteralPath (Join-Path $runDir "contract.md") -Value $contract -Encoding UTF8

Write-Output "PROMOTE_OK: run=$runId created at $runDir (spec=$actual, apply=$apply, tier=$tier). Source draft untouched."
exit 0
