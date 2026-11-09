#!/usr/bin/env node
// check-conventions-note.mjs — ABAP 작법 「쪽지」의 **정본 ↔ 사본 동기화** 게이트.
// 결정 근거: 판L · D-164 ⓚ (쪽지 정본 1 + 지시서 사본 4 — 같은 글자 다섯 벌).
//
// ─────────────────────────── 이 게이트의 주장 ──────────────────────────────
// 판L은 작법 규칙을 압축한 쪽지 한 장을 정본 파일에 두고, 그 본문을 지시서 네 곳에
// **글자 그대로** 복사해 싣는다. 지시서가 쪽지를 「읽으러 가라」가 아니라 본문을
// 직접 들고 있어야 세션이 그 규칙을 실제로 본다. 대가는 **같은 글자가 다섯 곳**에
// 있다는 것이고, 한 곳만 고치면 나머지가 **조용히 낡는다.** 이 게이트가 그것을 잰다:
//
//   ① 사본 4곳의 표식 사이 본문이 정본의 표식 사이 본문과 바이트 동일하다
//      (줄 끝 CRLF/LF 차이는 정규화 — 작업 트리가 core.autocrlf=true다)
//   ② 형식 계약 — 규칙 줄마다 출처 표식이 있고, 그 출처가 실재한다
//   ③ 크기 상한 — 쪽지가 「쪽지」로 남는다 (표식 사이 · LF 정규화 후)
//   ④ 표식 쌍이 파일마다 정확히 하나다 (부재 · 중복 · 짝 안 맞음 = 위반)
//
// ── 형식 계약 (쪽지 작성자와 이 게이트가 같은 정의를 쓴다) ────────────────
//   규칙 줄  = 표식 사이에서 `- `로 시작하는 줄. 줄 끝에 출처 표식
//              `[<파일이름>.md § <장 이름>]`을 단다. 예: `[clean-code.md § Open SQL]`.
//              출처가 둘이면 표식을 둘 단다 — 줄 안의 표식은 **전부** 검사한다.
//   면제 줄  = 빈 줄 · 소제목 줄(`#`로 시작하거나 `**…**`만 있는 줄) ·
//              탈출구 줄(`- `로 시작하지 않는 평문 한 줄).
//   출처 해석 = 파일은 `interactive/core/knowledge/abap/conventions/<파일이름>.md`로만
//              찾는다(`modules/common/`에 같은 이름이 있어도 보지 않는다). 장 이름은
//              그 파일의 `## ` 제목(fenced code 밖)에서 앞뒤 공백을 뺀 문자열과 같아야 한다.
//
// ⚠ ②③은 정본에 적용한다. 사본은 ①이 정본과 같음을 보이면 ②③도 같은 결과이므로
//   **정본과 다를 때만** 사본 자신의 ②③을 따로 보고한다(같은 위반이 다섯 번 찍히지 않게).
//
// ── 사용법 ─────────────────────────────────────────────────────────────────
//   node check-conventions-note.mjs [--root=<dir>] [--canonical-only]
//
//   --root=<dir>      선택 · 기본값 = 레포 루트(이 스크립트 위치에서 계산). 음성시험이
//                     임시 폴더 픽스처를 먹일 때 쓴다.
//   --canonical-only  ②~④를 정본에만 적용하고 ①(사본 대조)은 건너뛴다 — 쪽지 작성자가
//                     사본을 옮기기 전에 정본만 다듬을 때 쓴다.
//
// exit 0 통과 / 1 위반 / 2 사용법 오류(모르는 인자 등 — 안내는 stderr)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 고정 목록 · 상수 ───────────────────────────────────────────────────────
const BEGIN = '<!-- sapkit:conventions-note:begin -->';
const END = '<!-- sapkit:conventions-note:end -->';
const CONVENTIONS_DIR = 'interactive/core/knowledge/abap/conventions';
const CANONICAL = `${CONVENTIONS_DIR}/clean-code-note.md`;
// 사본 목록 — 쪽지를 싣는 지시서가 늘거나 줄면 여기를 고친다(계약 변경 · 커밋에 사유).
const COPIES = [
  'interactive/core/procedures/create-program.md',
  'interactive/core/procedures/create-object.md',
  'interactive/core/procedures/modify-object.md',
  'interactive/core/procedures/review-checklist.md',
];
// 크기 상한 — 표식 사이 본문 · LF 정규화 후. 조정 가능하나 옮기면 계약 변경이다
// (쪽지는 지시서 네 곳에 통째로 실리므로 이 값이 곧 지시서 네 벌의 증가분이다).
const MAX_LINES = 70;
const MAX_BYTES = 10240;

// 출처 표식 — 파일 이름은 경로 구분자 없는 basename만 받는다.
const SOURCE_RE = /\[([^\s\[\]\/\\]+\.md) § ([^\[\]]+?)\]/g;
const SOURCE_AT_END_RE = /\[[^\s\[\]\/\\]+\.md § [^\[\]]+?\]\s*$/; // 줄이 출처 표식으로 끝나는가

// ── 인자 ────────────────────────────────────────────────────────────────────
const usageErrors = [];
let rootArg = null;
let canonicalOnly = false;
for (const a of process.argv.slice(2)) {
  if (a === '--canonical-only') canonicalOnly = true;
  else if (a.startsWith('--root=')) {
    const v = a.slice('--root='.length);
    if (!v) usageErrors.push('`--root=`에 값이 없다.');
    else rootArg = v;
  } else usageErrors.push(`모르는 인자: \`${a}\``);
}
if (usageErrors.length) {
  console.error('check-conventions-note — 사용법 안내 (아무것도 측정하지 않았다 · 판정이 아니다)');
  for (const u of usageErrors) console.error('  · ' + u);
  console.error('');
  console.error('  node check-conventions-note.mjs [--root=<dir>] [--canonical-only]');
  console.error('');
  console.error('  exit 0 = 통과 · exit 1 = 위반 · exit 2 = 이 화면');
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = rootArg === null ? path.resolve(HERE, '..', '..') : path.resolve(rootArg);
const abs = (rel) => path.join(ROOT, ...rel.split('/'));

const fail = [];
const v = (file, line, why) => fail.push(line ? `${file}:${line} — ${why}` : `${file} — ${why}`);

/** 표식 쌍을 찾아 본문을 꺼낸다. 실패하면 위반을 기록하고 null. */
function extract(rel) {
  if (!fs.existsSync(abs(rel))) {
    v(rel, 0, '파일이 없다. 개명·이동됐으면 이 게이트 머리의 목록을 함께 고칠 것.');
    return null;
  }
  const text = fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;
  const all = (needle) => {
    const out = [];
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) out.push(i);
    return out;
  };
  const b = all(BEGIN);
  const e = all(END);
  if (!b.length && !e.length) {
    v(rel, 0, `표식 부재 — \`${BEGIN}\` · \`${END}\` 쌍이 없다.`);
    return null;
  }
  if (b.length > 1 || e.length > 1) {
    const at = [...b, ...e].sort((x, y) => x - y).map(lineOf).join(', ');
    v(rel, 0, `표식 중복 — begin ${b.length}개 · end ${e.length}개 (줄 ${at}). 쌍은 정확히 하나여야 한다.`);
    return null;
  }
  if (!b.length || !e.length || b[0] > e[0]) {
    const which = !b.length ? 'begin 없이 end만' : !e.length ? 'end 없이 begin만' : 'end가 begin보다 앞에';
    v(rel, lineOf((b[0] ?? e[0])), `표식 짝 안 맞음 — ${which} 있다.`);
    return null;
  }
  const body = text.slice(b[0] + BEGIN.length, e[0]);
  return { rel, body, beginLine: lineOf(b[0]) };
}

/** 본문 → [{no, text}] 내용 줄. 표식 줄의 나머지(첫 원소)·end 앞 빈 조각(끝 원소)은 뺀다. */
function contentLines(note) {
  const parts = note.body.split('\n');
  const lines = parts.map((text, i) => ({ no: note.beginLine + i, text }));
  if (lines.length && lines[0].text.trim() === '') lines.shift();
  if (lines.length && lines[lines.length - 1].text.trim() === '') lines.pop();
  return lines;
}

const headingCache = new Map();
/** conventions/<name>의 `## ` 장 이름 집합 (fenced code 밖). 파일이 없으면 null. */
function headingsOf(name) {
  if (headingCache.has(name)) return headingCache.get(name);
  const p = abs(`${CONVENTIONS_DIR}/${name}`);
  let set = null;
  if (fs.existsSync(p)) {
    set = new Set();
    let fence = false;
    for (const line of fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      else if (!fence && line.startsWith('## ')) set.add(line.slice(3).trim());
    }
  }
  headingCache.set(name, set);
  return set;
}

/** ② 형식 계약 + ③ 크기 상한. */
function checkFormatAndSize(note) {
  const lines = contentLines(note);
  for (const { no, text } of lines) {
    if (!text.startsWith('- ')) continue; // 면제 줄 (빈 줄 · 소제목 · 굵은 소제목 · 탈출구 평문)
    if (!SOURCE_AT_END_RE.test(text)) {
      v(note.rel, no, '규칙 줄 끝에 출처 표식 `[<파일이름>.md § <장 이름>]`이 없다.');
      continue;
    }
    for (const [, file, section] of text.matchAll(SOURCE_RE)) {
      const heads = headingsOf(file);
      if (heads === null) {
        v(note.rel, no, `출처 파일 \`${CONVENTIONS_DIR}/${file}\`이 없다 (conventions/에서만 찾는다).`);
      } else if (!heads.has(section.trim())) {
        v(note.rel, no, `출처 \`${file}\`에 \`## ${section.trim()}\` 장이 없다.`);
      }
    }
  }
  const n = lines.length;
  const bytes = Buffer.byteLength(note.body, 'utf8');
  if (n > MAX_LINES) v(note.rel, note.beginLine, `쪽지 본문 ${n}줄 — 상한 ${MAX_LINES}줄 초과.`);
  if (bytes > MAX_BYTES) v(note.rel, note.beginLine, `쪽지 본문 ${bytes}바이트 — 상한 ${MAX_BYTES}바이트 초과.`);
  return { n, bytes };
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const canon = extract(CANONICAL);
const size = canon ? checkFormatAndSize(canon) : null;

let copiesChecked = 0;
if (!canonicalOnly) {
  for (const rel of COPIES) {
    const copy = extract(rel);
    if (!copy) continue;
    copiesChecked += 1;
    if (!canon || copy.body === canon.body) continue;
    // ① 불일치 — 첫 갈림 줄을 사본 파일 줄 번호로 짚는다.
    const a = canon.body.split('\n');
    const c = copy.body.split('\n');
    let i = 0;
    while (i < a.length && i < c.length && a[i] === c[i]) i += 1;
    v(
      rel,
      copy.beginLine + i,
      `정본(${CANONICAL})과 다르다 — 정본 ${JSON.stringify(a[i] ?? '(끝)')} / 사본 ${JSON.stringify(c[i] ?? '(끝)')}. ` +
        '사본은 고치지 말고 정본 표식 사이를 그대로 다시 옮길 것.',
    );
    checkFormatAndSize(copy);
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log(`스캔 루트 : ${ROOT}`);
console.log(`정본      : ${CANONICAL}${size ? ` (${size.n}줄 / 상한 ${MAX_LINES} · ${size.bytes}바이트 / 상한 ${MAX_BYTES})` : ''}`);
console.log(canonicalOnly ? '사본 대조 : 건너뜀 (--canonical-only)' : `사본 대조 : ${copiesChecked}/${COPIES.length} 표식 확인`);

if (fail.length) {
  console.log(`\n❌ 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 쪽지 동기화 게이트 통과 — 정본·사본 일치 · 출처 실재 · 상한 이내');
