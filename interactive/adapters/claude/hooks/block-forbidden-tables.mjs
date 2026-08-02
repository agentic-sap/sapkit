#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Block Forbidden Tables (profile-aware)
 *
 * Intercepts MCP tool calls that would read row data from SAP and checks the
 * target table(s) against `core/policies/data-protection/table_exception.md`, filtered by the
 * active profile in `.sapkit/config.json` (`blocklistProfile`).
 *
 * Profiles (accumulative):
 *   - minimal  — PII + credentials only
 *   - standard — minimal + Protected Business Data
 *   - strict   — everything (default)
 *   - custom   — ignore built-in; use `.sapkit/blocklist-custom.txt` only
 *
 * Any profile additionally honors `.sapkit/blocklist-extend.txt` (one
 * table name / pattern per line) if present.
 *
 * Runtime path rename (D-057, `.sc4sap` -> `.sapkit`): the policy source is
 * unchanged — the config.json still comes from `resolveConfigJsonPath`, whose
 * state definition (including config.json) is untouched. Only the directory
 * name is doubled: `.sapkit` is a candidate wherever `.sc4sap` was one, and the
 * user-list files are read from the SAME generation the resolver picked, so a
 * legacy `strict` can never be replaced by a newer `minimal`.
 *
 * Failure mode: fails CLOSED (denies) on stdin/parse errors, on a blocklist
 * load exception, and when the built-in blocklist resolves to 0 entries for
 * a non-`custom` profile — a missing or broken blocklist must never silently
 * open row-data extraction. This hook is Layer 3 of the three-layer defense:
 * L1 = documented policy (core/policies/data-protection/, read and applied
 * by agents/skills), L2 = the MCP server's own built-in row-extraction guard
 * (authoritative — still enforces if this hook is missing or bypassed),
 * L3 = this PreToolUse hook (fast, harness-level pre-call check).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfigJsonPath, resolveRuntimeDir } from '../lib/profile-resolve.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_DIR = resolve(__dirname, '..', '..', '..', 'core', 'policies', 'data-protection');
// `table_exception.md` is the index/documentation file and
// `data-extraction-policy.md` is the policy document; each blocklist category
// lives in its own `*.md`. Everything else in the directory is parsed and merged.
const EXCLUDED_FILES = new Set(['table_exception.md', 'data-extraction-policy.md']);

const TIER_ORDER = { minimal: 1, standard: 2, strict: 3 };
const DEFAULT_PROFILE = 'strict';

// Walk up from cwd to find a project directory (one that contains a runtime
// dir), then resolve the active-profile.txt pointer through the shared resolver
// so the active profile's config.json is preferred over any legacy
// project-local config.json that may have been left behind.
// `runtimeDir` is the generation the shared resolver selected — the user-list
// files below must come from that same generation.
function resolveProjectConfig() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.sapkit')) || existsSync(join(dir, '.sc4sap'))) {
      const runtimeDir = resolveRuntimeDir(dir);
      const hit = resolveConfigJsonPath(dir);
      if (hit) return { configPath: hit.path, projectDir: dir, runtimeDir, source: hit.source, alias: hit.alias };
      return { configPath: null, projectDir: dir, runtimeDir, source: null, alias: null };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {
    configPath: null,
    projectDir: process.cwd(),
    runtimeDir: resolveRuntimeDir(process.cwd()),
    source: null,
    alias: null,
  };
}

function loadProfile(configPath) {
  if (!configPath) return DEFAULT_PROFILE;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    const p = String(raw.blocklistProfile || '').toLowerCase();
    if (p === 'minimal' || p === 'standard' || p === 'strict' || p === 'custom') return p;
  } catch {
    // fall through
  }
  return DEFAULT_PROFILE;
}

/**
 * Parse markdown blocklist. Each H2 carries a tier (`<!-- tier: X -->`) and
 * optionally an action (`<!-- action: deny | warn -->`, default `deny`).
 */
function listSectionFiles() {
  try {
    return readdirSync(EXCEPTIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.md') && !EXCLUDED_FILES.has(f.toLowerCase()))
      .map((f) => join(EXCEPTIONS_DIR, f))
      .sort();
  } catch {
    return [];
  }
}

function loadBuiltinBlocklist() {
  const exact = new Map(); // name -> meta { category, tier, action, why }
  const patterns = [];     // { re, category, tier, action, why }
  const files = listSectionFiles();
  for (const file of files.filter((p) => existsSync(p))) {
    parseBlocklistText(readFileSync(file, 'utf8'), exact, patterns);
  }
  return { exact, patterns };
}

// Parse one blocklist markdown text. State (category/tier/action) is scoped to
// this call — callers reset at file boundaries so defaults from one section
// file never bleed into the next. Within a file, H1 or H2 headings also reset.
function parseBlocklistText(text, exact, patterns) {
  let currentCategory = 'Protected';
  let currentTier = 'strict';
  let currentAction = 'deny';
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();

    // H1 or H2 heading resets per-section state (per-file H1 is typical when
    // each category lives in its own file; legacy single-file layout used H2).
    if (line.startsWith('# ') || line.startsWith('## ')) {
      currentCategory = line.replace(/^#+\s+/, '').trim();
      currentTier = 'strict';
      currentAction = 'deny';
      continue;
    }

    const tierMatch = line.match(/<!--\s*tier:\s*(minimal|standard|strict)\s*-->/i);
    if (tierMatch) {
      currentTier = tierMatch[1].toLowerCase();
      continue;
    }

    const actionMatch = line.match(/<!--\s*action:\s*(deny|warn)\s*-->/i);
    if (actionMatch) {
      currentAction = actionMatch[1].toLowerCase();
      continue;
    }

    if (!line.startsWith('|')) continue;
    if (/^\|\s*-+/.test(line)) continue;
    if (/^\|\s*(Table|Pattern)\s*\|/i.test(line)) continue;

    const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 1) continue;

    const rawName = cells[0].replace(/`/g, '').replace(/\*\*/g, '').trim();
    if (!rawName) continue;
    const description = cells[1] || '';
    const why = cells[2] || '';
    const meta = { category: currentCategory, tier: currentTier, action: currentAction, why, description };

    if (rawName.includes('*') || rawName.includes('xxx') || rawName.includes('#')) {
      const family = rawName
        .split(/[\s,(]/)[0]
        .replace(/xxx/gi, '[A-Z0-9_]*')
        .replace(/\*/g, '[A-Z0-9_]*')
        .replace(/#/g, '[0-9]');
      try {
        const re = new RegExp(`^${family}$`, 'i');
        patterns.push({ re, ...meta });
      } catch { /* skip */ }
      continue;
    }

    for (const token of rawName.split(/[\/,]/).map((t) => t.trim()).filter(Boolean)) {
      const name = token.toUpperCase();
      if (/^[A-Z0-9_\/]+$/.test(name)) exact.set(name, meta);
    }
  }
}

/** Load a plain-text override file (one table/pattern per line). User
 *  entries default to action=deny. */
function loadTextList(path, { category, tier, action = 'deny' }) {
  if (!existsSync(path)) return { exact: new Map(), patterns: [] };
  const exact = new Map();
  const patterns = [];
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const meta = { category, tier, action, why: 'User-extended blocklist', description: '' };
      if (line.includes('*')) {
        const family = line.replace(/\*/g, '[A-Z0-9_]*');
        try {
          patterns.push({ re: new RegExp(`^${family}$`, 'i'), ...meta });
        } catch { /* skip */ }
      } else {
        exact.set(line.toUpperCase(), meta);
      }
    }
  } catch { /* fail-open */ }
  return { exact, patterns };
}

function filterByProfile(builtin, profile) {
  if (profile === 'custom') return { exact: new Map(), patterns: [] };
  const maxTier = TIER_ORDER[profile] || TIER_ORDER[DEFAULT_PROFILE];
  const exact = new Map();
  const patterns = [];
  for (const [k, meta] of builtin.exact) {
    if ((TIER_ORDER[meta.tier] || 3) <= maxTier) exact.set(k, meta);
  }
  for (const p of builtin.patterns) {
    if ((TIER_ORDER[p.tier] || 3) <= maxTier) patterns.push(p);
  }
  return { exact, patterns };
}

function mergeLists(...lists) {
  const exact = new Map();
  const patterns = [];
  for (const l of lists) {
    for (const [k, v] of l.exact) exact.set(k, v);
    patterns.push(...l.patterns);
  }
  return { exact, patterns };
}

// Strip SQL block (/* ... */) and line (-- ...) comments before scanning for
// table references — a comment hiding a table name (e.g. `FROM /*c*/ KNA1`)
// previously fed the regex a lone `/` and let the real table slip through.
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
}

// Returns { tables: Set<string>, ambiguous: boolean }. `ambiguous` is true
// when a scanned SQL field contains a FROM/JOIN keyword (after comment
// stripping) but no table name could be extracted from it — e.g. a dynamic
// or computed table reference. Callers must treat that as "cannot judge",
// not as "no tables referenced".
function extractTables(toolName, toolInput) {
  const tables = new Set();
  let sqlHasFromOrJoin = false;
  if (!toolInput || typeof toolInput !== 'object') return { tables, ambiguous: false };
  for (const key of ['table', 'table_name', 'tableName', 'tabname', 'target_table']) {
    if (typeof toolInput[key] === 'string') tables.add(toolInput[key].toUpperCase());
  }
  for (const key of ['sql', 'query', 'sql_query', 'statement']) {
    const rawSql = toolInput[key];
    if (typeof rawSql !== 'string') continue;
    const sql = stripSqlComments(rawSql);
    if (/\b(?:FROM|JOIN)\b/i.test(sql)) sqlHasFromOrJoin = true;
    // FROM/JOIN followed by one or more comma-separated table names.
    const re = /\b(?:FROM|JOIN)\s+([A-Z0-9_\/]+(?:\s*,\s*[A-Z0-9_\/]+)*)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      for (const name of m[1].split(',')) {
        const n = name.trim();
        if (n) tables.add(n.toUpperCase());
      }
    }
  }
  return { tables, ambiguous: sqlHasFromOrJoin && tables.size === 0 };
}

// Return every rule a table matches (exact hit first, then each matching
// pattern). Earlier versions returned only the first match, which let a
// built-in `warn` pattern short-circuit a stricter user-extended `deny` —
// the aggregate `deny > warn` decision downstream never saw the deny rule.
// Callers decide precedence via `effectiveHitForTable`.
function matchBlocklistAll(name, { exact, patterns }) {
  const upper = name.toUpperCase();
  const matches = [];
  if (exact.has(upper)) matches.push(exact.get(upper));
  for (const p of patterns) if (p.re.test(upper)) matches.push(p);
  return matches;
}

// Collapse all rules matching `table` into one effective hit using
// deny > warn > first-rule precedence. Returns null when no rule matches.
function effectiveHitForTable(table, blocklist) {
  const matches = matchBlocklistAll(table, blocklist);
  if (matches.length === 0) return null;
  const deny = matches.find((m) => (m.action || 'deny') === 'deny');
  if (deny) return { table, ...deny };
  const warn = matches.find((m) => m.action === 'warn');
  if (warn) return { table, ...warn };
  return { table, ...matches[0] };
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

// Emit a PreToolUse hook decision and terminate. Every decision path in this
// hook (deny/ask) funnels through here so the JSON shape is defined once.
function emitDecision(permissionDecision, permissionDecisionReason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason,
    },
  }));
  process.exit(0);
}

async function main() {
  const raw = await readStdin();
  if (!raw) {
    emitDecision(
      'deny',
      'sc4sap blocklist — empty hook payload, cannot determine the target table(s). ' +
        'Denying by default (this gate fails closed).',
    );
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    emitDecision(
      'deny',
      `sc4sap blocklist — could not parse hook payload (${err.message}), cannot determine the target table(s). ` +
        'Denying by default (this gate fails closed).',
    );
    return;
  }

  const toolName = payload.tool_name || payload.toolName || '';
  const toolInput = payload.tool_input || payload.toolInput || payload.arguments || {};
  if (!/GetTableContents|GetSqlQuery/i.test(toolName)) process.exit(0);

  const { configPath, runtimeDir } = resolveProjectConfig();
  const profile = loadProfile(configPath);

  let builtin;
  try {
    builtin = loadBuiltinBlocklist();
  } catch (err) {
    emitDecision(
      'deny',
      `sc4sap blocklist — unable to load blocklist (${err.message}). Check core/policies/data-protection/. ` +
        'Denying by default (this gate fails closed).',
    );
    return;
  }

  if (profile !== 'custom' && builtin.exact.size === 0 && builtin.patterns.length === 0) {
    emitDecision(
      'deny',
      `sc4sap blocklist (profile: ${profile}) — the built-in blocklist loaded 0 entries. This looks like a ` +
        'missing or broken core/policies/data-protection/ install — check that directory contains the section ' +
        '*.md files. Denying row-data extraction by default until it can be loaded (set blocklistProfile to ' +
        '"custom" in .sapkit/config.json if an empty built-in list is intentional).',
    );
    return;
  }

  const filtered = filterByProfile(builtin, profile);
  // Same generation as the config.json the resolver picked (D-057 §7-3 case 6).
  const extendPath = resolve(runtimeDir, 'blocklist-extend.txt');
  const customPath = resolve(runtimeDir, 'blocklist-custom.txt');
  const extend = loadTextList(extendPath, { category: 'User Extended', tier: 'minimal' });
  const custom = profile === 'custom' ? loadTextList(customPath, { category: 'User Custom', tier: 'minimal' }) : { exact: new Map(), patterns: [] };

  const blocklist = mergeLists(filtered, extend, custom);

  const { tables, ambiguous } = extractTables(toolName, toolInput);
  if (ambiguous) {
    emitDecision(
      'ask',
      'sc4sap blocklist — could not identify the target table(s): the query contains a FROM/JOIN keyword but no ' +
        'table name could be extracted (possibly a dynamic or computed table reference). Human confirmation ' +
        'required before proceeding.',
    );
    return;
  }

  const hits = [];
  for (const t of tables) {
    const h = effectiveHitForTable(t, blocklist);
    if (h) hits.push(h);
  }
  if (hits.length === 0) process.exit(0);

  const denyHits = hits.filter((h) => (h.action || 'deny') === 'deny');
  const warnHits = hits.filter((h) => h.action === 'warn');

  // deny takes precedence over warn.
  if (denyHits.length > 0) {
    const lines = denyHits.map((h) => `  - ${h.table} — ${h.category}: ${h.why || 'protected'}`).join('\n');
    emitDecision(
      'deny',
      `sc4sap blocklist (profile: ${profile}) — row extraction denied:\n${lines}\n\n` +
        `See core/policies/data-protection/ (table_exception.md index, data-extraction-policy.md) for allowed alternatives ` +
        `(released CDS views, anonymized test data, COUNT/SUM aggregates, or documented one-off approval).\n` +
        `To change scope, edit blocklistProfile in .sapkit/config.json (see core/procedures/troubleshooting.md).`,
    );
    return;
  }

  // warn category: require explicit user confirmation via permissionDecision="ask".
  const lines = warnHits.map((h) => `  - ${h.table} — ${h.category}: ${h.why || 'sensitive'}`).join('\n');
  emitDecision(
    'ask',
    `sc4sap blocklist (profile: ${profile}) — sensitive table access requires confirmation:\n${lines}\n\n` +
      `These are "Protected Business Data" tables. Default posture is blocked until the user authorizes the request ` +
      `(scope, anonymization, intended use). Approve only if the user has confirmed scope and party-ID handling. ` +
      `Safer alternatives: released CDS views, anonymized test data, COUNT/SUM aggregates.`,
  );
}

main();
