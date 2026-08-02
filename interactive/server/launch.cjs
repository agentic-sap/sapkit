// Launcher shim for the SAP MCP server bundle.
//
// WHY: server.bundle.cjs runs activateProfile() at startup (reading
// <cwd>/<runtime dir>/active-profile.txt -> <home>/profiles/<alias>/sap.env and
// exporting SAP_* into the environment), but that activation does NOT feed the
// bundle's connection broker. The broker only builds a REAL connection when it
// gets an env-file path via --env-path / --mcp / MCP_ENV_PATH / a cwd .env;
// otherwise it silently falls back to a mock connection and every real call
// fails with "Basic authentication requires SAP_CLIENT to be provided".
//
// This shim bridges that gap: it resolves the active profile's sap.env using
// the SAME home/pointer logic as the bundle and, if found, points the bundle at
// it via MCP_ENV_PATH before require()-ing the bundle in this same process
// (stdio + argv/env intact). If nothing resolves, it does nothing and the
// bundle starts in inspection-only mode exactly as before.
//
// Runtime path rename (D-057, `.sc4sap` -> `.sapkit`): `.sapkit` is now a
// candidate everywhere `.sc4sap` was one — nothing else changes. The search
// depth stays 0 (exact cwd) and the adoption criterion ("this runtime dir
// yields a usable sap.env") is applied to EACH generation separately before any
// tie-break (R-TIE), so a `.sc4sap`-only project resolves exactly as before.
//
// Per-project tool surface (design 2026-08-02 §7-1): the client manifest no
// longer pins `--exposition`. This shim decides it from the project's
// `<runtime dir>/config.json` `"toolSurface"` field and hands the bundle
// EXACTLY ONE `--exposition` argument. Priority: an explicit `--exposition`
// CLI argument (the pre-existing manual-registration path — passed through
// unvalidated) > `toolSurface` > `readonly`. `development` opens the write
// surface only when the resolved connection's `SAP_TIER` is DEV (R-DEV);
// anything else — unknown value, unreadable config, QA/PRD, unresolved tier —
// falls back to `readonly` with a once-per-process stderr reason (R-DEFAULT).

const path = require("path");
const os = require("os");
const fs = require("fs");

const NEW_DIR = ".sapkit";
const LEGACY_DIR = ".sc4sap";

// The two tool surfaces this shim can hand the bundle. The bundle's own
// default when no --exposition reaches it is `readonly,high`, so "decide
// readonly" must still be expressed as an explicit argument — omitting the
// argument would silently open the write surface.
const SURFACE_READONLY = "readonly";
const SURFACE_DEVELOPMENT = "readonly,high";

const warned = new Set();
// MCP speaks JSON-RPC on stdout, so every diagnostic goes to stderr, once per
// process (D-057 §4-5 warning channel).
function warnOnce(code, message) {
  if (warned.has(code)) return;
  warned.add(code);
  console.error(`[launch] ${code}: ${message}`);
}

// R-ENV. A SAPKIT_HOME_DIR that is set but missing is ENV_INVALID and that is
// TERMINAL for connection resolution: the operator pinned a home, the pin is
// broken, and no other source may stand in for it — not SC4SAP_HOME_DIR, and
// not a project-local sap.env either. The sentinel below is what makes the
// difference visible; a plain `null` was indistinguishable from "this
// generation has no profile", which let the caller fall through to
// `<runtime dir>/sap.env` and connect to a system the operator never selected.
const ENV_INVALID = Symbol("ENV_INVALID");

// True only for the terminal case. PROFILE_NOT_FOUND, a valid home with no
// sap.env, and a missing pointer are all unaffected (R-PRESERVE).
function envHomeInvalid() {
  const explicit = process.env.SAPKIT_HOME_DIR;
  return Boolean(explicit) && !fs.existsSync(explicit);
}

// The alias pointer travels with the project directory but the profile itself
// lives outside it, so a project copied between machines routinely points at a
// profile that is not here. Naming the aliases that DO exist turns a misleading
// auth error into a one-line fix. Never throws — a diagnostic must not break
// resolution.
function listAvailableProfiles(...homes) {
  const seen = new Set();
  for (const home of homes) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(home, "profiles"), { withFileTypes: true });
    } catch {
      continue; // this home has no profiles directory — not an error here
    }
    for (const entry of entries) if (entry.isDirectory()) seen.add(entry.name);
  }
  const names = [...seen].sort();
  return names.length
    ? ` (available: ${names.join(", ")})`
    : " (no profiles found under either home)";
}

// Otherwise the home is chosen by where the alias actually lives.
function resolveHome(alias) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      warnOnce(
        "ENV_INVALID",
        `SAPKIT_HOME_DIR points at a path that does not exist (${explicit}) — refusing to fall back to SC4SAP_HOME_DIR or to a project-local sap.env; the server starts with no connection.`,
      );
      return ENV_INVALID;
    }
    return explicit;
  }
  const legacyEnv = process.env.SC4SAP_HOME_DIR;
  if (legacyEnv) {
    warnOnce("OK_LEGACY_DEPRECATED", "SC4SAP_HOME_DIR is deprecated — rename it to SAPKIT_HOME_DIR.");
    return legacyEnv;
  }
  const newHome = path.join(os.homedir(), NEW_DIR);
  const legacyHome = path.join(os.homedir(), LEGACY_DIR);
  if (alias) {
    const inNew = fs.existsSync(path.join(newHome, "profiles", alias));
    const inLegacy = fs.existsSync(path.join(legacyHome, "profiles", alias));
    if (inNew && inLegacy) {
      warnOnce("COEXIST_OK", `profile "${alias}" exists under both ${newHome} and ${legacyHome} — using ${newHome}.`);
      return newHome;
    }
    if (inNew) return newHome;
    if (inLegacy) {
      warnOnce("OK_LEGACY_DEPRECATED", `profile "${alias}" resolved under the legacy home ${legacyHome}.`);
      return legacyHome;
    }
    warnOnce(
      "PROFILE_NOT_FOUND",
      `profile "${alias}" was not found under ${newHome} or ${legacyHome}` +
        `${listAvailableProfiles(newHome, legacyHome)}. ` +
        `Fix the alias in <project>/${NEW_DIR}/active-profile.txt, or create the profile. ` +
        `Until then the server starts with NO connection and every SAP call fails with ` +
        `"Basic authentication requires SAP_CLIENT to be provided" — that message names the ` +
        `wrong cause; SAP_CLIENT is not the problem.`,
    );
  }
  if (fs.existsSync(newHome)) return newHome;
  if (fs.existsSync(legacyHome)) return legacyHome;
  return newHome;
}

// This shim's existing adoption criterion, applied to ONE runtime directory:
// pointer -> profile sap.env, else the directory's own legacy sap.env.
// Returns ENV_INVALID (not null) when the home pin is broken, so the caller
// aborts instead of continuing to the next candidate.
function candidateFrom(runtimeDir) {
  const ptr = path.join(runtimeDir, "active-profile.txt");
  if (fs.existsSync(ptr)) {
    const alias = fs.readFileSync(ptr, "utf8").trim();
    if (alias) {
      const home = resolveHome(alias);
      if (home === ENV_INVALID) return ENV_INVALID;
      if (home) {
        const p = path.join(home, "profiles", alias, "sap.env");
        if (fs.existsSync(p)) return p;
      }
    }
  }
  const legacy = path.join(runtimeDir, "sap.env");
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

// ONE generation selection per process, and both the connection and the tool
// surface read from it. This is the pre-existing
// `candidateFrom(.sapkit) || candidateFrom(.sc4sap)` expression, unchanged in
// outcome — it only also reports WHICH generation answered, because the tool
// surface must not be read from the other one (a config.json and a sap.env
// taken from different generations is the split-brain the conformance fixture
// pins against for the blocklist hook, safety-6).
// R-TIE: the criterion above decides per generation FIRST. Both resolving
// means both carry connection completeness, so the tie goes to `.sapkit`;
// `.sc4sap` resolving alone still wins outright (R-PRESERVE).
function selectGeneration(cwd) {
  for (const generation of [NEW_DIR, LEGACY_DIR]) {
    const runtimeDir = path.join(cwd, generation);
    const found = candidateFrom(runtimeDir);
    // The sentinel is truthy, so it short-circuits just like a real hit would;
    // returning it here is what keeps it from ever reaching MCP_ENV_PATH.
    if (found === ENV_INVALID) return { runtimeDir: null, envPath: ENV_INVALID };
    if (found) return { runtimeDir, envPath: found };
  }
  return { runtimeDir: null, envPath: null };
}

// Minimal KEY=VALUE reader. Deliberately not dotenv: this shim runs BEFORE the
// bundle is required and must stay dependency-free. Last assignment wins, which
// is what `dotenv.parse` (object assignment) does for a duplicated key.
// Returns undefined when the key is absent or the file cannot be read.
function readEnvValue(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  let value;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    let name = line.slice(0, eq).trim();
    if (name.startsWith("export ")) name = name.slice(7).trim();
    if (name !== key) continue;
    let v = line.slice(eq + 1).trim();
    const q = v.charAt(0);
    if ((q === '"' || q === "'") && v.length >= 2 && v.charAt(v.length - 1) === q) v = v.slice(1, -1);
    value = v.trim();
  }
  return value;
}

// The project's tool-surface choice lives beside its connection state, so it is
// read from the SAME generation the connection came from. Only when NO
// generation yielded a connection do we fall back to this shim's own candidate
// order (`.sapkit` first, R-TIE) just to find a config at all — and in that
// state the tier is unresolved anyway, so the surface is `readonly` either way
// and only the diagnostic text differs.
//
// Never throws: an unreadable or malformed config.json must degrade to
// `readonly`, never stop the server from starting.
function readToolSurface(cwd, selectedDir) {
  const dirs = selectedDir ? [selectedDir] : [path.join(cwd, NEW_DIR), path.join(cwd, LEGACY_DIR)];
  for (const dir of dirs) {
    const file = path.join(dir, "config.json");
    if (!fs.existsSync(file)) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      return { state: "unreadable", file, detail: err.message };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { state: "unreadable", file, detail: "top level is not a JSON object" };
    }
    const raw = parsed.toolSurface;
    // Other keys of this file (blocklistProfile, …) belong to other consumers —
    // read nothing else, write nothing.
    if (raw === undefined || raw === null) return { state: "absent", file };
    if (typeof raw !== "string") return { state: "unknown", file, raw: JSON.stringify(raw) };
    // Case and surrounding whitespace are normalised for the same reason the
    // tier is (`SAP_TIER=dev` resolves DEV): "Development" is not a typo. Any
    // OTHER spelling is, and R-DEFAULT reduces it to readonly.
    const value = raw.trim().toLowerCase();
    if (value === "readonly" || value === "development") return { state: "set", file, value };
    return { state: "unknown", file, raw };
  }
  return { state: "absent", file: null };
}

// R-DEV. Returns null when `development` may be granted, otherwise the reason
// it may not — which is reported, not swallowed.
function developmentBlockedBecause(envPath) {
  if (!envPath) return "the active profile's sap.env did not resolve (inspection-only)";
  const raw = readEnvValue(envPath, "SAP_TIER");
  if (raw === undefined) return `SAP_TIER is absent from ${envPath}`;
  const tier = raw.trim().toUpperCase();
  if (tier === "DEV") return null;
  return `SAP_TIER=${tier || "(empty)"} — only DEV opens the development surface`;
}

// Splits EVERY --exposition occurrence out of the argument list so exactly one
// can be put back. The bundle's parser takes the FIRST match, so a leftover
// `--exposition=` (empty value, which the bundle reads as "unset" and answers
// with its own readonly,high default) would silently outrank an appended one.
function splitExpositionArgs(args) {
  const rest = [];
  const values = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--exposition=")) {
      values.push(arg.slice("--exposition=".length));
      continue;
    }
    if (arg === "--exposition") {
      values.push(i + 1 < args.length ? args[++i] : "");
      continue;
    }
    rest.push(arg);
  }
  return { rest, values };
}

// Pure decision. Returns the single exposition to hand the bundle, the argv
// tail with every --exposition removed, and the diagnostics the caller emits —
// keeping stderr out of here is what makes the decision testable in-process.
function decideExposition({ args, cwd, selectedDir = null, envPath = null }) {
  const { rest, values } = splitExpositionArgs(args);
  const notices = [];
  const surface = readToolSurface(cwd, selectedDir);
  const mapped = surface.state === "set" && surface.value === "development" ? SURFACE_DEVELOPMENT : SURFACE_READONLY;

  // ① Explicit CLI argument. Compatibility path for manual registration,
  // Antigravity and the repo's own extract tools — passed through unvalidated
  // and unmapped, exactly as before this field existed. Only a config that
  // actually DECIDED something (state "set") is worth a mismatch notice here;
  // a typo or a missing key changes nothing on this path, and reporting it
  // anyway would be the nagging this design set out to remove.
  const explicit = values.find((v) => v.trim() !== "");
  if (explicit !== undefined) {
    const wanted = explicit.trim();
    if (surface.state === "set" && mapped !== wanted) {
      notices.push({
        code: "TOOLSURFACE_ARG",
        message: `--exposition=${wanted} on the command line overrides toolSurface="${surface.value}" (${mapped}) from ${surface.file}.`,
      });
    }
    return { exposition: wanted, source: "argv", rest, notices, surface };
  }

  // ② Project config.
  if (surface.state === "unreadable") {
    notices.push({
      code: "TOOLSURFACE_UNREADABLE",
      message: `${surface.file} could not be read as JSON (${surface.detail}) — tool surface reduced to ${SURFACE_READONLY}.`,
    });
    return { exposition: SURFACE_READONLY, source: "fallback", rest, notices, surface };
  }
  if (surface.state === "unknown") {
    notices.push({
      code: "TOOLSURFACE_UNKNOWN",
      message: `unknown toolSurface value ${JSON.stringify(surface.raw)} in ${surface.file} — expected "readonly" or "development"; reduced to ${SURFACE_READONLY}.`,
    });
    return { exposition: SURFACE_READONLY, source: "fallback", rest, notices, surface };
  }
  if (surface.state === "absent") {
    notices.push({
      code: "TOOLSURFACE_DEFAULT",
      message:
        `no toolSurface configured${surface.file ? ` in ${surface.file}` : ""} — starting with ${SURFACE_READONLY}. ` +
        `For write tools on a DEV system set "toolSurface": "development" in <project>/${NEW_DIR}/config.json and restart the MCP server.`,
    });
    return { exposition: SURFACE_READONLY, source: "default", rest, notices, surface };
  }
  if (surface.value === "readonly") {
    return { exposition: SURFACE_READONLY, source: "config", rest, notices, surface };
  }

  // ③ development — R-DEV: fail closed unless the resolved connection is DEV.
  const blocked = developmentBlockedBecause(envPath);
  if (blocked) {
    notices.push({
      code: "TOOLSURFACE_FAIL_CLOSED",
      message: `toolSurface="development" in ${surface.file} was NOT granted: ${blocked}. Tool surface reduced to ${SURFACE_READONLY}.`,
    });
    return { exposition: SURFACE_READONLY, source: "fail-closed", rest, notices, surface };
  }
  return { exposition: SURFACE_DEVELOPMENT, source: "config", rest, notices, surface };
}

function main() {
  let selected = { runtimeDir: null, envPath: null };
  try {
    const cwd = process.cwd();
    if (envHomeInvalid()) {
      // Terminal: stop before any generation is examined. Checking here (and not
      // only inside candidateFrom) also covers the pointer-less shape, where a
      // project-local sap.env would otherwise be adopted while the operator's
      // own home pin is broken.
      warnOnce(
        "ENV_INVALID",
        `SAPKIT_HOME_DIR points at a path that does not exist (${process.env.SAPKIT_HOME_DIR}) — refusing to fall back to SC4SAP_HOME_DIR or to a project-local sap.env; the server starts with no connection.`,
      );
    } else {
      const picked = selectGeneration(cwd);
      // Belt and braces with the guard above, which already covers every
      // reachable path — deliberately, because a future caller of
      // selectGeneration must not be able to reintroduce the fall-through.
      if (picked.envPath !== ENV_INVALID) selected = picked;
    }

    const hasConnArg = process.argv.includes("--env-path") || process.argv.includes("--mcp");
    if (selected.envPath && !hasConnArg && !process.env.MCP_ENV_PATH) {
      process.env.MCP_ENV_PATH = selected.envPath;
    }
  } catch (err) {
    // Never let the shim crash the server; degrade to the bundle's default behavior.
    console.error("[launch] active-profile resolution failed, starting bundle as-is:", err.message);
  }

  // Tool surface. Same try/catch philosophy: any failure here reduces to
  // readonly rather than stopping the server.
  try {
    const decided = decideExposition({
      args: process.argv.slice(2),
      cwd: process.cwd(),
      selectedDir: selected.runtimeDir,
      // The tier MUST come from the env file the bundle will actually connect
      // with, which is what MCP_ENV_PATH now holds — either this shim's own
      // candidate or one the operator pre-set. When `--env-path`/`--mcp` chose
      // the connection instead, this is null and `development` fails closed:
      // granting write on a tier we did not read is the one outcome worth
      // refusing.
      envPath: process.env.MCP_ENV_PATH || null,
    });
    for (const notice of decided.notices) warnOnce(notice.code, notice.message);
    process.argv = [process.argv[0], process.argv[1], ...decided.rest, `--exposition=${decided.exposition}`];
  } catch (err) {
    console.error("[launch] tool-surface decision failed, forcing readonly:", err.message);
    const { rest } = splitExpositionArgs(process.argv.slice(2));
    process.argv = [process.argv[0], process.argv[1], ...rest, `--exposition=${SURFACE_READONLY}`];
  }
}

// Direct execution keeps the shipped contract: decide, then require the bundle
// in THIS process so stdio, argv and env stay intact. Requiring this file as a
// module gives the pure helpers without booting a server.
if (require.main === module) {
  main();
  require("./server.bundle.cjs");
}

module.exports = {
  SURFACE_READONLY,
  SURFACE_DEVELOPMENT,
  selectGeneration,
  readEnvValue,
  readToolSurface,
  splitExpositionArgs,
  decideExposition,
  main,
};
