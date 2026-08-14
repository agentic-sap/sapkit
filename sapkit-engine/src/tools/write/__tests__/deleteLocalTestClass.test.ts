/**
 * `DeleteLocalTestClass` — 발행 계약 · 잠금 → 빈 소스 PUT → 해제 · 활성화(D111) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteLocalTestClass`
 *  - 겉 핸들러: `engine/src/handlers/class/high/handleDeleteLocalTestClass.ts:16-132`
 *  - 사슬: `.../dist/core/class/AdtLocalTestClass.js` delete →
 *    `testclasses.js`의 `clearClassTestInclude` (본문 = 공백 한 칸)
 */

import { deleteLocalTestClass } from '../deleteLocalTestClass';
import { describeLocalIncludeClear } from './localIncludeClearSupport';

describeLocalIncludeClear({
  tool: deleteLocalTestClass,
  name: 'DeleteLocalTestClass',
  className: 'ZCL_SAPKIT_DEMO',
  includeType: 'testclasses',
  messageSubject: 'Local test class',
  failureSubject: 'local test class',
  notFoundSubject: 'Local test class',
});
