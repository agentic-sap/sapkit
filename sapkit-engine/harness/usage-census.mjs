#!/usr/bin/env node
/**
 * usage-census.mjs — 실사용 축 재측정기 (docs/BLUEPRINT.md §4.7 의 데이터 생성기)
 *
 * **완전 오프라인이다. SAP에 접속하지 않는다.** 네트워크를 전혀 쓰지 않고,
 * 로컬 파일 3종만 읽는다:
 *   ① 도구 표면 정본  — interactive/server/tool-catalog/sapkit-mcp-tools-{read,write,runtime}.md
 *                        (+ 그 파일들이 의도적으로 제외한 row-data 2종)
 *   ② 자산 참조 축     — docs/BLUEPRINT.md §4.3(실질 참조) · §4.4(참조 없음) 목록을 파싱
 *   ③ 호출 이력 2종    — Claude Code   ~/.claude/projects/**\/*.jsonl
 *                        Codex CLI     ~/.codex/sessions/**\/*.jsonl (+ archived_sessions)
 *
 * 출력(JSON)에는 **도구 이름과 집계 수치만** 담는다. 대화 원문·파일 경로·프로젝트
 * 이름·접속 정보는 담지 않는다(레포 커밋 대상이므로).
 *
 * 사용:
 *   node harness/usage-census.mjs                      # 원 창(2026-07-13~08-10)으로 재측정
 *   node harness/usage-census.mjs --from=... --to=...   # 창 변경
 *   node harness/usage-census.mjs --out=경로            # 출력 파일 변경
 *   node harness/usage-census.mjs --claude=디렉터리      # Claude Code 기록 위치
 *   node harness/usage-census.mjs --codex=디렉터리       # Codex CLI 기록 위치
 *
 * 종료 코드: 0 = 정상, 1 = 자기검증 실패(표면 누락·중복 등), 2 = 입력이 하나도 없음.
 */

import { readdirSync, readFileSync, writeFileSync, createReadStream, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// ── 인자 ────────────────────────────────────────────────────────────────────
const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'true');
}
const FROM = args.get('from') ?? '2026-07-13';
const TO = args.get('to') ?? '2026-08-10';
const OUT = resolve(args.get('out') ?? join(HERE, 'usage-census.json'));
const CLAUDE_DIR = resolve(args.get('claude') ?? join(homedir(), '.claude', 'projects'));
const CODEX_DIRS = (args.get('codex')
  ? [args.get('codex')]
  : [join(homedir(), '.codex', 'sessions'), join(homedir(), '.codex', 'archived_sessions')]
).map((d) => resolve(d));

// ── ① 도구 표면 정본 186종 ──────────────────────────────────────────────────
// row-data 2종은 카탈로그 섹션 파일에서 의도적으로 빠져 있다(프롬프트 게이트 대상).
const ROW_DATA = ['GetTableContents', 'GetSqlQuery'];

function loadSurface() {
  const classOf = new Map();
  for (const cls of ['read', 'write', 'runtime']) {
    const p = join(REPO, 'interactive', 'server', 'tool-catalog', `sapkit-mcp-tools-${cls}.md`);
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/^- `([A-Za-z][A-Za-z0-9_]*)`/gm)) {
      if (classOf.has(m[1])) fail(`표면 중복: ${m[1]}`);
      classOf.set(m[1], cls);
    }
  }
  for (const n of ROW_DATA) {
    if (classOf.has(n)) fail(`row-data 2종이 섹션 파일에도 있다: ${n}`);
    classOf.set(n, 'row-data');
  }
  return classOf;
}

// ── ② 자산 참조 축 (§4.3 / §4.4 파싱) ───────────────────────────────────────
function sliceSection(text, startRe, endRe) {
  const s = text.search(startRe);
  if (s < 0) fail(`BLUEPRINT 절을 찾지 못했다: ${startRe}`);
  const rest = text.slice(s);
  const e = rest.slice(1).search(endRe);
  return e < 0 ? rest : rest.slice(0, e + 1);
}

function loadAssetAxis() {
  const text = readFileSync(join(REPO, 'docs', 'BLUEPRINT.md'), 'utf8');

  // §4.3 — 표 첫 열의 `Name` (실질 참조 110종)
  const s43 = sliceSection(text, /^### 4\.3 /m, /^### 4\.4 /m);
  const referenced = new Set();
  for (const m of s43.matchAll(/^\| `([A-Za-z][A-Za-z0-9_]*)` \|/gm)) referenced.add(m[1]);

  // §4.4 — 참조 없음 76종. A군·B군의 **열거 블록만** 읽는다.
  // (절 끝의 「주목할 쌍」 해설 문단은 §4.3 쪽 이름을 인용하므로 반드시 잘라낸다.)
  const s44 = sliceSection(text, /^### 4\.4 /m, /^### 4\.5 /m);
  const a = s44.search(/^\*\*A\. /m);
  if (a < 0) fail('§4.4 의 A군 열거 블록을 찾지 못했다');
  const tailIdx = s44.search(/^\*\*주목할 쌍\*\*/m);
  const block = s44.slice(a, tailIdx < 0 ? undefined : tailIdx);
  const unreferenced = new Set();
  for (const line of block.split('\n')) {
    if (line.startsWith('>')) continue; // 해설 인용문 제외
    for (const m of line.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) unreferenced.add(m[1]);
  }
  return { referenced, unreferenced };
}

// ── ③ 호출 이력 ─────────────────────────────────────────────────────────────
function walkJsonl(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJsonl(p));
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out.sort();
}

function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyTally() {
  return {
    inWindow: new Map(),    // 도구 → 창 안 호출 수
    allTime: new Map(),     // 도구 → 생존 기록 전체 호출 수
    prefixes: new Map(),    // MCP 서버 접두어 → 창 안 호출 수
    unknownMcp: new Map(),  // 표면에 없는 SAP 계열 이름 → 창 안 호출 수 (진단용)
    sessionsWin: new Set(), // 창 안에서 SAP 도구를 부른 대화
    sessionsAll: new Set(), // 창 안에 기록이 남은 대화 전체
    byDay: new Map(),
    seenIds: new Set(),
    files: 0, dupSkipped: 0, badLines: 0, minTs: null, maxTs: null, subagent: 0,
  };
}

/** 한 건의 호출을 집계에 반영한다. 두 하네스가 같은 규칙을 쓰도록 한 곳에 모았다. */
function tally(t, { surface, server, name, ts, session, sub, callId, sapish }) {
  if (!surface.has(name)) {
    const day0 = ts ? localDay(ts) : null;
    if (sapish && day0 !== null && day0 >= FROM && day0 <= TO) {
      t.unknownMcp.set(`${server}__${name}`, (t.unknownMcp.get(`${server}__${name}`) ?? 0) + 1);
    }
    return;
  }
  // 재개·분기로 같은 호출이 두 파일에 복사되는 경우가 있어 호출 id 로 중복을 뺀다.
  if (callId) {
    if (t.seenIds.has(callId)) { t.dupSkipped++; return; }
    t.seenIds.add(callId);
  }
  t.allTime.set(name, (t.allTime.get(name) ?? 0) + 1);
  if (ts) {
    if (t.minTs === null || ts < t.minTs) t.minTs = ts;
    if (t.maxTs === null || ts > t.maxTs) t.maxTs = ts;
  }
  const day = ts ? localDay(ts) : null;
  if (day === null || day < FROM || day > TO) return;
  t.inWindow.set(name, (t.inWindow.get(name) ?? 0) + 1);
  t.prefixes.set(server, (t.prefixes.get(server) ?? 0) + 1);
  t.byDay.set(day, (t.byDay.get(day) ?? 0) + 1);
  if (session) t.sessionsWin.add(session);
  if (sub) t.subagent++;
}

/** Claude Code — assistant 메시지 content 안의 tool_use 블록. 이름은 mcp__<서버>__<도구>. */
async function scanClaude(surface) {
  const t = emptyTally();
  if (!existsSync(CLAUDE_DIR)) return t;
  const files = walkJsonl(CLAUDE_DIR);
  t.files = files.length;
  for (const f of files) {
    const rl = createInterface({ input: createReadStream(f, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let o;
      try { o = JSON.parse(line); } catch { t.badLines++; continue; }
      const day = o.timestamp ? localDay(o.timestamp) : null;
      if (day !== null && day >= FROM && day <= TO && o.sessionId) t.sessionsAll.add(o.sessionId);
      const content = o?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type !== 'tool_use') continue;
        const m = /^mcp__([^_].*?)__([A-Za-z][A-Za-z0-9_]*)$/.exec(String(c.name ?? ''));
        if (!m) continue;
        tally(t, {
          surface, server: m[1], name: m[2], ts: o.timestamp, session: o.sessionId,
          sub: !!o.isSidechain, callId: c.id, sapish: /^(plugin_)?(sapkit|sc4sap|sap)/.test(m[1]),
        });
      }
    }
  }
  return t;
}

/** Codex CLI — rollout jsonl 의 payload.type === 'function_call'. 이름은 맨이름, 서버는 namespace. */
async function scanCodex(surface) {
  const t = emptyTally();
  for (const root of CODEX_DIRS) {
    if (!existsSync(root)) continue;
    const files = walkJsonl(root);
    t.files += files.length;
    for (const f of files) {
      const rl = createInterface({ input: createReadStream(f, 'utf8'), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let o;
        try { o = JSON.parse(line); } catch { t.badLines++; continue; }
        const p = o.payload;
        if (p?.type !== 'function_call') continue;
        const ns = String(p.namespace ?? '');
        if (!ns.startsWith('mcp__')) continue;   // 내장 도구·MCP 아닌 호출은 대상 아님
        const server = ns.slice('mcp__'.length);  // Claude 쪽 키 규약(맨 서버 이름)에 맞춘다
        const day = o.timestamp ? localDay(o.timestamp) : null;
        if (day !== null && day >= FROM && day <= TO) t.sessionsAll.add(f);
        tally(t, {
          surface, server, name: String(p.name ?? ''), ts: o.timestamp, session: f,
          sub: false, callId: p.call_id, sapish: /^(plugin_)?(sapkit|sc4sap|sap)/.test(server),
        });
      }
    }
  }
  return t;
}

function mergeTallies(list) {
  const t = emptyTally();
  for (const s of list) {
    for (const [k, v] of s.inWindow) t.inWindow.set(k, (t.inWindow.get(k) ?? 0) + v);
    for (const [k, v] of s.allTime) t.allTime.set(k, (t.allTime.get(k) ?? 0) + v);
    for (const [k, v] of s.prefixes) t.prefixes.set(k, (t.prefixes.get(k) ?? 0) + v);
    for (const [k, v] of s.unknownMcp) t.unknownMcp.set(k, (t.unknownMcp.get(k) ?? 0) + v);
    for (const [k, v] of s.byDay) t.byDay.set(k, (t.byDay.get(k) ?? 0) + v);
    for (const x of s.sessionsWin) t.sessionsWin.add(x);
    for (const x of s.sessionsAll) t.sessionsAll.add(x);
    t.files += s.files; t.dupSkipped += s.dupSkipped; t.badLines += s.badLines;
    t.subagent += s.subagent;
    if (s.minTs && (t.minTs === null || s.minTs < t.minTs)) t.minTs = s.minTs;
    if (s.maxTs && (t.maxTs === null || s.maxTs > t.maxTs)) t.maxTs = s.maxTs;
  }
  return t;
}

/** 출력용 — 0회는 빼고 도구 이름과 수치만. */
function nonZero(map) {
  return Object.fromEntries([...map].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function fail(msg) {
  console.error(`[usage-census] 실패: ${msg}`);
  process.exit(1);
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const classOf = loadSurface();
const surface = new Set(classOf.keys());
if (surface.size !== 186) fail(`표면이 186종이 아니다: ${surface.size}`);

const { referenced, unreferenced } = loadAssetAxis();
const refOnSurface = [...referenced].filter((n) => surface.has(n));
const unrefOnSurface = [...unreferenced].filter((n) => surface.has(n));
if (refOnSurface.length !== referenced.size) fail('§4.3 에 표면 밖 이름이 있다');
if (unrefOnSurface.length !== unreferenced.size) fail('§4.4 에 표면 밖 이름이 있다');
for (const n of refOnSurface) if (unrefOnSurface.includes(n)) fail(`§4.3 과 §4.4 에 동시 등장: ${n}`);
if (refOnSurface.length + unrefOnSurface.length !== 186) {
  fail(`§4.3(${refOnSurface.length}) + §4.4(${unrefOnSurface.length}) ≠ 186`);
}
// 위 셋(표면 밖 0 · 교집합 0 · 합 186)이 동시에 성립하면 §4.3 ∪ §4.4 = 표면 이 자동으로 따라온다.
// 즉 두 절이 서로를 검산한다.

const claude = await scanClaude(surface);
const codex = await scanCodex(surface);
if (claude.files === 0 && codex.files === 0) {
  console.error('[usage-census] 읽을 세션 기록이 하나도 없다 (--claude=/--codex= 로 위치를 지정하라)');
  process.exit(2);
}
const hist = mergeTallies([claude, codex]);

// 186종 전량에 값을 매긴다 (0 포함).
const counts = {};
for (const n of [...surface].sort()) counts[n] = hist.inWindow.get(n) ?? 0;
if (Object.keys(counts).length !== 186) fail(`counts 가 186종이 아니다: ${Object.keys(counts).length}`);

const unrefSet = new Set(unrefOnSurface);
const called = [...surface].filter((n) => counts[n] > 0).sort();
const tail = [...surface].filter((n) => counts[n] === 0 && unrefSet.has(n)).sort();
const union = [...surface].filter((n) => counts[n] > 0 || !unrefSet.has(n)).sort();
const referencedNeverCalled = [...surface].filter((n) => counts[n] === 0 && !unrefSet.has(n)).sort();
const calledButUnreferenced = [...surface].filter((n) => counts[n] > 0 && unrefSet.has(n)).sort();

const totalCalls = Object.values(counts).reduce((a, b) => a + b, 0);
const byClass = {};
for (const cls of ['read', 'write', 'runtime', 'row-data']) {
  const names = [...surface].filter((n) => classOf.get(n) === cls);
  byClass[cls] = {
    surface: names.length,
    called: names.filter((n) => counts[n] > 0).length,
    calls: names.reduce((a, n) => a + counts[n], 0),
    tail: names.filter((n) => tail.includes(n)).length,
  };
}

const deleteTools = [...surface].filter((n) => n.startsWith('Delete')).sort();
const deleteInTail = deleteTools.filter((n) => tail.includes(n));

const out = {
  schema: 'sapkit-usage-census/1',
  note: '도구 이름과 집계 수치만 담는다. 대화 원문·경로·프로젝트 이름은 담지 않는다.',
  window: { from: FROM, to: TO, basis: '호출 기록의 timestamp 를 로컬 날짜로 환산' },
  source: {
    kind: 'harness-session-records',
    jsonlFiles: hist.files,
    matchedServerPrefixes: Object.fromEntries([...hist.prefixes].sort((a, b) => b[1] - a[1])),
    earliestSurvivingCall: hist.minTs,
    latestSurvivingCall: hist.maxTs,
    duplicateCallsSkipped: hist.dupSkipped,
    unparsableLines: hist.badLines,
    subagentCallsInWindow: hist.subagent,
    unknownSapNames: Object.fromEntries([...hist.unknownMcp].sort()),
    harnesses: [
      {
        id: 'claude-code',
        records: '~/.claude/projects/**/*.jsonl',
        jsonlFiles: claude.files,
        calls: [...claude.inWindow.values()].reduce((a, b) => a + b, 0),
        toolsCalled: [...claude.inWindow.values()].filter((v) => v > 0).length,
        sessionsWithSapCalls: claude.sessionsWin.size,
        sessionsInWindow: claude.sessionsAll.size,
      },
      {
        id: 'codex-cli',
        records: '~/.codex/sessions/**/*.jsonl (+ archived_sessions)',
        jsonlFiles: codex.files,
        calls: [...codex.inWindow.values()].reduce((a, b) => a + b, 0),
        toolsCalled: [...codex.inWindow.values()].filter((v) => v > 0).length,
        sessionsWithSapCalls: codex.sessionsWin.size,
        sessionsInWindow: codex.sessionsAll.size,
      },
    ],
    excluded: [
      'Antigravity(~/.gemini/antigravity*) — 대화 기록 파일이 없다. mcp/sap/*.json 은 도구 스키마 캐시일 뿐 호출 기록이 아니다.',
    ],
  },
  totals: {
    surface: surface.size,
    calls: totalCalls,
    toolsCalled: called.length,
    sessionsWithSapCalls: hist.sessionsWin.size,
    sessionsInWindow: hist.sessionsAll.size,
    assetReferenced: refOnSurface.length,
    assetUnreferenced: unrefOnSurface.length,
    union: union.length,
    tail: tail.length,
    referencedNeverCalled: referencedNeverCalled.length,
    calledButUnreferenced: calledButUnreferenced.length,
  },
  byClass,
  counts,
  classOf: Object.fromEntries([...surface].sort().map((n) => [n, classOf.get(n)])),
  tail,
  referencedNeverCalled,
  calledButUnreferenced,
  callsByDay: Object.fromEntries([...hist.byDay].sort()),
  // 하네스별 내역 — 0회는 생략한다(counts 가 186종 전량의 정본이다).
  countsByHarness: { 'claude-code': nonZero(claude.inWindow), 'codex-cli': nonZero(codex.inWindow) },
  secondary: {
    label: '생존 기록 전체 (정본 아님 — 정본은 위 window)',
    range: [hist.minTs, hist.maxTs],
    calls: [...hist.allTime.values()].reduce((a, b) => a + b, 0),
    toolsCalled: hist.allTime.size,
  },
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

// ── 자기검증 + 요약 ─────────────────────────────────────────────────────────
const problems = [];
if (Object.keys(counts).length !== 186) problems.push('counts ≠ 186');
if (new Set(Object.keys(counts)).size !== 186) problems.push('counts 키 중복');
if (union.length !== refOnSurface.length + calledButUnreferenced.length) problems.push('합집합 계산 불일치');
if (tail.length + union.length !== 186) problems.push('꼬리 + 합집합 ≠ 186');
if (deleteInTail.length !== deleteTools.length) {
  problems.push(`Delete* ${deleteTools.length}종 중 ${deleteInTail.length}종만 꼬리`);
}

console.log(`[usage-census] 출력: ${OUT}`);
console.log(`  창                 ${FROM} ~ ${TO}`);
console.log(`  jsonl 파일          ${hist.files}  (claude ${claude.files} · codex ${codex.files})`);
console.log(`  서버 접두어         ${[...hist.prefixes].map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`  호출 총계           ${totalCalls}`);
console.log(`  호출된 도구         ${called.length} / 186`);
console.log(`  세션(SAP 호출 있음)  ${hist.sessionsWin.size}   (창 안 전체 세션 ${hist.sessionsAll.size})`);
console.log(`  자산 참조           ${refOnSurface.length}  참조 없음 ${unrefOnSurface.length}`);
console.log(`  합집합              ${union.length}`);
console.log(`  꼬리(양쪽 0)        ${tail.length}   Delete* 포함 ${deleteInTail.length}/${deleteTools.length}`);
console.log(`  최다 호출           ${called.sort((a, b) => counts[b] - counts[a])[0]} ${Math.max(...Object.values(counts))}`);
if (problems.length) fail(problems.join(' ; '));
console.log('[usage-census] 자기검증 OK');
