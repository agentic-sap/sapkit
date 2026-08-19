/**
 * Table extraction blocklist — the server-side floor under row extraction.
 *
 * Even when the client in front of the server enforces nothing, this guard
 * refuses row-returning calls against tables that hold PII, credentials,
 * payroll, banking or other protected data. Schema-only reads (a table's DDIC
 * definition, a structure, a view) are untouched — they return metadata, not
 * rows.
 *
 * ## Levels
 *   `minimal`   PII and credentials
 *   `standard`  minimal + protected business data          ← **default**
 *   `strict`    standard + audit/security + communication
 *   `off`       guard disabled entirely (not recommended)
 *
 * ## Knobs
 *   `MCP_BLOCKLIST_PROFILE`  one of the level names above
 *   `MCP_BLOCKLIST_EXTEND`   extra names/patterns, always denied
 *   `MCP_ALLOW_TABLE`        exact names to wave through, audited
 *
 * The default is locked: with no knobs at all, `standard` applies. An
 * unrecognised level name falls back to `standard` rather than opening the
 * guard, so a typo can only tighten, never loosen.
 *
 * Two deliberate departures from the engine this contract was measured from —
 * departures, not oversights, and recorded as such:
 *
 *  - **The knobs are read from a caller-supplied environment**, not from
 *    `process.env` behind the caller's back. The old loader wiped these three
 *    keys out of `process.env` on startup, which left the active profile's
 *    `sap.env` as their only working channel and silently ignored a value set
 *    in an MCP server definition. Here the caller composes the environment —
 *    see {@link resolveSafetyEnv} — and both channels work, **but only in the
 *    tightening direction from the process environment**. Loosening stays with
 *    the profile file. That asymmetry is not decoration; `resolveSafetyEnv`
 *    documents the measurement that forced it.
 *
 *    This one is not a new judgement: the repo's own gate already treats it as
 *    the wanted behaviour. `interactive/scripts/conformance-server-gates.mjs`
 *    records it as **GAP-2** — "the blocklist env knobs are not carried into
 *    the server process env" — which is the gap this closes.
 *  - **Nothing is written to stderr from inside this module.** Audit lines are
 *    returned to the caller, which owns the process's output streams.
 */

export type BlocklistAction = 'deny' | 'ask';
export type BlocklistLevel = 'minimal' | 'standard' | 'strict';
export type BlocklistProfileName = BlocklistLevel | 'off';

export const DEFAULT_BLOCKLIST_PROFILE: BlocklistProfileName = 'standard';

export interface BlocklistHit {
  readonly table: string;
  readonly category: string;
  readonly level: BlocklistLevel;
  readonly action: BlocklistAction;
  readonly why: string;
}

export interface BlocklistConfig {
  readonly profile: BlocklistProfileName;
  readonly extend: CompiledNames;
  readonly allow: ReadonlySet<string>;
}

export interface BlocklistResult {
  readonly hits: BlocklistHit[];
  /** Names waved through by `MCP_ALLOW_TABLE`. */
  readonly bypassed: string[];
  /** Lines the caller should write to its audit channel. */
  readonly audit: string[];
}

export type BlocklistVerdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'deny'; readonly message: string }
  | { readonly kind: 'ask'; readonly message: string }
  | { readonly kind: 'approved'; readonly tables: string[] };

const LEVEL_DEPTH: Record<BlocklistLevel, number> = { minimal: 1, standard: 2, strict: 3 };

// ── the built-in list ───────────────────────────────────────────────────────
// Inherited configuration, not inherited code: these are the SAP tables the
// shipped guard protects, and dropping any of them would lower the floor.
// `*` stands for `[A-Z0-9_]*` and matching is case-insensitive.

interface Category {
  readonly category: string;
  readonly level: BlocklistLevel;
  readonly action: BlocklistAction;
  readonly why: string;
  readonly names: readonly string[];
}

const CATEGORIES: readonly Category[] = [
  {
    category: 'Banking / Payment',
    level: 'minimal',
    action: 'deny',
    why: 'Customer/vendor bank account credentials',
    names: [
      'BNKA', 'KNBK', 'LFBK', 'BUT0BK', 'T012K', 'REGUH', 'REGUP', 'PAYR',
      'FPLT', 'FPLTC', 'CCARD', 'TCRCO', 'BSEGC', 'FPAYH', 'FPAYHX', 'FPAYP',
      'FPAYPX',
    ],
  },
  {
    category: 'Customer / Vendor Master PII',
    level: 'minimal',
    action: 'deny',
    why: 'Name, address, tax ID, DUNS, business-partner core PII',
    names: [
      'KNA1', 'KNB1', 'KNVK', 'KNVV', 'KNVL', 'LFA1', 'LFB1', 'LFM1', 'LFM2',
      'BUT000', 'BUT020', 'BUT021', 'BUT021_FS', 'BUT050', 'BUT051', 'BUT100',
      'BUT0ID', 'BUT0BANK',
    ],
  },
  {
    category: 'Addresses / Communication',
    level: 'minimal',
    action: 'deny',
    why: 'Address, phone, fax, email, URL — PII',
    names: [
      'ADRC', 'ADRP', 'ADR2', 'ADR3', 'ADR6', 'ADR7', 'ADR9', 'ADR11', 'ADR12',
      'ADR13', 'ADRT', 'ADRCT',
    ],
  },
  {
    category: 'Authentication / Authorization / Security',
    level: 'minimal',
    action: 'deny',
    why: 'Password hashes, authorization values, RFC secrets, crypto keys',
    names: [
      'USR02', 'USH02', 'USRBF2', 'USR01', 'USR04', 'USR10', 'USR12', 'USR21',
      'USR22', 'USR40', 'USR41', 'USR_CUST', 'AGR_1251', 'AGR_USERS',
      'AGR_AGRS', 'PRGN_CUST', 'RFCDES', 'RSECACTB', 'RSECTAB', 'SNCSYSACL',
      'SSF_PSE_D',
    ],
  },
  {
    category: 'HR / Payroll / Personnel',
    level: 'minimal',
    action: 'deny',
    why: 'Employee PII, salary, payroll results, medical data',
    names: [
      'PA*', 'PB9*', 'PD9*', 'HRP*', 'PCL1', 'PCL2', 'PCL3', 'PCL4', 'PCL5',
      'T526',
    ],
  },
  {
    category: 'Tax / Government IDs',
    level: 'minimal',
    action: 'deny',
    why: 'Tax IDs, VAT registrations, national IDs',
    names: [
      'DFKKBPTAXNUM', 'TFKTAXNUMTYPE', 'J_1BTXIC3', 'J_1BNFDOC', 'KNAS',
      'LFAS', 'BUT0TX',
    ],
  },
  {
    category: 'Protected Business Data',
    level: 'standard',
    action: 'ask',
    why: 'Transactional data linked to customer/vendor PII; allow only with an authorized scope',
    names: [
      'VBRK', 'VBRP', 'VBAK', 'VBAP', 'VBPA', 'EKKO', 'EKPO', 'BKPF', 'BSEG',
      'ACDOCA', 'FAGLFLEXA', 'FAGLFLEXT', 'CDHDR', 'CDPOS', 'STXH', 'STXL',
    ],
  },
  {
    category: 'Audit / Security Logs',
    level: 'strict',
    action: 'deny',
    why: 'May carry PII in message variables and user activity traces',
    names: [
      'BALDAT', 'BALHDR', 'SLG1', 'SLGD', 'RSAU_BUF_DATA', 'SNAP', 'SMONI',
      'SWNCMONI', 'SWNCT*', 'STAD', 'STATTRACE', 'DBTABLOG',
    ],
  },
  {
    category: 'Communication & Workflow',
    level: 'strict',
    action: 'deny',
    why: 'Mail bodies, workflow context, broadcast records',
    names: [
      'SOOD', 'SOC3', 'SOST', 'SOFM', 'SWWWIHEAD', 'SWWCONT', 'SWWLOGHIST',
      'BCST_SR', 'BCST_CAM',
    ],
  },
];

// ── name matching ───────────────────────────────────────────────────────────

export interface CompiledNames {
  readonly exact: ReadonlySet<string>;
  readonly patterns: readonly RegExp[];
}

function compileNames(names: readonly string[]): CompiledNames {
  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  for (const raw of names) {
    const name = raw.trim().toUpperCase();
    if (!name) continue;
    if (name.includes('*')) patterns.push(new RegExp(`^${name.replace(/\*/g, '[A-Z0-9_]*')}$`));
    else exact.add(name);
  }
  return { exact, patterns };
}

function matches(compiled: CompiledNames, table: string): boolean {
  return compiled.exact.has(table) || compiled.patterns.some((pattern) => pattern.test(table));
}

interface CompiledCategory extends Omit<Category, 'names'> {
  readonly compiled: CompiledNames;
}

const COMPILED: readonly CompiledCategory[] = CATEGORIES.map(({ names, ...rest }) => ({
  ...rest,
  compiled: compileNames(names),
}));

// ── configuration ───────────────────────────────────────────────────────────

type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * Compose the environment the safety layer reads.
 *
 * Both channels work — the process environment and the active profile's own
 * `sap.env` — but they are **not symmetric**, and the asymmetry is the point:
 *
 *   **the process environment may tighten this guard, never loosen it.**
 *
 * Why the rule exists. On the owner's machines the per-call human approval for
 * row extraction is replaced by this server-side floor (decision D-043), which
 * makes "who can lower the floor" the whole value of that exception. A plain
 * `{...processEnv, ...profileEnv}` merge sounds like "the profile wins", but it
 * only wins **for keys the profile actually spells out** — and the product's own
 * setup wizard writes just one of the three (`interactive/scripts/setup-state.mjs`
 * `ENV_KEYS`). So a profile created by the wizard opposed nothing on
 * `MCP_ALLOW_TABLE`, and anything able to set that variable for the server
 * process could wave a protected table through. Measured, not theorised: a
 * profile with no blocklist keys plus `MCP_ALLOW_TABLE=BNKA` in the process
 * environment let a bank-account table (a `minimal`-level deny) reach SAP.
 *
 * So each knob is composed by its direction:
 *
 *   `MCP_ALLOW_TABLE`       loosens only  → **active profile file only**
 *   `MCP_BLOCKLIST_PROFILE` either way    → profile sets the floor; the process
 *                                           environment may only raise it
 *   `MCP_BLOCKLIST_EXTEND`  tightens only → **union** of both channels
 *
 * This keeps the repair the old GAP-2 asked for (env knobs are no longer thrown
 * away) while the one direction that matters for safety stays owned by a file
 * outside the repository, written by the operator.
 *
 * Everything else merges as before: profile over process.
 */
export function resolveSafetyEnv(
  processEnv: EnvLike,
  profileEnv: Readonly<Record<string, string>>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...processEnv, ...profileEnv };
  merged.MCP_ALLOW_TABLE = profileEnv.MCP_ALLOW_TABLE;
  merged.MCP_BLOCKLIST_PROFILE = tightestLevel(processEnv.MCP_BLOCKLIST_PROFILE, profileEnv.MCP_BLOCKLIST_PROFILE);
  merged.MCP_BLOCKLIST_EXTEND = unionNames(processEnv.MCP_BLOCKLIST_EXTEND, profileEnv.MCP_BLOCKLIST_EXTEND);
  return merged;
}

/** Depth of each level name. `off` is below every guarding level. */
const PROFILE_DEPTH: Record<BlocklistProfileName, number> = {
  off: -1,
  minimal: 0,
  standard: 1,
  strict: 2,
};

/**
 * The floor is whatever the profile says (its absence means the locked
 * default); the process environment replaces it only when strictly deeper.
 * An unrecognised name is already normalised to `standard` by
 * {@link readProfileName}, so a typo cannot dig under the default either.
 */
function tightestLevel(fromProcess: string | undefined, fromProfile: string | undefined): string | undefined {
  if (fromProcess === undefined) return fromProfile;
  const floor = fromProfile === undefined ? DEFAULT_BLOCKLIST_PROFILE : readProfileName(fromProfile);
  const candidate = readProfileName(fromProcess);
  if (PROFILE_DEPTH[candidate] > PROFILE_DEPTH[floor]) return candidate;
  return fromProfile ?? floor;
}

/** Both lists deny, so neither channel may erase the other's entries. */
function unionNames(fromProcess: string | undefined, fromProfile: string | undefined): string | undefined {
  const parts = [fromProfile, fromProcess].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (parts.length === 0) return fromProfile ?? fromProcess;
  return parts.join(',');
}

export function readBlocklistConfig(env: EnvLike = process.env): BlocklistConfig {
  return {
    profile: readProfileName(env.MCP_BLOCKLIST_PROFILE),
    extend: compileNames(splitNames(env.MCP_BLOCKLIST_EXTEND)),
    allow: new Set(splitNames(env.MCP_ALLOW_TABLE)),
  };
}

function readProfileName(raw: string | undefined): BlocklistProfileName {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'minimal' || value === 'standard' || value === 'strict') {
    return value;
  }
  return DEFAULT_BLOCKLIST_PROFILE;
}

function splitNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0);
}

// ── evaluation ──────────────────────────────────────────────────────────────

/** Check candidate table names against the active configuration. */
export function checkTables(names: readonly string[], config: BlocklistConfig): BlocklistResult {
  const hits: BlocklistHit[] = [];
  const bypassed: string[] = [];
  const audit: string[] = [];
  if (config.profile === 'off') return { hits, bypassed, audit };

  const seen = new Set<string>();
  for (const raw of names) {
    const table = raw.trim().toUpperCase();
    if (!table || seen.has(table)) continue;
    seen.add(table);

    if (config.allow.has(table)) {
      bypassed.push(table);
      audit.push(`AUDIT: MCP_ALLOW_TABLE bypass for ${table}`);
      continue;
    }

    const hit = matchBuiltIn(table, config.profile) ?? matchExtend(table, config.extend);
    if (hit) hits.push(hit);
  }
  return { hits, bypassed, audit };
}

function matchBuiltIn(table: string, profile: BlocklistProfileName): BlocklistHit | null {
  if (profile === 'off') return null;
  const depth = LEVEL_DEPTH[profile];
  for (const category of COMPILED) {
    if (LEVEL_DEPTH[category.level] > depth) continue;
    if (!matches(category.compiled, table)) continue;
    return {
      table,
      category: category.category,
      level: category.level,
      action: category.action,
      why: category.why,
    };
  }
  return null;
}

function matchExtend(table: string, extend: CompiledNames): BlocklistHit | null {
  if (!matches(extend, table)) return null;
  return {
    table,
    category: 'Operator extend list',
    level: 'minimal',
    action: 'deny',
    why: 'Listed in MCP_BLOCKLIST_EXTEND',
  };
}

/**
 * Fold a set of candidate tables into one verdict.
 *
 * `deny` outranks `ask`: acknowledging a risk cannot unlock a table that is
 * refused outright. `approved` means every hit was ask-tier and the caller
 * supplied an acknowledgement — the caller must record the audit line.
 */
export function evaluateTables(
  names: readonly string[],
  config: BlocklistConfig,
  acknowledgeRisk: boolean,
): BlocklistResult & { readonly verdict: BlocklistVerdict } {
  const result = checkTables(names, config);
  return { ...result, verdict: verdictFor(result.hits, config, acknowledgeRisk) };
}

function verdictFor(
  hits: readonly BlocklistHit[],
  config: BlocklistConfig,
  acknowledgeRisk: boolean,
): BlocklistVerdict {
  if (hits.length === 0) return { kind: 'pass' };

  const ask = hits.filter((hit) => hit.action === 'ask');
  if (ask.length !== hits.length) return { kind: 'deny', message: refusal(hits, config) };
  if (!acknowledgeRisk) return { kind: 'ask', message: askPrompt(ask, config) };
  return { kind: 'approved', tables: ask.map((hit) => hit.table) };
}

function listHits(hits: readonly BlocklistHit[]): string {
  return hits.map((hit) => `  - ${hit.table} — ${hit.category}: ${hit.why}`).join('\n');
}

function refusal(hits: readonly BlocklistHit[], config: BlocklistConfig): string {
  return (
    `sapkit blocklist (profile: ${config.profile}) — row extraction refused:\n${listHits(hits)}\n\n` +
    'Schema metadata is unaffected. For rows, use a released CDS view that masks the sensitive ' +
    'fields, anonymized test data, or a COUNT/SUM aggregate. An audited one-off bypass is ' +
    'MCP_ALLOW_TABLE=<NAME[,NAME...]>.'
  );
}

function askPrompt(hits: readonly BlocklistHit[], config: BlocklistConfig): string {
  return (
    `sapkit blocklist (profile: ${config.profile}) — user confirmation required for row extraction:\n${listHits(hits)}\n\n` +
    'These tables hold sensitive business data. If the user has authorized this extraction, ' +
    're-invoke the tool with `acknowledge_risk: true`; the approval is written to the audit ' +
    'channel. Prefer a masking CDS view, anonymized test data, or an aggregate.'
  );
}
