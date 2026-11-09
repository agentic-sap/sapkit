#!/usr/bin/env node
// L-83-aggregate.mjs — 판L E-1 · E-3 집계 (판정 칸은 채점 CSV에서 기계로만 옮긴다)
//
// 입력(전부 레포 상대 · 읽기만):
//   E-1  L-70-grading-A.csv · L-71-grading-B.csv · L-80-adjudication-e1.csv (제3 — 갈린 행만)
//   E-3  L-72-match-A.csv · L-73-match-B.csv · L-81-adjudication-e3.csv (제3 — 갈린 줄만)
//   공통 L-79-blind-map.csv (익명 id ↔ 조건 · 모델 · 과제)
//   판K  ../2026-11-08-harness-on-comparison-data/K-83-results.json · K-60-checker-summary.csv
//   판L  L-60-checker-summary.csv (토큰 · 검사기 — 병기용)
// 출력: L-83-results.txt · L-83-results.json
// 사용: node L-83-aggregate.mjs          → 출력 두 파일을 쓴다
//       node L-83-aggregate.mjs --check  → 다시 계산해 기존 출력과 바이트 대조 + 입력 무결성 assert (쓰지 않는다)
// 선(spec E-1 · E-3 · D-164 그대로):
//   E-1 모델마다 ≥4/5 「쪽지가 먹힌다」 · 3/5 「측정 후 결정」 · ≤2/5 「쪽지로는 부족」 · 판K보다 1과제 이상 적으면 「해친다」 병기.
//       표류 검사 — 판K 답 10행의 판L 최종 통과 판정이 판K 최종과 2행 이상 다르면 E-1 전 칸 「측정 후 결정」.
//   E-3 쪽지 조건 잡은 수가 원본 조건보다 2건 이상 낮으면 「복귀」, 그 밖이면 「채택」. 거짓(정답 밖) 지적은 병기만.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const K_DIR = join(HERE, '..', '2026-11-08-harness-on-comparison-data');
const CHECK = process.argv.includes('--check');
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const TASKS = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'];

const fails = [];
const assert = (cond, msg) => { if (!cond) fails.push(msg); };

function parseCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const ruleSet = (v) => (v || '').split(';').filter(Boolean).map((x) => x.split('@')[0]).sort((a, b) => a - b).join(',');

// ── 매핑 ─────────────────────────────────────────────
const map = parseCsv(join(HERE, 'L-79-blind-map.csv'));
const byId = Object.fromEntries(map.map((m) => [m.anon_id, m]));

// ── E-1 ──────────────────────────────────────────────
const gA = parseCsv(join(HERE, 'L-70-grading-A.csv'));
const gB = parseCsv(join(HERE, 'L-71-grading-B.csv'));
const g3 = parseCsv(join(HERE, 'L-80-adjudication-e1.csv'));
assert(gA.length === 20 && gB.length === 20, `E-1 채점 행 수 A=${gA.length} B=${gB.length} (기대 20)`);
const disputed = gA.filter((a) => {
  const b = gB.find((x) => x.anon_id === a.anon_id);
  return ruleSet(a.violations) !== ruleSet(b.violations) || a.task_pass !== b.task_pass;
}).map((a) => a.anon_id);
assert(JSON.stringify(disputed) === JSON.stringify(g3.map((r) => r.anon_id)),
  `제3 판정 행(${g3.map((r) => r.anon_id).join(',')}) ≠ 갈린 행(${disputed.join(',')})`);

const e1rows = gA.map((a) => {
  const b = gB.find((x) => x.anon_id === a.anon_id);
  const t = g3.find((x) => x.anon_id === a.anon_id);
  const fin = t || a; // 갈리지 않은 행은 A = B (번호 집합 · 통과) — 줄은 A 값을 쓴다
  const m = byId[a.anon_id];
  assert(m && m.bundle === 'e1' && m.task_id === a.task_id, `E-1 매핑 불일치 ${a.anon_id}`);
  assert(fin.task_pass === '통과' || fin.task_pass === '불통과', `task_pass 값 이상 ${a.anon_id}`);
  return {
    anon_id: a.anon_id, condition: m.condition, model: m.model, task: a.task_id,
    pass: fin.task_pass === '통과', viol: fin.violations, src: t ? 'L-80' : 'A=B',
    passA: a.task_pass === '통과', passB: b.task_pass === '통과', violA: a.violations, violB: b.violations,
    lineDiffAB: !t && a.violations !== b.violations,
  };
});

const K = JSON.parse(readFileSync(join(K_DIR, 'K-83-results.json'), 'utf8'));
const kCodeRows = K.rows.filter((r) => r.kind === 'code');
const kPass = (model, task) => K.code[model].passed.includes(task);
const jPass = (model, task) => {
  const r = kCodeRows.find((x) => x.model === model && x.id === task && x.condition === 'J');
  return r ? r.j_pass : null;
};

// 표류 검사 — 판K 답 10행
const driftRows = e1rows.filter((r) => r.condition === 'panK-drift');
assert(driftRows.length === 10, `표류 행 수 ${driftRows.length} (기대 10)`);
const drift = driftRows.map((r) => ({
  anon_id: r.anon_id, model: r.model, task: r.task, k_final: kPass(r.model, r.task),
  l_final: r.pass, l_A: r.passA, l_B: r.passB, k_viol: K.code[r.model].viol[r.task], l_viol: r.viol,
}));
const driftDiff = drift.filter((d) => d.k_final !== d.l_final).length;
const driftDiffA = drift.filter((d) => d.k_final !== d.l_A).length;
const driftDiffB = drift.filter((d) => d.k_final !== d.l_B).length;
const driftTrip = driftDiff >= 2;

const noteRows = e1rows.filter((r) => r.condition === 'panL-note');
assert(noteRows.length === 10, `쪽지 조건 행 수 ${noteRows.length} (기대 10)`);
const band = (n) => (n >= 4 ? '쪽지가 먹힌다' : n === 3 ? '측정 후 결정' : '쪽지로는 부족');
const e1cells = MODELS.map((model) => {
  const rows = noteRows.filter((r) => r.model === model);
  assert(rows.length === 5, `${model} 쪽지 행 ${rows.length}`);
  const passed = TASKS.filter((t) => rows.find((r) => r.task === t)?.pass);
  const kN = K.code[model].passed.length;
  const harm = passed.length <= kN - 1;
  const raw = band(passed.length);
  return {
    model, passed, n: passed.length, k_passed: kN, raw_band: raw, harm,
    cell: driftTrip ? '측정 후 결정' : raw,
    passedA: TASKS.filter((t) => rows.find((r) => r.task === t)?.passA).length,
    passedB: TASKS.filter((t) => rows.find((r) => r.task === t)?.passB).length,
  };
});

// 규칙별 위반 수(쪽지 조건 · 최종) — 병기
const ruleCounts = {};
for (const r of noteRows) for (const v of (r.viol || '').split(';').filter(Boolean)) {
  const key = `${r.task} r${v.split('@')[0]}`; ruleCounts[key] = (ruleCounts[key] || 0) + 1;
}

// 토큰 · 검사기 — 병기
const lChk = parseCsv(join(HERE, 'L-60-checker-summary.csv'));
const kChk = parseCsv(join(K_DIR, 'K-60-checker-summary.csv'));
const sum = (rows, model, col) => rows.filter((r) => r.model === model).reduce((s, r) => s + Number(r[col] || 0), 0);
const tokens = MODELS.map((model) => ({
  model,
  L_in: sum(lChk, model, 'tokens_in'), L_out: sum(lChk, model, 'tokens_out'),
  K_in: sum(kChk, model, 'tokens_in'), K_out: sum(kChk, model, 'tokens_out'),
  L_error_grade: sum(lChk, model, 'error_grade'), L_warnings: sum(lChk, model, 'warnings'),
}));

// ── E-3 ──────────────────────────────────────────────
const mA = parseCsv(join(HERE, 'L-72-match-A.csv'));
const mB = parseCsv(join(HERE, 'L-73-match-B.csv'));
const m3 = parseCsv(join(HERE, 'L-81-adjudication-e3.csv'));
assert(mA.length === mB.length, `E-3 매칭 줄 수 A=${mA.length} B=${mB.length}`);
const e3disputed = mA.map((a, i) => ({ a, b: mB[i] })).filter(({ a, b }) =>
  a.kind !== b.kind || a.anon_id !== b.anon_id || a.gold_id !== b.gold_id ||
  (a.kind === 'gold' ? a.caught !== b.caught : a.extra_findings !== b.extra_findings));
assert(e3disputed.length === m3.length, `E-3 제3 판정 줄 ${m3.length} ≠ 갈린 줄 ${e3disputed.length}`);
const finalOf = (a) => {
  const t = m3.find((x) => x.kind === a.kind && x.anon_id === a.anon_id && x.gold_id === a.gold_id);
  return t ? t.value_final : (a.kind === 'gold' ? a.caught : a.extra_findings);
};

// 판K 정답 = K-83 code.<model>.viol (검사기 제외 집합 확인)
const kErrSum = kChk.filter((r) => MODELS.includes(r.model)).reduce((s, r) => s + Number(r.error_grade || 0), 0);
assert(kErrSum === 0, `판K 검사기 오류급 합 ${kErrSum} — 제외 집합이 비지 않는다`);
const goldPerAnswer = {};
for (const model of MODELS) for (const t of TASKS) {
  goldPerAnswer[`${model} ${t}`] = (K.code[model].viol[t] || '').split(';').filter(Boolean).length;
}
const goldTotal = Object.values(goldPerAnswer).reduce((s, n) => s + n, 0);

const conds = ['original', 'note'];
const e3 = Object.fromEntries(conds.map((c) => [c, { gold: 0, caught: 0, extra: 0, lenient: 0, rows: 0, perRow: [] }]));
for (const a of mA) {
  const m = byId[a.anon_id];
  assert(m && m.bundle === 'e3', `E-3 매핑 없음 ${a.anon_id}`);
  const c = e3[m.condition];
  if (a.kind === 'gold') {
    c.gold++;
    const fin = finalOf(a);
    if (fin === '잡음') c.caught++;
    else if (/정답의심/.test(a.remarks) && /같은 규칙/.test(a.remarks)) c.lenient++;
  } else if (a.kind === 'row') {
    c.rows++;
    const ex = Number(finalOf(a));
    c.extra += ex;
    c.perRow.push({ anon_id: a.anon_id, model: m.model, task: m.task_id, extra: ex });
  }
}
for (const c of conds) {
  assert(e3[c].rows === 10, `E-3 ${c} row 줄 ${e3[c].rows}`);
  assert(e3[c].gold === goldTotal, `E-3 ${c} 정답 줄 ${e3[c].gold} ≠ 판K 정답 ${goldTotal}`);
}
const e3gap = e3.original.caught - e3.note.caught;
const e3verdict = e3gap >= 2 ? '복귀' : '채택';
const e3gapLenient = (e3.original.caught + e3.original.lenient) - (e3.note.caught + e3.note.lenient);

// ── 출력 ─────────────────────────────────────────────
const result = {
  generated_by: 'L-83-aggregate.mjs',
  e1: {
    cells: e1cells, drift: { rows: drift, diff_final: driftDiff, diff_A: driftDiffA, diff_B: driftDiffB, tripped: driftTrip },
    disputed_rows: disputed, line_only_diff_rows: e1rows.filter((r) => r.lineDiffAB).map((r) => r.anon_id),
    per_task: MODELS.map((model) => ({
      model,
      J: TASKS.map((t) => jPass(model, t)), K: TASKS.map((t) => kPass(model, t)),
      L: TASKS.map((t) => noteRows.find((r) => r.model === model && r.task === t).pass),
    })),
    rule_violations_note: ruleCounts, tokens,
  },
  e3: {
    gold_total_per_condition: goldTotal, gold_per_answer: goldPerAnswer, checker_exclusion: [], k_error_grade_sum: kErrSum,
    original: e3.original, note: e3.note, gap_original_minus_note: e3gap, verdict: e3verdict,
    lenient_note: '정답의심(같은 규칙 · 자리 창 밖) 놓침을 잡음으로 읽을 때의 병기 — 판정에 쓰지 않는다',
    gap_lenient: e3gapLenient, disputed_lines: e3disputed.length,
  },
};

const yn = (b) => (b === null ? '?' : b ? 'O' : 'x');
const L = [];
L.push('L-83-results.txt — 판L E-1 · E-3 집계 (L-83-aggregate.mjs 생성물 · 손으로 고치지 않는다)', '');
L.push('[E-1] 쪽지 효과 — 과제 통과 = 검사기 오류급 0 그리고 general_rules 위반 0 (최종 = A=B 또는 제3 판정)');
for (const c of e1cells) {
  L.push(`  ${c.model}: ${c.n}/5 (${c.passed.join(' ') || '-'}) · 판K ${c.k_passed}/5 · 선 「${c.raw_band}」${c.harm ? ' · 「해친다」' : ''} → 칸 「${c.cell}」 · (A ${c.passedA}/5 · B ${c.passedB}/5)`);
}
L.push(`  표류 검사: 판K 답 10행 중 판L 최종이 판K 최종과 다른 행 ${driftDiff} (A ${driftDiffA} · B ${driftDiffB}) → ${driftTrip ? '2행 이상 — 전 칸 「측정 후 결정」' : '2행 미만 — 선 판정 유지'}`);
for (const d of drift.filter((x) => x.k_final !== x.l_final)) L.push(`    다름 ${d.anon_id} ${d.model} ${d.task}: 판K ${d.k_final ? '통과' : '불통과'}(${d.k_viol || '-'}) · 판L ${d.l_final ? '통과' : '불통과'}(${d.l_viol || '-'})`);
L.push(`  갈린 행(제3 판정): ${disputed.join(' ') || '없음'} · 번호 집합은 같고 줄만 다른 행: ${result.e1.line_only_diff_rows.join(' ') || '없음'}`);
L.push('  과제별 통과 (J 맨 · K 폴더 · L 쪽지)');
for (const p of result.e1.per_task) L.push(`    ${p.model}: ${TASKS.map((t, i) => `${t} ${yn(p.J[i])}${yn(p.K[i])}${yn(p.L[i])}`).join(' · ')}`);
L.push(`  규칙별 위반(쪽지 조건 최종): ${Object.entries(ruleCounts).map(([k, v]) => `${k}=${v}`).join(' · ') || '없음'}`);
for (const t of tokens) L.push(`  토큰 ${t.model}: 판L 입력 ${t.L_in} · 출력 ${t.L_out} / 판K 입력 ${t.K_in} · 출력 ${t.K_out} · 판L 검사기 오류급 ${t.L_error_grade} · 경고 ${t.L_warnings}`);
L.push('');
L.push('[E-3] 리뷰어 두 조건 — 잡음 = 같은 규칙 그리고 같은 자리(± 3줄 또는 같은 문장 인용)');
L.push(`  정답(판K 최종 위반): 조건마다 ${goldTotal}건 · 답별 ${Object.entries(goldPerAnswer).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
L.push(`  검사기 제외 집합: 비어 있음 (판K 검사기 오류급 합 ${kErrSum})`);
for (const c of conds) L.push(`  ${c === 'original' ? '원본 조건' : '쪽지 조건'}: 잡음 ${e3[c].caught}/${e3[c].gold} · 정답 밖 지적 ${e3[c].extra} · (느슨한 해석 후보 +${e3[c].lenient})`);
L.push(`  차이(원본 − 쪽지) ${e3gap} → 선 「${e3verdict}」 (2건 이상 낮으면 복귀) · 느슨한 해석 병기 시 차이 ${e3gapLenient} · 갈린 줄 ${e3disputed.length}`);
const txt = L.join('\n') + '\n';
const json = JSON.stringify(result, null, 2) + '\n';

const outTxt = join(HERE, 'L-83-results.txt');
const outJson = join(HERE, 'L-83-results.json');
if (CHECK) {
  const norm = (p) => { try { return readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
  assert(norm(outTxt) === txt, 'L-83-results.txt 가 재계산 결과와 다르다');
  assert(norm(outJson) === json, 'L-83-results.json 이 재계산 결과와 다르다');
} else if (!fails.length) {
  writeFileSync(outTxt, txt); writeFileSync(outJson, json);
}
process.stdout.write(txt);
if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exit(1); }
console.log(CHECK ? 'CHECK PASS' : 'WROTE L-83-results.txt · L-83-results.json');
