#!/usr/bin/env node
/**
 * sc4sap install-hooks — register sc4sap hooks in Claude Code
 * `settings.json`. Installs six hooks:
 *
 *   1. block-forbidden-tables   — row-extraction safety for
 *      `GetTableContents` / `GetSqlQuery`. (PreToolUse)
 *   2. tier-readonly-guard      — tier-based readonly enforcement (QA/PRD)
 *      for mutation + runtime-execution MCP tools. (PreToolUse)
 *   3. prefer-sqlquery-explicit-fields — credit-saving `ask` guard for
 *      full-column reads (`GetTableContents`) / `SELECT *` in `GetSqlQuery`.
 *      (PreToolUse)
 *   4. offline-code-analysis    — warn-only vsp `--offline` 13-rule analysis
 *      of written ABAP source (local .abap files + MCP source_code writes);
 *      silent no-op when vsp is not installed. (PostToolUse, D-049)
 *   5. syntax-checker           — advisory suggestion to run `CheckSyntax`
 *      after an MCP ABAP Create/Update tool call fails.
 *      (PostToolUseFailure)
 *   6. transport-validator      — advisory reminder to attach a transport
 *      request when an MCP ABAP Create/Update tool call targets a
 *      non-local package. (PreToolUse)
 *
 * Usage:
 *   node scripts/install-hooks.mjs              # install into user settings (~/.claude/settings.json)
 *   node scripts/install-hooks.mjs --project    # install into project .claude/settings.json
 *   node scripts/install-hooks.mjs --uninstall  # remove all sc4sap hooks
 *
 * Idempotent: detects each hook by marker (basename) and upserts it. Existing
 * single-hook installs (block-forbidden-tables only) are preserved — any
 * missing hook is appended without disturbing them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a hook script path. Prefers the version-stable marketplace location
 * so upgrades don't leave dead paths in users' settings.json.
 */
function resolveHookScript(basename) {
  const scriptRelative = resolve(__dirname, basename);
  const candidates = [
    resolve(
      homedir(),
      '.claude',
      'plugins',
      'marketplaces',
      'agentic-sap',
      'interactive',
      'adapters',
      'claude',
      'hooks',
      basename,
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return scriptRelative;
}

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
      "Test it by writing a .abap file assigning a literal to lv_password — the model should receive offline analysis findings (requires vsp at ~/.sapkit/bin; silent no-op otherwise).",
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

// Each spec may set `event` (default: 'PreToolUse').
function eventOf(spec) {
  return spec.event || 'PreToolUse';
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const useProject = args.has('--project');
const uninstall = args.has('--uninstall');
const projectIdx = argv.indexOf('--project');
const projectDir =
  projectIdx >= 0 && argv[projectIdx + 1] && !argv[projectIdx + 1].startsWith('--')
    ? argv[projectIdx + 1]
    : process.cwd();

const settingsPath = useProject
  ? resolve(projectDir, '.claude', 'settings.json')
  : resolve(homedir(), '.claude', 'settings.json');

function loadSettings() {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error(`[sc4sap] Could not parse ${settingsPath}: ${err.message}`);
    process.exit(1);
  }
}

function saveSettings(obj) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function groupHasMarker(group, marker) {
  return (
    group &&
    Array.isArray(group.hooks) &&
    group.hooks.some(
      (h) => typeof h?.command === 'string' && h.command.includes(marker),
    )
  );
}

function findGroup(settings, spec) {
  return (settings.hooks[eventOf(spec)] || []).find((g) =>
    groupHasMarker(g, spec.marker),
  );
}

function installOne(settings, spec) {
  const scriptPath = resolveHookScript(spec.marker);
  const command = `node "${scriptPath.replace(/\\/g, '/')}"`;

  settings.hooks[eventOf(spec)] ||= [];
  const existing = findGroup(settings, spec);
  if (existing) {
    existing.matcher = spec.matcher;
    for (const h of existing.hooks) {
      if (typeof h?.command === 'string' && h.command.includes(spec.marker)) {
        h.command = command;
      }
    }
    return { action: 'updated', command };
  }

  settings.hooks[eventOf(spec)].push({
    matcher: spec.matcher,
    hooks: [{ type: 'command', command }],
  });
  return { action: 'installed', command };
}

function uninstallOne(settings, spec) {
  const ev = eventOf(spec);
  if (!Array.isArray(settings.hooks[ev])) return false;
  const before = settings.hooks[ev].length;
  settings.hooks[ev] = settings.hooks[ev].filter(
    (g) => !groupHasMarker(g, spec.marker),
  );
  return before !== settings.hooks[ev].length;
}

const settings = loadSettings();
settings.hooks ||= {};
settings.hooks.PreToolUse ||= [];

if (uninstall) {
  let removed = 0;
  for (const spec of HOOKS) {
    if (uninstallOne(settings, spec)) {
      console.log(`[sc4sap] Removed ${spec.marker} hook.`);
      removed++;
    }
  }
  if (removed === 0) {
    console.log('[sc4sap] No sc4sap hooks found — nothing to remove.');
  } else {
    saveSettings(settings);
    console.log(`[sc4sap] Updated ${settingsPath}`);
  }
  process.exit(0);
}

const results = [];
for (const spec of HOOKS) {
  results.push({ spec, result: installOne(settings, spec) });
}
saveSettings(settings);

console.log(`[sc4sap] Updated ${settingsPath}`);
for (const { spec, result } of results) {
  console.log('');
  console.log(`  ${result.action}: ${spec.marker}`);
  console.log(`    matcher: ${spec.matcher}`);
  console.log(`    command: ${result.command}`);
  console.log(`    ${spec.testHint}`);
}
