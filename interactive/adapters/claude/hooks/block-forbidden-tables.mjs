#!/usr/bin/env node
/**
 * PreToolUse gate — row-data blocklist for SAP table reads (profile-aware).
 *
 * Watches the two MCP tools that can pull actual rows out of SAP
 * (`GetTableContents`, `GetSqlQuery`), works out which table(s) the call would
 * touch, and matches them against the category files under
 * `core/policies/data-protection/`. A match answers `deny` (hard block) or
 * `ask` (human confirmation); anything unmatched passes in silence.
 *
 * Scope profiles, each one a superset of the one before it:
 *   minimal   PII and credential tables only
 *   standard  minimal, plus Protected Business Data
 *   strict    every category — and the fallback whenever nothing says otherwise
 *   custom    the built-in categories are ignored entirely and
 *             `.sapkit/blocklist-custom.txt` is the whole policy
 * Every profile additionally picks up `.sapkit/blocklist-extend.txt` when it
 * exists — one table name or wildcard per line — and those entries always deny.
 *
 * Where those files are read from (D-057): the profile comes out of whichever
 * config.json the shared resolver selects, and the two user lists are read from
 * the very same runtime directory that resolver landed on. Taking the profile
 * from one generation of runtime directory and the user lists from another would
 * split a single policy across two sources, so the runtime directory is
 * resolved once here and reused for both.
 *
 * Why this gate fails CLOSED. An empty payload, unparsable JSON, an exception
 * while loading the categories, and a built-in list that resolves to zero
 * entries under a non-`custom` profile all answer `deny`. Each of those states
 * means "the target table is unknown, or the policy could not be read", and the
 * one outcome to refuse is a broken install reading as permission to extract
 * rows.
 *
 * Position in the three-layer defense — this file is the outermost layer, and
 * the weakest of the three on its own:
 *   L1  the written policy under `core/policies/data-protection/`, which agents
 *       and skills read and apply before any tool call is made.
 *   L2  the MCP server's own row-extraction guard. This layer is the
 *       authoritative one: it keeps refusing even when this hook is
 *       uninstalled, misconfigured, or skipped altogether.
 *   L3  this PreToolUse hook — a cheap harness-level check that stops the call
 *       before it ever reaches the server.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfigJsonPath, resolveRuntimeDir } from '../lib/profile-resolve.mjs';

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const CATEGORY_DIR = resolve(HOOK_DIR, '..', '..', '..', 'core', 'policies', 'data-protection');

// Two files in that directory are prose rather than data: `table_exception.md`
// is the index over the category files, and `data-extraction-policy.md` states
// the policy itself. Parsing them would harvest table names out of their
// examples. Every other `*.md` there is a category file and is merged in.
const NON_CATEGORY_FILES = new Set(['table_exception.md', 'data-extraction-policy.md']);

// Profiles accumulate, so a numeric rank answers "does this entry belong to the
// active profile?" — an entry is kept when its rank is at or below the active
// one's. `custom` is deliberately absent from this table: it is not a point on
// the scale but a switch that discards the built-in list wholesale.
const PROFILE_RANK = { minimal: 1, standard: 2, strict: 3 };
const FALLBACK_PROFILE = 'strict';
const STRICTEST_RANK = PROFILE_RANK[FALLBACK_PROFILE];

const IN_SCOPE_TOOL = /GetTableContents|GetSqlQuery/i;
const TABLE_FIELDS = ['table', 'table_name', 'tableName', 'tabname', 'target_table'];
const SQL_FIELDS = ['sql', 'query', 'sql_query', 'statement'];

const FAILS_CLOSED = 'Denying by default (this gate fails closed).';
const ALTERNATIVES = 'Safer alternatives: released CDS views, anonymized test data, COUNT/SUM aggregates.';

const emptyCatalog = () => ({ exact: new Map(), patterns: [] });

// ── Runtime state ───────────────────────────────────────────────────────────

// Locate the project whose runtime directory governs this call: walk up from
// the launch directory until a `.sapkit` appears, then hand that project to the
// shared resolver. Going through the resolver rather than reading the
// `.sapkit/config.json` just found is what lets the active profile's config win
// over a project-local one left behind by an older layout.
//
// `runtimeDir` comes back alongside because the user lists have to be read out
// of the directory the resolver actually chose — see the D-057 note above.
function locateRuntimeState() {
  let dir = process.cwd();
  for (let hop = 0; hop < 8; hop++) {
    if (existsSync(join(dir, '.sapkit'))) {
      const config = resolveConfigJsonPath(dir);
      return { configPath: config ? config.path : null, runtimeDir: resolveRuntimeDir(dir) };
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const cwd = process.cwd();
  return { configPath: null, runtimeDir: resolveRuntimeDir(cwd) };
}

// The active profile name, or the strict fallback when the config is absent,
// unreadable, or names something unrecognized. An unknown value falls back
// instead of throwing — a typo in config.json must never widen the blocklist.
function readProfile(configPath) {
  if (!configPath) return FALLBACK_PROFILE;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const name = String(config.blocklistProfile || '').toLowerCase();
    if (name === 'minimal' || name === 'standard' || name === 'strict' || name === 'custom') return name;
  } catch {
    // Missing or malformed config — fall through to the fallback below.
  }
  return FALLBACK_PROFILE;
}

// ── Built-in categories (markdown) ──────────────────────────────────────────

function categoryFiles() {
  try {
    return readdirSync(CATEGORY_DIR)
      .filter((name) => name.toLowerCase().endsWith('.md') && !NON_CATEGORY_FILES.has(name.toLowerCase()))
      .map((name) => join(CATEGORY_DIR, name))
      .sort();
  } catch {
    return [];
  }
}

// Merge every category file into one catalog. Each file is parsed on its own
// call so that the tier/action defaults declared inside one file can never leak
// into the next one.
function readBuiltinCatalog() {
  const catalog = emptyCatalog();
  for (const file of categoryFiles()) {
    if (!existsSync(file)) continue;
    absorbCategoryFile(readFileSync(file, 'utf8'), catalog);
  }
  return catalog;
}

// Split one markdown table row into its cells. The leading and trailing pipes
// produce empty edge fields and both are dropped, so a row that forgot its
// closing pipe simply loses its last cell — harmless, because column 0 (the
// name) is the only column that has to be there.
function rowCells(line) {
  return line.split('|').map((cell) => cell.trim()).slice(1, -1);
}

// Compile a wildcard name into an anchored regex, or null when it will not
// compile. The substitutions run in exactly this order on purpose, and that
// order is part of the frozen behavior: `xxx` expands first, then the `*` pass
// rewrites the star inside the character class it just inserted — so an `xxx`
// segment ends up matching one-or-more characters while a literal `*` matches
// zero-or-more.
//
// Only the first whitespace/comma/paren-delimited token is used. That is what
// keeps a parenthetical gloss such as `PA* (all PA0xxx infotypes)` out of the
// pattern, and it is also a known gap: a cell listing several families
// (`PA9* / PB9* / PD9*`) registers only the first one. Frozen as recorded.
function compileWildcard(rawName) {
  const family = rawName
    .split(/[\s,(]/)[0]
    .replace(/xxx/gi, '[A-Z0-9_]*')
    .replace(/\*/g, '[A-Z0-9_]*')
    .replace(/#/g, '[0-9]');
  try {
    return new RegExp(`^${family}$`, 'i');
  } catch {
    return null;
  }
}

// One cell may list several plain table names separated by `/` or `,`
// (`VBAK / VBAP`), and each becomes its own exact entry. A token holding any
// character outside the SAP name alphabet is skipped rather than guessed at.
function exactNamesIn(rawName) {
  return rawName
    .split(/[\/,]/)
    .map((token) => token.trim().toUpperCase())
    .filter((name) => /^[A-Z0-9_\/]+$/.test(name));
}

// Parse one category file into `catalog`. The heading/directive state below
// lives only inside this call, so a file that omits its `<!-- tier: -->`
// comment gets these defaults rather than whatever the previous file declared.
//
// Layout rules, all frozen:
//  · An H1 or H2 heading names the category and resets tier and action to the
//    defaults. H3 does NOT reset — a `### Related Standard CDS Views`
//    subsection is meant to inherit its parent category's tier and action,
//    because such a view is just another door onto the same rows.
//  · `<!-- tier: -->` and `<!-- action: -->` comments apply from their line on.
//  · Table rows carry the entries. Separator rows are skipped, as is a header
//    row whose first column is literally `Table` or `Pattern`. Note that a
//    CDS-view subsection heads its table with `View` instead, which does not
//    match the skip, so that header row is registered as an entry of its own.
//    Recorded behavior, harmless, and frozen.
function absorbCategoryFile(text, catalog) {
  let category = 'Protected';
  let tier = 'strict';
  let action = 'deny';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith('# ') || line.startsWith('## ')) {
      category = line.replace(/^#+\s+/, '').trim();
      tier = 'strict';
      action = 'deny';
      continue;
    }

    const tierTag = line.match(/<!--\s*tier:\s*(minimal|standard|strict)\s*-->/i);
    if (tierTag) {
      tier = tierTag[1].toLowerCase();
      continue;
    }

    const actionTag = line.match(/<!--\s*action:\s*(deny|warn)\s*-->/i);
    if (actionTag) {
      action = actionTag[1].toLowerCase();
      continue;
    }

    if (!line.startsWith('|')) continue;
    if (/^\|\s*-+/.test(line)) continue;
    if (/^\|\s*(Table|Pattern)\s*\|/i.test(line)) continue;

    const cells = rowCells(line);
    if (cells.length < 1) continue;

    // Code ticks and bold markers are presentation; strip them before deciding
    // whether what remains is a wildcard.
    const rawName = cells[0].replace(/`/g, '').replace(/\*\*/g, '').trim();
    if (!rawName) continue;

    const rule = { category, tier, action, description: cells[1] || '', why: cells[2] || '' };

    // Bold markers are gone by now, so a surviving `*` really is a wildcard.
    // `xxx` is detected lowercase-only here while `compileWildcard` expands it
    // case-insensitively — an asymmetry that is part of the frozen behavior.
    if (rawName.includes('*') || rawName.includes('xxx') || rawName.includes('#')) {
      const re = compileWildcard(rawName);
      if (re) catalog.patterns.push({ re, ...rule });
      continue;
    }

    for (const name of exactNamesIn(rawName)) catalog.exact.set(name, rule);
  }
}

// ── User-maintained lists (plain text) ──────────────────────────────────────

// Read one user list: one table name or wildcard per line, `#` opens a comment,
// blank lines ignored. These entries deny — a name a human wrote down by hand
// is a deliberate block, not a suggestion.
//
// Because `#` opens a comment here, the "single digit" `#` wildcard of the
// markdown files is not available in these files; `*` is. Frozen as recorded.
function readUserList(path, { category, tier }) {
  const catalog = emptyCatalog();
  if (!existsSync(path)) return catalog;
  try {
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const rule = { category, tier, action: 'deny', why: 'User-extended blocklist', description: '' };
      if (line.includes('*')) {
        try {
          catalog.patterns.push({ re: new RegExp(`^${line.replace(/\*/g, '[A-Z0-9_]*')}$`, 'i'), ...rule });
        } catch {
          // An entry that will not compile is dropped; the rest of the list stands.
        }
      } else {
        catalog.exact.set(line.toUpperCase(), rule);
      }
    }
  } catch {
    // A list that cannot be read contributes nothing. The built-in categories
    // still apply, and the zero-entry check in `main` still covers a broken
    // install, so this read does not have to be the thing that fails closed.
  }
  return catalog;
}

// ── Catalog assembly ────────────────────────────────────────────────────────

// Keep only the entries the active profile covers. `custom` keeps none of them:
// it means "the built-in categories do not apply to this project at all", and
// the user's own list is merged in afterwards as the entire policy. An entry
// carrying an unrecognized tier is treated as strict, i.e. kept only at the
// widest profile.
function restrictToProfile(catalog, profile) {
  if (profile === 'custom') return emptyCatalog();
  const ceiling = PROFILE_RANK[profile] ?? STRICTEST_RANK;
  const covered = (rule) => (PROFILE_RANK[rule.tier] ?? STRICTEST_RANK) <= ceiling;
  const kept = emptyCatalog();
  for (const [name, rule] of catalog.exact) if (covered(rule)) kept.exact.set(name, rule);
  for (const rule of catalog.patterns) if (covered(rule)) kept.patterns.push(rule);
  return kept;
}

// Later catalogs overwrite earlier ones on exact names and append their
// patterns, so the argument order at the call site is the precedence order:
// built-in categories first, user lists after them.
function mergeCatalogs(...catalogs) {
  const merged = emptyCatalog();
  for (const catalog of catalogs) {
    for (const [name, rule] of catalog.exact) merged.exact.set(name, rule);
    merged.patterns.push(...catalog.patterns);
  }
  return merged;
}

// ── Reading the call ────────────────────────────────────────────────────────

// Table-name extraction runs on comment-free SQL. A comment wedged between the
// keyword and the name — `FROM /* anything */ KNA1` — used to hand the scanner
// the `/` that opened the comment and let the real table through unexamined.
function withoutSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
}

// Which tables would this call read? Named parameters are taken as given; SQL
// arguments are scanned for the names following FROM/JOIN, comma-separated
// lists included. Aggregates get no exemption here: `COUNT(*) FROM PA0008`
// still names PA0008, and naming it is what this function reports.
//
// `ambiguous` covers the one case a set of names cannot express: the SQL does
// contain a FROM or JOIN, yet no name could be lifted out of it — a dynamic or
// computed reference such as `FROM (lv_tabname)`. That state means "cannot
// judge", not "reads nothing", and callers must not read it as a pass.
function referencedTables(toolInput) {
  const tables = new Set();
  if (!toolInput || typeof toolInput !== 'object') return { tables, ambiguous: false };

  for (const field of TABLE_FIELDS) {
    if (typeof toolInput[field] === 'string') tables.add(toolInput[field].toUpperCase());
  }

  let sawFromOrJoin = false;
  for (const field of SQL_FIELDS) {
    if (typeof toolInput[field] !== 'string') continue;
    const sql = withoutSqlComments(toolInput[field]);
    if (/\b(?:FROM|JOIN)\b/i.test(sql)) sawFromOrJoin = true;
    const scan = /\b(?:FROM|JOIN)\s+([A-Z0-9_\/]+(?:\s*,\s*[A-Z0-9_\/]+)*)/gi;
    let found;
    while ((found = scan.exec(sql)) !== null) {
      for (const listed of found[1].split(',')) {
        const table = listed.trim().toUpperCase();
        if (table) tables.add(table);
      }
    }
  }

  return { tables, ambiguous: sawFromOrJoin && tables.size === 0 };
}

// Collapse every rule matching one table into a single verdict. Precedence is
// deny over warn, and among equals the exact-name entry before the patterns in
// catalog order.
//
// The scan is exhaustive on purpose. Stopping at the first match would let a
// built-in `warn` pattern shadow a stricter `deny` the user added by hand — the
// aggregate decision further down would then never see that deny at all.
function verdictFor(table, catalog) {
  const name = table.toUpperCase();
  const candidates = [];
  if (catalog.exact.has(name)) candidates.push(catalog.exact.get(name));
  for (const pattern of catalog.patterns) if (pattern.re.test(name)) candidates.push(pattern);
  if (candidates.length === 0) return null;

  const denying = candidates.find((rule) => (rule.action || 'deny') === 'deny');
  const flagging = candidates.find((rule) => rule.action === 'warn');
  return { table, ...(denying ?? flagging ?? candidates[0]) };
}

// ── Wire protocol ───────────────────────────────────────────────────────────

// Collect the PreToolUse payload from stdin. The timer is a liveness guard: if
// the stream never closes, answer with whatever arrived, and an empty result
// then lands on the fail-closed branch in `main`.
function readPayloadText() {
  return new Promise((finish) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (text += chunk));
    process.stdin.on('end', () => finish(text));
    process.stdin.on('error', () => finish(text));
    setTimeout(() => finish(text), 1500).unref?.();
  });
}

// The single exit for every judgement this hook makes, so the wire shape is
// written once. The other possible answer is silence — no output and exit 0,
// spelled `process.exit(0)` at the call sites that have nothing to say.
function respond(permissionDecision, permissionDecisionReason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason,
    },
  }));
  process.exit(0);
}

// One line per offending table, in the shape the refusal template of
// `data-extraction-policy.md` expects.
function describeHits(verdicts, fallbackWhy) {
  return verdicts.map((v) => `  - ${v.table} — ${v.category}: ${v.why || fallbackWhy}`).join('\n');
}

// ── Decision flow ───────────────────────────────────────────────────────────

async function main() {
  const rawPayload = await readPayloadText();
  if (!rawPayload) {
    return respond(
      'deny',
      `sc4sap blocklist — empty hook payload, cannot determine the target table(s). ${FAILS_CLOSED}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch (err) {
    return respond(
      'deny',
      `sc4sap blocklist — could not parse hook payload (${err.message}), cannot determine the ` +
        `target table(s). ${FAILS_CLOSED}`,
    );
  }

  const toolName = payload.tool_name || payload.toolName || '';
  const toolInput = payload.tool_input || payload.toolInput || payload.arguments || {};
  // Substring rather than equality: any server exposing a tool under one of
  // these names is pulling rows, and pulling rows is what this gate judges.
  if (!IN_SCOPE_TOOL.test(toolName)) process.exit(0);

  const { configPath, runtimeDir } = locateRuntimeState();
  const profile = readProfile(configPath);

  let builtin;
  try {
    builtin = readBuiltinCatalog();
  } catch (err) {
    return respond(
      'deny',
      `sc4sap blocklist — unable to load blocklist (${err.message}). ` +
        `Check core/policies/data-protection/. ${FAILS_CLOSED}`,
    );
  }

  // Zero built-in entries under a non-`custom` profile means the policy could
  // not be read, not that nothing is protected — the two are indistinguishable
  // from here, so the gate takes the safe reading.
  if (profile !== 'custom' && builtin.exact.size === 0 && builtin.patterns.length === 0) {
    return respond(
      'deny',
      `sc4sap blocklist (profile: ${profile}) — the built-in blocklist parsed to 0 entries, which points ` +
        `at a missing or damaged install rather than at an empty policy. Verify that ` +
        `core/policies/data-protection/ still holds its category *.md files. Row-data extraction stays ` +
        `denied until that list loads; if an empty built-in list is genuinely intended here, set ` +
        `blocklistProfile to "custom" in .sapkit/config.json.`,
    );
  }

  // Same generation of runtime directory as the config.json the resolver
  // picked (D-057 §7-3 case 6). The extend list bypasses profile filtering by
  // design: a hand-written entry applies at every profile.
  const catalog = mergeCatalogs(
    restrictToProfile(builtin, profile),
    readUserList(resolve(runtimeDir, 'blocklist-extend.txt'), { category: 'User Extended', tier: 'minimal' }),
    profile === 'custom'
      ? readUserList(resolve(runtimeDir, 'blocklist-custom.txt'), { category: 'User Custom', tier: 'minimal' })
      : emptyCatalog(),
  );

  const { tables, ambiguous } = referencedTables(toolInput);
  if (ambiguous) {
    return respond(
      'ask',
      'sc4sap blocklist — could not identify the target table(s): the query holds a FROM or JOIN but no ' +
        'name could be read out of it, which usually means a dynamic or computed table reference. A table ' +
        'that cannot be named cannot be checked against the blocklist, so this needs human confirmation ' +
        'before it runs.',
    );
  }

  const verdicts = [];
  for (const table of tables) {
    const verdict = verdictFor(table, catalog);
    if (verdict) verdicts.push(verdict);
  }
  if (verdicts.length === 0) process.exit(0);

  const denied = verdicts.filter((v) => (v.action || 'deny') === 'deny');
  const flagged = verdicts.filter((v) => v.action === 'warn');

  // A single denied table settles the whole call — deny outranks warn.
  if (denied.length > 0) {
    return respond(
      'deny',
      `sc4sap blocklist (profile: ${profile}) — row extraction denied:\n` +
        `${describeHits(denied, 'protected')}\n\n` +
        `See core/policies/data-protection/ — table_exception.md indexes the categories and ` +
        `data-extraction-policy.md lists what may be used instead (released CDS views, anonymized test ` +
        `data, COUNT/SUM aggregates, or a documented one-off approval).\n` +
        `To widen or narrow the scope, change blocklistProfile in .sapkit/config.json ` +
        `(see core/procedures/troubleshooting.md).`,
    );
  }

  // Warn-only: hand the call to the user instead of settling it here.
  return respond(
    'ask',
    `sc4sap blocklist (profile: ${profile}) — sensitive table access requires confirmation:\n` +
      `${describeHits(flagged, 'sensitive')}\n\n` +
      `These belong to the "Protected Business Data" set, where the default posture stays blocked until ` +
      `the user authorizes the specific request — its scope, its anonymization, and how party IDs are ` +
      `handled. Approve only once the user has confirmed those. ${ALTERNATIVES}`,
  );
}

main();
