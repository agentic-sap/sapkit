#!/usr/bin/env node
// L-65-build-blind.mjs — 판L T65 익명 묶음 제작 (모델 호출 0 · 내장 모듈만 · 결정적)
// 토대: 판K K-65-build-blind.mjs (난수 · 지문 · blob 대조 · 금지 문자열 검사의 틀을 그대로 쓴다)
//
// 사용(PowerShell · 어디서든):
//   node docs/reference/audits/2026-11-09-note-and-trim-data/L-65-build-blind.mjs           묶음 둘 · 매핑을 쓴다
//   node docs/reference/audits/2026-11-09-note-and-trim-data/L-65-build-blind.mjs --check   다시 만들어 디스크와 대조 · 검사 → L-65-check.txt
// 종료 코드: 0 = 통과 · 1 = 검사 실패 · 2 = 입력 오류
//
// 만드는 것 (모두 이 폴더 · 레포 안)
//   L-65-blind-e1.json   E-1 채점 묶음 20행 = 쪽지 조건 10(2모델 × C-01~05) + 표류 검사 10(판K 코드 답 2모델 × C-01~05)
//   L-65-blind-e3.json   E-3 매칭 묶음 20행 = 리뷰 응답 20(두 조건 × 판K 코드 답 10) + 답마다 판K 최종 위반 목록(정답)
//   L-79-blind-map.csv   익명 id ↔ (묶음 · 조건 · 모델 · 과제 · 원본 경로 · 가림 건수) 40행 — 채점 · 매칭이 끝날 때까지 주지 않는다
//   L-65-check.txt       --check 결과(시각 없음 · 다시 돌려도 같은 글자)
//   L-65-grader-brief.txt · L-66-matcher-brief.txt 는 손으로 쓴 지시문이다 — 이 스크립트는 만들지 않고 --check 에서 금지 문자열만 잰다.
//
// 난수 (판K K-65 와 같은 구현 · 시드만 판L)
//   SEED = 20261109
//   생성기 = mulberry32 · 부시드 = fnv1a(32비트 · 0x811c9dc5 · 0x01000193 · 코드 포인트마다)
//   스트림 시드 = (SEED xor fnv1a(용도 이름)) >>> 0 — 스트림마다 생성기 하나를 새로 만든다.
//   섞기 = Fisher–Yates (i = n-1 … 1, j = floor(rnd() · (i+1)))
//   e1-order  E-1 정준 순 20행(판L 쪽지 조건 = 모델 순 claude-opus-5-5 · claude-sonnet-5-5 × C-01~05 → 판K 표류 = 같은 순)을 섞은 순서.
//             익명 id 는 섞은 순서대로 E1-01 … E1-20.
//   e3-order  E-3 정준 순 20행(original 조건 = 모델 순 × C-01~05 → note 조건 = 같은 순)을 섞은 순서. 익명 id 는 E3-01 … E3-20.
//
// 입력 (텍스트는 CRLF → LF 로만 읽는다 — --check 가 파일마다 git blob sha1 이 인덱스와 같은지 잰다)
//   판J  11-code-tasks.txt (과제 본문 · general_rules)
//   판L  L-60-code 10 · L-60-checker 10 · L-60-checker-summary.csv · L-75-reviews 20 · L-75-prompts/note-claude-opus-5-5-C-01.txt
//        (마지막 것은 쪽지 본문의 출처 표식 [파일 § 절] 목록을 뽑는 데만 쓴다 — 가림 규칙 R2b 의 절 이름 목록)
//   판K  K-60-code 10 · K-60-checker 10 · K-60-checker-summary.csv · K-83-results.json(rows[] 의 condition=K 코드 행 viol · error_grade)
//
// 검사기 출력 정규화 (E-1 · 두 조건에 같은 규칙)
//   원문 파일의 머리(첫 「=== lint ===」 앞 — 파일 이름 · 판 · 날짜 · node 버전 · 대상 경로)와 「=== metrics ===」의 산식 · 주의 줄을 뗀다.
//   본문에서 그 답의 레포 상대 코드 경로를 answer.abap 으로 바꾸고, 「--- stdout (N bytes) ---」의 바이트 수를 뗀다
//   (경로 길이가 조건마다 달라 바이트 수가 조건을 드러낸다). metrics 는 키=값 한 줄만 남긴다.
//
// E-3 리뷰 응답 가림 (두 조건에 같은 규칙 · 같은 순서 · 원본 응답 파일은 그대로 · 묶음은 파생물) — 아래 MASK_RULES 가 정본이다.
//   가림 글자 = 「[가림]」. 행별 · 규칙별 건수는 매핑(L-79)에만 적는다(묶음에 두면 건수 차이가 조건을 드러낸다).
//   규칙 설명 글자도 묶음에 싣지 않고 L-65-check.txt [6] 에만 적는다(규칙 글자에 조건 이름 · 쪽지 그룹 이름이 들어 있다).
//   묶음 meta.masking 에는 표시 글자와 중립 설명 한 줄만 둔다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const LDIR = path.dirname(SELF);
const ROOT = path.resolve(LDIR, '..', '..', '..', '..');
const KDIR = path.resolve(LDIR, '..', '2026-11-08-harness-on-comparison-data');
const JDIR = path.resolve(LDIR, '..', '2026-11-05-harness-necessity-review-data');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const CHECK = process.argv.includes('--check');

// ── 고정 값 ───────────────────────────────────────────────────────────────────
const SEED = 20261109;
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const TASKS = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'];
const REVIEW_CONDS = ['original', 'note'];
const MASK = '[가림]';

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
const STREAMS = ['e1-order', 'e3-order'];

// ── 입력 읽기 (CRLF → LF 만) ──────────────────────────────────────────────────
const inputs = new Map(); // rel -> text
function readText(abs) {
  if (!fs.existsSync(abs)) { console.log(`FAIL: input missing — ${rel(abs)}`); process.exit(2); }
  const t = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  inputs.set(rel(abs), t);
  return t;
}
const die = (msg) => { console.log(`FAIL: ${msg}`); process.exit(2); };

// J-11 — 판K K-65 parseTasks 그대로(task_text · required_output: 4칸 들여쓰기만 뗌 · general_rules: 1~4칸 뗌)
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
// general_rules 의 번호 항목 — 「N. 제목 — 인용」 줄과 그 뒤 들여쓴 이음 줄(괄호 판정 기준 · 「·」 추가 인용)
function parseRuleItems(gr) {
  const items = new Map();
  let cur = null;
  for (const l of gr.split('\n')) {
    const m = /^\s*(\d+)\.\s+(.*)$/.exec(l);
    if (m) { cur = { no: Number(m[1]), lines: [l.trim()] }; items.set(cur.no, cur); continue; }
    if (cur && /^\s+\S/.test(l)) { cur.lines.push(l.trim()); continue; }
    cur = null;
  }
  for (const it of items.values()) {
    it.text = it.lines.join('\n');
    const head = it.lines[0].replace(/^\d+\.\s+/, '');
    it.title = head.split(' — ')[0].trim();
  }
  return items;
}
const tasks = parseTasks(readText(path.join(JDIR, '11-code-tasks.txt')));
const ruleItems = new Map();
for (const t of TASKS) {
  if (!tasks.has(t) || !tasks.get(t).task_text || !tasks.get(t).general_rules) die(`J-11 ${t} incomplete`);
  const items = parseRuleItems(tasks.get(t).general_rules);
  const nos = [...items.keys()];
  if (!nos.length || nos.some((n, k) => n !== k + 1)) die(`J-11 ${t} rule numbering not 1..n (${nos.join(',')})`);
  ruleItems.set(t, items);
}

function readCsv(text) {
  const L = text.split('\n').filter((l) => l.length);
  const h = L[0].split(',');
  return L.slice(1).map((l) => { const v = l.split(','); const o = {}; h.forEach((k, i) => { o[k] = v[i]; }); return o; });
}
const lCheck = readCsv(readText(path.join(LDIR, 'L-60-checker-summary.csv')));
const kCheck = readCsv(readText(path.join(KDIR, 'K-60-checker-summary.csv')));
const grade = (rows, model, id) => {
  const r = rows.find((x) => x.model === model && x.id === id);
  if (!r || !/^\d+$/.test(r.error_grade)) die(`error_grade missing ${model} ${id}`);
  return Number(r.error_grade);
};
const k83 = JSON.parse(readText(path.join(KDIR, 'K-83-results.json')));

// 코드 줄 번호 — 판L T7 리뷰 러너 Get-NumberedCode 와 같은 꼴(끝 LF 하나 떼고 · 폭 = 줄 수 자릿수 · 「번호␠␠줄」 · 줄 끝 공백 뗌)
function numbered(code) {
  const txt = code.endsWith('\n') ? code.slice(0, -1) : code;
  const lines = txt.split('\n');
  const w = String(lines.length).length;
  return { n: lines.length, lines, text: lines.map((l, k) => `${String(k + 1).padStart(w)}  ${l}`.trimEnd()).join('\n') };
}

// 검사기 출력 정규화
function normalizeChecker(raw, codeRel) {
  const a = raw.indexOf('=== lint ===');
  const mIdx = raw.indexOf('=== metrics ===');
  if (a < 0 || mIdx < a) return null;
  const body = raw.slice(a, mIdx);
  const metricsLine = raw.slice(mIdx).split('\n')[1] || '';
  if (!/^parse_ok=\d/.test(metricsLine)) return null;
  for (const s of ['=== lint ===', '=== parse ===', '=== analyze ===']) if (!body.includes(s)) return null;
  const before = body.split(codeRel).length - 1;
  let t = body.split(codeRel).join('answer.abap');
  t = t.replace(/--- (stdout|stderr) \(\d+ bytes\) ---/g, '--- $1 ---');
  t = t.trimEnd() + '\n\n=== metrics ===\n' + metricsLine + '\n';
  const eg = /(?:^| )error_grade=(\d+)/.exec(metricsLine);
  return { text: t, pathReplacements: before, metricsErrorGrade: eg ? Number(eg[1]) : null };
}

// ── E-1 행 ────────────────────────────────────────────────────────────────────
const e1Canon = [];
for (const [cond, dir, codeSub, chkSub, sum] of [
  ['panL-note', LDIR, 'L-60-code', 'L-60-checker', lCheck],
  ['panK-drift', KDIR, 'K-60-code', 'K-60-checker', kCheck],
]) {
  for (const m of MODELS) for (const t of TASKS) {
    const codeAbs = path.join(dir, codeSub, m, `${t}.abap`);
    const chkAbs = path.join(dir, chkSub, m, `${t}.txt`);
    const code = readText(codeAbs);
    const chkRaw = readText(chkAbs);
    const norm = normalizeChecker(chkRaw, rel(codeAbs));
    if (!norm) die(`checker output layout unexpected — ${rel(chkAbs)}`);
    e1Canon.push({ condition: cond, model: m, task: t, source: rel(codeAbs), target: rel(chkAbs), code, num: numbered(code), checker: norm, error_grade: grade(sum, m, t) });
  }
}
const e1Order = shuffleWith(mulberry32(streamSeed('e1-order')), e1Canon);
e1Order.forEach((r, k) => { r.anon_id = `E1-${String(k + 1).padStart(2, '0')}`; });

// ── E-3 정답 (K-83 rows · condition=K · kind=code) ─────────────────────────────
const kRows = k83.rows.filter((r) => r.kind === 'code' && r.condition === 'K');
const gold = new Map(); // `${model}|${task}` -> [{rule_no, line}]
let k83ErrorGradeSum = 0;
for (const m of MODELS) for (const t of TASKS) {
  const r = kRows.find((x) => x.model === m && x.id === t);
  if (!r || typeof r.viol !== 'string' || r.viol === '미확정') die(`K-83 viol missing ${m} ${t}`);
  k83ErrorGradeSum += Number(r.error_grade);
  const list = r.viol === '' ? [] : r.viol.split(';').map((s) => {
    const mm = /^(\d+)@(\d+)$/.exec(s.trim());
    if (!mm) die(`K-83 viol unparsable ${m} ${t}: ${s}`);
    return { rule_no: Number(mm[1]), line: Number(mm[2]) };
  });
  const cv = k83.code?.[m]?.viol?.[t];
  if (cv !== r.viol) die(`K-83 code.${m}.viol.${t} (${cv}) != rows viol (${r.viol})`);
  gold.set(`${m}|${t}`, list);
}
const kSummaryErrorGradeSum = kCheck.reduce((s, r) => s + Number(r.error_grade), 0);

// ── E-3 가림 규칙 ─────────────────────────────────────────────────────────────
// 쪽지 본문의 출처 표식 [파일 § 절] 에서 절 이름 조각을 뽑는다(R2b). 두 낱말 이상 · 영문 글자 · 백틱/중괄호 없음 · 'Open SQL' 제외.
const notePrompt = readText(path.join(LDIR, 'L-75-prompts', 'note-claude-opus-5-5-C-01.txt'));
const nb = notePrompt.indexOf('<!-- sapkit:conventions-note:begin -->');
const ne = notePrompt.indexOf('<!-- sapkit:conventions-note:end -->');
if (nb < 0 || ne < nb) die('note markers not found in L-75 note prompt');
const TITLE_STOP = new Set(['Open SQL']);
const titleSet = new Set();
for (const m of notePrompt.slice(nb, ne).matchAll(/\[([^\]\n]*?) § ([^\]\n]+)\]/g)) {
  for (let part of m[2].split(' — ')) {
    part = part.replace(/\([^)]*\)/g, '').replace(/^\d+\.\s+/, '').trim();
    if (!/^[A-Za-z][A-Za-z0-9 /&'-]*[A-Za-z0-9]$/.test(part)) continue;
    if (part.split(/\s+/).length < 2 || TITLE_STOP.has(part)) continue;
    titleSet.add(part);
  }
}
const SECTION_TITLES = [...titleSet].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SECTION_TAIL = String.raw`(?:\s*§\s*(?:\d+(?:\.\d+)*|[A-Z][A-Za-z0-9/&\- ]*[A-Za-z0-9]))?(?::\d+(?:[-–]\d+)?)?`;
const FILE_BASES = ['clean-code(?:-oop|-procedural|-note)?', 'constant-rule', 'naming-conventions', 'text-element-rule', 'include-structure',
  'oop-pattern', 'abap-release-reference', 'function-module-rule', 'procedural-form-naming', 'alv-rules', 'zsapkit_oop_ex(?:\\.prog)?', 'main-program'];
const FILE_RE_SRC = String.raw`(?:(?:[\w.-]+\/)*[\w.-]+\.(?:md|abap)\b|\b(?:${FILE_BASES.join('|')})\b|(?:procedural|oop|규약)\s*(?:문서|파일|files?))` + SECTION_TAIL;
const KEEP_FILES = /^(?:spec|interview)\.md$/i; // 두 조건의 §8 문안에 똑같이 있는 파일 이름 — 조건 표지가 아니라 가리지 않는다
const fileRe = () => new RegExp(FILE_RE_SRC, 'gi');
const hasFile = (s) => { for (const m of s.matchAll(fileRe())) if (!KEEP_FILES.test(m[0])) return true; return false; };
// 영어 동사는 소문자 · 낱말 경계로만 잰다(ABAP 키워드 USING · READ 와 겹치지 않게)
const READVERB = /읽|불러|열지|열어|열었|기준|판정|판단|\b(?:load(?:ed)?|read|using|open(?:ed)?|consult(?:ed)?|judged|from the rules)\b/;
const ENV = /작업\s*디렉터리|작업\s*공간|작업\s*폴더|workspace|경로에\s*없|위치에\s*없|isn't in the|is not in the|is missing|대조하지\s*(?:는\s*)?못|대조\s*불가|대조는\s*못|원문은\s*대조|템플릿\s*미확인|확인하지\s*못|couldn't compare|could not compare|찾으면|읽지\s*않아서|읽어\s*들인/i;
const GROUP_LABEL = /House rules?|\bHouse\b|Release and function modules|Release and FM|Release\s*\/\s*FM/i;
const GROUP_SCOPE = /그룹|group|judged|체크\s*대상|판정\s*범위/i;
const GATE = /paradigm\s*(?:gate|게이트)/i;
const segHit = (s) => (hasFile(s) && READVERB.test(s)) || ENV.test(s) || (GROUP_LABEL.test(s) && GROUP_SCOPE.test(s)) || GATE.test(s);

const MASK_RULES = [
  { id: 'R6', what: '환경 · 읽기 · 범위 문장 — 괄호 묶음 또는 문장(「. 」 · 「 | 」 로 나눈 조각) 가운데 ① 원본 파일 이름(R1 꼴)과 읽기 · 기준 · 판단 동사가 함께 있거나 ② 작업 폴더 · 파일 부재 · 대조 불가 · 확인 불가 표현이 있거나 ③ R4 꼴 그룹 이름과 「그룹 · group · judged · 체크 대상 · 판정 범위」가 함께 있거나 ④ R7 꼴 표현이 있는 것을 조각째 가린다(목록 머리 「- 」 는 남긴다 · 영어 동사는 소문자 낱말로만 잰다)' },
  { id: 'R1', what: '원본 파일 이름 — 경로 · *.md · *.abap(spec.md · interview.md 는 남김) · 규약 · 템플릿 파일 이름(확장자 없이도) · 「procedural/OOP/규약 + 파일/문서」 · 뒤따르는 「§ 절 이름」「:줄」 까지' },
  { id: 'R2', what: '출처 표식 — 「[… § …]」 꺾쇠 묶음 · 「§ + 영문 절 이름」(§8 처럼 숫자가 오는 것은 남김)' },
  { id: 'R2b', what: '쪽지 본문 출처 표식의 절 이름 조각(두 낱말 이상 · 대소문자 그대로 · Open SQL 제외)' },
  { id: 'R5', what: '자체 판단 표지 — 「자체 판단」 · 「own judgment」 · 「판단」으로 시작하거나 「자체 판단」「노트 외」를 담은 괄호 묶음 · 칸 머리의 「판단(…)」 + 「·/:/—」' },
  { id: 'R3', what: '쪽지 낱말 — 「쪽지」 · 「노트」 · 낱말 「note(s)」(대소문자 무시)' },
  { id: 'R4', what: '쪽지 조건 문안에만 있는 그룹 이름 — 「House rules」 · 낱말 「House」 · 「하우스 규칙/패턴」 · 「Release and function modules」 · 「Release and FM」 · 「Release/FM」' },
  { id: 'R7', what: '원본 조건 문안에만 있는 「paradigm gate (first)」 · 「Paradigm 게이트」' },
];
const TOKEN_RULES = [
  ['R1', () => fileRe(), (m) => (KEEP_FILES.test(m) ? m : MASK)],
  ['R2', () => /\[[^\]\n]*§[^\]\n]*\]/g],
  ['R2', () => /§\s*[A-Z][A-Za-z0-9/&\- ]*[A-Za-z0-9]/g],
  ['R2b', () => (SECTION_TITLES.length ? new RegExp(SECTION_TITLES.map(esc).join('|'), 'g') : null)],
  ['R5', () => /(?<=^|\|\s?)판단(?:\s*\([^()\n]*\))?(?=\s*[·:—–])/gm],
  ['R5', () => /\([^()\n]*(?:자체\s*판단|노트\s*외|own judg)[^()\n]*\)/gi],
  ['R5', () => /\(\s*판단[^()\n]*\)/g],
  ['R5', () => /자체\s*판단/g],
  ['R5', () => /own judg(?:e)?ment/gi],
  ['R3', () => /쪽지|노트|\bnotes?\b/gi],
  ['R4', () => /House rules?|\bHouse\b|하우스\s*(?:규칙|패턴)|Release and function modules|Release and FM|Release\s*\/\s*FM/gi],
  ['R7', () => /paradigm\s*(?:gate|게이트)(?:\s*first)?/gi],
];

function maskReview(text) {
  const counts = Object.fromEntries(MASK_RULES.map((r) => [r.id, 0]));
  // R6 — 줄마다: 괄호 묶음 → 문장 조각
  const outLines = text.split('\n').map((line) => {
    let l = line.replace(/\([^()\n]*\)/g, (p) => { if (segHit(p)) { counts.R6++; return MASK; } return p; });
    const lead = /^(\s*(?:[-*]|\d+\.)\s+)?/.exec(l)[0];
    const rest = l.slice(lead.length);
    const parts = rest.split(/((?<=[.!?])\s+| \| )/);
    for (let k = 0; k < parts.length; k += 2) {
      if (parts[k] && parts[k] !== MASK && segHit(parts[k])) { counts.R6++; parts[k] = MASK; }
    }
    return lead + parts.join('');
  });
  let t = outLines.join('\n');
  for (const [id, mk, fn] of TOKEN_RULES) {
    const re = mk();
    if (!re) continue;
    t = t.replace(re, (m) => {
      const r = fn ? fn(m) : MASK;
      if (r !== m) counts[id]++;
      return r;
    });
  }
  return { text: t, counts, total: Object.values(counts).reduce((s, x) => s + x, 0) };
}

// ── E-3 행 ────────────────────────────────────────────────────────────────────
const e3Canon = [];
for (const c of REVIEW_CONDS) for (const m of MODELS) for (const t of TASKS) {
  const revAbs = path.join(LDIR, 'L-75-reviews', c, `${m}-${t}.txt`);
  const codeAbs = path.join(KDIR, 'K-60-code', m, `${t}.abap`);
  const review = readText(revAbs);
  const code = readText(codeAbs);
  const num = numbered(code);
  const g = gold.get(`${m}|${t}`);
  for (const x of g) {
    if (x.line < 1 || x.line > num.n) die(`gold line out of range ${m} ${t} ${x.rule_no}@${x.line} (lines ${num.n})`);
    if (!ruleItems.get(t).has(x.rule_no)) die(`gold rule not in J-11 ${t}: ${x.rule_no}`);
  }
  e3Canon.push({ condition: c, model: m, task: t, source: rel(revAbs), target: rel(codeAbs), review, masked: maskReview(review), num, gold: g });
}
const e3Order = shuffleWith(mulberry32(streamSeed('e3-order')), e3Canon);
e3Order.forEach((r, k) => { r.anon_id = `E3-${String(k + 1).padStart(2, '0')}`; });

// ── 지문 ──────────────────────────────────────────────────────────────────────
const fileSha = [...inputs.entries()].map(([p, t]) => [p, sha256(t)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const aggOf = (pred) => sha256(fileSha.filter(([p]) => pred(p)).map(([p, s]) => `${p}\t${s}\n`).join(''));
const shaOf = (p) => fileSha.find(([q]) => q === p)[1];
const relJ11 = rel(path.join(JDIR, '11-code-tasks.txt'));
const isE1Input = (p) => p === relJ11 || /\/(L-60-code|K-60-code|L-60-checker|K-60-checker)\//.test(p) || /(L-60-checker-summary\.csv|K-60-checker-summary\.csv)$/.test(p);
const isE3Input = (p) => p === relJ11 || /\/L-75-reviews\//.test(p) || /\/L-75-prompts\//.test(p) || /\/K-60-code\//.test(p) || /K-83-results\.json$/.test(p);
const nE1 = fileSha.filter(([p]) => isE1Input(p)).length;
const nE3 = fileSha.filter(([p]) => isE3Input(p)).length;

// ── 묶음 ──────────────────────────────────────────────────────────────────────
const streamMeta = (n, use) => ({ name: n, fnv1a: fnv1a(n), seed: streamSeed(n), use });
const goldTotal = e3Canon.filter((r) => r.condition === 'original').reduce((s, r) => s + r.gold.length, 0);
const e1Bundle = {
  meta: {
    schema: 'blind-bundle-e1-v1',
    generator: 'L-65-build-blind.mjs',
    seed: SEED,
    streams: [streamMeta('e1-order', '행 순서 섞기(Fisher–Yates) · 익명 id 는 섞은 순서대로 E1-01…')],
    rows: e1Order.length,
    fields: 'anon_id · task_id · task_text · required_output · general_rules · checker_error_grade · checker_output · code_lines · code_numbered — task_text · required_output · general_rules 는 과제 파일(11-code-tasks.txt)의 그 과제 절 글자 그대로(들여쓰기만 뗌), code_numbered 는 소스 전문 무편집에 줄 번호를 붙인 것',
    code_numbering: '줄 번호 = 소스를 줄바꿈(\\n)으로 나눈 물리 줄 · 1부터 · 「번호␠␠원래 줄」(번호는 오른쪽 맞춤 · 줄 끝 공백은 뗌) — 번호와 두 칸은 소스가 아니다',
    checker_error_grade_source: '검사기 요약 표의 error_grade 열(오류급 = lint Error ∪ parse exit≠0 ∪ analyze high · 과제 파일 §0 · 산식 = lint 「: E [」 줄 수 + (parse exit≠0 ? 1 : 0) + analyze summary.bySeverity.high) — 기계 결과이며 채점자가 뒤집지 않는다',
    checker_output_explain: '동봉 검사기 3명령(lint · parse · analyze) 원출력에서 머리 줄과 실행 환경 줄을 떼고, 대상 파일 경로를 answer.abap 으로 바꾸고, stdout/stderr 바이트 수를 뗀 것. 마지막 metrics 줄은 원출력의 키=값 줄 그대로',
    inputs: { task_file_sha256: shaOf(relJ11), aggregate_sha256: aggOf(isE1Input), aggregate_files: nE1, aggregate_explain:'집합 지문 = sha256(「<레포 상대 경로>\\t<sha256>\\n」 경로순) · 파일 목록과 개별 지문은 L-65-check.txt' },
  },
  rows: e1Order.map((r) => {
    const t = tasks.get(r.task);
    return { anon_id: r.anon_id, task_id: r.task, task_text: t.task_text, required_output: t.required_output, general_rules: t.general_rules,
      checker_error_grade: r.error_grade, checker_output: r.checker.text, code_lines: r.num.n, code_numbered: r.num.text };
  }),
};
const e3Bundle = {
  meta: {
    schema: 'blind-bundle-e3-v1',
    generator: 'L-65-build-blind.mjs',
    seed: SEED,
    streams: [streamMeta('e3-order', '행 순서 섞기(Fisher–Yates) · 익명 id 는 섞은 순서대로 E3-01…')],
    rows: e3Order.length,
    fields: 'anon_id · task_id · task_text · required_output · gold_count · gold[] (gold_id · rule_no · rule_title · rule_text · line · line_text) · code_lines · code_numbered · review — review 는 리뷰 응답 원문에 가림 규칙을 적용한 것(가린 자리 = 「[가림]」)',
    code_numbering: '줄 번호 = 리뷰어가 받은 것과 같은 꼴(소스를 \\n 으로 나눈 물리 줄 · 1부터 · 「번호␠␠원래 줄」) — 리뷰가 적은 줄 번호와 정답 줄 번호는 같은 번호 체계다',
    gold_source: '앞선 채점의 최종 규칙별 위반 목록(최종 집계 rows[] 의 viol · 「규칙번호@줄」). rule_text 는 과제 파일 general_rules 의 그 번호 항목 글자 그대로(이음 줄 포함), rule_title 은 그 첫 줄의 「 — 」 앞',
    gold_total: goldTotal,
    checker_exclusion: { explain: '검사기가 잡은 형식 위반은 분자 · 분모에서 뺀다 — 리뷰 대상 답 10개의 검사기 오류급 합이 0 이므로 제외 집합은 비어 있다', error_grade_sum_summary: kSummaryErrorGradeSum, error_grade_sum_results: k83ErrorGradeSum, excluded: [] },
    masking: { token: MASK, explain: '응답 글자 가운데 리뷰 환경을 드러내는 조각(읽은 파일 이름 · 문서 절 표식 · 환경을 말하는 문장 등)을 이 표시로 바꿨다. 모든 행에 같은 규칙 · 같은 순서로 적용했고, 규칙 내용(무엇이 어긋났는지)은 남겼다. 가린 자리에 무엇이 있었는지는 추정하지 않는다.' },
    inputs: { task_file_sha256: shaOf(relJ11), aggregate_sha256: aggOf(isE3Input), aggregate_files: nE3, aggregate_explain:'집합 지문 = sha256(「<레포 상대 경로>\\t<sha256>\\n」 경로순) · 파일 목록과 개별 지문은 L-65-check.txt' },
  },
  rows: e3Order.map((r) => {
    const t = tasks.get(r.task);
    const items = ruleItems.get(r.task);
    return {
      anon_id: r.anon_id, task_id: r.task, task_text: t.task_text, required_output: t.required_output,
      gold_count: r.gold.length,
      gold: r.gold.map((x, k) => ({ gold_id: `${r.anon_id}-G${k + 1}`, rule_no: x.rule_no, rule_title: items.get(x.rule_no).title, rule_text: items.get(x.rule_no).text, line: x.line, line_text: r.num.lines[x.line - 1] })),
      code_lines: r.num.n, code_numbered: r.num.text, review: r.masked.text,
    };
  }),
};
const jsonText = (o) => JSON.stringify(o, null, 2) + '\n';
const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const RULE_IDS = MASK_RULES.map((r) => r.id);
const mapText = 'anon_id,bundle,condition,model,task_id,source,target,mask_total,mask_by_rule\n'
  + [
    ...e1Order.map((r) => [r.anon_id, 'e1', r.condition, r.model, r.task, r.source, r.target, '-', '-']),
    ...e3Order.map((r) => [r.anon_id, 'e3', r.condition, r.model, r.task, r.source, r.target, r.masked.total, RULE_IDS.map((id) => `${id}=${r.masked.counts[id]}`).join(';')]),
  ].map((a) => a.map(csvCell).join(',')).join('\n') + '\n';

const OUT = {
  e1: path.join(LDIR, 'L-65-blind-e1.json'),
  e3: path.join(LDIR, 'L-65-blind-e3.json'),
  map: path.join(LDIR, 'L-79-blind-map.csv'),
  check: path.join(LDIR, 'L-65-check.txt'),
  brief: path.join(LDIR, 'L-65-grader-brief.txt'),
  mbrief: path.join(LDIR, 'L-66-matcher-brief.txt'),
};
const built = { e1: jsonText(e1Bundle), e3: jsonText(e3Bundle), map: mapText };

if (!CHECK) {
  fs.writeFileSync(OUT.e1, built.e1, 'utf8');
  fs.writeFileSync(OUT.e3, built.e3, 'utf8');
  fs.writeFileSync(OUT.map, built.map, 'utf8');
  console.log(`wrote ${rel(OUT.e1)} (${e1Order.length} rows) · ${rel(OUT.e3)} (${e3Order.length} rows) · ${rel(OUT.map)} (${e1Order.length + e3Order.length} rows)`);
  console.log(`sha256 e1=${sha256(built.e1)} e3=${sha256(built.e3)} map=${sha256(built.map)}`);
  process.exit(0);
}

// ── --check ──────────────────────────────────────────────────────────────────
const L = [];
let fails = 0;
const ok = (cond, msg) => { L.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const readOut = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null);

L.push('L-65-check.txt — 판L T65 익명 묶음 검사 결과 (node L-65-build-blind.mjs --check 가 쓴다 · 시각 없음 · 다시 돌려도 같은 글자)');
L.push('⚠ 이 파일은 조건 · 모델 이름과 정답 건수를 담는다 — 채점자 · 매칭자 금독');
L.push('');
L.push('[1] 난수 스트림');
for (const n of STREAMS) L.push(`  ${n}  fnv1a=${fnv1a(n)}  seed=${streamSeed(n)}  (SEED ${SEED})`);
ok(streamSeed('e1-order') !== streamSeed('e3-order'), '두 스트림 시드가 서로 다르다');
L.push('');

L.push('[2] 결정성 — 다시 만든 글자 = 디스크 (CRLF → LF 로 읽어 대조)');
ok(readOut(OUT.e1) === built.e1, `${rel(OUT.e1)}  sha256=${sha256(built.e1)}`);
ok(readOut(OUT.e3) === built.e3, `${rel(OUT.e3)}  sha256=${sha256(built.e3)}`);
ok(readOut(OUT.map) === built.map, `${rel(OUT.map)}  sha256=${sha256(built.map)}`);
L.push('');

L.push('[3] 행 수 · id · 매핑 대조');
const b1 = JSON.parse(readOut(OUT.e1) || '{"rows":[]}');
const b3 = JSON.parse(readOut(OUT.e3) || '{"rows":[]}');
const ids1 = b1.rows.map((r) => r.anon_id);
const ids3 = b3.rows.map((r) => r.anon_id);
ok(b1.rows.length === 20 && ids1.every((x, k) => x === `E1-${String(k + 1).padStart(2, '0')}`), `E-1 행 20 · id E1-01…E1-20 순 (행 ${b1.rows.length})`);
ok(b3.rows.length === 20 && ids3.every((x, k) => x === `E3-${String(k + 1).padStart(2, '0')}`), `E-3 행 20 · id E3-01…E3-20 순 (행 ${b3.rows.length})`);
const mapRows = (readOut(OUT.map) || '').split('\n').slice(1).filter(Boolean).map((l) => l.split(','));
const m1 = mapRows.filter((r) => r[1] === 'e1');
const m3 = mapRows.filter((r) => r[1] === 'e3');
ok(mapRows.length === 40 && m1.map((r) => r[0]).join() === ids1.join() && m3.map((r) => r[0]).join() === ids3.join(), `매핑 40행 = E-1 20 + E-3 20 · id 집합과 순서가 묶음과 같다 (매핑 ${mapRows.length})`);
const cnt = (rows, f) => rows.reduce((o, r) => { const k = f(r); o[k] = (o[k] || 0) + 1; return o; }, {});
const c1 = cnt(m1, (r) => r[2]);
const c3 = cnt(m3, (r) => r[2]);
ok(c1['panL-note'] === 10 && c1['panK-drift'] === 10, `E-1 조건별 10 · 10 (panL-note ${c1['panL-note']} · panK-drift ${c1['panK-drift']})`);
ok(c3.original === 10 && c3.note === 10, `E-3 조건별 10 · 10 (original ${c3.original} · note ${c3.note})`);
const keyset = (rows) => new Set(rows.map((r) => `${r[2]}|${r[3]}|${r[4]}`));
ok(keyset(m1).size === 20 && keyset(m3).size === 20, '조건 × 모델 × 과제 조합이 묶음마다 20개 모두 서로 다르다');
const taskMatch1 = b1.rows.every((r, k) => r.task_id === m1[k][4]);
const taskMatch3 = b3.rows.every((r, k) => r.task_id === m3[k][4]);
ok(taskMatch1 && taskMatch3, '묶음 task_id = 매핑 task_id (행마다)');
L.push('');

L.push('[4] 무편집 · 기계 결과 출처');
const blobIndex = new Map();
try {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-s', '--', rel(JDIR), rel(KDIR), rel(LDIR)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  for (const line of out.split('\n')) { const m = /^\d+ ([0-9a-f]{40}) \d+\t(.+)$/.exec(line); if (m) blobIndex.set(m[2], m[1]); }
} catch { /* 아래 FAIL 로 드러난다 */ }
let blobBad = 0;
for (const [p, t] of inputs) {
  const buf = Buffer.from(t, 'utf8');
  const h = crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
  if (blobIndex.get(p) !== h) { blobBad++; L.push(`  blob 어긋남: ${p}`); }
}
ok(blobBad === 0, `입력 ${inputs.size}파일의 읽은 바이트 = 커밋 blob (git ls-files -s 대조 · 어긋남 ${blobBad})`);
const e1ById = new Map(e1Order.map((r) => [r.anon_id, r]));
const e3ById = new Map(e3Order.map((r) => [r.anon_id, r]));
const unnum = (s) => s.split('\n').map((l) => l.replace(/^\s*\d+(?: {2}|$)/, '')).join('\n');
ok(b1.rows.every((r) => { const s = e1ById.get(r.anon_id); const src = s.code.endsWith('\n') ? s.code.slice(0, -1) : s.code; return unnum(r.code_numbered) === src.split('\n').map((l) => l.trimEnd()).join('\n') && r.code_lines === s.num.n; }),
  'E-1 code_numbered 에서 번호를 떼면 소스와 같다(줄 끝 공백 제외 · 행마다)');
ok(b3.rows.every((r) => { const s = e3ById.get(r.anon_id); const src = s.num.lines.map((l) => l.trimEnd()).join('\n'); return unnum(r.code_numbered) === src; }), 'E-3 code_numbered 에서 번호를 떼면 판K 원본 소스와 같다(행마다)');
ok(e1Order.every((r) => r.checker.metricsErrorGrade === r.error_grade), 'E-1 checker_error_grade(요약 표) = 검사기 원출력 metrics error_grade (행마다)');
ok(e1Order.every((r) => r.checker.pathReplacements >= 3), `E-1 검사기 출력의 대상 경로 치환 ≥ 3 (명령 줄 3) · 행별 최소 ${Math.min(...e1Order.map((r) => r.checker.pathReplacements))}`);
const egDist = cnt(e1Order, (r) => `${r.condition}:${r.error_grade}`);
L.push(`  E-1 checker_error_grade 분포: ${Object.entries(egDist).sort().map(([k, v]) => `${k}=${v}`).join(' · ')}`);
L.push('');

L.push('[5] E-3 정답 (판K 최종 · K-83-results.json rows[] condition=K kind=code 의 viol · code.<model>.viol 과 대조)');
ok(goldTotal === b3.rows.reduce((s, r) => s + r.gold_count, 0) / 2, `정답 합계 ${goldTotal} = 묶음 gold_count 합 ÷ 2 (두 조건이 같은 답을 리뷰)`);
for (const m of MODELS) L.push(`  ${m}  ${TASKS.map((t) => `${t}=${gold.get(`${m}|${t}`).length}「${gold.get(`${m}|${t}`).map((x) => `${x.rule_no}@${x.line}`).join(';')}」`).join(' · ')}`);
L.push(`  정답 합계 = ${goldTotal} (답 10개 · 위반이 있는 답 ${[...gold.values()].filter((g) => g.length).length} · 없는 답 ${[...gold.values()].filter((g) => !g.length).length})`);
ok(kSummaryErrorGradeSum === 0 && k83ErrorGradeSum === 0, `판K 답 10개 검사기 오류급 합 = 0 (K-60-checker-summary.csv ${kSummaryErrorGradeSum} · K-83 rows ${k83ErrorGradeSum}) → 검사기 제외 집합은 비어 있다`);
ok(b3.rows.every((r) => r.gold.every((g) => g.line_text === e3ById.get(r.anon_id).num.lines[g.line - 1])), '정답 line_text = 그 줄 원문');
ok(b3.rows.every((r) => { const s = e3ById.get(r.anon_id); return r.gold_count === gold.get(`${s.model}|${s.task}`).length; }), '묶음 gold_count = 정답 건수(행마다)');
L.push('');

L.push('[6] E-3 가림 (두 조건 같은 규칙 · 원본 응답 파일은 무편집)');
ok(e3Order.every((r) => r.review === inputs.get(r.source)), '원본 응답 = 디스크 파일(가림 전 · 무편집)');
ok(b3.rows.every((r) => r.review === e3ById.get(r.anon_id).masked.text), '묶음 review = 원본에 가림 규칙을 적용한 글자');
for (const c of REVIEW_CONDS) {
  const rows = e3Canon.filter((r) => r.condition === c);
  const byRule = RULE_IDS.map((id) => `${id}=${rows.reduce((s, r) => s + r.masked.counts[id], 0)}`).join(' · ');
  L.push(`  ${c}  가림 합계 ${rows.reduce((s, r) => s + r.masked.total, 0)}  (${byRule})`);
}
for (const r of e3Canon) L.push(`    ${r.condition.padEnd(8)} ${r.model.padEnd(17)} ${r.task}  ${r.masked.total}`);
L.push(`  R2b 절 이름 ${SECTION_TITLES.length}개: ${SECTION_TITLES.join(' · ')}`);
L.push(`  가림 표시 「${MASK}」 · 적용 순서 R6(조각) → R1 → R2 → R2b → R5 → R3 → R4 → R7 · 두 조건 같은 규칙 · 규칙 내용(무엇이 어긋났는지)은 남김`);
L.push('  가림 규칙 (묶음에는 싣지 않는다 — 규칙 글자 자체가 조건을 드러내므로 매칭자에게 주지 않는 이 기록에만 둔다):');
for (const r of MASK_RULES) L.push(`    ${r.id}  ${r.what}`);
L.push('');

L.push('[7] 표시 문자열 검사 (대소문자 무시)');
const COMMON = [/claude/i, /opus/i, /sonnet/i, /gpt/i, /codex/i, /판\s*[jkl]/i, /\bnotes?\b/i, /쪽지/, /노트/, /\b[lk]-(?:50|60|75|79|8\d)\b/i,
  /docs\//i, /audits/i, /harness-on/i, /note-and-trim/i, /comparison/i, /blind-map/i, /node v\d/i, /2026-\d\d/];
const E3_EXTRA = [/clean-code/i, /(?<!\bspec|\binterview)\.md\b/i, /constant-rule|function-module-rule|naming-conventions|text-element-rule|include-structure|oop-pattern|abap-release-reference|procedural-form-naming/i,
  /main-program\.abap/i, /zsapkit_oop_ex/i, /\bhouse\b/i, /하우스/, /release and/i, /release\s*\/\s*fm/i, /자체\s*판단/, /own judg/i, /paradigm\s*(?:gate|게이트)/i,
  /§\s*[A-Za-z]/, /\boriginal\b/i, /workspace/i, /작업\s*(?:디렉터리|공간|폴더)/, /knowledge\//i, /procedures\//i, /원본\s*조건/];
const hits = (s, list) => list.filter((re) => re.test(String(s))).map((re) => re.source);
let ownHits = 0;
const verbatim = [];
const scan = (name, list, b, verbatimFields, derivedField) => {
  // meta 는 스크립트가 쓴 글자 전부라 면제 없이 잰다 — 낱말 경계 없이 「note」 조각도 금지(키 이름 *_note 류)
  const mh = hits(JSON.stringify(b.meta), [...list, /note/i]);
  if (mh.length) { ownHits += mh.length; L.push(`  FAIL ${name} meta: ${mh.join(' · ')}`); }
  for (const r of b.rows) {
    for (const [f, v] of Object.entries(r)) {
      if (f === 'gold') {
        for (const g of v) for (const [gf, gv] of Object.entries(g)) {
          const h = hits(gv, list);
          if (!h.length) continue;
          if (gf === 'rule_text' || gf === 'line_text') verbatim.push(`${r.anon_id}  gold.${gf}  ${h.join(' · ')}`);
          else { ownHits += h.length; L.push(`  FAIL ${name} ${r.anon_id} gold.${gf}: ${h.join(' · ')}`); }
        }
        continue;
      }
      const h = hits(v, list);
      if (!h.length) continue;
      if (verbatimFields.has(f)) { verbatim.push(`${r.anon_id}  ${f}  ${h.join(' · ')}`); continue; }
      if (f === derivedField) {
        // 검사기 출력 — 그 행 코드에 같은 낱말이 있으면(parse 가 주석 · 토큰을 그대로 옮김) 코드 유래로 기록만
        const codeH = new Set(hits(r.code_numbered, list));
        const own = h.filter((x) => !codeH.has(x));
        for (const x of h.filter((y) => codeH.has(y))) verbatim.push(`${r.anon_id}  ${f}(코드 유래)  ${x}`);
        if (own.length) { ownHits += own.length; L.push(`  FAIL ${name} ${r.anon_id} ${f}: ${own.join(' · ')}`); }
        continue;
      }
      ownHits += h.length; L.push(`  FAIL ${name} ${r.anon_id} ${f}: ${h.join(' · ')}`);
    }
    for (const k of Object.keys(r)) { const h = hits(k, list); if (h.length) { ownHits += h.length; L.push(`  FAIL ${name} key ${k}`); } }
  }
};
scan('L-65-blind-e1.json', COMMON, b1, new Set(['task_text', 'required_output', 'general_rules', 'code_numbered']), 'checker_output');
scan('L-65-blind-e3.json', [...COMMON, ...E3_EXTRA], b3,new Set(['task_text', 'required_output', 'code_numbered']), null);
ok(ownHits === 0, `묶음 두 파일의 meta · 키 · 스크립트가 쓴 칸(anon_id · task_id · 검사기 출력 · gold 의 id/번호/제목/줄 · 가린 review)에 표시 문자열 0 (발견 ${ownHits})`);
L.push(`  공통 금지: ${COMMON.map((r) => r.source).join(' · ')}`);
L.push(`  E-3 추가 금지(가린 review 등): ${E3_EXTRA.map((r) => r.source).join(' · ')}`);
L.push(`  원문 그대로 옮긴 칸(과제 글자 · 코드 · 정답 규칙 인용 · 코드 유래 검사기 줄)의 발견 = ${verbatim.length}건 — 무편집 원칙에 따라 고치지 않고 적기만 한다:`);
for (const h of verbatim) L.push(`    ${h}`);
// 지시문 — 자료 폴더 경로(폴더 이름에 낱말 note 가 든다)는 떼고 잰다
const DATA_PATH = rel(LDIR);
const BRIEF_TOKENS = [/claude-opus|claude-sonnet/i, /\bopus\b/i, /\bsonnet\b/i, /gpt/i, /codex/i, /판\s*[kl]/i, /\bnotes?\b/i, /쪽지/, /노트/, /\b[lk]-60\b/i, /\bl-75\b/i, /\bk-8\d\b/i, /\bl-79\b/i, /blind-map/i, /harness-on/i, /원본\s*조건/];
for (const [name, p, extra] of [['L-65-grader-brief.txt', OUT.brief, [/\bl-66\b/i]], ['L-66-matcher-brief.txt', OUT.mbrief, []]]) {
  const txt = readOut(p);
  // 출력 파일 이름 L-NN-notes-X.txt(plan 이 정한 채점 메모 이름)도 떼고 잰다
  const h = txt === null ? ['(지시문 없음)'] : hits(txt.split(DATA_PATH).join('<DATA>').replace(/\bL-\d\d-notes-[A-Za-z0-9]+\.txt\b/g, '<OUT>'), [...BRIEF_TOKENS, ...extra]);
  ok(h.length === 0, `${name} 에 표시 문자열 0 (자료 폴더 경로는 떼고 잼 · 발견 ${h.length}${h.length ? ': ' + h.join(' · ') : ''})`);
}
L.push(`  지시문 금지: ${BRIEF_TOKENS.map((r) => r.source).join(' · ')} (+ 채점 지시문만: \\bl-66\\b)`);
L.push('');

L.push('[8] 조건 단서 관찰 (판정 아님 · 집단별 수만)');
const resid = (c, re) => e3Canon.filter((r) => r.condition === c && re.test(r.masked.text)).length;
for (const [label, re] of [['「검사기 판정(을|대로) 수용/따르/인정」', /검사기\s*(?:판정|결과)?[^\n]{0,12}(?:수용|따르|따라|인정|accepted as reported)/i], ['「[가림]」 1회 이상', /\[가림\]/], ['「Core」 낱말', /\bCore\b/], ['「AUTHORITY-CHECK」', /AUTHORITY-CHECK/i]]) {
  L.push(`  ${label}: original ${resid('original', re)}/10 · note ${resid('note', re)}/10`);
}
L.push('  ⚠ 위 표지는 낱말 가림으로 지울 수 없는 행동 차이(지침이 달라 생긴 응답 구성 차이)다 — 매칭자 지시문이 「조건을 추정하지 말라」를 둔다.');
L.push('');

L.push('[9] 입력 지문 (파일마다 sha256 · CRLF → LF 로 읽은 바이트 = 커밋 blob)');
ok(b1.meta?.inputs?.aggregate_sha256 === aggOf(isE1Input), `E-1 묶음 meta 집합 지문 = 다시 잰 값 (${aggOf(isE1Input)} · ${nE1}파일)`);
ok(b3.meta?.inputs?.aggregate_sha256 === aggOf(isE3Input), `E-3 묶음 meta 집합 지문 = 다시 잰 값 (${aggOf(isE3Input)} · ${nE3}파일)`);
L.push(`  전체 입력 ${fileSha.length}파일 집합 지문 = ${aggOf(() => true)}`);
for (const [p, s] of fileSha) L.push(`  ${s}  ${p}`);
L.push('');
L.push(`결과: ${fails === 0 ? 'PASS' : 'FAIL'} (실패 ${fails})`);

fs.writeFileSync(OUT.check, L.join('\n') + '\n', 'utf8');
console.log(L.filter((l) => /^(PASS|FAIL|결과|  FAIL)/.test(l)).join('\n'));
console.log(`verbatim-field hits: ${verbatim.length}`);
process.exit(fails === 0 ? 0 : 1);
