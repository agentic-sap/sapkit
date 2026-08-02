// sapkit multi-profile resolver — shared helper for HUD, hooks, scripts.
//
// Resolves the active SAP profile's env file, config JSON, and work-artifact
// base directory. Legacy fallback (pre-0.6.0 single-profile) is preserved so
// users who haven't migrated yet still see the same behaviour as before.
//
// Resolution order for config.json and sap.env:
//   1. <workspace>/.sapkit/active-profile.txt → <alias>
//      → $SAPKIT_HOME_DIR/profiles/<alias>/{sap.env, config.json}
//      (fallback: ~/.sapkit/profiles/<alias>/...)
//   2. Legacy: <workspace>/.sapkit/{sap.env, config.json}
//
// Runtime path rename (D-057, `.sc4sap` -> `.sapkit`): `.sapkit` is a candidate
// everywhere `.sc4sap` was one, and nothing else changes (R-PRESERVE). The walk
// depth stays 64 and the state definition below — active-profile.txt ‖ sap.env ‖
// config.json — is untouched, because `block-forbidden-tables` reads the chosen
// config.json's `blocklistProfile` as its row-data policy source. Within one
// ancestor the state criterion is applied to EACH generation before any
// tie-break (R-TIE), so a `.sc4sap`-only ancestor still wins outright.
//
// Callers pass the workspace directory (usually `process.cwd()`). Returning
// `null` means neither multi-profile nor legacy state exists.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const NEW_DIR = '.sapkit';
const LEGACY_DIR = '.sc4sap';

const warned = new Set();
// Library-level diagnostics go to stderr only (hooks answer on stdout as JSON,
// the MCP server speaks JSON-RPC there), once per process — D-057 §4-5.
function warnOnce(code, message) {
  if (warned.has(code)) return;
  warned.add(code);
  try {
    process.stderr.write(`[sapkit/profile-resolve] ${code}: ${message}\n`);
  } catch {
    /* never let a diagnostic break resolution */
  }
}

// R-ENV. `SAPKIT_HOME_DIR` set but missing is ENV_INVALID: the path is returned
// as-is so every lookup under it misses and each caller's own fail-closed branch
// engages — it is never a reason to fall back to the legacy variable silently.
// With no env var the home is chosen by where `alias` actually lives, so a
// half-migrated machine still finds its profiles.
export function sapkitHome(alias = null) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!existsSync(explicit)) {
      warnOnce(
        'ENV_INVALID',
        `SAPKIT_HOME_DIR points at a path that does not exist (${explicit}) — not falling back to SC4SAP_HOME_DIR.`,
      );
    }
    return explicit;
  }
  const legacyEnv = process.env.SC4SAP_HOME_DIR;
  if (legacyEnv) {
    warnOnce('OK_LEGACY_DEPRECATED', 'SC4SAP_HOME_DIR is deprecated — rename it to SAPKIT_HOME_DIR.');
    return legacyEnv;
  }
  const newHome = join(homedir(), NEW_DIR);
  const legacyHome = join(homedir(), LEGACY_DIR);
  if (alias) {
    const inNew = existsSync(join(newHome, 'profiles', alias));
    const inLegacy = existsSync(join(legacyHome, 'profiles', alias));
    if (inNew && inLegacy) {
      warnOnce('COEXIST_OK', `profile "${alias}" exists under both ${newHome} and ${legacyHome} — using ${newHome}.`);
      return newHome;
    }
    if (inNew) return newHome;
    if (inLegacy) return legacyHome;
  }
  if (existsSync(newHome)) return newHome;
  if (existsSync(legacyHome)) return legacyHome;
  return newHome;
}

// Deprecated alias kept for out-of-repo callers (HUD/scripts) that imported the
// old name. Same behaviour; new code should call `sapkitHome`.
export function sc4sapHome() {
  return sapkitHome();
}

export function profilesDir(alias = null) {
  return join(sapkitHome(alias), 'profiles');
}

// Walk up from `startDir` looking for the effective runtime directory.
// Users often launch Claude Code from a subdirectory of their workspace
// (e.g., the plugin dev repo inside a larger project), so resolving profile
// state only at the exact cwd diverges from the MCP server's walk-up
// behaviour and leaves the HUD showing "SAP not configured" while the MCP
// connection is alive.
//
// Nested-runtime-dir handling: a subdirectory may contain its own runtime dir
// holding only artifact folders (e.g. `comparisons/`, `test-reports/`) while
// the real profile state (active-profile.txt, sap.env, config.json) lives
// at a higher ancestor. Prefer the first runtime dir on the chain that
// actually contains profile state; fall back to the first one seen
// when no ancestor has state. Returns null only when no runtime dir exists
// anywhere on the chain. Depth-limited as a paranoia guard.
function hasProfileState(runtimeDir) {
  return (
    existsSync(join(runtimeDir, 'active-profile.txt')) ||
    existsSync(join(runtimeDir, 'sap.env')) ||
    existsSync(join(runtimeDir, 'config.json'))
  );
}

// Connection completeness — the R-TIE tie-break input. An empty
// active-profile.txt does NOT count (D-057 §11-5).
function hasConnectionState(runtimeDir) {
  try {
    const pointer = join(runtimeDir, 'active-profile.txt');
    if (existsSync(pointer) && readFileSync(pointer, 'utf8').trim().length > 0) return true;
  } catch {
    /* unreadable pointer is not completeness */
  }
  return existsSync(join(runtimeDir, 'sap.env'));
}

// R-TIE inside ONE ancestor: apply `accepts` (this resolver's own criterion) to
// each generation first; only when both pass does the tie-break run.
function pickGeneration(dir, accepts) {
  const newer = join(dir, NEW_DIR);
  const older = join(dir, LEGACY_DIR);
  const newOk = accepts(newer);
  const oldOk = accepts(older);
  if (newOk && oldOk) {
    const newComplete = hasConnectionState(newer);
    const oldComplete = hasConnectionState(older);
    if (oldComplete && !newComplete) return older;
    return newer; // tie → .sapkit
  }
  if (newOk) return newer;
  if (oldOk) return older;
  return null;
}

function findRuntimeDir(startDir) {
  let cur = startDir;
  let firstHit = null;
  for (let i = 0; i < 64; i++) {
    const stateHit = pickGeneration(cur, (d) => existsSync(d) && hasProfileState(d));
    if (stateHit) return stateHit;
    if (!firstHit) firstHit = pickGeneration(cur, existsSync);
    const parent = dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return firstHit;
}

// The runtime directory itself (`<root>/.sapkit` or `<root>/.sc4sap`). When no
// generation exists anywhere on the chain it names the R-NEW creation site —
// `<startDir>/.sapkit`, the same spot the old code implied with `.sc4sap`.
export function resolveRuntimeDir(startDir) {
  return findRuntimeDir(startDir) ?? join(startDir, NEW_DIR);
}

// The directory that *contains* the effective runtime dir — i.e., the
// workspace root as the plugin sees it. Falls back to `startDir` when no
// runtime dir exists anywhere on the ancestry chain.
export function resolveWorkspaceRoot(startDir) {
  const hit = findRuntimeDir(startDir);
  return hit ? dirname(hit) : startDir;
}

// Returns the active alias (reading the nearest ancestor's
// active-profile.txt), or null when the pointer is missing /
// empty / unreadable.
export function readActiveAlias(startDir) {
  const pointer = join(resolveRuntimeDir(startDir), 'active-profile.txt');
  if (!existsSync(pointer)) return null;
  try {
    const raw = readFileSync(pointer, 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

// Returns { path, source: 'profile' | 'legacy' } or null.
export function resolveSapEnvPath(startDir) {
  const alias = readActiveAlias(startDir);
  if (alias) {
    const p = join(profilesDir(alias), alias, 'sap.env');
    if (existsSync(p)) return { path: p, source: 'profile', alias };
  }
  const legacy = join(resolveRuntimeDir(startDir), 'sap.env');
  if (existsSync(legacy)) return { path: legacy, source: 'legacy', alias: null };
  return null;
}

// Returns { path, source: 'profile' | 'legacy' } or null.
export function resolveConfigJsonPath(startDir) {
  const alias = readActiveAlias(startDir);
  if (alias) {
    const p = join(profilesDir(alias), alias, 'config.json');
    if (existsSync(p)) return { path: p, source: 'profile', alias };
  }
  const legacy = join(resolveRuntimeDir(startDir), 'config.json');
  if (existsSync(legacy)) return { path: legacy, source: 'legacy', alias: null };
  return null;
}

// Returns the base directory for per-profile artifacts.
// - Multi-profile: <runtime-dir>/work/<alias>/
// - Legacy:        <runtime-dir>/
// Always returns a string (never null) — callers may need to create it.
// R-NEW: with nothing on the chain the base is `<startDir>/.sapkit`.
export function resolveArtifactBase(startDir) {
  const runtimeDir = resolveRuntimeDir(startDir);
  const alias = readActiveAlias(startDir);
  if (alias) return join(runtimeDir, 'work', alias);
  return runtimeDir;
}

// Parse a minimal KEY=VALUE dotenv file into a plain object.
// Returns null if file is missing or unreadable. Values are unquoted.
export function readDotenv(path) {
  if (!existsSync(path)) return null;
  try {
    const out = {};
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

// Convenience: read and parse the active profile's sap.env. Returns null when
// the env cannot be resolved.
export function readActiveSapEnv(workspaceDir) {
  const hit = resolveSapEnvPath(workspaceDir);
  if (!hit) return null;
  const env = readDotenv(hit.path);
  return env ? { env, ...hit } : null;
}

// Convenience: read and parse the active profile's config.json. Returns null
// when the config cannot be resolved.
export function readActiveConfigJson(workspaceDir) {
  const hit = resolveConfigJsonPath(workspaceDir);
  if (!hit) return null;
  try {
    const parsed = JSON.parse(readFileSync(hit.path, 'utf8'));
    return { config: parsed, ...hit };
  } catch {
    return null;
  }
}

// Normalize SAP_TIER — enum DEV | QA | PRD. Non-canonical values default to DEV.
export function normalizeTier(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'DEV' || v === 'QA' || v === 'PRD') return v;
  return 'DEV';
}
