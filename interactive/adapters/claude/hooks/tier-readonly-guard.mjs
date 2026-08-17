#!/usr/bin/env node
/**
 * SAPKIT PreToolUse hook — tier readonly guard (defense layer 1)
 *
 * WHAT IT DECIDES
 * A tool call that would change SAP state, or make the server run ABAP, passes
 * only when the active connection profile declares itself DEV. QA keeps one
 * carve-out (unit tests). PRD keeps none. A tier nobody could read keeps none
 * either. `ReloadProfile` is exempt at every tier: it re-reads local profile
 * configuration and touches no SAP object.
 *
 *   DEV           nothing is denied
 *   QA            every gated tool is denied except RunUnitTest
 *   PRD           every gated tool is denied
 *   (unresolved)  every gated tool is denied
 *
 * HOW THE TIER IS FOUND
 *   1. Walk up from cwd, at most MAX_WALK_UP levels, looking for a `.sapkit`
 *      directory. The first one that exists wins — existence IS the boundary,
 *      so a subdirectory that owns a `.sapkit` is judged by that one and never
 *      by an ancestor's profile. `.sapkit` is the only runtime directory name
 *      recognised (D-057); the migration-period fallback to the pre-0.6 name is
 *      gone, so a directory under the old name is simply not a runtime
 *      directory.
 *   2. `<runtime>/active-profile.txt` holds one alias. That alias's tier is
 *      read from `<profile home>/profiles/<alias>/sap.env`, where the profile
 *      home is `$SAPKIT_HOME_DIR` when set and `~/.sapkit` otherwise.
 *   3. With no alias pointer, fall back to `<runtime>/sap.env` — the layout a
 *      single-profile installation has.
 * Nothing found, nothing readable, or a value outside DEV/QA/PRD all leave the
 * tier unresolved, and an unresolved tier denies.
 *
 * IT FAILS CLOSED ON PURPOSE
 * Every uncertainty denies: no payload on stdin, a payload that will not parse,
 * a throw while resolving paths, and an unresolved tier. Only an explicit DEV
 * reading opens the gate. The MCP server carries the same tier rule as an
 * allowlist on its own side and stays the last line of defense; this hook is
 * the earlier, cheaper stop in front of it.
 *
 * WHY THE GATED SET LOOKS LIKE THIS — READ BEFORE TRIMMING IT
 * On 2026-07-11 a denylist built from Create/Update/Delete alone was found to
 * be porous: `ActivateObjects`, `PatchGuiStatus`, `ReleaseTransport` and
 * `WriteTextElementsBulk` each change SAP, none of them begins with one of
 * those three verbs, and so all four went through. Activate/Patch/Release/Write
 * joined the prefix list that day. Every prefix below is there because
 * something got past the list without it.
 *
 * Server-side execution is an explicit membership list, not a prefix rule,
 * because the tools that make SAP run something share no naming shape.
 * `RuntimeCreateProfilerTraceParameters` shows why that matters: its "Create"
 * sits mid-name, no prefix test can see it, and only its membership in that
 * list gates it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// ── The gated surface ──────────────────────────────────────────────────────
// These four collections are the guard's judgment. Adding to them widens what
// is blocked; removing from them reopens something that was already shown to
// slip through. Neither belongs in a cleanup pass.
const MUTATING_NAME_PREFIXES = [
  'Create',
  'Update',
  'Delete',
  'Activate',
  'Patch',
  'Release',
  'Write',
];
const SERVER_SIDE_EXECUTION = new Set([
  'RunUnitTest',
  'RuntimeRunProgramWithProfiling',
  'RuntimeRunClassWithProfiling',
  'RuntimeCreateProfilerTraceParameters',
]);
const EXEMPT_ON_QA = new Set(['RunUnitTest']);
const ALWAYS_EXEMPT = 'ReloadProfile';

const RUNTIME_DIR_NAME = '.sapkit';
const MAX_WALK_UP = 8;
const CANONICAL_TIERS = new Set(['DEV', 'QA', 'PRD']);
const STDIN_DEADLINE_MS = 1500;

const SETUP_HINT =
  'Point this project at a DEV profile: put SAP_TIER=dev in ' +
  '~/.sapkit/profiles/<alias>/sap.env (or under $SAPKIT_HOME_DIR if you override the profile home), ' +
  'then name that one alias on a single line in .sapkit/active-profile.txt. ' +
  'Details: core/procedures/troubleshooting.md.';

const FAILS_CLOSED = 'Denying by default — this gate fails closed.';

// ── Path-resolution notes ──────────────────────────────────────────────────
// Complaints about where the profile was looked for ride the deny response.
// That JSON is the only output channel this hook owns (D-057 §4-5), so nothing
// here writes to stderr. One note per code — a repeated code says nothing new.
const pathNotes = [];
function recordPathNote(code, detail) {
  if (pathNotes.some((note) => note.startsWith(`${code}:`))) return;
  pathNotes.push(`${code}: ${detail}`);
}

// R-ENV. A `SAPKIT_HOME_DIR` that is set but missing is an error, not a hint:
// it never degrades quietly to the home-directory default and never consults
// the retired variable. Answering null leaves the tier unresolved, which this
// guard already denies.
function profileHome(alias) {
  const override = process.env.SAPKIT_HOME_DIR;
  if (override) {
    if (!existsSync(override)) {
      recordPathNote('ENV_INVALID', `SAPKIT_HOME_DIR points at a path that does not exist (${override})`);
      return null;
    }
    return override;
  }
  const defaultHome = join(homedir(), RUNTIME_DIR_NAME);
  if (alias && !existsSync(join(defaultHome, 'profiles', alias))) {
    recordPathNote('PROFILE_NOT_FOUND', `profile "${alias}" was not found under ${defaultHome}`);
  }
  return defaultHome;
}

// The nearest existing `.sapkit` on the way up from `startDir`. When none is in
// reach, name the path that would have been used anyway: it does not exist, so
// every read below misses and the tier stays unresolved.
function findRuntimeDir(startDir) {
  let dir = startDir;
  for (let level = 0; level < MAX_WALK_UP; level++) {
    const candidate = join(dir, RUNTIME_DIR_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(startDir, RUNTIME_DIR_NAME);
}

function readProfileAlias(runtimeDir) {
  const pointer = join(runtimeDir, 'active-profile.txt');
  if (!existsSync(pointer)) return null;
  try {
    const alias = readFileSync(pointer, 'utf8').trim();
    return alias.length > 0 ? alias : null;
  } catch {
    return null;
  }
}

// Lifts SAP_TIER out of a dotenv-shaped file. The first SAP_TIER assignment
// settles the question: a value outside DEV/QA/PRD answers null instead of
// reading on, so a later line cannot rescue an earlier wrong one.
function readTier(envFile) {
  if (!existsSync(envFile)) return null;
  try {
    for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const split = line.indexOf('=');
      if (split <= 0) continue;
      if (line.slice(0, split).trim() !== 'SAP_TIER') continue;
      const value = line
        .slice(split + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
        .toUpperCase();
      return CANONICAL_TIERS.has(value) ? value : null;
    }
  } catch {
    return null;
  }
  return null;
}

// `{ alias, tier }` — alias is null in the single-profile layout, tier is null
// whenever it could not be read as one of DEV/QA/PRD.
function resolveTierContext(runtimeDir) {
  const alias = readProfileAlias(runtimeDir);
  if (!alias) return { alias: null, tier: readTier(join(runtimeDir, 'sap.env')) };
  const home = profileHome(alias);
  if (!home) return { alias, tier: null };
  return { alias, tier: readTier(join(home, 'profiles', alias, 'sap.env')) };
}

// Claude Code delivers MCP tools as `mcp__<server>__<tool>`; only the trailing
// segment is judged. A bare tool name is judged the same way, and no server
// namespace is privileged — this guard does not care who offered the call.
function bareToolName(rawName) {
  const segments = String(rawName || '').split('__');
  return segments[segments.length - 1] || '';
}

function mutates(tool) {
  return MUTATING_NAME_PREFIXES.some((prefix) => tool.startsWith(prefix));
}

function isGated(tool) {
  return mutates(tool) || SERVER_SIDE_EXECUTION.has(tool);
}

// Null allows; a string is the sentence explaining the denial. The mutation
// verdict is taken before the QA carve-out, so a carve-out can only ever widen
// execution and never writes.
function denialReason(tool, tier) {
  if (tier === 'DEV') return null;
  if (tool === ALWAYS_EXEMPT) return null;
  if (!isGated(tool)) return null;

  if (tier === null) {
    return (
      `${tool} requires a resolved SAP tier and none could be read — denied by default, because only a ` +
      `profile that explicitly declares DEV may change or execute code.\n` +
      `Profile not configured — ${SETUP_HINT}`
    );
  }
  if (mutates(tool)) {
    return `${tool} mutates SAP objects; only DEV profiles may mutate.`;
  }
  if (tier === 'QA' && EXEMPT_ON_QA.has(tool)) return null;
  return `${tool} executes ABAP code on the server and is blocked on ${tier} profiles.`;
}

function readStdin() {
  return new Promise((settle) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => settle(buffer));
    process.stdin.on('error', () => settle(buffer));
    // Should stdin never close, decide on whatever arrived rather than hanging
    // the tool call. A truncated payload denies, which is the safe direction.
    setTimeout(() => settle(buffer), STDIN_DEADLINE_MS).unref?.();
  });
}

// Allowing is silence: empty stdout, exit 0. Claude Code reads that as "this
// hook has no objection".
function respondAllow() {
  process.exit(0);
}

function respondDeny(reason) {
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

// Denials taken before a tier was ever in hand: there is no profile block to
// print, only what went wrong and the standing rule that it closes the gate.
function denyUnverified(detail) {
  respondDeny(`SAPKIT tier-readonly-guard — DENIED: ${detail} ${FAILS_CLOSED}`);
}

function composeDenial(tool, ctx, reason) {
  const lines = [
    'SAPKIT tier-readonly-guard — DENIED',
    `  tool:    ${tool}`,
    `  profile: ${ctx.alias ?? '(single profile)'}`,
    `  tier:    ${ctx.tier ?? '(unresolved)'}`,
    `  reason:  ${reason}`,
  ];
  if (pathNotes.length > 0) lines.push(`  paths:   ${pathNotes.join(' | ')}`);
  lines.push('');
  // The unresolved-tier reason already carries SETUP_HINT inside it; appending
  // it again would print the same paragraph twice in one message.
  if (ctx.tier !== null) lines.push(SETUP_HINT);
  lines.push(
    'The MCP server holds the same tier rule on its own side — going around this hook does not go around enforcement.',
  );
  return lines.join('\n');
}

async function main() {
  const raw = await readStdin();
  if (!raw) {
    denyUnverified('empty hook payload — the SAP tier cannot be verified.');
    return;
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    denyUnverified(`could not parse hook payload (${err.message}) — the SAP tier cannot be verified.`);
    return;
  }

  const tool = bareToolName(event.tool_name || event.toolName || '');
  if (!tool) return respondAllow();

  // Out of scope: anything that neither changes SAP nor makes it run code.
  // `ALWAYS_EXEMPT` is admitted through this filter deliberately, so that its
  // exemption is stated once in the decision function rather than hiding here
  // as an absence.
  if (!isGated(tool) && tool !== ALWAYS_EXEMPT) return respondAllow();

  const runtimeDir = findRuntimeDir(process.cwd());
  let ctx;
  try {
    ctx = resolveTierContext(runtimeDir);
  } catch (err) {
    denyUnverified(`could not resolve the SAP tier (${err.message}).`);
    return;
  }

  const reason = denialReason(tool, ctx.tier);
  if (!reason) return respondAllow();

  respondDeny(composeDenial(tool, ctx, reason));
}

main();
