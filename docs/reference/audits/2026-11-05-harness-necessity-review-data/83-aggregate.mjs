#!/usr/bin/env node
// 83-aggregate.mjs — 판J T9 §4 결정적 집계 (node 내장 모듈만 · 같은 입력이면 두 번 돌려도 같은 출력)
//
// 실행:  node docs/reference/audits/2026-11-05-harness-necessity-review-data/83-aggregate.mjs
//        node docs/reference/audits/2026-11-05-harness-necessity-review-data/83-aggregate.mjs --check
// 출력:  같은 폴더의 83-results.txt(사람용) · 83-results.json(기계용)
//        --check 는 쓰지 않고 다시 계산해 디스크의 두 파일과 바이트 대조만 한다(같으면 exit 0 · 다르면 exit 1).
//        입력 대조에 어긋남이 하나라도 있으면 아무것도 쓰지 않고 exit 1.
//
// 이 스크립트는 **판정을 하지 않는다.** 모든 행의 판정은 응시하지 않은 모델이 남긴 파일에서 읽는다
//   70-grading-A.csv · 71-grading-B.csv      독립 채점자 둘 (Claude Fable 5.1)
//   80-adjudication.csv                      둘이 갈린 행의 제3 판정 (Claude Fable 5.1)
//   81-pack-errors.csv                       공식 문서로 가린 팩 감사 (Claude Fable 5.1)
//   82-codex-regrade.csv                     Codex 20% 재채점 (gpt-5.6-sol · Claude 답만)
// 그리고 사전 등록된 선(D-156 · spec E-3/E-4)을 **쓰인 그대로** 적용만 한다. 이 파일은 Fable 한도로
// 판 후반을 넘겨받은 오케스트레이터(Claude Opus 5.5 — 응시 모델)가 썼다 — 그래서 판단의 여지를 두지
// 않았고, 행 단위 최종 판정 전부를 83-results.json `rows`에 실어 누구든 다시 셀 수 있게 했다.
//
// 사전 등록 규칙의 구현 (읽는 법은 80-adjudication-notes.txt §2·§3과 같다):
//   최종 판정   A == B(코드는 위반 목록까지 같아야 함) → 그 값 · 다르면 80-의 verdict_final
//   팩 감사     팩 오류·동치 → 81- note의 truth_match(문서상 진실과 대조한 모델별 정오)로 바꾼다
//               모델 오답   → 팩어긋남의심 행을 오답으로 (키와 일치한 정답 행은 그대로)
//               판정 불가   → 엄격 열은 최종 판정 유지(팩어긋남의심 = 오답) · 제외 열에서는 분모에서 뺀다
//   지식 선     ≥95% 그리고 비싼 항목 오답 0 → 이미 안다 · 90% 이상이고 비싼 항목 오답 ≤1 → 측정 후 결정
//               (95% 이상인데 비싼 오답 1도 여기) · 그 밖 → 아직 필요.  분모 = 표본 60 고정
//               ⚠ spec 문언 「전체 90~95% 또는 비싼 항목 오답 1」의 「또는」을 문자 그대로 읽으면 90% 미만 ∧ 비싼 오답 1 도
//               측정 후 결정이 된다 — 그러면 비싼 오답 0인 칸(아직 필요)보다 1인 칸이 좋은 판정을 받는 역전이 생긴다. 이 스크립트는
//               그 칸을 아직 필요로 읽고, 그 자리에 걸린 칸 수를 §2에 찍는다(판정을 바꾸는 칸이 있는지 누구나 보게).
//   코드 선     과제 통과 = 검사기 오류급 0 ∧ 일반 작법 위반 0 · 5/5 이미 잘 짠다 · 4/5 측정 후 결정 · ≤3/5 아직 필요
//   C-INC-09   과제 불비로 무효(80-adjudication-notes.txt §3 결정) — 8문항이 주 수치, 9문항 수치도 병기

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol'];
const SHORT = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'gpt-5.6-sol': 'Codex gpt-5.6-sol' };
const CATS = [['module', 'K-MOD 모듈'], ['country', 'K-CTY 국가'], ['industry', 'K-IND 업종'], ['abap', 'K-ABAP 일반 작법']];
const CODE_IDS = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'];
const CINC_VOID = ['C-INC-09'];
// T1 표본 리뷰어의 비차단 관찰(스펙 모호 — 업종 규제·개인정보 인접 테이블이 「비싼 항목」인가 · 리뷰어는 해석을 고르지 않았다)
// — 민감도 줄에만 쓴다. 주 판정은 10-의 expensive(좁은 읽기) 그대로.
const WIDE_EXPENSIVE_ADD = ['K-IND-pharmaceutical-01', 'K-IND-chemical-01', 'K-IND-banking-01', 'K-MOD-HCM-01', 'K-MOD-HCM-02'];
// 사후 민감도(판정 아님): 권한 검사 규칙 두 개. T1 과제 리뷰어가 응시 전에 「일반 작법이지만 엄하다 — 맨 모델 기준선에 과하면
// 응시 전에 N/A로 돌릴 수 있다(사전 등록 수정 필요)」고 적었고, 수정하지 않았다 — 그래서 주 판정은 규칙을 그대로 센다.
const AUTH_RULES = { 'C-01': '5', 'C-04': '6' };
// spec §C 층 목록 — 층별 사고 집계는 사고가 0인 층도 줄을 둔다(감사 문서 §4가 전 칸이어야 해서)
const LAYERS = ['L1', "L1'", 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'W1', 'W2', 'W3', 'W4', 'W5'];
const CHECK = process.argv.includes('--check');

const issues = [];
const rd = (f) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^﻿/, '');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* CRLF 체크아웃 흡수 */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const body = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const hdr = body.shift();
  return body.map((r, n) => {
    if (r.length !== hdr.length) issues.push(`CSV 열 수 어긋남: 행 ${n + 2} (${r.length} ≠ ${hdr.length})`);
    return Object.fromEntries(hdr.map((h, k) => [h, r[k] ?? '']));
  });
}

// ── 입력 ──────────────────────────────────────────────────────────────────────────
const INPUTS = ['10-knowledge-items.json', '41-reproducible-items.json', '40-incidents.csv', '60-checker-summary.csv',
  '70-grading-A.csv', '71-grading-B.csv', '80-adjudication.csv', '81-pack-errors.csv', '82-codex-regrade.csv'];
const fingerprint = Object.fromEntries(INPUTS.map((f) => [f,
  crypto.createHash('sha256').update(rd(f).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)]));

const K60 = JSON.parse(rd('10-knowledge-items.json')).items;
const R41 = JSON.parse(rd('41-reproducible-items.json'));
const KINC = R41.items.filter((i) => i.kind === 'knowledge');
const CINC = R41.items.filter((i) => i.kind === 'code');
const INC = parseCsv(rd('40-incidents.csv'));
const CHK = parseCsv(rd('60-checker-summary.csv'));
const A = parseCsv(rd('70-grading-A.csv'));
const B = parseCsv(rd('71-grading-B.csv'));
const ADJ = parseCsv(rd('80-adjudication.csv'));
const PACK = parseCsv(rd('81-pack-errors.csv'));
const RG = parseCsv(rd('82-codex-regrade.csv'));

if (K60.length !== 60) issues.push(`10- 항목 수 ${K60.length} ≠ 60`);
if (KINC.length !== 47) issues.push(`41- 지식 항목 수 ${KINC.length} ≠ 47`);
if (CINC.length !== 9) issues.push(`41- 코드 항목 수 ${CINC.length} ≠ 9`);
if (A.length !== 470 || B.length !== 470) issues.push(`채점표 행 수 A=${A.length} B=${B.length} (기대 470)`);
if (RG.length !== 43) issues.push(`82- 재채점 행 수 ${RG.length} ≠ 43`);

// ── 최종 판정 ─────────────────────────────────────────────────────────────────────
const key = (r) => `${r.kind}|${r.id}|${r.model}`;
const bIdx = new Map(B.map((r) => [key(r), r]));
const adjIdx = new Map(ADJ.map((r) => [key(r), r]));
const final = new Map();
const agreeCount = { knowledge: [0, 0], code: [0, 0], incident: [0, 0] };
for (const a of A) {
  const b = bIdx.get(key(a));
  if (!b) { issues.push(`B에 없는 행 ${key(a)}`); continue; }
  const agree = a.verdict === b.verdict && (a.kind !== 'code' || a.detail === b.detail);
  agreeCount[a.kind][1]++;
  if (agree) {
    agreeCount[a.kind][0]++;
    if (adjIdx.has(key(a))) issues.push(`일치 행인데 80-에 있음 ${key(a)}`);
    final.set(key(a), { verdict: a.verdict, detail: a.detail, src: 'A=B' });
  } else {
    const j = adjIdx.get(key(a));
    if (!j) { issues.push(`불일치 행인데 80- 제3 판정 없음 ${key(a)}`); continue; }
    if (j.verdict_A !== a.verdict || j.verdict_B !== b.verdict) issues.push(`80- 의 A/B 판정이 채점표와 다름 ${key(a)}`);
    final.set(key(a), { verdict: j.verdict_final, detail: j.detail_final, src: '80' });
  }
}
if (ADJ.length !== A.length - agreeCount.knowledge[0] - agreeCount.code[0] - agreeCount.incident[0]) {
  issues.push(`80- 행 수 ${ADJ.length} ≠ 불일치 행 수`);
}

// ── 팩 감사 ───────────────────────────────────────────────────────────────────────
const PACK_VERDICTS = ['팩 오류', '동치', '모델 오답', '판정 불가'];
const packIdx = new Map(PACK.map((p) => [p.id, p]));
for (const p of PACK) if (!PACK_VERDICTS.includes(p.verdict)) issues.push(`81- 알 수 없는 판정 ${p.id}: ${p.verdict}`);
function truthMatch(note) {
  const m = note.match(/truth_match:\s*([^·]+)/);
  if (!m) return null;
  const o = {};
  for (const part of m[1].trim().split('|')) {
    const [mm, v] = part.split('=');
    if (mm && v) o[mm.trim()] = v.trim();
  }
  return o;
}
// 후보 집합 재유도 — 81-이 사전 정의된 후보를 빠짐없이 덮는가
const NAMED = ['K-MOD-TR-01', 'K-INC-32', 'K-MOD-CO-01', 'K-MOD-PP-02'];
const knowIds = [...K60.map((i) => i.id), ...KINC.map((i) => i.id)];
const candidates = new Set(NAMED);
for (const r of [...A, ...B]) if (r.kind === 'knowledge' && r.verdict === '팩어긋남의심') candidates.add(r.id);
for (const id of knowIds) {
  for (const G of [A, B]) {
    const ds = MODELS.map((m) => G.find((r) => r.kind === 'knowledge' && r.id === id && r.model === m)?.detail);
    if (ds.every((d) => d === '다른값')) candidates.add(id);
  }
}
for (const c of candidates) if (!packIdx.has(c)) issues.push(`팩 감사 후보인데 81-에 없음 ${c}`);
const packExtra = PACK.filter((p) => !candidates.has(p.id)).map((p) => p.id);

function knowledgeRow(id, model) {
  const f = final.get(`knowledge|${id}|${model}`);
  if (!f) { issues.push(`최종 판정 없음 knowledge|${id}|${model}`); return { v: '?', correct: false, pack: '', how: '' }; }
  const p = packIdx.get(id);
  let v = f.verdict;
  let how = f.src;
  if (p) {
    if (p.verdict === '팩 오류' || p.verdict === '동치') {
      const tm = truthMatch(p.note);
      if (!tm || !tm[model]) issues.push(`81- truth_match 없음 ${id} ${model}`);
      else { v = tm[model]; how += ' → 81 진실 대조'; }
    } else if (p.verdict === '모델 오답') {
      if (v === '팩어긋남의심') { v = '오답'; how += ' → 81 모델 오답'; }
    } else {
      how += ' → 81 판정 불가';
    }
  } else if (v === '팩어긋남의심') {
    issues.push(`팩어긋남의심인데 81- 판정 없음 ${id} ${model}`);
  }
  return { v, correct: v === '정답', pack: p ? p.verdict : '', how };
}

// ── 선 ────────────────────────────────────────────────────────────────────────────
const pct = (c, n) => (n ? ((100 * c) / n).toFixed(1) : '-');
function knowCell(c, n, expWrong) {
  if (!n) return '-';
  if (c * 20 >= 19 * n && expWrong === 0) return '이미 안다';
  if (c * 10 >= 9 * n && expWrong <= 1) return '측정 후 결정';
  return '아직 필요';
}
function codeCell(passed) {
  if (passed === 5) return '이미 잘 짠다';
  if (passed === 4) return '측정 후 결정';
  return '아직 필요';
}

// ── 지식 시험 (표본 60) ───────────────────────────────────────────────────────────
const rowsOut = [];
const knowledge = {};
const wideExp = new Set([...K60.filter((i) => i.expensive).map((i) => i.id), ...WIDE_EXPENSIVE_ADD]);
for (const m of MODELS) {
  const per = K60.map((it) => ({ it, r: knowledgeRow(it.id, m) }));
  for (const { it, r } of per) rowsOut.push({ kind: 'knowledge', set: '60', id: it.id, model: m, final: r.v, src: r.how, pack: r.pack, correct: r.correct, expensive: !!it.expensive });
  const agg = (list) => {
    const c = list.filter((x) => x.r.correct).length;
    const expWrong = list.filter((x) => x.it.expensive && !x.r.correct).length;
    return { c, n: list.length, expWrong, cell: knowCell(c, list.length, expWrong) };
  };
  const strict = agg(per);
  const exclPack = agg(per.filter((x) => !['팩 오류', '동치'].includes(x.r.pack)));
  const exclDoubt = agg(per.filter((x) => !['팩 오류', '동치', '판정 불가'].includes(x.r.pack)));
  const wideWrong = per.filter((x) => wideExp.has(x.it.id) && !x.r.correct).length;
  const byCat = {};
  for (const [cat] of CATS) {
    const sub = per.filter((x) => x.it.category === cat);
    byCat[cat] = { ...agg(sub), exclDoubt: agg(sub.filter((x) => !['팩 오류', '동치', '판정 불가'].includes(x.r.pack))) };
  }
  knowledge[m] = { strict, exclPack, exclDoubt, wide: { expWrong: wideWrong, cell: knowCell(strict.c, strict.n, wideWrong) }, byCat };
}
// 「또는」 자리 — 90% 미만 ∧ 비싼 오답 정확히 1 (문자 그대로면 측정 후 결정 · 이 스크립트는 아직 필요)
const inOrZone = (c, n, e) => c * 10 < 9 * n && e === 1;
const orZone = { primary: [], sensitivity: [] };
for (const m of MODELS) {
  const k = knowledge[m];
  if (inOrZone(k.strict.c, k.strict.n, k.strict.expWrong)) orZone.primary.push(`${SHORT[m]} 전체`);
  for (const [cat, label] of CATS) if (inOrZone(k.byCat[cat].c, k.byCat[cat].n, k.byCat[cat].expWrong)) orZone.primary.push(`${SHORT[m]} ${label}`);
  if (inOrZone(k.strict.c, k.strict.n, k.wide.expWrong)) orZone.sensitivity.push(SHORT[m]);
}

// ── 사고 재현 지식 (K-INC 47) · 중복 묶음 ─────────────────────────────────────────
const incIds = new Set(INC.map((r) => r.id));
const parent = new Map([...incIds].map((i) => [i, i]));
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) { if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb); } };
const unknownRefs = [];
for (const r of INC) {
  for (const ref of r.notes.match(/INC-[A-Z0-9]+-\d+/g) || []) {
    if (incIds.has(ref)) union(r.id, ref); else unknownRefs.push(`${r.id}→${ref}`);
  }
}
const incRow = new Map(INC.map((r) => [r.id, r]));
const incOf = R41.incident_ids || {};
for (const it of R41.items) if (!incOf[it.id] || !incRow.has(incOf[it.id])) issues.push(`41- incident_ids 대응 없음 ${it.id}`);
const kincClusters = new Map();
for (const it of KINC) {
  const root = find(incOf[it.id]);
  if (!kincClusters.has(root)) kincClusters.set(root, []);
  kincClusters.get(root).push(it.id);
}
const sharedKinc = KINC.filter((it) => kincClusters.get(find(incOf[it.id])).length > 1).map((it) => it.id);
const kinc = {};
for (const m of MODELS) {
  const res = KINC.map((it) => ({ it, r: knowledgeRow(it.id, m) }));
  for (const { it, r } of res) rowsOut.push({ kind: 'knowledge', set: 'K-INC', id: it.id, model: m, final: r.v, src: r.how, pack: r.pack, correct: r.correct, expensive: !!it.expensive });
  const c = res.filter((x) => x.r.correct).length;
  const ok = new Map(res.map((x) => [x.it.id, x.r.correct]));
  const clusterRates = [...kincClusters.values()].map((ids) => ids.filter((id) => ok.get(id)).length / ids.length);
  const dedup = clusterRates.reduce((s, x) => s + x, 0) / clusterRates.length;
  kinc[m] = { c, n: KINC.length, expWrong: res.filter((x) => x.it.expensive && !x.r.correct).length, clusters: clusterRates.length, dedupRate: Number((100 * dedup).toFixed(1)) };
}

// ── 코드 시험 ─────────────────────────────────────────────────────────────────────
const chkIdx = new Map(CHK.map((r) => [`${r.model}|${r.id}`, r]));
function codeRow(id, model) {
  const f = final.get(`code|${id}|${model}`);
  const c = chkIdx.get(`${model}|${id}`);
  if (!f || !c) { issues.push(`코드 행 없음 ${id} ${model}`); return { pass: false, eg: NaN, viol: '?', verdict: '?' }; }
  const eg = Number(c.error_grade);
  const viol = (f.detail || '').trim();
  if ((f.verdict === '통과') !== (viol === '')) issues.push(`코드 판정과 위반 목록 불일치 ${id} ${model}`);
  return { pass: eg === 0 && f.verdict === '통과' && viol === '', eg, viol, verdict: f.verdict, src: f.src };
}
const ruleOf = (v) => v.split(';').filter(Boolean).map((x) => x.split('@')[0]);
const code = {};
const violByRule = {};
for (const m of MODELS) {
  const res = CODE_IDS.map((id) => ({ id, r: codeRow(id, m) }));
  for (const { id, r } of res) {
    rowsOut.push({ kind: 'code', set: 'C', id, model: m, final: r.verdict, src: r.src, viol: r.viol, error_grade: r.eg, pass: r.pass });
    for (const rule of ruleOf(r.viol)) { const k = `${id} 규칙${rule}`; violByRule[k] = violByRule[k] || []; violByRule[k].push(SHORT[m]); }
  }
  const passed = res.filter((x) => x.r.pass).map((x) => x.id);
  const noAuth = res.filter((x) => x.r.eg === 0 && ruleOf(x.r.viol).filter((ru) => AUTH_RULES[x.id] !== ru).length === 0).map((x) => x.id);
  const resInc = CINC.map((it) => ({ id: it.id, r: codeRow(it.id, m) }));
  for (const { id, r } of resInc) rowsOut.push({ kind: 'code', set: 'C-INC', id, model: m, final: r.verdict, src: r.src, viol: r.viol, error_grade: r.eg, pass: r.pass, void: CINC_VOID.includes(id) });
  const incPassAll = resInc.filter((x) => x.r.pass).map((x) => x.id);
  const incPassMain = resInc.filter((x) => !CINC_VOID.includes(x.id) && x.r.pass).map((x) => x.id);
  code[m] = {
    passed, n: CODE_IDS.length, cell: codeCell(passed.length),
    sensitivityNoAuth: { passed: noAuth, cell: codeCell(noAuth.length) },
    errorGradeTotal: [...res, ...resInc].reduce((s, x) => s + x.r.eg, 0),
    cinc: { main: { c: incPassMain.length, n: CINC.length - CINC_VOID.length }, all: { c: incPassAll.length, n: CINC.length }, failed: resInc.filter((x) => !x.r.pass).map((x) => x.id) },
  };
}

// ── 비재현 사고 107 ───────────────────────────────────────────────────────────────
const INC_VERDICTS = ['피함', '못피함', '모름'];
const ROOTS = ['모델 지식 부족', '모델 행동', 'SAP·엔진 성질', '사용자 요구 미파악', '프로세스·문서']; // spec E-5 5분류 순서
for (const r of INC) if (!ROOTS.includes(r.root_cause)) issues.push(`40- 뿌리 원인 어휘 밖 ${r.id}: ${r.root_cause}`);
const nonRepro = INC.filter((r) => r.reproducible !== 'yes');
const incTally = { all: Object.fromEntries(INC_VERDICTS.map((v) => [v, 0])), nonEngine: Object.fromEntries(INC_VERDICTS.map((v) => [v, 0])), byRoot: {}, byLayer: {} };
for (const r of nonRepro) {
  const f = final.get(`incident|${r.id}|-`);
  if (!f) { issues.push(`사고 최종 판정 없음 ${r.id}`); continue; }
  if (!INC_VERDICTS.includes(f.verdict)) issues.push(`사고 판정 어휘 밖 ${r.id}: ${f.verdict}`);
  rowsOut.push({ kind: 'incident', set: 'non-repro', id: r.id, model: '-', final: f.verdict, src: f.src, root_cause: r.root_cause, layer: r.layer_blocked_or_would });
  incTally.all[f.verdict]++;
  if (r.root_cause !== 'SAP·엔진 성질') incTally.nonEngine[f.verdict]++;
  for (const [bucket, k] of [['byRoot', r.root_cause], ['byLayer', r.layer_blocked_or_would || '없음']]) {
    incTally[bucket][k] = incTally[bucket][k] || Object.fromEntries(INC_VERDICTS.map((v) => [v, 0]));
    incTally[bucket][k][f.verdict]++;
  }
}
if (nonRepro.length !== 107) issues.push(`비재현 사고 수 ${nonRepro.length} ≠ 107`);

// ── 층별 사고 집계 163 (spec E-5 — T4 분류를 그대로 센다 · 채점자 판정을 쓰지 않는다) ──────────────
//   막음          layer_blocked_or_would = 「막음:층」 — 그 층이 실제로 막았다
//   막았을        「막았을:층」 — T4의 반사실 판단
//   켜져 못 막음  layer_active_then 에 그 층이 있고 어느 층도 막지 못했다(「막음:」이 아님) — 다른 층이 막은 사고는 세지 않는다
//   그중 자기 자리  위 가운데 막았을 층도 그 층인 것 — 그 층이 맡는 종류의 사고가 켜진 채로 났다
//   켜짐 불명     「막았을:층」인데 layer_active_then = 불명 — 꺼져 있었는지 켜진 채 못 막았는지 모른다(spec: 판정에 쓰지 않는다)
const LAYER_RE = /^(막음|막았을):(.+)$/;
const layerTally = Object.fromEntries(LAYERS.map((l) => [l, { 막음: 0, 막았을: 0, 켜져못막음: 0, 자기자리: 0, 켜짐불명: 0 }]));
const blockedByRoot = {};
let activeUnknown = 0;
let noLayer = 0;
for (const r of INC) {
  const active = r.layer_active_then === '불명' ? null : r.layer_active_then.split(';').map((s) => s.trim()).filter(Boolean);
  if (!active) activeUnknown++;
  const m = (r.layer_blocked_or_would || '').match(LAYER_RE);
  if (!m && r.layer_blocked_or_would !== '없음') issues.push(`40- 막았(을) 층 표기 밖 ${r.id}: ${r.layer_blocked_or_would}`);
  if (!m) noLayer++;
  if (m && !layerTally[m[2]]) { issues.push(`40- 막았(을) 층 이름 밖 ${r.id}: ${m[2]}`); continue; }
  for (const l of active || []) {
    if (!layerTally[l]) { issues.push(`40- 켜진 층 이름 밖 ${r.id}: ${l}`); continue; }
    if (m && m[1] === '막음') continue;
    layerTally[l].켜져못막음++;
    if (m && m[2] === l) layerTally[l].자기자리++;
  }
  if (m) {
    const [, kind, l] = m;
    layerTally[l][kind]++;
    if (kind === '막았을' && !active) layerTally[l].켜짐불명++;
    const k2 = `${kind}:${l}`;
    blockedByRoot[k2] = blockedByRoot[k2] || Object.fromEntries(ROOTS.map((x) => [x, 0]));
    blockedByRoot[k2][r.root_cause]++;
  }
}

// ── 재현 사고 56 — 막았(을) 층별로 맨 모델이 맞혔는가 ──────────────────────────────
const itemOfInc = Object.fromEntries(Object.entries(incOf).map(([item, inc]) => [inc, item]));
const reproByLayer = {};
for (const r of INC.filter((x) => x.reproducible === 'yes')) {
  const item = itemOfInc[r.id];
  if (!item) { issues.push(`재현 사고에 항목 없음 ${r.id}`); continue; }
  if (CINC_VOID.includes(item)) continue;
  const layer = r.layer_blocked_or_would || '없음';
  const slot = (reproByLayer[layer] = reproByLayer[layer] || { n: 0, items: [], ok: Object.fromEntries(MODELS.map((m) => [m, 0])) });
  slot.n++;
  slot.items.push(item);
  for (const m of MODELS) {
    const ok = item.startsWith('K-') ? knowledgeRow(item, m).correct : codeRow(item, m).pass;
    if (ok) slot.ok[m]++;
  }
}

// ── 일치율 ────────────────────────────────────────────────────────────────────────
const agreement = Object.fromEntries(Object.entries(agreeCount).map(([k, [a, n]]) => [k, { a, n, rate: pct(a, n) }]));
const codex = { final: [0, 0], A: [0, 0], B: [0, 0], perModel: {} };
const aIdx = new Map(A.map((r) => [key(r), r]));
for (const g of RG) {
  const k = `knowledge|${g.id}|${g.model}`;
  const f = final.get(k);
  if (!f) { issues.push(`82- 행의 최종 판정 없음 ${k}`); continue; }
  if (g.model === 'gpt-5.6-sol') issues.push(`82-에 Codex 자기 답 행 ${g.id}`);
  if (f.verdict !== g.verdict_final) issues.push(`82- verdict_final 이 재계산과 다름 ${k}: ${g.verdict_final} ≠ ${f.verdict}`);
  const cmp = [['final', f.verdict], ['A', aIdx.get(k).verdict], ['B', bIdx.get(k).verdict]];
  for (const [name, v] of cmp) { codex[name][1]++; if (g.verdict_codex === v) codex[name][0]++; }
  const pm = (codex.perModel[g.model] = codex.perModel[g.model] || [0, 0]);
  pm[1]++; if (g.verdict_codex === f.verdict) pm[0]++;
}

// ── 팩 감사 집계 ──────────────────────────────────────────────────────────────────
const itemMeta = new Map([...K60, ...KINC].map((i) => [i.id, i]));
const packTally = Object.fromEntries(PACK_VERDICTS.map((v) => [v, PACK.filter((p) => p.verdict === v).map((p) => p.id)]));
const packByArea = {};
for (const p of PACK) {
  const it = itemMeta.get(p.id);
  const catLabel = Object.fromEntries(CATS);
  const area = it ? (it.category === 'module' ? `모듈 ${it.subcategory}` : it.category === 'incident' ? '사고 재현' : (catLabel[it.category] || it.category)) : '?';
  packByArea[area] = packByArea[area] || Object.fromEntries(PACK_VERDICTS.map((v) => [v, 0]));
  packByArea[area][p.verdict]++;
}

// ── 대조 실패면 멈춘다 ────────────────────────────────────────────────────────────
if (issues.length) {
  console.error(`입력 대조 실패 ${issues.length}건 — 결과를 쓰지 않는다:`);
  for (const x of issues) console.error(`  - ${x}`);
  process.exit(1);
}

// ── 사람용 출력 ───────────────────────────────────────────────────────────────────
const L = [];
const p = (s = '') => L.push(s);
const pad = (s, w) => { s = String(s); let len = 0; for (const ch of s) len += /[ᄀ-ᇿ㄰-㆏가-힯　-〿＀-￯]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(1, w - len)); };
p('83 — 판J 집계 결과 (83-aggregate.mjs 산출물 · 손으로 고치지 않는다)');
p('======================================================================');
p('이 파일은 판정을 하지 않는다 — 비응시 모델의 판정(70·71·80·81 = Claude Fable 5.1, 82 = Codex)을 읽어');
p('사전 등록된 선(D-156 · spec E-3/E-4)을 쓰인 그대로 적용한 결과다. 행 단위 최종 판정은 83-results.json `rows`.');
p();
p('§0 입력 지문 (CRLF→LF 정규화 뒤 sha256 앞 16자리)');
for (const f of INPUTS) p(`  ${pad(f, 30)} ${fingerprint[f]}`);
p();
p('§1 채점 일치율');
for (const [k, v] of Object.entries(agreement)) p(`  A↔B ${pad(k, 10)} ${v.a}/${v.n} = ${v.rate}%`);
p(`  Codex↔최종   ${codex.final[0]}/${codex.final[1]} = ${pct(...codex.final)}%   (Claude 두 모델의 지식 행 214 중 시드 표본 43 · Codex 자기 답 제외)`);
p(`  Codex↔A      ${codex.A[0]}/${codex.A[1]} = ${pct(...codex.A)}%`);
p(`  Codex↔B      ${codex.B[0]}/${codex.B[1]} = ${pct(...codex.B)}%`);
for (const [m, [a, n]] of Object.entries(codex.perModel)) p(`    ${pad(SHORT[m], 18)} Codex↔최종 ${a}/${n} = ${pct(a, n)}%`);
p();
p('§2 지식 시험 — 표본 60 (사전 등록: 분모 60 고정 · ≥95% 그리고 비싼 항목 오답 0 = 이미 안다)');
p('  모델               엄격(분모 60)        비싼 오답(13)  판정          | 팩 오류 뺀 분모        | 팩 오류·판정 불가 뺀 분모');
for (const m of MODELS) {
  const k = knowledge[m];
  p(`  ${pad(SHORT[m], 18)} ${pad(`${k.strict.c}/${k.strict.n} = ${pct(k.strict.c, k.strict.n)}%`, 20)} ${pad(k.strict.expWrong, 14)} ${pad(k.strict.cell, 13)} | ${pad(`${k.exclPack.c}/${k.exclPack.n} = ${pct(k.exclPack.c, k.exclPack.n)}%`, 22)} | ${k.exclDoubt.c}/${k.exclDoubt.n} = ${pct(k.exclDoubt.c, k.exclDoubt.n)}%`);
}
p('  민감도(판정 아님) — 비싼 항목을 업종 규제 3 + 인사 테이블 2만큼 넓히면:');
for (const m of MODELS) p(`    ${pad(SHORT[m], 18)} 비싼 오답 ${knowledge[m].wide.expWrong} → ${knowledge[m].wide.cell}`);
p('  선 근처 「또는」의 읽기 — 90% 미만인데 비싼 오답이 1인 칸은 「아직 필요」로 읽었다(문자 그대로면 「측정 후 결정」 · 머리 주석).');
p(`    그 자리에 걸린 칸: 주 판정(전체·범주 15칸) ${orZone.primary.length}개${orZone.primary.length ? ` — ${orZone.primary.join(' · ')}` : ''} · 민감도 줄 ${orZone.sensitivity.length}개${orZone.sensitivity.length ? ` — ${orZone.sensitivity.join(' · ')}` : ''}`);
p();
p('§3 범주별 (같은 선 · 범주 단위 처방 허용)');
p('  범주              모델               엄격                비싼 오답  판정          | 팩 오류·판정 불가 뺀 분모');
for (const [cat, label] of CATS) {
  for (const m of MODELS) {
    const c = knowledge[m].byCat[cat];
    p(`  ${pad(label, 17)} ${pad(SHORT[m], 18)} ${pad(`${c.c}/${c.n} = ${pct(c.c, c.n)}%`, 19)} ${pad(c.expWrong, 10)} ${pad(c.cell, 13)} | ${c.exclDoubt.c}/${c.exclDoubt.n} = ${pct(c.exclDoubt.c, c.exclDoubt.n)}%`);
  }
}
p();
p('§4 사고 재현 정답률 — 지식 K-INC 47 (표본 60과 섞지 않는다 · 층별 사고 증거 열에 쓴다)');
p(`  중복 묶음: K-INC 47문항이 사고 묶음 ${kinc[MODELS[0]].clusters}개에 속한다 · 다른 K-INC와 같은 결함을 공유하는 문항 ${sharedKinc.length}개`);
p('  (묶음 = 40-incidents.csv notes의 상호 참조로 이은 사고 덩어리 · 중복 제거 정답률 = 묶음마다 정답 비율을 구해 묶음 수로 평균)');
for (const m of MODELS) {
  const k = kinc[m];
  p(`  ${pad(SHORT[m], 18)} ${k.c}/${k.n} = ${pct(k.c, k.n)}%   중복 제거 ${k.dedupRate}%   비싼 항목(6) 오답 ${k.expWrong}`);
}
p();
p('§5 코드 시험 — C-01~C-05 (사전 등록: 통과 = 검사기 오류급 0 ∧ 일반 작법 위반 0 · 5/5 이미 잘 짠다 · 4/5 측정 후 결정 · ≤3/5 아직 필요)');
for (const m of MODELS) {
  const c = code[m];
  p(`  ${pad(SHORT[m], 18)} ${c.passed.length}/${c.n} 통과 (${c.passed.join(' · ') || '없음'})  → ${c.cell}   · 검사기 오류급 합 ${c.errorGradeTotal}(14과제)`);
}
p('  위반이 난 규칙 (과제 · 규칙 번호 = 11-code-tasks.txt general_rules):');
for (const k of Object.keys(violByRule).sort()) p(`    ${pad(k, 14)} ${violByRule[k].join(' · ')}`);
p('  사후 민감도(판정 아님) — 권한 검사 두 규칙(C-01 규칙5 · C-04 규칙6)을 빼면:');
for (const m of MODELS) p(`    ${pad(SHORT[m], 18)} ${code[m].sensitivityNoAuth.passed.length}/5 → ${code[m].sensitivityNoAuth.cell}`);
p();
p('§6 사고 재현 통과율 — 코드 C-INC (C-INC-09 = 과제 불비로 무효 · 80-adjudication-notes §3)');
for (const m of MODELS) {
  const c = code[m].cinc;
  p(`  ${pad(SHORT[m], 18)} 주 수치 ${c.main.c}/${c.main.n} = ${pct(c.main.c, c.main.n)}%   9문항 기준 ${c.all.c}/${c.all.n}   못 넘은 과제: ${c.failed.join(' · ') || '없음'}`);
}
p();
p('§7 비재현 사고 107 — 「맨 모델이 혼자 피했겠는가」(채점자 판정)');
p(`  전체: 피함 ${incTally.all['피함']} · 못피함 ${incTally.all['못피함']} · 모름 ${incTally.all['모름']}`);
p(`  SAP·엔진 성질을 뺀 ${nonRepro.filter((r) => r.root_cause !== 'SAP·엔진 성질').length}행: 피함 ${incTally.nonEngine['피함']} · 못피함 ${incTally.nonEngine['못피함']} · 모름 ${incTally.nonEngine['모름']}`);
p('  ⚠ SAP·엔진 성질 행은 전부 못피함이다 — 채점자 A·B 메모가 함께 적은 대로 원인이 모델 밖(엔진 결함·SAP 특성)이라,');
p('    이 행들은 「모델이 모자라다」가 아니라 「사고의 원인이 어디 있었나」를 말한다. 그래서 뺀 줄을 위에 함께 둔다.');
p('  뿌리 원인별 (피함 / 못피함 / 모름):');
for (const k of ROOTS) { const t = incTally.byRoot[k]; if (t) p(`    ${pad(k, 20)} ${t['피함']} / ${t['못피함']} / ${t['모름']}`); }
p('  막았(을) 층별 (피함 / 못피함 / 모름) — 막음 = 그 층이 실제로 막았다 · 막았을 = T4의 반사실 판단:');
for (const k of Object.keys(incTally.byLayer).sort()) { const t = incTally.byLayer[k]; p(`    ${pad(k, 20)} ${t['피함']} / ${t['못피함']} / ${t['모름']}`); }
p();
p(`§8 층별 사고 집계 — 사고 ${INC.length}건 전부 (spec E-5 · T4 분류를 그대로 셈 · 채점자 판정을 쓰지 않는다)`);
p('  막음 = 그 층이 실제로 막았다 · 막았을 = T4의 반사실 판단(필요성 증거)');
p('  켜져 못 막음 = 그때 켜져 있었고 어느 층도 막지 못한 사고(무효 증거) · 자기 자리 = 그중 막았을 층도 같은 층인 것');
p('  켜짐 불명 = 막았을 사고 가운데 그때 켜져 있었는지 기록이 없는 것(판정에 쓰지 않는다)');
p(`  ${pad('층', 6)} ${pad('막음', 6)} ${pad('막았을', 8)} ${pad('켜져 못 막음', 14)} ${pad('자기 자리', 11)} 켜짐 불명`);
for (const l of LAYERS) {
  const t = layerTally[l];
  p(`  ${pad(l, 6)} ${pad(t.막음, 6)} ${pad(t.막았을, 8)} ${pad(t.켜져못막음, 14)} ${pad(t.자기자리, 11)} ${t.켜짐불명}`);
}
p(`  그때 켜진 층을 기록이 적지 않은 사고 ${activeUnknown}/${INC.length} — 어느 층의 「켜져 못 막음」에도 세지 않았다`);
p(`  막았을 층이 없는 사고(어떤 층으로도 못 막았을 것) ${noLayer}/${INC.length}`);
p(`  막았(을) 층 × 뿌리 원인 (${ROOTS.join(' / ')}):`);
for (const k of Object.keys(blockedByRoot).sort()) p(`    ${pad(k, 12)} ${ROOTS.map((x) => blockedByRoot[k][x]).join(' / ')}`);
p();
p('§9 재현 사고 — 막았(을) 층별로 맨 모델이 측정에서 맞혔는가 (지식 = 정답 · 코드 = 통과 · C-INC-09 제외)');
p(`  층                  문항   ${MODELS.map((m) => pad(SHORT[m], 18)).join('')}`);
for (const k of Object.keys(reproByLayer).sort()) {
  const s = reproByLayer[k];
  p(`  ${pad(k, 19)} ${pad(s.n, 6)} ${MODELS.map((m) => pad(`${s.ok[m]}/${s.n} = ${pct(s.ok[m], s.n)}%`, 18)).join('')}`);
}
p();
p('§10 팩 감사 (81- · 공식 문서 대조 · 키는 고치지 않았다)');
for (const v of PACK_VERDICTS) p(`  ${pad(v, 10)} ${packTally[v].length}  ${packTally[v].join(' · ')}`);
p(`  후보 정의 밖으로 81-에 들어간 문항: ${packExtra.length ? packExtra.join(' · ') : '없음'}`);
p('  영역별 (팩 오류 / 동치 / 모델 오답 / 판정 불가):');
for (const k of Object.keys(packByArea).sort()) { const t = packByArea[k]; p(`    ${pad(k, 14)} ${t['팩 오류']} / ${t['동치']} / ${t['모델 오답']} / ${t['판정 불가']}`); }
p();
p('§11 이 집계가 말해 주지 않는 것 (정직 유보)');
p('  - 검사기 parse는 토크나이저다 — 오류급 0은 「검사기가 닿는 범위에서 0」이지 「활성화된다」가 아니다(SAP 없이 못 잰다).');
p('  - 항목마다 응시 1회다 — 같은 질문을 다시 물으면 답이 달라질 수 있다(재현성 미측정).');
p('  - 채점자 셋(A·B·제3)은 한 모델 계열(Claude Fable 5.1)이다 — 계열 편향은 Codex 20% 재채점 1회로만 가늠했다.');
p('  - 팩 감사는 문항당 조회 3회 안팎의 시간 상자였다 — 판정 불가는 「팩이 틀렸다」도 「맞다」도 아니다.');
p('  - 표본은 범주마다 작다(국가 16 · 업종 7 · ABAP 7) — 범주 판정 하나가 문항 하나로 뒤집힐 수 있다.');
p('  - 「막았을 층」은 T4의 반사실 판단이고, 비재현 사고 판정은 기록 문장만 읽은 판정이다.');
p(`  - 상호 참조가 40- 안에 없는 사고를 가리킨 경우 ${unknownRefs.length}건은 묶음에 넣지 않았다${unknownRefs.length ? `(${unknownRefs.join(' · ')})` : ''}.`);

const txt = `${L.join('\n')}\n`;
const json = {
  _schema: 'judge-aggregate-v1', generated_by: '83-aggregate.mjs', inputs: fingerprint,
  agreement, codex, knowledge, orZone, kinc: { perModel: kinc, clusters: Object.fromEntries([...kincClusters.entries()].sort()), sharedKinc },
  code, incidents: incTally,
  layers: { tally: layerTally, blockedByRoot, activeUnknown, noLayer, total: INC.length },
  reproByLayer, pack: { tally: packTally, byArea: packByArea, extra: packExtra, candidates: [...candidates].sort() },
  rows: rowsOut,
};
const out = { '83-results.txt': txt, '83-results.json': `${JSON.stringify(json, null, 1)}\n` };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
if (CHECK) {
  const diff = Object.entries(out).filter(([f, s]) => {
    const fp = path.join(DIR, f);
    return !fs.existsSync(fp) || fs.readFileSync(fp, 'utf8').replace(/\r\n/g, '\n') !== s;
  }).map(([f]) => f);
  if (diff.length) { console.error(`--check 실패 — 다시 계산한 결과가 디스크와 다르다: ${diff.join(' · ')}`); process.exit(1); }
  console.log(`--check 통과 — 83-results.txt · 83-results.json 이 재계산과 같다 (sha256(txt)=${sha(txt)})`);
} else {
  for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(DIR, f), s, 'utf8');
  console.log(`83-results.txt · 83-results.json 작성 — sha256(txt)=${sha(txt)}`);
}
