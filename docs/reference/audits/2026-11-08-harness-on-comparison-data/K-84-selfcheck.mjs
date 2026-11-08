#!/usr/bin/env node
// K-84-selfcheck.mjs — 판K 감사 문서의 자가 대조 (기계 몫 · 판J 84-selfcheck.mjs 승계)
//
// 사용(레포 루트 · PowerShell):
//   node docs/reference/audits/2026-11-08-harness-on-comparison-data/K-84-selfcheck.mjs            자가 대조 ①~⑧ (파일을 고치지 않는다)
//   node …/K-84-selfcheck.mjs --fill              감사 문서의 {{K-83…}} 자리표시를 K-83-results.json 값으로 바꿔 쓴다(그 밖 글자 불변)
//   node …/K-84-selfcheck.mjs --emit-templates    ③이 대조하는 표의 자리표시 판(마크다운)을 찍는다 — 문서 표를 다시 짤 때
//   선택: --json <K-83-results.json 경로> · --doc <감사 문서 경로>   (시험용 — 기본은 이 폴더의 K-83-results.json · 레포의 감사 문서)
// 종료 코드: 0 = 전부 통과 · 1 = 하나라도 실패(--fill 은 풀지 못한 자리표시가 하나라도 있으면 쓰지 않고 1) · 2 = 사용법 오류.
//
// 지키는 것
//   - 내장 모듈만 쓴다(node:fs · node:path · node:os · node:child_process · node:url). 기본 모드는 어떤 파일도 고치지 않는다.
//     파일을 쓰는 것은 --fill 하나이고, 그 대상은 감사 문서 하나 · 바꾸는 글자는 {{K-83…}} 자리표시뿐이다.
//   - 출력은 수 · 판정 · 레포 상대 경로만이다. 금지 문자열은 찾기만 하고 그 글자 자체는 찍지 않는다(이 출력이 K-84-selfcheck.txt 에 붙는다).
//   - 금지 문자열은 이 파일 안에 글자 그대로 두지 않는다 — 실행 중에 조립하거나(웹 주소 머리 · 비추적 작업 폴더 이름), 환경에서
//     읽거나(사용자 이름 · 컴퓨터 이름 · 홈 경로 · 레포 위치), 자료 파일에서 읽는다(판J 00 머리 12 · 14행의 다른 프로젝트 · 프로파일 이름).
//   - ~/.sapkit 은 읽지 않는다 — K-99-namecheck.mjs 의 범주 가운데 sap.env 값 · 프로파일 폴더 이름 둘은 여기서 재지 않는다.
//     그 둘까지 재는 것은 마감 게이트의 K-99 몫이다(감사 문서를 대상에 넣어 돌린다).
//
// 판정 칸을 옮기는 길(판J §2.7 과 같은 처리 — 작성자가 응시 모델이므로)
//   감사 문서의 판정 · 수치 칸은 1부에서 {{K-83…}} 자리표시로만 쓰고, 2부에서 --fill 이 K-83-results.json 에서 기계로 옮긴다.
//   자리표시 꼴(경로 = K-83-results.json 안의 점 경로 · 키에 점이 있으면 가장 긴 키를 먼저 맞춘다 · [필드=값] 은 배열에서 고르기):
//     {{K-83:<경로>}}              값 그대로(수 · 문자열 · 참거짓 → 예/아니오 · 빈 문자열/null → — · 스칼라 배열 → 「 · 」로 잇고 빈 배열 → 없음)
//     {{K-83#:<경로>}}             배열 길이
//     {{K-83%:<경로a>/<경로b>}}    a ÷ b × 100 을 소수 한 자리로
//     {{K-83?:<경로>:<필드>=<값>}} 배열에서 필드가 값과 같은 원소 수
//     {{K-83@:<경로>:<필드 …>}}    배열 원소마다 필드들을 빈칸으로 이어 「 · 」로 잇는다
//   ③ 은 아래 TABLES 의 자리표시 판을 같은 JSON 으로 풀어 문서 표 칸과 **문자열로** 대조한다 — --fill 이 옮긴 뒤 누가 칸을 손으로
//   고쳤거나 행이 다른 경로를 가리키면 잡힌다. 자리표시가 하나라도 남아 있으면(어떤 {{…}} 든) ③ 은 FAIL 이다.
//
// 재는 것 (감사 문서 = ../2026-11-08-harness-on-comparison.md)
//   ① 머리 세 줄 · 절 §0~§6 차례 · §5 의 하위 절 5.1~5.12 차례
//   ② 선 문언 = D-160 — DECISIONS.md 의 D-160 원문에서 뽑은 조각이 원문에도 있고 감사 문서 §1 · §2 에도 글자 그대로 있다
//      + 고정 영문 줄 2종(D-160 ⓪ 의 text 블록) · 인용한 판J 감사 문서 문장이 판J 문서에 글자 그대로 있다
//   ③ 판정 칸 재계산 — K-83-results.json 의 상태(제3 판정 반입 · 미확정 0) · 표 TABLES 대조 · §0 문장 대조 · 자리표시 0
//   ③-b 사용 통계 재계산 — 1부에 쓴 수(K-50 · K-60 요약 · 이벤트 · 답안 · 실행 기록)를 원자료에서 다시 세어 대조
//   ④ 금지 문자열 — K-99 와 같은 규칙(sap.env · 프로파일 이름 제외 — 위) · 감사 문서 · 이 파일 · K-84-selfcheck.txt + 본문 꼬리표(과업 번호)
//   ⑤ 상대 링크 실재 · 자료 파일 번호 참조(K-NN · J-NN) 실재 — K-83 은 ③ 의 몫 · 아직 없는 회수 파일 번호는 허용 목록
//   ⑥ D-번호 실재 · 절 참조 실재(이 문서 §N.M · 「판J 문서 §」 · 「K-NN §」 · 「J-NN §」) · 「사양 §」 은 꼴만
//   ⑦ §5 정직 유보 ⑴~⑿ 의 표제어
//   ⑧ 「작성자 = 응시 모델」 문구

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DATA = path.dirname(SELF);
const ROOT = path.resolve(DATA, '..', '..', '..', '..');
const JDATA = path.resolve(DATA, '..', '2026-11-05-harness-necessity-review-data');
const JDOC = path.resolve(DATA, '..', '2026-11-05-harness-necessity-review.md');
const DECISIONS = path.join(ROOT, 'docs', 'reference', 'DECISIONS.md');
const TXT = path.join(DATA, 'K-84-selfcheck.txt');

// ── 인자 ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let DOC = path.resolve(DATA, '..', '2026-11-08-harness-on-comparison.md');
let JSONP = path.join(DATA, 'K-83-results.json');
let mode = 'check';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--doc') DOC = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSONP = path.resolve(argv[++i]);
  else if (argv[i] === '--fill') mode = 'fill';
  else if (argv[i] === '--emit-templates') mode = 'emit';
  else { console.log(`usage: node K-84-selfcheck.mjs [--fill | --emit-templates] [--json <path>] [--doc <path>] — unknown arg ${argv[i]}`); process.exit(2); }
}

const rel = (p) => {
  const r = path.relative(ROOT, p).split(path.sep).join('/');
  return r.startsWith('..') || path.isAbsolute(path.relative(ROOT, p)) ? `<레포 밖>/${path.basename(p)}` : r;   // 다른 드라이브면 relative 가 절대 경로를 돌려준다
};
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ');
const strip = (s) => (s ?? '').replace(/\*\*/g, '').trim();
const say = (s = '') => console.log(s);
let fails = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) fails++;
  say(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
  return cond;
};

// ── 자리표시 풀기 ──────────────────────────────────────────────────────────────
function getPath(obj, expr) {
  let cur = obj;
  let rest = expr.trim();
  while (rest.length) {
    if (rest.startsWith('.')) rest = rest.slice(1);
    if (rest.startsWith('[')) {
      const e = rest.indexOf(']');
      if (e < 0) throw new Error(`경로 꼴 오류: ${expr}`);
      const [f, v] = rest.slice(1, e).split('=');
      rest = rest.slice(e + 1);
      if (!Array.isArray(cur)) throw new Error(`배열이 아님: ${expr}`);
      cur = cur.find((x) => x && typeof x === 'object' && String(x[f]) === v);
      if (cur === undefined) throw new Error(`없음: ${expr}`);
      continue;
    }
    if (cur === null || typeof cur !== 'object') throw new Error(`없음: ${expr}`);
    const keys = Object.keys(cur).filter((k) => rest === k || rest.startsWith(`${k}.`) || rest.startsWith(`${k}[`));
    if (!keys.length) throw new Error(`없음: ${expr}`);
    const k = keys.sort((a, b) => b.length - a.length)[0];
    cur = cur[k];
    rest = rest.slice(k.length);
  }
  return cur;
}
function scalar(v, expr) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v === '' ? '—' : v;
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')) return v.length ? v.map((x) => scalar(x, expr)).join(' · ') : '없음';
  throw new Error(`스칼라가 아님: ${expr}`);
}
function resolveOne(kind, body, J) {
  if (kind === '') return scalar(getPath(J, body), body);
  if (kind === '#') {
    const a = getPath(J, body);
    if (!Array.isArray(a)) throw new Error(`배열이 아님: ${body}`);
    return String(a.length);
  }
  if (kind === '%') {
    const [pa, pb] = body.split('/');
    const a = getPath(J, pa);
    const b = getPath(J, pb);
    if (typeof a !== 'number' || typeof b !== 'number' || b === 0) throw new Error(`수가 아님: ${body}`);
    return ((a / b) * 100).toFixed(1);
  }
  const ci = body.indexOf(':');
  if (ci < 0) throw new Error(`꼴 오류: ${body}`);
  const arr = getPath(J, body.slice(0, ci));
  if (!Array.isArray(arr)) throw new Error(`배열이 아님: ${body}`);
  const tail = body.slice(ci + 1);
  if (kind === '?') {
    const [f, v] = tail.split('=');
    return String(arr.filter((e) => e && String(e[f]) === v).length);
  }
  if (kind === '@') {
    const fields = tail.split(' ').filter(Boolean);
    return arr.length ? arr.map((e) => fields.map((f) => scalar(e?.[f], body)).join(' ')).join(' · ') : '없음';
  }
  throw new Error(`꼴 오류: ${kind}`);
}
const PH = () => /\{\{K-83([#%?@]?):([^}]+)\}\}/g;
function resolveText(t, J, errs) {
  return t.replace(PH(), (m, k, b) => {
    try { return resolveOne(k, b, J); } catch (e) { errs.push(e.message); return m; }
  });
}

// ── ③ 이 대조하는 표 (자리표시 판 — 문서 표와 같은 꼴) ─────────────────────────
const MODELS = [['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5']];
const CX = 'Codex gpt-5.6-sol';
const SCOPES = [['all', '전체'], ['byCat.module', '모듈'], ['byCat.country', '나라'], ['byCat.industry', '업종'], ['byCat.abap', 'ABAP 일반 작법']];
const frac = (p) => `{{K-83:${p}.c}}/{{K-83:${p}.n}}`;
// 표류 「문언 기준」 칸의 경로 — 지식 = drift.literal(J-83 rows[].final) · 코드 = drift.code(K-83 의 코드 기준이 이미 J-83 rows[].pass 라 문언 기준과 같다)
const DRIFT_LITERAL = { knowledge: '{{K-83:drift.literal.knowledge.final}}', code: '{{K-83:drift.code.final}}' };
const TABLES = [
  {
    id: '지식 — 판정 가능 분모', heading: '3.1 ',
    head: ['범위', '모델', '판K — 켠 조건', '비싼 오답', '정답률 띠', '비싼 띠', '판J — 맨 모델', '차', '해친다', '칸'],
    rows: SCOPES.flatMap(([sc, lab]) => [
      ...MODELS.map(([m, ml]) => {
        const p = `knowledge.${m}.${sc}`;
        return [lab, ml, `${frac(p)} = {{K-83:${p}.rate}}%`, `{{K-83:${p}.expWrong}}`, `{{K-83:${p}.rateBand}}`, `{{K-83:${p}.expBand}}`,
          `{{K-83:${p}.j_c}}/{{K-83:${p}.j_n}} = {{K-83%:${p}.j_c/${p}.j_n}}%`, `{{K-83:${p}.diff}}`, `{{K-83:${p}.harm}}`, `{{K-83:${p}.cell}}`];
      }),
      (() => { const b = `baseline_j.gpt-5.6-sol.${sc}`; return [lab, CX, '측정 불가', '—', '—', '—', `${frac(b)} = {{K-83%:${b}.c/${b}.n}}%`, '—', '—', '측정 불가']; })(),
    ]),
  },
  {
    id: '지식 — 병기 수', heading: '3.2 ',
    head: ['모델', '엄격 60 — 판K', '엄격 60 — 판J', '팩 오류 5 — 팩을 따라 틀린 수', '판정 불가 8 — 판K 정답', '새 의심', '판J ✗ → 판K ✓', '판J ✓ → 판K ✗', '둘 다 ✓', '둘 다 ✗'],
    rows: MODELS.map(([m, ml]) => {
      const s = `side.${m}`;
      return [ml, `${frac(`${s}.strict60`)} = {{K-83%:${s}.strict60.c/${s}.strict60.n}}%`, `${frac(`${s}.strict60.j`)} = {{K-83%:${s}.strict60.j.c/${s}.strict60.j.n}}%`,
        `{{K-83?:${s}.packError:final=정답}}/{{K-83#:${s}.packError}}`, `{{K-83?:${s}.undecidable:final=정답}}/{{K-83#:${s}.undecidable}}`, `{{K-83#:${s}.newDoubts}}`,
        `{{K-83#:${s}.pairs.jWrongKRight}}`, `{{K-83#:${s}.pairs.jRightKWrong}}`, `{{K-83:${s}.pairs.bothRight}}`, `{{K-83:${s}.pairs.bothWrong}}`];
    }),
  },
  {
    id: '지식 — 병기 문항', heading: '3.2 ',
    head: ['모델', '팩 오류 5문항의 판K 최종', '판정 불가 8문항의 판K 최종', '판J ✗ → 판K ✓ 문항', '판J ✓ → 판K ✗ 문항', '새 의심 문항'],
    rows: MODELS.map(([m, ml]) => {
      const s = `side.${m}`;
      return [ml, `{{K-83@:${s}.packError:id final}}`, `{{K-83@:${s}.undecidable:id final}}`, `{{K-83:${s}.pairs.jWrongKRight}}`, `{{K-83:${s}.pairs.jRightKWrong}}`, `{{K-83@:${s}.newDoubts:id}}`];
    }),
  },
  {
    id: '코드 — 과제 통과', heading: '3.3 ',
    head: ['모델', '통과(5과제)', '통과한 과제', '띠', '판J', '차', '해친다', '칸', '검사기 오류급 합'],
    rows: [
      ...MODELS.map(([m, ml]) => {
        const c = `code.${m}`;
        return [ml, `{{K-83#:${c}.passed}}/{{K-83:${c}.n}}`, `{{K-83:${c}.passed}}`, `{{K-83:${c}.band}}`, `{{K-83:${c}.j_passed}}/{{K-83:${c}.n}}`, `{{K-83:${c}.diff}}`, `{{K-83:${c}.harm}}`, `{{K-83:${c}.cell}}`, `{{K-83:${c}.errorGradeTotal}}`];
      }),
      [CX, '측정 불가', '—', '—', '{{K-83:baseline_j.gpt-5.6-sol.code}}/5', '—', '—', '측정 불가', '—'],
    ],
  },
  {
    id: '코드 — 위반 목록', heading: '3.3 ',
    head: ['모델', 'C-01', 'C-02', 'C-03', 'C-04', 'C-05'],
    rows: MODELS.map(([m, ml]) => [ml, ...[1, 2, 3, 4, 5].map((k) => `{{K-83:code.${m}.viol.C-0${k}}}`)]),
  },
  {
    id: '표류 검사', heading: '3.4 ',
    head: ['시험', '표본', '채택 기준 — 판J 채점 단계 최종과 다른 행(최종 · A · B)', '문턱', '결과', '문언 기준 — J-83 최종과 다른 행(병기)'],
    rows: [['지식', 'knowledge'], ['코드', 'code']].map(([lab, k]) => [lab, `{{K-83:drift.${k}.n}}행`,
      `{{K-83:drift.${k}.final}} · {{K-83:drift.${k}.A}} · {{K-83:drift.${k}.B}}`, `≥ {{K-83:drift.${k}.threshold}}`, `{{K-83:drift.${k}.status}}`, DRIFT_LITERAL[k]]),
  },
  {
    id: '일치율', heading: '3.5 ',
    head: ['짝', '일치'],
    rows: [
      ['A↔B 지식 — 판정', '{{K-83:agreement.AB.knowledge.0}}/{{K-83:agreement.AB.knowledge.1}} = {{K-83%:agreement.AB.knowledge.0/agreement.AB.knowledge.1}}%'],
      ['A↔B 지식 — 판정과 세부', '{{K-83:agreement.AB.knowledgeDetail.0}}/{{K-83:agreement.AB.knowledgeDetail.1}} = {{K-83%:agreement.AB.knowledgeDetail.0/agreement.AB.knowledgeDetail.1}}%'],
      ['A↔B 코드 — 판정과 위반 목록', '{{K-83:agreement.AB.code.0}}/{{K-83:agreement.AB.code.1}} = {{K-83%:agreement.AB.code.0/agreement.AB.code.1}}%'],
      ['제3 판정으로 간 행', '지식 {{K-83:counts.disagree.knowledge}} · 코드 {{K-83:counts.disagree.code}}'],
      ['Codex↔최종', '{{K-83:agreement.codex.status}}'],
    ],
  },
  {
    id: '관측 모델 id', heading: '3.5 ',
    head: ['모델', '관측 id 일치 — 지식', '관측 id 일치 — 코드', '비교 가능'],
    rows: MODELS.map(([m, ml]) => [ml, `{{K-83:observed.${m}.knowledge.match}}/{{K-83:observed.${m}.knowledge.n}}`, `{{K-83:observed.${m}.code.match}}/{{K-83:observed.${m}.code.n}}`, `{{K-83:observed.${m}.comparable}}`]),
  },
  {
    id: '층 판정', heading: '4.1 ',
    head: ['층', '무엇을 읽나', 'Opus 5.5', 'Sonnet 5.5', CX, '세 모델 문언(D-160)', 'Claude 둘', 'Claude 둘 메운다 · Codex 측정 불가'],
    rows: ['L1-a', 'L2', 'L1-f', 'L1-b', 'L1-d'].map((id) => {
      const p = `layers[id=${id}]`;
      return [id, `{{K-83:${p}.name}}`, `{{K-83:${p}.cells.claude-opus-5-5}}`, `{{K-83:${p}.cells.claude-sonnet-5-5}}`, `{{K-83:${p}.cells.gpt-5.6-sol}}`,
        `{{K-83:${p}.three_model_rule}}`, `{{K-83:${p}.claude_two_rule}}`, `{{K-83:${p}.claude_both_fill_codex_unmeasured}}`];
    }),
  },
  {
    id: 'L1-f 결합', heading: '4.2 ',
    head: ['모델', '코드 통과', 'K-ABAP 판정 가능', '결합 규칙 결과', '칸'],
    rows: [
      ...MODELS.map(([m, ml]) => [ml, `{{K-83:l1f.${m}.code_passed}}/5`, `{{K-83:l1f.${m}.abap_c}}/{{K-83:l1f.${m}.abap_n}}`, `{{K-83:l1f.${m}.base}}`, `{{K-83:l1f.${m}.cell}}`]),
      [CX, '측정 불가', '—', '—', '측정 불가'],
    ],
  },
];
// §0 에 그대로 들어가는 문장(자리표시 판) — ③ 이 풀어 §0 본문(굵게 · 줄바꿈 무시)에 있는지 본다
const S0 = [
  '하네스 폴더(지식 팩 + 페르소나)를 읽을 수 있게 한 Claude 두 모델의 층 판정은 L1-a(모듈) {{K-83:layers[id=L1-a].claude_two_rule}} · L2(페르소나) {{K-83:layers[id=L2].claude_two_rule}} · L1-f(ABAP 일반 작법) {{K-83:layers[id=L1-f].claude_two_rule}}이고, 세 모델 모두를 요구하는 D-160의 문언으로는 {{K-83:layers[id=L1-a].three_model_rule}} · {{K-83:layers[id=L2].three_model_rule}} · {{K-83:layers[id=L1-f].three_model_rule}}이다.',
  '채점자 표류 검사에서 판J 채점과 다른 행은 지식 {{K-83:drift.knowledge.final}}/{{K-83:drift.knowledge.n}} · 코드 {{K-83:drift.code.final}}/{{K-83:drift.code.n}}이었다(지식 {{K-83:drift.knowledge.status}} · 코드 {{K-83:drift.code.status}}).',
];

// ── 표 읽기 (판J 84 와 같은 파서) ──────────────────────────────────────────────
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
function tablesOf(L) {
  const T = [];
  let heading = '';
  for (let i = 0; i < L.length; i++) {
    if (/^#{2,4} /.test(L[i])) heading = L[i].replace(/^#+ /, '');
    if (L[i].startsWith('|') && /^\|[\s:|-]+\|\s*$/.test(L[i + 1] || '')) {
      const rows = [];
      let j = i + 2;
      for (; j < L.length && L[j].startsWith('|'); j++) rows.push({ line: j + 1, c: cellsOf(L[j]) });
      T.push({ heading, line: i + 1, head: cellsOf(L[i]), rows });
      i = j - 1;
    }
  }
  return T;
}
const mdRow = (cells) => `| ${cells.join(' | ')} |`;

// ── --emit-templates ───────────────────────────────────────────────────────────
if (mode === 'emit') {
  for (const t of TABLES) {
    say(`<!-- ${t.heading.trim()} · ${t.id} -->`);
    say(mdRow(t.head));
    say(mdRow(t.head.map(() => '---')));
    for (const r of t.rows) say(mdRow(r));
    say('');
  }
  say('<!-- §0 문장 -->');
  for (const s of S0) say(s);
  process.exit(0);
}

const doc = read(DOC);
const L = doc.split('\n');
const T = tablesOf(L);

// ── --fill ─────────────────────────────────────────────────────────────────────
if (mode === 'fill') {
  if (!fs.existsSync(JSONP)) { say(`FILL: ${rel(JSONP)} 없음 — 쓰지 않음`); process.exit(1); }
  const J = JSON.parse(read(JSONP));
  const errs = [];
  const n = [...doc.matchAll(PH())].length;
  const out = resolveText(doc, J, errs);
  if (errs.length) {
    say(`FILL: 자리표시 ${n} 가운데 풀지 못한 것 ${errs.length} — 쓰지 않음`);
    for (const e of [...new Set(errs)]) say(`  ${e}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(DOC, 'utf8');
  fs.writeFileSync(DOC, raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out, 'utf8');
  say(`FILL: ${rel(DOC)} — 자리표시 ${n}개를 ${rel(JSONP)} 에서 옮김 · 남은 {{…}} ${[...out.matchAll(/\{\{/g)].length}`);
  process.exit(0);
}

say(`K-84-selfcheck — 대상 ${rel(DOC)} · 집계 ${rel(JSONP)}`);
say('');

// ── ① 머리 · 절 ────────────────────────────────────────────────────────────────
say('[1] 머리 · 절');
const head = L.slice(0, 8).join('\n');
ok(/^> 작성일: /m.test(head) && /^> 상태: /m.test(head) && /^> 실행 분류: /m.test(head), '머리 세 줄(작성일 · 상태 · 실행 분류)');
const h2 = L.map((l, i) => [l, i + 1]).filter(([l]) => /^## /.test(l));
const order = h2.map(([l]) => (l.match(/^## (\d+)\./) || [])[1] ?? '?').join(' ');
ok(order === '0 1 2 3 4 5 6', '절 §0~§6 이 차례로 있다(첫 절 = §0 결론)', order || '절 없음');
const secRange = (n) => {
  const s = L.findIndex((l) => new RegExp(`^## ${n}\\. `).test(l));
  if (s < 0) return [0, 0];
  let e = L.findIndex((l, i) => i > s && /^## /.test(l));
  if (e < 0) e = L.length;
  return [s, e];
};
const secText = (n) => { const [s, e] = secRange(n); return L.slice(s, e).join('\n'); };
const h3in5 = (() => { const [s, e] = secRange(5); return L.slice(s, e).filter((l) => /^### 5\.\d+ /.test(l)).map((l) => l.match(/^### (5\.\d+) /)[1]).join(' '); })();
ok(h3in5 === '5.1 5.2 5.3 5.4 5.5 5.6 5.7 5.8 5.9 5.10 5.11 5.12', '§5 하위 절 5.1~5.12 이 차례로 있다', h3in5 || '없음');
say('');

// ── ② 선 문언 = D-160 ──────────────────────────────────────────────────────────
say('[2] 선 문언 — D-160 원문 ↔ 감사 문서 §1 · §2');
const dec = read(DECISIONS);
const d160s = dec.indexOf('\n## D-160');
const d160e = dec.indexOf('\n## D-', d160s + 5);
const D160raw = d160s < 0 ? '' : dec.slice(d160s, d160e < 0 ? undefined : d160e);
const D160 = flat(D160raw);
ok(D160.length > 0, 'D-160 원문을 DECISIONS.md 에서 찾음');
const S12txt = flat(`${secText(1)}\n${secText(2)}`);
const PHRASES = [
  ['주 분모', '주 분모 = 판정 가능 47(표본 60에서 팩 오류 5 · 판정 불가 8을 뺀 것'],
  ['엄격 60 병기', '엄격 60은 병기만 한다.'],
  ['지식 선의 분모', '지식 선(모델마다 · 전체 47과 범주별 판정 가능 분모 둘 다)'],
  ['지식 두 띠 · 나쁜 쪽', '정답률 띠 — ≥ 95% 「메운다」 · 90~95% 측정 후 결정 · < 90% 「못 메운다」 / 비싼 항목 띠 — 오답 0 통과 · 1 측정 후 결정 · ≥ 2 「못 메운다」 / 판정 = 두 띠 가운데 나쁜 쪽.'],
  ['코드 선', '코드 선(모델마다 · D-156 ⑵ 그대로): 5/5 「메운다」 · 4/5 측정 후 결정 · ≤ 3/5 「못 메운다」.'],
  ['해친다', '해친다 — 어떤 모델이든 켠 조건이 판J보다 지식은 판정 가능 분모(전체 47 또는 범주)에서 2문항 이상 · 코드는 통과 1과제 이상 적으면 그 칸은 띠와 무관하게 「해친다」로 적는다(지식 1문항 차는 1회 응시의 흔들림으로 본다).'],
  ['층 판정', '층 판정 — L1-a(모듈) · L2(페르소나 — 모듈 칸이 대신 잰다) · L1-f(위 결합 규칙)를 세 모델 모두로 읽는다: 셋 다 「메운다」 → 가정 확인(유지 처방의 전제가 선다) · 하나라도 「못 메운다」 또는 「해친다」 → 가정 기각(그 모델에서는 하네스를 켜도 모자란다 — 유지 처방은 그대로 두되 근거 문장을 고치고, 팩 품질 · 적재 길을 다음 판 후보로) · 그 밖 → 측정 후 결정.'],
  ['Claude 둘만', 'Claude 둘은 「메운다」인데 Codex만 아니면 그 사실을 따로 적는다'],
  ['L1-f 결합', '모델마다: 코드 「메운다」(5/5) ∧ 지식 K-ABAP 판정 가능 6문항 6/6 → 「메운다」 · 코드 5/5 ∧ 지식 < 6/6 → 측정 후 결정 · 코드 4/5 → 측정 후 결정 · 코드 ≤ 3/5 → 「못 메운다」(지식 결과와 무관).'],
  ['결합은 판K 에만', '이 규칙은 판K 결과에만 쓴다'],
  ['표류 문턱', '판J 최종 판정과 다른 행이 지식 5행 이상(일치 ≤ 31/36 = 86.1%) 이면 지식 비교 칸 전부, 코드의 과제 통과 판정이 2행 이상 다르면 코드 비교 칸 전부를 「측정 후 결정」으로 둔다'],
  ['코드 결합 — 서로 지우지 않음', '검사기 결과를 채점자가 뒤집지 않고, 채점자의 위반 판정을 검사기 결과로 지우지 않는다.'],
  ['세 번 무효 = 오답', '세 번 무효면 그 행은 오답(빼지 않는다 — 「메운다」 쪽으로 기울지 않게). 되묻기 · 답 없음도 오답이다.'],
  ['비교 불가', '관측 모델 id(Claude 이벤트 필드 · Codex 배너)가 판J와 다르면 그 모델의 칸은 「비교 불가」로 적고 판정하지 않는다.'],
  ['정답 키 동결', '판J 최종 키(J-10 + J-81 팩 감사 판정)를 그대로 쓴다. 판K는 팩 감사를 다시 하지 않는다.'],
];
const pBad = [];
for (const [name, s] of PHRASES) {
  const f = flat(s);
  if (!D160.includes(f) || !S12txt.includes(f)) pBad.push(`${name}(${D160.includes(f) ? '' : 'D-160에 없음 '}${S12txt.includes(f) ? '' : '문서 §1·§2에 없음'})`);
}
ok(pBad.length === 0, `선 문언 ${PHRASES.length}조각 — D-160 원문에도 있고 감사 문서 §1 · §2 에도 글자 그대로 있다(선 변경 0)`, pBad.length ? pBad.join(' · ') : `${PHRASES.length}/${PHRASES.length}`);
const fence = D160raw.match(/````text\n([\s\S]*?)\n\s*````/);
const fixed = fence ? fence[1].split('\n').map((l) => l.trim()).filter(Boolean) : [];
ok(fixed.length === 2 && fixed.every((l) => doc.includes(l)), '고정 영문 줄 2종(D-160 ⓪ text 블록) — 감사 문서에 글자 그대로', `${fixed.filter((l) => doc.includes(l)).length}/${fixed.length}`);
const jdoc = flat(read(JDOC));
const JQUOTES = [
  '「지금 하네스가 그 빈틈을 실제로 메운다」는 켠 채와 끈 채를 견주는 실제 비교(§6 ①) 전까지 확인되지 않은 가정이다. 아래 「유지」 처방은 미리 정한 규칙(맨 모델이 모자라면 유지)을 따른 것이고, 그 규칙도 이 가정 위에 서 있다.',
  '이 판은 하네스를 켠 조건도, MCP를 붙인 조건도 재지 않았다 — 「하네스가 빈틈을 실제로 메우는가」',
  '두 모델 규칙: Opus ✗ → 유지.',
];
const qBad = JQUOTES.filter((q) => !jdoc.includes(flat(q)) || !flat(doc).includes(flat(q)));
ok(qBad.length === 0, `인용한 판J 감사 문서 문장 ${JQUOTES.length}개 — 판J 문서와 이 문서 양쪽에 글자 그대로`, qBad.length ? `어긋남 ${qBad.length}` : '');
say('');

// ── ③ 판정 칸 재계산 ───────────────────────────────────────────────────────────
say('[3] 판정 칸 — K-83-results.json ↔ 감사 문서 §0 · §3 · §4 (문자열 대조)');
const left = [...doc.matchAll(/\{\{([^}:]*)/g)].map((m) => m[1]);
const leftBy = {};
for (const k of left) leftBy[k] = (leftBy[k] || 0) + 1;
ok(left.length === 0, '자리표시 0 — 감사 문서에 {{…}} 가 남아 있지 않다', left.length ? Object.entries(leftBy).map(([k, n]) => `${k} ${n}`).join(' · ') : '');
let J = null;
if (!fs.existsSync(JSONP)) ok(false, `${rel(JSONP)} 가 있다`, '없음');
else {
  J = JSON.parse(read(JSONP));
  ok(J._schema === 'harness-on-aggregate-v1', '집계 스키마 harness-on-aggregate-v1', String(J._schema));
  ok(J.status?.adjudication !== 'absent' && J.status?.unresolved === 0, '집계 상태 — 제3 판정 반입 · 미확정 행 0', `adjudication=${J.status?.adjudication} · unresolved=${J.status?.unresolved}`);
  for (const k of ['K-83-results.txt', 'K-83-aggregate.mjs']) ok(fs.existsSync(path.join(DATA, k)), `자료 폴더에 ${k} 가 있다`);
  for (const t of TABLES) {
    const errs = [];
    const want = t.rows.map((r) => r.map((c) => resolveText(c, J, errs)));
    const dt = T.find((x) => x.heading.startsWith(t.heading) && JSON.stringify(x.head) === JSON.stringify(t.head));
    if (!dt) { ok(false, `표 「${t.id}」(§${t.heading.trim()})`, '문서에 그 머리의 표가 없음'); continue; }
    let bad = 0;
    const where = [];
    if (dt.rows.length !== want.length) { bad++; where.push(`행 수 ${dt.rows.length} ≠ ${want.length}`); }
    want.forEach((w, i) => {
      const r = dt.rows[i];
      if (!r) return;
      w.forEach((cell, k) => { if (strip(r.c[k]) !== cell) { bad++; if (where.length < 6) where.push(`${r.line}행 「${t.head[k]}」`); } });
    });
    ok(bad === 0 && errs.length === 0, `표 「${t.id}」(§${t.heading.trim()} · ${dt.line}행) — ${want.length}행 × ${t.head.length}칸`, bad || errs.length ? `어긋남 ${bad}${where.length ? ` (${where.join(' · ')})` : ''}${errs.length ? ` · 경로 오류 ${errs.length}: ${[...new Set(errs)].slice(0, 3).join(' / ')}` : ''}` : '');
  }
  const s0 = flat(secText(0));
  const s0bad = S0.map((s) => { const errs = []; const r = flat(resolveText(s, J, errs)); return errs.length || !s0.includes(r); }).filter(Boolean).length;
  ok(s0bad === 0, `§0 문장 ${S0.length}개 — 집계에서 푼 글자가 §0 에 있다`, s0bad ? `어긋남 ${s0bad}` : '');
}
say('');

// ── ③-b 사용 통계 ─────────────────────────────────────────────────────────────
say('[3-b] 사용 통계 — 1부에 쓴 수를 원자료(K-50 · K-60 · K-65)에서 다시 세어 대조');
const csv = (f) => {
  const rows = read(path.join(DATA, f)).trim().split('\n');
  const h = rows[0].split(',');
  return rows.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(h.map((k, i) => [k, c[i]])); });
};
const fmt = (n) => n.toLocaleString('en-US');
const K50rows = csv('K-50-summary.csv');
const K60 = csv('K-60-checker-summary.csv');
const ev = (dir, m) => fs.readdirSync(path.join(DATA, dir, m)).filter((f) => f.endsWith('.txt')).map((f) => read(path.join(DATA, dir, m, f)));
const toolCount = (texts, re) => {
  const c = { Grep: 0, Read: 0, Glob: 0 };
  for (const t of texts) { const mm = t.match(re); if (mm) for (const n of mm[1].split(',').map((s) => s.trim()).filter((s) => s && s !== 'none')) c[n] = (c[n] || 0) + 1; }
  return c;
};
const runlog = read(path.join(DATA, 'K-50-run-log.txt'));
const wallOf = (m) => { const all = [...runlog.matchAll(new RegExp(`=== END model=${m.replace(/[.]/g, '\\.')} .*? wall=(\\d+) s`, 'g'))]; return all.length ? all[all.length - 1][1] : '?'; };
const CITE = /(knowledge|personas)[\\/][^\s`'")]+|\.md\b/i;
const NOTCHK = /(didn't|did not) check (it against )?the knowledge (pack|folder)/i;
const sum = (rs, k) => rs.reduce((a, r) => a + Number(r[k]), 0);
const USE = [];
const USE2 = [];
const RULEF = { 'clean-code.md': 0, 'clean-code-oop.md': 0 };
let codeN = 0;
for (const [m, ml] of MODELS) {
  const rs = K50rows.filter((r) => r.model === m);
  const tc = toolCount(ev('K-50-events', m), /^tool_names: ?(.*)$/m);
  USE.push([ml, '지식', String(rs.length), `${rs.filter((r) => +r.files_read > 0).length}/${rs.length}`, `${rs.filter((r) => +r.tool_calls === 0).length}/${rs.length}`,
    `${sum(rs, 'tool_calls')}(${tc.Grep} · ${tc.Read} · ${tc.Glob})`, String(sum(rs, 'files_read')), `${sum(rs, 'outside_attempts')} · ${sum(rs, 'invalid_attempts')}`,
    `${fmt(sum(rs, 'tokens_in'))} · ${fmt(sum(rs, 'tokens_out'))}`, wallOf(m)]);
  const ans = fs.readdirSync(path.join(DATA, 'K-50-answers', m)).map((f) => read(path.join(DATA, 'K-50-answers', m, f)));
  USE2.push([ml, `${ans.filter((t) => CITE.test(t)).length}/${ans.length}`, `${ans.filter((t) => NOTCHK.test(t)).length}/${ans.length}`]);
}
for (const [m, ml] of MODELS) {
  const rs = K60.filter((r) => r.model === m);
  const texts = ev('K-60-events', m);
  const tc = toolCount(texts, /이름: ([^\n]*)/);
  const tools = texts.reduce((a, t) => a + Number((t.match(/도구 호출\(tool_use 블록\) 수=(\d+)/) || [0, 0])[1]), 0);
  const wall = texts.reduce((a, t) => a + Number((t.match(/wall_ms=(\d+)/) || [0, 0])[1]), 0);
  for (const t of texts) {
    codeN++;
    const lst = (t.match(/읽은 파일\(폴더 상대\)=\[([^\]]*)\]/) || [0, ''])[1].split(/\s+/);
    for (const f of Object.keys(RULEF)) if (lst.includes(`knowledge/abap/conventions/${f}`)) RULEF[f]++;
  }
  USE.push([ml, '코드', String(rs.length), `${rs.filter((r) => +r.files_read > 0).length}/${rs.length}`, `${texts.filter((t) => /도구 호출\(tool_use 블록\) 수=0\b/.test(t)).length}/${rs.length}`,
    `${tools}(${tc.Grep} · ${tc.Read} · ${tc.Glob})`, String(sum(rs, 'files_read')), `${sum(rs, 'outside_attempts')} · ${sum(rs, 'invalid_attempts')}`,
    `${fmt(sum(rs, 'tokens_in'))} · ${fmt(sum(rs, 'tokens_out'))}`, String(Math.round(wall / 1000))]);
}
const USE3 = Object.entries(RULEF).map(([f, n]) => [`\`${f}\``, `${n}/${codeN}`]);
const USETABLES = [
  ['사용량', ['모델', '시험', '답', 'Read로 파일을 연 답', '도구 호출 0인 답', '도구 호출 — 합(Grep · Read · Glob)', 'Read로 연 파일 — 합', '폴더 밖 시도 · 무효 시도', '토큰 — 입력 · 출력', '벽시계(초)'], USE],
  ['답의 꼴', ['모델', '팩 경로를 인용한 답', '「팩을 확인하지 않았다」고 스스로 적은 답'], USE2],
  ['채점 규칙 출처 파일', ['채점 규칙의 출처 파일', '그 파일을 읽은 코드 답'], USE3],
];
for (const [id, hd, want] of USETABLES) {
  const dt = T.find((x) => x.heading.startsWith('3.6 ') && JSON.stringify(x.head) === JSON.stringify(hd));
  if (!dt) { ok(false, `표 「${id}」(§3.6)`, '문서에 그 머리의 표가 없음'); continue; }
  let bad = 0;
  const where = [];
  if (dt.rows.length !== want.length) { bad++; where.push(`행 수 ${dt.rows.length} ≠ ${want.length}`); }
  want.forEach((w, i) => w.forEach((cell, k) => { if (dt.rows[i] && strip(dt.rows[i].c[k]) !== cell) { bad++; if (where.length < 6) where.push(`${dt.rows[i].line}행 「${hd[k]}」 기대 ${cell}`); } }));
  ok(bad === 0, `표 「${id}」(§3.6 · ${dt.line}행) — 원자료에서 다시 셈`, bad ? `어긋남 ${bad} (${where.join(' · ')})` : `${want.length}행`);
}
const k65 = read(path.join(DATA, 'K-65-check.txt'));
const citeTotal = USE2.reduce((a, r) => a + Number(r[1].split('/')[0]), 0);
ok(k65.includes(`켠 조건 ${citeTotal}/120`) && k65.includes('표류 0/36') && doc.includes(`${citeTotal}/120`), `팩 경로 인용 합 ${citeTotal}/120 = K-65-check.txt [6] · 섞어 넣은 판J 답 0/36 — 문서에도 있다`);
say('');

// ── ④ 금지 문자열 ──────────────────────────────────────────────────────────────
say('[4] 금지 문자열 — K-99 와 같은 규칙(sap.env · 프로파일 이름 범주 제외) · 찾은 수만 찍는다');
const Jn = (...p) => p.join('');
const lc = (s) => s.toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
const PACK = [path.join(ROOT, 'interactive', 'core', 'knowledge'), path.join(ROOT, 'interactive', 'core', 'personas')].flatMap((r) => (fs.existsSync(r) ? walk(r) : [])).map((f) => read(f)).join('\n');
ok(PACK.length > 0, '팩 본문(허용 목록의 근거)을 읽음');
const URL_HEAD = Jn('ht', 'tp');
const URL_RE = () => new RegExp(`${URL_HEAD}s?:\\/\\/[^\\s)\\]>"'\`<]+`, 'g');
const trimUrl = (u) => u.replace(/[.,;:)]+$/, '');
const PACK_URLS = new Set([...PACK.matchAll(URL_RE())].map((m) => trimUrl(m[0])));
const SID_RE = () => /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{2}(?![A-Za-z0-9_])/g;
const UUID_RE = () => /(?<![0-9a-fA-F])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![0-9a-fA-F])/g;
const PACK_SID = new Set([...PACK.matchAll(SID_RE())].map((m) => m[0]));
const PACK_UUID = new Set([...PACK.matchAll(UUID_RE())].map((m) => m[0].toLowerCase()));
const sw = fs.existsSync(path.join(JDATA, '00-switches.txt')) ? read(path.join(JDATA, '00-switches.txt')).split('\n') : [];
const grab = (line) => { const m = (line || '').match(/\(([^()]*)\)\s*$/); if (!m) return []; const inner = m[1].includes(':') ? m[1].split(':').slice(1).join(':') : m[1]; return inner.split('·').map((s) => s.trim()).filter(Boolean); };
const NAMES = [...new Set([...grab(sw[11]), ...grab(sw[13])])];
ok(NAMES.length > 0, '다른 프로젝트 · 프로파일 이름을 판J 00 머리(12 · 14행)에서 읽음', `${NAMES.length}개`);
const stems = new Set();
for (const a of NAMES) for (const b of NAMES) { if (a === b) continue; let k = 0; while (k < a.length && k < b.length && lc(a[k]) === lc(b[k])) k++; if (k >= 4) stems.add(a.slice(0, k)); }
const home = os.homedir();
const user = os.userInfo().username;
const envUser = process.env.USERNAME || process.env.USER || '';
const hostName = os.hostname();
const envHost = process.env.COMPUTERNAME || '';
const slashForms = (p) => { const b = p.split('/').join('\\'); const f = p.split('\\').join('/'); const out = [b, f, b.split('\\').join('\\\\')]; const m = f.match(/^([A-Za-z]):\/(.*)$/); if (m) out.push(`/${m[1].toLowerCase()}/${m[2]}`); return out; };
let wtRoot = ROOT;
let mainRoot = ROOT;
try {
  wtRoot = execFileSync('git', ['-C', DATA, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  mainRoot = path.dirname(execFileSync('git', ['-C', DATA, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim());
} catch { /* git 없음 — 스크립트 위치에서 잰 ROOT 만 */ }
// SID 예외 낱말 — K-99-namecheck.mjs 의 GENERIC 선언을 그 파일에서 읽는다(복제하면 K-99 가 낱말을 더할 때 갈린다)
const k99src = fs.existsSync(path.join(DATA, 'K-99-namecheck.mjs')) ? read(path.join(DATA, 'K-99-namecheck.mjs')) : '';
const gm = k99src.match(/const GENERIC = new Set\(\[([^\]]*)\]\)/);
const GENERIC = new Set(gm ? [...gm[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
ok(GENERIC.size > 0, 'SID 예외 낱말을 K-99-namecheck.mjs 의 GENERIC 선언에서 읽음', `${GENERIC.size}개`);
const forbiddenLc = new Set([...NAMES, ...stems].map(lc));
for (const g of [...GENERIC]) if (forbiddenLc.has(lc(g))) GENERIC.delete(g);
const PANJ_SID = new Set();
for (const f of walk(JDATA)) { const buf = fs.readFileSync(f); if (buf.includes(0)) continue; for (const m of buf.toString('utf8').matchAll(SID_RE())) PANJ_SID.add(m[0]); }
for (const t of [...PANJ_SID]) if (forbiddenLc.has(lc(t))) PANJ_SID.delete(t);
const sidAllowed = (t) => PACK_SID.has(t) || PANJ_SID.has(t) || GENERIC.has(t) || /^T\d\d$/.test(t);
const userWordExempt = user && new RegExp(`(?<![A-Za-z0-9_])${esc(user)}(?![A-Za-z0-9_])`).test(PACK);
const SUBSTR = [
  ['사용자 이름(홈 경로 꼴)', [...new Set([user, envUser].filter(Boolean))].flatMap((u) => [Jn('Users', '\\', u), Jn('Users', '\\\\', u), Jn('Users', '/', u)])],
  ['컴퓨터 이름', [...new Set([hostName, envHost].filter((s) => s && s.length >= 3))]],
  ['홈 경로', slashForms(home)],
  ['레포 위치', [...new Set([...slashForms(wtRoot), ...slashForms(mainRoot)])]],
  ['다른 프로젝트 · 프로파일 이름', [...NAMES, ...stems]],
  ['비추적 작업 폴더 이름', [Jn('dry', 'forge')]],
];
const countSub = (text, needle) => { if (!needle) return 0; const t = lc(text), n = lc(needle); let c = 0, i = 0; while ((i = t.indexOf(n, i)) !== -1) { c++; i += n.length; } return c; };
function scan(text) {
  const res = SUBSTR.map(([name, needles]) => [name, needles.reduce((s, n) => s + countSub(text, n), 0)]);
  res.push(['사용자 이름(낱말)', user && !userWordExempt ? [...text.matchAll(new RegExp(`(?<![A-Za-z0-9_])${esc(user)}(?![A-Za-z0-9_])`, 'g'))].length : 0]);
  res.push(['SID 꼴 3자', [...text.matchAll(SID_RE())].filter((m) => !sidAllowed(m[0])).length]);
  res.push(['세션 id 꼴', [...text.matchAll(UUID_RE())].filter((m) => !PACK_UUID.has(m[0].toLowerCase())).length]);
  res.push(['전자우편', [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)].filter((m) => !PACK.includes(m[0])).length]);
  res.push(['팩 밖 웹 주소', [...text.matchAll(URL_RE())].filter((m) => { const u = trimUrl(m[0]); return !PACK_URLS.has(u) && !PACK.includes(u); }).length]);
  return res;
}
for (const f of [DOC, SELF, TXT]) {
  if (!fs.existsSync(f)) { say(`    ${rel(f)} — 아직 없음(건너뜀)`); continue; }
  const res = scan(read(f));
  const total = res.reduce((s, [, c]) => s + c, 0);
  ok(total === 0, `${rel(f)} — 금지 문자열 0`, res.filter(([, c]) => c).map(([n, c]) => `${n} ${c}`).join(' · '));
}
const tasks = [...doc.matchAll(/(?<![\w-])T\d{1,2}(?![\w])/g)].length;
ok(tasks === 0, `${rel(DOC)} — 본문 꼬리표 0(내부 과업 번호 T + 숫자)`, tasks ? `${tasks}` : '');
say('');

// ── ⑤ 상대 링크 · 자료 파일 번호 ───────────────────────────────────────────────
say('[5] 상대 링크 실재 · 자료 파일 번호 참조 실재');
const links = [...doc.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
const relLinks = links.filter((u) => !u.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(u));
const missing = [];
let deferred = 0;
for (const u of new Set(relLinks)) {
  const target = path.resolve(path.dirname(DOC), decodeURI(u.split('#')[0]));
  if (fs.existsSync(target)) continue;
  if (/\/K-83-[^/]+$/.test(u)) { deferred++; continue; }   // K-83 은 ③ 의 몫
  missing.push(u);
}
ok(missing.length === 0 && links.length === relLinks.length, `링크 ${links.length}개(서로 다른 대상 ${new Set(relLinks).size}) — 전부 상대 경로 · 전부 실재`, `없음 ${missing.length}${missing.length ? ` (${missing.slice(0, 4).join(' · ')})` : ''} · 상대 경로 아님 ${links.length - relLinks.length}${deferred ? ` · K-83 링크 ${deferred}(③ 이 잰다)` : ''}`);
const PENDING = new Set(['92', '93']);   // 아직 없는 회수 파일(독립 리뷰 결과 · 처분) — 그 밖 번호는 파일이 있어야 한다
const dataFiles = fs.readdirSync(DATA);
const kRefs = [...new Set([...doc.matchAll(/(?<![\w-])K-(\d\d)(?!\d)/g)].map((m) => m[1]))].sort();
const kBad = kRefs.filter((n) => !PENDING.has(n) && !dataFiles.some((f) => f.startsWith(`K-${n}`)));
ok(kBad.length === 0, `자료 파일 번호 K-NN ${kRefs.length}종 — 자료 폴더에 그 번호로 시작하는 파일이 있다(아직 없는 회수 번호 ${[...PENDING].join(' · ')} 은 허용)`, kBad.length ? `없음 ${kBad.map((n) => `K-${n}`).join(' ')}` : kRefs.map((n) => `K-${n}`).join(' '));
const jFiles = fs.readdirSync(JDATA);
const jRefs = [...new Set([...doc.matchAll(/(?<![\w-])J-(\d\d)(?!\d)/g)].map((m) => m[1]))].sort();
const jBad = jRefs.filter((n) => !jFiles.some((f) => f.startsWith(`${n}-`)));
ok(jBad.length === 0, `판J 자료 번호 J-NN ${jRefs.length}종 — 판J 자료 폴더에 있다`, jBad.length ? `없음 ${jBad.map((n) => `J-${n}`).join(' ')}` : '');
say('');

// ── ⑥ D-번호 · 절 참조 ─────────────────────────────────────────────────────────
say('[6] D-번호 실재 · 절 참조 실재');
const decHeads = new Set([...dec.matchAll(/^## D-(\d{3})\b/gm)].map((m) => m[1]));
const cited = [...new Set([...doc.matchAll(/D-(\d{3})(?!\d)/g)].map((m) => m[1]))].sort();
const dBad = cited.filter((n) => !decHeads.has(n));
ok(dBad.length === 0, `인용한 D-번호 ${cited.length}종(${cited.map((n) => `D-${n}`).join(' · ')}) — 전부 DECISIONS.md 에 제목이 있다`, dBad.length ? `없음 ${dBad.map((n) => `D-${n}`).join(' ')}` : '');
const ownH = new Set(L.flatMap((l) => { const a = l.match(/^### (\d+\.\d+) /); const b = l.match(/^## (\d+)\. /); return a ? [a[1]] : b ? [b[1]] : []; }));
const jH = new Set(read(JDOC).split('\n').flatMap((l) => { const a = l.match(/^### (\d+\.\d+) /); const b = l.match(/^## (\d+)\. /); return a ? [a[1]] : b ? [b[1]] : []; }));
const refs = [...doc.matchAll(/(판J 문서 |K-(\d\d) |J-(\d\d) |사양 )?§(\d+(?:\.\d+)?)/g)];
const rBad = [];
let nOwn = 0, nJ = 0, nK = 0, nJd = 0, nSpec = 0;
const fileText = (dir, prefix) => {   // 그 번호의 파일 전부(.txt 먼저)를 이어 읽는다 — 절 표시는 대개 .txt 에 있다
  const fs_ = fs.readdirSync(dir).filter((x) => x.startsWith(prefix) && fs.statSync(path.join(dir, x)).isFile() && /\.(txt|mjs|csv|json|ps1)$/.test(x));
  return fs_.length ? fs_.sort((a, b) => (b.endsWith('.txt') - a.endsWith('.txt')) || a.localeCompare(b)).map((x) => read(path.join(dir, x))).join('\n') : null;
};
let prev = null;   // 「K-00 §3 · §10」처럼 가운뎃점으로 이어진 § 는 앞 참조의 대상을 잇는다
for (const m of refs) {
  let [, pre, kn, jn, sec] = m;
  if (!pre && prev && /^\s*·\s*$/.test(doc.slice(prev.end, m.index))) ({ pre, kn, jn } = prev);
  prev = { end: m.index + m[0].length, pre, kn, jn };
  if (!pre) { nOwn++; if (!ownH.has(sec)) rBad.push(`§${sec}`); }
  else if (pre === '판J 문서 ') { nJ++; if (!jH.has(sec)) rBad.push(`판J 문서 §${sec}`); }
  else if (kn) { nK++; if (PENDING.has(kn)) continue; const t = fileText(DATA, `K-${kn}`); if (!t || !t.includes(`§${sec}`)) rBad.push(`K-${kn} §${sec}`); }
  else if (jn) { nJd++; const t = fileText(JDATA, `${jn}-`); if (!t || !t.includes(`§${sec}`)) rBad.push(`J-${jn} §${sec}`); }
  else { nSpec++; }
}
// 「사양 §」(꼬리표 설명)은 참조가 아니다
const specBad = [...doc.matchAll(/사양 §(?!」)(\S*)/g)].filter((m) => !/^\d+(?:\.\d+)?$/.test(m[1]) && !/^\d+[ ·)]/.test(`${m[1]} `)).length;
ok(rBad.length === 0, `절 참조 — 이 문서 ${nOwn} · 판J 문서 ${nJ} · K-NN ${nK} · J-NN ${nJd} — 전부 실재(K-83 등 아직 없는 파일은 건너뜀)`, rBad.length ? `없음 ${[...new Set(rBad)].slice(0, 8).join(' · ')}` : '');
ok(specBad === 0, `「사양 §」 참조 ${nSpec}개 — 꼴만 잰다(판 준비 문서는 레포에 없다)`, specBad ? `꼴 어긋남 ${specBad}` : '');
say('');

// ── ⑦ §5 표제어 ───────────────────────────────────────────────────────────────
say('[7] §5 정직 유보 ⑴~⑿ 표제어');
const H5 = L.filter((l) => /^### 5\.\d+ /.test(l)).map((l) => l.replace(/\*\*/g, ''));
const KEYS = [
  ['⑴', ['팩 사용']], ['⑵', ['가림']], ['⑶', ['Codex', '측정 불가']], ['⑷', ['표류', '비교 기준']], ['⑸', ['팩어긋남의심']],
  ['⑹', ['팩 의심 목록']], ['⑺', ['작성자', '응시 모델']], ['⑻', ['규약 충돌']], ['⑼', ['컴퓨터']], ['⑽', ['K-99']], ['⑾', ['D-160 정직 유보']], ['⑿', ['전역 설정']],
];
const kBad7 = KEYS.filter(([mark, words], i) => { const h = H5[i] || ''; return !h.includes(mark) || !words.every((w) => h.includes(w)); }).map(([m]) => m);
ok(kBad7.length === 0, `§5 하위 절 표제 ${KEYS.length}개 — 차례대로 ⑴~⑿ 과 표제어`, kBad7.length ? `어긋남 ${kBad7.join(' ')}` : '');
say('');

// ── ⑧ 작성자 지위 ─────────────────────────────────────────────────────────────
say('[8] 작성자 지위');
ok(flat(doc).includes('작성자 = 응시 모델'), '「작성자 = 응시 모델」 문구가 있다');
say('');

say(fails === 0 ? '결과: 전부 통과 (exit 0)' : `결과: 실패 ${fails} (exit 1)`);
process.exit(fails === 0 ? 0 : 1);
