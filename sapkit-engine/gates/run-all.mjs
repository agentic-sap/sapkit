/**
 * 신 엔진 자체 게이트 일괄 실행기.
 *
 * 기존 제품 게이트(`interactive/scripts/*.mjs`)와는 별개다 — 저쪽은 구 번들을
 * 검사하고, 이쪽은 새로 지은 엔진이 그 계약을 지키는지 검사한다. 무중단 교체의
 * ① 병행 제작 단계에서는 둘 다 초록이어야 한다.
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
