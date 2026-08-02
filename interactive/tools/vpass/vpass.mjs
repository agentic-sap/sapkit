#!/usr/bin/env node
/**
 * V-PASS runner — sapkit `tools/vpass/`
 *
 * Runs the **completion-evidence chain** for objects already applied to SAP and
 * writes a machine-readable verdict record. V-PASS is one of the two stamps a
 * completion needs (the other is the fresh-context review `R-PASS`) — see
 * create-program.md "Completion state", create-object.md, modify-object.md.
 *
 * The point of this runner is that the **applying tool's success response is not
 * evidence**. Whether the code was applied by Track B MCP, a human `vsp deploy`,
 * or abapGit, completion evidence is re-derived here from an independent oracle:
 * the vsp CLI reading the object back out of SAP.
 *
 *   ① source read-back   `vsp source read <TYPE> <NAME>`
 *                        with --source-dir: byte / normalized comparison to the
 *                        local intended source. Without it: read succeeded and
 *                        is non-empty — which is NOT enough for a V-PASS.
 *   ② active-state       Derived from ①. See "What counts as syntax evidence".
 *   ③ unit               `vsp test <TYPE> <NAME>` — P3 (executes ABAP), DEV tier
 *                        only, skipped with a recorded reason otherwise.
 *   ④ atc                `vsp atc <TYPE> <NAME>` — PASS iff 0 ERROR (priority 1)
 *                        and 0 WARN (priority 2) findings; INFO is recorded but
 *                        does not block (same bar as the verification.json gate:
 *                        "0 priority-1/2 findings").
 *
 * ─────────────── What counts as "syntax" evidence, and its limits ────────────
 * vsp has **no read-only server-side syntax check** — COMMANDS.md §③-11 判定:
 * absent. The only server-side syntax check vsp can reach is the one SAP runs
 * *on write* (`deploy` / `source write` / `source edit`), and this runner never
 * writes. So step ② does not re-check syntax; it records a **concordance
 * inference** and its limits:
 *
 *   - Basis (measured, VERIFY-PATTERNS.md "Phase 1.5", 2026-07-11): a deploy of
 *     syntactically broken source left SAP serving a rolled-back skeleton, not
 *     the submitted text. So "what SAP serves == what we intended" is evidence
 *     the intended text was accepted, not silently rejected.
 *   - Limit A — n=1. That rollback behaviour was observed once, on one system
 *     (IDES-DEV S4H/100), for a PROG. It is not a general SAP guarantee.
 *   - Limit B — not a fresh check. It reflects the state at the last successful
 *     write/activation. A later DDIC or dependency change can break an object
 *     without changing its source.
 *   - Limit C — active vs inactive is NOT distinguished. `vsp source read` GETs
 *     `…/source/main` with no `version=` parameter (vsp/pkg/adt/client.go:280),
 *     i.e. the ADT working-area default. A match therefore cannot by itself
 *     separate "activated" from "saved inactive by the same user".
 *   - Limit D — `vsp health` is NOT an activation signal. Its `staleness: ACTIVE`
 *     means "last changed ≤ 90 days ago" (vsp/cmd/vsp/devops.go
 *     stalenessCLIFromTime), nothing about activation. This runner does not use
 *     it, and neither should a reader of its record.
 *   - Consequence: the activation stamp itself stays with the applying side
 *     (MCP `ActivateObjects` + `GetInactiveObjects` empty, recorded in
 *     `verification.json`). V-PASS corroborates it from outside; it does not
 *     replace it. Every record repeats these limits in `limits[]`.
 *
 * ─────────────────────────── Who may run this ───────────────────────────────
 * Steps ①②④ are **P1 connected-read** (AGENTS.md) — no row data, no mutation,
 * no per-call approval. An agent may run that chain for the user; pass
 * `--skip-unit` to keep the run purely P1. This is deliberately weaker than the
 * `tools/extract/` gate, which is P2 row extraction and human-only.
 *
 * Step ③ `vsp test` is **P3**: ABAP Unit is code execution (SAFETY-PROFILES.md
 * §② "vsp test의 위치"), so it is attended, DEV tier only, and excluded from the
 * reviewer profile (§⑤). Machine part: this runner refuses the unit step unless
 * the resolved tier is DEV (fail-closed on an unresolved tier). Policy part: a
 * fresh-context reviewer runs with `--skip-unit`, and an agent does not trigger
 * the unit step without the human present in-session.
 *
 * This runner **never writes to SAP**. It calls only `system info`, `source read`,
 * `test`, `atc`, and it exports `SAP_READ_ONLY=true` into every child process, so
 * vsp's own write-profile gate (vsp.lock.json write_profile_gate) rejects any
 * write subcommand client-side, before any network call. Read commands and
 * `vsp test` are unaffected by that flag (measured — vsp-env.ps1 header).
 *
 * ────────────────────────────── Failure classes ─────────────────────────────
 * R-001: an environment failure must never be recorded as a code defect. Each
 * step carries `classification`, ported from `scripts/verify-sap.ps1` including
 * its ordering (LOCK before ENV, because the one measured 403 was an ENQUEUE
 * lock): `LOCK` → `ENV` → `TOOL` (vsp cannot handle this object type) → `CODE`.
 * Unparseable output is `PARSE` with status `UNKNOWN` — fail-closed, never a
 * silent pass, never a code defect.
 *
 * Verdict is `V-PASS` only when every object cleared every required step with a
 * successfully parsed oracle output. Anything else is `V-FAIL` (a CODE-class
 * failure), `ENV_BLOCKED` (environment/lock), or `INCOMPLETE` (skips, unknowns,
 * or no local source to compare against).
 *
 * Output: `.sapkit/vpass/<timestamp>-<target>.json` (+ a one-screen console
 * summary). The record stores hashes, counts and short excerpts — never the
 * object source text.
 *
 * ─────────────────────── Runtime directory (D-057) ──────────────────────────
 * `.sapkit` is a candidate everywhere `.sc4sap` was one, and nothing else
 * changes (R-PRESERVE): the tier walk stays 8 deep with existence as the
 * boundary, and the record is still written under the cwd. A project that only
 * has `.sc4sap` keeps reading and writing there (R-E); a project with neither
 * gets `.sapkit` (R-NEW). `--resolve-only` prints exactly what was selected,
 * without a binary, a connection, or an object list.
 *
 * ──────────────────────────────── Honesty note ──────────────────────────────
 * Not verified against a live SAP system. The chain, the parsers and the failure
 * classes are built from the measured outputs recorded in adapters/vsp/
 * COMMANDS.md and VERIFY-PATTERNS.md plus the vsp CLI source; the parsers are
 * self-tested against those measured strings (`--self-test`). Live behaviour —
 * especially ATC ERROR-grade findings, which have never been reproduced — is
 * unconfirmed.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const TOOL_VERSION = '1';
const CMD_TIMEOUT_MS = 180000; // > the measured ~21.4s firewall-drop timeout
const MAX_EXCERPT_CHARS = 800;
const MAX_EXCERPT_LINES = 12;

// `vsp source read` object types this runner accepts (workflows_source.go).
// FUNC needs --parent and is not supported here; FUGR returns JSON metadata,
// not source, so it is read but never compared.
const READ_TYPES = new Set(['PROG', 'CLAS', 'INTF', 'INCL', 'DDLS', 'VIEW', 'BDEF', 'FUGR', 'FUNC']);
const COMPARABLE_TYPES = new Set(['PROG', 'CLAS', 'INTF', 'INCL', 'DDLS', 'VIEW', 'BDEF']);
// buildObjectURL (devops.go:3402) — the only types `vsp atc` / `vsp test` accept.
const ATC_TEST_TYPES = new Set(['CLAS', 'PROG', 'INTF', 'FUGR', 'DDLS']);

const TYPE_RE = /^[A-Z]{3,5}$/;
const NAME_RE = /^[A-Z_/][A-Z0-9_/]{0,39}$/;

// abapGit-style local filenames, by type.
const SOURCE_EXT = {
  PROG: ['.prog.abap'],
  CLAS: ['.clas.abap'],
  INTF: ['.intf.abap'],
  INCL: ['.prog.abap', '.incl.abap'],
  DDLS: ['.ddls.asddls'],
  VIEW: ['.ddls.asddls'],
  BDEF: ['.bdef.asbdef'],
};

const USAGE = `Usage:
  node tools/vpass/vpass.mjs [options] <TYPE> <NAME> [<TYPE> <NAME> ...]
  node tools/vpass/vpass.mjs [options] --manifest <file>

Runs the V-PASS completion-evidence chain against SAP with the vsp CLI —
read-back, active-state concordance, unit, ATC — and writes
.sapkit/vpass/<timestamp>-<target>.json plus a console summary.
Nothing is ever written to SAP.

Options:
  --source-dir <dir>  local intended source, for the read-back comparison.
                      REQUIRED for a V-PASS: without a local source there is
                      nothing to compare the SAP text against, and the verdict
                      caps at INCOMPLETE.
  --manifest <file>   object list. JSON ([{type,name,source?}] or {objects:[…]})
                      or plain lines "TYPE NAME [source-file]" with # comments.
  --skip-unit         skip the ABAP Unit step, keeping the run purely P1 read.
                      Use this as a fresh-context reviewer (vsp test is P3 and
                      excluded from the reviewer profile).
  --dry-run           print the resolved binary, tier, planned commands and
                      output path, then stop. Connects to nothing; the only vsp
                      call is "--version".
  --self-test         run the output-parser fixtures (measured vsp strings) and
                      exit. No binary, no connection needed.
  --resolve-only      print the resolved runtime paths (runtime dir, output dir,
                      profile home, vsp binary, tier source) as JSON and exit.
                      No binary, no connection, no object list needed — this is
                      the offline seam the runtime-path conformance suite calls.
  --help, -h          this text.

Exit: 0 = V-PASS · 1 = not V-PASS (see verdict/classification in the record)
      2 = usage error.

Policy: steps read-back / active-state / ATC are P1 connected-read — an agent
may run them for you. The unit step executes ABAP (P3): DEV tier only, attended,
never in a reviewer session. Credentials come from your environment (SAP_* vars
or a .env vsp picks up); this runner never provisions or prints them.`;

// ── argv ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
if (argv.length === 0) {
  console.error(USAGE);
  process.exit(2);
}
// Dispatched at the bottom of the file: the parsers it drives close over
// constants declared further down.
const SELF_TEST = argv.includes('--self-test');
// Offline path-resolution seam (D-057 §7-3): no binary, no connection, no
// object list. Dispatched right after the path constants are computed.
const RESOLVE_ONLY = argv.includes('--resolve-only');

const OPTS = { sourceDir: null, manifest: null, skipUnit: false, dryRun: false };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--skip-unit') OPTS.skipUnit = true;
  else if (a === '--dry-run') OPTS.dryRun = true;
  else if (a === '--self-test') continue;
  else if (a === '--resolve-only') continue;
  else if (a === '--source-dir') OPTS.sourceDir = argv[++i];
  else if (a === '--manifest') OPTS.manifest = argv[++i];
  else if (a.startsWith('-')) fail(`unknown option: ${a}`);
  else positional.push(a);
}
for (const [flag, value] of [['--source-dir', OPTS.sourceDir], ['--manifest', OPTS.manifest]]) {
  if (value === undefined || (value !== null && value.startsWith('-'))) fail(`${flag} is missing its value`);
}

function fail(msg) {
  console.error(`[vpass] ${msg}\n\n${USAGE}`);
  process.exit(2);
}

// ── object list ─────────────────────────────────────────────────────────────
function parseManifest(file) {
  if (!existsSync(file)) fail(`manifest not found: ${file}`);
  const raw = readFileSync(file, 'utf8');
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      fail(`manifest is not valid JSON: ${e.message}`);
    }
    const list = Array.isArray(data) ? data : data.objects;
    if (!Array.isArray(list)) fail('manifest JSON must be an array or { "objects": [...] }');
    return list.map((o) => ({ type: o.type, name: o.name, source: o.source ?? null }));
  }
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [type, name, source] = line.split(/\s+/);
      return { type, name, source: source ?? null };
    });
}

function collectObjects() {
  const out = [];
  if (OPTS.manifest) out.push(...parseManifest(OPTS.manifest));
  if (positional.length % 2 !== 0) fail('positional objects must be TYPE NAME pairs');
  for (let i = 0; i < positional.length; i += 2) {
    out.push({ type: positional[i], name: positional[i + 1], source: null });
  }
  if (out.length === 0) fail('no objects given');

  return out.map((o) => {
    const type = String(o.type ?? '').toUpperCase();
    const name = String(o.name ?? '').toUpperCase();
    if (!TYPE_RE.test(type)) fail(`invalid object type: ${JSON.stringify(o.type)}`);
    if (!NAME_RE.test(name)) fail(`invalid object name: ${JSON.stringify(o.name)}`);
    if (!READ_TYPES.has(type)) {
      fail(`object type ${type} is not readable with "vsp source read" (supported: ${[...READ_TYPES].join(', ')})`);
    }
    return { type, name, source: o.source ?? null };
  });
}

const OBJECTS = SELF_TEST || RESOLVE_ONLY ? [] : collectObjects();
const PROJECT_DIR = process.cwd();

// ── runtime directory (D-057) ───────────────────────────────────────────────
const NEW_DIR = '.sapkit';
const LEGACY_DIR = '.sc4sap';

// Reason codes surfaced on stderr (CLI channel, D-057 §4-5) and in
// --resolve-only output. One entry per code, per process.
const REASONS = [];
function note(code, message) {
  if (REASONS.some((r) => r.code === code)) return;
  REASONS.push({ code, message });
  if (!RESOLVE_ONLY) console.error(`[vpass] ${code}: ${message}`);
}

// Connection completeness — the R-TIE tie-break input. An empty
// active-profile.txt does not count.
function hasConnectionState(runtimeDir) {
  try {
    const pointer = join(runtimeDir, 'active-profile.txt');
    if (existsSync(pointer) && readFileSync(pointer, 'utf8').trim().length > 0) return true;
  } catch {
    /* unreadable pointer is not completeness */
  }
  return existsSync(join(runtimeDir, 'sap.env'));
}

// R-TIE inside ONE directory. This tool's criterion is plain existence, applied
// to each generation before the tie-break. Returns null when neither exists.
function pickGeneration(dir) {
  const newer = join(dir, NEW_DIR);
  const older = join(dir, LEGACY_DIR);
  const newOk = existsSync(newer);
  const oldOk = existsSync(older);
  if (newOk && oldOk) {
    const newComplete = hasConnectionState(newer);
    const oldComplete = hasConnectionState(older);
    if (oldComplete && !newComplete) return older;
    return newer; // tie → .sapkit
  }
  if (newOk) return newer;
  if (oldOk) return older;
  return null;
}

// R-E + R-NEW: the record lands in whichever generation this cwd already has;
// with neither present it lands in `.sapkit`. (Unchanged from before: the
// output base is the cwd, not the walked-up project root — running from a
// subdirectory can still create a second runtime dir there, D-057 §4-3.)
const RUNTIME_DIR = pickGeneration(PROJECT_DIR) ?? join(PROJECT_DIR, NEW_DIR);
const OUTPUT_DIR = resolve(RUNTIME_DIR, 'vpass');

// ── vsp binary · tier ───────────────────────────────────────────────────────
// R-ENV. `SAPKIT_HOME_DIR` set but missing is a hard error — never a silent
// fall-through to the legacy variable. Without an env var the home is picked by
// where `probe` actually exists (`profiles/<alias>` for a profile, `bin/vsp`
// for the binary), new generation before legacy.
function sapkitHome(probe = null) {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!existsSync(explicit)) {
      console.error(
        `[vpass] ENV_INVALID: SAPKIT_HOME_DIR points at a path that does not exist (${explicit}). ` +
          'Refusing to fall back to SC4SAP_HOME_DIR — fix or unset it.',
      );
      process.exit(2);
    }
    return explicit;
  }
  const legacyEnv = process.env.SC4SAP_HOME_DIR;
  if (legacyEnv) {
    note('OK_LEGACY_DEPRECATED', 'SC4SAP_HOME_DIR is deprecated — rename it to SAPKIT_HOME_DIR.');
    return legacyEnv;
  }
  const newHome = join(homedir(), NEW_DIR);
  const legacyHome = join(homedir(), LEGACY_DIR);
  if (probe) {
    const inNew = existsSync(join(newHome, probe));
    const inLegacy = existsSync(join(legacyHome, probe));
    if (inNew && inLegacy) {
      note('COEXIST_OK', `${probe} exists under both ${newHome} and ${legacyHome} — using ${newHome}.`);
      return newHome;
    }
    if (inNew) return newHome;
    if (inLegacy) {
      note('OK_LEGACY_DEPRECATED', `${probe} resolved under the legacy home ${legacyHome}.`);
      return legacyHome;
    }
  }
  if (existsSync(newHome)) return newHome;
  if (existsSync(legacyHome)) return legacyHome;
  return newHome;
}

// $VSP_BIN → <sapkit home>/bin/vsp(.exe) → bare "vsp" from PATH.
function resolveVspBinary() {
  const name = process.platform === 'win32' ? 'vsp.exe' : 'vsp';
  if (process.env.VSP_BIN) return { path: process.env.VSP_BIN, source: 'VSP_BIN' };
  const installed = join(sapkitHome(join('bin', name)), 'bin', name);
  if (existsSync(installed)) return { path: installed, source: 'sapkit home' };
  return { path: name, source: 'PATH' };
}

// Walk up for the effective runtime directory (depth 8, existence = boundary).
function walkUpForRuntimeDir(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const hit = pickGeneration(dir);
    if (hit) return hit;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, NEW_DIR);
}

function parseDotenvKey(file, key) {
  if (!existsSync(file)) return null;
  try {
    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0 || line.slice(0, eq).trim() !== key) continue;
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    return null;
  }
  return null;
}

// Same resolution as the tier-readonly-guard hook, with SAP_TIER in the ambient
// environment taking precedence (that is the value vsp's own gate would read).
// Unresolved or non-DEV/QA/PRD → null → the unit step fails closed.
function resolveTier() {
  const normalize = (v) => {
    const u = String(v ?? '').trim().toUpperCase();
    return u === 'DEV' || u === 'QA' || u === 'PRD' ? u : null;
  };
  if (process.env.SAP_TIER) {
    return { value: normalize(process.env.SAP_TIER), alias: null, source: 'SAP_TIER env' };
  }
  const runtimeDir = walkUpForRuntimeDir(PROJECT_DIR);
  const pointer = join(runtimeDir, 'active-profile.txt');
  if (existsSync(pointer)) {
    let alias = null;
    try {
      alias = readFileSync(pointer, 'utf8').trim() || null;
    } catch {
      alias = null;
    }
    if (alias) {
      const envPath = join(sapkitHome(join('profiles', alias)), 'profiles', alias, 'sap.env');
      return { value: normalize(parseDotenvKey(envPath, 'SAP_TIER')), alias, source: envPath };
    }
  }
  const legacy = join(runtimeDir, 'sap.env');
  return { value: normalize(parseDotenvKey(legacy, 'SAP_TIER')), alias: null, source: legacy };
}

const VSP = resolveVspBinary();
const TIER = resolveTier();

// ── offline path-resolution seam (D-057 §7-3) ───────────────────────────────
// Everything above is pure path computation; nothing has spawned or connected
// yet. The conformance runner calls this to assert the selection rules.
if (RESOLVE_ONLY) {
  const generationOf = (p) => (p.endsWith(NEW_DIR) ? 'sapkit' : p.endsWith(LEGACY_DIR) ? 'sc4sap' : 'other');
  console.log(
    JSON.stringify(
      {
        tool: 'vpass',
        cwd: PROJECT_DIR,
        runtime_dir: RUNTIME_DIR,
        runtime_generation: generationOf(RUNTIME_DIR),
        runtime_dir_exists: existsSync(RUNTIME_DIR),
        output_dir: OUTPUT_DIR,
        tier_runtime_dir: walkUpForRuntimeDir(PROJECT_DIR),
        tier: TIER,
        vsp: VSP,
        reasons: REASONS,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ── vsp invocation ──────────────────────────────────────────────────────────
// SAP_READ_ONLY=true makes vsp's write-profile gate reject any write subcommand
// before the network call. Read commands and `vsp test` are unaffected.
function runVsp(args) {
  const res = spawnSync(VSP.path, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: CMD_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, SAP_READ_ONLY: 'true' },
  });
  if (res.error) {
    return { code: -1, text: `spawn failed: ${res.error.message}`, stdout: '', spawnFailed: true };
  }
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  return {
    code: res.status ?? -1,
    stdout,
    text: [stdout, stderr].filter(Boolean).join('\n'),
    timedOut: res.signal != null,
  };
}

// ── failure classification (port of scripts/verify-sap.ps1) ─────────────────
// Order matters: LOCK before ENV — the one measured 403 was an ENQUEUE lock, and
// letting the ENV "403" fallback keyword catch it would mislabel a retryable
// lock as a connectivity failure (VERIFY-PATTERNS.md §③).
const LOCK_MEASURED = /failed to lock object|lock failed:|exceptionresourcenoaccess|is currently editing|enqueue lock/;
const LOCK_FALLBACK = /\block\b|enqueue|sperr/;
const ENV_MEASURED = /no such host|dial tcp|connectex|authentication failed \(401\)|certificate signed by unknown authority/;
const ENV_FALLBACK = /connection|timeout|unauthorized|401|403|refused/;
// vsp CLI cannot address this object type at all (buildObjectURL default branch).
const TOOL_UNSUPPORTED = /unsupported object type/;

function classifyFailure(text, { spawnFailed = false, timedOut = false } = {}) {
  // A missing binary or a killed-on-timeout child is an environment failure — the
  // measured firewall-drop case took ~21.4s to surface, so a timeout says nothing
  // about the code (R-001).
  if (spawnFailed || timedOut) return 'ENV';
  const lower = String(text ?? '').toLowerCase();
  if (TOOL_UNSUPPORTED.test(lower)) return 'TOOL';
  if (LOCK_MEASURED.test(lower) || LOCK_FALLBACK.test(lower)) return 'LOCK';
  if (ENV_MEASURED.test(lower) || ENV_FALLBACK.test(lower)) return 'ENV';
  return 'CODE';
}

// vsp prints `Error:` twice around a full cobra Usage block — trust the FIRST
// match only (COMMANDS.md §⑤-1).
function firstErrorLine(text) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (/^\s*Error:/.test(line)) return line.trim();
  }
  return null;
}

function excerpt(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = lines.slice(0, MAX_EXCERPT_LINES).join('\n');
  return head.length > MAX_EXCERPT_CHARS ? `${head.slice(0, MAX_EXCERPT_CHARS)}…` : head;
}

// ── output parsers (fixtures in selfTest) ───────────────────────────────────
// `vsp atc` (devops.go runATC): findings are "  <ERROR|WARN|INFO>[ [line N]] …",
// the tail is "Total: N finding(s)", and 0 findings prints "No findings.".
// Exit code is 0 either way — the count MUST come from the output.
function parseAtc(text) {
  const t = String(text ?? '');
  if (/^\s*No findings\.\s*$/m.test(t)) {
    return { parsed: true, total: 0, errors: 0, warns: 0, infos: 0 };
  }
  const totalMatch = t.match(/^\s*Total:\s+(\d+)\s+finding\(s\)\s*$/m);
  if (!totalMatch) return { parsed: false };
  let errors = 0;
  let warns = 0;
  let infos = 0;
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^\s{2}(ERROR|WARN|INFO)(\s|\[|$)/);
    if (!m) continue;
    if (m[1] === 'ERROR') errors++;
    else if (m[1] === 'WARN') warns++;
    else infos++;
  }
  return { parsed: true, total: Number(totalMatch[1]), errors, warns, infos };
}

// `vsp test` (devops.go runTest): "No test classes found." on exit 0 for an
// object with no tests — that is "no tests", not "tests passed". Otherwise the
// tail is "Total: N passed, M failed" (exit 1 when M > 0).
function parseTest(text) {
  const t = String(text ?? '');
  if (/^\s*No test classes found\.\s*$/m.test(t)) return { parsed: true, kind: 'none' };
  const m = t.match(/^\s*Total:\s+(\d+)\s+passed,\s+(\d+)\s+failed\s*$/m);
  if (!m) return { parsed: false };
  return { parsed: true, kind: 'totals', passed: Number(m[1]), failed: Number(m[2]) };
}

// `vsp system info` — record SID/client/release only. Never the host or URL.
function parseSystemInfo(text) {
  const field = (key) => {
    const m = String(text ?? '').match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
    return m ? m[1] : null;
  };
  return { sid: field('System'), client: field('Client'), abap: field('ABAP') };
}

// ── source comparison ───────────────────────────────────────────────────────
// Normalized = BOM stripped, CRLF→LF, per-line trailing whitespace removed,
// trailing blank lines dropped. Case is preserved: the measured deploy→read-back
// round-trip was byte-identical (COMMANDS.md §③-8), so a case difference is a
// real difference, not noise.
function normalizeSource(s) {
  return String(s ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function findLocalSource(obj) {
  if (obj.source) {
    const p = resolve(OPTS.sourceDir ?? PROJECT_DIR, obj.source);
    return existsSync(p) ? p : null;
  }
  if (!OPTS.sourceDir) return null;
  const dir = resolve(PROJECT_DIR, OPTS.sourceDir);
  if (!existsSync(dir)) return null;
  const lower = obj.name.toLowerCase().replace(/\//g, '#'); // abapGit namespace convention
  for (const ext of SOURCE_EXT[obj.type] ?? []) {
    const p = join(dir, `${lower}${ext}`);
    if (existsSync(p)) return p;
  }
  // Fallback: any <name>.*.abap-ish file in the directory.
  try {
    const hit = readdirSync(dir).find((f) => f.toLowerCase().startsWith(`${lower}.`));
    return hit ? join(dir, hit) : null;
  } catch {
    return null;
  }
}

// ── step helpers ────────────────────────────────────────────────────────────
const step = (status, { classification = null, evidence = '', detail = null } = {}) => ({
  status,
  classification,
  evidence,
  ...(detail ? { detail } : {}),
});

function commandsFor(obj) {
  const cmds = [`source read ${obj.type} ${obj.name}`];
  if (!OPTS.skipUnit) cmds.push(`test ${obj.type} ${obj.name}`);
  cmds.push(`atc ${obj.type} ${obj.name}`);
  return cmds;
}

// ── chain ───────────────────────────────────────────────────────────────────
function readBackStep(obj) {
  if (obj.type === 'FUNC') {
    return {
      readback: step('SKIP', {
        classification: 'TOOL',
        evidence: 'FUNC needs "vsp source read FUNC <name> --parent <FUGR>"; this runner does not pass --parent',
      }),
      active: step('SKIP', { classification: 'TOOL', evidence: 'no read-back to derive concordance from' }),
    };
  }

  const res = runVsp(['source', 'read', obj.type, obj.name]);
  if (res.code !== 0) {
    const cls = classifyFailure(res.text, res);
    const ev = firstErrorLine(res.text) ?? excerpt(res.text);
    return {
      readback: step(cls === 'CODE' ? 'FAIL' : 'SKIP', {
        classification: cls,
        evidence: `vsp source read exit ${res.code}: ${ev}`,
      }),
      active: step('SKIP', { classification: cls, evidence: 'read-back did not succeed' }),
    };
  }

  const remote = res.stdout;
  if (remote.trim() === '') {
    return {
      readback: step('FAIL', {
        classification: 'CODE',
        evidence: 'vsp source read exit 0 but returned an empty body — the object holds no source',
      }),
      active: step('SKIP', { classification: 'CODE', evidence: 'read-back empty' }),
    };
  }

  const remoteLines = remote.split(/\r?\n/).length;
  const base = {
    lines: remoteLines,
    bytes: Buffer.byteLength(remote, 'utf8'),
    remote_sha256: sha256(remote),
    remote_normalized_sha256: sha256(normalizeSource(remote)),
  };

  if (!COMPARABLE_TYPES.has(obj.type)) {
    return {
      readback: step('PASS', {
        evidence: `read-back ok (${remoteLines} lines) — ${obj.type} returns metadata, not source, so no comparison is possible`,
        detail: { ...base, comparison: 'unsupported-for-type' },
      }),
      active: step('SKIP', {
        classification: 'TOOL',
        evidence: `${obj.type} read-back is not source text; concordance cannot be established`,
      }),
    };
  }

  const localPath = findLocalSource(obj);
  if (!localPath) {
    const why = OPTS.sourceDir
      ? `no local source found for ${obj.name} under ${OPTS.sourceDir}`
      : 'no --source-dir given';
    return {
      readback: step('PASS', {
        evidence: `read-back ok (${remoteLines} lines), not compared — ${why}`,
        detail: { ...base, comparison: 'none' },
      }),
      active: step('SKIP', {
        evidence: `no local intended source to compare against (${why}) — read-back alone is not syntax/activation evidence`,
      }),
    };
  }

  let local;
  try {
    local = readFileSync(localPath, 'utf8');
  } catch (e) {
    return {
      readback: step('UNKNOWN', {
        classification: 'PARSE',
        evidence: `could not read local source ${localPath}: ${e.message}`,
        detail: base,
      }),
      active: step('SKIP', { classification: 'PARSE', evidence: 'local source unreadable' }),
    };
  }

  const byteEqual = local === remote;
  const normEqual = normalizeSource(local) === normalizeSource(remote);
  const detail = {
    ...base,
    comparison: byteEqual ? 'byte-equal' : normEqual ? 'normalized-equal' : 'differs',
    local_path: localPath,
    local_sha256: sha256(local),
    local_normalized_sha256: sha256(normalizeSource(local)),
    byte_equal: byteEqual,
    normalized_equal: normEqual,
  };

  if (!normEqual) {
    return {
      readback: step('FAIL', {
        classification: 'CODE',
        evidence: `SAP source differs from ${localPath} (normalized hashes differ) — what SAP serves is not what was intended`,
        detail,
      }),
      active: step('FAIL', {
        classification: 'CODE',
        evidence: 'read-back mismatch — the intended source is not what SAP serves (rejected write, rollback, or drift)',
      }),
    };
  }

  return {
    readback: step('PASS', {
      evidence: `read-back matches ${localPath} (${byteEqual ? 'byte-equal' : 'normalized-equal'}, ${remoteLines} lines)`,
      detail,
    }),
    active: step('PASS', {
      evidence:
        'concordance: SAP serves the intended source. INDIRECT evidence only — no read-only server-side ' +
        'syntax check exists (COMMANDS.md §③-11) and source/main carries no version= parameter, so this ' +
        'does not distinguish active from inactive nor re-check syntax now. See limits[].',
      detail: { derived_from: 'source_readback', direct_check: false },
    }),
  };
}

function unitStep(obj) {
  if (OPTS.skipUnit) {
    return step('SKIP', { evidence: '--skip-unit: ABAP Unit is P3 (code execution) and was not run' });
  }
  if (TIER.value !== 'DEV') {
    return step('SKIP', {
      evidence:
        `tier gate: "vsp test" executes ABAP (P3, DEV tier only — R-003) and the resolved tier is ` +
        `${TIER.value ?? 'UNRESOLVED'} (${TIER.source}). Fail-closed: step not run`,
    });
  }
  if (!ATC_TEST_TYPES.has(obj.type)) {
    return step('SKIP', {
      classification: 'TOOL',
      evidence: `vsp test does not address ${obj.type} (supported: ${[...ATC_TEST_TYPES].join(', ')})`,
    });
  }

  const res = runVsp(['test', obj.type, obj.name]);
  return unitStepFromOutput(res.text, res.code, res);
}

// Pure decision half of the unit step — the self-test drives this directly, so
// the fixtures exercise the shipped logic rather than a restatement of it.
function unitStepFromOutput(text, code, res = {}) {
  const parsed = parseTest(text);

  if (!parsed.parsed) {
    const cls = classifyFailure(text, res);
    if (code === 0) {
      return step('UNKNOWN', {
        classification: 'PARSE',
        evidence: `vsp test exit 0 but no "Total: N passed, M failed" / "No test classes found." line: ${excerpt(text)}`,
      });
    }
    return step(cls === 'CODE' ? 'FAIL' : 'SKIP', {
      classification: cls,
      evidence: `vsp test exit ${code}: ${firstErrorLine(text) ?? excerpt(text)}`,
    });
  }
  if (parsed.kind === 'none') {
    // exit 0 here means "nothing ran", not "everything passed" (VERIFY-PATTERNS §②-5).
    return step('SKIP', { evidence: 'No test classes found. — the object ships no ABAP Unit tests (not a pass)' });
  }
  if (parsed.failed > 0) {
    return step('FAIL', {
      classification: 'CODE',
      evidence: `ABAP Unit: ${parsed.passed} passed, ${parsed.failed} failed`,
      detail: parsed,
    });
  }
  if (parsed.passed === 0) {
    return step('UNKNOWN', {
      classification: 'PARSE',
      evidence: 'ABAP Unit reported 0 passed and 0 failed — nothing was actually asserted',
      detail: parsed,
    });
  }
  return step('PASS', { evidence: `ABAP Unit: ${parsed.passed} passed, 0 failed`, detail: parsed });
}

function atcStep(obj) {
  if (!ATC_TEST_TYPES.has(obj.type)) {
    return step('SKIP', {
      classification: 'TOOL',
      evidence: `vsp atc does not address ${obj.type} (supported: ${[...ATC_TEST_TYPES].join(', ')})`,
    });
  }

  const res = runVsp(['atc', obj.type, obj.name]);
  return atcStepFromOutput(res.text, res.code, res);
}

// Pure decision half of the ATC step (see unitStepFromOutput).
function atcStepFromOutput(text, code, res = {}) {
  const parsed = parseAtc(text);

  if (!parsed.parsed) {
    const cls = classifyFailure(text, res);
    if (code === 0) {
      // ATC exits 0 even with findings, so an unparseable exit-0 output means the
      // count is unknown — never treat that as clean (VERIFY-PATTERNS §⑤).
      return step('UNKNOWN', {
        classification: 'PARSE',
        evidence: `vsp atc exit 0 but neither "No findings." nor "Total: N finding(s)" was found: ${excerpt(text)}`,
      });
    }
    return step(cls === 'CODE' ? 'FAIL' : 'SKIP', {
      classification: cls,
      evidence: `vsp atc exit ${code}: ${firstErrorLine(text) ?? excerpt(text)}`,
    });
  }

  const summary = `ATC: ${parsed.total} finding(s) — ${parsed.errors} ERROR / ${parsed.warns} WARN / ${parsed.infos} INFO`;
  if (parsed.errors > 0 || parsed.warns > 0) {
    return step('FAIL', { classification: 'CODE', evidence: summary, detail: parsed });
  }
  return step('PASS', {
    evidence: `${summary} (bar: 0 priority-1/2 findings; INFO recorded, non-blocking)`,
    detail: parsed,
  });
}

// Required for a V-PASS: read-back and active-state must PASS. unit and atc may
// be SKIP when the reason is recorded and is not an environment/lock failure —
// the same shape as the verification.json gate matrix.
function objectVerdict(steps) {
  const all = Object.values(steps);
  if (all.some((s) => s.classification === 'ENV' || s.classification === 'LOCK')) return 'ENV_BLOCKED';
  if (all.some((s) => s.status === 'FAIL' && s.classification === 'CODE')) return 'V-FAIL';
  if (all.some((s) => s.status === 'FAIL' || s.status === 'UNKNOWN')) return 'INCOMPLETE';
  if (steps.source_readback.status !== 'PASS' || steps.active_state.status !== 'PASS') return 'INCOMPLETE';
  return 'V-PASS';
}

function rollUp(verdicts) {
  if (verdicts.includes('ENV_BLOCKED')) return 'ENV_BLOCKED';
  if (verdicts.includes('V-FAIL')) return 'V-FAIL';
  if (verdicts.includes('INCOMPLETE')) return 'INCOMPLETE';
  return 'V-PASS';
}

const LIMITS = [
  'Indirect syntax evidence: vsp has no read-only server-side syntax check (COMMANDS.md §③-11). The active-state step is a concordance inference from the read-back, not a fresh check.',
  'Active vs inactive is not distinguished: "vsp source read" GETs …/source/main with no version= parameter (vsp/pkg/adt/client.go:280), i.e. the ADT working-area default.',
  'The rollback behaviour the concordance inference rests on was measured once, on one system (VERIFY-PATTERNS.md Phase 1.5, IDES-DEV S4H/100, PROG).',
  'Point-in-time only: a PASS reflects the state at the last successful write/activation; a later DDIC or dependency change can break the object without changing its source.',
  '"vsp health" staleness ACTIVE means "changed ≤ 90 days ago" (devops.go stalenessCLIFromTime), not activation — it is not used here and must not be read as an activation signal.',
  'The activation stamp stays with the applying side (ActivateObjects + empty GetInactiveObjects in verification.json); V-PASS corroborates it, it does not replace it.',
  'ATC ERROR-grade (priority 1) findings have never been reproduced on the measured system, so ERROR-path behaviour of the parser is untested against live output.',
  'This runner has not been verified against a live SAP system; its parsers are self-tested against the measured strings recorded in adapters/vsp/.',
];

// ── main ────────────────────────────────────────────────────────────────────
function targetSummary() {
  const first = `${OBJECTS[0].type}-${OBJECTS[0].name}`.replace(/[^A-Za-z0-9_.-]/g, '_');
  return OBJECTS.length === 1 ? first : `${first}+${OBJECTS.length - 1}`;
}

function main() {
  console.log(`[vpass] vsp: ${VSP.path} (${VSP.source})`);
  console.log(`[vpass] tier: ${TIER.value ?? 'UNRESOLVED'} (${TIER.source})`);
  console.log(`[vpass] objects: ${OBJECTS.map((o) => `${o.type} ${o.name}`).join(', ')}`);
  console.log(
    `[vpass] source-dir: ${
      OPTS.sourceDir ?? '(none — objects without a manifest "source" cap at INCOMPLETE)'
    }`,
  );

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const outputFile = join(OUTPUT_DIR, `${stamp}-${targetSummary()}.json`);

  if (OPTS.dryRun) {
    const v = runVsp(['--version']);
    console.log(`[vpass] vsp --version: ${v.code === 0 ? v.stdout.trim() : `unavailable (${excerpt(v.text)})`}`);
    console.log('\n[vpass] DRY RUN — no SAP connection was made. Planned commands:');
    console.log('  system info                     (preflight, separates ENV failures)');
    for (const obj of OBJECTS) {
      for (const c of commandsFor(obj)) console.log(`  ${c}`);
      const why = !COMPARABLE_TYPES.has(obj.type)
        ? `(${obj.type} read-back is not source text → active-state will SKIP)`
        : findLocalSource(obj) ?? '(no local source found → active-state will SKIP, verdict caps at INCOMPLETE)';
      console.log(`    compare against: ${why}`);
    }
    if (OPTS.skipUnit) console.log('  (unit step skipped: --skip-unit)');
    else if (TIER.value !== 'DEV') console.log(`  (unit step will SKIP: tier ${TIER.value ?? 'UNRESOLVED'} is not DEV)`);
    console.log(`[vpass] Every child process gets SAP_READ_ONLY=true; no write subcommand is ever issued.`);
    console.log(`[vpass] Record would be: ${outputFile}`);
    process.exit(0);
  }

  // Preflight — same reason verify-sap.ps1 does it: separate ENV up front so an
  // unreachable system is never recorded as a code defect (R-001).
  const info = runVsp(['system', 'info']);
  let system = null;
  if (info.code !== 0) {
    const cls = classifyFailure(info.text, info);
    console.error(`[vpass] preflight failed (${cls}): ${firstErrorLine(info.text) ?? excerpt(info.text)}`);
    writeRecord(outputFile, {
      verdict: 'ENV_BLOCKED',
      verdict_reason: `preflight "vsp system info" exit ${info.code} classified ${cls} — no step was run`,
      system: null,
      objects: OBJECTS.map((o) => ({
        type: o.type,
        name: o.name,
        verdict: 'ENV_BLOCKED',
        steps: {
          source_readback: step('SKIP', { classification: cls, evidence: 'preflight failed' }),
          active_state: step('SKIP', { classification: cls, evidence: 'preflight failed' }),
          unit: step('SKIP', { classification: cls, evidence: 'preflight failed' }),
          atc: step('SKIP', { classification: cls, evidence: 'preflight failed' }),
        },
      })),
    });
    console.error(`[vpass] verdict: ENV_BLOCKED — record: ${outputFile}`);
    process.exit(1);
  }
  system = parseSystemInfo(info.stdout);
  console.log(`[vpass] system: ${system.sid ?? '?'} client ${system.client ?? '?'} (ABAP ${system.abap ?? '?'})`);

  const objects = [];
  for (const obj of OBJECTS) {
    console.log(`\n[vpass] ${obj.type} ${obj.name}`);
    const { readback, active } = readBackStep(obj);
    const steps = {
      source_readback: readback,
      active_state: active,
      unit: unitStep(obj),
      atc: atcStep(obj),
    };
    for (const [k, s] of Object.entries(steps)) {
      console.log(`  ${s.status.padEnd(7)} ${k.padEnd(16)} ${s.evidence}`);
    }
    const verdict = objectVerdict(steps);
    console.log(`  → ${verdict}`);
    objects.push({ type: obj.type, name: obj.name, verdict, steps });
  }

  const verdict = rollUp(objects.map((o) => o.verdict));
  const reason =
    verdict === 'V-PASS'
      ? 'every object cleared read-back + active-state concordance, with unit/ATC PASS or a recorded non-environment skip'
      : `${objects.filter((o) => o.verdict !== 'V-PASS').map((o) => `${o.type} ${o.name}=${o.verdict}`).join(', ')}`;

  writeRecord(outputFile, { verdict, verdict_reason: reason, system, objects });

  console.log('\n[vpass] === Summary ===');
  console.log(`  Verdict: ${verdict}`);
  console.log(`  Reason : ${reason}`);
  console.log(`  Record : ${outputFile}`);
  if (verdict === 'V-PASS') {
    console.log('  V-PASS is one of two completion stamps — the exact-subject fresh-context R-PASS is the other.');
  } else {
    console.log('  Not a V-PASS: the objects stay PROVISIONAL_WRITE. Do not report them as done.');
  }
  console.log('  Evidence is indirect on syntax/activation — read limits[] in the record before quoting this.');
  process.exit(verdict === 'V-PASS' ? 0 : 1);
}

function writeRecord(outputFile, body) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const record = {
    tool: 'vpass',
    record_version: TOOL_VERSION,
    generated_at: new Date().toISOString(),
    verdict: body.verdict,
    verdict_reason: body.verdict_reason,
    vsp: { binary: VSP.path, resolved_from: VSP.source },
    system: body.system,
    tier: TIER,
    options: {
      source_dir: OPTS.sourceDir,
      manifest: OPTS.manifest,
      skip_unit: OPTS.skipUnit,
    },
    policy: {
      writes_to_sap: 'none — only system info / source read / test / atc, with SAP_READ_ONLY=true in every child process',
      read_steps: 'P1 connected-read (source read, atc) — an agent may run these for the user',
      unit_step: 'P3 code execution (ABAP Unit) — attended, DEV tier only, excluded from the reviewer profile',
      failure_classes: 'LOCK → ENV → TOOL → CODE, ported from scripts/verify-sap.ps1 (R-001: never record an environment failure as a code defect)',
    },
    objects: body.objects,
    limits: LIMITS,
  };
  writeFileSync(outputFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

// ── self-test ───────────────────────────────────────────────────────────────
// Fixtures are the measured vsp outputs recorded in adapters/vsp/COMMANDS.md and
// adapters/vsp/VERIFY-PATTERNS.md (2026-07-11, IDES-DEV S4H/100), plus the exact
// format strings in the vsp CLI source.
function selfTest() {
  const cases = [];
  const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    cases.push({ name, ok: a === e, actual: a, expected: e });
  };

  // ── vsp atc ──
  check('atc: "No findings." (COMMANDS §③-4-a, exit 0)', parseAtc('No findings.\n'), {
    parsed: true, total: 0, errors: 0, warns: 0, infos: 0,
  });

  const atcTwoInfo = `PROG ZSAH0B_SMOKE ($TMP)
  INFO [line 1] Prerequisites for the extended program check (SLIN) — Inconsistency
  INFO [line 3] Extended Program Check (SLIN) — Strings without text elements

Total: 2 finding(s)
`;
  check('atc: 2 INFO findings on exit 0 (COMMANDS §③-4-b)', parseAtc(atcTwoInfo), {
    parsed: true, total: 2, errors: 0, warns: 0, infos: 2,
  });
  check('atc: INFO-only findings still PASS (0 priority-1/2)', atcStepFromOutput(atcTwoInfo, 0).status, 'PASS');

  const atcOneInfo = `PROG ZSAH1_WORKDAYS ($TMP)
  INFO [line 1] Prerequisites for the extended program check (SLIN) — timezone

Total: 1 finding(s)
`;
  check('atc: "Total: 1 finding(s)" parsed (VERIFY-PATTERNS Phase 1.5)', parseAtc(atcOneInfo), {
    parsed: true, total: 1, errors: 0, warns: 0, infos: 1,
  });

  const atcError = `CLAS ZCL_X ($TMP)
  ERROR [line 12] Security check — hardcoded credentials
  WARN [line 20] Performance — SELECT inside LOOP

Total: 2 finding(s)
`;
  check('atc: ERROR/WARN counted (runATC priority 1/2 labels)', parseAtc(atcError), {
    parsed: true, total: 2, errors: 1, warns: 1, infos: 0,
  });
  check('atc: any ERROR/WARN → FAIL(CODE)', atcStepFromOutput(atcError, 0).classification, 'CODE');
  check('atc: any ERROR/WARN → FAIL', atcStepFromOutput(atcError, 0).status, 'FAIL');
  check('atc: unparseable exit-0 output → UNKNOWN, never clean', atcStepFromOutput('something unexpected\n', 0).status, 'UNKNOWN');
  check(
    'atc: exit-0 ambiguity is PARSE, not a code defect (R-001)',
    atcStepFromOutput('something unexpected\n', 0).classification,
    'PARSE',
  );
  check(
    'atc: ENV failure is SKIP+ENV, never a code defect (R-001)',
    atcStepFromOutput('Error: ATC check failed: dial tcp: lookup h: no such host', 1),
    { status: 'SKIP', classification: 'ENV', evidence: 'vsp atc exit 1: Error: ATC check failed: dial tcp: lookup h: no such host' },
  );

  // ── vsp test ──
  check('test: "No test classes found." (COMMANDS §③-6, exit 0)', parseTest('No test classes found.\n'), {
    parsed: true, kind: 'none',
  });
  check('test: "no tests" is SKIP, never PASS', unitStepFromOutput('No test classes found.\n', 0).status, 'SKIP');

  const testGreen = `Test Class: LTC_WORKDAYS
  PASS  test_basic (0.012s)

Total: 5 passed, 0 failed
`;
  check('test: green totals (VERIFY-PATTERNS Phase 1.5 red/green)', parseTest(testGreen), {
    parsed: true, kind: 'totals', passed: 5, failed: 0,
  });
  check('test: green → PASS', unitStepFromOutput(testGreen, 0).status, 'PASS');

  const testRed = `Test Class: LTC_WORKDAYS
  FAIL  test_basic (0.010s)
         failedAssertion: expected 5 but was -1

Total: 0 passed, 5 failed
Error: 5 test(s) failed
`;
  check('test: red totals', parseTest(testRed), { parsed: true, kind: 'totals', passed: 0, failed: 5 });
  check('test: red → FAIL', unitStepFromOutput(testRed, 1).status, 'FAIL');
  check('test: red → classified CODE', unitStepFromOutput(testRed, 1).classification, 'CODE');
  check(
    'test: 0 passed / 0 failed is UNKNOWN, not PASS',
    unitStepFromOutput('Total: 0 passed, 0 failed\n', 0).status,
    'UNKNOWN',
  );

  // ── failure classification (VERIFY-PATTERNS §③ measured strings) ──
  check('classify: DNS failure → ENV', classifyFailure('Error: failed to get system info: dial tcp: lookup h: no such host'), 'ENV');
  check('classify: 401 → ENV', classifyFailure('authentication failed (401): check username/password'), 'ENV');
  check('classify: TLS → ENV', classifyFailure('tls: failed to verify certificate: x509: certificate signed by unknown authority'), 'ENV');
  check(
    'classify: ENQUEUE 403 → LOCK, not ENV (order matters)',
    classifyFailure('Failed to lock object: locking object: ADT API error: status 403 ... ExceptionResourceNoAccess ... is currently editing ... (by an ENQUEUE lock)'),
    'LOCK',
  );
  check('classify: syntax error on write → CODE', classifyFailure('Object created but has 1 syntax errors\nSyntax errors:\n  Line 37: Incorrect nesting'), 'CODE');
  check('classify: missing object 404 → CODE', classifyFailure('Error: failed to get source: ADT API error: status 404'), 'CODE');
  check('classify: unsupported type → TOOL, not CODE', classifyFailure('Error: unsupported object type: TABL (supported: CLAS, PROG, INTF)'), 'TOOL');
  check('classify: timeout → ENV, not CODE (R-001)', classifyFailure('', { timedOut: true }), 'ENV');
  check('classify: binary missing → ENV', classifyFailure('spawn failed: ENOENT', { spawnFailed: true }), 'ENV');
  check('classify: silent non-zero exit falls back to CODE', classifyFailure('Error: deploy failed'), 'CODE');

  // ── first Error: line only (COMMANDS §⑤-1 double-Error + Usage block) ──
  const doubleError = `zsah0b_lint_sample.abap:6:1: E [line_length] Maximum allowed line length of 255 exceeded, currently 267

2 issues found
Error: 2 issues found
Usage:
  vsp lint <type> <name> [flags]
Error: 2 issues found
`;
  check('firstErrorLine: takes the FIRST match', firstErrorLine(doubleError), 'Error: 2 issues found');

  // ── source normalization ──
  check('normalize: CRLF + trailing blank line → equal', normalizeSource('REPORT z.\r\n\r\nWRITE / 1.\r\n\r\n') === normalizeSource('REPORT z.\n\nWRITE / 1.'), true);
  check('normalize: a real text difference stays different', normalizeSource('WRITE / 1.') === normalizeSource('WRITE / 2.'), false);
  check('normalize: case difference is preserved as a difference', normalizeSource('report z.') === normalizeSource('REPORT z.'), false);

  // ── system info (no host, no credentials) ──
  check('systemInfo: SID/client/ABAP only', parseSystemInfo('System:    S4H\nHost:\nClient:    100\nSAP:       756\nABAP:      756\n'), {
    sid: 'S4H', client: '100', abap: '756',
  });

  // ── object verdict roll-up (fail-closed) ──
  const mk = (rb, act, unit, atc) => ({
    source_readback: rb, active_state: act, unit, atc,
  });
  const P = step('PASS', { evidence: 'x' });
  const SKIP = step('SKIP', { evidence: 'recorded reason' });
  check('verdict: all PASS → V-PASS', objectVerdict(mk(P, P, P, P)), 'V-PASS');
  check('verdict: unit/atc SKIP with a reason still V-PASS', objectVerdict(mk(P, P, SKIP, P)), 'V-PASS');
  check(
    'verdict: no local comparison (active_state SKIP) → INCOMPLETE, never V-PASS',
    objectVerdict(mk(P, SKIP, SKIP, P)),
    'INCOMPLETE',
  );
  check(
    'verdict: an UNKNOWN step blocks V-PASS (fail-closed)',
    objectVerdict(mk(P, P, P, step('UNKNOWN', { classification: 'PARSE', evidence: 'x' }))),
    'INCOMPLETE',
  );
  check(
    'verdict: a CODE failure → V-FAIL',
    objectVerdict(mk(P, P, step('FAIL', { classification: 'CODE', evidence: 'x' }), P)),
    'V-FAIL',
  );
  check(
    'verdict: an ENV failure → ENV_BLOCKED, not V-FAIL (R-001)',
    objectVerdict(mk(P, P, step('SKIP', { classification: 'ENV', evidence: 'x' }), P)),
    'ENV_BLOCKED',
  );
  check(
    'verdict: ENV outranks CODE in the roll-up',
    rollUp(['V-PASS', 'V-FAIL', 'ENV_BLOCKED']),
    'ENV_BLOCKED',
  );

  const failed = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  for (const c of failed) console.error(`\n  ${c.name}\n    expected ${c.expected}\n    actual   ${c.actual}`);
  console.log(`\n[vpass] self-test: ${cases.length - failed.length}/${cases.length} passed`);
  return failed.length === 0;
}

if (SELF_TEST) process.exit(selfTest() ? 0 : 1);
main();
