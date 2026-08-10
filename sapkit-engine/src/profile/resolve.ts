/**
 * Profile resolution — turns a machine's files and environment into the
 * `ResolvedProfile` the server core consumes.
 *
 * Two sources can produce a connection and both must work:
 *
 *  1. **Self-resolution** — `<cwd>/.sapkit/active-profile.txt` names an alias,
 *     whose profile lives at `<home>/profiles/<alias>/sap.env`. With no
 *     pointer, the runtime directory's own `sap.env` is used.
 *  2. **Injection** — an outer launcher hands over an env-file path in
 *     `MCP_ENV_PATH`. This wins over self-resolution: it is a direct, explicit
 *     choice by whoever started the process, and the shipped shim only ever
 *     sets it when it did not already hold a value.
 *
 * **Nothing here falls back.** A broken `SAPKIT_HOME_DIR`, a missing injected
 * file, an alias with no profile, an incomplete `sap.env` — each ends in
 * `connection: null` and `tier: 'UNKNOWN'`, with a human-readable line in
 * `diagnostics` saying why. The server still starts (inspection-only); it just
 * never guesses which system it is talking to, and never assumes DEV.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import type {
  ConnectionConfig,
  DeploymentType,
  ResolvedProfile,
  SapTier,
} from '../contracts';
import { readEnvFile } from './envFile';
import { RUNTIME_DIR_NAME, listProfileAliases, resolveHomeDir } from './home';

/** Timeout defaults, in milliseconds. */
const TIMEOUT_DEFAULT = 45000;
const TIMEOUT_CSRF = 15000;
const TIMEOUT_LONG = 60000;

export interface ProfileResolveOptions {
  /** Project directory whose `.sapkit` holds the pointer. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Environment to read. Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** User home directory. Defaults to `os.homedir()`. Injected by tests. */
  readonly homedir?: string;
  /**
   * An env-file path the caller chose directly. **Wins over `MCP_ENV_PATH`**,
   * because it is the more explicit of the two.
   *
   * This exists because `MCP_ENV_PATH` is not the only injection channel. The
   * shipped shim deliberately leaves the variable unset when it sees
   * `--env-path` or `--mcp` on the command line
   * (`interactive/server/launch.cjs:344-347`), on the understanding that the
   * bundle reads those arguments itself — so without this option those two
   * channels, and a cwd-local `.env`, could never reach this layer at all.
   * Parsing argv is the server core's job, not this module's.
   */
  readonly envPath?: string;
}

/**
 * `ResolvedProfile` plus the raw contents of the env file that produced it.
 *
 * The raw map exists because the safety knobs (`MCP_BLOCKLIST_PROFILE`,
 * `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`) live in the same `sap.env` as the
 * connection but are not part of the shared connection contract. Handing them
 * back here is what lets the safety layer honour a per-profile floor without
 * this module writing into `process.env`.
 */
export interface ProfileResolution {
  readonly profile: ResolvedProfile;
  readonly envVars: Readonly<Record<string, string>>;
}

/**
 * Where the env file came from. `envPath` is null when nothing resolved; the
 * alias is still reported in that case, because "the pointer named dev1 and
 * dev1 is not here" is the whole diagnosis.
 */
interface Candidate {
  readonly envPath: string | null;
  readonly alias: string | null;
}

export function resolveProfile(options: ProfileResolveOptions = {}): ResolvedProfile {
  return resolveProfileDetailed(options).profile;
}

export function resolveProfileDetailed(
  options: ProfileResolveOptions = {},
): ProfileResolution {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const diagnostics: string[] = [];

  const candidate = locateEnvFile(
    { cwd, env, homedir: options.homedir, envPath: options.envPath },
    diagnostics,
  );
  if (candidate.envPath === null) {
    return { profile: disconnected(diagnostics, candidate.alias), envVars: {} };
  }

  const envVars = readEnvFile(candidate.envPath);
  if (!envVars) {
    diagnostics.push(
      `ENV_UNREADABLE: ${candidate.envPath} could not be read — starting with no connection.`,
    );
    return { profile: disconnected(diagnostics, candidate.alias), envVars: {} };
  }

  const connection = buildConnection(envVars, candidate.envPath, diagnostics);
  const systemType = readSystemType(envVars);

  if (!connection) {
    return {
      profile: {
        connection: null,
        tier: 'UNKNOWN',
        systemType,
        envPath: candidate.envPath,
        alias: candidate.alias,
        diagnostics,
      },
      envVars,
    };
  }

  const tier = readTier(envVars.SAP_TIER);
  if (tier === 'UNKNOWN') {
    diagnostics.push(
      `TIER_UNRESOLVED: SAP_TIER in ${candidate.envPath} is ${
        envVars.SAP_TIER === undefined ? 'absent' : `"${envVars.SAP_TIER}"`
      } — the tier resolves to UNKNOWN and every write and execution is refused (fail-closed). Set SAP_TIER=DEV|QA|PRD.`,
    );
  }

  return {
    profile: {
      connection,
      tier,
      systemType,
      envPath: candidate.envPath,
      alias: candidate.alias,
      diagnostics,
    },
    envVars,
  };
}

// ── locating the env file ───────────────────────────────────────────────────

function locateEnvFile(
  ctx: {
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    homedir: string | undefined;
    envPath: string | undefined;
  },
  diagnostics: string[],
): Candidate {
  // ① Injection wins. The shim sets MCP_ENV_PATH from its own resolution only
  //    when the variable is empty, so a value here is always a deliberate,
  //    direct choice about which system to talk to. An explicit `envPath`
  //    option is the same choice made more directly, and outranks it.
  const explicit = (ctx.envPath ?? '').trim();
  const injected = explicit || (ctx.env.MCP_ENV_PATH ?? '').trim();
  if (injected) {
    if (fs.existsSync(injected)) return { envPath: injected, alias: null };
    diagnostics.push(
      `ENV_PATH_MISSING: ${
        explicit ? 'the explicit env-file path' : 'MCP_ENV_PATH'
      } points at a file that does not exist (${injected}) — refusing to fall back to the profile home or a project-local sap.env; the server starts with no connection.`,
    );
    return { envPath: null, alias: null };
  }

  // ② Self-resolution. A pinned-but-missing home is terminal.
  const home = resolveHomeDir({ env: ctx.env, homedir: ctx.homedir });
  if (home.kind === 'env-invalid') {
    diagnostics.push(
      `ENV_INVALID: SAPKIT_HOME_DIR points at a path that does not exist (${home.dir}) — refusing to fall back to ~/${RUNTIME_DIR_NAME} or to a project-local sap.env; the server starts with no connection.`,
    );
    return { envPath: null, alias: null };
  }

  const runtimeDir = path.join(ctx.cwd, RUNTIME_DIR_NAME);
  const alias = readPointer(runtimeDir);

  if (alias) {
    const envPath = path.join(home.dir, 'profiles', alias, 'sap.env');
    if (fs.existsSync(envPath)) return { envPath, alias };
    const available = listProfileAliases(home.dir);
    diagnostics.push(
      `PROFILE_NOT_FOUND: active profile "${alias}" has no sap.env under ${home.dir}${
        available.length ? ` (available: ${available.join(', ')})` : ' (no profiles found there)'
      }. Fix the alias in ${path.join(runtimeDir, 'active-profile.txt')} or create the profile; until then the server starts with no connection.`,
    );
    return { envPath: null, alias };
  }

  const local = path.join(runtimeDir, 'sap.env');
  if (fs.existsSync(local)) return { envPath: local, alias: null };

  diagnostics.push(
    `NO_PROFILE: neither ${path.join(runtimeDir, 'active-profile.txt')} nor ${local} was found — starting in inspection-only mode with no connection.`,
  );
  return { envPath: null, alias: null };
}

/** Read a non-empty alias out of `<runtime dir>/active-profile.txt`. */
function readPointer(runtimeDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(runtimeDir, 'active-profile.txt'), 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

// ── building the connection ─────────────────────────────────────────────────

function buildConnection(
  envVars: Readonly<Record<string, string>>,
  envPath: string,
  diagnostics: string[],
): ConnectionConfig | null {
  const baseUrl = (envVars.SAP_URL ?? '').trim();
  const username = (envVars.SAP_USERNAME ?? '').trim();
  const password = envVars.SAP_PASSWORD ?? '';

  // M1 handles Basic auth only. A partially-filled profile is not turned into
  // a half-built connection that fails later with a message naming the wrong
  // cause — it is reported here, by name, and produces no connection.
  const missing: string[] = [];
  if (!baseUrl) missing.push('SAP_URL');
  if (!username) missing.push('SAP_USERNAME');
  if (!password) missing.push('SAP_PASSWORD');
  if (missing.length) {
    diagnostics.push(
      `INCOMPLETE_CONNECTION: ${envPath} is missing ${missing.join(', ')} — the server starts with no connection (M1 supports Basic authentication only).`,
    );
    return null;
  }

  const client = (envVars.SAP_CLIENT ?? '').trim();
  const language = (envVars.SAP_LANGUAGE ?? '').trim();

  return {
    baseUrl,
    username,
    password,
    client: client || undefined,
    language: language || undefined,
    // Only an explicit `0` opens self-signed certificates; every other value,
    // including an absent one, keeps verification on.
    rejectUnauthorized: (envVars.TLS_REJECT_UNAUTHORIZED ?? '').trim() !== '0',
    timeouts: {
      default: readTimeout(envVars.SAP_TIMEOUT_DEFAULT, TIMEOUT_DEFAULT),
      csrf: readTimeout(envVars.SAP_TIMEOUT_CSRF, TIMEOUT_CSRF),
      long: readTimeout(envVars.SAP_TIMEOUT_LONG, TIMEOUT_LONG),
    },
  };
}

function readTimeout(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// ── tier and deployment axis ────────────────────────────────────────────────

/**
 * Case- and whitespace-insensitive. Anything unrecognised — including an
 * absent value — is `UNKNOWN`, which the tier gate treats as the most
 * restrictive tier. Only an explicit DEV opens writes.
 */
function readTier(raw: string | undefined): SapTier {
  const value = (raw ?? '').trim().toUpperCase();
  return value === 'DEV' || value === 'QA' || value === 'PRD' ? value : 'UNKNOWN';
}

/**
 * `SAP_SYSTEM_TYPE` is the deployment axis: `onprem`, `cloud` or `legacy`,
 * defaulting to `cloud`.
 *
 * `legacy` is a value in its own right, not a synonym for either of the other
 * two: the measured engine computes the current axis as legacy|onprem|cloud
 * (`engine/src/server/BaseMcpServer.ts:481-494`) and its handlers declare
 * `available_in: legacy`, so folding it into cloud would expose the wrong set
 * of tools. Anything else — including an absent value — is `cloud`.
 */
function readSystemType(envVars: Readonly<Record<string, string>>): DeploymentType {
  const value = (envVars.SAP_SYSTEM_TYPE ?? '').trim().toLowerCase();
  if (value === 'onprem') return 'onprem';
  if (value === 'legacy') return 'legacy';
  return 'cloud';
}

/** The inspection-only shell: no connection, no tier, and a reason on record. */
function disconnected(diagnostics: readonly string[], alias: string | null): ResolvedProfile {
  return {
    connection: null,
    tier: 'UNKNOWN',
    systemType: 'cloud',
    envPath: null,
    alias,
    diagnostics: [...diagnostics],
  };
}
