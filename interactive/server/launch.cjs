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

// R-ENV. A SAPKIT_HOME_DIR that is set but missing is an error, never a reason
// to fall back to the legacy variable: returning null makes this shim skip
// profile resolution, so the bundle starts connectionless (fail-closed).
// Otherwise the home is chosen by where the alias actually lives.
function resolveHome(alias) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      warnOnce(
        "ENV_INVALID",
        `SAPKIT_HOME_DIR points at a path that does not exist (${explicit}) — refusing to fall back to SC4SAP_HOME_DIR; no profile will be activated.`,
      );
      return null;
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
function candidateFrom(runtimeDir) {
  const ptr = path.join(runtimeDir, "active-profile.txt");
  if (fs.existsSync(ptr)) {
    const alias = fs.readFileSync(ptr, "utf8").trim();
    if (alias) {
      const home = resolveHome(alias);
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
  // R-TIE: the criterion above decides per generation FIRST. Both resolving
  // means both carry connection completeness, so the tie goes to `.sapkit`;
  // `.sc4sap` resolving alone still wins outright (R-PRESERVE).
  const candidate = candidateFrom(path.join(cwd, NEW_DIR)) || candidateFrom(path.join(cwd, LEGACY_DIR));

  const hasConnArg = process.argv.includes("--env-path") || process.argv.includes("--mcp");
  if (candidate && !hasConnArg && !process.env.MCP_ENV_PATH) {
    process.env.MCP_ENV_PATH = candidate;
  }
} catch (err) {
  // Never let the shim crash the server; degrade to the bundle's default behavior.
  console.error("[launch] active-profile resolution failed, starting bundle as-is:", err.message);
}

require("./server.bundle.cjs");
