#!/usr/bin/env node
// 판L T2 — 적재량 계측 (spec E-2). 재실행 가능한 측정 스크립트. 레포 의존성 0 (node 내장 + git만).
//
// 출처: 판J `docs/reference/audits/2026-11-05-harness-necessity-review-data/20-measure-tokens.mjs`
//   에서 아래만 옮겼다(복사 후 축소 — 판J 파일은 건드리지 않는다).
//     - 측정 도우미(B · readText의 CRLF→LF 정규화 · ÷4 반올림)
//     - parseFrontmatter (frontmatter 제외에 쓰는 부분)
//     - §3 「절차 호출 적재」의 TRACING RULE 구현 — NAV_RE · SEL_CUE · INDEX_RE · expandBraces · isParametric ·
//       extractRefs · hopSet (선택군 판정 포함, 줄 단위로 같음)
//     - measureProcedures 가운데 create-program 행과 「ask-consultant + sap-fi-consultant」의 personaHopFiles
//       (`already` 필터) 계산
//   뺀 것: MCP 도구 표면(번들 기동) · 제품 세션 고정 · 공방 세션 고정 · 훅 · powerup 대조 · 소유자 프로젝트 ·
//     토크나이저(토큰은 바이트÷4만) · 2-hop · 다른 절차 4종의 행.
//   바꾼 것: 파일을 작업 트리가 아니라 `git show <ref>:<path>`로 읽고, 존재 확인은 `git ls-tree -r --name-only <ref>`
//     목록으로 한다. 판J는 Windows 작업 트리에서 fs.existsSync로 쟀으므로 **대소문자를 가리지 않고** 파일을 찾았다
//     (예: `../personas/INDEX.md` → 실제 `index.md`). 같은 수치를 내도록 존재 확인 · 읽기는 대소문자 무시로 흉내 내고,
//     식별 키는 판J처럼 링크에 적힌 대소문자를 그대로 쓴다. 그렇게 맞춰진 참조는 출력의 「대소문자 접힘」 목록에 남긴다.
//
// TRACING RULE (판J 그대로 — 결과를 다시 내려면 이 규칙으로):
//   R1  마크다운 링크 `[..](<상대경로>.md[#앵커])` — 참조하는 파일 위치 기준으로 해석.
//   R2  백틱 경로 `` `<경로>.md` `` — 참조하는 파일 위치 기준 · `PLUGIN_ROOT/`·`${CLAUDE_PLUGIN_ROOT}/`는 interactive/ 기준.
//       중괄호 열거 `{a,b}.md`는 전개. `{MODULE}`·`<key>`·`<iso>`·`*` 같은 자리표시는 「매개(parametric)」로 두고 합계에 넣지 않는다.
//   포함 조건  해석된 파일이 실존하고 `interactive/core/**` 아래이며 자기 자신이 아닐 것.
//   제외       frontmatter · 펜스 코드 블록(```) 안 · 「길 안내」 절(Related* · See also · Use When · Do Not Use When ·
//              When to Use · When NOT to Use)의 링크.
//   선택군     같은 줄 또는 같은 표 안에 같은 디렉터리의 core 파일이 3개 이상이고, 그 줄(표면 표 바로 앞 소개 줄)에 선택 단서
//   (one-of-N) (e.g. · matching · selected · pick · choose)가 있으면 선택군 — **가장 큰 원소 1개**만 「환산」에 넣고 나머지는
//              「선택군 대안」. README.md · INDEX.md는 선택군 원소가 아니다.
//   비-core / unresolved — 합계 밖, 열거만.
//
// 칸 정의 (spec E-2 · 판J 「환산」 기준):
//   상담 적재  = `sap-fi-consultant`의 1-hop 합(환산). 역할 문서 본문은 빼고, `ask-consultant` 절차 본문과 그 1-hop(환산)에
//                이미 든 파일도 뺀다(판J personaHopFiles의 already 필터). 판J 대조값 22,957(÷4).
//   규약분     = `create-program` 「본문 + 1-hop(환산)」 안의 쪽지 대체 7파일 + `alv-rules.md`의 환산 바이트 합
//                + `create-program` 본문 속 쪽지 바이트(표식 사이 · LF 정규화 · 표식이 없으면 0).
//                다른 1-hop 파일 속 쪽지 사본은 규약분에 넣지 않는다(「전체」에만 잡힌다).
//   전체       = `create-program` 「절차 본문 + 1-hop 환산」(판J 「절차+1-hop 환산」 열). 참고로 판J 판정 칸
//                「total 환산」(+ 래퍼 SKILL.md + project-context.md)도 함께 찍는다 — 판J 대조값 157,482(÷4).
//   탈출 포인터 열 = `create-program` 1-hop(환산) 가운데, 그 파일을 가리키는 모든 줄이 탈출 단서(ESC_CUE — 「필요하면 · 쪽지에
//                없으면 · 원본을 보라」 류)를 담은 파일. 이 판에서 새로 둔 기계 정의다(판J는 산문으로만 셌다 — L3-c).
//                「전체」에는 그대로 들어 있고(판J 정의), 따로 보인다.
//   토큰       = 바이트 ÷ 4 반올림. 바이트는 UTF-8 · CRLF→LF 정규화 후.
//
// 선 (spec E-2 — `--before`를 줄 때만 판정):
//   ① 상담 적재 ≤ 6,000 토큰  ③ 전체 < 변경 전 전체  규약분 감소율은 병기만(선 없음 · 환산 바이트).
//   ② 쪽지 대체 7파일이 create-program 1-hop에서 모두 빠졌을 것 — 환산 바이트가 아니라 **존재**로 판정한다(코디네이터 판정
//      2026-11-09). create-program 본문(frontmatter · 펜스 밖)의 R1 · R2 참조 전수 — 선택군 대안 · 길 안내 절 포함 — 에
//      7파일 중 하나라도 남으면 실패이고, 그 파일과 가리킨 줄 번호를 찍는다. 그 파일을 가리키는 줄이 모두 탈출 단서를 담으면
//      「실패가 아니라 탈출 포인터 — 별도 표기」로 분류한다(spec C-4). 존재 줄은 변경 전 실행에서도 찍는다(판정 없음 표기).
//
// 사용 (레포 루트에서):
//   node docs/reference/audits/2026-11-09-note-and-trim-data/L-20-measure-load.mjs --ref=<git ref> \
//        [--out=<결과 텍스트>] [--json=<결과 json>] [--before=<변경 전 결과 json>] [--panj-ref=<판J 측정 커밋>]
//   --panj-ref를 주면 그 커밋을 같은 규칙으로 먼저 재고 「판J 대조」 절(판J 20-tokens.txt 인용값 · 판J 커밋 재측정값 ·
//   이 ref 값 · 그 사이 추적 파일을 바꾼 커밋의 git log)을 끝에 붙인다. 판J 측정 커밋 = a0405bc0(판J T2 토큰 실측 커밋).
//   변경 전:  --ref=bc57d89a --panj-ref=a0405bc0 --out=…/L-20-load-before.txt --json=…/L-20-load-before.json
//   변경 후:  --ref=HEAD --out=…/L-20-load-after.txt --json=…/L-20-load-after.json --before=…/L-20-load-before.json
//   작업 트리를 읽지도 바꾸지도 않는다(산출 파일만 쓴다). 같은 ref면 두 번 돌려도 바이트 동일(시각을 찍지 않는다).
//
// 안전: SAP 접속 0 (P0). git 읽기 명령(rev-parse · ls-tree · show · log · diff)만 부른다.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ── 인자 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const REF = argOf('ref', '');
const OUT = argOf('out', '');
const JSON_OUT = argOf('json', '');
const BEFORE = argOf('before', '');
const PANJ_REF = argOf('panj-ref', '');
if (!REF) {
  console.error('--ref=<git ref>가 필요하다');
  process.exit(2);
}

// ── git 읽기 ────────────────────────────────────────────────────────────────
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`git ${args.join(' ')} 실패: ${r.stderr}`);
    process.exit(2);
  }
  return r.stdout;
}
// 측정 문맥 — 커밋 하나에 대한 파일 목록 · 읽기 캐시. `--panj-ref`를 주면 두 커밋을 차례로 잰다.
let CTX = null;
function openCtx(ref) {
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const lower = new Map(); // 소문자 경로 → 실제 경로 (판J의 Windows 대소문자 무시 존재 확인 흉내)
  for (const f of git(['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean)) lower.set(f.toLowerCase(), f);
  CTX = { ref, commit, lower, textCache: new Map(), caseFolded: new Map() };
  return CTX;
}
// 존재 확인(대소문자 무시). 키(링크에 적힌 대소문자)와 실제 경로가 다르면 caseFolded에 남긴다.
function actualOf(p) {
  const actual = CTX.lower.get(p.toLowerCase()) ?? null;
  if (actual && actual !== p) CTX.caseFolded.set(p, actual);
  return actual;
}
function readText(p) {
  const actual = actualOf(p);
  if (!actual) throw new Error(`부재: ${p}`);
  if (!CTX.textCache.has(actual)) CTX.textCache.set(actual, git(['show', `${CTX.commit}:${actual}`]).replace(/\r\n/g, '\n'));
  return CTX.textCache.get(actual);
}

// ── 측정 도우미 (판J) ───────────────────────────────────────────────────────
const B = (s) => Buffer.byteLength(s, 'utf8');
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n));
const div4 = (bytes) => Math.round(bytes / 4);
const measureFile = (p) => {
  const bytes = B(readText(p));
  return { file: p, bytes, div4: div4(bytes) };
};
const sumB = (ms) => ms.reduce((a, m) => a + m.bytes, 0);
const cellB = (bytes) => `${fmt(bytes)} B · ÷4 ${fmt(div4(bytes))}`;

const CORE = 'interactive/core';
const INTERACTIVE = 'interactive';

// ── frontmatter (판J parseFrontmatter에서 body 분리만) ───────────────────────
function bodyOf(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return text;
  return text.slice(end + 5);
}

// ── TRACING RULE 구현 (판J extractRefs · hopSet — 파일 접근만 git으로) ────────
const NAV_RE = /^(related|see also|use when|do not use when|when to use|when not to use)/i;
const SEL_CUE = /e\.g\.|\b(matching|selected|pick|choose)\b/i; // "e.g.,"는 \b가 안 걸린다(.와 , 사이) — 앞에 둔다
const INDEX_RE = /^(README|INDEX)\.md$/i;
// 판L 신설 — 탈출 포인터 단서(「필요하면 원본을 보라」 류). 영어(제품 core는 영어)와 한국어 둘 다.
const ESC_CUE =
  /\b(if needed|if necessary|when needed|as needed|only if|when in doubt|escape hatch|not covered|outside (?:the|this) note|beyond (?:the|this) note|edge cases?|special (?:case|situation)s?|full (?:rules?|text|details?|matrix|source)|for details|original (?:file|source|rule)s?)\b|필요하면|필요할 때|쪽지에 없|원본/i;

function expandBraces(s) {
  const m = /\{([^{}]*,[^{}]*)\}/.exec(s);
  if (!m) return [s];
  return m[1].split(',').flatMap((alt) => expandBraces(s.slice(0, m.index) + alt.trim() + s.slice(m.index + m[0].length)));
}
const isParametric = (s) => /\{[A-Za-z_]+\}|<[^>]+>|\*/.test(s);

// path.resolve(dir, target)의 레포 상대 판. 레포 밖이나 절대 경로는 null(= unresolved).
function resolveRel(dir, target) {
  if (/^([A-Za-z]:|\/|\\)/.test(target)) return null;
  const p = path.posix.normalize(path.posix.join(dir, target.replace(/\\/g, '/')));
  if (p.startsWith('../') || p === '..') return null;
  return p;
}

function extractRefs(filePath) {
  const text = readText(filePath);
  const body = bodyOf(text);
  // line은 판J처럼 본문(frontmatter 뒤) 기준 · fileLine은 파일 기준(존재 판정 · 탈출 포인터 출력용)
  const fmOffset = text.split('\n').length - body.split('\n').length;
  const dir = path.posix.dirname(filePath);
  const found = [];
  let inFence = false;
  let heading = '';
  let tableId = 0;
  let inTable = false;
  let tableIntro = '';
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) { heading = h[1].trim(); inTable = false; return; }
    const isTableRow = /^\s*\|/.test(line);
    if (isTableRow && !inTable) {
      inTable = true;
      tableId += 1;
      tableIntro = '';
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) if (lines[k].trim()) { tableIntro = lines[k].trim(); break; }
    } else if (!isTableRow) inTable = false;
    const nav = NAV_RE.test(heading);
    const raws = [];
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g)) raws.push({ raw: m[1], rule: 'R1' });
    for (const m of line.matchAll(/`([^`\n]*?\.md)`/g)) raws.push({ raw: m[1], rule: 'R2' });
    const group = isTableRow ? `table#${tableId}` : `line#${i + 1}`;
    const cueText = isTableRow ? tableIntro : line;
    const cue = SEL_CUE.test(cueText);
    const esc = ESC_CUE.test(line);
    for (const { raw, rule } of raws) {
      if (isParametric(raw)) { found.push({ raw, rule, cls: 'parametric', nav, line: i + 1, heading, group, cue, esc }); continue; }
      for (const one of expandBraces(raw)) {
        const target = one.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, 'PLUGIN_ROOT/');
        const resolved = target.startsWith('PLUGIN_ROOT/')
          ? resolveRel(INTERACTIVE, target.slice('PLUGIN_ROOT/'.length))
          : resolveRel(dir, target);
        if (resolved === filePath) continue;
        let cls;
        if (!resolved || !actualOf(resolved)) cls = 'unresolved';
        else if (!resolved.startsWith(CORE + '/')) cls = 'non-core';
        else cls = 'core';
        found.push({ raw: one, rule, cls, nav, line: i + 1, fileLine: i + 1 + fmOffset, heading, group, cue, esc, cueText: cueText.slice(0, 90), resolved: cls === 'unresolved' ? null : resolved });
      }
    }
  });
  const groups = new Map();
  for (const f of found) {
    if (f.cls !== 'core' || f.nav || !f.cue || INDEX_RE.test(path.posix.basename(f.resolved))) continue;
    const key = `${f.group}|${path.posix.dirname(f.resolved)}`;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(f.resolved, f);
  }
  const selections = [];
  for (const [key, members] of groups) {
    if (members.size < 3) continue;
    // 판J는 절대 경로 문자열로 localeCompare 했다 — 공통 접두어가 같으므로 레포 상대 경로로도 순서가 같다
    const sized = [...members.keys()].map((p) => ({ p, bytes: B(readText(p)) })).sort((a, b) => b.bytes - a.bytes || a.p.localeCompare(b.p));
    const rep = sized[0].p;
    for (const f of found) if (f.cls === 'core' && members.has(f.resolved) && f.resolved !== rep) f.selAlt = true;
    const any = members.values().next().value;
    selections.push({ group: key.split('|')[0], line: any.line, cueText: any.cueText, representative: rep, members: sized.map((s) => `${path.posix.basename(s.p)} ${s.bytes}`) });
  }
  return Object.assign(found, { selections });
}

function hopSet(found, collapse = true) {
  const set = new Map();
  for (const f of found) if (f.cls === 'core' && !f.nav && !(collapse && f.selAlt)) set.set(f.resolved, f);
  return set;
}
// 판J는 Map 키(절대 경로)를 .sort()로 정렬했다(코드 단위 순). 레포 상대 경로에서도 같은 순서다.
const sortedKeys = (m) => [...m.keys()].sort();

// ── 측정 ────────────────────────────────────────────────────────────────────
const NOTE_BEGIN = '<!-- sapkit:conventions-note:begin -->';
const NOTE_END = '<!-- sapkit:conventions-note:end -->';
const CONV = `${CORE}/knowledge/abap/conventions`;
const NOTE_REPLACED = ['clean-code.md', 'clean-code-oop.md', 'clean-code-procedural.md', 'naming-conventions.md', 'constant-rule.md', 'text-element-rule.md', 'procedural-form-naming.md'].map((f) => `${CONV}/${f}`);
const ALV = `${CONV}/alv-rules.md`;
const CONVENTION_SET = [...NOTE_REPLACED, ALV];

function noteBytesOf(text) {
  const b = text.indexOf(NOTE_BEGIN);
  if (b < 0) return { present: false, bytes: 0, count: 0 };
  const e = text.indexOf(NOTE_END, b + NOTE_BEGIN.length);
  if (e < 0) return { present: false, bytes: 0, count: 0, malformed: 'begin 표식만 있고 end 표식이 없다' };
  const count = text.split(NOTE_BEGIN).length - 1;
  return { present: true, bytes: B(text.slice(b + NOTE_BEGIN.length, e)), count };
}

function measureCreateProgram() {
  const procPath = `${CORE}/procedures/create-program.md`;
  const wrapperPath = `${INTERACTIVE}/skills/create-program/SKILL.md`;
  const pcPath = `${CORE}/project-context.md`;
  const found = extractRefs(procPath);
  const hop1 = hopSet(found, true);
  const hop1All = hopSet(found, false);
  const hop1Files = sortedKeys(hop1).map(measureFile);
  const selAlts = sortedKeys(hop1All).filter((p) => !hop1.has(p)).map(measureFile);
  const procedure = measureFile(procPath);
  const wrapper = actualOf(wrapperPath) ? measureFile(wrapperPath) : { file: wrapperPath, bytes: 0, div4: 0, missing: true };
  const projectContext = measureFile(pcPath);

  // 규약분
  const note = noteBytesOf(readText(procPath));
  const conv = CONVENTION_SET.map((p) => {
    const inHop1 = hop1.has(p);
    const inAll = hop1All.has(p);
    const bytes = inHop1 ? measureFile(p).bytes : 0;
    return { file: p, replacedByNote: p !== ALV, status: inHop1 ? '1-hop 환산' : inAll ? '선택군 대안(환산 0)' : '1-hop 밖', bytes };
  });
  const convFilesBytes = sumB(conv);
  const conventionBytes = convFilesBytes + note.bytes;
  const replacedInHop1 = conv.filter((c) => c.replacedByNote && c.status === '1-hop 환산');

  // 탈출 포인터 — 1-hop(환산) 파일 가운데 그 파일을 가리키는 (길 안내 밖) 모든 줄이 탈출 단서를 담은 것
  const escape = [];
  for (const p of hop1.keys()) {
    const refs = found.filter((f) => f.cls === 'core' && !f.nav && f.resolved === p);
    if (refs.length && refs.every((f) => f.esc)) escape.push({ ...measureFile(p), lines: [...new Set(refs.map((f) => f.fileLine))].sort((a, b) => a - b) });
  }
  escape.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const escapeReplacedBytes = sumB(escape.filter((e) => NOTE_REPLACED.includes(e.file)));

  // 선 ② 존재 판정 — 쪽지 대체 7파일을 가리키는 참조가 create-program 본문(frontmatter · 펜스 밖) 어디든 남았는가.
  // 환산이 아니라 전수(선택군 대안 포함)이고, 길 안내 절 링크도 센다. 그 파일을 가리키는 줄이 모두 탈출 단서를 담으면
  // 「실패가 아니라 탈출 포인터」로 따로 분류한다(spec C-4).
  const presence = NOTE_REPLACED.map((p) => {
    const refs = found.filter((f) => f.cls === 'core' && f.resolved === p);
    if (!refs.length) return null;
    const lines = [...new Set(refs.map((f) => f.fileLine))].sort((a, b) => a - b);
    const kind = refs.every((f) => f.esc) ? 'escape' : 'fail';
    const where = [...new Set(refs.map((f) => (f.nav ? '길 안내 절' : f.selAlt ? '선택군 대안' : '1-hop 환산')))].sort();
    return { file: p, kind, lines, where };
  }).filter(Boolean);
  const presenceFail = presence.filter((x) => x.kind === 'fail');
  const presenceEscape = presence.filter((x) => x.kind === 'escape');

  const procPlusHop1 = procedure.bytes + sumB(hop1Files);
  const total = wrapper.bytes + projectContext.bytes + procPlusHop1;
  return {
    procedure, wrapper, projectContext, hop1Files, selAlts, selections: found.selections,
    nonCore: [...new Set(found.filter((f) => f.cls === 'non-core').map((f) => f.resolved))].sort(),
    unresolved: [...new Set(found.filter((f) => f.cls === 'unresolved').map((f) => f.raw))].sort(),
    parametric: [...new Set(found.filter((f) => f.cls === 'parametric').map((f) => f.raw))].sort(),
    navExcluded: [...new Set(found.filter((f) => f.cls === 'core' && f.nav).map((f) => f.resolved))].sort(),
    note, conv, convFilesBytes, conventionBytes,
    replacedInHop1Bytes: sumB(replacedInHop1), replacedInHop1Files: replacedInHop1.map((c) => c.file),
    escape, escapeBytes: sumB(escape), escapeReplacedBytes,
    presence, presenceFail, presenceEscape,
    hop1Bytes: sumB(hop1Files), procPlusHop1, total,
  };
}

function measureConsult() {
  const acPath = `${CORE}/procedures/ask-consultant.md`;
  const acHop1 = hopSet(extractRefs(acPath), true);
  const personaPath = `${CORE}/personas/sap-fi-consultant.md`;
  const pFound = extractRefs(personaPath);
  const pHop = hopSet(pFound, true);
  const already = new Set([acPath, ...acHop1.keys()]);
  const files = sortedKeys(pHop).filter((p) => !already.has(p)).map(measureFile);
  const excludedAlready = sortedKeys(pHop).filter((p) => already.has(p));
  return {
    persona: measureFile(personaPath),
    files,
    bytes: sumB(files),
    excludedAlready,
    selections: pFound.selections,
    parametric: [...new Set(pFound.filter((f) => f.cls === 'parametric').map((f) => f.raw))].sort(),
    unresolved: [...new Set(pFound.filter((f) => f.cls === 'unresolved').map((f) => f.raw))].sort(),
    askConsultantHop1Count: acHop1.size,
  };
}

// 판J 20-tokens.txt가 찍은 값(같은 칸) — 「판J 대조」 절의 기준. 출처: 그 파일 3절 표 create-program 행 · 그 아래
// 「ask-consultant + sap-fi-consultant」 줄.
const PANJ_CITED = {
  consult: { bytes: 91829, tokens: 22957 },
  total: { bytes: 618534, tokens: 154634 }, // 「절차+1-hop 환산」 열
  totalWithWrapper: { bytes: 629929, tokens: 157482 }, // 「total 환산 (판정 칸)」 열
};

// --panj-ref: 판J가 잰 커밋을 같은 스크립트로 먼저 재고, 거기서 REF까지 추적 파일이 바뀐 커밋을 git log로 찾는다.
let panj = null;
if (PANJ_REF) {
  openCtx(PANJ_REF);
  const pcp = measureCreateProgram();
  const pcs = measureConsult();
  panj = { ref: PANJ_REF, commit: CTX.commit, consult: pcs.bytes, total: pcp.procPlusHop1, totalWithWrapper: pcp.total, files: new Set(CTX.textCache.keys()) };
}

openCtx(REF);
const COMMIT = CTX.commit;
const cp = measureCreateProgram();
const cs = measureConsult();

if (panj) {
  const traced = [...new Set([...panj.files, ...CTX.textCache.keys()])].sort();
  const log = git(['log', '--format=%h %s', `${panj.commit}..${COMMIT}`, '--', ...traced]).trim();
  const stat = git(['diff', '--stat=200', panj.commit, COMMIT, '--', ...traced]).trim();
  panj.tracedCount = traced.length;
  panj.log = log ? log.split('\n') : [];
  panj.stat = stat ? stat.split('\n') : [];
  delete panj.files;
}

// ── 선 판정 (변경 후 실행 — --before가 있을 때만) ────────────────────────────
let before = null;
if (BEFORE) before = JSON.parse(fs.readFileSync(BEFORE, 'utf8'));
const verdict = before
  ? {
      consult: { line: '상담 적재 ≤ 6,000 토큰', value: div4(cs.bytes), pass: div4(cs.bytes) <= 6000 },
      replaced: {
        line: '쪽지 대체 7파일이 create-program 1-hop 전수에서 모두 빠졌을 것(존재 판정)',
        failFiles: cp.presenceFail,
        escapeFiles: cp.presenceEscape,
        pass: cp.presenceFail.length === 0,
      },
      total: { line: '전체 < 변경 전 전체', value: cp.procPlusHop1, before: before.cells.total.bytes, pass: cp.procPlusHop1 < before.cells.total.bytes },
      conventionReduction: {
        line: '규약분 감소율(병기만 · 선 없음)',
        before: before.cells.convention.bytes,
        after: cp.conventionBytes,
        pct: before.cells.convention.bytes ? Math.round((1 - cp.conventionBytes / before.cells.convention.bytes) * 1000) / 10 : null,
      },
    }
  : null;

// ── json ────────────────────────────────────────────────────────────────────
const result = {
  tool: 'L-20-measure-load.mjs',
  ref: REF,
  commit: COMMIT,
  unit: 'bytes = UTF-8 after CRLF→LF · tokens = round(bytes/4)',
  cells: {
    consult: { bytes: cs.bytes, tokens: div4(cs.bytes), files: cs.files.map(({ file, bytes }) => ({ file, bytes })) },
    convention: {
      bytes: cp.conventionBytes,
      tokens: div4(cp.conventionBytes),
      filesBytes: cp.convFilesBytes,
      noteBytes: cp.note.bytes,
      notePresent: cp.note.present,
      breakdown: cp.conv,
    },
    total: { bytes: cp.procPlusHop1, tokens: div4(cp.procPlusHop1), procedureBytes: cp.procedure.bytes, hop1Bytes: cp.hop1Bytes, hop1Count: cp.hop1Files.length },
    escape: { bytes: cp.escapeBytes, tokens: div4(cp.escapeBytes), files: cp.escape.map(({ file, bytes, lines }) => ({ file, bytes, lines })) },
  },
  reference: {
    createProgramTotalWithWrapper: { bytes: cp.total, tokens: div4(cp.total), wrapperBytes: cp.wrapper.bytes, projectContextBytes: cp.projectContext.bytes },
    replacedInHop1: { bytes: cp.replacedInHop1Bytes, files: cp.replacedInHop1Files },
  },
  presence: { remaining: cp.presenceFail, escapeOnly: cp.presenceEscape },
  verdict,
};

// ── 텍스트 ──────────────────────────────────────────────────────────────────
const L = [];
const H = (t) => { L.push(''); L.push(t); L.push('-'.repeat(78)); };
L.push('판L T2 — 적재량 계측 (spec E-2)');
L.push('='.repeat(78));
L.push(`ref: ${REF} · commit ${COMMIT}`);
L.push('읽기: git show <commit>:<path> · 존재 확인: git ls-tree -r (대소문자 무시 — 판J 흉내) · 작업 트리 무접촉');
L.push('바이트 = UTF-8 · CRLF→LF 정규화 후 · ÷4 = 반올림 토큰 · 「환산」 = 선택군은 가장 큰 원소 1개');
L.push('TRACING RULE · 칸 정의: 스크립트 머리 주석 (판J 20-measure-tokens.mjs §3에서 복사)');

H('1. 세 칸 + 탈출 포인터 열');
L.push(`상담 적재   ${cellB(cs.bytes)}   (sap-fi-consultant 1-hop ${cs.files.length}파일 · 역할 문서 본문과 ask-consultant 쪽 중복 제외)`);
L.push(`규약분      ${cellB(cp.conventionBytes)}   (8파일 환산 ${fmt(cp.convFilesBytes)} B + 본문 속 쪽지 ${fmt(cp.note.bytes)} B)`);
L.push(`전체        ${cellB(cp.procPlusHop1)}   (create-program 절차 본문 ${fmt(cp.procedure.bytes)} B + 1-hop 환산 ${cp.hop1Files.length}파일 ${fmt(cp.hop1Bytes)} B)`);
L.push(`탈출 포인터 ${cellB(cp.escapeBytes)}   (${cp.escape.length}파일 · 「전체」에 포함된 채로 따로 보임)`);
L.push(`참고 — 판J 판정 칸 「total 환산」(래퍼 ${fmt(cp.wrapper.bytes)} B + project-context ${fmt(cp.projectContext.bytes)} B + 전체): ${cellB(cp.total)}`);

H('2. 선 판정');
const presItem = (x) => `${path.posix.basename(x.file)}(줄 ${x.lines.join(', ')} · ${x.where.join('/')})`;
const presenceLine =
  `② 쪽지 대체 7파일 존재(create-program 1-hop 전수 · 선택군 대안 · 길 안내 절 포함 · 줄 = 파일 기준): 남음 ${cp.presenceFail.length}파일` +
  `${cp.presenceFail.length ? ` — ${cp.presenceFail.map(presItem).join(' · ')}` : ''}` +
  ` · 탈출 포인터(실패 아님 · 별도 표기) ${cp.presenceEscape.length}파일${cp.presenceEscape.length ? ` — ${cp.presenceEscape.map(presItem).join(' · ')}` : ''}`;
if (!verdict) {
  L.push('변경 전 — 판정 없음 (--before 미지정)');
  L.push(`${presenceLine} (변경 전 — 판정 없음)`);
} else {
  L.push(`① ${verdict.consult.line}: ${fmt(verdict.consult.value)} → ${verdict.consult.pass ? '통과' : '미달'}`);
  L.push(`${presenceLine} → ${verdict.replaced.pass ? '통과' : '미달'}`);
  L.push(`③ ${verdict.total.line}: ${fmt(verdict.total.value)} B vs 변경 전 ${fmt(verdict.total.before)} B → ${verdict.total.pass ? '통과' : '미달'}`);
  L.push(`   ${verdict.conventionReduction.line}: ${fmt(verdict.conventionReduction.before)} B → ${fmt(verdict.conventionReduction.after)} B · 감소율 ${verdict.conventionReduction.pct}%`);
}

H('3. 규약분 내역 (create-program 1-hop 기준)');
for (const c of cp.conv) L.push(`${String(fmt(c.bytes)).padStart(10)}  ${c.file}  — ${c.status}${c.replacedByNote ? ' · 쪽지 대체' : ' · 조건부로 남김'}`);
L.push(`${String(fmt(cp.note.bytes)).padStart(10)}  create-program.md 본문 속 쪽지 (표식 ${cp.note.present ? `있음 · ${cp.note.count}벌` : '없음'}${cp.note.malformed ? ` · ${cp.note.malformed}` : ''})`);
L.push(`쪽지 대체 7파일 가운데 1-hop 환산에 든 것: ${cp.replacedInHop1Files.length}파일 ${fmt(cp.replacedInHop1Bytes)} B${cp.replacedInHop1Files.length ? ` — ${cp.replacedInHop1Files.map((f) => path.posix.basename(f)).join(' · ')}` : ''}`);

H(`4. create-program 1-hop 환산 ${cp.hop1Files.length}파일 (바이트)`);
for (const f of cp.hop1Files) L.push(`${String(fmt(f.bytes)).padStart(10)}  ${f.file}`);
L.push(`${String(fmt(cp.procedure.bytes)).padStart(10)}  ${cp.procedure.file}  (절차 본문)`);
for (const s of cp.selections) L.push(`  선택군 ${s.group} (줄 ${s.line} · 단서 「${s.cueText}」): 대표 ${s.representative} · 원소 ${s.members.length}: ${s.members.join(', ')}`);
L.push(`  선택군 대안(환산 밖) ${cp.selAlts.length}: ${cp.selAlts.map((f) => `${path.posix.basename(f.file)} ${fmt(f.bytes)}`).join(' · ') || '없음'}`);
L.push(`  길 안내 절이라 제외 ${cp.navExcluded.length}: ${cp.navExcluded.join(' · ') || '없음'}`);
L.push(`  매개(합계 밖) ${cp.parametric.length}: ${cp.parametric.join(' · ') || '없음'}`);
L.push(`  non-core ${cp.nonCore.length}: ${cp.nonCore.join(' · ') || '없음'}`);
L.push(`  unresolved ${cp.unresolved.length}: ${cp.unresolved.join(' · ') || '없음'}`);

H('5. 탈출 포인터 열 (create-program 1-hop 환산 중 가리키는 줄이 모두 탈출 단서를 담은 파일 · 줄 = 파일 기준)');
if (!cp.escape.length) L.push('없음');
for (const e of cp.escape) L.push(`${String(fmt(e.bytes)).padStart(10)}  ${e.file}  (줄 ${e.lines.join(', ')})`);

H(`6. 상담 적재 — sap-fi-consultant 1-hop ${cs.files.length}파일 (바이트)`);
for (const f of cs.files) L.push(`${String(fmt(f.bytes)).padStart(10)}  ${f.file}`);
L.push(`  역할 문서 본문(합계 밖): ${cs.persona.file} ${fmt(cs.persona.bytes)} B`);
L.push(`  ask-consultant 쪽에 이미 들어 제외(already): ${cs.excludedAlready.join(' · ') || '없음'} (ask-consultant 1-hop 환산 ${cs.askConsultantHop1Count}파일 기준)`);
for (const s of cs.selections) L.push(`  선택군 ${s.group} (줄 ${s.line} · 단서 「${s.cueText}」): 대표 ${s.representative} · 원소 ${s.members.join(', ')}`);
L.push(`  매개(합계 밖): ${cs.parametric.join(' · ') || '없음'}`);
L.push(`  unresolved: ${cs.unresolved.join(' · ') || '없음'}`);

H('7. 대소문자 접힘 (판J의 Windows 존재 확인을 흉내 내 맞춘 참조)');
const folded = [...CTX.caseFolded.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
if (!folded.length) L.push('없음');
for (const [k, v] of folded) L.push(`  ${k} → ${v}`);
result.caseFolded = Object.fromEntries(folded);

if (panj) {
  H('8. 판J 대조 (--panj-ref)');
  const row = (name, cited, atPanj, here) =>
    `${name}: 판J 20-tokens.txt ${cellB(cited.bytes)} · 이 스크립트로 판J 커밋 ${cellB(atPanj)} · 이 ref ${cellB(here)} → ` +
    `${cited.bytes === atPanj ? '판J 재현 일치' : `판J 재현 불일치(${fmt(atPanj - cited.bytes)} B)`} · 판J 이후 차이 ${fmt(here - cited.bytes)} B`;
  L.push(`판J 측정 커밋: ${panj.ref} · ${panj.commit}`);
  L.push(row('상담 적재', PANJ_CITED.consult, panj.consult, cs.bytes));
  L.push(row('전체(절차+1-hop 환산)', PANJ_CITED.total, panj.total, cp.procPlusHop1));
  L.push(row('참고 total 환산(+래퍼+project-context)', PANJ_CITED.totalWithWrapper, panj.totalWithWrapper, cp.total));
  L.push(`추적 파일(두 커밋에서 읽은 파일 합집합) ${panj.tracedCount}개 — 판J 커밋..이 ref 사이에 그것을 바꾼 커밋: ${panj.log.length ? '' : '없음'}`);
  for (const l of panj.log) L.push(`  ${l}`);
  for (const l of panj.stat) L.push(`  ${l}`);
  const explained = cs.bytes === PANJ_CITED.consult.bytes && cp.procPlusHop1 === PANJ_CITED.total.bytes && cp.total === PANJ_CITED.totalWithWrapper.bytes;
  L.push(
    explained
      ? '판정: 차이 0 — 판J 값과 바이트 단위로 같다(추적 파일이 판J 이후 바뀌지 않았다).'
      : `판정: 차이 있음 — 위 커밋 목록이 원인 후보다${panj.log.length ? '' : ' (바꾼 커밋이 없는데 차이가 있다 — 설명되지 않는 차이)'}.`,
  );
  result.panj = { cited: PANJ_CITED, ref: panj.ref, commit: panj.commit, atPanjCommit: { consult: panj.consult, total: panj.total, totalWithWrapper: panj.totalWithWrapper }, changingCommits: panj.log, zeroDiff: explained };
}

const text = L.join('\n') + '\n';
if (OUT) fs.writeFileSync(OUT, text);
else process.stdout.write(text);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2) + '\n');
