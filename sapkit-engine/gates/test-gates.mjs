/**
 * 게이트 자체의 음성시험 — **이 게이트가 정말 거부하는가.**
 *
 * 통과만 확인하는 게이트는 통째로 빠져도 초록이다. 여기서는 일부러 망가뜨린
 * 기준을 물려 게이트가 그것을 잡아내는지 본다. 잡아내지 못하면 게이트는
 * 장식이고, 그 사실을 아는 편이 초록 불보다 낫다.
 *
 * 이 파일을 짜는 동안 실제로 두 번 헛짚었다 — 한 번은 종료 코드를 파이프라인이
 * 잘라먹었고, 한 번은 줄바꿈 형식 때문에 변형이 적용조차 되지 않았는데 초록으로
 * 보였다. 그래서 여기서는 **변형이 실제로 적용됐는지부터** 확인한다.
 *
 * PowerShell로 실행할 것.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { createReport, firstDifference, tempDir, cleanupTempDirs } from './lib.mjs';
import { CAPTURED_PATH, run as runSurface } from './surface.mjs';

const report = createReport('게이트 음성시험');

// ── ① 깊은 비교기가 정말 차이를 찾는가 ──────────────────────────────────────
report.check(
  '같은 값에는 차이가 없다고 답한다',
  firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }) === null,
);
report.check(
  '중첩된 한 글자 차이를 경로와 함께 짚는다',
  (firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] }) ?? '').includes('/a/1/b'),
  firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] }) ?? '(차이 없음이라 답했다)',
);
report.check(
  '키가 한쪽에만 있어도 차이로 잡는다',
  firstDifference({ a: 1, b: 2 }, { a: 1 }) !== null,
);

// ── ② 누적기가 실패를 삼키지 않는가 ─────────────────────────────────────────
{
  const probe = createReport('probe');
  probe.check('통과', true);
  probe.check('실패', false);
  const originalLog = console.log;
  console.log = () => {};
  const verdict = probe.print();
  console.log = originalLog;
  report.check('하나라도 실패하면 전체가 실패다', verdict === false, `print()가 ${verdict}를 냈다`);
}

// ── ③ 표면 게이트가 망가진 기준을 잡아내는가 ────────────────────────────────
const original = JSON.parse(fs.readFileSync(CAPTURED_PATH, 'utf8'));

/** 원본을 건드리지 않고, 망가뜨린 사본의 경로를 돌려준다. */
function corrupt(mutate, label) {
  const copy = JSON.parse(JSON.stringify(original));
  mutate(copy);
  const applied = JSON.stringify(copy) !== JSON.stringify(original);
  report.check(`변형이 실제로 적용됐다 (${label})`, applied);
  const file = path.join(tempDir('sapkit-gate-neg-'), 'm1-tools.json');
  fs.writeFileSync(file, JSON.stringify(copy, null, 2), 'utf8');
  return file;
}

async function expectFailure(capturedPath, label) {
  const originalLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await runSurface({ capturedPath });
  } finally {
    console.log = originalLog;
  }
  const failed = result.failed.length;
  report.check(`${label} → 게이트가 잡아낸다`, failed > 0, `실패 ${failed}건`);
  return result;
}

// ③-a 설명 문구 한 글자가 바뀌면 잡아야 한다.
await expectFailure(
  corrupt((c) => {
    c.m1.GetInclude.description = `${c.m1.GetInclude.description} (변형)`;
  }, '설명 문구'),
  '채록본의 설명이 실제와 다르다',
);

// ③-b 인자 하나가 사라지면 잡아야 한다 — 이름만 세는 게이트는 이걸 놓친다.
await expectFailure(
  corrupt((c) => {
    delete c.m1.GetSqlQuery.inputSchema.properties.row_number;
  }, '인자 정의'),
  '채록본의 인자 정의가 실제와 다르다',
);

// ③-c 채록본에만 있는 도구가 있으면 잡아야 한다(신 엔진 쪽 누락과 같은 모양).
await expectFailure(
  corrupt((c) => {
    c.m1.ZZZ_NotBuilt = { name: 'ZZZ_NotBuilt', description: '없는 도구', inputSchema: {} };
  }, '미구현 도구'),
  '채록본에 있는데 신 엔진이 안 내놓는다',
);

// ── ④ 그리고 멀쩡한 기준에는 통과해야 한다 (과수리 역검증) ──────────────────
{
  const originalLog = console.log;
  console.log = () => {};
  const clean = await runSurface();
  console.log = originalLog;
  report.check(
    '멀쩡한 기준에는 통과한다 (과수리 역검증)',
    clean.failed.length === 0,
    `실패 ${clean.failed.length}건`,
  );
}

cleanupTempDirs();
process.exit(report.print() ? 0 : 1);
