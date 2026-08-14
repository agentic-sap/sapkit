/**
 * `DeleteLocalMacros` — 발행 계약 · 잠금 → 빈 소스 PUT → 해제 · 활성화(D111) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteLocalMacros`
 *    (설명에 "Note: Macros are supported in older ABAP versions…" 한 문장이 더 붙는다)
 *  - 겉 핸들러: `engine/src/handlers/class/high/handleDeleteLocalMacros.ts:16-122`
 *  - 사슬: `.../dist/core/class/AdtLocalMacros.js` delete →
 *    `includes.js`의 `clearClassInclude(…, 'macros', …)`
 */

import { deleteLocalMacros } from '../deleteLocalMacros';
import { describeLocalIncludeClear } from './localIncludeClearSupport';

describeLocalIncludeClear({
  tool: deleteLocalMacros,
  name: 'DeleteLocalMacros',
  className: 'ZCL_SAPKIT_DEMO',
  includeType: 'macros',
  messageSubject: 'Local macros',
  failureSubject: 'local macros',
  notFoundSubject: 'Local macros',
});
