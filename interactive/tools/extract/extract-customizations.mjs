#!/usr/bin/env node
//
// Customization (Enhancement + Extension) inventory extractor — sapkit `tools/extract/`
//
// Parses standard exit / BAdI / append-structure definitions from
// `core/knowledge/modules/{MODULE}/enhancements.md`, then queries the live SAP
// system (via the bundled MCP server) to find which of them the customer has
// actually implemented with Z-namespace or Y-namespace objects. Writes the
// inventory that [customization-lookup](../../core/procedures/customization-lookup.md)
// Step 1 consumes:
//
//   <project>/.sapkit/customizations/{MODULE}/enhancements.json  (BAdI impls, SMOD→CMOD, form exits, GGB, BTE)
//   <project>/.sapkit/customizations/{MODULE}/extensions.json    (append structures + custom fields)
//
// Persistence rules (unchanged from the original):
//   - BAdI  -> record only when at least one Z/Y implementation exists
//   - SMOD  -> record only when a CMOD project includes this enhancement AND
//              the CMOD project is Z/Y (proof the customer turned it on)
//   - Append structures / custom fields -> always recorded when any Z/Y append
//              or field exists on the base table; written to extensions.json
//
// ─────────────────────── APPROVAL GATE — read before running ───────────────
// Two of the scans issue `GetSqlQuery` (MODACT/MODATTR, GB03, TBE24, TPS34), so
// this is a **P2 row-data extraction** (AGENTS.md) and Gate B of
// [approval-gates](../../core/policies/approval-gates.md) applies.
//
//   • The **human runs this command.** An agent must not run it on the user's
//     behalf, must not hand it to a subagent, and must not use it to sidestep
//     the per-call approval it would otherwise owe. Gate B(c) — "subagent and
//     batch use are prohibited" — has no exception path.
//   • `--dry-run` discloses the scope offline: modules, what was parsed out of
//     each `enhancements.md`, the exact SQL scans, and the output paths.
//     Running without `--dry-run` is the human's approval act for that scope.
//   • Allowed scope is **enhancement registration metadata** — which standard
//     exit the customer switched on, and the names of the Z objects doing it.
//     `MODACT`/`MODATTR` (CMOD projects), `GB03` (GGB0/GGB1 rule headers) and
//     `TBE24`/`TPS34` (BTE FM registrations) are Customizing/registration
//     tables, not transactional or personal data. The other scans
//     (`GetEnhancementSpot`, `GetInclude`, `GetTable`, `SearchObject`) are
//     repository/DDIC reads — P1, not row data.
//   • This script never sets `acknowledge_risk`, so the server-side blocklist
//     floor still decides. A refused table simply yields no findings; nothing
//     is cached from a refusal.
//   • [data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md)
//     stays authoritative for everything else.
//
// Usage (run from the project root — the directory holding `.sapkit/`):
//   node tools/extract/extract-customizations.mjs --dry-run SD MM
//   node tools/extract/extract-customizations.mjs SD MM FI CO
//   node tools/extract/extract-customizations.mjs all
//
// ─────────────────────── Runtime directory (D-057) ──────────────────────────
// The inventory lands beside the cwd's runtime dir, or names the `.sapkit`
// creation site when the project has none (R-NEW). `--resolve-only` prints the
// selection offline.
//
// ──────── Transform note (sc4sap-custom `scripts/extract-customizations.mjs`) ────────
// Parsers, heuristics, filters and output shape are unchanged. What differs:
//   • source of enhancement lists: `configs/{MODULE}/enhancements.md` →
//     `core/knowledge/modules/{MODULE}/enhancements.md`
//   • transport: `@modelcontextprotocol/sdk` → `./lib/mcp-stdio.mjs` (this
//     plugin ships no npm dependencies)
//   • server: `engine/server.bundle.cjs` (started with **no** env path, which
//     left the broker on a mock connection) → `server/launch.cjs`, which
//     resolves the active profile from the cwd. Exposition `readonly,high`:
//     `GetTable` is not in the `readonly` set, everything else this script
//     calls is; the script itself only ever issues the read calls listed above
//   • output base: `resolveArtifactBase()` (`.sapkit/work/<alias>/`) →
//     `<cwd>/.sapkit/customizations/`. Multi-profile artifact resolution is
//     classified `obsolete` in MIGRATION-MANIFEST, and the consumer contract in
//     customization-lookup.md / project-context.md is the plain `.sapkit/` path
//   • tool arguments realigned with the bundled engine's current schemas —
//     `GetEnhancementSpot` takes `enhancement_spot` (not `enhancement_spot_name`)
//     and `SearchObject` takes `object_name` / `object_type` / `maxResults`
//     (not `query` / `objectType` / `max_results`). The frozen original would
//     have been rejected with InvalidParams on both
//   • bare invocation used to mean `all` silently; it now prints usage and
//     exits 2 — scope must be stated explicitly (Gate B)
//   • `--dry-run` added (offline scope disclosure)
//   • **defect repair, not a scope change**: the section detector matched
//     `\bbadi\b`, which never matches the plural header the shipped files
//     actually use ("## 2. BAdIs / 비즈니스 애드인" — 13 of 15 modules). The
//     BAdI bucket therefore filled only by accident, via a later
//     "Enhancement Spots" header, and stayed empty in FI/CO/BW/TM/WM — while
//     customization-lookup.md's contract requires `badiImplementations[]`.
//     Now `\bbadis?\b` in both the `##` and `###` detectors. Nothing new is
//     read from SAP: the same GetEnhancementSpot call is simply made for the
//     BAdI names the original meant to collect.
//

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMcp } from './lib/mcp-stdio.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KNOWLEDGE_DIR = resolve(PLUGIN_ROOT, 'core', 'knowledge', 'modules');
const PROJECT_DIR = process.cwd();

// ── runtime directory (D-057) ───────────────────────────────────────────────
const NEW_DIR = '.sapkit';

// Existence is this tool's criterion — depth 0, no walk-up.
function pickRuntimeDir(dir) {
  const candidate = join(dir, NEW_DIR);
  return existsSync(candidate) ? candidate : null;
}

// R-E + R-NEW: write where this project already keeps runtime state; `.sapkit`
// when it keeps none.
const RUNTIME_DIR = pickRuntimeDir(PROJECT_DIR) ?? join(PROJECT_DIR, NEW_DIR);
const OUTPUT_DIR = join(RUNTIME_DIR, 'customizations');

const Z_PATTERN = /^[ZY]/i;

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
// Pure path computation: no module list, no MCP server, no SAP connection.
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

const positional = argv.filter((a) => !a.startsWith('-'));
if (positional.length === 0) {
  console.error(USAGE);
  process.exit(2);
}

let selectedModules = positional;
if (positional[0] === 'all') {
  selectedModules = readdirSync(KNOWLEDGE_DIR).filter((d) => {
    try {
      return statSync(resolve(KNOWLEDGE_DIR, d)).isDirectory() && d !== 'common';
    } catch {
      return false;
    }
  });
}

console.log(`[cust] Modules: ${selectedModules.join(', ')}`);

/* ──────────────────── enhancements.md parser ──────────────────── */

/**
 * Parse `core/knowledge/modules/{MODULE}/enhancements.md` into structured
 * section buckets. Section detection is heuristic — based on the `##` / `###`
 * headers used across the shipped files (CMOD/SMOD, BAdIs, Enhancement Spots,
 * Form-based user exits, VOFM, Custom Fields / Append Structures).
 */
function parseEnhancementsMd(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/);

  const sections = {
    smod: [],         // classic SMOD enhancement names (e.g. V45A0001)
    badi: [],         // BAdI / Enhancement Spot names (BADI_SD_SALES, ES_SAPLV45A)
    formExits: [],    // include programs (MV45AFZZ, RV60AFZZ, ZXRSRU01…)
    appends: [],      // { append, baseTable }
  };

  let mode = null; // 'smod' | 'badi' | 'formExits' | 'appends' | null

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+/.test(raw)) {
      const h = raw.toLowerCase();
      if (/\bcustomer exits\b|\bcmod\/smod\b|\bclassic\b/.test(h)) mode = 'smod';
      else if (/\bbadis?\b|\benhancement spots\b/.test(h)) mode = 'badi';
      else if (/\bform[\s-]?based\b|\binclude programs\b|\bmodule-specific\b/.test(h)) mode = 'formExits';
      else if (/\bcustom fields\b|\bappend structures\b/.test(h)) mode = 'appends';
      else mode = null;
      continue;
    }
    if (/^###\s+/.test(raw)) {
      const h = raw.toLowerCase();
      if (/\bform[\s-]?based\b|\binclude\b/.test(h)) mode = 'formExits';
      else if (/\bappend\b|\bcustom fields\b/.test(h)) mode = 'appends';
      else if (/\bbadis?\b/.test(h)) mode = 'badi';
      continue;
    }

    const m = line.match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (!m) continue;
    const col1 = m[1].trim().replace(/\*+/g, '').trim();
    const col2 = m[2].trim().replace(/\*+/g, '').trim();
    const col3 = m[3].trim().replace(/\*+/g, '').trim();
    if (!col1 || col1 === 'Name' || col1 === 'Include' || col1 === 'Append' || col1.startsWith('---')) continue;

    if (mode === 'smod') {
      if (/^[A-Z][A-Z0-9_]{5,}$/.test(col1)) sections.smod.push({ name: col1, description: col3 });
    } else if (mode === 'badi') {
      if (/^[A-Z][A-Z0-9_]+$/.test(col1)) sections.badi.push({ name: col1, description: col3 });
    } else if (mode === 'formExits') {
      if (/^[A-Z][A-Z0-9_]{3,}$/.test(col1)) sections.formExits.push({ include: col1, routines: col3 });
    } else if (mode === 'appends') {
      // In SD the header row is | Append | Table | System | Description |
      // col2 may contain the base table; otherwise skip
      if (/^[A-Z][A-Z0-9_]+$/.test(col1)) sections.appends.push({ append: col1, baseTable: col2, description: col3 });
    }
  }

  return sections;
}

/* ──────────────────── MCP helpers ──────────────────── */

async function callTool(client, name, args) {
  try {
    const r = await client.callTool({ name, arguments: args });
    const text = r?.content?.[0]?.text;
    if (!text) return { ok: false, error: 'empty response' };
    // Some tools return JSON; others return XML/text. Try parsing JSON, else return raw.
    try { return { ok: true, json: JSON.parse(text), raw: text }; }
    catch { return { ok: true, raw: text }; }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// BAdI — fetch enhancement spot and extract Z/Y implementations.
async function scanBadiImplementations(client, badiName) {
  const r = await callTool(client, 'GetEnhancementSpot', { enhancement_spot: badiName });
  if (!r.ok) {
    // Not every row in enhancements.md is a real enhancement spot — some are
    // BAdI definitions. Fall back to a SearchObject lookup and move on silently.
    const s = await callTool(client, 'SearchObject', { object_name: badiName, object_type: 'BADI', maxResults: 5 });
    return { ok: r.ok || s.ok, implementations: [], spot: r.raw || s.raw || null };
  }
  // Try to extract implementation class names from the response text.
  const raw = r.raw || '';
  const impls = new Set();
  // Look for ZCL_IM_*, ZCL_*_IMPL, or Z*_IMPL patterns in the payload
  for (const m of raw.matchAll(/\b([ZY][A-Z0-9_]{2,30})\b/g)) impls.add(m[1]);
  return { ok: true, implementations: [...impls].filter((n) => Z_PATTERN.test(n)) };
}

// SMOD — find ACTIVE CMOD projects (Z/Y namespace) including this enhancement.
// Tables used:
//   MODACT  — CMOD project ↔ SMOD membership (NAME=project, MEMBER=SMOD name)
//   MODATTR — CMOD project header; STATUS='A' means activated in CMOD
// Both are Customizing/metadata tables (not transactional row data).
// Historical note: prior code queried MODSAP here, which is the SAP-delivered
// SMOD definition repository and holds no customer CMOD membership at all —
// every call returned 0 rows regardless of system state (see issue #29).
async function scanSmodCmod(client, smodName) {
  const sql =
    'SELECT a~NAME, a~MEMBER FROM MODACT AS a '
    + 'INNER JOIN MODATTR AS b ON a~NAME = b~NAME '
    + `WHERE b~STATUS = 'A' AND a~MEMBER = '${smodName}'`;
  const r = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 50 });
  if (!r.ok || !r.json) return { ok: false, error: r.error || 'no MODACT data' };
  const rows = r.json.rows || [];
  const cmodProjects = rows
    .map((row) => row.NAME || row.name)
    .filter((n) => n && Z_PATTERN.test(n));
  return { ok: true, cmodProjects };
}

/** Form-based user exits — check if the include file contains Z forms or
 *  USEREXIT forms with non-empty bodies. Simple heuristic: if GetInclude
 *  returns source longer than a threshold, mark as "customized". */
async function scanFormExit(client, includeName) {
  const r = await callTool(client, 'GetInclude', { include_name: includeName });
  if (!r.ok) return { ok: false };
  const src = r.raw || '';
  // Strip comments; count non-empty, non-* lines
  const meaningful = src
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('*'))
    .length;
  // Heuristic: a "pristine" SAP include is typically a few dozen lines of FORM stubs.
  // Anything >150 lines strongly suggests customer code inside FORMs.
  return { ok: true, customized: meaningful > 150, lineCount: meaningful };
}

// GGB0 (Substitution) / GGB1 (Validation) / GGB4 (Rule) — scan GB03 for
// customer-namespace rule names (VSR_NAME starting with Z/Y) that are active.
// BTYP encoding:
//   1 = Validation (GGB1)
//   2 = Substitution (GGB0)
//   3 = Rule
// GB03 is Customizing metadata — the VSR_NAME / BCLASS / APPLAREA / CALLUP_P
// keys describe the rule, not transaction row data, so it is not blocklisted
// (same category as MODACT/MODATTR used in scanSmodCmod above).
async function scanGgbRulesAll(client) {
  const sql = "SELECT VSR_NAME, BCLASS, BTYP, BSTAT, APPLAREA, CALLUP_P FROM GB03 "
            + "WHERE BSTAT = 'A' AND (VSR_NAME LIKE 'Z%' OR VSR_NAME LIKE 'Y%')";
  const r = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 500 });
  if (!r.ok || !r.json) return { ok: false, rules: [], error: r.error || 'no GB03 data' };
  const rows = r.json.rows || [];
  const rules = rows.map((row) => ({
    name: row.VSR_NAME || row.vsr_name,
    type: ({ '1': 'validation', '2': 'substitution', '3': 'rule' })[String(row.BTYP || row.btyp)] || 'unknown',
    bclass: row.BCLASS || row.bclass,
    applArea: row.APPLAREA || row.applarea,
    callupPoint: row.CALLUP_P || row.callup_p,
    status: 'active',
  })).filter((x) => x.name && Z_PATTERN.test(x.name));
  return { ok: true, rules };
}

// BTE (Business Transaction Events, FIBF / BF11 / BF24 / BF34) — scan the two
// customer-FM registration tables:
//   TBE24 — Publish/Subscribe customer product → FM (IFNR = P/S interface)
//   TPS34 — Process Interface customer product → FM (IFNR = process interface)
// Filter by FUNCTION starting with Z/Y (customer-namespace FM). EVENT is the
// numeric event id (e.g. 00001025 = FI_TRANSFER_CUST_TO_SD). APPL is the
// application code (FI-AP, FI-AR, FI-GL, FI-BL, TR-CM, CA, PM, etc.) which
// we use downstream for module filtering.
async function scanBteImplementationsAll(client) {
  const out = { ok: true, implementations: [] };
  // Publish/Subscribe
  {
    const sql = "SELECT EVENT, APPL, PRODUCT, FUNCTION FROM TBE24 "
              + "WHERE FUNCTION LIKE 'Z%' OR FUNCTION LIKE 'Y%'";
    const r = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 500 });
    if (r.ok && r.json) {
      for (const row of r.json.rows || []) {
        const fn = row.FUNCTION || row.function;
        if (!fn || !Z_PATTERN.test(fn)) continue;
        out.implementations.push({
          kind: 'P/S',
          event: row.EVENT || row.event,
          application: row.APPL || row.appl,
          product: row.PRODUCT || row.product,
          function: fn,
        });
      }
    }
  }
  // Process Interface
  {
    const sql = "SELECT EVENT, APPL, PRODUCT, FUNCTION FROM TPS34 "
              + "WHERE FUNCTION LIKE 'Z%' OR FUNCTION LIKE 'Y%'";
    const r = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 500 });
    if (r.ok && r.json) {
      for (const row of r.json.rows || []) {
        const fn = row.FUNCTION || row.function;
        if (!fn || !Z_PATTERN.test(fn)) continue;
        out.implementations.push({
          kind: 'Process',
          event: row.EVENT || row.event,
          application: row.APPL || row.appl,
          product: row.PRODUCT || row.product,
          function: fn,
        });
      }
    }
  }
  return out;
}

// Module scope for GGB APPLAREA / BTE APPL filtering. Keys are module codes
// used in the script; values are substring prefixes checked case-insensitively
// against the rule's applArea / application field.
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
  const scope = MODULE_SCOPE[mod];
  if (!scope) return [];
  return items.filter((it) => {
    const v = String(it[field] || '').toUpperCase();
    if (!v) return false;
    return scope.some((p) => v.startsWith(p.toUpperCase()));
  });
}

// Append structures / custom fields on a base table.
// GetTable returns CDS-DDL in modern systems: `include ci_vbak_zz;` / `include z_append_vbak;`
// Classic SE11 format: `.APPEND.CI_VBAK`
// Accept both.
async function scanTableExtensions(client, baseTable) {
  const r = await callTool(client, 'GetTable', { table_name: baseTable });
  if (!r.ok) return { ok: false, error: r.error };
  const raw = r.raw || '';
  const cdsIncludes = [...raw.matchAll(/\binclude\s+(\w+)/gi)].map((m) => m[1].toUpperCase());
  const seAppends = [...raw.matchAll(/\.APPEND\.\s*([A-Z_][A-Z0-9_]*)/gi)].map((m) => m[1].toUpperCase());
  const allIncludes = [...new Set([...cdsIncludes, ...seAppends])];
  const customAppends = allIncludes.filter((n) => Z_PATTERN.test(n) || /^CI_/.test(n));
  // ZZ_*/YY_* customer fields declared inside the table body
  const zzFields = [...new Set(
    [...raw.matchAll(/\b((?:ZZ?|YY?)_[A-Z0-9_]{2,})\b/gi)].map((m) => m[1].toUpperCase())
  )];
  return { ok: true, appendStructures: customAppends, customFields: zzFields };
}

/* ──────────────────── orchestration ──────────────────── */

async function extractForModule(client, mod, globalCache) {
  const mdPath = resolve(KNOWLEDGE_DIR, mod, 'enhancements.md');
  const parsed = parseEnhancementsMd(mdPath);
  if (!parsed) {
    console.warn(`[cust] ${mod}: enhancements.md not found — skipping`);
    return null;
  }
  console.log(`[cust] ${mod}: parsed ${parsed.smod.length} SMOD / ${parsed.badi.length} BAdI / ${parsed.formExits.length} form-exits / ${parsed.appends.length} appends`);

  const enhancements = {
    smodExits: [],
    badiImplementations: [],
    formBasedExits: [],
    ggbRules: [],
    bteImplementations: [],
  };
  const extensions = {
    appendStructures: [],
  };

  // 1) BAdI implementations
  for (const b of parsed.badi) {
    const r = await scanBadiImplementations(client, b.name);
    if (r.ok && r.implementations && r.implementations.length > 0) {
      enhancements.badiImplementations.push({
        standardName: b.name,
        description: b.description,
        customs: r.implementations.map((n) => ({ name: n, type: 'CLAS' })),
      });
      console.log(`  ✓ BAdI ${b.name} — ${r.implementations.length} Z impl`);
    }
  }

  // 2) SMOD → CMOD
  for (const s of parsed.smod) {
    const r = await scanSmodCmod(client, s.name);
    if (r.ok && r.cmodProjects && r.cmodProjects.length > 0) {
      enhancements.smodExits.push({
        standardName: s.name,
        description: s.description,
        customs: r.cmodProjects.map((n) => ({ name: n, type: 'CMOD' })),
      });
      console.log(`  ✓ SMOD ${s.name} — CMOD(${r.cmodProjects.join(', ')})`);
    }
  }

  // 3) Form-based user exits
  for (const f of parsed.formExits) {
    const r = await scanFormExit(client, f.include);
    if (r.ok && r.customized) {
      enhancements.formBasedExits.push({
        include: f.include,
        routines: f.routines,
        lineCount: r.lineCount,
      });
      console.log(`  ✓ Form-exit ${f.include} — ${r.lineCount} lines (likely customized)`);
    }
  }

  // 4) GGB0/GGB1/Rule — from the pre-computed global scan, filtered by APPLAREA
  if (globalCache?.ggb && MODULE_SCOPE[mod]) {
    const mine = filterByModuleScope(globalCache.ggb, mod, 'applArea');
    if (mine.length) {
      enhancements.ggbRules = mine;
      for (const g of mine) {
        console.log(`  ✓ GGB ${g.type.padEnd(12)} ${g.name} — ${g.applArea}/${g.callupPoint || '*'}`);
      }
    }
  }

  // 5) BTE — from the pre-computed global scan, filtered by APPL
  if (globalCache?.bte && MODULE_SCOPE[mod]) {
    const mine = filterByModuleScope(globalCache.bte, mod, 'application');
    if (mine.length) {
      enhancements.bteImplementations = mine;
      for (const b of mine) {
        console.log(`  ✓ BTE ${b.kind.padEnd(8)} ${b.event} [${b.application}] → ${b.function}`);
      }
    }
  }

  // 6) Append structures / custom fields on base tables
  const baseTables = [...new Set(parsed.appends.map((a) => a.baseTable).filter((t) => /^[A-Z][A-Z0-9_]+$/.test(t)))];
  for (const tbl of baseTables) {
    const r = await scanTableExtensions(client, tbl);
    if (r.ok && ((r.appendStructures && r.appendStructures.length) || (r.customFields && r.customFields.length))) {
      extensions.appendStructures.push({
        baseTable: tbl,
        appendStructures: r.appendStructures || [],
        customFields: r.customFields || [],
      });
      console.log(`  ✓ Table ${tbl} — ${r.appendStructures.length} append / ${r.customFields.length} Z field`);
    }
  }

  return { enhancements, extensions };
}

// Offline scope disclosure — parse only, report what would be read.
function dryRun() {
  console.log('\n[cust] DRY RUN — nothing was started and nothing was read.');
  console.log('[cust] Workspace-wide SQL scans that would run once:');
  console.log("  - GB03  (GGB0/GGB1 rules)  SELECT VSR_NAME, BCLASS, BTYP, BSTAT, APPLAREA, CALLUP_P … BSTAT='A' AND VSR_NAME LIKE 'Z%'/'Y%'  [cap 500]");
  console.log("  - TBE24 (BTE P/S)          SELECT EVENT, APPL, PRODUCT, FUNCTION … FUNCTION LIKE 'Z%'/'Y%'  [cap 500]");
  console.log("  - TPS34 (BTE Process)      SELECT EVENT, APPL, PRODUCT, FUNCTION … FUNCTION LIKE 'Z%'/'Y%'  [cap 500]");
  let missing = 0;
  for (const mod of selectedModules) {
    const mdPath = resolve(KNOWLEDGE_DIR, mod, 'enhancements.md');
    const parsed = parseEnhancementsMd(mdPath);
    if (!parsed) {
      console.warn(`[cust] ${mod}: enhancements.md not found — would be skipped`);
      missing++;
      continue;
    }
    const baseTables = [...new Set(parsed.appends.map((a) => a.baseTable).filter((t) => /^[A-Z][A-Z0-9_]+$/.test(t)))];
    console.log(
      `[cust] ${mod.padEnd(5)} SMOD ${String(parsed.smod.length).padStart(3)} (→ MODACT/MODATTR query each)` +
        ` · BAdI ${String(parsed.badi.length).padStart(3)} (GetEnhancementSpot)` +
        ` · form-exits ${String(parsed.formExits.length).padStart(3)} (GetInclude)` +
        ` · base tables ${String(baseTables.length).padStart(3)} (GetTable)`
    );
    console.log(`         output → ${join(OUTPUT_DIR, mod)} / {enhancements,extensions}.json`);
  }
  console.log(
    `[cust] Approval gate: re-running without --dry-run authorises exactly this scope. ` +
      `You are the approver — an agent must not run it for you (approval-gates.md Gate B).`
  );
  process.exit(missing === selectedModules.length ? 1 : 0);
}

async function main() {
  if (DRY_RUN) dryRun();

  console.log(`[cust] Project: ${PROJECT_DIR}`);
  console.log('[cust] Connecting to MCP server...');
  // `readonly,high` — GetTable is not exposed in the `readonly` set; the other
  // four calls are. This script issues read calls only.
  const client = await connectMcp({ cwd: PROJECT_DIR, exposition: 'readonly,high', label: 'customization-extractor' });
  console.log('[cust] Connected.');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // One-shot global scans — GGB (GB03) and BTE (TBE24 + TPS34) customer impls
  // are workspace-wide, not per-module; scanning once and filtering by
  // APPLAREA/APPL into each module's bucket avoids repeating heavy SQL on
  // every module iteration.
  console.log('[cust] Scanning GGB0/GGB1 customer rules (GB03)...');
  const ggbAll = await scanGgbRulesAll(client);
  console.log(`[cust]   → ${ggbAll.rules?.length || 0} customer GGB rules`);
  console.log('[cust] Scanning BTE customer FMs (TBE24, TPS34)...');
  const bteAll = await scanBteImplementationsAll(client);
  console.log(`[cust]   → ${bteAll.implementations?.length || 0} customer BTE FMs`);
  const globalCache = { ggb: ggbAll.rules || [], bte: bteAll.implementations || [] };

  const summary = { modules: [], total: { smod: 0, badi: 0, formExits: 0, extensions: 0, ggb: 0, bte: 0 } };

  for (const mod of selectedModules) {
    const res = await extractForModule(client, mod, globalCache);
    if (!res) continue;
    const modDir = resolve(OUTPUT_DIR, mod);
    mkdirSync(modDir, { recursive: true });

    const enhancementsPath = resolve(modDir, 'enhancements.json');
    const extensionsPath = resolve(modDir, 'extensions.json');

    writeFileSync(enhancementsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      module: mod,
      ...res.enhancements,
    }, null, 2), 'utf-8');
    writeFileSync(extensionsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      module: mod,
      ...res.extensions,
    }, null, 2), 'utf-8');

    summary.modules.push({
      module: mod,
      smodExits: res.enhancements.smodExits.length,
      badiImpls: res.enhancements.badiImplementations.length,
      formExits: res.enhancements.formBasedExits.length,
      ggbRules: res.enhancements.ggbRules.length,
      bteImpls: res.enhancements.bteImplementations.length,
      tableExtensions: res.extensions.appendStructures.length,
    });
    summary.total.smod += res.enhancements.smodExits.length;
    summary.total.badi += res.enhancements.badiImplementations.length;
    summary.total.formExits += res.enhancements.formBasedExits.length;
    summary.total.ggb += res.enhancements.ggbRules.length;
    summary.total.bte += res.enhancements.bteImplementations.length;
    summary.total.extensions += res.extensions.appendStructures.length;
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

main().catch((e) => {
  console.error('[cust] Fatal error:', e);
  process.exit(1);
});
