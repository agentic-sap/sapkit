#!/usr/bin/env node
// 84-selfcheck.mjs — 하네스 필요성 검토 감사 문서의 자가 대조 (기계 몫)
//
// 사용(레포 루트 · PowerShell):
//   node docs/reference/audits/2026-11-05-harness-necessity-review-data/84-selfcheck.mjs
// 종료 코드: 0 = 전부 통과 · 1 = 하나라도 실패.
//
// 지키는 것
//   - 내장 모듈만 쓴다(node:fs · node:path · node:os · node:url). 어떤 파일도 고치지 않는다.
//   - 출력은 수 · 판정 · 레포 상대 경로만이다. 금지 문자열은 찾기만 하고 그 글자 자체는 찍지 않는다
//     (이 출력이 84-selfcheck.txt에 그대로 붙는다).
//   - 금지 문자열은 이 파일 안에도 글자 그대로 두지 않는다 — 실행 중에 조립하거나(웹 주소 머리 · 작업 폴더 이름 ·
//     기준선 서버 꾸러미 이름), 환경에서 읽거나(홈 경로 · 사용자 이름 · 레포 위치), 자료 파일에서 읽는다
//     (다른 프로젝트 · 프로파일 이름 — 00 머리 12 · 14행).
//
// 재는 것 (감사 문서 = ../2026-11-05-harness-necessity-review.md)
//   [1] 머리 · 절 — 머리 세 줄 · 첫 절이 §0 · §0~§8 차례 · §8은 회수 기록(8.1 · 8.2 · 8.3 차례)
//   [2] 층별 표(§4) — 16층 전부 · 증거/처방 표의 행 ID 일치 · 처방 다섯 어휘 · 적용 대상 · 제거 불가 행의 처방 ·
//       집 규칙 = 유지 · 제거 행의 조건 · §8.2의 처방 행 수와 갈린 자리 표가 처방 표와 같다(리뷰 회수 때 더함)
//   [3] 선 — §2.2~§2.3의 선 문언이 D-156 원문에 있다 · §3의 판정 칸을 그 선으로 다시 매겨 문서와 대조
//   [4] 상대 링크 전수 실재
//   [5] 금지 문자열 스캔 — 감사 문서 · 84-selfcheck.txt · 이 파일
//   [6] D-번호 실재 · 문서 안 절 참조(§N.M · §6 ①~⑩) 실재
//   [7] 옮긴 수치가 원자료 파일에도 있다
//   [8] 나라 · 업종 문항의 절 분포(10의 key_source → 그 줄 위 가장 가까운 「## 」 제목) ↔ §3.3 범위 표

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DATA = path.dirname(SELF);
const ROOT = path.resolve(DATA, '..', '..', '..', '..');
const DOC = path.resolve(DATA, '..', '2026-11-05-harness-necessity-review.md');
const TXT = path.join(DATA, '84-selfcheck.txt');
const DECISIONS = path.join(ROOT, 'docs', 'reference', 'DECISIONS.md');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ');
const doc = read(DOC);
const L = doc.split('\n');

let fails = 0;
const say = (s = '') => console.log(s);
const ok = (cond, label, detail = '') => {
  if (!cond) fails++;
  say(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
  return cond;
};

say(`84-selfcheck — 대상 ${rel(DOC)}`);
say('');

// ── [1] 머리 · 절 ──────────────────────────────────────────────────────────────
say('[1] 머리 · 절');
const head = L.slice(0, 8).join('\n');
ok(/^> 작성일: /m.test(head) && /^> 상태: /m.test(head) && /^> 실행 분류: /m.test(head), '머리 세 줄(작성일 · 상태 · 실행 분류)');
const h2 = L.map((l, i) => [l, i + 1]).filter(([l]) => /^## /.test(l));
ok(h2.length > 0 && /^## 0\. /.test(h2[0][0]), '첫 절이 §0(결론 맨 앞)', h2.length ? `${h2[0][1]}행` : '절 없음');
const order = h2.map(([l]) => (l.match(/^## (\d+)\./) || [])[1] ?? '?').join(' ');
ok(order === '0 1 2 3 4 5 6 7 8', '절 §0~§8이 차례로 있다', order);
const s8 = h2.find(([l]) => /^## 8\./.test(l));
// 리뷰 회수 전에는 「§8은 자리만(제목 뒤 내용 1줄)」을 쟀다. 회수가 §8을 채운 뒤로는 하위 절 차례를 잰다.
const h3in8 = s8 ? L.slice(s8[1]).filter((l) => /^### 8\.\d /.test(l)).map((l) => l.match(/^### (8\.\d) /)[1]).join(' ') : '';
ok(h3in8 === '8.1 8.2 8.3', '§8은 회수 기록 — 8.1 Codex 교차 리뷰 · 8.2 갈린 자리 · 8.3 새-컨텍스트 독립 리뷰가 차례로 있다', h3in8 || '하위 절 없음');
say('');

// ── 표 읽기 ────────────────────────────────────────────────────────────────────
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const T = [];
{
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
}
const col = (t, name) => t.head.indexOf(name);
const strip = (s) => (s ?? '').replace(/\*\*/g, '').trim();
const num = (s) => {
  const m = String(s).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

// ── [2] 층별 표 ────────────────────────────────────────────────────────────────
say('[2] 층별 표(§4) — H-3');
const EV = T.filter((t) => t.head[0] === 'ID' && t.head.includes('전제 적용'));
const RX = T.filter((t) => t.head[0] === 'ID' && ['처방', '적용 대상', '제거 불가'].every((h) => t.head.includes(h)));
ok(EV.length === 2 && RX.length === 2, '증거 표 2 · 처방 표 2(제품 §4.2 · §4.3 / 공방 §4.5)', `증거 ${EV.length} · 처방 ${RX.length}`);

const LAYERS = ['L1', "L1'", 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'W1', 'W2', 'W3', 'W4', 'W5'];
const layerOf = (id) => (id.match(/^(L1'|L\d{1,2}|W\d)(?:-[a-z]\d?)?$/) || [])[1] ?? null;
const WORDS = ['유지', '축소', '스위치화', '제거', '측정 후 결정'];
const TARGETS = ['모든 사용자 기본값', '스위치', '소유자 설정'];
const wordOf = (s) => WORDS.find((w) => strip(s) === w || strip(s).startsWith(`${w} `) || strip(s).startsWith(`${w}(`));

const evIds = EV.flatMap((t) => t.rows.map((r) => r.c[0]));
const rxRows = RX.flatMap((t) => t.rows.map((r) => ({ t, r })));
const rxIds = rxRows.map(({ r }) => r.c[0]);
ok(JSON.stringify(evIds) === JSON.stringify(rxIds), '증거 표와 처방 표의 행 ID가 같은 순서로 같다', `${rxIds.length}행`);
const badCols = [...EV, ...RX].flatMap((t) => t.rows.filter((r) => r.c.length !== t.head.length).map((r) => r.line));
ok(badCols.length === 0, '모든 행의 칸 수 = 머리 칸 수', badCols.length ? `어긋난 줄 ${badCols.join(',')}` : `${EV.length + RX.length}표`);

const byLayer = Object.fromEntries(LAYERS.map((x) => [x, []]));
const unread = [];
for (const id of rxIds) {
  const ly = layerOf(id);
  if (ly && byLayer[ly]) byLayer[ly].push(id);
  else unread.push(id);
}
ok(unread.length === 0, '모든 행 ID가 16층 중 하나로 읽힌다', `못 읽은 ID ${unread.length}`);
const absent = LAYERS.filter((x) => byLayer[x].length === 0);
ok(absent.length === 0, "16층(L1 L1' L2~L10 W1~W5) 전부 표에 있다", absent.length ? `빠진 층 ${absent.join(' ')}` : LAYERS.map((x) => `${x}×${byLayer[x].length}`).join(' '));

say('  처방 표 — 행마다 「ID · 처방 · 적용 대상 · 제거 불가」');
const tally = {};
let emptyRx = 0, badWord = 0, badTarget = 0, badNr = 0, emptyOther = 0, nrViol = 0, houseViol = 0, removeViol = 0;
for (const { t, r } of rxRows) {
  const g = (n) => r.c[col(t, n)] ?? '';
  const id = g('ID'), layer = g('층'), rx = g('처방'), tgt = g('적용 대상'), weak = g('약한 모델 영향'), nr = g('제거 불가'), why = g('근거');
  const w = wordOf(rx);
  const tg = TARGETS.find((x) => strip(tgt).startsWith(x));
  const nrv = ['예', '부분', '—'].find((x) => strip(nr).startsWith(x));
  if (!strip(rx)) emptyRx++;
  if (!w) badWord++;
  if (!tg) badTarget++;
  if (!nrv) badNr++;
  if (!strip(weak) || !strip(why)) emptyOther++;
  if ((nrv === '예' || nrv === '부분') && (!['유지', '축소', '스위치화'].includes(w) || rx.includes('제거'))) nrViol++;
  if (layer.includes('집 규칙') && w !== '유지') houseViol++;
  if (w === '제거' && !(tg === '모든 사용자 기본값' && nrv === '—' && !layer.includes('집 규칙'))) removeViol++;
  tally[w ?? '?'] = (tally[w ?? '?'] || 0) + 1;
  say(`    ${id.padEnd(6)} ${String(w ?? '?').padEnd(7)} · ${String(tg ?? '?').padEnd(10)} · 제거 불가 ${nrv ?? '?'}   (${r.line}행)`);
}
say(`  처방 어휘별 행 수: ${WORDS.map((w) => `${w} ${tally[w] || 0}`).join(' · ')}${tally['?'] ? ` · 못 읽음 ${tally['?']}` : ''}`);
ok(emptyRx === 0, '빈 처방 칸 0', `${emptyRx}`);
ok(badWord === 0, '처방 칸이 다섯 어휘(유지 · 축소 · 스위치화 · 제거 · 측정 후 결정) 중 하나로 시작한다(나눈 층은 하위 행마다)', `어긋남 ${badWord}`);
ok(badTarget === 0, '적용 대상이 셋(모든 사용자 기본값 · 스위치 · 소유자 설정) 중 하나로 시작한다', `어긋남 ${badTarget}`);
ok(badNr === 0, '제거 불가 칸이 예 · 부분 · — 중 하나로 시작한다', `어긋남 ${badNr}`);
ok(emptyOther === 0, '약한 모델 영향 · 근거 칸이 비어 있지 않다', `빈 칸 ${emptyOther}`);
ok(nrViol === 0, '제거 불가(예 · 부분) 행의 처방은 유지 · 축소 · 스위치화뿐이고 처방 칸에 「제거」 글자가 없다', `위반 ${nrViol}`);
ok(houseViol === 0, '집 규칙 행(층 칸에 「집 규칙」)의 처방은 유지', `위반 ${houseViol}`);
const l1p = rxRows.find(({ r }) => r.c[0] === "L1'");
ok(!!l1p && wordOf(l1p.r.c[col(l1p.t, '처방')]) === '유지', "L1' = 유지");
ok(removeViol === 0, '제거 행은 적용 대상 = 모든 사용자 기본값 · 제거 불가 = — · 집 규칙 아님', `위반 ${removeViol}`);
// 리뷰 회수 때 더함 — §8.2가 적은 처방 행 수 · 갈린 자리 표의 「지금 문서」 칸이 처방 표와 같은가
const tallyText = `유지 ${tally['유지'] || 0} · 축소 ${tally['축소'] || 0} · 제거(후보) ${tally['제거'] || 0} · 측정 후 결정 ${tally['측정 후 결정'] || 0}`;
ok(doc.replace(/\s+/g, ' ').includes(tallyText), '§8.2가 적은 처방 행 수가 처방 표에서 센 값과 같다', tallyText);
const t82 = T.find((t) => t.head[0] === '자리' && t.head.includes('지금 문서'));
let n82 = 0, bad82 = 0;
for (const r of t82 ? t82.rows : []) {
  const hit = rxRows.find(({ r: x }) => x.c[0] === r.c[0]);
  if (!hit) continue;
  n82++;
  if (wordOf(hit.r.c[col(hit.t, '처방')]) !== wordOf(r.c[col(t82, '지금 문서')])) bad82++;
}
ok(!!t82 && n82 > 0 && bad82 === 0, `§8.2 갈린 자리 표의 「지금 문서」 칸이 처방 표와 같다(층 행 ${n82})`, `어긋남 ${bad82}`);
say('');

// ── [3] 선 ─────────────────────────────────────────────────────────────────────
say('[3] 선 — D-156 원문 ↔ 감사 문서 §2.2~§2.3 · §3 판정 재계산 (H-2)');
const dec = read(DECISIONS);
const d156s = dec.indexOf('\n## D-156');
const d156e = dec.indexOf('\n## D-', d156s + 5);
const D156 = flat(d156s < 0 ? '' : dec.slice(d156s, d156e < 0 ? undefined : d156e));
ok(D156.length > 0, 'D-156 원문을 DECISIONS.md에서 찾음');
const secText = (n) => {
  const s = L.findIndex((l) => l.startsWith(`### ${n} `));
  if (s < 0) return '';
  let e = L.findIndex((l, i) => i > s && /^#{2,3} /.test(l));
  if (e < 0) e = L.length;
  return L.slice(s, e).join('\n');
};
const S223 = flat(secText('2.2') + '\n' + secText('2.3'));
const PAIRS = [
  ['⑴ 이미 안다', ['전체 ≥ 95% 그리고 비싼 항목', '오답 0 = 「이미 안다」'], ['≥ 95% 그리고 비싼 오답 0 = 이미 안다']],
  ['⑴ 측정 후 결정', ['전체 90~95% 또는 비싼 항목 오답 1 = 측정 후 결정'], ['90~95% 또는 비싼 오답 1 = 측정 후 결정']],
  ['⑴ 아직 필요', ['그 아래 = 「아직 필요」'], ['그 아래 = 아직 필요']],
  ['⑴ 분모 60 고정', ['분모 = 표본 60 고정'], ['분모 = 표본 60 고정']],
  ['⑴ 범주별 같은 선', ['범주별(모듈 · 국가 · 업종 · ABAP 일반 작법)로도 같은 선'], ['범주별로도 같은 선']],
  ['비싼 항목의 뜻', ['비싼 항목(세법 · 국가 규정 · 이송 · 삭제 · 보안 · 개인정보)'], ['세법 · 국가 규정 · 이송 · 삭제 · 보안 · 개인정보']],
  ['⑵ 오류급의 뜻', ['`lint`의 Error ∪ `parse` 종료 코드 ≠ 0 ∪ `analyze`의 high'], ['`lint`의 Error ∪ `parse` 종료 코드 ≠ 0 ∪ `analyze`의 high']],
  ['⑵ 통과', ['∧ 일반 작법 위반 0 = 통과'], ['통과 = 검사기 오류급 0 그리고 일반 작법 위반 0']],
  ['⑵ 5/5', ['5/5 = 「이미 잘 짠다」'], ['5/5 = 이미 잘 짠다']],
  ['⑵ 4/5', ['4/5 = 측정 후 결정'], ['4/5 = 측정 후 결정']],
  ['⑵ 3/5 이하', ['3/5 이하 = 「아직 필요」'], ['3/5 이하 = 아직 필요']],
  ['⑶ ÷4로 판정', ['바이트÷4 값으로 판정 · 토크나이저는 병기만'], ['토큰 판정은 ÷4 값으로만 했다', '토크나이저 값은 병기만 했다']],
  ['⑶-ⓐ 제품 세션 고정', ['제품 세션 고정 증분(MCP 도구 설명 제외) ≤ 3k 가볍다 · > 8k 과함'], ['제품 세션 고정 증분(MCP 도구 설명 제외)', '≤ 3k 가볍다', '> 8k 과함']],
  ['⑶-ⓑ 도구 설명', ['MCP 도구 설명 평균 ≤ 500 B/도구 가볍다(D-105 실측 740 B 수준이면 축소 후보)'], ['≤ 500 B/도구 가볍다', 'D-105 실측 740 B 수준이면 축소 후보']],
  ['⑶-ⓒ 절차 1회', ['절차 1회 호출 적재 ≤ 15k 가볍다 · > 30k 축소 후보'], ['≤ 15k 가볍다', '> 30k 축소 후보']],
  ['⑶-ⓓ 공방 세션 고정', ['공방 세션 고정 ≤ 10k 가볍다 · > 20k 과함'], ['≤ 10k 가볍다', '> 20k 과함']],
  ['⑶ 사이', ['사이는 측정 후 결정'], ['| 측정 후 결정 |']],
  ['⑷ 사람 시간', ['「유도 가능」 비율 > 20%(분모 = 그 절차의 멈추는 자리 전체) = 축소 후보'], ['「유도 가능」 비율(분모 = 그 절차의 멈추는 자리 전체)', '> 20% = 축소 후보']],
  ['⑸ Opus ✗', ['Opus ✗ → 유지'], ['| Opus ✗ | 유지 |']],
  ['⑸ Opus ✓ Sonnet ✗', ['Opus ✓ Sonnet ✗ → 스위치화(기본 켜짐)'], ['| Opus ✓ · Sonnet ✗ | 스위치화(기본 켜짐) |']],
  ['⑸ 둘 다 ✓', ['둘 다 ✓ → 제거 후보(제거 불가·집 규칙 제외 · 집행은 별판)'], ['| Opus ✓ · Sonnet ✓ | 제거 후보(제거 불가 · 집 규칙 제외', '집행은 별판)']],
  ['⑸ Codex ✗', ['Codex ✗인데 Claude 둘 다 ✓ → 스위치화(3사 중립)'], ['| Claude 둘 다 ✓ · Codex ✗ | 스위치화(3사 중립']],
  ['⑸ 선 근처', ['선 근처 → 측정 후 결정'], ['| 선 근처 | 측정 후 결정 |']],
  ['⑸ 사고로만 재는 층', ['사고로만 재는 층(절차의 모델 행동 규범 · 리뷰 루프)은 두 모델 규칙 밖'], ['사고로만 재는 층(절차의 모델 행동 규범 · 리뷰 루프)', '두 모델 규칙을 쓰지 않고']],
];
const pairBad = [];
for (const [name, dS, docS] of PAIRS) {
  const inD = dS.every((s) => D156.includes(s));
  const inDoc = docS.every((s) => S223.includes(s));
  if (!inD || !inDoc) pairBad.push(`${name}(${inD ? '' : 'D-156에 없음 '}${inDoc ? '' : '문서에 없음'})`);
}
ok(pairBad.length === 0, `선 문언 ${PAIRS.length}조각 — D-156 원문에도 있고 감사 문서 §2.2~§2.3에도 있다(선 변경 0)`, pairBad.length ? pairBad.join(' · ') : `${PAIRS.length}/${PAIRS.length}`);

const tIn = (prefix, pred) => T.find((t) => t.heading.startsWith(prefix) && pred(t));

// §3.1 토큰
const t31 = tIn('3.1 ', (t) => t.head[0] === '선' && t.head.includes('÷4'));
const LINE3 = {
  '⑶-ⓐ': (v) => (v <= 3000 ? '가볍다' : v > 8000 ? '과함' : '측정 후 결정'),
  '⑶-ⓑ': (v) => (v <= 500 ? '가볍다' : v >= 740 ? '축소 후보' : '측정 후 결정'),
  '⑶-ⓒ': (v) => (v <= 15000 ? '가볍다' : v > 30000 ? '축소 후보' : '측정 후 결정'),
  '⑶-ⓓ': (v) => (v <= 10000 ? '가볍다' : v > 20000 ? '과함' : '측정 후 결정'),
};
let n31 = 0, bad31 = 0;
for (const r of t31 ? t31.rows : []) {
  const [line, cell, q, verdict] = r.c;
  if (line.includes('(참고)')) continue;
  const key = Object.keys(LINE3).find((k) => line.startsWith(k));
  if (!key) continue;
  const v = num(q);
  const want = LINE3[key](v);
  const good = verdict.includes(want);
  n31++;
  if (!good) bad31++;
  say(`    ${key} ${strip(cell).split(' — ')[0].slice(0, 30).padEnd(30)} ÷4 ${String(v).padStart(6)} → ${want}${good ? '' : '  ≠ 문서'}   (${r.line}행)`);
}
ok(!!t31 && n31 > 0 && bad31 === 0, `§3.1 토큰 — 판정 칸 ${n31}개를 선 ⑶으로 다시 매김(⑶-ⓑ의 「740 B 수준」은 740 이상으로 읽음)`, `어긋남 ${bad31}`);

// §3.2 사람 시간
const t32 = tIn('3.2 ', (t) => t.head.includes('유도 가능 비율'));
let n32 = 0, bad32 = 0;
for (const r of t32 ? t32.rows : []) {
  const [name, stops, user, der, safe, pct, verdict] = r.c;
  const [S, U, D, F, P] = [stops, user, der, safe, pct].map(num);
  const sumOk = U + D + F === S;
  const pctOk = Math.abs((D / S) * 100 - P) < 0.05;
  const want = P > 20 ? '축소 후보' : '적정';
  const vOk = name === '합계' ? true : strip(verdict).startsWith(want);
  n32++;
  if (!(sumOk && pctOk && vOk)) bad32++;
  say(`    ${name.padEnd(15)} ${D}/${S} = ${((D / S) * 100).toFixed(1)}% → ${name === '합계' ? '(합계 — 판정 없음)' : want}${sumOk ? '' : '  세 갈래 합 ≠ 멈추는 자리'}${pctOk ? '' : '  비율 ≠ 문서'}${vOk ? '' : '  ≠ 문서'}   (${r.line}행)`);
}
ok(!!t32 && n32 > 0 && bad32 === 0, `§3.2 사람 시간 — ${n32}행을 선 ⑷(> 20%)로 다시 매김 · 세 갈래 합과 비율 검산`, `어긋남 ${bad32}`);

// §3.3 지식 — 모델별 · 범주별
const items = JSON.parse(read(path.join(DATA, '10-knowledge-items.json'))).items;
const catN = {}, catExp = {};
for (const it of items) {
  catN[it.category] = (catN[it.category] || 0) + 1;
  if (it.expensive) catExp[it.category] = (catExp[it.category] || 0) + 1;
}
const readAgg = (p, e) => (p >= 95 && e === 0 ? '이미 안다' : e >= 2 ? '아직 필요' : p >= 90 ? '측정 후 결정' : '아직 필요');
const readLit = (p, e) => (p >= 95 && e === 0 ? '이미 안다' : (p >= 90 && p < 95) || e === 1 ? '측정 후 결정' : '아직 필요');
const frac = (s) => {
  const m = String(s).match(/(\d+)\/(\d+) = ([\d.]+)%/);
  return m ? { a: +m[1], b: +m[2], p: +m[3] } : null;
};
let cells33 = 0, bad33 = 0, split33 = 0;
const t33a = tIn('3.3 ', (t) => t.head.includes('엄격(분모 60)'));
for (const r of t33a ? t33a.rows : []) {
  const f = frac(r.c[1]);
  const e = num(r.c[2]);
  const verdict = strip(r.c[3]);
  const good = !!f && f.b === 60 && Math.abs((f.a / f.b) * 100 - f.p) < 0.05 && readAgg(f.p, e) === verdict;
  if (f && readAgg(f.p, e) !== readLit(f.p, e)) split33++;
  cells33++;
  if (!good) bad33++;
  say(`    ${r.c[0].padEnd(18)} ${f ? `${f.a}/${f.b} = ${f.p.toFixed(1)}%` : '?'} · 비싼 오답 ${e} → ${f ? readAgg(f.p, e) : '?'}${good ? '' : '  ≠ 문서'}   (${r.line}행)`);
}
const t33b = tIn('3.3 ', (t) => t.head[0] === '범주' && t.head.includes('Opus 5.5'));
const CAT = { '모듈': 'module', '나라': 'country', '업종': 'industry', 'ABAP 일반 작법': 'abap' };
const expand = (s) => {
  const m = strip(s).match(/^(.+?) ×3$/);
  return m ? [m[1], m[1], m[1]] : strip(s).split(' · ').map((x) => x.trim());
};
for (const r of t33b ? t33b.rows : []) {
  const label = r.c[0].replace(/\(\d+\)$/, '');
  const n = num(r.c[0].match(/\((\d+)\)$/)?.[1] ?? '');
  const key = CAT[label];
  const verdicts = expand(r.c[col(t33b, '판정')]);
  const models = ['Opus 5.5', 'Sonnet 5.5', 'Codex gpt-5.6-sol'];
  const parts = [];
  models.forEach((m, k) => {
    const f = frac(r.c[col(t33b, m)]);
    // 범주별 비싼 오답: 비싼 항목이 없는 범주는 0 · 있으면 만점일 때만 0으로 셀 수 있다(아니면 판정 불가)
    const e = !key ? NaN : !catExp[key] ? 0 : f && f.a === f.b ? 0 : NaN;
    const good = !!f && f.b === n && n === catN[key] && !Number.isNaN(e) && readAgg(f.p, e) === verdicts[k];
    if (f && !Number.isNaN(e) && readAgg(f.p, e) !== readLit(f.p, e)) split33++;
    cells33++;
    if (!good) bad33++;
    parts.push(`${f ? `${f.a}/${f.b}` : '?'}→${f && !Number.isNaN(e) ? readAgg(f.p, e) : '?'}${good ? '' : '(≠ 문서)'}`);
  });
  say(`    ${label.padEnd(18)} 분모 ${n}(10의 범주 문항 ${catN[key] ?? '?'}) · ${parts.join(' · ')}   (${r.line}행)`);
}
say(`    비싼 항목: ${Object.entries(catExp).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'} (10의 expensive=true · 전체 ${items.length}문항)`);
ok(cells33 === 15 && bad33 === 0, `§3.3 지식 — 주 판정 ${cells33}칸(모델별 3 + 범주별 12)을 선 ⑴로 다시 매김`, `어긋남 ${bad33}`);
ok(split33 === 0, '「또는」의 두 읽기(집계 · 문자 그대로)가 갈리는 주 판정 칸 0(§7.7)', `${split33}칸`);

// §3.4 코드
const t34 = tIn('3.4 ', (t) => t.head.includes('통과(5과제)'));
let n34 = 0, bad34 = 0;
for (const r of t34 ? t34.rows : []) {
  const m = r.c[1].match(/^(\d+)\/(\d+)/);
  const a = m ? +m[1] : NaN, b = m ? +m[2] : NaN;
  const want = a === 5 ? '이미 잘 짠다' : a === 4 ? '측정 후 결정' : '아직 필요';
  const good = b === 5 && strip(r.c[2]) === want;
  n34++;
  if (!good) bad34++;
  say(`    ${r.c[0].padEnd(18)} ${a}/${b} → ${want}${good ? '' : '  ≠ 문서'}   (${r.line}행)`);
}
ok(!!t34 && n34 === 3 && bad34 === 0, `§3.4 코드 — ${n34}모델을 선 ⑵(5/5 · 4/5 · 3/5 이하)로 다시 매김`, `어긋남 ${bad34}`);
say('');

// ── [4] 상대 링크 ───────────────────────────────────────────────────────────────
say('[4] 상대 링크 전수 실재');
const links = [...doc.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
const relLinks = links.filter((u) => !u.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(u));
const uniq = [...new Set(relLinks)];
const missingLinks = [];
for (const u of uniq) {
  const target = path.resolve(path.dirname(DOC), decodeURI(u.split('#')[0]));
  const there = fs.existsSync(target);
  if (!there) missingLinks.push(u);
  say(`    ${there ? 'OK  ' : 'FAIL'} ${u} ×${relLinks.filter((x) => x === u).length}`);
}
ok(missingLinks.length === 0 && links.length === relLinks.length, `링크 ${links.length}개(서로 다른 대상 ${uniq.length}) — 전부 상대 경로 · 전부 실재`, `없음 ${missingLinks.length} · 상대 경로 아님 ${links.length - relLinks.length}`);
say('');

// ── [5] 금지 문자열 ─────────────────────────────────────────────────────────────
say('[5] 금지 문자열 스캔 — 찾은 수만 찍는다');
const J = (...p) => p.join('');
const lc = (s) => s.toLowerCase();
const sw = read(path.join(DATA, '00-switches.txt')).split('\n');
const grab = (line) => {
  const m = (line || '').match(/\(([^()]*)\)\s*$/);
  if (!m) return [];
  const inner = m[1].includes(':') ? m[1].split(':').slice(1).join(':') : m[1];
  return inner.split('·').map((s) => s.trim()).filter(Boolean);
};
const NAMES = [...grab(sw[11]), ...grab(sw[13])];
ok(NAMES.length === 8, '다른 프로젝트 · 프로파일 이름을 00 머리(12 · 14행)에서 읽음', `${NAMES.length}개`);
const stems = new Set();
for (const a of NAMES) for (const b of NAMES) {
  if (a === b) continue;
  let k = 0;
  while (k < a.length && k < b.length && lc(a[k]) === lc(b[k])) k++;
  if (k >= 4) stems.add(a.slice(0, k));
}
const home = os.homedir();
const user = os.userInfo().username;
const rootSegs = path.resolve(ROOT).split(/[\\/]/).filter((s) => s.length >= 6 && !/^[A-Za-z]:$/.test(s));
const CORE = [
  ['웹 주소 머리', [J('ht', 'tp')]],
  ['비추적 작업 폴더 이름', [J('dry', 'forge')]],
  ['홈 경로 · 사용자 이름', [home, home.split('\\').join('/'), user, J('Users', '\\'), J('/', 'Users', '/'), J('~', '/'), J('~', '\\')]],
  ['다른 프로젝트 · 프로파일 이름', [...NAMES, ...stems]],
  ['기준선 서버 꾸러미 이름', [J('power', 'up'), J('abap-mcp-', 'adt')]],
  ['레포 위치 경로 조각', rootSegs],
];
const count = (text, needle) => {
  if (!needle) return 0;
  const t = lc(text), n = lc(needle);
  let c = 0, i = 0;
  while ((i = t.indexOf(n, i)) !== -1) { c++; i += n.length; }
  return c;
};
const scanFiles = [DOC, TXT, SELF];
for (const f of scanFiles) {
  if (!fs.existsSync(f)) { say(`    ${rel(f)} — 아직 없음(건너뜀)`); continue; }
  const text = read(f);
  const res = CORE.map(([name, needles]) => [name, needles.reduce((s, n) => s + count(text, n), 0)]);
  const total = res.reduce((s, [, c]) => s + c, 0);
  ok(total === 0, `${rel(f)} — 핵심 금지 문자열 0`, res.map(([n, c]) => `${n} ${c}`).join(' · '));
}
// 감사 문서 본문만 — 내부 과업 이름 · 꼬리표 · 아직 없는 결정 번호
const allowedRef = [];
const LABELS = [
  ['내부 과업 문서 이름(낱말)', /(?<![\w-])(spec|plan)(?![\w-])/gi],
  ['내부 과업 번호', /(?<![\w-])T\d{1,2}(?!\w)/g],
  ['내부 절 꼬리표(영문 한 글자-숫자)', /(?<![\w-])[A-H]-\d(?!\d)/g],
  ['아직 없는 결정 번호', new RegExp(`D-${157 + 1}(?!\\d)`, 'g')],
];
const labelRes = [];
for (const [name, re] of LABELS) {
  let c = 0;
  for (const m of doc.matchAll(re)) {
    const before = doc.slice(Math.max(0, m.index - 3), m.index);
    if (name.startsWith('내부 절') && /^\d\d $/.test(before)) { allowedRef.push(m.index); continue; }
    c++;
  }
  labelRes.push([name, c]);
}
const d157 = [...doc.matchAll(/D-157(?!\d)/g)];
const d157bad = d157.filter((m) => doc.slice(Math.max(0, m.index - 6), m.index) !== '완료 항목 ').length;
labelRes.push(['「완료 항목」 없이 쓴 D-157', d157bad]);
ok(labelRes.every(([, c]) => c === 0), `${rel(DOC)} — 본문 꼬리표 0`, `${labelRes.map(([n, c]) => `${n} ${c}`).join(' · ')} · (허용: 자료 파일 절 인용 「NN X-n」 ${allowedRef.length} · 「완료 항목 D-157」 ${d157.length - d157bad})`);
say('');

// ── [6] D-번호 · 절 참조 ────────────────────────────────────────────────────────
say('[6] D-번호 실재 · 문서 안 절 참조 실재');
const decHeads = new Set([...dec.matchAll(/^## D-(\d{3})\b/gm)].map((m) => m[1]));
const cited = [...new Set([...doc.matchAll(/D-(\d{3})(?!\d)/g)].map((m) => m[1]))].sort();
const notFound = cited.filter((n) => n !== '157' && !decHeads.has(n));
ok(notFound.length === 0, `인용한 D-번호 ${cited.length}종(${cited.map((n) => `D-${n}`).join(' · ')}) — D-157(완료 항목 · 마감 과업이 추가)만 빼고 DECISIONS.md에 제목이 있다`, notFound.length ? `없음 ${notFound.map((n) => `D-${n}`).join(' ')}` : '');
const secHeads = new Set(L.map((l) => (l.match(/^### (\d+\.\d+) /) || [])[1]).filter(Boolean));
const dotted = [...new Set([...doc.matchAll(/§(\d+\.\d+)/g)].map((m) => m[1]))];
const badDotted = dotted.filter((x) => !secHeads.has(x));
ok(badDotted.length === 0, `「§N.M」 참조 ${dotted.length}종 — 전부 이 문서의 「### N.M」 제목이 있다`, badDotted.length ? `없음 ${badDotted.join(' ')}` : '');
const t6 = T.find((t) => t.heading.startsWith('6. ') && t.head[0] === '순서');
const rows6 = new Set((t6 ? t6.rows : []).map((r) => r.c[0]));
const circ = [...new Set([...doc.matchAll(/§6 ([①-⑩])/g)].map((m) => m[1]))];
const badCirc = circ.filter((x) => !rows6.has(x));
ok(!!t6 && rows6.size === 10 && badCirc.length === 0, `§6 후보 표 ${rows6.size}행 · 「§6 ①~⑩」 참조 ${circ.length}종 전부 그 표에 있다`, badCirc.length ? `없음 ${badCirc.join(' ')}` : '');
say('');

// ── [7] 옮긴 수치 ───────────────────────────────────────────────────────────────
say('[7] 옮긴 수치가 원자료에도 있다(감사 문서와 원자료 파일 양쪽에서 같은 글자)');
const COPIED = {
  '83-results.txt': ['307/321', '37/42', '98/107', '36/43', '35/43', '20/25', '16/18', '49/60', '47/60', '48/60', '44/55', '46/55', '42/47', '43/47', '44/47', '19/30', '17/30', '16/16', '6/7', '13/18', '14/18', '15/18', '26/47', '20/47', '54.3', '41.3', '8/8', '7/8', '5/8', '24/40', '22/40', '4/9', '5/9', '1/9', '83.7', '81.4', '88.9', '95.6', '88.1', '91.6'],
  '20-tokens.txt': ['157,482', '71,686', '67,640', '35,118', '60,893', '30,747', '19,463', '31,365', '3,242', '2,744', '141,107', '13,666', '35,277', '30,864', '12,282', '3,047', '1,261', '6,455', '12,967', '253,395', '186,346', '67,049', '16,762', '7,500', '10,777', '22,957', '2,818', '30,049', '4,126', '42,304', '1,374', '77,853', '7,512', '10,576', '12,002', '17,760', '1,617', '152,981', '70,364', '65,391', '34,281', '63,435', '29,487', '3,260', '2,777', '1,058'],
  '30-human-time.txt': ['37.0%', '31.6%', '53.3%', '57.1%', '38.5%', '21.1%', '33.3%'],
};
let nCopied = 0;
const copiedBad = [];
for (const [file, toks] of Object.entries(COPIED)) {
  const src = read(path.join(DATA, file));
  let bad = 0;
  for (const tok of toks) {
    nCopied++;
    if (!doc.includes(tok) || !src.includes(tok)) { bad++; copiedBad.push(`${tok}(${doc.includes(tok) ? '' : '문서에 없음 '}${src.includes(tok) ? '' : `${file.slice(0, 2)}에 없음`})`); }
  }
  say(`    ${file} — ${toks.length - bad}/${toks.length}`);
}
ok(copiedBad.length === 0, `옮긴 수치 ${nCopied}개 — 감사 문서와 원자료 양쪽에 있다`, copiedBad.length ? copiedBad.join(' · ') : '');
say('');

// ── [8] 나라 · 업종 문항의 절 분포 ──────────────────────────────────────────────
say('[8] 나라 · 업종 문항의 절 분포(10의 key_source → 그 줄 위 가장 가까운 「## 」 제목) ↔ §3.3 범위 표');
const LABEL = {
  country: { 'Tax System': '세금', 'Statutory Reporting': '법정 보고', 'e-Invoicing / Fiscal Reporting': '전자 송장과 재정 보고', 'Formats': '형식', 'Master Data Peculiarities': '마스터 데이터', 'Banking / Payments': '은행과 지급', 'SAP Country Version': 'SAP 국가 버전', 'VAT ID Format (EU-wide)': 'VAT 번호 형식(EU 공통 파일)', 'Language & Locale': '언어와 로케일', 'Common Customizations': '흔한 커스터마이징', 'Pitfalls / Anti-patterns': '함정' },
  industry: { 'Key Processes': '핵심 프로세스', 'Master Data Specifics': '마스터 데이터', 'Business Characteristics': '업종 특성', 'Module Implications': '모듈 영향', 'Common Customizations': '흔한 커스터마이징', 'SAP Industry Solutions': 'SAP 업종 솔루션', 'Pitfalls / Anti-patterns': '함정' },
};
const normH = (h) => h.split(' — ')[0].trim();
const t33c = tIn('3.3 ', (t) => t.head[0] === '범주' && t.head.includes('문항을 뽑은 절'));
const rowOf = (prefix) => (t33c ? t33c.rows.find((r) => r.c[0].startsWith(prefix)) : null);
let bad8 = 0;
for (const [cat, prefix] of [['country', '나라'], ['industry', '업종']]) {
  const its = items.filter((i) => i.category === cat);
  const hist = {};
  const filesHeads = {};
  for (const it of its) {
    const fl = read(path.join(ROOT, it.key_source.file)).split('\n');
    let h = '(제목 없음)';
    for (let i = it.key_source.line - 1; i >= 0; i--) if (fl[i].startsWith('## ')) { h = normH(fl[i].slice(3)); break; }
    hist[h] = (hist[h] || 0) + 1;
    for (const x of new Set(fl.filter((l) => l.startsWith('## ')).map((l) => normH(l.slice(3))))) filesHeads[x] = (filesHeads[x] || 0) + 1;
  }
  const row = rowOf(prefix);
  const picked = row ? row.c[1] : '';
  const zero = row ? row.c[2] : '';
  const lines = [];
  for (const [h, c] of Object.entries(hist).sort((a, b) => b[1] - a[1])) {
    const lab = LABEL[cat][h];
    const good = !!lab && picked.includes(`${lab} ${c}`);
    if (!good) bad8++;
    lines.push(`${h} ${c}${good ? '' : '(표와 다름)'}`);
  }
  // 문항 0인 절 — 그 범주 파일 대부분(절반 넘게)에 있는 제목만 대조한다(EU 공통 파일의 고유 절은 묶어서 적었다)
  const common = Object.entries(filesHeads).filter(([h, c]) => c > its.length / 2 && !hist[h]).map(([h]) => h);
  const zeroLines = [];
  for (const h of common) {
    const lab = LABEL[cat][h];
    const good = !!lab && zero.includes(lab);
    if (!good) bad8++;
    zeroLines.push(`${h}${good ? '' : '(표에 없음)'}`);
  }
  say(`    ${prefix} ${its.length}문항 — 뽑은 절: ${lines.join(' · ')}`);
  say(`    ${prefix} — 문항 0인 절(그 범주 파일 절반 넘게에 있는 제목): ${zeroLines.join(' · ') || '없음'}`);
  if (cat === 'industry') say(`    업종 — 시험에 든 업종: ${its.map((i) => i.subcategory).join(' · ')}`);
}
ok(!!t33c && bad8 === 0, '§3.3 「시험이 덮은 범위」 표의 절 이름 · 문항 수가 10에서 다시 센 값과 같다', `어긋남 ${bad8}`);
say('');

say(fails === 0 ? '결과: 전부 통과 (exit 0)' : `결과: 실패 ${fails} (exit 1)`);
process.exit(fails === 0 ? 0 : 1);
