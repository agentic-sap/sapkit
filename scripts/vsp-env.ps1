# vsp-env.ps1 - dot-source helper: inject SAP_* env vars for the vsp CLI.
#
# Read-only by DEFAULT (machine-enforced). The default run injects the SAP
# credentials AND sets SAP_READ_ONLY=true, so the vsp write-profile gate
# (adapters/vsp/vsp.lock.json - write_profile_gate) rejects every write-capable
# subcommand (deploy/copy/execute/install/source write|edit/recover) client-side,
# before any network call. Read commands and `vsp test` are unaffected.
#
# -Write opts OUT of read-only: it does NOT set SAP_READ_ONLY (and removes any
# inherited value), and instead propagates SAP_TIER from the profile sap.env
# (its value if present, else 'dev'). The gate only permits writes on the dev
# tier, so -Write is the deploy-step wrapper path (see VERIFY-PATTERNS.md sec 4).
#
# Usage (dot-source so the variables land in YOUR session):
#   . scripts\vsp-env.ps1                       # default profile IDES-DEV, read-only
#   . scripts\vsp-env.ps1 -ProfileName KR-DEV   # read-only
#   . scripts\vsp-env.ps1 -Write                # write mode (deploy-step wrapper only)
#
# Source of values: <sapkit home>\profiles\<ProfileName>\sap.env
#   sapkit home = $env:SAPKIT_HOME_DIR if set (a set-but-missing path is an
#   error, never a silent fall back), else $env:SC4SAP_HOME_DIR (deprecated),
#   else whichever of $HOME\.sapkit / $HOME\.sc4sap actually holds the profile
#   (D-057 R-ENV; the legacy generation keeps working until the user migrates).
# Mapping: the profile stores SAP_USERNAME, but vsp expects SAP_USER
#   (README.md flag table) - this script maps the value across.
# Password: if SAP_PASSWORD is a "keychain:<target>" reference, the secret
#   is resolved from Windows Credential Manager (generic credential) via
#   Advapi32 CredRead. No secret value is ever printed or written by this
#   script; it only lands in the process environment.
#
# This file contains no secrets and is safe to commit.
# PowerShell 5.1 compatible. ASCII only.

param(
    [string]$ProfileName = "IDES-DEV",
    [switch]$Write
)

$profileRel = "profiles\" + $ProfileName + "\sap.env"
if ($env:SAPKIT_HOME_DIR) {
    if (-not (Test-Path -LiteralPath $env:SAPKIT_HOME_DIR)) {
        throw "vsp-env: ENV_INVALID - SAPKIT_HOME_DIR points at a missing path ($env:SAPKIT_HOME_DIR); not falling back to SC4SAP_HOME_DIR"
    }
    $sapkitHome = $env:SAPKIT_HOME_DIR
} elseif ($env:SC4SAP_HOME_DIR) {
    Write-Output "vsp-env: OK_LEGACY_DEPRECATED - SC4SAP_HOME_DIR is deprecated, rename it to SAPKIT_HOME_DIR"
    $sapkitHome = $env:SC4SAP_HOME_DIR
} else {
    # Pick the home that actually holds this profile - new generation first.
    $newHome = Join-Path $HOME ".sapkit"
    $legacyHome = Join-Path $HOME ".sc4sap"
    if (Test-Path -LiteralPath (Join-Path $newHome $profileRel)) {
        $sapkitHome = $newHome
    } elseif (Test-Path -LiteralPath (Join-Path $legacyHome $profileRel)) {
        $sapkitHome = $legacyHome
    } elseif (Test-Path -LiteralPath $newHome) {
        $sapkitHome = $newHome
    } elseif (Test-Path -LiteralPath $legacyHome) {
        $sapkitHome = $legacyHome
    } else {
        $sapkitHome = $newHome
    }
}
$sapEnvPath = Join-Path $sapkitHome $profileRel

if (-not (Test-Path -LiteralPath $sapEnvPath)) {
    throw "vsp-env: profile file not found: $sapEnvPath"
}

# Parse KEY=VALUE lines; skip comments and blanks.
$profileVars = @{}
foreach ($line in Get-Content -LiteralPath $sapEnvPath) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*$') { continue }
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) {
        $profileVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

foreach ($required in @('SAP_URL', 'SAP_CLIENT', 'SAP_USERNAME', 'SAP_PASSWORD')) {
    if (-not $profileVars.ContainsKey($required) -or [string]::IsNullOrEmpty($profileVars[$required])) {
        throw "vsp-env: required key '$required' missing or empty in $sapEnvPath"
    }
}

$env:SAP_URL    = $profileVars['SAP_URL']
$env:SAP_CLIENT = $profileVars['SAP_CLIENT']
$env:SAP_USER   = $profileVars['SAP_USERNAME']   # name mapping: SAP_USERNAME -> SAP_USER

$passwordValue = $profileVars['SAP_PASSWORD']
if ($passwordValue -match '^keychain:(.+)$') {
    $credTarget = $Matches[1]

    if (-not ('VspEnv.CredMan' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace VspEnv {
    public static class CredMan {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct CREDENTIAL {
            public int Flags;
            public int Type;
            public string TargetName;
            public string Comment;
            public long LastWritten;
            public int CredentialBlobSize;
            public IntPtr CredentialBlob;
            public int Persist;
            public int AttributeCount;
            public IntPtr Attributes;
            public string TargetAlias;
            public string UserName;
        }

        [DllImport("Advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

        [DllImport("Advapi32.dll", SetLastError = true)]
        private static extern void CredFree(IntPtr cred);

        // Returns the generic-credential secret (UTF-16 blob) or null if absent.
        public static string ReadPassword(string target) {
            IntPtr ptr;
            if (!CredRead(target, 1, 0, out ptr)) {
                return null;
            }
            try {
                CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
                if (cred.CredentialBlobSize == 0) { return ""; }
                byte[] bytes = new byte[cred.CredentialBlobSize];
                Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
                return System.Text.Encoding.Unicode.GetString(bytes);
            } finally {
                CredFree(ptr);
            }
        }
    }
}
'@
    }

    # Candidate target names. The sap.env reference uses "sc4sap/<profile>/<user>"
    # but the stored generic credential is named "<profile>/<user>.sc4sap"
    # (measured 2026-07-11 via cmdkey /list) - try both forms.
    $credTargetCandidates = @($credTarget)
    if ($credTarget -match '^sc4sap/(.+)$') {
        $credTargetCandidates += ($Matches[1] + '.sc4sap')
    }

    $resolvedPassword = $null
    foreach ($candidate in $credTargetCandidates) {
        $resolvedPassword = [VspEnv.CredMan]::ReadPassword($candidate)
        if ($null -ne $resolvedPassword) { break }
    }
    if ($null -eq $resolvedPassword) {
        throw "vsp-env: Windows credential not found for target(s): $($credTargetCandidates -join ', ') (check with: cmdkey /list)"
    }
    $env:SAP_PASSWORD = $resolvedPassword
    $resolvedPassword = $null
} else {
    # Plaintext password in the profile file; inject as-is, never echo.
    $env:SAP_PASSWORD = $passwordValue
}
$passwordValue = $null

# TLS verification skip: user-approved 2026-07-11 for IDES-DEV
# (self-signed cert on remoteides.com); do NOT reuse for QA/PRD.
# Scoped to the approved profile only - other profiles keep TLS verification.
if ($ProfileName -eq 'IDES-DEV') {
    $env:SAP_INSECURE = "true"
}

# Write-profile gate control (adapters/vsp/vsp.lock.json - write_profile_gate).
# Default = machine-enforced read-only: SAP_READ_ONLY=true makes the vsp gate
# reject every write-capable subcommand before any network call. -Write opts
# out and instead pins SAP_TIER (dev-only writes) for the deploy-step wrapper.
if ($Write) {
    Remove-Item Env:\SAP_READ_ONLY -ErrorAction SilentlyContinue
    if ($profileVars.ContainsKey('SAP_TIER') -and -not [string]::IsNullOrEmpty($profileVars['SAP_TIER'])) {
        $env:SAP_TIER = $profileVars['SAP_TIER']
    } else {
        $env:SAP_TIER = 'dev'
    }
} else {
    $env:SAP_READ_ONLY = "true"
}

Write-Output "vsp-env: profile '$ProfileName' loaded from $sapEnvPath"
Write-Output "vsp-env: set SAP_URL, SAP_CLIENT, SAP_USER (from SAP_USERNAME), SAP_PASSWORD$(if ($ProfileName -eq 'IDES-DEV') { ', SAP_INSECURE' })"
if ($Write) {
    Write-Output "vsp-env: WRITE mode - SAP_READ_ONLY unset, SAP_TIER=$env:SAP_TIER (writes gated to dev tier)"
} else {
    Write-Output "vsp-env: READ-ONLY mode - SAP_READ_ONLY=true (writes blocked client-side)"
}
