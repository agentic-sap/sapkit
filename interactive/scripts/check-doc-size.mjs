#!/usr/bin/env node
// check-doc-size.mjs — 웜 레이어 문서의 **줄 수 상한** 게이트.
// 설계 `docs/reference/designs/2026-08-23-project-brain-design.md` §3 (처방 2) · 판B.
//
// ─────────────────────────── 이 게이트의 주장 ──────────────────────────────
// 세션마다 읽히는 문서가 불어나면 **살아있는 규칙이 과거 기록 사이에 묻힌다.**
// 판B 착수 시점의 실측이 그것이다 — `HANDOFF.md` 4,808줄 · `docs/RUN-PLAN.md`
// 1,964줄. 둘 다 「재개점」과 「판 큐」라는 짧은 실무 정보를 들라고 있는 문서인데,
// 그 앞에 수천 줄의 완료 기록이 쌓여 회수가 불안정해졌다.
//
// 그래서 이 게이트가 세는 것은 하나다:
//
//   대상 문서가 **상한 줄 수를 넘지 않는다.**
//
// ⚠ **상한만 잰다.** 수술의 목표치(HANDOFF 300 · RUN-PLAN 200)는 여기 넣지 않는다 —
// 목표는 사람이 겨누는 값이고 게이트가 겨누면 정상 갱신마다 red가 된다. 임계값은
// 아래 LIMITS 상수 하나뿐이고, 조정 가능하다(조정은 계약 변경이므로 커밋에 사유를
// 남긴다).
//
// ── 측정 정의 (이 구현이 정본이다) ─────────────────────────────────────────
//   물리 줄 수 = 파일 안의 **개행 문자(LF) 개수** — `wc -l` 동등.
//   ⚠ 그러므로 마지막 줄이 개행으로 끝나지 않으면 그 줄은 세지 않는다. 이 레포의
//     문서는 전부 개행으로 끝나므로 실무상 차이가 없고, 차이가 나더라도 **상한
//     게이트라 느슨해지는 쪽**(≤1줄)이라 안전 방향이다.
//   ⚠ PowerShell의 `Get-Content | Measure-Object -Line`은 **빈 줄을 세지 않는다** —
//     그 값으로 이 게이트를 예측하지 말 것(실제로 HANDOFF에서 101줄 어긋났다).
//
// 대상 파일이 **없으면 위반**이다. 통과만 하는 장식 게이트가 되지 않기 위해서다.
//
// exit 0 통과 / 1 위반
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --root <dir>: 스캔 루트 override. 음성시험이 복제 트리를 먹이기 위한 것.
const rootIdx = process.argv.indexOf('--root');
const ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(HERE, '..', '..');

// ── 임계값 (tunable — 여기가 유일한 자리다) ────────────────────────────────
const LIMITS = [
  { file: 'HANDOFF.md', max: 500, archive: 'docs/reference/handoff-archive/' },
  { file: 'docs/RUN-PLAN.md', max: 300, archive: 'docs/reference/run-archive/' },
];

/** 물리 줄 수 = LF 개수 (`wc -l` 동등). 위 「측정 정의」가 이 함수다. */
function countPhysicalLines(abs) {
  const buf = fs.readFileSync(abs);
  let n = 0;
  for (let i = 0; i < buf.length; i += 1) if (buf[i] === 0x0a) n += 1;
  return n;
}

const rows = [];
const fail = [];

for (const limit of LIMITS) {
  const abs = path.join(ROOT, ...limit.file.split('/'));
  if (!fs.existsSync(abs)) {
    rows.push({ file: limit.file, lines: null, max: limit.max });
    fail.push(`${limit.file} — 대상 파일이 없다. 개명·이동됐으면 이 게이트의 LIMITS를 함께 고칠 것.`);
    continue;
  }
  const lines = countPhysicalLines(abs);
  rows.push({ file: limit.file, lines, max: limit.max });
  if (lines > limit.max) {
    fail.push(
      `${limit.file} — ${lines}줄 (상한 ${limit.max} · ${lines - limit.max}줄 초과). ` +
        `줄이는 방법은 삭제가 아니라 **이사**다: 과거 기록을 \`${limit.archive}\`로 ` +
        `§ 번호·블록인용 접두어를 보존한 채 옮기고, 남는 문서에는 아카이브 포인터 한 줄을 남긴다.`,
    );
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log(`스캔 루트   : ${ROOT}`);
console.log(`측정 정의   : 물리 줄 수 = 개행(LF) 개수 · wc -l 동등`);
for (const r of rows) {
  const shown = r.lines === null ? '부재' : String(r.lines);
  const mark = r.lines === null || r.lines > r.max ? '❌' : 'OK';
  console.log(`  ${mark} ${r.file.padEnd(20)} ${shown.padStart(6)} / 상한 ${r.max}`);
}

if (fail.length) {
  console.log(`\n❌ 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 줄 수 게이트 통과 — 웜 레이어 문서가 상한 안에 있다');
