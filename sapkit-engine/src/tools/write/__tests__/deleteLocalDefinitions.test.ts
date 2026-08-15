/**
 * `DeleteLocalDefinitions` — 발행 계약 · 잠금 → 빈 소스 PUT → 해제 · 활성화(D111) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteLocalDefinitions`
 *    (**형제 도구와 설명 문구가 다르다** — 이송번호가 짧은 판이다)
 *  - 겉 핸들러: `engine/src/handlers/class/high/handleDeleteLocalDefinitions.ts:16-124`
 *  - 사슬: `.../dist/core/class/AdtLocalDefinitions.js` delete →
 *    `includes.js`의 `clearClassInclude(…, 'definitions', …)`
 */

import { deleteLocalDefinitions } from '../deleteLocalDefinitions';
import { describeLocalIncludeClear } from './localIncludeClearSupport';

describeLocalIncludeClear({
  tool: deleteLocalDefinitions,
  name: 'DeleteLocalDefinitions',
  className: 'ZCL_SAPKIT_DEMO',
  includeType: 'definitions',
  messageSubject: 'Local definitions',
  failureSubject: 'local definitions',
  notFoundSubject: 'Local definitions',
});
