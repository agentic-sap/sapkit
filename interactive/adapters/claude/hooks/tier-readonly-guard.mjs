#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Tier Readonly Guard
 *
 * Blocks mutation / code-execution MCP tool calls when the currently active
 * SAP profile is QA or PRD. Layer 1 of the two-layer defense (MCP server is
 * Layer 2).
 *
 * Resolution:
 *   1. Walk up from cwd to find `.sc4sap/active-profile.txt`.
 *   2. If found, read `$SC4SAP_HOME_DIR/profiles/<alias>/sap.env` (falls back
 *      to `~/.sc4sap/profiles/<alias>/sap.env`) and extract `SAP_TIER`.
 *   3. If no pointer is found, fall back to `<projectDir>/.sc4sap/sap.env`
 *      (legacy single-profile mode) and extract `SAP_TIER` (unresolved →
 *      null; see Failure mode).
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

const PROFILE_SETUP_HINT =
  'Set up (or switch to) a DEV profile: create ~/.sc4sap/profiles/<alias>/sap.env ' +
  '(or $SC4SAP_HOME_DIR override) with SAP_TIER=dev, and point this project at it with a single ' +
  'alias line in .sc4sap/active-profile.txt. Details: core/procedures/troubleshooting.md.';

function sc4sapHome() {
  return process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
}

function walkUpForProject(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.sc4sap'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function readActiveAlias(projectDir) {
  const p = join(projectDir, '.sc4sap', 'active-profile.txt');
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

function resolveTier(projectDir) {
  const alias = readActiveAlias(projectDir);
  if (alias) {
    const envPath = join(sc4sapHome(), 'profiles', alias, 'sap.env');
    const tier = parseDotenvTier(envPath);
    return { alias, tier, source: envPath, legacy: false };
  }
  const legacy = join(projectDir, '.sc4sap', 'sap.env');
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

  const projectDir = walkUpForProject(process.cwd());
  let ctx;
  try {
    ctx = resolveTier(projectDir);
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
  const message =
    `sc4sap tier-readonly-guard — DENIED\n` +
    `  tool:    ${tool}\n` +
    `  profile: ${aliasLabel}\n` +
    `  tier:    ${ctx.tier ?? '(unresolved)'}\n` +
    `  reason:  ${reason}\n\n` +
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
