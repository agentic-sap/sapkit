#!/usr/bin/env node
/**
 * The switch for the continuity hook — writes `session-continuity.mjs` into one
 * Claude Code settings.json, or takes it back out again.
 *
 * This is a second, separate switch, and the separation is the point.
 * `install-hooks.mjs` one directory up wires the six *safety and analysis*
 * hooks: row extraction, tier guard, transport, syntax, offline analysis.
 * Folding a convenience reminder into that bundle would blur what flipping it
 * means — a user who wants a resume-point pointer at session start has not asked
 * for a client-side layer over SAP writes, and a user who wants that layer has
 * not asked to be reminded about Markdown files. So the two switches are wholly
 * independent in both directions: installing this one wires no safety hook, and
 * uninstalling it removes none.
 *
 * That separation is why this pair sits in its own `continuity/` directory
 * rather than beside the safety hooks. `hooks/` is enumerated as "the six safety
 * hooks and their installer" — by the adapter's README and by the switch test
 * that checks the installer's marker list against the directory listing — and a
 * seventh script dropped in there would quietly falsify both. A subdirectory
 * keeps that reading true without anyone maintaining an exception list.
 *
 * Like the other switch, this one ships unwired. Nothing installs it as a side
 * effect; a person runs it.
 *
 *   SessionStart
 *     session-continuity  points the session at `HANDOFF.md` / `RUN-PLAN.md`
 *                         when this project has sapkit's marked resume point,
 *                         and stays silent otherwise (advisory, never blocks)
 *
 * Usage:
 *   node install-continuity-hook.mjs                 → ~/.claude/settings.json
 *   node install-continuity-hook.mjs --project       → <cwd>/.claude/settings.json
 *   node install-continuity-hook.mjs --project <dir> → <dir>/.claude/settings.json
 *   …add --uninstall to any of those to remove instead of install.
 *
 * The switch contract is the same one `install-hooks.mjs` holds, for the same
 * reasons:
 *
 *   Identity is the script's basename, never its position. A re-run rewrites the
 *   group already carrying that basename instead of appending a second copy, so
 *   installing twice produces a byte-identical file.
 *
 *   Whatever is not ours stays untouched. Foreign hook groups keep their place,
 *   and keys outside `hooks` are never interpreted — they survive the parse and
 *   re-serialize. Uninstall drops only groups whose command names our script.
 *
 *   Uninstall gives back the file that was found, byte for byte. That needs one
 *   step the other switch does not take: the containers this installer had to
 *   create — the `SessionStart` array, and `hooks` itself on a settings file
 *   that had none — are removed again once they are empty. Leaving an empty
 *   `"SessionStart": []` behind would be harmless to Claude Code and still a
 *   broken promise, because "off" would no longer be the state we found.
 *
 *   ⚠ This is a deliberate difference from `install-hooks.mjs`, which always
 *   leaves its `hooks.PreToolUse` array in place. The narrow cost is that a user
 *   who kept an intentionally empty `"SessionStart": []` in their settings
 *   *before* installing will find it gone after uninstalling: this installer
 *   cannot tell a container it created from one that was already there, and it
 *   resolves that ambiguity toward the restore promise. Nothing behaves
 *   differently as a result — an absent event key and an empty one mean the same
 *   thing to Claude Code — but the bytes are not what the user typed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Harness-neutral helper: adapters may depend on the neutral tree, never the
// other way round.
import { atomicWriteFileSync } from '../../../../scripts/lib/atomic-write.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Where the hook script should be addressed from, in the settings file.
 *
 * The marketplace cache path is preferred because it carries no version segment:
 * a command pointing there keeps resolving after the plugin updates, whereas a
 * path into a versioned install directory dies the moment that directory is
 * replaced. When that cache is absent (running straight from a clone, or a
 * differently named marketplace) fall back to this installer's own folder, which
 * is by definition where the sibling hook script is.
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
    'continuity',
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
// cannot drift. `testHint` is printed after installing so the operator can prove
// the hook actually fires.
const HOOKS = [
  {
    marker: 'session-continuity.mjs',
    event: 'SessionStart',
    matcher: 'startup|resume|clear|compact',
    testHint:
      'Test it by putting a HANDOFF.md carrying <!-- sapkit:continuity --> on its first line in a project root, then starting a session there — the model should receive a one-line pointer to it (advisory, never blocks; silent when the marker is absent).',
  },
];

const eventOf = (spec) => spec.event || 'SessionStart';

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
 * Put the hook in place: refresh the group already carrying it, or append a new
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

/**
 * Take back the empty containers, so uninstall restores the bytes that were
 * found. An event array emptied of our group had no other reason to exist, and
 * a `hooks` object left with nothing in it was ours to begin with.
 */
function pruneEmpty(settings) {
  for (const event of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[event]) && settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}

// ── run ───────────────────────────────────────────────────────────────────────
const settings = readSettings();
settings.hooks ||= {};

if (removing) {
  const gone = HOOKS.filter((spec) => remove(settings, spec));
  if (gone.length === 0) {
    // Not an error, and deliberately no write: an untouched file is the proof
    // that uninstalling something absent costs the user nothing.
    console.log('[sapkit] The continuity hook is not wired here — nothing to remove.');
    process.exit(0);
  }
  pruneEmpty(settings);
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
  console.log(`    event:   ${eventOf(spec)}`);
  console.log(`    matcher: ${spec.matcher}`);
  console.log(`    command: ${command}`);
  console.log(`    ${spec.testHint}`);
}
console.log('');
console.log('[sapkit] The six safety hooks are a separate switch — ../install-hooks.mjs (one directory up).');
