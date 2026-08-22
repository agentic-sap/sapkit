// Where a sapkit run finds its profile state — shared by the HUD, the hooks and
// the scripts, so that all of them answer the same question the same way.
//
// Two layouts are supported, and the second is only a fallback:
//
//   multi-profile   `<workspace>/.sapkit/active-profile.txt` names an alias, and
//                   the files themselves live under the sapkit home at
//                   `profiles/<alias>/{sap.env,config.json}`.
//   single-profile  no alias pointer; `sap.env` and `config.json` sit directly
//                   in `<workspace>/.sapkit/`. This is the pre-0.6.0 shape, kept
//                   because a project that never adopted profiles still works.
//
// `.sapkit` is the only runtime directory there is. The earlier generation's
// directory name and its home variable existed as a migration-period fallback
// and were removed once the migration finished (D-057); a leftover directory of
// that name is simply invisible.
//
// Callers pass the directory to start from — usually `process.cwd()`. A `null`
// return means the state being asked for does not exist anywhere.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Kept under this name on purpose: `test-check-runtime-path-rename.mjs` injects
// a retired-generation fallback directly after this exact line to prove the
// rename gate still refuses one. Renaming the constant turns that injection into
// a no-op and the negative test quietly stops testing anything.
const NEW_DIR = '.sapkit';

// State files whose presence proves a `.sapkit` directory is a profile root
// rather than a bag of artifacts. `block-forbidden-tables` reads its row-data
// policy out of the config.json this module picks, so the definition below is
// load-bearing for that policy and is not to be narrowed casually.
const STATE_FILES = ['active-profile.txt', 'sap.env', 'config.json'];

// How far up the ancestry chain the walk will go. A guard against a pathological
// path, not a real limit — no workspace is 64 levels deep.
const MAX_WALK_DEPTH = 64;

// ── diagnostics ─────────────────────────────────────────────────────────────
// Everything printed from a library goes to stderr, and goes there once per
// process (D-057 §4-5). Hooks answer on stdout in JSON and the MCP server speaks
// JSON-RPC there; a stray line on stdout corrupts both.
const alreadyWarned = new Set();

function warnOnce(code, message) {
  if (alreadyWarned.has(code)) return;
  alreadyWarned.add(code);
  try {
    process.stderr.write(`[sapkit/profile-resolve] ${code}: ${message}\n`);
  } catch {
    /* a diagnostic must never be the reason resolution fails */
  }
}

function brokenHomeMessage(explicit, tail) {
  return `SAPKIT_HOME_DIR points at a path that does not exist (${explicit}) — ${tail}`;
}

// ── the sapkit home ─────────────────────────────────────────────────────────

// R-ENV. A home that was pinned by the operator and then went missing is
// ENV_INVALID. Reporting it is deliberately split from acting on it: this
// predicate only states the fact, and `resolveSapEnvPath` is the single place
// that treats it as terminal.
//
// The narrowness matters. ENV_INVALID must not reach the row-data policy source.
// `block-forbidden-tables` reads `blocklistProfile` from a config.json that is
// project-local and has nothing to do with the home; cutting that off would
// silently trade the project's own `strict` for the hook's built-in default and
// let a broken environment variable move the row-data posture. So the config
// lookup, the runtime-dir walk and the alias pointer all carry on regardless.
export function envHomeInvalid() {
  const explicit = process.env.SAPKIT_HOME_DIR;
  return Boolean(explicit) && !existsSync(explicit);
}

// The home directory holding `profiles/`. A pinned-but-missing path is returned
// unchanged rather than replaced: every lookup beneath it then misses, and each
// caller's own fail-closed branch engages. Silently stepping over a broken pin
// would hand someone a connection they did not choose.
//
// `alias` is accepted and ignored — callers read better saying "the home that
// should hold this alias", and there is only ever one home to return.
export function sapkitHome(_alias = null) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (!explicit) return join(homedir(), NEW_DIR);
  if (!existsSync(explicit)) {
    warnOnce('ENV_INVALID', brokenHomeMessage(explicit, 'no other home stands in for it.'));
  }
  return explicit;
}

export function profilesDir(alias = null) {
  return join(sapkitHome(alias), 'profiles');
}

// ── the runtime directory ───────────────────────────────────────────────────

function holdsProfileState(runtimeDir) {
  return STATE_FILES.some((file) => existsSync(join(runtimeDir, file)));
}

// Walk from `startDir` towards the filesystem root looking for `.sapkit`.
//
// Two reasons this is a walk and not a single lookup at `startDir`:
//
//   · people launch Claude Code from a subdirectory of their workspace, and
//     resolving only at the exact cwd would report "SAP not configured" while
//     the MCP server — which does walk up — is connected and working.
//   · a subdirectory can hold its own `.sapkit` containing nothing but artifact
//     folders (`comparisons/`, `test-reports/`) while the real state lives
//     further up.
//
// So the first directory on the chain that actually holds state wins; the first
// one merely seen is the consolation prize; `null` means there was neither.
function findRuntimeDir(startDir) {
  let current = startDir;
  let firstSeen = null;

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const candidate = join(current, NEW_DIR);
    if (existsSync(candidate)) {
      if (holdsProfileState(candidate)) return candidate;
      if (!firstSeen) firstSeen = candidate;
    }
    const parent = dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }

  return firstSeen;
}

// The effective runtime directory. With nothing on the chain this names where
// one would be created — `<startDir>/.sapkit` (R-NEW).
export function resolveRuntimeDir(startDir) {
  return findRuntimeDir(startDir) ?? join(startDir, NEW_DIR);
}

// The directory containing the effective runtime dir — the workspace root as the
// plugin sees it. Falls back to `startDir` when the chain holds none.
export function resolveWorkspaceRoot(startDir) {
  const hit = findRuntimeDir(startDir);
  return hit ? dirname(hit) : startDir;
}

// ── the active profile ──────────────────────────────────────────────────────

// The alias named by the nearest `active-profile.txt`, or `null` when the
// pointer is absent, blank or unreadable.
export function readActiveAlias(startDir) {
  const pointer = join(resolveRuntimeDir(startDir), 'active-profile.txt');
  if (!existsSync(pointer)) return null;
  try {
    const alias = readFileSync(pointer, 'utf8').trim();
    return alias.length > 0 ? alias : null;
  } catch {
    return null;
  }
}

// Shared shape of the two lookups below: try the aliased profile's copy first,
// then the single-profile copy sitting in the runtime directory itself.
function locate(startDir, fileName) {
  const alias = readActiveAlias(startDir);
  if (alias) {
    const inProfile = join(profilesDir(alias), alias, fileName);
    if (existsSync(inProfile)) return { path: inProfile, source: 'profile', alias };
  }
  const inRuntimeDir = join(resolveRuntimeDir(startDir), fileName);
  if (existsSync(inRuntimeDir)) return { path: inRuntimeDir, source: 'legacy', alias: null };
  return null;
}

// The active connection file. Returns `{ path, source, alias }` or `null`.
//
// This is the one place ENV_INVALID is terminal. Without the early return the
// aliased lookup would miss under the broken home and the search would fall
// through to the project-local `sap.env`, handing back a connection the operator
// never selected (3rd-review MAJOR #2). Nothing is an acceptable substitute for
// a pinned home, so the answer is "no connection source at all".
export function resolveSapEnvPath(startDir) {
  if (envHomeInvalid()) {
    warnOnce(
      'ENV_INVALID',
      brokenHomeMessage(
        process.env.SAPKIT_HOME_DIR,
        'refusing to resolve any connection source, including a project-local sap.env.',
      ),
    );
    return null;
  }
  return locate(startDir, 'sap.env');
}

// The active config file. Returns `{ path, source, alias }` or `null`. No
// ENV_INVALID check here, on purpose — see `envHomeInvalid` above.
export function resolveConfigJsonPath(startDir) {
  return locate(startDir, 'config.json');
}

// Where per-profile work artifacts belong: `<runtime-dir>/work/<alias>/` under an
// alias, the runtime dir itself without one. Always a string, never `null`,
// because callers may have to create it. R-NEW applies when the chain is empty.
export function resolveArtifactBase(startDir) {
  const runtimeDir = resolveRuntimeDir(startDir);
  const alias = readActiveAlias(startDir);
  return alias ? join(runtimeDir, 'work', alias) : runtimeDir;
}

// ── file readers ────────────────────────────────────────────────────────────

const QUOTE_CHARS = ['"', "'"];

// Minimal KEY=VALUE reader for `sap.env`. Blank lines and `#` comments are
// skipped, as is any line without a key in front of its first `=`; one matching
// pair of surrounding quotes is stripped from the value. Returns `null` when the
// file is missing or unreadable — deliberately the same answer for both, since
// neither yields settings.
export function readDotenv(path) {
  if (!existsSync(path)) return null;
  try {
    const values = {};
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      const quoted = QUOTE_CHARS.some((q) => value.startsWith(q) && value.endsWith(q));
      values[key] = quoted ? value.slice(1, -1) : value;
    }
    return values;
  } catch {
    return null;
  }
}

// Resolve and parse the active `sap.env` in one step, or `null`.
export function readActiveSapEnv(workspaceDir) {
  const hit = resolveSapEnvPath(workspaceDir);
  if (!hit) return null;
  const env = readDotenv(hit.path);
  return env ? { env, ...hit } : null;
}

// Resolve and parse the active `config.json` in one step, or `null` — invalid
// JSON reads as absent, since a config that cannot be parsed configures nothing.
export function readActiveConfigJson(workspaceDir) {
  const hit = resolveConfigJsonPath(workspaceDir);
  if (!hit) return null;
  try {
    return { config: JSON.parse(readFileSync(hit.path, 'utf8')), ...hit };
  } catch {
    return null;
  }
}

// SAP_TIER as an enum: DEV | QA | PRD. Anything unrecognised becomes DEV. That
// is safe only because callers who must refuse an unresolved tier test the raw
// value themselves rather than asking this function.
export function normalizeTier(value) {
  const tier = String(value || '').trim().toUpperCase();
  return tier === 'DEV' || tier === 'QA' || tier === 'PRD' ? tier : 'DEV';
}
