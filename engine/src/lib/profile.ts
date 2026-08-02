/**
 * Multi-profile SAP connection management.
 *
 * Resolves an "active profile" from the project-local pointer file
 * `<cwd>/.sapkit/active-profile.txt` (legacy: `<cwd>/.sc4sap/…`), loads the
 * corresponding profile env from `~/.sapkit/profiles/<alias>/sap.env`
 * (legacy: `~/.sc4sap/…`), and overwrites `process.env.SAP_*` so the rest of
 * the server (connection factory, handlers) observes the selected system
 * transparently.
 *
 * When no active-profile.txt is present, falls back to the legacy
 * `<cwd>/<runtime-dir>/sap.env`. When a connection is loaded (a profile or
 * legacy sap.env was read) but SAP_TIER is missing or unrecognized, the tier
 * resolves fail-closed to the 'UNKNOWN' sentinel (read-only): write/mutation
 * tools are blocked unless SAP_TIER is explicitly 'dev'. Only the
 * connectionless inspection-only shell keeps the permissive DEV default —
 * harmless, since every tool call fails at connect time anyway.
 *
 * Runtime-directory rename (D-057, design `2026-08-01-runtime-path-rename-sapkit`):
 * `.sapkit` is a *candidate added next to* `.sc4sap`, never a replacement of the
 * lookup semantics. This consumer's adoption criterion — depth 0 (exact cwd),
 * path-direct — is unchanged (R-PRESERVE); a legacy-only input produces exactly
 * the same result as before the rename. See `resolveProjectRuntimeDir` for the
 * R-TIE ordering rule and `resolveHomeDir` for R-ENV.
 *
 * Keychain references in SAP_PASSWORD (`keychain:<service>/<account>`) are
 * resolved via @napi-rs/keyring at load time. See ./secrets.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { resolveSecret } from './secrets';

/**
 * Connection tier. 'UNKNOWN' is the fail-closed sentinel used when a connection
 * is present but SAP_TIER could not be resolved (missing/unrecognized) — the
 * readonly guard treats it as the most restrictive tier (reads only).
 */
export type Tier = 'DEV' | 'QA' | 'PRD' | 'UNKNOWN';

/** Runtime directory name of the current generation. */
export const RUNTIME_DIR_NEW = '.sapkit';
/** Runtime directory name of the legacy generation (still fully supported). */
export const RUNTIME_DIR_LEGACY = '.sc4sap';
/** Journal file the migrator seals inside the destination directory (§5-2). */
const MIGRATION_JOURNAL_FILE = '.migration-journal.json';

/** Which generation of runtime directory a path belongs to. */
export type RuntimeGeneration = 'sapkit' | 'sc4sap';

/**
 * Why a runtime path was chosen (design §4-5).
 *
 * - `OK_NEW` — the current-generation path was adopted.
 * - `OK_LEGACY_DEPRECATED` — a legacy path/env var was adopted; still supported.
 * - `ENV_INVALID` — `SAPKIT_HOME_DIR` points at a path that does not exist
 *   (hard error: no silent fallback to the legacy home).
 * - `PROFILE_NOT_FOUND` — the alias exists in neither home.
 * - `COEXIST_OK` — both generations are present and a migration journal proves
 *   the coexistence is the normal post-migration state (copy-not-move), so it
 *   is not warned about.
 */
export type PathReason =
  | 'OK_NEW'
  | 'OK_LEGACY_DEPRECATED'
  | 'ENV_INVALID'
  | 'PROFILE_NOT_FOUND'
  | 'COEXIST_OK';

/** Error carrying a `PathReason` so callers can distinguish path failures. */
export class ProfilePathError extends Error {
  constructor(
    public readonly reason: PathReason,
    message: string,
  ) {
    super(message);
    this.name = 'ProfilePathError';
  }
}

/** A resolved runtime directory plus why it was chosen. */
export interface RuntimeDirSelection {
  /** Absolute path of the selected directory. */
  dir: string;
  generation: RuntimeGeneration;
  reason: PathReason;
}

export interface LoadedProfile {
  /** Alias as written in active-profile.txt, or `undefined` for legacy single-profile mode. */
  alias: string | undefined;
  /** Absolute path of the env file that was loaded. */
  sourcePath: string;
  /** Parsed env variables (password already resolved if keychain-backed). */
  envVars: Record<string, string>;
  /**
   * Resolved tier. When a connection is loaded but SAP_TIER is missing or
   * unrecognized this is the fail-closed 'UNKNOWN' sentinel (read-only); only
   * the connectionless inspection-only shell keeps DEV.
   */
  tier: Tier;
  /** True if the profile is read-only (tier !== DEV — i.e. QA, PRD, UNKNOWN). */
  readonly: boolean;
  /** True when loaded via the legacy single-profile fallback. */
  legacy: boolean;
  /** Absolute path of the project runtime directory that was selected. */
  runtimeDir: string;
  /** Generation of `runtimeDir`. */
  runtimeDirGeneration: RuntimeGeneration;
  /** Absolute path of the profile home, or `undefined` in legacy sap.env mode. */
  homeDir: string | undefined;
  /** Generation of `homeDir`, or `undefined` in legacy sap.env mode. */
  homeGeneration: RuntimeGeneration | undefined;
  /** Why these paths were chosen (design §4-5). */
  reason: PathReason;
}

/** Module-level cache of the currently-active tier, read by the guard. */
let activeTier: Tier = 'DEV';
let activeAlias: string | undefined;

/** Keys that are wiped on apply before the new profile is written in. */
const SAP_ENV_KEYS_TO_CLEAR = [
  'SAP_URL',
  'SAP_CLIENT',
  'SAP_AUTH_TYPE',
  'SAP_USERNAME',
  'SAP_PASSWORD',
  'SAP_LANGUAGE',
  'SAP_SYSTEM_TYPE',
  'SAP_VERSION',
  'ABAP_RELEASE',
  'SAP_INDUSTRY',
  'SAP_ACTIVE_MODULES',
  'SAP_RFC_BACKEND',
  'SAP_CONNECTION_TYPE',
  'SAP_TIER',
  'SAP_DESCRIPTION',
  'SAP_JWT_TOKEN',
  'SAP_REFRESH_TOKEN',
  'SAP_UAA_URL',
  'SAP_UAA_CLIENT_ID',
  'SAP_UAA_CLIENT_SECRET',
  'SAP_MASTER_SYSTEM',
  'SAP_RESPONSIBLE',
  'MCP_BLOCKLIST_PROFILE',
  'MCP_BLOCKLIST_EXTEND',
  'MCP_ALLOW_TABLE',
];

/**
 * Warnings are emitted at most once per process (design §4-5) and only on
 * **stderr** — stdout carries the MCP protocol.
 */
const warnedKeys = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.error(`[MCP] ${message}`);
}

/** Read a non-empty `active-profile.txt` from a runtime directory. */
function readPointer(runtimeDir: string): string | undefined {
  const pointer = path.join(runtimeDir, 'active-profile.txt');
  if (!fs.existsSync(pointer)) return undefined;
  const raw = fs.readFileSync(pointer, 'utf8').trim();
  return raw.length > 0 ? raw : undefined;
}

/**
 * This consumer's adoption criterion for a candidate runtime directory,
 * unchanged from the pre-rename logic: the directory yields a connection iff it
 * holds a non-empty `active-profile.txt` or a `sap.env`. A pointer that names a
 * missing profile still counts (it must keep throwing, as it did before).
 *
 * For the engine this criterion happens to coincide with R-TIE's "connection
 * completeness" test, so the tie-break below degenerates to "prefer .sapkit".
 * That is a property of this consumer, not a shortcut: the criterion is applied
 * to each candidate *first*, and only then is the tie broken.
 */
function yieldsConnection(runtimeDir: string): boolean {
  return (
    readPointer(runtimeDir) !== undefined ||
    fs.existsSync(path.join(runtimeDir, 'sap.env'))
  );
}

function samePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'win32'
    ? ra.toLowerCase() === rb.toLowerCase()
    : ra === rb;
}

/**
 * True when `newDir` holds a migration journal produced by migrating `legacyDir`
 * (§5-5). Because the migrator copies rather than moves, a *successful*
 * migration leaves both generations valid — that state is `COEXIST_OK` and must
 * not be warned about. A journal that cannot be read is treated as absent.
 */
function hasMigrationJournalFrom(newDir: string, legacyDir: string): boolean {
  const journal = path.join(newDir, MIGRATION_JOURNAL_FILE);
  if (!fs.existsSync(journal)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(journal, 'utf8'));
    const source = parsed?.source ?? parsed?.from;
    return typeof source === 'string' && samePath(source, legacyDir);
  } catch {
    return false;
  }
}

/**
 * R-TIE — pick the project runtime directory under `cwd`.
 *
 * The adoption criterion (`yieldsConnection`) is applied to **each candidate
 * first**; the tie-break runs only when both pass. Reversing that order lets an
 * empty `.sapkit` shell win over a `.sc4sap` that actually carries state, which
 * is how a stricter lower-level policy would get weakened (design §4-3).
 *
 * When neither candidate yields a connection the caller proceeds exactly as
 * before (this consumer has no ancestor walk — depth 0). The directory reported
 * in that case is the legacy one when only a legacy directory exists (so a
 * legacy-only project's reported paths are byte-identical to before the
 * rename), and `.sapkit` otherwise (R-NEW).
 */
export function resolveProjectRuntimeDir(
  cwd: string = process.cwd(),
): RuntimeDirSelection {
  const newDir = path.join(cwd, RUNTIME_DIR_NEW);
  const legacyDir = path.join(cwd, RUNTIME_DIR_LEGACY);

  const newOk = yieldsConnection(newDir);
  const legacyOk = yieldsConnection(legacyDir);

  if (newOk && legacyOk) {
    if (hasMigrationJournalFrom(newDir, legacyDir)) {
      return { dir: newDir, generation: 'sapkit', reason: 'COEXIST_OK' };
    }
    warnOnce(
      `coexist-project:${path.resolve(cwd)}`,
      `Both ${RUNTIME_DIR_NEW}/ and ${RUNTIME_DIR_LEGACY}/ carry connection state in ${cwd} — using ${RUNTIME_DIR_NEW}/. If a migration was interrupted, finish or revert it (migrate-runtime-dir --status).`,
    );
    return { dir: newDir, generation: 'sapkit', reason: 'OK_NEW' };
  }
  if (newOk) {
    return { dir: newDir, generation: 'sapkit', reason: 'OK_NEW' };
  }
  if (legacyOk) {
    warnOnce(
      `legacy-project:${path.resolve(cwd)}`,
      `Using the legacy runtime directory ${RUNTIME_DIR_LEGACY}/ in ${cwd}. It stays supported; migrate-runtime-dir moves it to ${RUNTIME_DIR_NEW}/.`,
    );
    return {
      dir: legacyDir,
      generation: 'sc4sap',
      reason: 'OK_LEGACY_DEPRECATED',
    };
  }

  if (!fs.existsSync(newDir) && fs.existsSync(legacyDir)) {
    return {
      dir: legacyDir,
      generation: 'sc4sap',
      reason: 'OK_LEGACY_DEPRECATED',
    };
  }
  return { dir: newDir, generation: 'sapkit', reason: 'OK_NEW' };
}

/**
 * R-ENV — pick the profile home that holds `alias`.
 *
 * `SAPKIT_HOME_DIR` wins when set, and a value pointing at a non-existent path
 * is a hard `ENV_INVALID` error: falling back to the legacy home would silently
 * connect to a system the operator did not select. `SC4SAP_HOME_DIR` is still
 * honoured (deprecated). With neither set, the home is chosen by **where the
 * alias actually is**, not by which home directory happens to exist — mixed
 * generations are long-lived because reads and writes both follow the selected
 * path (R-E).
 *
 * Both env vars name the runtime directory itself (not its parent), so
 * `~/.sapkit` corresponds to `$SAPKIT_HOME_DIR`.
 */
export function resolveHomeDir(alias: string): RuntimeDirSelection {
  const override = process.env.SAPKIT_HOME_DIR;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new ProfilePathError(
        'ENV_INVALID',
        `SAPKIT_HOME_DIR points to a path that does not exist: ${override}. Fix or unset it — the legacy home is not used as a silent fallback.`,
      );
    }
    return { dir: override, generation: 'sapkit', reason: 'OK_NEW' };
  }

  const legacyOverride = process.env.SC4SAP_HOME_DIR;
  if (legacyOverride) {
    warnOnce(
      'env:SC4SAP_HOME_DIR',
      'SC4SAP_HOME_DIR is deprecated — rename it to SAPKIT_HOME_DIR (same meaning, same value).',
    );
    return {
      dir: legacyOverride,
      generation: 'sc4sap',
      reason: 'OK_LEGACY_DEPRECATED',
    };
  }

  const newHome = path.join(os.homedir(), RUNTIME_DIR_NEW);
  const legacyHome = path.join(os.homedir(), RUNTIME_DIR_LEGACY);
  const inNew = fs.existsSync(path.join(newHome, 'profiles', alias));
  const inLegacy = fs.existsSync(path.join(legacyHome, 'profiles', alias));

  if (inNew && inLegacy) {
    if (hasMigrationJournalFrom(newHome, legacyHome)) {
      return { dir: newHome, generation: 'sapkit', reason: 'COEXIST_OK' };
    }
    warnOnce(
      `coexist-home:${alias}`,
      `Profile "${alias}" exists in both ${newHome} and ${legacyHome} — using ${newHome}. Remove the stale copy to avoid connecting to the wrong system.`,
    );
    return { dir: newHome, generation: 'sapkit', reason: 'OK_NEW' };
  }
  if (inNew) {
    return { dir: newHome, generation: 'sapkit', reason: 'OK_NEW' };
  }
  if (inLegacy) {
    warnOnce(
      'legacy-home',
      `Using the legacy profile home ${legacyHome}. It stays supported; migrate-runtime-dir --scope home moves it to ${newHome}.`,
    );
    return {
      dir: legacyHome,
      generation: 'sc4sap',
      reason: 'OK_LEGACY_DEPRECATED',
    };
  }

  throw new ProfilePathError(
    'PROFILE_NOT_FOUND',
    `Active profile "${alias}" was not found in ${path.join(newHome, 'profiles')} or ${path.join(legacyHome, 'profiles')}.`,
  );
}

/** Merge the project and home reasons into the one reported for the load. */
function combineReason(a: PathReason, b: PathReason): PathReason {
  if (a === 'OK_LEGACY_DEPRECATED' || b === 'OK_LEGACY_DEPRECATED') {
    return 'OK_LEGACY_DEPRECATED';
  }
  if (a === 'COEXIST_OK' || b === 'COEXIST_OK') return 'COEXIST_OK';
  return 'OK_NEW';
}

/**
 * Parse a raw SAP_TIER value. Returns the recognized tier (DEV/QA/PRD), or
 * `undefined` when the value is missing or unrecognized so the caller can apply
 * its fail-closed policy (connection present → 'UNKNOWN'; connectionless shell →
 * 'DEV'). Case- and whitespace-insensitive.
 */
function normalizeTier(value: string | undefined): Tier | undefined {
  const v = (value || '').trim().toUpperCase();
  if (v === 'DEV' || v === 'QA' || v === 'PRD') return v;
  return undefined;
}

/**
 * Load the active profile (or legacy sap.env) without mutating process.env.
 * Throws if an alias is pointed to but the profile folder does not exist.
 */
export function loadActiveProfile(cwd: string = process.cwd()): LoadedProfile {
  // One selection per load: the pointer and the sap.env fallback must never be
  // read from different generations.
  const project = resolveProjectRuntimeDir(cwd);
  const alias = readPointer(project.dir);

  let sourcePath: string;
  let legacy: boolean;
  let homeDir: string | undefined;
  let homeGeneration: RuntimeGeneration | undefined;
  let reason: PathReason = project.reason;

  if (alias) {
    const home = resolveHomeDir(alias);
    homeDir = home.dir;
    homeGeneration = home.generation;
    reason = combineReason(project.reason, home.reason);
    sourcePath = path.join(home.dir, 'profiles', alias, 'sap.env');
    legacy = false;
    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `Active profile "${alias}" points to a missing env file: ${sourcePath}`,
      );
    }
  } else {
    sourcePath = path.join(project.dir, 'sap.env');
    legacy = true;
    if (!fs.existsSync(sourcePath)) {
      // No profile and no legacy env — return an empty shell so the server
      // can still boot in inspection-only mode.
      return {
        alias: undefined,
        sourcePath,
        envVars: {},
        tier: 'DEV',
        readonly: false,
        legacy: true,
        runtimeDir: project.dir,
        runtimeDirGeneration: project.generation,
        homeDir: undefined,
        homeGeneration: undefined,
        reason: project.reason,
      };
    }
  }

  const raw = fs.readFileSync(sourcePath, 'utf8');
  const parsed = dotenv.parse(raw);
  const resolved: Record<string, string> = { ...parsed };

  // Resolve keychain:<service>/<account> references for SAP_PASSWORD.
  const pwd = resolved.SAP_PASSWORD;
  if (pwd) {
    resolved.SAP_PASSWORD = resolveSecret(pwd);
  }

  // Fail-closed: a loaded connection whose SAP_TIER is missing or unrecognized
  // is treated as read-only ('UNKNOWN'), not DEV. Only an explicit dev/qa/prd
  // selects the corresponding tier; only 'dev' opens write/mutation tools.
  const tier: Tier = normalizeTier(resolved.SAP_TIER) ?? 'UNKNOWN';

  return {
    alias,
    sourcePath,
    envVars: resolved,
    tier,
    readonly: tier !== 'DEV',
    legacy,
    runtimeDir: project.dir,
    runtimeDirGeneration: project.generation,
    homeDir,
    homeGeneration,
    reason,
  };
}

/**
 * Overwrite process.env.SAP_* with the loaded profile's values and cache the
 * tier for the readonly guard. Callers must invoke this before any consumer
 * reads process.env (i.e. before connection factories, config managers).
 */
export function applyProfile(loaded: LoadedProfile): void {
  for (const key of SAP_ENV_KEYS_TO_CLEAR) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(loaded.envVars)) {
    process.env[k] = v;
  }
  activeTier = loaded.tier;
  activeAlias = loaded.alias;
}

/** Returns the currently-active tier (defaults to 'DEV' before any load). */
export function getActiveTier(): Tier {
  return activeTier;
}

/** Returns the currently-active alias, or undefined in legacy mode. */
export function getActiveAlias(): string | undefined {
  return activeAlias;
}

/** Returns true iff the active profile is read-only (QA or PRD). */
export function isReadOnlyTier(): boolean {
  return activeTier !== 'DEV';
}

/**
 * Load the active profile and apply it to process.env in one step. Idempotent:
 * safe to call multiple times. Used at server startup and by ReloadProfile.
 */
export function activateProfile(cwd: string = process.cwd()): LoadedProfile {
  const loaded = loadActiveProfile(cwd);
  applyProfile(loaded);
  return loaded;
}

/**
 * Reconcile the cached active tier from `process.env.SAP_TIER` for connections
 * that bypass the runtime-directory profile loader — i.e. `--env-path` / `MCP_ENV_PATH`
 * env files, whose SAP_TIER the launcher hydrates into process.env. Applies the
 * same fail-closed policy as a loaded profile: a present connection with a
 * missing/unrecognized tier becomes read-only ('UNKNOWN'). Returns the tier now
 * in effect.
 */
export function reconcileTierFromEnv(): Tier {
  const tier: Tier = normalizeTier(process.env.SAP_TIER) ?? 'UNKNOWN';
  activeTier = tier;
  return tier;
}

/** Test-only reset of the cached tier/alias and the once-per-process warnings. */
export function __resetProfileState(): void {
  activeTier = 'DEV';
  activeAlias = undefined;
  warnedKeys.clear();
}
