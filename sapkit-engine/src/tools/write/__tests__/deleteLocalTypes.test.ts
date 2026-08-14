/**
 * `DeleteLocalTypes` — 발행 계약 · 잠금 → 빈 소스 PUT → 해제 · 활성화(D111) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteLocalTypes`
 *  - 겉 핸들러: `engine/src/handlers/class/high/handleDeleteLocalTypes.ts:16-122`
 *  - 사슬: `.../dist/core/class/AdtLocalTypes.js` delete →
 *    `includes.js`의 `clearClassInclude(…, 'implementations', …)`
 *
 * **이름과 주소가 어긋난다** — `LocalTypes`인데 비우는 인클루드는
 * `implementations`다. 형제 `DeleteLocalDefinitions`가 `definitions`를 소유한다.
 * `includeType`으로 못 박아, 짐작으로 갈아 끼우면 시험이 깨지게 했다.
 */

import { deleteLocalTypes } from '../deleteLocalTypes';
import { describeLocalIncludeClear } from './localIncludeClearSupport';

describeLocalIncludeClear({
  tool: deleteLocalTypes,
  name: 'DeleteLocalTypes',
  className: 'ZCL_SAPKIT_DEMO',
  includeType: 'implementations',
  messageSubject: 'Local types',
  failureSubject: 'local types',
  notFoundSubject: 'Local types',
});
