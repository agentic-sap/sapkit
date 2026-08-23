#!/usr/bin/env node
/**
 * The hook switch for the Claude adapter — writes SAPKIT's six hooks into one
 * Claude Code settings.json, or takes them back out again.
 *
 * Hooks ship unwired. The floor safety (tier gate, table blocklist) lives in the
 * MCP server itself, so nothing here is load-bearing for a default install; this
 * file is the switch a user flips when they want the extra client-side layer.
 * Being a switch is the whole contract: turning hooks off has to give back the
 * settings file that was found, byte for byte.
 *
 * What gets wired, and on which event:
 *
 *   PreToolUse
 *     block-forbidden-tables           row-extraction gate for GetTableContents
 *                                      and GetSqlQuery (fails closed)
 *     tier-readonly-guard              denies mutation and runtime execution
 *                                      against QA/PRD tier systems (fails closed)
 *     prefer-sqlquery-explicit-fields  asks before a full-column read or a
 *                                      SELECT * — cost advice (fails open)
 *     transport-validator              reminds when an ABAP write targets a
 *                                      non-local package with no transport
 *                                      request (advisory, never blocks)
 *   PostToolUse
 *     offline-code-analysis            feeds written ABAP through the checker
 *                                      bundle shipped inside this plugin
 *                                      (checker/sapkit-checker.bundle.cjs, D-049);
 *                                      silent no-op when it cannot run
 *   PostToolUseFailure
 *     syntax-checker                   suggests CheckSyntax after an ABAP
 *                                      Create/Update call fails
 *
 * Usage:
 *   node install-hooks.mjs                    → ~/.claude/settings.json
 *   node install-hooks.mjs --project          → <cwd>/.claude/settings.json
 *   node install-hooks.mjs --project <dir>    → <dir>/.claude/settings.json
 *   …add --uninstall to any of those to remove instead of install.
 *
 * Two properties this file exists to hold:
 *
 *   Identity is the script's basename, never its position. A hook counts as
 *   already present when some command string under the same event mentions that
 *   basename, so a re-run rewrites that entry in place rather than appending a
 *   second copy — install twice, get a byte-identical file.
 *
 *   Whatever is not ours stays untouched. Foreign hook groups keep their place
 *   and order inside the event arrays, and keys outside `hooks` (permissions,
 *   env, …) are never interpreted at all — they merely survive the parse and
 *   re-serialize. Uninstall drops only groups whose command names one of our
 *   scripts, which is what lets install → uninstall restore the original bytes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from '../lib/atomic-write.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Where a hook script should be addressed from, in the settings file.
 *
 * The marketplace cache path is preferred because it carries no version segment:
 * a command pointing there keeps resolving after the plugin updates, whereas a
 * path into a versioned install directory dies the moment that directory is
 * replaced. When that cache is absent (running straight from a clone, or a
 * differently named marketplace) fall back to this installer's own folder, which
 * is by definition where the sibling hook scripts are.
 */
function locateHookScript(scriptName) {
  const cached = resolve(
    homedir(),
    '.claude',
    'plugins',
    'marketplaces',
    'agentic-sap',
    'interactive',
    'adapters',
    'claude',
    'hooks',
    scriptName,
  );
  return existsSync(cached) ? cached : resolve(HERE, scriptName);
}

/** The command string Claude Code will run. Backslashes would need escaping inside JSON. */
function commandFor(scriptName) {
  return `node "${locateHookScript(scriptName).replace(/\\/g, '/')}"`;
}

// The switch's payload. `marker` doubles as the script filename and as the
// identity used to find an existing installation, so it is the one field that
// cannot drift. Omitted `event` means PreToolUse. `testHint` is printed after
// installing so the operator can prove the hook actually fires.
const HOOKS = [
  {
    marker: 'block-forbidden-tables.mjs',
    matcher: 'mcp__.*__(GetTableContents|GetSqlQuery)',
    testHint:
      'Test it with a dry-run MCP GetTableContents on BNKA — the call should be denied.',
  },
  {
    marker: 'tier-readonly-guard.mjs',
    matcher:
      'mcp__.*__(Create|Update|Delete|Activate|Patch|Release|Write|RunUnitTest|RuntimeRunProgramWithProfiling|RuntimeRunClassWithProfiling|RuntimeCreateProfilerTraceParameters)',
    testHint:
      'Test it by switching the active profile to a QA/PRD alias (edit .sapkit/active-profile.txt), then calling an Update* tool — the call should be denied.',
  },
  {
    marker: 'prefer-sqlquery-explicit-fields.mjs',
    matcher: 'mcp__.*__(GetTableContents|GetSqlQuery)',
    testHint:
      'Test it with a GetSqlQuery using SELECT * — the call should prompt for confirmation (aggregates like COUNT(*) pass through).',
  },
  {
    marker: 'offline-code-analysis.mjs',
    event: 'PostToolUse',
    matcher: 'Edit|Write|MultiEdit|mcp__.*__(Create|Update)',
    testHint:
      'Test it by writing a .abap file assigning a literal to lv_password — the model should receive offline analysis findings (the analyzer ships with the plugin; silent no-op if the bundle cannot run).',
  },
  {
    marker: 'syntax-checker.mjs',
    event: 'PostToolUseFailure',
    matcher: 'mcp__.*__(Create|Update)',
    testHint:
      'Test it by making an MCP ABAP Create*/Update* call fail (e.g. invalid syntax) — the model should receive a CheckSyntax advisory (PostToolUseFailure).',
  },
  {
    marker: 'transport-validator.mjs',
    matcher: 'mcp__.*__(Create|Update)',
    testHint:
      'Test it with an MCP ABAP CreateClass/UpdateClass call targeting a non-$TMP package and no transport_request — the model should receive a transport reminder (advisory, non-blocking).',
  },
];

const eventOf = (spec) => spec.event || 'PreToolUse';

// ── CLI ───────────────────────────────────────────────────────────────────────
// `--project` may stand alone (meaning the current directory) or be followed by
// a directory. A following token that looks like another flag is not the value.
const argv = process.argv.slice(2);
const removing = argv.includes('--uninstall');
const projectAt = argv.indexOf('--project');
const projectValue = projectAt >= 0 ? argv[projectAt + 1] : undefined;
const projectDir =
  projectValue && !projectValue.startsWith('--') ? projectValue : process.cwd();

const settingsPath =
  projectAt >= 0
    ? resolve(projectDir, '.claude', 'settings.json')
    : resolve(homedir(), '.claude', 'settings.json');

// ── settings.json ─────────────────────────────────────────────────────────────
/** A missing file is an empty object; an unreadable one stops us — guessing would clobber it. */
function readSettings() {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error(
      `[sapkit] ${settingsPath} is not valid JSON (${err.message}) — nothing was changed.`,
    );
    process.exit(1);
  }
}

/** Two-space JSON plus a trailing newline: the shape Claude Code's own writes take. */
function writeSettings(settings) {
  atomicWriteFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

/** Does this hook group carry the named script? That is what "ours" means here. */
function groupCarries(group, scriptName) {
  return Boolean(
    group &&
      Array.isArray(group.hooks) &&
      group.hooks.some(
        (entry) => typeof entry?.command === 'string' && entry.command.includes(scriptName),
      ),
  );
}

/**
 * Put one hook in place: refresh the group already carrying it, or append a new
 * one. Refreshing rewrites the matcher and the command but keeps the group where
 * it sits, so a re-run cannot reorder anybody's hooks.
 */
function upsert(settings, spec) {
  const event = eventOf(spec);
  const command = commandFor(spec.marker);
  settings.hooks[event] ||= [];

  const present = settings.hooks[event].find((group) => groupCarries(group, spec.marker));
  if (present) {
    present.matcher = spec.matcher;
    for (const entry of present.hooks) {
      if (typeof entry?.command === 'string' && entry.command.includes(spec.marker)) {
        entry.command = command;
      }
    }
    return { action: 'updated', command };
  }

  settings.hooks[event].push({
    matcher: spec.matcher,
    hooks: [{ type: 'command', command }],
  });
  return { action: 'installed', command };
}

/** Drop every group carrying this hook. Returns whether anything went away. */
function remove(settings, spec) {
  const event = eventOf(spec);
  const groups = settings.hooks[event];
  if (!Array.isArray(groups)) return false;
  settings.hooks[event] = groups.filter((group) => !groupCarries(group, spec.marker));
  return settings.hooks[event].length !== groups.length;
}

// ── run ───────────────────────────────────────────────────────────────────────
const settings = readSettings();
settings.hooks ||= {};
settings.hooks.PreToolUse ||= [];

if (removing) {
  const gone = HOOKS.filter((spec) => remove(settings, spec));
  if (gone.length === 0) {
    // Not an error, and deliberately no write: an untouched file is the proof
    // that uninstalling something absent costs the user nothing.
    console.log('[sapkit] No SAPKIT hooks are wired here — nothing to remove.');
    process.exit(0);
  }
  for (const spec of gone) console.log(`[sapkit] removed: ${spec.marker}`);
  writeSettings(settings);
  console.log(`[sapkit] updated ${settingsPath}`);
  process.exit(0);
}

const outcomes = HOOKS.map((spec) => ({ spec, ...upsert(settings, spec) }));
writeSettings(settings);

console.log(`[sapkit] updated ${settingsPath}`);
for (const { spec, action, command } of outcomes) {
  console.log('');
  console.log(`  ${action}: ${spec.marker}`);
  console.log(`    matcher: ${spec.matcher}`);
  console.log(`    command: ${command}`);
  console.log(`    ${spec.testHint}`);
}
