#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Tier Readonly Guard
 *
 * Blocks mutation / code-execution MCP tool calls when the currently active
 * SAP profile is QA or PRD. Layer 1 of the two-layer defense (MCP server is
 * Layer 2).
 *
 * Resolution:
 *   1. Walk up from cwd to find `.sapkit/active-profile.txt`.
 *   2. If found, read `$SAPKIT_HOME_DIR/profiles/<alias>/sap.env` (falls back
 *      to `~/.sapkit/profiles/<alias>/sap.env`) and extract `SAP_TIER`.
 *   3. If no pointer is found, fall back to `<runtimeDir>/sap.env`
 *      (legacy single-profile mode) and extract `SAP_TIER` (unresolved →
 *      null; see Failure mode).
 *
 * Runtime path rename (D-057, `.sc4sap` -> `.sapkit`): `.sapkit` is a candidate
 * everywhere `.sc4sap` was one; nothing else changes (R-PRESERVE). The walk
 * depth stays 8 and this guard's criterion stays "existence IS the boundary" —
 * applied to EACH generation before any tie-break (R-TIE), so a `.sc4sap`-only
 * ancestor still stops the walk exactly where it did before. An unresolved tier
 * still denies.
 *
 * Block matrix (Strict) — mirrors MCP server readonlyGuard (the server side is
 * an allowlist / fail-closed guard and remains the last line of defense; this
 * hook covers the mutation prefixes actually exposed on the default surface):
 *   PRD: {Create,Update,Delete,Activate,Patch,Release,Write}_, RunUnitTest,
 *        RuntimeRun{Program,Class}WithProfiling
 *   QA:  same minus RunUnitTest (unit tests are allowed on QA)
 *   DEV: nothing blocked.
 * 2026-07-11: Activate/Patch/Release/Write prefixes added — the engine's
 * readonlyGuard header documents that a Create/Update/Delete-only denylist
 * proved incomplete (ActivateObjects, PatchGuiStatus, ReleaseTransport,
 * WriteTextElementsBulk bypassed it).
 *
 * Failure mode: fails CLOSED. An unresolved tier (missing profile pointer,
 * missing/unreadable sap.env, or a non-DEV/QA/PRD value) is treated as "no
 * tier" and denies mutation / RUNTIME_EXEC calls — only an explicit DEV
 * tier passes. stdin/JSON parse failures are denied the same way. MCP
 * server L2 guard still enforces as the last line of defense.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const MUTATION_PREFIXES = [
  'Create',
  'Update',
  'Delete',
  'Activate',
  'Patch',
  'Release',
  'Write',
];
const RUNTIME_EXEC = new Set([
  'RunUnitTest',
  'RuntimeRunProgramWithProfiling',
  'RuntimeRunClassWithProfiling',
  'RuntimeCreateProfilerTraceParameters',
]);
const QA_ALLOW = new Set(['RunUnitTest']);

const NEW_DIR = '.sapkit';
const LEGACY_DIR = '.sc4sap';

const PROFILE_SETUP_HINT =
  'Set up (or switch to) a DEV profile: create ~/.sapkit/profiles/<alias>/sap.env ' +
  '(or $SAPKIT_HOME_DIR override) with SAP_TIER=dev, and point this project at it with a single ' +
  'alias line in .sapkit/active-profile.txt (a legacy .sc4sap layout is still read). ' +
  'Details: core/procedures/troubleshooting.md.';

// Reason codes collected during resolution and appended to the deny message —
// this hook's warning channel is its JSON response (D-057 §4-5).
const reasons = [];
function note(code, message) {
  if (reasons.some((r) => r.startsWith(`${code}:`))) return;
  reasons.push(`${code}: ${message}`);
}

// R-ENV. A SAPKIT_HOME_DIR that is set but missing is ENV_INVALID: it never
// silently falls back to the legacy variable. Returning null leaves the tier
// unresolved, which this guard already treats as deny.
function sapkitHome(alias) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!existsSync(explicit)) {
      note('ENV_INVALID', `SAPKIT_HOME_DIR points at a path that does not exist (${explicit})`);
      return null;
    }
    return explicit;
  }
  const legacyEnv = process.env.SC4SAP_HOME_DIR;
  if (legacyEnv) {
    note('OK_LEGACY_DEPRECATED', 'SC4SAP_HOME_DIR is deprecated — rename it to SAPKIT_HOME_DIR');
    return legacyEnv;
  }
  const newHome = join(homedir(), NEW_DIR);
  const legacyHome = join(homedir(), LEGACY_DIR);
  if (alias) {
    const inNew = existsSync(join(newHome, 'profiles', alias));
    const inLegacy = existsSync(join(legacyHome, 'profiles', alias));
    if (inNew && inLegacy) {
      note('COEXIST_OK', `profile "${alias}" exists under both homes — using ${newHome}`);
      return newHome;
    }
    if (inNew) return newHome;
    if (inLegacy) return legacyHome;
    note('PROFILE_NOT_FOUND', `profile "${alias}" was not found under ${newHome} or ${legacyHome}`);
  }
  if (existsSync(newHome)) return newHome;
  if (existsSync(legacyHome)) return legacyHome;
  return newHome;
}

// Connection completeness — the R-TIE tie-break input. An empty
// active-profile.txt does not count.
function hasConnectionState(runtimeDir) {
  try {
    const pointer = join(runtimeDir, 'active-profile.txt');
    if (existsSync(pointer) && readFileSync(pointer, 'utf8').trim().length > 0) return true;
  } catch {
    /* unreadable pointer is not completeness */
  }
  return existsSync(join(runtimeDir, 'sap.env'));
}

// R-TIE inside ONE ancestor. This guard's criterion is plain existence, applied
// to each generation before the tie-break.
function pickGeneration(dir) {
  const newer = join(dir, NEW_DIR);
  const older = join(dir, LEGACY_DIR);
  const newOk = existsSync(newer);
  const oldOk = existsSync(older);
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

// Returns the selected runtime directory. With nothing found within 8 levels
// the returned path does not exist, so the tier stays unresolved → deny.
function walkUpForRuntimeDir(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const hit = pickGeneration(dir);
    if (hit) return hit;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, NEW_DIR);
}

function readActiveAlias(runtimeDir) {
  const p = join(runtimeDir, 'active-profile.txt');
  if (!existsSync(p)) return null;
  try {
    const a = readFileSync(p, 'utf8').trim();
    return a.length > 0 ? a : null;
  } catch {
    return null;
  }
}

function parseDotenvTier(envFilePath) {
  if (!existsSync(envFilePath)) return null;
  try {
    const raw = readFileSync(envFilePath, 'utf8');
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (key !== 'SAP_TIER') continue;
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      const v = value.toUpperCase();
      if (v === 'DEV' || v === 'QA' || v === 'PRD') return v;
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveTier(runtimeDir) {
  const alias = readActiveAlias(runtimeDir);
  if (alias) {
    const home = sapkitHome(alias);
    if (!home) return { alias, tier: null, source: '(profile home unresolved)', legacy: false };
    const envPath = join(home, 'profiles', alias, 'sap.env');
    const tier = parseDotenvTier(envPath);
    return { alias, tier, source: envPath, legacy: false };
  }
  const legacy = join(runtimeDir, 'sap.env');
  const tier = parseDotenvTier(legacy);
  return { alias: null, tier, source: legacy, legacy: true };
}

function shortToolName(toolName) {
  // MCP tools are delivered as `mcp__<server>__<tool>` in Claude Code.
  const parts = String(toolName || '').split('__');
  return parts[parts.length - 1] || '';
}

function isMutation(name) {
  return MUTATION_PREFIXES.some((p) => name.startsWith(p));
}

function checkAllowed(toolName, tier) {
  if (tier === 'DEV') return null;
  if (toolName === 'ReloadProfile') return null;

  const gated = isMutation(toolName) || RUNTIME_EXEC.has(toolName);
  if (!gated) return null;

  if (tier === null) {
    return (
      `${toolName} requires a resolved SAP tier, but none could be determined — denying by default ` +
      `(only an explicit DEV profile may mutate or execute code).\n` +
      `Profile not configured — ${PROFILE_SETUP_HINT}`
    );
  }

  if (isMutation(toolName)) {
    return `${toolName} mutates SAP objects; only DEV profiles may mutate.`;
  }
  if (tier === 'QA' && QA_ALLOW.has(toolName)) return null;
  return `${toolName} executes ABAP code on the server and is blocked on ${tier} profiles.`;
}

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(data));
    setTimeout(() => done(data), 1500).unref?.();
  });
}

function emitDeny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

async function main() {
  const raw = await readStdin();
  if (!raw) {
    emitDeny(
      'sc4sap tier-readonly-guard — DENIED: empty hook payload, cannot verify the SAP tier. ' +
        'Denying by default (this gate fails closed).',
    );
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    emitDeny(
      `sc4sap tier-readonly-guard — DENIED: could not parse hook payload (${err.message}), cannot verify the SAP tier. ` +
        'Denying by default (this gate fails closed).',
    );
    return;
  }

  const toolNameRaw = payload.tool_name || payload.toolName || '';
  const tool = shortToolName(toolNameRaw);
  if (!tool) process.exit(0);

  // Only SAP ADT mutation / runtime tools are in scope. Bail on anything else.
  if (
    !isMutation(tool) &&
    !RUNTIME_EXEC.has(tool) &&
    tool !== 'ReloadProfile'
  ) {
    process.exit(0);
  }

  const runtimeDir = walkUpForRuntimeDir(process.cwd());
  let ctx;
  try {
    ctx = resolveTier(runtimeDir);
  } catch (err) {
    emitDeny(
      `sc4sap tier-readonly-guard — DENIED: could not resolve the SAP tier (${err.message}). ` +
        'Denying by default (this gate fails closed).',
    );
    return;
  }

  const reason = checkAllowed(tool, ctx.tier);
  if (!reason) process.exit(0);

  const aliasLabel = ctx.alias ?? '(legacy)';
  // The null-tier branch of checkAllowed() already embeds PROFILE_SETUP_HINT
  // in `reason` — only append it here for the resolved-tier (QA/PRD) case to
  // avoid repeating the same sentence twice in one message.
  const hintLine = ctx.tier === null ? '' : `${PROFILE_SETUP_HINT}\n`;
  // Path-resolution reason codes ride the JSON response, the channel this hook
  // owns (D-057 §4-5).
  const reasonCodes = reasons.length > 0 ? `  paths:   ${reasons.join(' | ')}\n` : '';
  const message =
    `sc4sap tier-readonly-guard — DENIED\n` +
    `  tool:    ${tool}\n` +
    `  profile: ${aliasLabel}\n` +
    `  tier:    ${ctx.tier ?? '(unresolved)'}\n` +
    `  reason:  ${reason}\n` +
    `${reasonCodes}\n` +
    `${hintLine}` +
    `(This check is backed by the MCP server-side guard — bypassing this hook does not bypass enforcement.)`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }),
  );
  process.exit(0);
}

main();
