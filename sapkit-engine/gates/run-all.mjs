/**
 * 신 엔진 자체 게이트 일괄 실행기.
 *
 * 제품 게이트(`interactive/scripts/*.mjs`)와는 **묻는 것이 다르다.** 저쪽은 제품이
 * 싣는 번들의 표면·안전 집행을 재고, 이쪽은 그 번들을 만드는 소스가 자기 계약
 * (등록점·대장·전송)을 지키는지 잰다. 2026-08-19 교체(D-095) 전에는 저쪽이 **구 번들**을
 * 겨눴고 그 문장이 여기 적혀 있었다 — 지금은 둘 다 같은 엔진을 본다.
 *
 * PowerShell로 실행할 것 — 이 머신에서 Bash로 돌리면 자식 프로세스 수거에서
 * 블록된 실측 기록이 있다(`HANDOFF.md`).
 */
import { run as runHttpSmoke } from './http-smoke.mjs';
import { run as runLedger } from './ledger.mjs';
import { run as runSafety } from './safety.mjs';
import { run as runSseSmoke } from './sse-smoke.mjs';
import { run as runSurface } from './surface.mjs';

const GATES = [
  ['표면', runSurface],
  ['안전', runSafety],
  ['대장', runLedger],
  ['HTTP 기동', runHttpSmoke],
  ['SSE 기동', runSseSmoke],
];

let allGreen = true;
for (const [label, run] of GATES) {
  console.log(`\n── ${label} ──`);
  try {
    const report = await run();
    allGreen = report.print() && allGreen;
  } catch (error) {
    console.error(`❌ ${label} 게이트가 실행 중 죽었다 — 이것은 통과가 아니다.`);
    console.error(error?.stack ?? String(error));
    allGreen = false;
  }
}

console.log('');
if (allGreen) {
  console.log('✅ 신 엔진 자체 게이트 전종 통과');
  process.exit(0);
}
console.error('❌ 신 엔진 자체 게이트 실패 — 위 항목 확인');
process.exit(1);
