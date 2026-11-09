#!/usr/bin/env node
// K-65-build-blind.mjs — 판K T7 블라인드 묶음 제작 (모델 호출 0 · 내장 모듈만 · 결정적)
//
// 사용(PowerShell · 어디서든):
//   node docs/reference/audits/2026-11-08-harness-on-comparison-data/K-65-build-blind.mjs           묶음 · 매핑 · 표본을 쓴다
//   node docs/reference/audits/2026-11-08-harness-on-comparison-data/K-65-build-blind.mjs --check   다시 만들어 디스크와 대조 · 검사 → K-65-check.txt
// 종료 코드: 0 = 통과 · 1 = 검사 실패 · 2 = 입력 오류
//
// 만드는 것
//   레포 안 (이 폴더)  K-65-blind-knowledge.json   지식 156행 = 켠 조건 120(2모델 × J-10 60) + 끈 조건 표류 표본 36
//                      K-65-blind-code.json        코드 25행 = 켠 조건 10(2모델 × C-01~05) + 끈 조건 15(3모델 × C-01~05)
//                      K-65-check.txt              --check 결과(시각 없음 · 다시 돌려도 같은 글자)
//   레포 밖 (os.tmpdir()/sapkit-panK/)
//                      blind-map.csv               anon_id,kind,condition,model,orig_id   (181행 · 채점자에게 주지 않는다)
//                      codex-regrade-ids.csv       anon_id,model,orig_id                  (24행 · 켠 조건 지식 120행의 20%)
//   K-65-grader-brief.txt 는 손으로 쓴 지시문이다 — 이 스크립트는 그것을 만들지 않고 --check 에서 금지 문자열만 잰다.
//
// 난수 (K-00 §8 정본 그대로 — 생성기 · 부시드 · 섞기는 J-12 12-sample.mjs 와 같은 구현)
//   생성기 = mulberry32 · 부시드 = fnv1a(32비트 · 0x811c9dc5 · 0x01000193 · 코드 포인트마다)
//   스트림 시드 = (20261108 xor fnv1a(용도 이름)) >>> 0 — 스트림마다 생성기 하나를 새로 만든다.
//   섞기 = Fisher–Yates (i = n-1 … 1, j = floor(rnd() · (i+1)))
//   drift-knowledge  (1755485557)  끈 조건 지식 후보 180행(모델 순 claude-opus-5-5 · claude-sonnet-5-5 · gpt-5.6-sol ×
//                                   J-10 items 순)을 섞고 앞 36행(20% · 복원 없음)
//   drift-code-order (877188075)   코드 25행(켠 조건 10 = 모델 순 × C-01~05 → 끈 조건 15 = 모델 순 × C-01~05)을 섞은 순서
//   blind-id         (1267938018)  ① 익명 id — 지식 행(켠 조건 120: 모델 순 × items 순 → 표류 36: 추출 순) → 코드 행(위 코드
//                                   정준 순) 순으로 행마다 floor(rnd() · 2^24) 를 6자리 16진으로 · 이미 쓴 id 면 다시 뽑는다(181행 고유)
//                                   ② 같은 생성기를 이어 지식 156행(정준 순 = ① 의 지식 순)을 섞은 순서 — K-00 §8 이 blind-id 의
//                                   용도를 「블라인드 행 id · 행 순서 섞기」로 정했으므로 지식 행 순서는 이 스트림의 뒤를 잇는다
//                                   (코드 행 순서는 K-00 §8 이 drift-code-order 에 따로 줬다)
//   codex-regrade    (3578701097)  켠 조건 지식 120행(모델 순 × items 순)을 섞고 앞 24행(20%) — 재채점 표본(레포 밖에만)
//   condition 값은 K-00 §8 의 정의 그대로: on = 켠 조건(판K) · off = 끈 조건(판J — 표류 검사 행)
//
// 입력과 지문
//   읽는 파일: J-10 · J-11 · J-60 검사기 요약(error_grade) · J-83(rows[].error_grade — 대조만) · J-50 답안 180 · J-60 코드 15 ·
//   K-50 답안 120 · K-60 코드 10 · K-60 검사기 요약(error_grade).
//   텍스트는 CRLF → LF 로만 읽는다(core.autocrlf=true 체크아웃이 만든 CR 을 걷어 커밋 blob 과 같은 바이트로) — --check 가 파일마다
//   git blob sha1(「blob <길이>\0」+바이트)이 인덱스(git ls-files -s)와 같은지 잰다. 그 밖의 글자는 무편집.
//   지문 = 파일마다 sha256 · 집합 지문 = sha256(「<레포 상대 경로>\t<sha256>\n」을 경로순으로 이은 것). 묶음 meta 에는 집합 지문과
//   (채점자에게 열려 있는) J-10 · J-11 의 개별 지문만 둔다 — 파일 목록에는 모델 이름이 들어 있어 묶음에 넣지 않는다(K-65-check.txt 에 둔다).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const KDIR = path.dirname(SELF);
const ROOT = path.resolve(KDIR, '..', '..', '..', '..');
const JDIR = path.resolve(KDIR, '..', '2026-11-05-harness-necessity-review-data');
const OUTSIDE = path.join(os.tmpdir(), 'sapkit-panK');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const CHECK = process.argv.includes('--check');

// ── 고정 값 (K-00 §8) ─────────────────────────────────────────────────────────
const SEED = 20261108;
const K_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const J_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol'];
const CODE_TASKS = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'];
const N_DRIFT = 36;
const N_REGRADE = 24;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const streamSeed = (name) => (SEED ^ fnv1a(name)) >>> 0;
function shuffleWith(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const STREAMS = ['drift-knowledge', 'drift-code-order', 'blind-id', 'codex-regrade'];
const EXPECTED_SEEDS = { 'drift-knowledge': 1755485557, 'drift-code-order': 877188075, 'blind-id': 1267938018, 'codex-regrade': 3578701097 };

// ── 입력 읽기 (CRLF → LF 만) ──────────────────────────────────────────────────
const inputs = new Map(); // rel -> text
function readText(abs) {
  if (!fs.existsSync(abs)) { console.log(`FAIL: input missing — ${rel(abs)}`); process.exit(2); }
  const t = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  inputs.set(rel(abs), t);
  return t;
}

const j10 = JSON.parse(readText(path.join(JDIR, '10-knowledge-items.json')));
const items = j10.items;
if (!Array.isArray(items) || items.length !== 60) { console.log('FAIL: J-10 items != 60'); process.exit(2); }
for (const it of items) {
  for (const f of ['id', 'question', 'grading_rule', 'answer_key']) {
    if (typeof it[f] !== 'string' || !it[f]) { console.log(`FAIL: J-10 ${it.id} field ${f} missing`); process.exit(2); }
  }
}
const itemById = new Map(items.map((it) => [it.id, it]));

// J-11 — K-60 러너 Get-Tasks 와 같은 자르기(task_text · required_output: 4칸 들여쓰기만 뗌) + general_rules
function parseTasks(text) {
  const lines = text.split('\n');
  const out = new Map();
  let i = 0;
  while (i < lines.length) {
    const m = /^(C-0\d)\s{2}/.exec(lines[i]);
    if (!m) { i++; continue; }
    const id = m[1];
    const tt = []; const ro = []; const gr = [];
    let mode = '';
    let j = i + 1;
    while (j < lines.length && !/^C-0\d\s{2}/.test(lines[j]) && !/^4\. /.test(lines[j])) {
      const l = lines[j];
      if (l === '  task_text:') mode = 'tt';
      else if (l === '  required_output:') mode = 'ro';
      else if (/^  general_rules/.test(l)) {
        mode = 'gr';
        const rest = l.replace(/^  general_rules\s*/, '');
        if (rest !== ':') gr.push(rest.replace(/:$/, ''));
      } else if (/^  checker_commands:/.test(l)) mode = '';
      else if (mode === 'tt') tt.push(l.replace(/^ {4}/, ''));
      else if (mode === 'ro') ro.push(l.replace(/^ {4}/, ''));
      else if (mode === 'gr') gr.push(l.replace(/^ {1,4}/, ''));
      j++;
    }
    while (gr.length && gr[gr.length - 1].trim() === '') gr.pop();
    out.set(id, { task_text: tt.join('\n'), required_output: ro.join('\n'), general_rules: gr.join('\n') });
    i = j;
  }
  return out;
}
const tasks = parseTasks(readText(path.join(JDIR, '11-code-tasks.txt')));
for (const t of CODE_TASKS) if (!tasks.has(t) || !tasks.get(t).task_text || !tasks.get(t).general_rules) { console.log(`FAIL: J-11 ${t} incomplete`); process.exit(2); }

function readCsv(text) {
  const L = text.split('\n').filter((l) => l.length);
  const h = L[0].split(',');
  return L.slice(1).map((l) => { const v = l.split(','); const o = {}; h.forEach((k, i) => { o[k] = v[i]; }); return o; });
}
const kCheck = readCsv(readText(path.join(KDIR, 'K-60-checker-summary.csv')));
const jCheck = readCsv(readText(path.join(JDIR, '60-checker-summary.csv')));
const j83 = JSON.parse(readText(path.join(JDIR, '83-results.json')));
const grade = (rows, model, id) => {
  const r = rows.find((x) => x.model === model && x.id === id);
  if (!r || !/^\d+$/.test(r.error_grade)) { console.log(`FAIL: error_grade missing ${id}`); process.exit(2); }
  return Number(r.error_grade);
};

// ── 행 만들기 ─────────────────────────────────────────────────────────────────
// 켠 조건 지식 120 (정준 순 = 모델 순 × items 순)
const kKnow = [];
for (const m of K_MODELS) for (const it of items) {
  kKnow.push({ condition: 'on', model: m, orig_id: it.id, answer: readText(path.join(KDIR, 'K-50-answers', m, `${it.id}.txt`)) });
}
// 끈 조건 후보 180 → drift-knowledge 로 36
const jPool = [];
for (const m of J_MODELS) for (const it of items) jPool.push({ condition: 'off', model: m, orig_id: it.id, file: path.join(JDIR, '50-answers', m, `${it.id}.txt`) });
const drift = shuffleWith(mulberry32(streamSeed('drift-knowledge')), jPool).slice(0, N_DRIFT)
  .map((r) => ({ condition: r.condition, model: r.model, orig_id: r.orig_id, answer: readText(r.file) }));
// 표류 후보 180 파일 전부를 지문에 넣는다(표본 추출의 입력이므로)
for (const r of jPool) readText(r.file);

// 코드 정준 순 25
const codeCanon = [];
for (const m of K_MODELS) for (const t of CODE_TASKS) codeCanon.push({ condition: 'on', model: m, orig_id: t, code: readText(path.join(KDIR, 'K-60-code', m, `${t}.abap`)), checker_error_grade: grade(kCheck, m, t) });
for (const m of J_MODELS) for (const t of CODE_TASKS) codeCanon.push({ condition: 'off', model: m, orig_id: t, code: readText(path.join(JDIR, '60-code', m, `${t}.abap`)), checker_error_grade: grade(jCheck, m, t) });

// 익명 id — blind-id 스트림
const rndId = mulberry32(streamSeed('blind-id'));
const used = new Set();
let idRedraws = 0;
const nextId = () => {
  for (;;) {
    const id = Math.floor(rndId() * 0x1000000).toString(16).padStart(6, '0');
    if (!used.has(id)) { used.add(id); return id; }
    idRedraws++;
  }
};
const knowCanon = [...kKnow, ...drift];
for (const r of knowCanon) r.anon_id = nextId();
for (const r of codeCanon) r.anon_id = nextId();
// 지식 행 순서 — blind-id 스트림의 뒤를 잇는다
const knowOrder = shuffleWith(rndId, knowCanon);
// 코드 행 순서 — drift-code-order
const codeOrder = shuffleWith(mulberry32(streamSeed('drift-code-order')), codeCanon);
// 재채점 표본 — codex-regrade
const regrade = shuffleWith(mulberry32(streamSeed('codex-regrade')), kKnow).slice(0, N_REGRADE);

// ── 지문 ──────────────────────────────────────────────────────────────────────
const fileSha = [...inputs.entries()].map(([p, t]) => [p, sha256(t)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const aggOf = (pred) => sha256(fileSha.filter(([p]) => pred(p)).map(([p, s]) => `${p}\t${s}\n`).join(''));
const shaOf = (p) => fileSha.find(([q]) => q === p)[1];
const relJ10 = rel(path.join(JDIR, '10-knowledge-items.json'));
const relJ11 = rel(path.join(JDIR, '11-code-tasks.txt'));
const isKnowInput = (p) => p === relJ10 || /\/(K-50-answers|50-answers)\//.test(p);
const isCodeInput = (p) => p === relJ11 || /\/(K-60-code|60-code)\//.test(p) || /(K-60-checker-summary\.csv|60-checker-summary\.csv)$/.test(p);
const nKnowInputs = fileSha.filter(([p]) => isKnowInput(p)).length;
const nCodeInputs = fileSha.filter(([p]) => isCodeInput(p)).length;

// ── 묶음 ──────────────────────────────────────────────────────────────────────
const streamMeta = (names) => names.map((n) => ({ name: n, fnv1a: fnv1a(n), seed: streamSeed(n) }));
const knowledgeBundle = {
  meta: {
    schema: 'blind-bundle-v1',
    kind: 'knowledge',
    generator: rel(SELF),
    seed: SEED,
    streams: [
      { ...streamMeta(['blind-id'])[0], use: '익명 id(6자리 16진 · 지식 행 → 코드 행 순 · 겹치면 다시 뽑음) 뒤 같은 생성기를 이어 지식 행 순서 섞기(Fisher–Yates)' },
      { ...streamMeta(['drift-knowledge'])[0], use: '지식 행 일부 36행 추출(후보를 섞고 앞 36 · 복원 없음)' },
    ],
    rows: knowOrder.length,
    fields: 'anon_id · kind · item_id · question · grading_rule · answer_key · answer — question · grading_rule · answer_key 는 J-10 글자 그대로, answer 는 답 파일 전문 무편집(줄 끝 LF)',
    inputs: {
      [relJ10]: shaOf(relJ10),
      aggregate_sha256: aggOf(isKnowInput),
      aggregate_files: nKnowInputs,
      aggregate_note: '집합 지문 = sha256(「<레포 상대 경로>\\t<sha256>\\n」 경로순) · 파일 목록과 개별 지문은 K-65-check.txt',
    },
  },
  rows: knowOrder.map((r) => {
    const it = itemById.get(r.orig_id);
    return { anon_id: r.anon_id, kind: 'knowledge', item_id: r.orig_id, question: it.question, grading_rule: it.grading_rule, answer_key: it.answer_key, answer: r.answer };
  }),
};
const codeBundle = {
  meta: {
    schema: 'blind-bundle-v1',
    kind: 'code',
    generator: rel(SELF),
    seed: SEED,
    streams: [
      { ...streamMeta(['drift-code-order'])[0], use: '코드 행 순서 섞기(Fisher–Yates)' },
      { ...streamMeta(['blind-id'])[0], use: '익명 id(지식 묶음과 한 생성기 · 지식 행 뒤를 이어 뽑음 · 두 묶음 전체에서 고유)' },
    ],
    rows: codeOrder.length,
    fields: 'anon_id · kind · task_id · task_text · required_output · general_rules · checker_error_grade · code — task_text · required_output 는 J-11 에서 응시 프롬프트와 같은 자르기(4칸 들여쓰기만 뗌), general_rules 는 J-11 의 그 과제 general_rules 절(들여쓰기만 뗌), code 는 소스 전문 무편집(줄 끝 LF)',
    checker_error_grade_source: '검사기 요약 표의 error_grade 열(오류급 = lint Error ∪ parse exit≠0 ∪ analyze high · J-11 §0) — 기계 결과이며 채점자가 뒤집지 않는다',
    inputs: {
      [relJ11]: shaOf(relJ11),
      aggregate_sha256: aggOf(isCodeInput),
      aggregate_files: nCodeInputs,
      aggregate_note: '집합 지문 = sha256(「<레포 상대 경로>\\t<sha256>\\n」 경로순) · 파일 목록과 개별 지문은 K-65-check.txt',
    },
  },
  rows: codeOrder.map((r) => {
    const t = tasks.get(r.orig_id);
    return { anon_id: r.anon_id, kind: 'code', task_id: r.orig_id, task_text: t.task_text, required_output: t.required_output, general_rules: t.general_rules, checker_error_grade: r.checker_error_grade, code: r.code };
  }),
};
const jsonText = (o) => JSON.stringify(o, null, 2) + '\n';
const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const mapText = 'anon_id,kind,condition,model,orig_id\n'
  + [...knowCanon.map((r) => [r.anon_id, 'knowledge', r.condition, r.model, r.orig_id]), ...codeCanon.map((r) => [r.anon_id, 'code', r.condition, r.model, r.orig_id])]
    .map((a) => a.map(csvCell).join(',')).join('\n') + '\n';
const regradeText = 'anon_id,model,orig_id\n' + regrade.map((r) => [r.anon_id, r.model, r.orig_id].map(csvCell).join(',')).join('\n') + '\n';

const OUT = {
  know: path.join(KDIR, 'K-65-blind-knowledge.json'),
  code: path.join(KDIR, 'K-65-blind-code.json'),
  brief: path.join(KDIR, 'K-65-grader-brief.txt'),
  check: path.join(KDIR, 'K-65-check.txt'),
  map: path.join(OUTSIDE, 'blind-map.csv'),
  regrade: path.join(OUTSIDE, 'codex-regrade-ids.csv'),
};
const built = { know: jsonText(knowledgeBundle), code: jsonText(codeBundle), map: mapText, regrade: regradeText };

if (!CHECK) {
  fs.writeFileSync(OUT.know, built.know, 'utf8');
  fs.writeFileSync(OUT.code, built.code, 'utf8');
  fs.mkdirSync(OUTSIDE, { recursive: true });
  fs.writeFileSync(OUT.map, built.map, 'utf8');
  fs.writeFileSync(OUT.regrade, built.regrade, 'utf8');
  console.log(`wrote ${rel(OUT.know)} (${knowOrder.length} rows) · ${rel(OUT.code)} (${codeOrder.length} rows)`);
  console.log(`wrote outside-repo map (${knowCanon.length + codeCanon.length} rows) · regrade sample (${regrade.length} rows) under %TEMP%\\sapkit-panK`);
  console.log(`sha256 knowledge=${sha256(built.know)} code=${sha256(built.code)} map=${sha256(built.map)} regrade=${sha256(built.regrade)}`);
  process.exit(0);
}

// ── --check ──────────────────────────────────────────────────────────────────
const L = [];
let fails = 0;
const ok = (cond, msg) => { L.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const readOut = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null);

L.push('K-65-check.txt — 판K T7 블라인드 묶음 검사 결과 (node K-65-build-blind.mjs --check 가 쓴다 · 시각 없음 · 다시 돌려도 같은 글자)');
L.push('');
L.push('[1] 난수 스트림 (K-00 §8 값과 대조)');
for (const n of STREAMS) ok(streamSeed(n) === EXPECTED_SEEDS[n], `${n}  fnv1a=${fnv1a(n)}  seed=${streamSeed(n)}  (K-00 §8 = ${EXPECTED_SEEDS[n]})`);
L.push('  쓰임: drift-knowledge = 끈 조건 지식 후보 180 섞고 앞 36 · drift-code-order = 코드 25행 순서 · blind-id = 익명 id 181(지식 → 코드 순) 뒤 이어서 지식 156행 순서 · codex-regrade = 켠 조건 지식 120 섞고 앞 24');
L.push(`  익명 id 다시 뽑기(겹침) = ${idRedraws}회`);
L.push('');

L.push('[2] 결정성 — 다시 만든 글자 = 디스크 (CRLF → LF 로 읽어 대조)');
ok(readOut(OUT.know) === built.know, `${rel(OUT.know)}  sha256=${sha256(built.know)}`);
ok(readOut(OUT.code) === built.code, `${rel(OUT.code)}  sha256=${sha256(built.code)}`);
ok(readOut(OUT.map) === built.map, `레포 밖 blind-map.csv  = 다시 만든 글자 (행 ${knowCanon.length + codeCanon.length})`);
ok(readOut(OUT.regrade) === built.regrade, `레포 밖 codex-regrade-ids.csv = 다시 만든 글자 (행 ${regrade.length})`);
L.push('');

L.push('[3] 행 수 · 고유성 · 표본 범위');
const kb = JSON.parse(readOut(OUT.know) || '{"rows":[]}');
const cb = JSON.parse(readOut(OUT.code) || '{"rows":[]}');
ok(kb.rows.length === 156, `지식 행 = ${kb.rows.length} (기대 156 = 켠 조건 ${kKnow.length} + 표류 ${drift.length})`);
ok(cb.rows.length === 25, `코드 행 = ${cb.rows.length} (기대 25 = 켠 조건 ${codeCanon.filter((r) => r.condition === 'on').length} + 끈 조건 ${codeCanon.filter((r) => r.condition === 'off').length})`);
const allIds = [...kb.rows, ...cb.rows].map((r) => r.anon_id);
ok(new Set(allIds).size === 181 && allIds.every((x) => /^[0-9a-f]{6}$/.test(x)), `anon_id 181개 고유 · 6자리 16진 (고유 ${new Set(allIds).size})`);
const mapRows = (readOut(OUT.map) || '').split('\n').slice(1).filter(Boolean).map((l) => l.split(','));
ok(mapRows.length === 181 && new Set(mapRows.map((r) => r[0])).size === 181 && mapRows.every((r) => allIds.includes(r[0])), '매핑 181행 = 묶음 anon_id 집합');
const driftKeys = new Set(drift.map((r) => `${r.model}|${r.orig_id}`));
ok(driftKeys.size === 36 && drift.every((r) => itemById.has(r.orig_id) && J_MODELS.includes(r.model)), '표류 표본 36 = 서로 다른 (모델 · 문항) 36 · 문항 id 전부 J-10 items 안');
const cat = {};
for (const r of drift) { const c = itemById.get(r.orig_id).category; cat[c] = (cat[c] || 0) + 1; }
const byModel = {};
for (const r of drift) byModel[r.model] = (byModel[r.model] || 0) + 1;
L.push(`  표류 표본 문항 범주 분포: module ${cat.module || 0} · country ${cat.country || 0} · industry ${cat.industry || 0} · abap ${cat.abap || 0}  (J-10 전체 30 · 16 · 7 · 7)`);
L.push(`  표류 표본 모델별 행 수(매핑 없이 수만): ${J_MODELS.map((m) => byModel[m] || 0).join(' · ')}  (모델 순 = 후보 정준 순)`);
const kKeys = new Set(kKnow.map((r) => r.anon_id));
const rgRows = (readOut(OUT.regrade) || '').split('\n').slice(1).filter(Boolean).map((l) => l.split(','));
ok(rgRows.length === 24 && new Set(rgRows.map((r) => r[0])).size === 24 && rgRows.every((r) => kKeys.has(r[0]) && K_MODELS.includes(r[1])), '재채점 표본 24 = 켠 조건 지식 120행 안 · 서로 다름 (레포 밖 보관)');
ok(kb.rows.every((r) => r.kind === 'knowledge' && itemById.has(r.item_id)) && cb.rows.every((r) => r.kind === 'code' && CODE_TASKS.includes(r.task_id)), 'kind · item_id · task_id 값 범위');
L.push('');

L.push('[4] 무편집 · 기계 결과 출처');
const blobIndex = new Map();
try {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-s', '--', rel(JDIR), rel(KDIR)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  for (const line of out.split('\n')) { const m = /^\d+ ([0-9a-f]{40}) \d+\t(.+)$/.exec(line); if (m) blobIndex.set(m[2], m[1]); }
} catch { /* 아래 FAIL 로 드러난다 */ }
let blobBad = 0;
for (const [p, t] of inputs) {
  const buf = Buffer.from(t, 'utf8');
  const h = crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
  if (blobIndex.get(p) !== h) blobBad++;
}
ok(blobBad === 0, `입력 ${inputs.size}파일의 읽은 바이트 = 커밋 blob (git ls-files -s 대조 · 어긋남 ${blobBad})`);
const answerOk = kb.rows.every((r) => {
  const src = knowCanon.find((x) => x.anon_id === r.anon_id);
  return src && src.answer === r.answer && src.orig_id === r.item_id;
});
ok(answerOk, '지식 answer = 답 파일 전문(행마다 대조)');
const codeOk = cb.rows.every((r) => {
  const src = codeCanon.find((x) => x.anon_id === r.anon_id);
  return src && src.code === r.code && src.orig_id === r.task_id && src.checker_error_grade === r.checker_error_grade;
});
ok(codeOk, '코드 code · checker_error_grade = 원본(행마다 대조)');
let j83Bad = 0;
for (const r of codeCanon.filter((x) => x.condition === 'off')) {
  const row = j83.rows.find((x) => x.kind === 'code' && x.id === r.orig_id && x.model === r.model);
  if (!row || row.error_grade !== r.checker_error_grade) j83Bad++;
}
ok(j83Bad === 0, `끈 조건 코드 15행 error_grade: 60-checker-summary.csv 열 error_grade = 83-results.json rows[].error_grade (어긋남 ${j83Bad})`);
L.push(`  출처 필드: 켠 조건 = K-60-checker-summary.csv 열 error_grade · 끈 조건 = 60-checker-summary.csv 열 error_grade (83-results.json rows[].error_grade 로 대조)`);
const gradeDist = {};
for (const r of codeCanon) gradeDist[r.checker_error_grade] = (gradeDist[r.checker_error_grade] || 0) + 1;
L.push(`  checker_error_grade 분포(25행): ${Object.entries(gradeDist).map(([g, n]) => `${g}=${n}`).join(' · ')}`);
const emptyK = kKnow.filter((r) => r.answer.trim() === '').length;
const emptyJ = drift.filter((r) => r.answer.trim() === '').length;
L.push(`  빈 답(공백뿐) 행: 켠 조건 ${emptyK} · 표류 ${emptyJ}`);
const bom = [...knowCanon, ...codeCanon].filter((r) => (r.answer ?? r.code).startsWith('﻿')).length;
L.push(`  BOM 으로 시작하는 본문: ${bom}`);
L.push('');

L.push('[5] 모델 · 조건 문자열 검사 (대소문자 무시 · 부분 일치)');
const TOKENS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol', 'opus', 'sonnet', 'codex', 'gpt', '판j', '판k', 'condition',
  'k-50', 'k-60', '50-answers', '60-code', '60-checker', '50-summary', '83-results', 'blind-map', 'regrade'];
const hitsIn = (s) => { const low = String(s).toLowerCase(); return TOKENS.filter((t) => low.includes(t)); };
const VERBATIM = new Set(['item_id', 'question', 'grading_rule', 'answer_key', 'answer', 'task_id', 'task_text', 'required_output', 'general_rules', 'code']);
let ownHits = 0;
const verbatimHits = [];
for (const [name, b] of [['K-65-blind-knowledge.json', kb], ['K-65-blind-code.json', cb]]) {
  const mh = hitsIn(JSON.stringify(b.meta));
  if (mh.length) { ownHits += mh.length; L.push(`  FAIL ${name} meta: ${mh.join(' · ')}`); }
  for (const r of b.rows) {
    for (const [f, v] of Object.entries(r)) {
      const h = hitsIn(v);
      if (!h.length) continue;
      if (VERBATIM.has(f)) verbatimHits.push(`${r.anon_id}  ${f}  ${h.join(' · ')}`);
      else { ownHits += h.length; L.push(`  FAIL ${name} ${r.anon_id} ${f}: ${h.join(' · ')}`); }
    }
    for (const k of Object.keys(r)) { const h = hitsIn(k); if (h.length) { ownHits += h.length; L.push(`  FAIL ${name} key ${k}`); } }
  }
}
const briefText = readOut(OUT.brief);
const briefHits = briefText === null ? ['(지시문 없음)'] : hitsIn(briefText);
ok(ownHits === 0, `묶음 두 파일의 meta · 키 · 스크립트가 쓴 칸(anon_id · kind · checker_error_grade)에 금지 문자열 0 (발견 ${ownHits})`);
ok(briefHits.length === 0, `K-65-grader-brief.txt 에 금지 문자열 0 (발견 ${briefHits.length}${briefHits.length ? ': ' + briefHits.join(' · ') : ''})`);
L.push(`  금지 낱말: ${TOKENS.join(' · ')}`);
L.push(`  원문 그대로 옮긴 칸(J-10 · J-11 글자 · 답 · 코드)의 발견 = ${verbatimHits.length}건 — 무편집 원칙에 따라 고치지 않고 적기만 한다(anon_id · 칸 · 낱말):`);
for (const h of verbatimHits) L.push(`    ${h}`);
L.push('');

L.push('[6] 조건 단서 관찰 (판정 아님 · 집단별 수만)');
const cite = /(knowledge|personas)\/[\w./-]+|\.md\b/i;
L.push(`  지식 답에 팩 경로 인용(knowledge/… · personas/… · .md): 켠 조건 ${kKnow.filter((r) => cite.test(r.answer)).length}/120 · 표류 ${drift.filter((r) => cite.test(r.answer)).length}/36`);
L.push(`  코드에 팩 경로 인용: 켠 조건 ${codeCanon.filter((r) => r.condition === 'on' && cite.test(r.code)).length}/10 · 끈 조건 ${codeCanon.filter((r) => r.condition === 'off' && cite.test(r.code)).length}/15`);
L.push('');

L.push('[7] 입력 지문 (파일마다 sha256 · CRLF → LF 로 읽은 바이트 = 커밋 blob)');
ok(kb.meta?.inputs?.aggregate_sha256 === aggOf(isKnowInput), `지식 묶음 meta 집합 지문 = 다시 잰 값 (${aggOf(isKnowInput)} · ${nKnowInputs}파일)`);
ok(cb.meta?.inputs?.aggregate_sha256 === aggOf(isCodeInput), `코드 묶음 meta 집합 지문 = 다시 잰 값 (${aggOf(isCodeInput)} · ${nCodeInputs}파일)`);
ok(kb.meta?.inputs?.[relJ10] === shaOf(relJ10) && cb.meta?.inputs?.[relJ11] === shaOf(relJ11), 'J-10 · J-11 개별 지문 = 다시 잰 값');
L.push(`  전체 입력 ${fileSha.length}파일 집합 지문 = ${aggOf(() => true)}`);
for (const [p, s] of fileSha) L.push(`  ${s}  ${p}`);
L.push('');
L.push(`결과: ${fails === 0 ? 'PASS' : 'FAIL'} (실패 ${fails})`);

fs.writeFileSync(OUT.check, L.join('\n') + '\n', 'utf8');
console.log(L.filter((l) => /^(PASS|FAIL|결과|  FAIL)/.test(l)).join('\n'));
console.log(`verbatim-field hits: ${verbatimHits.length}`);
process.exit(fails === 0 ? 0 : 1);
