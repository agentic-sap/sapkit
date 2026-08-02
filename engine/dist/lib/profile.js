"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilePathError = exports.RUNTIME_DIR_LEGACY = exports.RUNTIME_DIR_NEW = void 0;
exports.resolveProjectRuntimeDir = resolveProjectRuntimeDir;
exports.resolveHomeDir = resolveHomeDir;
exports.loadActiveProfile = loadActiveProfile;
exports.applyProfile = applyProfile;
exports.getActiveTier = getActiveTier;
exports.getActiveAlias = getActiveAlias;
exports.isReadOnlyTier = isReadOnlyTier;
exports.activateProfile = activateProfile;
exports.reconcileTierFromEnv = reconcileTierFromEnv;
exports.__resetProfileState = __resetProfileState;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const dotenv = __importStar(require("dotenv"));
const secrets_1 = require("./secrets");
/** Runtime directory name of the current generation. */
exports.RUNTIME_DIR_NEW = '.sapkit';
/** Runtime directory name of the legacy generation (still fully supported). */
exports.RUNTIME_DIR_LEGACY = '.sc4sap';
/** Journal file the migrator seals inside the destination directory (§5-2). */
const MIGRATION_JOURNAL_FILE = '.migration-journal.json';
/** Error carrying a `PathReason` so callers can distinguish path failures. */
class ProfilePathError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
        this.name = 'ProfilePathError';
    }
}
exports.ProfilePathError = ProfilePathError;
/** Module-level cache of the currently-active tier, read by the guard. */
let activeTier = 'DEV';
let activeAlias;
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
const warnedKeys = new Set();
function warnOnce(key, message) {
    if (warnedKeys.has(key))
        return;
    warnedKeys.add(key);
    console.error(`[MCP] ${message}`);
}
/** Read a non-empty `active-profile.txt` from a runtime directory. */
function readPointer(runtimeDir) {
    const pointer = path.join(runtimeDir, 'active-profile.txt');
    if (!fs.existsSync(pointer))
        return undefined;
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
function yieldsConnection(runtimeDir) {
    return (readPointer(runtimeDir) !== undefined ||
        fs.existsSync(path.join(runtimeDir, 'sap.env')));
}
function samePath(a, b) {
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
function hasMigrationJournalFrom(newDir, legacyDir) {
    const journal = path.join(newDir, MIGRATION_JOURNAL_FILE);
    if (!fs.existsSync(journal))
        return false;
    try {
        const parsed = JSON.parse(fs.readFileSync(journal, 'utf8'));
        const source = parsed?.source ?? parsed?.from;
        return typeof source === 'string' && samePath(source, legacyDir);
    }
    catch {
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
function resolveProjectRuntimeDir(cwd = process.cwd()) {
    const newDir = path.join(cwd, exports.RUNTIME_DIR_NEW);
    const legacyDir = path.join(cwd, exports.RUNTIME_DIR_LEGACY);
    const newOk = yieldsConnection(newDir);
    const legacyOk = yieldsConnection(legacyDir);
    if (newOk && legacyOk) {
        if (hasMigrationJournalFrom(newDir, legacyDir)) {
            return { dir: newDir, generation: 'sapkit', reason: 'COEXIST_OK' };
        }
        warnOnce(`coexist-project:${path.resolve(cwd)}`, `Both ${exports.RUNTIME_DIR_NEW}/ and ${exports.RUNTIME_DIR_LEGACY}/ carry connection state in ${cwd} — using ${exports.RUNTIME_DIR_NEW}/. If a migration was interrupted, finish or revert it (migrate-runtime-dir --status).`);
        return { dir: newDir, generation: 'sapkit', reason: 'OK_NEW' };
    }
    if (newOk) {
        return { dir: newDir, generation: 'sapkit', reason: 'OK_NEW' };
    }
    if (legacyOk) {
        warnOnce(`legacy-project:${path.resolve(cwd)}`, `Using the legacy runtime directory ${exports.RUNTIME_DIR_LEGACY}/ in ${cwd}. It stays supported; migrate-runtime-dir moves it to ${exports.RUNTIME_DIR_NEW}/.`);
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
function resolveHomeDir(alias) {
    const override = process.env.SAPKIT_HOME_DIR;
    if (override) {
        if (!fs.existsSync(override)) {
            throw new ProfilePathError('ENV_INVALID', `SAPKIT_HOME_DIR points to a path that does not exist: ${override}. Fix or unset it — the legacy home is not used as a silent fallback.`);
        }
        return { dir: override, generation: 'sapkit', reason: 'OK_NEW' };
    }
    const legacyOverride = process.env.SC4SAP_HOME_DIR;
    if (legacyOverride) {
        warnOnce('env:SC4SAP_HOME_DIR', 'SC4SAP_HOME_DIR is deprecated — rename it to SAPKIT_HOME_DIR (same meaning, same value).');
        return {
            dir: legacyOverride,
            generation: 'sc4sap',
            reason: 'OK_LEGACY_DEPRECATED',
        };
    }
    const newHome = path.join(os.homedir(), exports.RUNTIME_DIR_NEW);
    const legacyHome = path.join(os.homedir(), exports.RUNTIME_DIR_LEGACY);
    const inNew = fs.existsSync(path.join(newHome, 'profiles', alias));
    const inLegacy = fs.existsSync(path.join(legacyHome, 'profiles', alias));
    if (inNew && inLegacy) {
        if (hasMigrationJournalFrom(newHome, legacyHome)) {
            return { dir: newHome, generation: 'sapkit', reason: 'COEXIST_OK' };
        }
        warnOnce(`coexist-home:${alias}`, `Profile "${alias}" exists in both ${newHome} and ${legacyHome} — using ${newHome}. Remove the stale copy to avoid connecting to the wrong system.`);
        return { dir: newHome, generation: 'sapkit', reason: 'OK_NEW' };
    }
    if (inNew) {
        return { dir: newHome, generation: 'sapkit', reason: 'OK_NEW' };
    }
    if (inLegacy) {
        warnOnce('legacy-home', `Using the legacy profile home ${legacyHome}. It stays supported; migrate-runtime-dir --scope home moves it to ${newHome}.`);
        return {
            dir: legacyHome,
            generation: 'sc4sap',
            reason: 'OK_LEGACY_DEPRECATED',
        };
    }
    throw new ProfilePathError('PROFILE_NOT_FOUND', `Active profile "${alias}" was not found in ${path.join(newHome, 'profiles')} or ${path.join(legacyHome, 'profiles')}.`);
}
/** Merge the project and home reasons into the one reported for the load. */
function combineReason(a, b) {
    if (a === 'OK_LEGACY_DEPRECATED' || b === 'OK_LEGACY_DEPRECATED') {
        return 'OK_LEGACY_DEPRECATED';
    }
    if (a === 'COEXIST_OK' || b === 'COEXIST_OK')
        return 'COEXIST_OK';
    return 'OK_NEW';
}
/**
 * Parse a raw SAP_TIER value. Returns the recognized tier (DEV/QA/PRD), or
 * `undefined` when the value is missing or unrecognized so the caller can apply
 * its fail-closed policy (connection present → 'UNKNOWN'; connectionless shell →
 * 'DEV'). Case- and whitespace-insensitive.
 */
function normalizeTier(value) {
    const v = (value || '').trim().toUpperCase();
    if (v === 'DEV' || v === 'QA' || v === 'PRD')
        return v;
    return undefined;
}
/**
 * Load the active profile (or legacy sap.env) without mutating process.env.
 * Throws if an alias is pointed to but the profile folder does not exist.
 */
function loadActiveProfile(cwd = process.cwd()) {
    // One selection per load: the pointer and the sap.env fallback must never be
    // read from different generations.
    const project = resolveProjectRuntimeDir(cwd);
    const alias = readPointer(project.dir);
    let sourcePath;
    let legacy;
    let homeDir;
    let homeGeneration;
    let reason = project.reason;
    if (alias) {
        const home = resolveHomeDir(alias);
        homeDir = home.dir;
        homeGeneration = home.generation;
        reason = combineReason(project.reason, home.reason);
        sourcePath = path.join(home.dir, 'profiles', alias, 'sap.env');
        legacy = false;
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Active profile "${alias}" points to a missing env file: ${sourcePath}`);
        }
    }
    else {
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
    const resolved = { ...parsed };
    // Resolve keychain:<service>/<account> references for SAP_PASSWORD.
    const pwd = resolved.SAP_PASSWORD;
    if (pwd) {
        resolved.SAP_PASSWORD = (0, secrets_1.resolveSecret)(pwd);
    }
    // Fail-closed: a loaded connection whose SAP_TIER is missing or unrecognized
    // is treated as read-only ('UNKNOWN'), not DEV. Only an explicit dev/qa/prd
    // selects the corresponding tier; only 'dev' opens write/mutation tools.
    const tier = normalizeTier(resolved.SAP_TIER) ?? 'UNKNOWN';
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
function applyProfile(loaded) {
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
function getActiveTier() {
    return activeTier;
}
/** Returns the currently-active alias, or undefined in legacy mode. */
function getActiveAlias() {
    return activeAlias;
}
/** Returns true iff the active profile is read-only (QA or PRD). */
function isReadOnlyTier() {
    return activeTier !== 'DEV';
}
/**
 * Load the active profile and apply it to process.env in one step. Idempotent:
 * safe to call multiple times. Used at server startup and by ReloadProfile.
 */
function activateProfile(cwd = process.cwd()) {
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
function reconcileTierFromEnv() {
    const tier = normalizeTier(process.env.SAP_TIER) ?? 'UNKNOWN';
    activeTier = tier;
    return tier;
}
/** Test-only reset of the cached tier/alias and the once-per-process warnings. */
function __resetProfileState() {
    activeTier = 'DEV';
    activeAlias = undefined;
    warnedKeys.clear();
}
//# sourceMappingURL=profile.js.map