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

const path = require("path");
const os = require("os");
const fs = require("fs");

const NEW_DIR = ".sapkit";
const LEGACY_DIR = ".sc4sap";

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
    warnOnce("PROFILE_NOT_FOUND", `profile "${alias}" was not found under ${newHome} or ${legacyHome}.`);
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

try {
  const cwd = process.cwd();
  let candidate = null;
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
    // R-TIE: the criterion above decides per generation FIRST. Both resolving
    // means both carry connection completeness, so the tie goes to `.sapkit`;
    // `.sc4sap` resolving alone still wins outright (R-PRESERVE).
    // The sentinel is truthy, so it short-circuits the `||` just like a real
    // hit would; the last line is what keeps it from ever reaching
    // MCP_ENV_PATH. Belt and braces with the guard above, which already
    // covers every reachable path — deliberately, because a future caller of
    // candidateFrom must not be able to reintroduce the fall-through.
    const picked = candidateFrom(path.join(cwd, NEW_DIR)) || candidateFrom(path.join(cwd, LEGACY_DIR));
    candidate = picked === ENV_INVALID ? null : picked;
  }

  const hasConnArg = process.argv.includes("--env-path") || process.argv.includes("--mcp");
  if (candidate && !hasConnArg && !process.env.MCP_ENV_PATH) {
    process.env.MCP_ENV_PATH = candidate;
  }
} catch (err) {
  // Never let the shim crash the server; degrade to the bundle's default behavior.
  console.error("[launch] active-profile resolution failed, starting bundle as-is:", err.message);
}

require("./server.bundle.cjs");
