#!/usr/bin/env node
//
// Customization inventory builder — sapkit `tools/extract/`
//
// SAP ships hundreds of extension points per module. The question this tool
// answers is a narrower one: which of them has *this customer* actually turned
// on, and with which Z or Y object? It reads the standard exit / BAdI / append
// definitions out of `core/knowledge/modules/{MODULE}/enhancements.md`, asks the
// live system about each, and keeps only what came back with customer-namespace
// evidence behind it. The result is what
// [customization-lookup](../../core/procedures/customization-lookup.md) Step 1
// reads:
//
//   <project>/.sapkit/customizations/{MODULE}/enhancements.json
//        BAdI implementations · SMOD→CMOD · form exits · GGB rules · BTE FMs
//   <project>/.sapkit/customizations/{MODULE}/extensions.json
//        append structures and custom fields on base tables
//
// What earns a place in the inventory:
//   BAdI     at least one Z/Y implementation exists
//   SMOD     a CMOD project includes the enhancement AND that project is Z/Y —
//            proof the customer switched it on, not merely that SAP ships it
//   Appends  any Z/Y append or custom field on the base table; these go to
//            extensions.json rather than enhancements.json
//
// ══════════════════ APPROVAL GATE — read this before running ═══════════════
// Several scans go out as `GetSqlQuery` (MODACT/MODATTR, GB03, TBE24, TPS34),
// which makes this a **P2 row-data extraction** (AGENTS.md) under Gate B of
// [approval-gates](../../core/policies/approval-gates.md).
//
//   • **A human runs this command.** Not an agent on the user's behalf, not a
//     subagent it was handed to, and not as a way of collecting in one batch
//     what would otherwise need approval call by call. Gate B(c) — "subagent
//     and batch use are prohibited" — has no exception path.
//   • `--dry-run` states the scope offline: the modules, what was parsed out of
//     each enhancements.md, the exact SQL scans, and where the output would go.
//     Running the same command without it is the human's act of approval for
//     that scope.
//   • The scope is **enhancement registration metadata** — which standard exit
//     the customer switched on, and the names of the Z objects doing it.
//     `MODACT`/`MODATTR` hold CMOD projects, `GB03` holds GGB0/GGB1 rule
//     headers, `TBE24`/`TPS34` hold BTE function-module registrations: all
//     customizing, none of it transactional or personal. The remaining scans
//     (`GetEnhancementSpot`, `GetInclude`, `GetTable`, `SearchObject`) are
//     repository/DDIC reads, which are P1 and not row data at all.
//   • `acknowledge_risk` is never set, so the server-side blocklist floor keeps
//     the last word. A refused table simply yields no findings; a refusal is
//     never cached.
//   • [data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md)
//     stays authoritative for everything outside this scope.
//
// Usage — run from the project root, the directory holding `.sapkit/`:
//   node tools/extract/extract-customizations.mjs --dry-run SD MM
//   node tools/extract/extract-customizations.mjs SD MM FI CO
//   node tools/extract/extract-customizations.mjs all
//
// ══════════════════ Runtime directory (D-057) ══════════════════════════════
// The inventory is written beside the runtime directory this project already
// keeps, or names the `.sapkit` creation site when it keeps none (R-NEW).
// `--resolve-only` prints that decision as JSON without connecting to anything.
//

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMcp } from './lib/mcp-stdio.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KNOWLEDGE_DIR = resolve(PLUGIN_ROOT, 'core', 'knowledge', 'modules');
const PROJECT_DIR = process.cwd();

const NEW_DIR = '.sapkit';

// Customer namespace. Everything this tool keeps has to match it — that is what
// separates "the customer built this" from "SAP shipped this".
const Z_PATTERN = /^[ZY]/i;

// ── runtime directory ───────────────────────────────────────────────────────
// No walk-up: the inventory belongs to the project the operator is standing in,
// and inheriting a parent's runtime directory would file one system's
// customizations under another's.
function pickRuntimeDir(dir) {
  const candidate = join(dir, NEW_DIR);
  return existsSync(candidate) ? candidate : null;
}

// R-E where state already exists, R-NEW where it does not.
const RUNTIME_DIR = pickRuntimeDir(PROJECT_DIR) ?? join(PROJECT_DIR, NEW_DIR);
const OUTPUT_DIR = join(RUNTIME_DIR, 'customizations');

const USAGE = `Usage: node tools/extract/extract-customizations.mjs [--dry-run] <MODULE...|all>

  --dry-run   list the modules, what was parsed from each enhancements.md, the
              SQL scans and the output paths, then stop (no MCP server, no SAP
              connection) — the scope disclosure the row-data gate requires
  --resolve-only  print the resolved runtime paths as JSON and exit. No MCP
              server, no SAP connection, no module list needed — the offline
              seam the runtime-path conformance suite calls.
  MODULE...   module codes with a shipped enhancements.md (SD MM FI CO …)
  all         every module directory under core/knowledge/modules/ except common

Run from the project root (the directory holding .sapkit/).
Reading rows from SAP is a P2 action: you are the approver, and an agent must
not run this on your behalf. See core/policies/approval-gates.md (Gate B).`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const DRY_RUN = argv.includes('--dry-run');

// ── offline path-resolution seam (D-057 §7-3) ───────────────────────────────
// Path arithmetic only: no module list, no MCP server, no SAP connection. Unlike
// its sibling this tool never resolves the sapkit home, so a broken
// SAPKIT_HOME_DIR cannot stop it here — there is nothing under the home for it
// to report.
if (argv.includes('--resolve-only')) {
  let alias = null;
  try {
    alias = readFileSync(join(RUNTIME_DIR, 'active-profile.txt'), 'utf8').trim() || null;
  } catch {
    alias = null;
  }
  console.log(
    JSON.stringify(
      {
        tool: 'extract-customizations',
        cwd: PROJECT_DIR,
        runtime_dir: RUNTIME_DIR,
        runtime_generation: RUNTIME_DIR.endsWith(NEW_DIR) ? 'sapkit' : 'sc4sap',
        runtime_dir_exists: existsSync(RUNTIME_DIR),
        output_dir: OUTPUT_DIR,
        alias,
        reasons: [],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ── module selection ────────────────────────────────────────────────────────
// Scope has to be stated. A bare invocation used to mean `all`, which is exactly
// the silent widening Gate B exists to prevent.
const positional = argv.filter((arg) => !arg.startsWith('-'));
if (positional.length === 0) {
  console.error(USAGE);
  process.exit(2);
}

const selectedModules =
  positional[0] === 'all'
    ? readdirSync(KNOWLEDGE_DIR).filter((entry) => {
        try {
          return statSync(resolve(KNOWLEDGE_DIR, entry)).isDirectory() && entry !== 'common';
        } catch {
          return false;
        }
      })
    : positional;

console.log(`[cust] Modules: ${selectedModules.join(', ')}`);

/* ═══════════════════ enhancements.md parser ═══════════════════ */

// The shipped files are prose with tables in them, not a data format, so which
// bucket a table row belongs to is decided by the heading above it. Headings are
// matched loosely because fifteen modules wrote them fifteen ways — note
// `badis?`, which matters: the plural ("## 2. BAdIs / 비즈니스 애드인") is what
// thirteen of the fifteen actually use.
const H2_SECTIONS = [
  [/\bcustomer exits\b|\bcmod\/smod\b|\bclassic\b/, 'smod'],
  [/\bbadis?\b|\benhancement spots\b/, 'badi'],
  [/\bform[\s-]?based\b|\binclude programs\b|\bmodule-specific\b/, 'formExits'],
  [/\bcustom fields\b|\bappend structures\b/, 'appends'],
];

// An `###` heading refines the section it sits under; anything unrecognised
// leaves the current bucket alone rather than clearing it.
const H3_SECTIONS = [
  [/\bform[\s-]?based\b|\binclude\b/, 'formExits'],
  [/\bappend\b|\bcustom fields\b/, 'appends'],
  [/\bbadis?\b/, 'badi'],
];

function matchSection(headingLower, table) {
  for (const [pattern, section] of table) {
    if (pattern.test(headingLower)) return section;
  }
  return null;
}

// Header cells and rule rows that are not data.
const NON_DATA_COL1 = new Set(['Name', 'Include', 'Append']);

// Per-bucket shape of a data row. Each entry says how strict column 1 has to
// look and how the row is recorded; a row failing the test is skipped.
const ROW_SHAPES = {
  smod: [/^[A-Z][A-Z0-9_]{5,}$/, (c1, c2, c3) => ({ name: c1, description: c3 })],
  badi: [/^[A-Z][A-Z0-9_]+$/, (c1, c2, c3) => ({ name: c1, description: c3 })],
  formExits: [/^[A-Z][A-Z0-9_]{3,}$/, (c1, c2, c3) => ({ include: c1, routines: c3 })],
  // SD writes | Append | Table | System | Description |, so column 2 is the
  // base table where there is one.
  appends: [/^[A-Z][A-Z0-9_]+$/, (c1, c2, c3) => ({ append: c1, baseTable: c2, description: c3 })],
};

// Parse one module's enhancements.md into the four buckets. Returns null when
// the file is absent — the caller reports that and moves on.
function parseEnhancementsMd(path) {
  if (!existsSync(path)) return null;

  const sections = {
    smod: [], // classic SMOD enhancement names (V45A0001 …)
    badi: [], // BAdI and enhancement spot names (BADI_SD_SALES, ES_SAPLV45A …)
    formExits: [], // include programs (MV45AFZZ, RV60AFZZ …)
    appends: [], // { append, baseTable, description }
  };

  let bucket = null;

  for (const rawLine of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    if (/^##\s+/.test(rawLine)) {
      bucket = matchSection(rawLine.toLowerCase(), H2_SECTIONS);
      continue;
    }
    if (/^###\s+/.test(rawLine)) {
      const refined = matchSection(rawLine.toLowerCase(), H3_SECTIONS);
      if (refined) bucket = refined;
      continue;
    }

    const row = rawLine.trim().match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (!row) continue;

    // Bold markers are decoration, not part of any name.
    const [col1, col2, col3] = row.slice(1, 4).map((cell) => cell.trim().replace(/\*+/g, '').trim());
    if (!col1 || NON_DATA_COL1.has(col1) || col1.startsWith('---')) continue;

    const shape = ROW_SHAPES[bucket];
    if (!shape) continue;
    const [namePattern, build] = shape;
    if (namePattern.test(col1)) sections[bucket].push(build(col1, col2, col3));
  }

  return sections;
}

/* ═══════════════════ MCP helpers ═══════════════════ */

// One call, one uniform answer. Some tools reply with JSON and others with
// ADT XML, so both the parsed and the raw form are handed back and each scan
// takes whichever it needs.
async function callTool(client, name, args) {
  try {
    const response = await client.callTool({ name, arguments: args });
    const text = response?.content?.[0]?.text;
    if (!text) return { ok: false, error: 'empty response' };
    try {
      return { ok: true, json: JSON.parse(text), raw: text };
    } catch {
      return { ok: true, raw: text };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// BAdI — read the enhancement spot and harvest customer-namespace names from
// whatever came back. Not every row in enhancements.md is really a spot; some
// are plain BAdI definitions, so a miss falls back to a name lookup and returns
// quietly with nothing found rather than raising.
async function scanBadiImplementations(client, badiName) {
  const spot = await callTool(client, 'GetEnhancementSpot', { enhancement_spot: badiName });
  if (!spot.ok) {
    const search = await callTool(client, 'SearchObject', {
      object_name: badiName,
      object_type: 'BADI',
      maxResults: 5,
    });
    return { ok: spot.ok || search.ok, implementations: [], spot: spot.raw || search.raw || null };
  }

  // Implementation classes appear under several conventions (ZCL_IM_*,
  // ZCL_*_IMPL, Z*_IMPL), so the payload is swept for Z/Y identifiers instead
  // of any one shape.
  const found = new Set();
  for (const hit of (spot.raw || '').matchAll(/\b([ZY][A-Z0-9_]{2,30})\b/g)) found.add(hit[1]);
  return { ok: true, implementations: [...found].filter((name) => Z_PATTERN.test(name)) };
}

// SMOD — which activated CMOD projects include this enhancement.
//   MODACT   project ↔ SMOD membership (NAME = project, MEMBER = SMOD name)
//   MODATTR  project header; STATUS 'A' means activated in CMOD
// Both are customizing tables, not transactional data.
//
// Historical note: this used to query MODSAP, which is SAP's own delivered SMOD
// repository and holds no customer membership whatsoever — every call returned
// zero rows no matter what the system contained (issue #29).
async function scanSmodCmod(client, smodName) {
  const sql =
    'SELECT a~NAME, a~MEMBER FROM MODACT AS a '
    + 'INNER JOIN MODATTR AS b ON a~NAME = b~NAME '
    + `WHERE b~STATUS = 'A' AND a~MEMBER = '${smodName}'`;

  const answer = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 50 });
  if (!answer.ok || !answer.json) return { ok: false, error: answer.error || 'no MODACT data' };

  const cmodProjects = (answer.json.rows || [])
    .map((row) => row.NAME || row.name)
    .filter((name) => name && Z_PATTERN.test(name));
  return { ok: true, cmodProjects };
}

// Form-based user exits — a heuristic, and knowingly so. SAP ships these
// includes as empty FORM stubs, so weight is the signal: strip comments, count
// what is left, and read more than 150 live lines as customer code having moved
// in. There is no cheap exact answer here.
async function scanFormExit(client, includeName) {
  const answer = await callTool(client, 'GetInclude', { include_name: includeName });
  if (!answer.ok) return { ok: false };

  const lineCount = (answer.raw || '')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('*')).length;
  return { ok: true, customized: lineCount > 150, lineCount };
}

// BTYP as GB03 stores it.
const GGB_RULE_TYPES = { 1: 'validation', 2: 'substitution', 3: 'rule' };

// GGB0 (substitution) / GGB1 (validation) / GGB4 (rule) — active rules whose
// name is in the customer namespace. GB03 is customizing metadata: VSR_NAME,
// BCLASS, APPLAREA and CALLUP_P describe the rule, not any transaction it acts
// on, which puts it in the same category as MODACT/MODATTR above.
async function scanGgbRulesAll(client) {
  const sql = "SELECT VSR_NAME, BCLASS, BTYP, BSTAT, APPLAREA, CALLUP_P FROM GB03 "
            + "WHERE BSTAT = 'A' AND (VSR_NAME LIKE 'Z%' OR VSR_NAME LIKE 'Y%')";

  const answer = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 500 });
  if (!answer.ok || !answer.json) return { ok: false, rules: [], error: answer.error || 'no GB03 data' };

  const rules = (answer.json.rows || [])
    .map((row) => ({
      name: row.VSR_NAME || row.vsr_name,
      type: GGB_RULE_TYPES[String(row.BTYP || row.btyp)] || 'unknown',
      bclass: row.BCLASS || row.bclass,
      applArea: row.APPLAREA || row.applarea,
      callupPoint: row.CALLUP_P || row.callup_p,
      status: 'active',
    }))
    .filter((rule) => rule.name && Z_PATTERN.test(rule.name));
  return { ok: true, rules };
}

// BTE (Business Transaction Events — FIBF, BF11/BF24/BF34). Customer function
// modules are registered in two tables, one per interface kind:
//   TBE24  publish/subscribe
//   TPS34  process interface
// Both carry EVENT (the numeric id, e.g. 00001025), APPL (the application code
// used downstream for module filtering), PRODUCT and FUNCTION.
const BTE_SOURCES = [
  ['P/S', 'TBE24'],
  ['Process', 'TPS34'],
];

async function scanBteImplementationsAll(client) {
  const implementations = [];

  for (const [kind, table] of BTE_SOURCES) {
    const sql = `SELECT EVENT, APPL, PRODUCT, FUNCTION FROM ${table} `
              + "WHERE FUNCTION LIKE 'Z%' OR FUNCTION LIKE 'Y%'";
    const answer = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 500 });
    if (!answer.ok || !answer.json) continue;

    for (const row of answer.json.rows || []) {
      const fn = row.FUNCTION || row.function;
      if (!fn || !Z_PATTERN.test(fn)) continue;
      implementations.push({
        kind,
        event: row.EVENT || row.event,
        application: row.APPL || row.appl,
        product: row.PRODUCT || row.product,
        function: fn,
      });
    }
  }

  return { ok: true, implementations };
}

// GGB and BTE are scanned system-wide, so each rule has to be handed to the
// module it belongs to. The application-area codes SAP uses do not match module
// codes, hence this table: values are prefixes, compared case-insensitively
// against the rule's applArea or application field. A module absent from the
// table gets nothing, which is deliberate — a wrong assignment is worse than a
// missing one.
const MODULE_SCOPE = {
  FI: ['GLT', 'GLX', 'FS', 'RF05', 'FI-GL', 'FI-AP', 'FI-AR', 'FI-BL', 'FI-TV', 'FI-CA', 'FKR'],
  CO: ['KOAR', 'KBE', 'CO'],
  PS:  ['PS'],
  TR:  ['TR', 'TR-CM', 'TR-TM'],
  AA:  ['KAMV', 'FI-AA'],
  PM:  ['PM'],
  SD:  ['SD'],
  HCM: ['HR', 'HCM', 'PY'],
};

function filterByModuleScope(items, mod, field) {
  const prefixes = MODULE_SCOPE[mod];
  if (!prefixes) return [];
  return items.filter((item) => {
    const value = String(item[field] || '').toUpperCase();
    if (!value) return false;
    return prefixes.some((prefix) => value.startsWith(prefix.toUpperCase()));
  });
}

// Append structures and custom fields on a base table. Two source formats have
// to be read: modern systems return CDS DDL (`include ci_vbak_zz;`), classic
// SE11 returns `.APPEND.CI_VBAK`. CI_* counts as customer extension even
// without a Z prefix — those are SAP's own reserved customer-include slots.
async function scanTableExtensions(client, baseTable) {
  const answer = await callTool(client, 'GetTable', { table_name: baseTable });
  if (!answer.ok) return { ok: false, error: answer.error };

  const raw = answer.raw || '';
  const includes = new Set();
  for (const hit of raw.matchAll(/\binclude\s+(\w+)/gi)) includes.add(hit[1].toUpperCase());
  for (const hit of raw.matchAll(/\.APPEND\.\s*([A-Z_][A-Z0-9_]*)/gi)) includes.add(hit[1].toUpperCase());

  const appendStructures = [...includes].filter((name) => Z_PATTERN.test(name) || /^CI_/.test(name));
  // ZZ_* / YY_* fields declared straight into the table body.
  const customFields = [
    ...new Set([...raw.matchAll(/\b((?:ZZ?|YY?)_[A-Z0-9_]{2,})\b/gi)].map((hit) => hit[1].toUpperCase())),
  ];
  return { ok: true, appendStructures, customFields };
}

/* ═══════════════════ orchestration ═══════════════════ */

// The base tables worth asking about: column 2 of the appends rows, kept only
// where it looks like a table name at all.
function baseTablesOf(parsed) {
  return [
    ...new Set(parsed.appends.map((entry) => entry.baseTable).filter((name) => /^[A-Z][A-Z0-9_]+$/.test(name))),
  ];
}

async function extractForModule(client, mod, globalCache) {
  const parsed = parseEnhancementsMd(resolve(KNOWLEDGE_DIR, mod, 'enhancements.md'));
  if (!parsed) {
    console.warn(`[cust] ${mod}: enhancements.md not found — skipping`);
    return null;
  }
  console.log(
    `[cust] ${mod}: parsed ${parsed.smod.length} SMOD / ${parsed.badi.length} BAdI` +
      ` / ${parsed.formExits.length} form-exits / ${parsed.appends.length} appends`
  );

  const enhancements = {
    smodExits: [],
    badiImplementations: [],
    formBasedExits: [],
    ggbRules: [],
    bteImplementations: [],
  };
  const extensions = { appendStructures: [] };

  // 1) BAdI implementations
  for (const badi of parsed.badi) {
    const found = await scanBadiImplementations(client, badi.name);
    if (!found.ok || !found.implementations?.length) continue;
    enhancements.badiImplementations.push({
      standardName: badi.name,
      description: badi.description,
      customs: found.implementations.map((name) => ({ name, type: 'CLAS' })),
    });
    console.log(`  ✓ BAdI ${badi.name} — ${found.implementations.length} Z impl`);
  }

  // 2) SMOD → CMOD
  for (const smod of parsed.smod) {
    const found = await scanSmodCmod(client, smod.name);
    if (!found.ok || !found.cmodProjects?.length) continue;
    enhancements.smodExits.push({
      standardName: smod.name,
      description: smod.description,
      customs: found.cmodProjects.map((name) => ({ name, type: 'CMOD' })),
    });
    console.log(`  ✓ SMOD ${smod.name} — CMOD(${found.cmodProjects.join(', ')})`);
  }

  // 3) Form-based user exits
  for (const exit of parsed.formExits) {
    const found = await scanFormExit(client, exit.include);
    if (!found.ok || !found.customized) continue;
    enhancements.formBasedExits.push({
      include: exit.include,
      routines: exit.routines,
      lineCount: found.lineCount,
    });
    console.log(`  ✓ Form-exit ${exit.include} — ${found.lineCount} lines (likely customized)`);
  }

  // 4) GGB rules — sliced out of the one system-wide scan by APPLAREA
  if (globalCache?.ggb && MODULE_SCOPE[mod]) {
    const mine = filterByModuleScope(globalCache.ggb, mod, 'applArea');
    if (mine.length) {
      enhancements.ggbRules = mine;
      for (const rule of mine) {
        console.log(`  ✓ GGB ${rule.type.padEnd(12)} ${rule.name} — ${rule.applArea}/${rule.callupPoint || '*'}`);
      }
    }
  }

  // 5) BTE function modules — same, sliced by APPL
  if (globalCache?.bte && MODULE_SCOPE[mod]) {
    const mine = filterByModuleScope(globalCache.bte, mod, 'application');
    if (mine.length) {
      enhancements.bteImplementations = mine;
      for (const impl of mine) {
        console.log(`  ✓ BTE ${impl.kind.padEnd(8)} ${impl.event} [${impl.application}] → ${impl.function}`);
      }
    }
  }

  // 6) Append structures and custom fields
  for (const table of baseTablesOf(parsed)) {
    const found = await scanTableExtensions(client, table);
    if (!found.ok) continue;
    const appends = found.appendStructures || [];
    const fields = found.customFields || [];
    if (!appends.length && !fields.length) continue;

    extensions.appendStructures.push({ baseTable: table, appendStructures: appends, customFields: fields });
    console.log(`  ✓ Table ${table} — ${appends.length} append / ${fields.length} Z field`);
  }

  return { enhancements, extensions };
}

// The offline half of the approval gate: parse the shipped files, state exactly
// what would be read, and stop. Exits 1 only when not one module could be
// parsed — otherwise the disclosure succeeded, which is what was asked for.
function discloseScope() {
  console.log('\n[cust] DRY RUN — nothing was started and nothing was read.');
  console.log('[cust] Workspace-wide SQL scans that would run once:');
  console.log("  - GB03  (GGB0/GGB1 rules)  SELECT VSR_NAME, BCLASS, BTYP, BSTAT, APPLAREA, CALLUP_P … BSTAT='A' AND VSR_NAME LIKE 'Z%'/'Y%'  [cap 500]");
  console.log("  - TBE24 (BTE P/S)          SELECT EVENT, APPL, PRODUCT, FUNCTION … FUNCTION LIKE 'Z%'/'Y%'  [cap 500]");
  console.log("  - TPS34 (BTE Process)      SELECT EVENT, APPL, PRODUCT, FUNCTION … FUNCTION LIKE 'Z%'/'Y%'  [cap 500]");

  let missing = 0;
  for (const mod of selectedModules) {
    const parsed = parseEnhancementsMd(resolve(KNOWLEDGE_DIR, mod, 'enhancements.md'));
    if (!parsed) {
      console.warn(`[cust] ${mod}: enhancements.md not found — would be skipped`);
      missing++;
      continue;
    }
    console.log(
      `[cust] ${mod.padEnd(5)} SMOD ${String(parsed.smod.length).padStart(3)} (→ MODACT/MODATTR query each)` +
        ` · BAdI ${String(parsed.badi.length).padStart(3)} (GetEnhancementSpot)` +
        ` · form-exits ${String(parsed.formExits.length).padStart(3)} (GetInclude)` +
        ` · base tables ${String(baseTablesOf(parsed).length).padStart(3)} (GetTable)`
    );
    console.log(`         output → ${join(OUTPUT_DIR, mod)} / {enhancements,extensions}.json`);
  }

  console.log(
    `[cust] Approval gate: re-running without --dry-run authorises exactly this scope. ` +
      `You are the approver — an agent must not run it for you (approval-gates.md Gate B).`
  );
  process.exit(missing === selectedModules.length ? 1 : 0);
}

function writeModuleFiles(mod, result) {
  const modDir = resolve(OUTPUT_DIR, mod);
  mkdirSync(modDir, { recursive: true });
  const timestamp = new Date().toISOString();

  writeFileSync(
    resolve(modDir, 'enhancements.json'),
    JSON.stringify({ timestamp, module: mod, ...result.enhancements }, null, 2),
    'utf-8',
  );
  writeFileSync(
    resolve(modDir, 'extensions.json'),
    JSON.stringify({ timestamp, module: mod, ...result.extensions }, null, 2),
    'utf-8',
  );
}

async function main() {
  if (DRY_RUN) discloseScope();

  console.log(`[cust] Project: ${PROJECT_DIR}`);
  console.log('[cust] Connecting to MCP server...');
  // `readonly,high` — GetTable sits outside the `readonly` set while the other
  // four calls are inside it. Every call this script makes is a read.
  const client = await connectMcp({ cwd: PROJECT_DIR, exposition: 'readonly,high', label: 'customization-extractor' });
  console.log('[cust] Connected.');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // GGB and BTE registrations are system-wide, not per-module. Scanning once and
  // slicing by application area keeps the heavy SQL off every module iteration.
  console.log('[cust] Scanning GGB0/GGB1 customer rules (GB03)...');
  const ggbAll = await scanGgbRulesAll(client);
  console.log(`[cust]   → ${ggbAll.rules?.length || 0} customer GGB rules`);
  console.log('[cust] Scanning BTE customer FMs (TBE24, TPS34)...');
  const bteAll = await scanBteImplementationsAll(client);
  console.log(`[cust]   → ${bteAll.implementations?.length || 0} customer BTE FMs`);
  const globalCache = { ggb: ggbAll.rules || [], bte: bteAll.implementations || [] };

  const summary = { modules: [], total: { smod: 0, badi: 0, formExits: 0, extensions: 0, ggb: 0, bte: 0 } };

  for (const mod of selectedModules) {
    const result = await extractForModule(client, mod, globalCache);
    if (!result) continue;
    writeModuleFiles(mod, result);

    const counts = {
      module: mod,
      smodExits: result.enhancements.smodExits.length,
      badiImpls: result.enhancements.badiImplementations.length,
      formExits: result.enhancements.formBasedExits.length,
      ggbRules: result.enhancements.ggbRules.length,
      bteImpls: result.enhancements.bteImplementations.length,
      tableExtensions: result.extensions.appendStructures.length,
    };
    summary.modules.push(counts);
    summary.total.smod += counts.smodExits;
    summary.total.badi += counts.badiImpls;
    summary.total.formExits += counts.formExits;
    summary.total.ggb += counts.ggbRules;
    summary.total.bte += counts.bteImpls;
    summary.total.extensions += counts.tableExtensions;
  }

  console.log('\n[cust] === Summary ===');
  for (const m of summary.modules) {
    console.log(`  ${m.module.padEnd(8)} SMOD:${m.smodExits}  BAdI:${m.badiImpls}  FormExit:${m.formExits}  GGB:${m.ggbRules}  BTE:${m.bteImpls}  TableExt:${m.tableExtensions}`);
  }
  console.log(`  TOTAL    SMOD:${summary.total.smod}  BAdI:${summary.total.badi}  FormExit:${summary.total.formExits}  GGB:${summary.total.ggb}  BTE:${summary.total.bte}  TableExt:${summary.total.extensions}`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[cust] Fatal error:', err);
  process.exit(1);
});
