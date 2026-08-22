#!/usr/bin/env node
/**
 * SPRO customizing cache builder — sapkit `tools/extract/`
 *
 * Each shipped module carries a `core/knowledge/modules/{MODULE}/spro.md` that
 * names the IMG tables behind its configuration. This script reads those lists,
 * pulls each table through the bundled MCP server, and leaves behind the cache
 * that [spro-lookup](../../core/procedures/spro-lookup.md) Step 1 reads:
 *
 *   <project>/.sapkit/spro-config.json           two or more modules, or `all`
 *   <project>/.sapkit/spro-config-{MODULE}.json  exactly one module
 *
 * ══════════════════ APPROVAL GATE — read this before running ═══════════════
 * Every table here is pulled with `GetSqlQuery`, which makes the whole run a
 * **P2 row-data extraction** (AGENTS.md). Gate B of
 * [approval-gates](../../core/policies/approval-gates.md) covers each call.
 *
 *   • **A human runs this command.** Not an agent on the user's behalf, not a
 *     subagent it was handed to, and never as a way of collecting in one batch
 *     what would otherwise need approval call by call. Gate B(c) — "subagent
 *     and batch use are prohibited" — has no exception path.
 *   • `--dry-run` is the disclosure the gate asks for: the modules, every table
 *     that would be read, the row cap and the destination file, **with nothing
 *     started and nothing connected**. Run it first. Running the same command
 *     without `--dry-run` is the human's act of approval for that exact scope.
 *   • Scope is **IMG / Customizing configuration** and nothing else — the
 *     tables the shipped `spro.md` files name. `acknowledge_risk` is never set
 *     here, so the server-side blocklist floor keeps the last word: a `deny`
 *     table is refused and an `ask` table fails closed. Refusals are collected
 *     in the output `errors[]` and are never written into the cache.
 *   • [data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md)
 *     remains authoritative. Customizing being allowed here says nothing about
 *     transactional or personal data by any other route.
 *
 * Usage — run from the project root, the directory holding `.sapkit/`:
 *   node tools/extract/extract-spro.mjs --dry-run SD MM
 *   node tools/extract/extract-spro.mjs SD MM FI CO
 *   node tools/extract/extract-spro.mjs all
 *
 * ══════════════════ Runtime directory (D-057) ══════════════════════════════
 * The cache is written beside the runtime directory this project already keeps,
 * or names the `.sapkit` creation site when it keeps none (R-NEW).
 * `--resolve-only` prints that decision as JSON without connecting to anything.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMcp } from './lib/mcp-stdio.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KNOWLEDGE_DIR = resolve(PLUGIN_ROOT, 'core', 'knowledge', 'modules');
const PROJECT_DIR = process.cwd();

const NEW_DIR = '.sapkit';
const ROW_CAP = 9999;
const BATCH_SIZE = 5;

const argv = process.argv.slice(2);
const RESOLVE_ONLY = argv.includes('--resolve-only');
const DRY_RUN = argv.includes('--dry-run');

// ── diagnostics ─────────────────────────────────────────────────────────────
// Anything worth telling the operator is recorded once and, outside
// `--resolve-only`, echoed to stderr as it happens. Under `--resolve-only` the
// notes travel inside the JSON instead, so stderr stays clean for the caller
// parsing stdout.
const REASONS = [];

function note(code, message) {
  if (REASONS.some((reason) => reason.code === code)) return;
  REASONS.push({ code, message });
  if (!RESOLVE_ONLY) console.error(`[spro] ${code}: ${message}`);
}

// ── runtime directory ───────────────────────────────────────────────────────
// This tool does not walk up. The cache belongs to the project the operator is
// standing in, and inheriting a parent's runtime directory would silently write
// one project's customizing into another's.
function pickRuntimeDir(dir) {
  const candidate = join(dir, NEW_DIR);
  return existsSync(candidate) ? candidate : null;
}

// R-E where state already exists, R-NEW where it does not.
const RUNTIME_DIR = pickRuntimeDir(PROJECT_DIR) ?? join(PROJECT_DIR, NEW_DIR);
const OUTPUT_DIR = RUNTIME_DIR;

const USAGE = `Usage: node tools/extract/extract-spro.mjs [--dry-run] <MODULE...|all>

  --dry-run   list the modules, tables, row cap and output path, then stop
              (no MCP server, no SAP connection) — the scope disclosure the
              row-data approval gate requires
  --resolve-only  print the resolved runtime paths as JSON and exit. No MCP
              server, no SAP connection, no module list needed — the offline
              seam the runtime-path conformance suite calls.
  MODULE...   module codes with a shipped spro.md (SD MM FI CO …)
  all         every module directory under core/knowledge/modules/

Run from the project root (the directory holding .sapkit/).
Reading rows from SAP is a P2 action: you are the approver, and an agent must
not run this on your behalf. See core/policies/approval-gates.md (Gate B).`;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

// ── profile home and alias ──────────────────────────────────────────────────

// The alias pointer, when the project keeps one.
function readActiveAlias() {
  try {
    const alias = readFileSync(join(RUNTIME_DIR, 'active-profile.txt'), 'utf8').trim();
    return alias || null;
  } catch {
    return null;
  }
}

// R-ENV. A `SAPKIT_HOME_DIR` that was pinned and then went missing stops the
// run outright. Falling back to the default home would read a profile the
// operator did not select, and this tool's whole output is derived from it.
function sapkitHome(alias = null) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!existsSync(explicit)) {
      console.error(
        `[spro] ENV_INVALID: SAPKIT_HOME_DIR points at a path that does not exist (${explicit}). ` +
          'Refusing to fall back to ~/.sapkit — fix or unset it.'
      );
      process.exit(2);
    }
    return explicit;
  }
  const defaultHome = join(homedir(), NEW_DIR);
  if (alias && !existsSync(join(defaultHome, 'profiles', alias))) {
    note('PROFILE_NOT_FOUND', `profile "${alias}" was not found under ${defaultHome}.`);
  }
  return defaultHome;
}

function profileDir(alias) {
  return join(sapkitHome(alias), 'profiles', alias);
}

// ── active SAP version ──────────────────────────────────────────────────────
// Modules whose spro.md carries a System column (MM, for one) list rows that
// only exist on ECC or only on S/4. Knowing the version lets those rows be
// dropped instead of queried and failing.

function jsonField(path, field) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))?.[field];
    return value ? String(value) : null;
  } catch {
    return null;
  }
}

function dotenvField(path, key) {
  try {
    const hit = readFileSync(path, 'utf8').match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'));
    return hit ? hit[1].replace(/^["']|["']$/g, '').trim() : null;
  } catch {
    return null;
  }
}

// Everything S/4-shaped collapses to S4 and everything ECC-shaped to ECC;
// anything else is passed through uppercased so an unfamiliar label can still
// match a spro.md cell literally.
function normalizeVersion(raw) {
  const value = String(raw ?? '').trim().toUpperCase();
  if (!value) return null;
  if (value.startsWith('S4') || value.startsWith('S/4')) return 'S4';
  if (value.startsWith('ECC')) return 'ECC';
  return value;
}

// Most specific source first: an explicit env var, then the active profile's
// config, then the project's, then the two sap.env files that older layouts
// kept the version in.
function resolveSapVersion() {
  const alias = readActiveAlias();
  const candidates = [];

  if (process.env.SAP_VERSION) {
    candidates.push({ value: process.env.SAP_VERSION, source: 'SAP_VERSION env' });
  }
  if (alias) {
    candidates.push({
      path: join(profileDir(alias), 'config.json'),
      field: 'sapVersion',
      source: `profile config.json (${alias})`,
    });
  }
  candidates.push({ path: join(RUNTIME_DIR, 'config.json'), field: 'sapVersion', source: 'project config.json' });
  if (alias) {
    candidates.push({
      path: join(profileDir(alias), 'sap.env'),
      key: 'SAP_VERSION',
      source: `profile sap.env (${alias})`,
    });
  }
  candidates.push({ path: join(RUNTIME_DIR, 'sap.env'), key: 'SAP_VERSION', source: 'project sap.env (legacy)' });

  for (const candidate of candidates) {
    const raw =
      candidate.value ??
      (candidate.field ? jsonField(candidate.path, candidate.field) : dotenvField(candidate.path, candidate.key));
    const version = normalizeVersion(raw);
    if (version) return { version, source: candidate.source };
  }
  return { version: null, source: null };
}

// ── offline path-resolution seam (D-057 §7-3) ───────────────────────────────
// Path arithmetic only: no module list, no MCP server, no SAP connection. The
// keys are evaluated top to bottom, so `reasons` reports what resolving
// `profile_dir` and `sap_version` just discovered.
if (RESOLVE_ONLY) {
  const aliasNow = readActiveAlias();
  console.log(
    JSON.stringify(
      {
        tool: 'extract-spro',
        cwd: PROJECT_DIR,
        runtime_dir: RUNTIME_DIR,
        runtime_generation: RUNTIME_DIR.endsWith(NEW_DIR) ? 'sapkit' : 'sc4sap',
        runtime_dir_exists: existsSync(RUNTIME_DIR),
        output_dir: OUTPUT_DIR,
        output_file_merged: resolve(OUTPUT_DIR, 'spro-config.json'),
        alias: aliasNow,
        profile_dir: aliasNow ? profileDir(aliasNow) : null,
        sap_version: resolveSapVersion(),
        reasons: REASONS,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ── module selection ────────────────────────────────────────────────────────
// Scope has to be stated. A bare invocation used to mean `all`, which is
// exactly the silent widening Gate B exists to prevent.
const positional = argv.filter((arg) => !arg.startsWith('-'));
if (positional.length === 0) {
  console.error(USAGE);
  process.exit(2);
}

const selectedModules =
  positional[0] === 'all'
    ? readdirSync(KNOWLEDGE_DIR).filter((entry) => {
        try {
          return statSync(resolve(KNOWLEDGE_DIR, entry)).isDirectory();
        } catch {
          return false;
        }
      })
    : positional;

// One module gets its own file; several share the merged one.
function getOutputFile() {
  return selectedModules.length === 1
    ? resolve(OUTPUT_DIR, `spro-config-${selectedModules[0]}.json`)
    : resolve(OUTPUT_DIR, 'spro-config.json');
}

console.log(`[spro] Modules: ${selectedModules.join(', ')}`);

const { version: SAP_VERSION, source: SAP_VERSION_SOURCE } = resolveSapVersion();
console.log(
  `[spro] SAP version: ${SAP_VERSION ? `${SAP_VERSION} (${SAP_VERSION_SOURCE})` : '(unresolved — no System-column filtering)'}`
);

// ── spro.md parsing ─────────────────────────────────────────────────────────

// A DDIC table name: uppercase initial, then letters, digits and underscores,
// 2 to 30 characters. Names are interpolated into a SQL string, so anything not
// matching this is refused before it can get near `GetSqlQuery` — a malformed
// or hostile entry in a module's spro.md stops right here.
const TABLE_NAME_RE = /^[A-Z][A-Z0-9_]{1,29}$/;

function isValidTableName(name) {
  return typeof name === 'string' && TABLE_NAME_RE.test(name);
}

// Does a System cell apply to the system being read? A row survives when it
// names no system, names both, or names the active one — and also when the
// version could not be resolved at all, since guessing would drop real rows.
function systemMatches(systemCell) {
  if (!systemCell) return true;
  const tokens = systemCell
    .split(/[/,]/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const hasEcc = tokens.includes('ECC');
  const hasS4 = tokens.includes('S4') || tokens.includes('S4HANA') || tokens.includes('S/4');
  if (hasEcc && hasS4) return true;
  if (!SAP_VERSION) return true;
  if (SAP_VERSION === 'ECC') return hasEcc;
  if (SAP_VERSION === 'S4' || SAP_VERSION === 'S4HANA') return hasS4;
  return tokens.includes(SAP_VERSION);
}

// Column roles come from the most recent header row rather than fixed indices,
// because the shipped files use two layouts — 3 columns (Config | Table/View |
// Description) and 4 (Config | System | Table/View | Description). Assuming
// "column 2 holds the table" once harvested 'System' and 'ECC' as table names
// from MM's 4-column tables.
function parseTablesFromSproMd(modulePath) {
  const tables = new Map(); // table name → description

  let tableIdx = 1;
  let systemIdx = -1;
  let descIdx = 2;

  for (const rawLine of readFileSync(modulePath, 'utf-8').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;

    const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length < 3) continue;

    // |---|---|---| — the rule under a header carries nothing.
    if (cells.every((cell) => cell === '' || /^:?-+:?$/.test(cell))) continue;

    // A header row redefines the roles for everything that follows it.
    const lower = cells.map((cell) => cell.toLowerCase());
    const headerTable = lower.findIndex((cell) => cell === 'table/view' || cell === 'table');
    const headerDesc = lower.findIndex((cell) => cell === 'description');
    if (headerTable >= 0 && headerDesc >= 0) {
      tableIdx = headerTable;
      descIdx = headerDesc;
      systemIdx = lower.findIndex((cell) => cell === 'system');
      continue;
    }

    const tableCell = cells[tableIdx] ?? '';
    const description = cells[descIdx] ?? '';
    const systemCell = systemIdx >= 0 ? (cells[systemIdx] ?? '') : '';
    if (!systemMatches(systemCell)) continue;

    // A cell may offer alternatives ("T077D / TONR"); the first usable one is
    // taken and the rest of the cell is dropped. Views are queried through
    // their base table, and transaction codes (VN01, KANK) are not tables at
    // all — they are skipped so the next alternative gets its turn.
    for (const part of tableCell.split('/').map((piece) => piece.trim())) {
      if (/^[A-Z]{2,4}\d{2}$/.test(part)) continue;

      const candidate = part.startsWith('V_') ? part.slice(2) : part;
      const tableName = candidate.toUpperCase();
      if (!isValidTableName(tableName)) {
        if (candidate) {
          console.warn(`[spro] Rejected invalid table name from ${modulePath}: ${JSON.stringify(candidate)}`);
        }
        break;
      }
      if (!tables.has(tableName)) tables.set(tableName, description);
      break;
    }
  }

  return tables;
}

// ── the read itself ─────────────────────────────────────────────────────────

async function queryTable(client, tableName) {
  // Checked once at parse time and again here: whatever path a name arrived by,
  // it is validated immediately before being spliced into SQL.
  if (!isValidTableName(tableName)) {
    return { success: false, error: `invalid table name rejected: ${JSON.stringify(tableName)}` };
  }

  try {
    // No `acknowledge_risk` — a blocklisted table fails here, is recorded as an
    // error, and never reaches the cache.
    const result = await client.callTool({
      name: 'GetSqlQuery',
      arguments: { sql_query: `SELECT * FROM ${tableName}`, row_number: ROW_CAP },
    });

    const text = result.content && result.content[0] && result.content[0].text;
    if (!text) return { success: false, error: 'Empty response' };

    const data = JSON.parse(text);
    return {
      success: true,
      total_rows: data.total_rows || 0,
      truncated: data.truncated === true,
      columns: data.columns || [],
      rows: data.rows || [],
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── orchestration ───────────────────────────────────────────────────────────

// Read every selected module's spro.md once. `perModule` keeps the per-module
// view the output is organised by; `allTables` is the de-duplicated set that is
// actually queried, so a table shared by three modules is read once.
function collectTables() {
  const perModule = {};
  const allTables = new Map(); // table name → { modules[], description }

  for (const mod of selectedModules) {
    const sproPath = resolve(KNOWLEDGE_DIR, mod, 'spro.md');
    if (!existsSync(sproPath)) {
      console.error(`[spro] Warning: ${sproPath} not found, skipping ${mod}`);
      continue;
    }

    const tables = parseTablesFromSproMd(sproPath);
    perModule[mod] = tables;

    for (const [name, description] of tables) {
      const entry = allTables.get(name);
      if (entry) entry.modules.push(mod);
      else allTables.set(name, { modules: [mod], description });
    }
  }

  return { perModule, allTables };
}

// The offline half of the approval gate: state the scope, then stop.
function discloseScope(allTables) {
  console.log('\n[spro] DRY RUN — nothing was started and nothing was read.');
  console.log(
    `[spro] Would issue ${allTables.size} × "SELECT * FROM <table>" capped at ${ROW_CAP} rows via GetSqlQuery.`
  );
  for (const [name, info] of allTables) {
    console.log(`  - ${name.padEnd(12)} [${info.modules.join(',')}] ${info.description || ''}`.trimEnd());
  }
  console.log(`[spro] Output would be: ${getOutputFile()}`);
  console.log(
    '[spro] Approval gate: re-running without --dry-run authorises exactly this scope. ' +
      'You are the approver — an agent must not run it for you (approval-gates.md Gate B).'
  );
}

// Read the tables `BATCH_SIZE` at a time. The batch is a courtesy to the server,
// not a correctness requirement — each table is independent.
async function readAllTables(client, allTables) {
  const tableNames = [...allTables.keys()];
  const results = {};
  const errors = [];
  let successCount = 0;
  let failCount = 0;

  const totalBatches = Math.ceil(tableNames.length / BATCH_SIZE);
  for (let offset = 0; offset < tableNames.length; offset += BATCH_SIZE) {
    const batch = tableNames.slice(offset, offset + BATCH_SIZE);
    console.log(`[spro] Batch ${Math.floor(offset / BATCH_SIZE) + 1}/${totalBatches}: ${batch.join(', ')}`);

    const settled = await Promise.all(
      batch.map(async (tableName) => ({ tableName, result: await queryTable(client, tableName) }))
    );

    for (const { tableName, result } of settled) {
      const info = allTables.get(tableName);
      if (result.success) {
        results[tableName] = {
          description: info.description,
          modules: info.modules,
          total_rows: result.total_rows,
          truncated: result.truncated,
          columns: result.columns,
          rows: result.rows,
        };
        successCount++;
        console.log(`  ✓ ${tableName}: ${result.total_rows} rows${result.truncated ? ' (TRUNCATED at row cap)' : ''}`);
      } else {
        errors.push({ table: tableName, modules: info.modules, error: result.error });
        failCount++;
        console.log(`  ✗ ${tableName}: ${result.error}`);
      }
    }
  }

  return { results, errors, successCount, failCount };
}

// Fold the flat per-table results back into the per-module shape the cache
// consumers read. A table that failed simply does not appear.
function groupByModule(perModule, results) {
  const grouped = {};
  for (const mod of selectedModules) {
    grouped[mod] = {};
    const tables = perModule[mod];
    if (!tables) continue;

    for (const [tableName, description] of tables) {
      const hit = results[tableName];
      if (!hit) continue;
      grouped[mod][tableName] = {
        description,
        total_rows: hit.total_rows,
        truncated: hit.truncated,
        data: hit.rows,
      };
    }
  }
  return grouped;
}

async function main() {
  const { perModule, allTables } = collectTables();
  const uniqueCount = allTables.size;
  console.log(`[spro] Total unique tables: ${uniqueCount}`);

  if (DRY_RUN) {
    discloseScope(allTables);
    process.exit(0);
  }

  if (uniqueCount === 0) {
    console.error('[spro] No tables resolved — nothing to extract.');
    process.exit(1);
  }

  const alias = readActiveAlias();
  console.log(`[spro] Project: ${PROJECT_DIR} · profile: ${alias ?? '(legacy / none)'}`);
  console.log('[spro] Connecting to MCP server...');
  const client = await connectMcp({ cwd: PROJECT_DIR, exposition: 'readonly', label: 'spro-extractor' });
  console.log('[spro] Connected.');

  const { results, errors, successCount, failCount } = await readAllTables(client, allTables);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = getOutputFile();
  writeFileSync(
    outputFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        system: SAP_VERSION ?? 'unknown',
        profile: alias ?? 'legacy',
        modules: groupByModule(perModule, results),
        errors,
        summary: {
          modules_processed: selectedModules.length,
          tables_success: successCount,
          tables_failed: failCount,
          total_tables: uniqueCount,
        },
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log('\n[spro] === Summary ===');
  console.log(`  Modules: ${selectedModules.join(', ')}`);
  console.log(`  Tables: ${successCount} success / ${failCount} failed / ${uniqueCount} total`);
  console.log(`  Output: ${outputFile}`);

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[spro] Fatal error:', err);
  process.exit(1);
});
