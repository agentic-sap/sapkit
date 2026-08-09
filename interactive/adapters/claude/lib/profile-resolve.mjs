// sapkit multi-profile resolver — shared helper for HUD, hooks, scripts.
//
// Resolves the active SAP profile's env file, config JSON, and work-artifact
// base directory. The single-profile mode (pre-0.6.0 layout, no alias pointer)
// is still read so a project that never adopted profiles keeps working.
//
// Resolution order for config.json and sap.env:
//   1. <workspace>/.sapkit/active-profile.txt → <alias>
//      → $SAPKIT_HOME_DIR/profiles/<alias>/{sap.env, config.json}
//      (fallback: ~/.sapkit/profiles/<alias>/...)
//   2. Single-profile: <workspace>/.sapkit/{sap.env, config.json}
//
// `.sapkit` is the only runtime directory. The pre-0.6 directory and its home
// variable were a migration-period fallback and were removed once the migration
// completed (D-057); a leftover one of that name is invisible. The walk
// depth stays 64 and the state definition below — active-profile.txt ‖ sap.env ‖
// config.json — is untouched, because `block-forbidden-tables` reads the chosen
// config.json's `blocklistProfile` as its row-data policy source.
//
// Callers pass the workspace directory (usually `process.cwd()`). Returning
// `null` means no profile state exists.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const NEW_DIR = '.sapkit';

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

// R-ENV. `SAPKIT_HOME_DIR` set but missing is ENV_INVALID and it is TERMINAL for
// the connection source: the operator pinned a home, the pin is broken, and
// nothing may stand in for it — not `~/.sapkit`, and not the project-local
// `<runtime dir>/sap.env` either. `resolveSapEnvPath` enforces that below.
//
// Scope is deliberately narrow. ENV_INVALID must NOT reach into the row-data
// policy source: `block-forbidden-tables` reads `blocklistProfile` out of the
// config.json this module resolves, and that config.json is project-local —
// it has nothing to do with the home. Cutting it off would silently swap the
// project's own `strict` for the hook's DEFAULT_PROFILE, i.e. let a broken env
// var move the row-data posture. So `resolveConfigJsonPath`, the runtime-dir
// walk, and the alias pointer all keep working unchanged.
export function envHomeInvalid() {
  const explicit = process.env.SAPKIT_HOME_DIR;
  return Boolean(explicit) && !existsSync(explicit);
}

// The path is returned as-is so every lookup under it misses and each caller's
// own fail-closed branch engages — a broken pin is never silently stepped over.
// The `alias` parameter is accepted (and ignored) so callers keep reading as
// "the home that should hold this alias"; there is only one home to return.
export function sapkitHome(_alias = null) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!existsSync(explicit)) {
      warnOnce(
        'ENV_INVALID',
        `SAPKIT_HOME_DIR points at a path that does not exist (${explicit}) — no other home stands in for it.`,
      );
    }
    return explicit;
  }
  return join(homedir(), NEW_DIR);
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

function findRuntimeDir(startDir) {
  let cur = startDir;
  let firstHit = null;
  for (let i = 0; i < 64; i++) {
    const candidate = join(cur, NEW_DIR);
    if (existsSync(candidate) && hasProfileState(candidate)) return candidate;
    if (!firstHit && existsSync(candidate)) firstHit = candidate;
    const parent = dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return firstHit;
}

// The runtime directory itself (`<root>/.sapkit`). When none exists anywhere on
// the chain it names the R-NEW creation site — `<startDir>/.sapkit`.
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
  // ENV_INVALID is terminal HERE and only here: no connection source at all.
  // Without this the alias lookup misses under the broken home and the function
  // falls through to `<runtime dir>/sap.env`, handing the caller a connection
  // the operator never selected (3rd-review MAJOR #2).
  if (envHomeInvalid()) {
    warnOnce(
      'ENV_INVALID',
      `SAPKIT_HOME_DIR points at a path that does not exist (${process.env.SAPKIT_HOME_DIR}) — refusing to resolve any connection source, including a project-local sap.env.`,
    );
    return null;
  }
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
