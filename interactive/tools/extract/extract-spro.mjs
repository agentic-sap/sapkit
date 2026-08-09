#!/usr/bin/env node
/**
 * SPRO customizing cache extractor — sapkit `tools/extract/`
 *
 * Reads the SPRO table lists shipped in `core/knowledge/modules/{MODULE}/spro.md`,
 * queries each table through the bundled MCP server, and writes the cache that
 * [spro-lookup](../../core/procedures/spro-lookup.md) Step 1 consumes:
 *
 *   <project>/.sapkit/spro-config.json           ← two or more modules, or `all`
 *   <project>/.sapkit/spro-config-{MODULE}.json  ← exactly one module
 *
 * ─────────────────────── APPROVAL GATE — read before running ───────────────
 * Every table read here is a **P2 row-data extraction** (AGENTS.md), so Gate B
 * of [approval-gates](../../core/policies/approval-gates.md) applies to each
 * `GetSqlQuery` this script issues.
 *
 *   • The **human runs this command.** An agent must not run it on the user's
 *     behalf, must not hand it to a subagent, and must not use it as a way
 *     around the per-call approval it would otherwise owe. Gate B(c) —
 *     "subagent and batch use are prohibited" — has no exception path.
 *   • `--dry-run` performs the scope disclosure the gate requires — module
 *     list, every table that would be read, the row cap, the output path —
 *     **without connecting to anything.** Run it first; running the command
 *     without `--dry-run` is the human's approval act for that stated scope.
 *   • Allowed scope is **IMG / Customizing configuration** only: the tables
 *     named in the shipped `spro.md` files. This script never sets
 *     `acknowledge_risk`, so the server-side blocklist floor still decides —
 *     `deny`-tier tables are refused and `ask`-tier tables fail closed. Every
 *     refusal lands in the output `errors[]` and is never written into the cache.
 *   • [data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md)
 *     stays authoritative. Customizing extraction being permitted here is not a
 *     licence for transactional or PII row data by any other route.
 *
 * Usage (run from the project root — the directory holding `.sapkit/`):
 *   node tools/extract/extract-spro.mjs --dry-run SD MM
 *   node tools/extract/extract-spro.mjs SD MM FI CO
 *   node tools/extract/extract-spro.mjs all
 *
 * ─────────────────────── Runtime directory (D-057) ──────────────────────────
 * The cache lands beside the cwd's runtime dir, or names the `.sapkit`
 * creation site when the project has none (R-NEW). `--resolve-only` prints the
 * selection offline.
 *
 * ───────────── Transform note (sc4sap-custom `scripts/extract-spro.mjs`) ────
 * Parsing, filtering, batching, and output shape are unchanged. What differs:
 *   • table source: `configs/{MODULE}/spro.md` → `core/knowledge/modules/{MODULE}/spro.md`
 *   • transport: `@modelcontextprotocol/sdk` → `./lib/mcp-stdio.mjs` (this
 *     plugin ships no npm dependencies)
 *   • server: `engine/server.bundle.cjs --env-path=…` → `server/launch.cjs`,
 *     which resolves the active profile from the cwd the same way the MCP
 *     server does in that project; exposition pinned to `readonly`
 *   • output base: `resolveArtifactBase()` (`.sapkit/work/<alias>/`) →
 *     `<cwd>/.sapkit/`. Multi-profile artifact resolution is classified
 *     `obsolete` in MIGRATION-MANIFEST, and the consumer contract in
 *     spro-lookup.md / project-context.md is the plain `.sapkit/` path
 *   • SAP version: `sap.env` only → `SAP_VERSION` env, then the active
 *     profile's / project's `config.json` `sapVersion`, then `sap.env`
 *     (sapkit keeps the version in `config.json`)
 *   • bare invocation used to mean `all` silently; it now prints usage and
 *     exits 2 — scope must be stated explicitly (Gate B)
 *   • `--dry-run` added (offline scope disclosure)
 *   • `all` used `require('fs').statSync` inside an ESM module — a
 *     ReferenceError swallowed by the surrounding `catch`, so `all` silently
 *     resolved to zero modules. Now uses the imported `statSync`
 *   • each table records `truncated` (row cap reached ⇒ partial cache)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMcp } from './lib/mcp-stdio.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KNOWLEDGE_DIR = resolve(PLUGIN_ROOT, 'core', 'knowledge', 'modules');
const PROJECT_DIR = process.cwd();

// ── runtime directory (D-057) ───────────────────────────────────────────────
const NEW_DIR = '.sapkit';

const REASONS = [];
const RESOLVE_ONLY = process.argv.slice(2).includes('--resolve-only');
function note(code, message) {
  if (REASONS.some((r) => r.code === code)) return;
  REASONS.push({ code, message });
  if (!RESOLVE_ONLY) console.error(`[spro] ${code}: ${message}`);
}

// Existence is this tool's criterion — depth 0, no walk-up.
function pickRuntimeDir(dir) {
  const candidate = join(dir, NEW_DIR);
  return existsSync(candidate) ? candidate : null;
}

// R-E + R-NEW: write where this project already keeps runtime state; `.sapkit`
// when it keeps none.
const RUNTIME_DIR = pickRuntimeDir(PROJECT_DIR) ?? join(PROJECT_DIR, NEW_DIR);
const OUTPUT_DIR = RUNTIME_DIR;
const ROW_CAP = 9999;
const BATCH_SIZE = 5;

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

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const DRY_RUN = argv.includes('--dry-run');

// ── offline path-resolution seam (D-057 §7-3) ───────────────────────────────
// Pure path computation: no module list, no MCP server, no SAP connection.
if (RESOLVE_ONLY) {
  const alias = readActiveAlias();
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
        alias,
        profile_dir: alias ? profileDir(alias) : null,
        sap_version: resolveSapVersion(),
        reasons: REASONS,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const positional = argv.filter((a) => !a.startsWith('-'));
if (positional.length === 0) {
  console.error(USAGE);
  process.exit(2);
}

let selectedModules = positional;
if (positional[0] === 'all') {
  selectedModules = readdirSync(KNOWLEDGE_DIR).filter((d) => {
    try {
      return statSync(resolve(KNOWLEDGE_DIR, d)).isDirectory();
    } catch {
      return false;
    }
  });
}

const isSingleModule = () => selectedModules.length === 1;
const getOutputFile = () =>
  isSingleModule()
    ? resolve(OUTPUT_DIR, `spro-config-${selectedModules[0]}.json`)
    : resolve(OUTPUT_DIR, 'spro-config.json');

console.log(`[spro] Modules: ${selectedModules.join(', ')}`);

// SAP DDIC table name whitelist — uppercase letter start, A-Z / 0-9 / _ only, 2..30 chars.
// Anything else is refused before reaching GetSqlQuery. Defends against malicious or
// malformed entries in a module's spro.md flowing into a raw SQL string.
const TABLE_NAME_RE = /^[A-Z][A-Z0-9_]{1,29}$/;

function isValidTableName(name) {
  return typeof name === 'string' && TABLE_NAME_RE.test(name);
}

// ── active SAP version ─────────────────────────────────────────────────────
// Used to filter rows in modules whose spro.md carries a System column (e.g. MM)
// so ECC-only rows are skipped on S/4 and vice versa.
function readActiveAlias() {
  try {
    const alias = readFileSync(join(RUNTIME_DIR, 'active-profile.txt'), 'utf8').trim();
    return alias || null;
  } catch {
    return null;
  }
}

// R-ENV. A SAPKIT_HOME_DIR that is set but missing is a hard error — never a
// silent fall-through to `~/.sapkit`.
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
  const newHome = join(homedir(), NEW_DIR);
  if (alias && !existsSync(join(newHome, 'profiles', alias))) {
    note('PROFILE_NOT_FOUND', `profile "${alias}" was not found under ${newHome}.`);
  }
  return newHome;
}

function profileDir(alias) {
  return join(sapkitHome(alias), 'profiles', alias);
}

function jsonField(path, field) {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8'))?.[field];
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

function dotenvField(path, key) {
  try {
    const m = readFileSync(path, 'utf8').match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'));
    return m ? m[1].replace(/^["']|["']$/g, '').trim() : null;
  } catch {
    return null;
  }
}

// S4 | S4HANA | S4_CLOUD_PUBLIC | S4_CLOUD_PRIVATE → S4 ; ECC* → ECC
function normalizeVersion(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith('S4') || v.startsWith('S/4')) return 'S4';
  if (v.startsWith('ECC')) return 'ECC';
  return v;
}

function resolveSapVersion() {
  const alias = readActiveAlias();
  const candidates = [];
  if (process.env.SAP_VERSION) candidates.push({ value: process.env.SAP_VERSION, source: 'SAP_VERSION env' });
  if (alias) {
    candidates.push({ path: join(profileDir(alias), 'config.json'), field: 'sapVersion', source: `profile config.json (${alias})` });
  }
  candidates.push({ path: join(RUNTIME_DIR, 'config.json'), field: 'sapVersion', source: 'project config.json' });
  if (alias) candidates.push({ path: join(profileDir(alias), 'sap.env'), key: 'SAP_VERSION', source: `profile sap.env (${alias})` });
  candidates.push({ path: join(RUNTIME_DIR, 'sap.env'), key: 'SAP_VERSION', source: 'project sap.env (legacy)' });

  for (const c of candidates) {
    const raw = c.value ?? (c.field ? jsonField(c.path, c.field) : dotenvField(c.path, c.key));
    const v = normalizeVersion(raw);
    if (v) return { version: v, source: c.source };
  }
  return { version: null, source: null };
}

const { version: SAP_VERSION, source: SAP_VERSION_SOURCE } = resolveSapVersion();
console.log(
  `[spro] SAP version: ${SAP_VERSION ? `${SAP_VERSION} (${SAP_VERSION_SOURCE})` : '(unresolved — no System-column filtering)'}`
);

// Row matches the active system if:
//   - no System column present (legacy 3-col layout), OR
//   - System cell lists both ECC and S4 (universal), OR
//   - the version is unresolved (can't filter → include), OR
//   - cell contains a token matching the active version.
function systemMatches(systemCell) {
  if (!systemCell) return true;
  const tokens = systemCell
    .split(/[/,]/)
    .map((s) => s.trim().toUpperCase())
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

// Parse table names from spro.md.
// Column layout is inferred from the most recent header row so modules can
// use either 3-col (| Config | Table/View | Description |) or 4-col
// (| Config | System | Table/View | Description |) tables without a hard-
// coded index — a fixed "column 2 is the table" assumption captured 'System'
// and 'ECC' as tables on MM's 4-col layout.
function parseTablesFromSproMd(modulePath) {
  const content = readFileSync(modulePath, 'utf-8');
  const tables = new Map(); // tableName -> description
  const lines = content.split('\n');

  // Defaults matching the common 3-col layout (reset each time a header is seen).
  let tableIdx = 1;
  let systemIdx = -1;
  let descIdx = 2;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.length < 3) continue;

    // Separator row: |---|---|---|
    if (cells.every((c) => c === '' || /^:?-+:?$/.test(c))) continue;

    // Header row — recompute column roles.
    const lower = cells.map((c) => c.toLowerCase());
    const hdrTable = lower.findIndex((c) => c === 'table/view' || c === 'table');
    const hdrDesc = lower.findIndex((c) => c === 'description');
    if (hdrTable >= 0 && hdrDesc >= 0) {
      tableIdx = hdrTable;
      descIdx = hdrDesc;
      systemIdx = lower.findIndex((c) => c === 'system');
      continue;
    }

    const tableCol = cells[tableIdx] ?? '';
    const descCol = cells[descIdx] ?? '';
    const systemCol = systemIdx >= 0 ? (cells[systemIdx] ?? '') : '';

    if (!systemMatches(systemCol)) continue;

    // Handle entries like "T077D / TONR" — take first valid table name.
    // Skip transaction codes (VN01, KANK, KONK) and pure number ranges.
    const parts = tableCol.split('/').map((p) => p.trim());
    for (const part of parts) {
      // Strip V_ prefix for the query — we'll query the base table.
      const raw = part.startsWith('V_') ? part.slice(2) : part;
      if (/^[A-Z]{2,4}\d{2}$/.test(part)) continue; // e.g., VN01
      const tableName = raw.toUpperCase();
      if (!isValidTableName(tableName)) {
        if (raw) console.warn(`[spro] Rejected invalid table name from ${modulePath}: ${JSON.stringify(raw)}`);
        break;
      }
      if (!tables.has(tableName)) {
        tables.set(tableName, descCol);
      }
      break; // Take only the first valid table
    }
  }

  return tables;
}

// Query a table via MCP
async function queryTable(client, tableName) {
  // Defense-in-depth: re-validate even if parseTablesFromSproMd was bypassed.
  if (!isValidTableName(tableName)) {
    return { success: false, error: `invalid table name rejected: ${JSON.stringify(tableName)}` };
  }
  try {
    // No `acknowledge_risk` — the server-side blocklist floor decides. A
    // deny/ask-tier table fails here and is recorded as an error, never cached.
    const result = await client.callTool({
      name: 'GetSqlQuery',
      arguments: {
        sql_query: `SELECT * FROM ${tableName}`,
        row_number: ROW_CAP,
      },
    });

    if (result.content && result.content[0] && result.content[0].text) {
      const data = JSON.parse(result.content[0].text);
      return {
        success: true,
        total_rows: data.total_rows || 0,
        truncated: data.truncated === true,
        columns: data.columns || [],
        rows: data.rows || [],
      };
    }
    return { success: false, error: 'Empty response' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  // Collect all tables per module
  const moduleData = {};
  const allTables = new Map(); // tableName -> { modules: [], description }

  for (const mod of selectedModules) {
    const sproPath = resolve(KNOWLEDGE_DIR, mod, 'spro.md');
    if (!existsSync(sproPath)) {
      console.error(`[spro] Warning: ${sproPath} not found, skipping ${mod}`);
      continue;
    }

    const tables = parseTablesFromSproMd(sproPath);
    moduleData[mod] = tables;

    for (const [name, desc] of tables) {
      if (!allTables.has(name)) {
        allTables.set(name, { modules: [mod], description: desc });
      } else {
        allTables.get(name).modules.push(mod);
      }
    }
  }

  const uniqueCount = allTables.size;
  console.log(`[spro] Total unique tables: ${uniqueCount}`);

  // ── scope disclosure (offline) ───────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[spro] DRY RUN — nothing was started and nothing was read.');
    console.log(`[spro] Would issue ${uniqueCount} × "SELECT * FROM <table>" capped at ${ROW_CAP} rows via GetSqlQuery.`);
    for (const [name, info] of allTables) {
      console.log(`  - ${name.padEnd(12)} [${info.modules.join(',')}] ${info.description || ''}`.trimEnd());
    }
    console.log(`[spro] Output would be: ${getOutputFile()}`);
    console.log(
      '[spro] Approval gate: re-running without --dry-run authorises exactly this scope. ' +
        'You are the approver — an agent must not run it for you (approval-gates.md Gate B).'
    );
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

  // Query tables in batches
  const tableNames = [...allTables.keys()];
  const results = {};
  const errors = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tableNames.length; i += BATCH_SIZE) {
    const batch = tableNames.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tableNames.length / BATCH_SIZE);
    console.log(`[spro] Batch ${batchNum}/${totalBatches}: ${batch.join(', ')}`);

    const batchResults = await Promise.all(
      batch.map(async (tableName) => {
        const result = await queryTable(client, tableName);
        return { tableName, result };
      })
    );

    for (const { tableName, result } of batchResults) {
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

  // Organize by module
  const moduleResults = {};
  for (const mod of selectedModules) {
    moduleResults[mod] = {};
    const tables = moduleData[mod];
    if (!tables) continue;

    for (const [tableName, desc] of tables) {
      if (results[tableName]) {
        moduleResults[mod][tableName] = {
          description: desc,
          total_rows: results[tableName].total_rows,
          truncated: results[tableName].truncated,
          data: results[tableName].rows,
        };
      }
    }
  }

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    timestamp: new Date().toISOString(),
    system: SAP_VERSION ?? 'unknown',
    profile: alias ?? 'legacy',
    modules: moduleResults,
    errors,
    summary: {
      modules_processed: selectedModules.length,
      tables_success: successCount,
      tables_failed: failCount,
      total_tables: uniqueCount,
    },
  };

  const outputFile = getOutputFile();
  writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n[spro] === Summary ===');
  console.log(`  Modules: ${selectedModules.join(', ')}`);
  console.log(`  Tables: ${successCount} success / ${failCount} failed / ${uniqueCount} total`);
  console.log(`  Output: ${outputFile}`);

  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('[spro] Fatal error:', e);
  process.exit(1);
});
