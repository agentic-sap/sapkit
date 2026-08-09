/**
 * Multi-profile SAP connection management.
 *
 * Resolves an "active profile" from the project-local pointer file
 * `<cwd>/.sapkit/active-profile.txt`, loads the corresponding profile env from
 * `~/.sapkit/profiles/<alias>/sap.env`, and overwrites `process.env.SAP_*` so
 * the rest of the server (connection factory, handlers) observes the selected
 * system transparently.
 *
 * When no active-profile.txt is present, falls back to the single-profile
 * `<cwd>/.sapkit/sap.env`. When a connection is loaded (a profile or that
 * single-profile sap.env was read) but SAP_TIER is missing or unrecognized, the
 * tier resolves fail-closed to the 'UNKNOWN' sentinel (read-only):
 * write/mutation tools are blocked unless SAP_TIER is explicitly 'dev'. Only the
 * connectionless inspection-only shell keeps the permissive DEV default —
 * harmless, since every tool call fails at connect time anyway.
 *
 * Runtime directory: `.sapkit` is the only one, and `SAPKIT_HOME_DIR` the only
 * home override. The pre-0.6 runtime directory and its home variable were a
 * migration-period fallback and were removed once the migration completed
 * (D-057); a leftover directory of that name is simply invisible.
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

/** Runtime directory name. */
export const RUNTIME_DIR_NEW = '.sapkit';

/**
 * Why a runtime path was chosen (design §4-5).
 *
 * - `OK_NEW` — the runtime path was adopted.
 * - `ENV_INVALID` — `SAPKIT_HOME_DIR` points at a path that does not exist
 *   (hard error: never a silent fallback to a different home).
 * - `PROFILE_NOT_FOUND` — the alias does not exist in the home.
 */
export type PathReason = 'OK_NEW' | 'ENV_INVALID' | 'PROFILE_NOT_FOUND';

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
  /** True when loaded via the single-profile `<runtime dir>/sap.env` fallback. */
  legacy: boolean;
  /** Absolute path of the project runtime directory that was selected. */
  runtimeDir: string;
  /** Absolute path of the profile home, or `undefined` in single-profile mode. */
  homeDir: string | undefined;
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

/** Read a non-empty `active-profile.txt` from a runtime directory. */
function readPointer(runtimeDir: string): string | undefined {
  const pointer = path.join(runtimeDir, 'active-profile.txt');
  if (!fs.existsSync(pointer)) return undefined;
  const raw = fs.readFileSync(pointer, 'utf8').trim();
  return raw.length > 0 ? raw : undefined;
}

/**
 * Pick the project runtime directory under `cwd`.
 *
 * This consumer has no ancestor walk (depth 0, path-direct), so the answer is
 * simply `<cwd>/.sapkit`. Whether that directory yields a connection is decided
 * by `loadActiveProfile` below, which reads the pointer and the sap.env out of
 * it; an absent directory produces the connectionless inspection-only shell.
 */
export function resolveProjectRuntimeDir(
  cwd: string = process.cwd(),
): RuntimeDirSelection {
  return { dir: path.join(cwd, RUNTIME_DIR_NEW), reason: 'OK_NEW' };
}

/**
 * R-ENV — pick the profile home that holds `alias`.
 *
 * `SAPKIT_HOME_DIR` wins when set, and a value pointing at a non-existent path
 * is a hard `ENV_INVALID` error rather than a silent fall-through to `~/.sapkit`:
 * standing in for a broken pin would connect to a system the operator did not
 * select. The variable names the runtime directory itself (not its parent), so
 * `~/.sapkit` corresponds to `$SAPKIT_HOME_DIR`.
 */
export function resolveHomeDir(alias: string): RuntimeDirSelection {
  const override = process.env.SAPKIT_HOME_DIR;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new ProfilePathError(
        'ENV_INVALID',
        `SAPKIT_HOME_DIR points to a path that does not exist: ${override}. Fix or unset it — no other home is used as a silent fallback.`,
      );
    }
    return { dir: override, reason: 'OK_NEW' };
  }

  const home = path.join(os.homedir(), RUNTIME_DIR_NEW);
  if (fs.existsSync(path.join(home, 'profiles', alias))) {
    return { dir: home, reason: 'OK_NEW' };
  }

  throw new ProfilePathError(
    'PROFILE_NOT_FOUND',
    `Active profile "${alias}" was not found in ${path.join(home, 'profiles')}.`,
  );
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
  const project = resolveProjectRuntimeDir(cwd);
  const alias = readPointer(project.dir);

  let sourcePath: string;
  let legacy: boolean;
  let homeDir: string | undefined;
  const reason: PathReason = project.reason;

  if (alias) {
    const home = resolveHomeDir(alias);
    homeDir = home.dir;
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
        homeDir: undefined,
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
    homeDir,
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

/** Test-only reset of the cached tier/alias. */
export function __resetProfileState(): void {
  activeTier = 'DEV';
  activeAlias = undefined;
}
