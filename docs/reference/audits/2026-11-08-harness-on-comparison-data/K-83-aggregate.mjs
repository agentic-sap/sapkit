#!/usr/bin/env node
// K-83-aggregate.mjs — 판K T9b 결정적 집계 (node 내장 모듈만 · 모델 호출 0 · 같은 입력이면 두 번 돌려도 같은 출력)
//
// 사용(PowerShell · 어디서든):
//   node docs/reference/audits/2026-11-08-harness-on-comparison-data/K-83-aggregate.mjs
//        --map <K-79-blind-map.csv> --adjudication <K-80-adjudication.csv> [--regrade <K-82-codex-regrade.csv>]
//        --out <K-83-results.txt> --json <K-83-results.json> [--check]
//   --adjudication 의 파일이 없으면: A≠B 행을 「미확정」으로 두고 집계한다(칸에 「미확정」). --check 는 이 상태를 FAIL 로 본다.
//   --regrade 를 주지 않거나 Codex 판정 칸이 전부 「보류 …」면 Codex↔최종 일치율은 「보류」다.
//   --check : 쓰지 않는다. 입력 대조 · 행 수 · 어휘 · 매핑 · 띠 계산 자체 시험 · 미확정 0 · 다시 계산한 두 출력이 디스크의
//             --out · --json 과 같은지(입력 지문 포함)를 잰다.
// 종료 코드: 0 = 통과(또는 작성) · 1 = 입력 대조 실패 · --check 실패 · 2 = 사용법 오류
//
// 이 스크립트는 **판정을 하지 않는다.** 행 판정은 비응시 채점자(Claude Fable) 파일에서 읽는다 —
//   K-70-grading-A.csv · K-71-grading-B.csv (독립 채점자 둘) · K-80-adjudication.csv (둘이 갈린 행의 제3 판정)
// 그리고 D-160 의 사전 등록된 선을 **쓰인 그대로** 적용한 숫자와 띠 결과만 낸다. 그 결과를 문장으로 해석하지 않는다.
// 판J 83-aggregate.mjs(J-83)의 CSV 읽기 · 지문 · 최종 판정 규칙 · rows 스키마를 승계했다.
//
// 사전 등록 규칙의 구현 (D-160 ① · 「사전 등록된 선」)
//   최종 판정    A == B → 그 값(지식 = verdict 같음 · 코드 = verdict 와 detail 문자열이 둘 다 같음) · 다르면 K-80 verdict_final/detail_final
//   팩어긋남의심 판K 행은 오답으로 센다(판J 엄격 집계와 같다 · 팩 감사 없음) · 「새 의심」 목록에 적는다
//   주 분모      판정 가능 47 = J-10 표본 60 에서 J-81 의 팩 오류 5 · 판정 불가 8 을 뺀 것(그 13문항은 엄격 60 병기에만)
//   지식 선      모델마다 · 전체 47 과 범주별 판정 가능 분모: 정답률 띠 ≥95% 메운다 · 90~95% 측정 후 결정 · <90% 못 메운다
//                / 비싼 항목 띠 오답 0 통과 · 1 측정 후 결정 · ≥2 못 메운다 / 판정 = 두 띠의 나쁜 쪽
//   코드 선      통과 = 검사기 오류급 0 ∧ 최종 「통과」 · 5/5 메운다 · 4/5 측정 후 결정 · ≤3/5 못 메운다
//   해친다       지식: 판J(판정 가능 분모 · 같은 칸)보다 2문항 이상 적음 · 코드: 통과 1과제 이상 적음 → 띠와 무관하게 「해친다」
//   L1-f 결합    판K 결과에만: 코드 5/5 ∧ K-ABAP 판정 가능 6/6 → 메운다 · 5/5 ∧ <6/6 → 측정 후 결정 · 4/5 → 측정 후 결정 · ≤3/5 → 못 메운다
//   표류 검사    끈 조건(판J 답) 행의 판K 최종 ↔ 판J 쪽 기준. 지식 기준 = 판J 채점 단계 최종(J-70/J-71 A=B 또는 J-80 · 팩 감사
//                J-81 이전 — 사양 §7 ⓤ 사용자 결정 · D-160 문언 기준 J-83 rows[].final 은 drift.literal 병기만) · 코드 기준 = J-83 rows[].pass
//                · 지식 불일치 ≥5/36 → 지식 비교 칸 전부 측정 후 결정 ·
//                코드 과제 통과 불일치 ≥2/15 → 코드 비교 칸 전부 측정 후 결정
//   비교 불가    관측 모델 id(K-50 · K-60 observed_model)가 요청 id 와 다른 행이 하나라도 있는 모델 → 그 모델의 판정 칸 전부
//                (수치는 병기) · 층 판정에서는 측정 후 결정으로 센다
//   칸의 우선순위 비교 불가 > 미확정(K-80 없음) > 표류 문턱 넘음(측정 후 결정) > 해친다 > 띠 — 띠 · 해친다 원값은 따로 찍는다
//   층 판정      L1-a = 모듈 칸 · L2 = 모듈 칸이 대신 잰다 · L1-f = 결합 칸(감사 문서 §4.2 · D-160 「층 판정」) — 세 모델 문언:
//                하나라도 못 메운다/해친다 → 가정 기각 · 셋 다 메운다 → 가정 확인 · 그 밖 → 측정 후 결정. Codex 자리 = 측정 불가
//                (판K T0-c · 모델 집합 2). Claude 둘만의 같은 규칙 결과를 따로 찍는다. L1-b(나라) · L1-d(업종)는 병기만.
//   해석한 자리(규칙이 말하지 않는 곳 — 결과를 보기 전에 정함)
//     ⓐ L1-f 칸의 표류: 코드 표류 넘음 → 측정 후 결정 · 지식 표류 넘음은 코드 5/5 일 때만(지식이 거부권을 쥐는 자리) 측정 후 결정
//     ⓑ L1-f 칸의 해친다: 코드 칸의 해친다만 옮긴다(K-ABAP 지식 칸의 해친다는 그 칸에 남는다)
//     ⓒ 판K 엄격 60 = 채점자 최종(J-10 키 = 팩 기준) 정답 수 — J 엄격 60 은 팩 오류 5문항을 J-81 공식 문서 대조로 쟀다(산법이 다름)
//     ⓓ 지식 A=B 행의 detail 은 A 의 것을 싣는다(J-83 과 같다 — 판정에 쓰지 않는다)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KDIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(KDIR, '..', '..', '..', '..');
const JDIR = path.resolve(KDIR, '..', '2026-11-05-harness-necessity-review-data');

// ── 인자 ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = {};
const CHECK = argv.includes('--check');
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--check') continue;
  if (['--map', '--adjudication', '--regrade', '--out', '--json'].includes(a) && argv[i + 1]) { opt[a.slice(2)] = argv[++i]; continue; }
  console.error(`사용법 오류: 알 수 없는 인자 ${a}`);
  process.exit(2);
}
for (const k of ['map', 'adjudication', 'out', 'json']) {
  if (!opt[k]) { console.error(`사용법 오류: --${k} 가 필요하다`); process.exit(2); }
}

// ── 고정 값 ───────────────────────────────────────────────────────────────────
const K_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const J_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol'];
const CODEX = 'gpt-5.6-sol';
const SHORT = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'gpt-5.6-sol': 'Codex gpt-5.6-sol' };
const CATS = [['module', '모듈'], ['country', '나라'], ['industry', '업종'], ['abap', 'ABAP 일반 작법']];
const CODE_IDS = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'];
const DRIFT_K_THR = 5;
const DRIFT_C_THR = 2;
const N_DRIFT_K = 36;
const N_DRIFT_C = 15;
// D-160 「사전 등록된 선」이 적은 판J 기준선(판정 가능 분모) — J-83 rows 에서 다시 센 값과 대조만 한다
const BASE_D160 = {
  'claude-opus-5-5': { all: [42, 47], module: [13, 18], country: [16, 16], industry: [7, 7], abap: [6, 6], code: 2 },
  'claude-sonnet-5-5': { all: [43, 47], module: [14, 18], country: [16, 16], industry: [7, 7], abap: [6, 6], code: 2 },
  'gpt-5.6-sol': { all: [44, 47], module: [15, 18], country: [16, 16], industry: [7, 7], abap: [6, 6], code: 2 },
};
const REGRADE_HDR = ['id', 'model', 'verdict_codex', 'verdict_A', 'verdict_B', 'verdict_final', 'agree_final', 'agree_A', 'agree_B'];
const HOLD = /^보류/;

const issues = [];

// ── 읽기 · 지문 ────────────────────────────────────────────────────────────────
function label(p) {
  const abs = path.resolve(p);
  const rel = path.relative(ROOT, abs);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  return `<레포 밖>/${path.basename(abs)}`;
}
const fingerprint = {};
function readIn(p) {
  const t = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  fingerprint[label(p)] = crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
  return t;
}
function parseCsv(text, name) {
  const lines = text.split('\n');
  while (lines.length && lines[0].startsWith('#')) lines.shift(); // K-82 머리 주석
  text = lines.join('\n');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const body = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const hdr = body.shift() || [];
  const out = body.map((r, n) => {
    if (r.length !== hdr.length) issues.push(`${name} CSV 열 수 어긋남: 행 ${n + 2} (${r.length} ≠ ${hdr.length})`);
    return Object.fromEntries(hdr.map((h, k) => [h, r[k] ?? '']));
  });
  out.hdr = hdr;
  return out;
}
const kf = (f) => path.join(KDIR, f);
const jf = (f) => path.join(JDIR, f);

const jItems = JSON.parse(readIn(jf('10-knowledge-items.json'))).items;
const jPack = parseCsv(readIn(jf('81-pack-errors.csv')), 'J-81');
const jRes = JSON.parse(readIn(jf('83-results.json')));
// 판J 채점 단계 최종(팩 감사 전 = J-70/J-71 A=B 또는 J-80 verdict_final) — 지식 표류 검사의 판J 쪽 기준(사양 §7 ⓤ)
const jGradeA = parseCsv(readIn(jf('70-grading-A.csv')), 'J-70');
const jGradeB = parseCsv(readIn(jf('71-grading-B.csv')), 'J-71');
const jAdj = parseCsv(readIn(jf('80-adjudication.csv')), 'J-80');
const kSum = parseCsv(readIn(kf('K-50-summary.csv')), 'K-50');
const kChk = parseCsv(readIn(kf('K-60-checker-summary.csv')), 'K-60');
const BLINDK = JSON.parse(readIn(kf('K-65-blind-knowledge.json'))).rows;
const BLINDC = JSON.parse(readIn(kf('K-65-blind-code.json'))).rows;
const A = parseCsv(readIn(kf('K-70-grading-A.csv')), 'K-70');
const B = parseCsv(readIn(kf('K-71-grading-B.csv')), 'K-71');
const mapRows = parseCsv(readIn(opt.map), 'map');
const ADJ_PRESENT = fs.existsSync(opt.adjudication);
const adjRows = ADJ_PRESENT ? parseCsv(readIn(opt.adjudication), 'K-80') : null;
if (!ADJ_PRESENT) fingerprint[label(opt.adjudication)] = '(없음)';
const RG_PRESENT = !!opt.regrade && fs.existsSync(opt.regrade);
if (opt.regrade && !RG_PRESENT) issues.push(`--regrade 파일 없음 ${label(opt.regrade)}`);
const RG = RG_PRESENT ? parseCsv(readIn(opt.regrade), 'K-82') : null;
// 코드 도구 호출 수 · 벽시계(병기만) — K-60 요약에 칸이 없어 이벤트 추출 요약에서 읽는다
const CODE_EV = {};
for (const m of K_MODELS) for (const id of CODE_IDS) {
  const p = kf(path.join('K-60-events', m, `${id}.txt`));
  if (!fs.existsSync(p)) { issues.push(`K-60 이벤트 요약 없음 ${m} ${id}`); continue; }
  const t = readIn(p);
  const sum = (re) => [...t.matchAll(re)].reduce((s, x) => s + Number(x[1]), 0);
  CODE_EV[`${m}|${id}`] = { tool_calls: sum(/도구 호출\(tool_use 블록\) 수=(\d+)/g), wall_ms: sum(/wall_ms=(\d+)/g) };
}

// ── 문항 · 판정 가능 47 ────────────────────────────────────────────────────────
if (jItems.length !== 60) issues.push(`J-10 항목 수 ${jItems.length} ≠ 60`);
const itemById = new Map(jItems.map((i) => [i.id, i]));
const packOf = new Map(jPack.filter((p) => itemById.has(p.id)).map((p) => [p.id, p.verdict]));
const PACK_ERR = jItems.filter((i) => packOf.get(i.id) === '팩 오류').map((i) => i.id);
const UNDECIDABLE = jItems.filter((i) => packOf.get(i.id) === '판정 불가').map((i) => i.id);
if (PACK_ERR.length !== 5) issues.push(`J-81 팩 오류(표본 60 안) ${PACK_ERR.length} ≠ 5`);
if (UNDECIDABLE.length !== 8) issues.push(`J-81 판정 불가(표본 60 안) ${UNDECIDABLE.length} ≠ 8`);
if (jItems.some((i) => packOf.get(i.id) === '동치')) issues.push('J-81 동치가 표본 60 안에 있다 — 판정 가능 분모 정의 밖');
const JUDGEABLE = new Set(jItems.filter((i) => !PACK_ERR.includes(i.id) && !UNDECIDABLE.includes(i.id)).map((i) => i.id));
if (JUDGEABLE.size !== 47) issues.push(`판정 가능 ${JUDGEABLE.size} ≠ 47`);

// ── 어휘 ──────────────────────────────────────────────────────────────────────
function vocabOk(kind, v, d) {
  if (kind === 'knowledge') {
    if (v === '정답') return d === '완전';
    if (v === '오답') return ['부분', '다른값', '무응답'].includes(d);
    if (v === '팩어긋남의심') return /^의심:/.test(d);
    return false;
  }
  if (kind === 'code') {
    if (v === '통과') return d === '';
    if (v === '위반') return /^\d+@\d+(;\d+@\d+)*$/.test(d);
    return false;
  }
  return false;
}
for (const [G, name] of [[A, 'K-70'], [B, 'K-71']]) {
  if (G.hdr.join(',') !== 'kind,id,verdict,detail,reason') issues.push(`${name} 머리 줄 어긋남`);
  for (const r of G) if (!vocabOk(r.kind, r.verdict, r.detail)) issues.push(`${name} 어휘 밖 ${r.kind} ${r.id}`);
  const k = G.filter((r) => r.kind === 'knowledge').length;
  const c = G.filter((r) => r.kind === 'code').length;
  if (k !== 156 || c !== 25) issues.push(`${name} 행 수 지식 ${k}/156 · 코드 ${c}/25`);
}

// ── 매핑 ──────────────────────────────────────────────────────────────────────
if (mapRows.hdr.join(',') !== 'anon_id,kind,condition,model,orig_id') issues.push('매핑 머리 줄 어긋남');
const mapIdx = new Map();
for (const r of mapRows) {
  if (mapIdx.has(r.anon_id)) issues.push(`매핑 anon_id 중복 ${r.anon_id}`);
  mapIdx.set(r.anon_id, r);
  if (!['knowledge', 'code'].includes(r.kind) || !['on', 'off'].includes(r.condition)) issues.push(`매핑 어휘 밖 ${r.anon_id}`);
  const models = r.condition === 'on' ? K_MODELS : J_MODELS;
  if (!models.includes(r.model)) issues.push(`매핑 모델 밖 ${r.anon_id}`);
  if (r.kind === 'knowledge' && !itemById.has(r.orig_id)) issues.push(`매핑 문항 밖 ${r.anon_id}`);
  if (r.kind === 'code' && !CODE_IDS.includes(r.orig_id)) issues.push(`매핑 과제 밖 ${r.anon_id}`);
}
const cnt = (kind, cond) => mapRows.filter((r) => r.kind === kind && r.condition === cond).length;
const MAPN = { kOn: cnt('knowledge', 'on'), kOff: cnt('knowledge', 'off'), cOn: cnt('code', 'on'), cOff: cnt('code', 'off') };
if (mapRows.length !== 181 || MAPN.kOn !== 120 || MAPN.kOff !== N_DRIFT_K || MAPN.cOn !== 10 || MAPN.cOff !== N_DRIFT_C) {
  issues.push(`매핑 행 수 ${mapRows.length} (지식 켠 ${MAPN.kOn}/120 · 끈 ${MAPN.kOff}/${N_DRIFT_K} · 코드 켠 ${MAPN.cOn}/10 · 끈 ${MAPN.cOff}/${N_DRIFT_C})`);
}
for (const m of K_MODELS) {
  for (const it of jItems) if (mapRows.filter((r) => r.condition === 'on' && r.kind === 'knowledge' && r.model === m && r.orig_id === it.id).length !== 1) issues.push(`매핑 켠 조건 지식 칸 수 ≠ 1 ${m} ${it.id}`);
  for (const id of CODE_IDS) if (mapRows.filter((r) => r.condition === 'on' && r.kind === 'code' && r.model === m && r.orig_id === id).length !== 1) issues.push(`매핑 켠 조건 코드 칸 수 ≠ 1 ${m} ${id}`);
}
for (const m of J_MODELS) for (const id of CODE_IDS) {
  if (mapRows.filter((r) => r.condition === 'off' && r.kind === 'code' && r.model === m && r.orig_id === id).length !== 1) issues.push(`매핑 끈 조건 코드 칸 수 ≠ 1 ${m} ${id}`);
}
for (const [G, name] of [[A, 'K-70'], [B, 'K-71']]) {
  for (const r of G) { const mp = mapIdx.get(r.id); if (!mp) issues.push(`${name} anon_id 가 매핑에 없음 ${r.id}`); else if (mp.kind !== r.kind) issues.push(`${name} kind ≠ 매핑 ${r.id}`); }
  const ids = new Set(G.map((r) => r.id));
  for (const id of mapIdx.keys()) if (!ids.has(id)) issues.push(`매핑 anon_id 가 ${name} 에 없음 ${id}`);
}
const blindK = new Map(BLINDK.map((r) => [r.anon_id, r]));
const blindC = new Map(BLINDC.map((r) => [r.anon_id, r]));
for (const r of mapRows) {
  const bl = r.kind === 'knowledge' ? blindK.get(r.anon_id) : blindC.get(r.anon_id);
  if (!bl) { issues.push(`매핑 anon_id 가 K-65 묶음에 없음 ${r.anon_id}`); continue; }
  if ((r.kind === 'knowledge' ? bl.item_id : bl.task_id) !== r.orig_id) issues.push(`매핑 orig_id ≠ K-65 묶음 ${r.anon_id}`);
}

// ── 최종 판정 (A=B → 그 값 · A≠B → K-80 · K-80 없으면 미확정) ─────────────────
const bIdx = new Map(B.map((r) => [r.id, r]));
const aIdx = new Map(A.map((r) => [r.id, r]));
const adjIdx = new Map((adjRows || []).map((r) => [r.id, r]));
if (adjRows) {
  if (adjRows.hdr.join(',') !== 'kind,id,model,verdict_A,detail_A,verdict_B,detail_B,verdict_final,detail_final,reason') issues.push('K-80 머리 줄 어긋남');
  for (const r of adjRows) {
    if (!vocabOk(r.kind, r.verdict_final, r.detail_final)) issues.push(`K-80 어휘 밖 ${r.kind} ${r.id}`);
    const mp = mapIdx.get(r.id);
    if (!mp) issues.push(`K-80 anon_id 가 매핑에 없음 ${r.id}`);
    else if (r.model !== '' && r.model !== mp.model) issues.push(`K-80 model 칸 ≠ 매핑 ${r.id}`);
  }
}
const final = new Map();
const disagree = { knowledge: [], code: [] };
const agreeAB = { knowledge: [0, 0], code: [0, 0], knowledgeDetail: [0, 0] };
for (const a of A) {
  const b = bIdx.get(a.id);
  if (!b) continue;
  const agree = a.verdict === b.verdict && (a.kind !== 'code' || a.detail === b.detail);
  agreeAB[a.kind][1]++;
  if (a.kind === 'knowledge') { agreeAB.knowledgeDetail[1]++; if (a.verdict === b.verdict && a.detail === b.detail) agreeAB.knowledgeDetail[0]++; }
  if (agree) {
    agreeAB[a.kind][0]++;
    if (adjIdx.has(a.id)) issues.push(`A=B 행인데 K-80 에 있음 ${a.id}`);
    final.set(a.id, { verdict: a.verdict, detail: a.detail, src: 'A=B' });
    continue;
  }
  disagree[a.kind].push(a.id);
  const j = adjIdx.get(a.id);
  if (!adjRows) { final.set(a.id, { verdict: null, detail: null, src: '미확정' }); continue; }
  if (!j) { issues.push(`A≠B 행인데 K-80 제3 판정 없음 ${a.id}`); continue; }
  if (j.kind !== a.kind || j.verdict_A !== a.verdict || j.detail_A !== a.detail || j.verdict_B !== b.verdict || j.detail_B !== b.detail) issues.push(`K-80 의 A/B 칸이 채점표와 다름 ${a.id}`);
  final.set(a.id, { verdict: j.verdict_final, detail: j.detail_final, src: 'K-80' });
}
const nDis = disagree.knowledge.length + disagree.code.length;
if (adjRows && adjRows.length !== nDis) issues.push(`K-80 행 수 ${adjRows.length} ≠ A≠B 행 수 ${nDis}`);
const unresolvedTotal = [...final.values()].filter((f) => f.src === '미확정').length;

// ── 응시 요약 · 관측 모델 id ───────────────────────────────────────────────────
const k50Idx = new Map(kSum.map((r) => [`${r.model}|${r.id}`, r]));
const k60Idx = new Map(kChk.map((r) => [`${r.model}|${r.id}`, r]));
if (kSum.length !== 120) issues.push(`K-50 행 수 ${kSum.length} ≠ 120`);
if (kChk.length !== 10) issues.push(`K-60 행 수 ${kChk.length} ≠ 10`);
const observed = {};
for (const m of K_MODELS) {
  const kr = jItems.map((it) => k50Idx.get(`${m}|${it.id}`));
  const cr = CODE_IDS.map((id) => k60Idx.get(`${m}|${id}`));
  if (kr.some((x) => !x)) issues.push(`K-50 에 빠진 칸 ${m}`);
  if (cr.some((x) => !x)) issues.push(`K-60 에 빠진 칸 ${m}`);
  const kMis = kr.filter((x) => x && x.observed_model !== m).length;
  const cMis = cr.filter((x) => x && x.observed_model !== m).length;
  observed[m] = { knowledge: { match: kr.length - kMis, n: kr.length }, code: { match: cr.length - cMis, n: cr.length }, comparable: kMis + cMis === 0 };
}

// ── J-83 기준선 ───────────────────────────────────────────────────────────────
const j60 = new Map(jRes.rows.filter((r) => r.kind === 'knowledge' && r.set === '60').map((r) => [`${r.id}|${r.model}`, r]));
const jC = new Map(jRes.rows.filter((r) => r.kind === 'code' && r.set === 'C').map((r) => [`${r.id}|${r.model}`, r]));
const jKey = (r) => `${r.kind}|${r.id}|${r.model}`;
const j71Idx = new Map(jGradeB.map((r) => [jKey(r), r]));
const j80Idx = new Map(jAdj.map((r) => [jKey(r), r]));
function jPrePack(id, model) {
  const k = `knowledge|${id}|${model}`;
  const a = jGradeA.find((r) => jKey(r) === k);
  const b = j71Idx.get(k);
  if (!a || !b) return null;
  if (a.verdict === b.verdict) return a.verdict;
  return j80Idx.get(k)?.verdict_final ?? null;
}
if (j60.size !== 180) issues.push(`J-83 표본 60 rows ${j60.size} ≠ 180`);
if (jC.size !== 15) issues.push(`J-83 코드 rows ${jC.size} ≠ 15`);
function jScope(m, pred) {
  const list = jItems.filter((it) => JUDGEABLE.has(it.id) && pred(it)).map((it) => j60.get(`${it.id}|${m}`));
  if (list.some((x) => !x)) { issues.push(`J-83 rows 빠짐 ${m}`); return { c: 0, n: 0 }; }
  return { c: list.filter((x) => x.correct).length, n: list.length };
}
const jBase = {};
for (const m of J_MODELS) {
  const all = jScope(m, () => true);
  const byCat = Object.fromEntries(CATS.map(([cat]) => [cat, jScope(m, (it) => it.category === cat)]));
  const code = CODE_IDS.filter((id) => jC.get(`${id}|${m}`)?.pass).length;
  jBase[m] = { all, byCat, code, strict60: jRes.knowledge?.[m]?.strict };
  const agg = jRes.knowledge?.[m];
  if (!agg || agg.exclDoubt.c !== all.c || agg.exclDoubt.n !== all.n) issues.push(`J-83 판정 가능 집계 ≠ rows 재계산 ${m}`);
  for (const [cat] of CATS) {
    const g = agg?.byCat?.[cat]?.exclDoubt;
    if (!g || g.c !== byCat[cat].c || g.n !== byCat[cat].n) issues.push(`J-83 범주 판정 가능 집계 ≠ rows 재계산 ${m} ${cat}`);
  }
  if (jRes.code?.[m]?.passed?.length !== code) issues.push(`J-83 코드 통과 ≠ rows 재계산 ${m}`);
  const d = BASE_D160[m];
  const same = (x, [c, n]) => x.c === c && x.n === n;
  if (!same(all, d.all) || CATS.some(([cat]) => !same(byCat[cat], d[cat])) || code !== d.code) issues.push(`D-160 기준선 ≠ J-83 rows 재계산 ${m}`);
}

// ── 띠 ────────────────────────────────────────────────────────────────────────
const RANK = { 메운다: 0, 통과: 0, '측정 후 결정': 1, '못 메운다': 2 };
const rateBand = (c, n) => (c * 20 >= 19 * n ? '메운다' : c * 10 >= 9 * n ? '측정 후 결정' : '못 메운다');
const expBand = (e) => (e === 0 ? '통과' : e === 1 ? '측정 후 결정' : '못 메운다');
const worse = (x, y) => {
  const w = RANK[x] >= RANK[y] ? x : y;
  return w === '통과' ? '메운다' : w;
};
const codeBand = (p) => (p === 5 ? '메운다' : p === 4 ? '측정 후 결정' : '못 메운다');
function bandSelftest() {
  const cases = [
    [rateBand(45, 47), '메운다'], [rateBand(44, 47), '측정 후 결정'], [rateBand(43, 47), '측정 후 결정'], [rateBand(42, 47), '못 메운다'],
    [rateBand(18, 18), '메운다'], [rateBand(17, 18), '측정 후 결정'], [rateBand(16, 18), '못 메운다'], [rateBand(6, 6), '메운다'], [rateBand(5, 6), '못 메운다'],
    [rateBand(19, 20), '메운다'], [rateBand(18, 20), '측정 후 결정'],
    [expBand(0), '통과'], [expBand(1), '측정 후 결정'], [expBand(2), '못 메운다'],
    [worse('메운다', '통과'), '메운다'], [worse('메운다', '측정 후 결정'), '측정 후 결정'], [worse('측정 후 결정', '못 메운다'), '못 메운다'],
    [codeBand(5), '메운다'], [codeBand(4), '측정 후 결정'], [codeBand(3), '못 메운다'],
  ];
  return cases.map(([got, want], i) => (got === want ? null : `띠 자체 시험 ${i + 1}: ${got} ≠ ${want}`)).filter(Boolean);
}

// ── 행 복원 ────────────────────────────────────────────────────────────────────
const rowsOut = [];
const kRows = {}; // m → [{it, f, correct, anon}]
const cRows = {};
for (const r of mapRows) {
  const f = final.get(r.anon_id);
  if (!f) continue;
  if (r.kind === 'knowledge' && r.condition === 'on') {
    const it = itemById.get(r.orig_id);
    (kRows[r.model] = kRows[r.model] || []).push({ it, f, anon: r.anon_id });
  }
  if (r.kind === 'code' && r.condition === 'on') {
    const c = k60Idx.get(`${r.model}|${r.orig_id}`);
    const eg = c ? Number(c.error_grade) : NaN;
    if (blindC.get(r.anon_id) && Number(blindC.get(r.anon_id).checker_error_grade) !== eg) issues.push(`K-65 묶음 오류급 ≠ K-60 ${r.anon_id}`);
    (cRows[r.model] = cRows[r.model] || []).push({ id: r.orig_id, f, eg, anon: r.anon_id, c });
  }
}
const order = new Map(jItems.map((it, i) => [it.id, i]));
for (const m of K_MODELS) {
  (kRows[m] || []).sort((x, y) => order.get(x.it.id) - order.get(y.it.id));
  (cRows[m] || []).sort((x, y) => x.id.localeCompare(y.id));
}
for (const m of K_MODELS) for (const x of cRows[m] || []) {
  if (x.f.src !== '미확정' && (x.f.verdict === '통과') !== (x.f.detail === '')) issues.push(`코드 판정과 위반 목록 불일치 ${x.anon}`);
}

// ── 표류 검사 ──────────────────────────────────────────────────────────────────
// 지식 표류의 판J 쪽 기준(사양 §7 ⓤ · 사용자 결정 2026-11-08) = 판J 채점 단계 최종(J-70/J-71 A=B 또는 J-80 verdict_final ·
// 팩 감사 J-81 이전) — 채점자 판정끼리 비교한다. D-160 문언 기준(J-83 rows[].final)의 결과는 drift.literal 에 병기만 한다.
// 코드 쪽 기준은 바뀌지 않는다(J-83 rows[].pass).
const drift = {
  basis: 'grading-stage-final',
  knowledge: { final: 0, A: 0, B: 0, unresolved: 0, n: 0, pairs: {}, rows: [] },
  code: { final: 0, A: 0, B: 0, unresolved: 0, n: 0, violDiff: 0, rows: [] },
  literal: { basis: 'J-83 rows[].final', knowledge: { final: 0, A: 0, B: 0, unresolved: 0, n: 0, pairs: {} } },
};
for (const r of mapRows.filter((x) => x.condition === 'off')) {
  const f = final.get(r.anon_id);
  const a = aIdx.get(r.anon_id);
  const b = bIdx.get(r.anon_id);
  if (!f || !a || !b) continue;
  if (r.kind === 'knowledge') {
    const jr = j60.get(`${r.orig_id}|${r.model}`);
    if (!jr) { issues.push(`표류 행의 J-83 행 없음 ${r.anon_id}`); continue; }
    const pre = jPrePack(r.orig_id, r.model);
    if (pre === null) { issues.push(`표류 행의 판J 채점 단계 판정 없음 ${r.anon_id}`); continue; }
    const un = f.src === '미확정';
    for (const [d, base] of [[drift.knowledge, pre], [drift.literal.knowledge, jr.final]]) {
      d.n++;
      if (a.verdict !== base) d.A++;
      if (b.verdict !== base) d.B++;
      if (un) d.unresolved++;
      else if (f.verdict !== base) { d.final++; const k = `${base}→${f.verdict}`; d.pairs[k] = (d.pairs[k] || 0) + 1; }
    }
    drift.knowledge.rows.push({ anon_id: r.anon_id, id: r.orig_id, model: r.model, j_grading: pre, j_final: jr.final, pack: packOf.get(r.orig_id) || '', k_final: un ? '미확정' : f.verdict, match: un ? null : f.verdict === pre, match_literal: un ? null : f.verdict === jr.final });
    rowsOut.push({ kind: 'knowledge', set: '60', id: r.orig_id, model: r.model, final: un ? '미확정' : f.verdict, src: f.src, pack: packOf.get(r.orig_id) || '', correct: !un && f.verdict === '정답', expensive: !!itemById.get(r.orig_id)?.expensive, condition: 'J', anon_id: r.anon_id, j_grading: pre, j_final: jr.final, drift_match: un ? null : f.verdict === pre, drift_match_literal: un ? null : f.verdict === jr.final });
  } else {
    const jr = jC.get(`${r.orig_id}|${r.model}`);
    if (!jr) { issues.push(`표류 행의 J-83 코드 행 없음 ${r.anon_id}`); continue; }
    const bl = blindC.get(r.anon_id);
    if (bl && Number(bl.checker_error_grade) !== jr.error_grade) issues.push(`K-65 묶음 오류급 ≠ J-83 ${r.anon_id}`);
    const passOf = (v) => jr.error_grade === 0 && v === '통과';
    const d = drift.code;
    d.n++;
    if (passOf(a.verdict) !== jr.pass) d.A++;
    if (passOf(b.verdict) !== jr.pass) d.B++;
    const un = f.src === '미확정';
    const kPass = un ? null : passOf(f.verdict);
    if (un) d.unresolved++;
    else if (kPass !== jr.pass) d.final++;
    const violSame = un ? null : (f.detail || '') === (jr.viol || '');
    if (violSame === false) d.violDiff++;
    d.rows.push({ anon_id: r.anon_id, id: r.orig_id, model: r.model, j_pass: jr.pass, k_pass: kPass, j_viol: jr.viol, k_viol: un ? '미확정' : f.detail, match: un ? null : kPass === jr.pass });
    rowsOut.push({ kind: 'code', set: 'C', id: r.orig_id, model: r.model, final: un ? '미확정' : f.verdict, src: f.src, viol: un ? '미확정' : f.detail, error_grade: jr.error_grade, pass: kPass, condition: 'J', anon_id: r.anon_id, j_pass: jr.pass, j_viol: jr.viol, drift_match: un ? null : kPass === jr.pass });
  }
}
const driftStatus = (d, thr) => (d.final >= thr ? '넘음' : d.final + d.unresolved >= thr ? '미확정' : '안 넘음');
drift.knowledge.threshold = DRIFT_K_THR;
drift.code.threshold = DRIFT_C_THR;
drift.knowledge.status = driftStatus(drift.knowledge, DRIFT_K_THR);
drift.literal.knowledge.threshold = DRIFT_K_THR;
drift.literal.knowledge.status = driftStatus(drift.literal.knowledge, DRIFT_K_THR);
drift.code.status = driftStatus(drift.code, DRIFT_C_THR);
if (drift.knowledge.n !== N_DRIFT_K) issues.push(`표류 지식 행 ${drift.knowledge.n} ≠ ${N_DRIFT_K}`);
if (drift.code.n !== N_DRIFT_C) issues.push(`표류 코드 행 ${drift.code.n} ≠ ${N_DRIFT_C}`);

// ── 지식 칸 ────────────────────────────────────────────────────────────────────
function agg(list) {
  return {
    c: list.filter((x) => x.f.src !== '미확정' && x.f.verdict === '정답').length,
    n: list.length,
    expWrong: list.filter((x) => x.it.expensive && !(x.f.src !== '미확정' && x.f.verdict === '정답')).length,
    unresolved: list.filter((x) => x.f.src === '미확정').length,
  };
}
function cell(m, k, j, harmGap, band, dStatus) {
  const harm = j ? j.c - k.c >= harmGap : false;
  let v;
  if (!observed[m].comparable) v = '비교 불가';
  else if (k.unresolved > 0 || dStatus === '미확정') v = '미확정';
  else if (dStatus === '넘음') v = '측정 후 결정';
  else if (harm) v = '해친다';
  else v = band;
  return { harm, cell: v };
}
const knowledge = {};
for (const m of K_MODELS) {
  const rows = kRows[m] || [];
  if (rows.length !== 60) issues.push(`켠 조건 지식 행 ${m} ${rows.length} ≠ 60`);
  const scope = (pred) => rows.filter((x) => JUDGEABLE.has(x.it.id) && pred(x.it));
  const mk = (list, j) => {
    const k = agg(list);
    const rb = rateBand(k.c, k.n);
    const eb = expBand(k.expWrong);
    const band = worse(rb, eb);
    const { harm, cell: v } = cell(m, k, j, 2, band, drift.knowledge.status);
    return { ...k, rate: pct(k.c, k.n), rateBand: rb, expBand: eb, band, j_c: j.c, j_n: j.n, diff: k.c - j.c, harm, cell: v };
  };
  knowledge[m] = { all: mk(scope(() => true), jBase[m].all), byCat: Object.fromEntries(CATS.map(([cat]) => [cat, mk(scope((it) => it.category === cat), jBase[m].byCat[cat])])) };
  for (const x of rows) {
    const k = k50Idx.get(`${m}|${x.it.id}`) || {};
    const un = x.f.src === '미확정';
    rowsOut.push({
      kind: 'knowledge', set: '60', id: x.it.id, model: m, final: un ? '미확정' : x.f.verdict, src: x.f.src, pack: packOf.get(x.it.id) || '',
      correct: !un && x.f.verdict === '정답', expensive: !!x.it.expensive, condition: 'K', anon_id: x.anon, judgeable: JUDGEABLE.has(x.it.id),
      observed_model: k.observed_model ?? null, attempts: num(k.attempts), invalid: num(k.invalid_attempts), outside_attempts: num(k.outside_attempts),
      files_read: num(k.files_read), tool_calls: num(k.tool_calls), tokens: { in: num(k.tokens_in), out: num(k.tokens_out) }, duration_ms: num(k.duration_ms), answer: k.answer ?? null,
    });
  }
}
function num(x) { return x === undefined || x === '' ? null : Number(x); }
function pct(c, n) { return n ? ((100 * c) / n).toFixed(1) : '-'; }

// ── 코드 칸 ────────────────────────────────────────────────────────────────────
const code = {};
for (const m of K_MODELS) {
  const rows = cRows[m] || [];
  if (rows.length !== 5) issues.push(`켠 조건 코드 행 ${m} ${rows.length} ≠ 5`);
  const res = rows.map((x) => ({ ...x, pass: x.f.src === '미확정' ? null : x.eg === 0 && x.f.verdict === '통과' }));
  const passed = res.filter((x) => x.pass === true).map((x) => x.id);
  const unresolved = res.filter((x) => x.pass === null).length;
  const band = codeBand(passed.length);
  const { harm, cell: v } = cell(m, { c: passed.length, unresolved }, { c: jBase[m].code }, 1, band, drift.code.status);
  code[m] = { passed, n: 5, unresolved, band, j_passed: jBase[m].code, diff: passed.length - jBase[m].code, harm, cell: v, errorGradeTotal: res.reduce((s, x) => s + x.eg, 0), viol: Object.fromEntries(res.map((x) => [x.id, x.f.src === '미확정' ? '미확정' : x.f.detail])) };
  for (const x of res) {
    const ev = CODE_EV[`${m}|${x.id}`] || {};
    rowsOut.push({
      kind: 'code', set: 'C', id: x.id, model: m, final: x.f.src === '미확정' ? '미확정' : x.f.verdict, src: x.f.src, viol: x.f.src === '미확정' ? '미확정' : x.f.detail,
      error_grade: x.eg, pass: x.pass, condition: 'K', anon_id: x.anon, observed_model: x.c?.observed_model ?? null, attempts: num(x.c?.attempts),
      invalid: num(x.c?.invalid_attempts), outside_attempts: num(x.c?.outside_attempts), files_read: num(x.c?.files_read), tool_calls: ev.tool_calls ?? null,
      tokens: { in: num(x.c?.tokens_in), out: num(x.c?.tokens_out) }, wall_ms: ev.wall_ms ?? null, answer: x.c?.answer ?? null,
    });
  }
}

// ── L1-f 결합 ──────────────────────────────────────────────────────────────────
const l1f = {};
for (const m of K_MODELS) {
  const cd = code[m];
  const ab = knowledge[m].byCat.abap;
  const p = cd.passed.length;
  let base;
  if (p === 5) base = ab.c === ab.n && ab.n === 6 ? '메운다' : '측정 후 결정';
  else if (p === 4) base = '측정 후 결정';
  else base = '못 메운다';
  let v;
  if (!observed[m].comparable) v = '비교 불가';
  else if (cd.unresolved > 0 || drift.code.status === '미확정') v = '미확정';
  else if (drift.code.status === '넘음') v = '측정 후 결정';
  else if (cd.harm) v = '해친다';
  else if (p === 5 && (ab.unresolved > 0 || drift.knowledge.status === '미확정')) v = '미확정';
  else if (p === 5 && drift.knowledge.status === '넘음') v = '측정 후 결정';
  else v = base;
  l1f[m] = { code_passed: p, abap_c: ab.c, abap_n: ab.n, base, cell: v };
}

// ── 층 판정 ────────────────────────────────────────────────────────────────────
function layerRule(cells) {
  const vals = cells.map((v) => (v === '비교 불가' ? '측정 후 결정' : v));
  if (vals.some((v) => v === '못 메운다' || v === '해친다')) return '가정 기각';
  if (vals.some((v) => v === '미확정')) return '미확정';
  if (vals.every((v) => v === '메운다')) return '가정 확인';
  return '측정 후 결정';
}
const LAYER_DEFS = [
  ['L1-a', '지식 팩 — 모듈 (모듈 칸)', (m) => knowledge[m].byCat.module.cell, true],
  ['L2', '페르소나 (모듈 칸이 대신 잰다)', (m) => knowledge[m].byCat.module.cell, true],
  ['L1-f', 'ABAP 일반 작법 (결합 칸)', (m) => l1f[m].cell, true],
  ['L1-b', '지식 팩 — 나라 (나라 칸 · 병기만)', (m) => knowledge[m].byCat.country.cell, false],
  ['L1-d', '지식 팩 — 업종 (업종 칸 · 병기만)', (m) => knowledge[m].byCat.industry.cell, false],
];
const layers = LAYER_DEFS.map(([id, name, get, main]) => {
  const cells = Object.fromEntries(K_MODELS.map((m) => [m, get(m)]));
  cells[CODEX] = '측정 불가';
  const claude = K_MODELS.map((m) => cells[m]);
  return { id, name, d160: main, cells, three_model_rule: layerRule([...claude, '측정 불가']), claude_two_rule: layerRule(claude), claude_both_fill_codex_unmeasured: claude.every((v) => v === '메운다') };
});

// ── 병기 ──────────────────────────────────────────────────────────────────────
const side = {};
for (const m of K_MODELS) {
  const rows = kRows[m] || [];
  const ok = (x) => x.f.src !== '미확정' && x.f.verdict === '정답';
  const pairs = { jWrongKRight: [], jRightKWrong: [], bothRight: 0, bothWrong: 0, unresolved: 0 };
  for (const x of rows.filter((y) => JUDGEABLE.has(y.it.id))) {
    const jr = j60.get(`${x.it.id}|${m}`);
    if (x.f.src === '미확정') { pairs.unresolved++; continue; }
    if (!jr.correct && ok(x)) pairs.jWrongKRight.push(x.it.id);
    else if (jr.correct && !ok(x)) pairs.jRightKWrong.push(x.it.id);
    else if (jr.correct) pairs.bothRight++;
    else pairs.bothWrong++;
  }
  side[m] = {
    strict60: { c: rows.filter(ok).length, n: rows.length, unresolved: rows.filter((x) => x.f.src === '미확정').length, j: jBase[m].strict60 ? { c: jBase[m].strict60.c, n: jBase[m].strict60.n } : null },
    packError: PACK_ERR.map((id) => { const x = rows.find((y) => y.it.id === id); return { id, final: x ? (x.f.src === '미확정' ? '미확정' : x.f.verdict) : '?' }; }),
    undecidable: UNDECIDABLE.map((id) => { const x = rows.find((y) => y.it.id === id); return { id, final: x ? (x.f.src === '미확정' ? '미확정' : x.f.verdict) : '?' }; }),
    newDoubts: rows.filter((x) => x.f.src !== '미확정' && x.f.verdict === '팩어긋남의심').map((x) => ({ anon_id: x.anon, id: x.it.id, judgeable: JUDGEABLE.has(x.it.id), pack: packOf.get(x.it.id) || '', src: x.f.src })),
    pairs,
  };
  side[m].packError.followedPack = side[m].packError.filter((x) => x.final === '정답').length;
}
// 사용량
function usage(list) {
  const s = (f) => list.reduce((t, x) => t + (x[f] ?? 0), 0);
  return {
    n: list.length, files_read: s('files_read'), tool_calls: s('tool_calls'), outside_attempts: s('outside_attempts'), invalid: s('invalid'),
    attempts_gt1: list.filter((x) => (x.attempts ?? 1) > 1).length, answer_none: list.filter((x) => x.answer === 'none').length,
    tokens_in: list.reduce((t, x) => t + (x.tokens?.in ?? 0), 0), tokens_out: list.reduce((t, x) => t + (x.tokens?.out ?? 0), 0),
    duration_ms: s('duration_ms'), wall_ms: s('wall_ms'),
  };
}
const use = Object.fromEntries(K_MODELS.map((m) => [m, {
  knowledge: usage(rowsOut.filter((r) => r.condition === 'K' && r.kind === 'knowledge' && r.model === m)),
  code: usage(rowsOut.filter((r) => r.condition === 'K' && r.kind === 'code' && r.model === m)),
}]));

// Codex 재채점 (일치율에만 · 판정에 쓰지 않음)
const codex = { status: '보류', note: opt.regrade ? '' : 'K-82 미지정', final: [0, 0], A: [0, 0], B: [0, 0], perModel: {} };
if (RG) {
  if (RG.hdr.join(',') !== REGRADE_HDR.join(',')) issues.push('K-82 머리 줄 어긋남');
  if (RG.length !== 24) issues.push(`K-82 행 수 ${RG.length} ≠ 24`);
  const held = RG.filter((g) => HOLD.test(g.verdict_codex)).length;
  if (held !== 0 && held !== RG.length) issues.push(`K-82 Codex 판정 칸이 보류와 값이 섞임 (보류 ${held}/${RG.length})`);
  for (const g of RG) {
    const mp = mapIdx.get(g.id);
    if (!mp) { issues.push(`K-82 anon_id 가 매핑에 없음 ${g.id}`); continue; }
    if (mp.condition !== 'on' || mp.kind !== 'knowledge' || !K_MODELS.includes(mp.model) || g.model !== mp.model) issues.push(`K-82 행이 켠 조건 Claude 지식 행이 아님 ${g.id}`);
    const f = final.get(g.id);
    const vals = [['verdict_A', aIdx.get(g.id)?.verdict], ['verdict_B', bIdx.get(g.id)?.verdict], ['verdict_final', f && f.src !== '미확정' ? f.verdict : null]];
    for (const [col, want] of vals) if (g[col] !== '' && !HOLD.test(g[col]) && want !== null && g[col] !== want) issues.push(`K-82 ${col} ≠ 재계산 ${g.id}`);
    if (held === 0) {
      if (!vocabOk('knowledge', g.verdict_codex, g.verdict_codex === '정답' ? '완전' : g.verdict_codex === '오답' ? '부분' : '의심:')) issues.push(`K-82 Codex 판정 어휘 밖 ${g.id}`);
      for (const [name, v] of [['final', f && f.src !== '미확정' ? f.verdict : null], ['A', aIdx.get(g.id)?.verdict], ['B', bIdx.get(g.id)?.verdict]]) {
        if (v === null) continue;
        codex[name][1]++; if (g.verdict_codex === v) codex[name][0]++;
      }
      const pm = (codex.perModel[mp.model] = codex.perModel[mp.model] || [0, 0]);
      if (f && f.src !== '미확정') { pm[1]++; if (g.verdict_codex === f.verdict) pm[0]++; }
    }
  }
  codex.status = held === RG.length ? '보류' : '측정';
  codex.note = held === RG.length ? 'K-82 Codex 판정 칸 전부 보류' : '';
}

// ── 대조 실패면 멈춘다 ─────────────────────────────────────────────────────────
if (issues.length) {
  console.error(`입력 대조 실패 ${issues.length}건 — 결과를 쓰지 않는다:`);
  for (const x of issues) console.error(`  - ${x}`);
  process.exit(1);
}

// ── 사람용 출력 ────────────────────────────────────────────────────────────────
const L = [];
const p = (s = '') => L.push(s);
const pad = (s, w) => { s = String(s); let len = 0; for (const ch of s) len += /[ᄀ-ᇿ㄰-㆏가-힯　-〿＀-￯→✓✗]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(1, w - len)); };
const frac = (c, n) => `${c}/${n} = ${pct(c, n)}%`;
p('K-83 — 판K 집계 결과 (K-83-aggregate.mjs 산출물 · 손으로 고치지 않는다)');
p('======================================================================');
p('이 파일은 판정을 하지 않는다 — 비응시 채점자(K-70 · K-71 · K-80 = Claude Fable)의 판정을 읽어 D-160 의 사전 등록된 선을');
p('쓰인 그대로 적용한 숫자와 띠 결과다. 행 단위 최종 판정은 K-83-results.json `rows`. 규칙 · 해석한 자리는 스크립트 머리 주석.');
p();
p('§0 입력 지문 (BOM 제거 · CRLF→LF 정규화 뒤 sha256 앞 16자리)');
for (const f of Object.keys(fingerprint)) p(`  ${pad(f, 92)} ${fingerprint[f]}`);
p(`  상태: 제3 판정 ${ADJ_PRESENT ? `있음(${adjRows.length}행)` : '없음'} · 미확정 행 ${unresolvedTotal}${unresolvedTotal ? ' — A≠B 행이 제3 판정을 기다린다(--check 는 FAIL)' : ''}`);
p();
p('§1 행 복원 (매핑 → 조건 · 모델 · 원 id)');
p(`  매핑 ${mapRows.length}행 = 지식 켠 ${MAPN.kOn} · 끈(표류) ${MAPN.kOff} · 코드 켠 ${MAPN.cOn} · 끈(표류) ${MAPN.cOff}`);
p(`  A≠B 행 ${nDis} = 지식 ${disagree.knowledge.length}(verdict 다름) · 코드 ${disagree.code.length}(verdict 또는 위반 목록 다름) · 최종 출처: A=B ${[...final.values()].filter((f) => f.src === 'A=B').length} · K-80 ${[...final.values()].filter((f) => f.src === 'K-80').length} · 미확정 ${unresolvedTotal}`);
p();
p('§2 채점 일치율 (병기)');
p(`  A↔B 지식(verdict)          ${frac(...agreeAB.knowledge)}`);
p(`  A↔B 지식(verdict+detail)   ${frac(...agreeAB.knowledgeDetail)}`);
p(`  A↔B 코드(verdict+위반 목록) ${frac(...agreeAB.code)}`);
p(`  표류(판J 채점 단계 최종과 같음) 지식: 최종 ${drift.knowledge.n - drift.knowledge.final - drift.knowledge.unresolved}/${drift.knowledge.n} · A ${drift.knowledge.n - drift.knowledge.A}/${drift.knowledge.n} · B ${drift.knowledge.n - drift.knowledge.B}/${drift.knowledge.n}`);
p(`  표류(과제 통과 같음)  코드: 최종 ${drift.code.n - drift.code.final - drift.code.unresolved}/${drift.code.n} · A ${drift.code.n - drift.code.A}/${drift.code.n} · B ${drift.code.n - drift.code.B}/${drift.code.n}`);
if (codex.status === '보류') p(`  Codex↔최종 · Codex↔A · Codex↔B  보류 (${codex.note})`);
else {
  p(`  Codex↔최종   ${frac(...codex.final)}`);
  p(`  Codex↔A      ${frac(...codex.A)}`);
  p(`  Codex↔B      ${frac(...codex.B)}`);
  for (const [m, [a, n]] of Object.entries(codex.perModel)) p(`    ${pad(SHORT[m], 18)} Codex↔최종 ${frac(a, n)}`);
}
p();
p(`§3 표류 검사 (끈 조건 = 판J 답안 · 문턱 지식 ≥${DRIFT_K_THR}/${N_DRIFT_K} · 코드 ≥${DRIFT_C_THR}/${N_DRIFT_C})`);
const dk = drift.knowledge;
const dl = drift.literal.knowledge;
const pairsOf = (d) => { const ks = Object.keys(d.pairs).sort(); return ks.length ? ks.map((k) => `${k} ${d.pairs[k]}`).join(' · ') : '없음'; };
p(`  지식 · 채택 기준(판J 채점 단계 최종 = J-70/J-71 A=B 또는 J-80 · 팩 감사 J-81 이전 — 사양 §7 ⓤ): 불일치 최종 ${dk.final} · A ${dk.A} · B ${dk.B} · 미확정 ${dk.unresolved} / ${dk.n} → 문턱 ${dk.status}${dk.status === '넘음' ? ' — 지식 비교 칸 전부 측정 후 결정' : ''}`);
p(`    불일치 꼴(판J→판K): ${pairsOf(dk)}`);
for (const r of dk.rows.filter((x) => x.match === false)) p(`    ${r.anon_id} ${pad(r.id, 24)} ${pad(SHORT[r.model], 18)} 판J 채점 단계 ${r.j_grading} → 판K ${r.k_final}`);
p(`  지식 · D-160 문언 기준(병기 · 비교 칸에 쓰지 않음 · J-83 rows[].final = 팩 오류 문항은 J-81 공식 문서 대조 값): 불일치 최종 ${dl.final} · A ${dl.A} · B ${dl.B} · 미확정 ${dl.unresolved} / ${dl.n} → 문턱 ${dl.status}`);
p(`    불일치 꼴(판J→판K): ${pairsOf(dl)}`);
for (const r of dk.rows.filter((x) => x.match_literal === false)) p(`    ${r.anon_id} ${pad(r.id, 24)} ${pad(SHORT[r.model], 18)} J-83 최종 ${r.j_final} → 판K ${r.k_final}${r.pack ? ` · J-81 ${r.pack}` : ''} · 판J 채점 단계 ${r.j_grading}`);
p(`  코드 · 기준 J-83 rows[].pass(바뀌지 않음) · 과제 통과 불일치 최종 ${drift.code.final} · A ${drift.code.A} · B ${drift.code.B} · 미확정 ${drift.code.unresolved} / ${drift.code.n} → 문턱 ${drift.code.status}${drift.code.status === '넘음' ? ' — 코드 비교 칸 전부 측정 후 결정' : ''}`);
p(`    위반 목록 문자열이 다른 행(병기만 · 통과 판정과 무관) ${drift.code.violDiff}/${drift.code.n}`);
for (const r of drift.code.rows.filter((x) => x.match === false || (x.k_viol !== '미확정' && x.k_viol !== x.j_viol))) {
  p(`    ${r.anon_id} ${r.id} ${pad(SHORT[r.model], 18)} 통과 판J ${r.j_pass ? '✓' : '✗'} 판K ${r.k_pass === null ? '?' : r.k_pass ? '✓' : '✗'} · 위반 판J「${r.j_viol}」 판K「${r.k_viol}」`);
}
p();
p('§4 관측 모델 id (D-160 ⓑ — 다른 행이 하나라도 있으면 그 모델의 판정 칸 전부 비교 불가)');
for (const m of K_MODELS) {
  const o = observed[m];
  p(`  ${pad(SHORT[m], 18)} 지식 ${o.knowledge.match}/${o.knowledge.n} · 코드 ${o.code.match}/${o.code.n} 일치 → ${o.comparable ? '비교 가능' : '비교 불가'}`);
}
p(`  ${pad(SHORT[CODEX], 18)} 측정 불가 — 판K 에서 뺐다(K-00 §3 · §10 T0-c) · 판J 기준선은 아래 표에 병기`);
p();
p('§5 지식 — 판정 가능 분모 47 (D-160 · 정답률 띠 ≥95 메운다 · 90~95 측정 후 결정 · <90 못 메운다 / 비싼 오답 0 통과 · 1 측정 후 결정 · ≥2 못 메운다)');
p('  칸 = 비교 불가 > 미확정 > 표류 넘음(측정 후 결정) > 해친다(판J 보다 2문항 이상 적음) > 띠(두 띠의 나쁜 쪽)');
p(`  ${pad('범위', 16)} ${pad('모델', 18)} ${pad('판K', 18)} ${pad('비싼 오답', 9)} ${pad('정답률 띠', 13)} ${pad('비싼 띠', 13)} ${pad('판J', 18)} ${pad('차', 5)} ${pad('해친다', 7)} 칸`);
const scopes = [['all', '전체 47'], ...CATS.map(([c, l]) => [c, l])];
for (const [sc, lab] of scopes) {
  for (const m of K_MODELS) {
    const k = sc === 'all' ? knowledge[m].all : knowledge[m].byCat[sc];
    p(`  ${pad(lab, 16)} ${pad(SHORT[m], 18)} ${pad(frac(k.c, k.n), 18)} ${pad(k.expWrong, 9)} ${pad(k.rateBand, 13)} ${pad(k.expBand, 13)} ${pad(frac(k.j_c, k.j_n), 18)} ${pad(k.diff >= 0 ? `+${k.diff}` : k.diff, 5)} ${pad(k.harm ? '예' : '아니오', 7)} ${k.cell}${k.unresolved ? ` (미확정 행 ${k.unresolved})` : ''}`);
  }
  const jb = sc === 'all' ? jBase[CODEX].all : jBase[CODEX].byCat[sc];
  p(`  ${pad(lab, 16)} ${pad(SHORT[CODEX], 18)} ${pad('측정 불가', 18)} ${pad('-', 9)} ${pad('-', 13)} ${pad('-', 13)} ${pad(frac(jb.c, jb.n), 18)} ${pad('-', 5)} ${pad('-', 7)} 측정 불가`);
}
p();
p('§6 지식 병기 (판정 없음)');
for (const m of K_MODELS) {
  const s = side[m];
  p(`  ${SHORT[m]}`);
  p(`    엄격 60(판K = 채점자 최종 · J-10 키 기준): ${frac(s.strict60.c, s.strict60.n)}${s.strict60.unresolved ? ` · 미확정 ${s.strict60.unresolved}` : ''} · 판J 엄격 60(J-83 §2 · 팩 오류 5 는 J-81 공식 문서 대조): ${s.strict60.j ? frac(s.strict60.j.c, s.strict60.j.n) : '-'}`);
  p(`    팩 오류 5문항 — 키(=팩) 일치 「정답」 수 = 팩을 따라 틀린 수: ${s.packError.followedPack}/5  (${s.packError.map((x) => `${x.id} ${x.final}`).join(' · ')})`);
  p(`    판정 불가 8문항의 판K 최종: ${s.undecidable.map((x) => `${x.id} ${x.final}`).join(' · ')}`);
  p(`    새 의심(판K 최종 팩어긋남의심 · 오답으로 셈) ${s.newDoubts.length}: ${s.newDoubts.length ? s.newDoubts.map((x) => `${x.anon_id} ${x.id}${x.judgeable ? '' : `(${x.pack} — 분모 밖)`}`).join(' · ') : '없음'}`);
  const pr = s.pairs;
  p(`    문항별 짝(판정 가능 47): 판J ✗→판K ✓ ${pr.jWrongKRight.length} · 판J ✓→판K ✗ ${pr.jRightKWrong.length} · 둘 다 ✓ ${pr.bothRight} · 둘 다 ✗ ${pr.bothWrong}${pr.unresolved ? ` · 미확정 ${pr.unresolved}` : ''}`);
  if (pr.jWrongKRight.length) p(`      ✗→✓ ${pr.jWrongKRight.join(' · ')}`);
  if (pr.jRightKWrong.length) p(`      ✓→✗ ${pr.jRightKWrong.join(' · ')}`);
}
p();
p('§7 코드 — C-01~C-05 (통과 = 검사기 오류급 0 ∧ 최종 「통과」 · 5/5 메운다 · 4/5 측정 후 결정 · ≤3/5 못 메운다 · 해친다 = 판J 보다 1과제 이상 적음)');
for (const m of K_MODELS) {
  const c = code[m];
  p(`  ${pad(SHORT[m], 18)} ${c.passed.length}/5 통과 (${c.passed.join(' · ') || '없음'}) · 띠 ${c.band} · 판J ${c.j_passed}/5 · 차 ${c.diff >= 0 ? `+${c.diff}` : c.diff} · 해친다 ${c.harm ? '예' : '아니오'} → 칸 ${c.cell}${c.unresolved ? ` (미확정 행 ${c.unresolved})` : ''} · 검사기 오류급 합 ${c.errorGradeTotal}`);
  p(`    위반 목록: ${CODE_IDS.map((id) => `${id} ${c.viol[id] || '-'}`).join(' · ')}`);
}
p(`  ${pad(SHORT[CODEX], 18)} 측정 불가 · 판J ${jBase[CODEX].code}/5`);
p();
p('§8 L1-f 결합 (판K 결과에만 · 코드 5/5 ∧ K-ABAP 6/6 → 메운다 · 5/5 ∧ <6/6 → 측정 후 결정 · 4/5 → 측정 후 결정 · ≤3/5 → 못 메운다)');
for (const m of K_MODELS) {
  const x = l1f[m];
  p(`  ${pad(SHORT[m], 18)} 코드 ${x.code_passed}/5 · K-ABAP ${x.abap_c}/${x.abap_n} → 결합 ${x.base} → 칸 ${x.cell}`);
}
p(`  ${pad(SHORT[CODEX], 18)} 측정 불가`);
p();
p('§9 층 판정 (D-160 「층 판정」 — 하나라도 못 메운다/해친다 → 가정 기각 · 셋 다 메운다 → 가정 확인 · 그 밖 → 측정 후 결정 · 비교 불가 = 측정 후 결정)');
p(`  ${pad('층', 6)} ${pad('무엇을 읽나', 38)} ${pad('Opus 5.5', 14)} ${pad('Sonnet 5.5', 14)} ${pad('Codex', 10)} ${pad('세 모델 문언', 14)} Claude 둘`);
for (const l of layers) {
  if (!l.d160) continue;
  p(`  ${pad(l.id, 6)} ${pad(l.name, 38)} ${pad(l.cells[K_MODELS[0]], 14)} ${pad(l.cells[K_MODELS[1]], 14)} ${pad('측정 불가', 10)} ${pad(l.three_model_rule, 14)} ${l.claude_two_rule}${l.claude_both_fill_codex_unmeasured ? ' · Claude 둘 메운다 · Codex 측정 불가' : ''}`);
}
p('  병기만(D-160 층 판정 대상 밖 · 같은 규칙을 적용한 값):');
for (const l of layers) {
  if (l.d160) continue;
  p(`  ${pad(l.id, 6)} ${pad(l.name, 38)} ${pad(l.cells[K_MODELS[0]], 14)} ${pad(l.cells[K_MODELS[1]], 14)} ${pad('측정 불가', 10)} ${pad(l.three_model_rule, 14)} ${l.claude_two_rule}`);
}
p();
p('§10 사용량 (병기만 · 켠 조건 행 합계)');
p(`  ${pad('모델', 18)} ${pad('시험', 6)} ${pad('행', 4)} ${pad('읽은 파일', 10)} ${pad('도구 호출', 10)} ${pad('폴더 밖', 8)} ${pad('무효 시도', 10)} ${pad('재응시 행', 10)} ${pad('답 없음', 8)} ${pad('토큰 입력', 12)} ${pad('토큰 출력', 10)} 시간(ms)`);
for (const m of K_MODELS) {
  for (const [kind, lab] of [['knowledge', '지식'], ['code', '코드']]) {
    const u = use[m][kind];
    p(`  ${pad(SHORT[m], 18)} ${pad(lab, 6)} ${pad(u.n, 4)} ${pad(u.files_read, 10)} ${pad(u.tool_calls, 10)} ${pad(u.outside_attempts, 8)} ${pad(u.invalid, 10)} ${pad(u.attempts_gt1, 10)} ${pad(u.answer_none, 8)} ${pad(u.tokens_in, 12)} ${pad(u.tokens_out, 10)} ${kind === 'knowledge' ? `${u.duration_ms} (K-50 duration_ms)` : `${u.wall_ms} (K-60 이벤트 wall_ms)`}`);
  }
}
p();
p('§11 이 집계가 하지 않는 것');
p('  - 판정 칸의 뜻을 문장으로 풀지 않는다 — 결론은 판K 감사 문서와 D-항목이 가진다.');
p('  - 팩 감사를 다시 하지 않는다(D-160 「정답 키 동결」) — 새 의심은 목록에만 있고 오답으로 셌다.');
p('  - Codex 응시 행이 없다(측정 불가) — Codex 칸은 판J 기준선만 병기한다.');
p('  해석한 자리(메인이 채택 — 사양 §7):');
p('  - 표류 지식 기준 = 판J 채점 단계 최종(팩 감사 전 · 채점자 판정끼리 · 사용자 결정 ⓤ) · D-160 문언 기준(J-83 rows[].final)은 §3 에 병기만.');
p('    이 기준은 1부 시험 실행(제3 판정 전)이 문언 기준의 불일치가 전부 J-81 팩 오류 문항에서 난 것을 보인 뒤에 정해졌다.');
p('  - 비싼 항목 = J-10 expensive 표지(13 · 전부 나라 · 판정 가능 47 안) · 판정 불가 8 · 팩 오류 5 는 분모 밖이고 §6 에 병기 · 판K 엄격 60 = 채점자 최종(J-10 키) 정답 수(판J 엄격 60 과 산법 다름) · 「팩을 따라 틀린 수」 = 팩 오류 5문항의 「정답」 수.');
p('  - L1-f 칸: 코드 표류 넘음 → 측정 후 결정 · 지식 표류 넘음은 코드 5/5 일 때만 측정 후 결정 · 코드 칸의 해친다만 옮긴다.');
p('  - K-80 model 칸 = 매핑의 모델(조건 열 없음 · 다른 칸 바이트 그대로) — 집계는 빈 칸 또는 매핑과 같은 값만 받는다.');
p('  - 시간 병기는 지식 = K-50 duration_ms · 코드 = K-60 이벤트 wall_ms 로 재는 값이 다르다.');

const txt = `${L.join('\n')}\n`;
const json = {
  _schema: 'harness-on-aggregate-v1', generated_by: 'K-83-aggregate.mjs', inputs: fingerprint,
  status: { adjudication: ADJ_PRESENT ? 'present' : 'absent', unresolved: unresolvedTotal },
  counts: { map: MAPN, disagree: { knowledge: disagree.knowledge.length, code: disagree.code.length }, judgeable: [...JUDGEABLE].length, pack_error: PACK_ERR, undecidable: UNDECIDABLE },
  agreement: { AB: agreeAB, codex }, drift, observed, baseline_j: jBase, knowledge, code, l1f, layers, side, usage: use,
  rows: rowsOut,
};
const out = [[opt.out, txt], [opt.json, `${JSON.stringify(json, null, 1)}\n`]];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

if (CHECK) {
  const fails = [...bandSelftest()];
  if (unresolvedTotal > 0 || !ADJ_PRESENT) fails.push(`제3 판정 ${ADJ_PRESENT ? '있음' : '없음'} · 미확정 행 ${unresolvedTotal} — 최종 판정이 다 서지 않았다`);
  for (const [f, s] of out) {
    if (!fs.existsSync(f)) fails.push(`출력 없음 ${label(f)}`);
    else if (fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') !== s) fails.push(`다시 계산한 결과가 디스크와 다르다 ${label(f)}`);
  }
  if (fails.length) {
    console.error(`--check FAIL ${fails.length}건:`);
    for (const x of fails) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`--check PASS — 입력 대조 · 행 수 · 어휘 · 매핑 · 띠 자체 시험 · 미확정 0 · 출력 2종 재계산 일치 (sha256(txt)=${sha(txt)})`);
} else {
  for (const [f, s] of out) fs.writeFileSync(f, s, 'utf8');
  console.log(`작성 ${label(opt.out)} · ${label(opt.json)} — sha256(txt)=${sha(txt)}${unresolvedTotal ? ` · ⚠ 미확정 행 ${unresolvedTotal}(제3 판정 없음)` : ''}`);
}
