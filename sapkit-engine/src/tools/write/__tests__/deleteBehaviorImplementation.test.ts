/**
 * `DeleteBehaviorImplementation` — 발행 계약 · 와이어(클래스 삭제 그대로) ·
 * 거짓 성공 판정(**라벨이 `Class`다**) · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteBehaviorImplementation`
 *  - 겉 핸들러: `engine/src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts:17-141`
 *  - 사슬: `.../dist/core/behaviorImplementation/AdtBehaviorImplementation.js` delete
 *    → **`AdtClass.delete()`를 그대로 부른다**
 *  - 전문·주소·라벨: `.../dist/core/class/delete.js:19-88` (라벨 `"Class"`)
 *
 * 겉 핸들러의 404·423 문구는 `BehaviorImplementation`을 쓰는데 벤더가 던지는
 * 문구는 `Class`로 시작한다 — 두 자리를 하나로 맞추면 구와 어긋난다.
 */

import { deleteBehaviorImplementation } from '../deleteBehaviorImplementation';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'ZBP_SAPKIT_DEMO';

describeStandardDeletion({
  tool: deleteBehaviorImplementation,
  name: 'DeleteBehaviorImplementation',
  args: { behavior_implementation_name: NAME },
  lowerArgs: { behavior_implementation_name: NAME.toLowerCase() },
  // BIMP는 클래스다 — BDEF의 `/sap/bc/adt/bo/behaviordefinitions/{소문자}`가 아니다.
  objectUri: `/sap/bc/adt/oo/classes/${NAME}`,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['behavior_implementation_name'],
  layout: 'standard',
  stateful: true,
  // 벤더가 넘기는 라벨. 상태 문구의 `BehaviorImplementation`과 **다르다.**
  vendorLabel: 'Class',
  statusLabel: 'BehaviorImplementation',
  subject: 'behavior implementation',
  successPayload: (transport) => ({
    success: true,
    behavior_implementation_name: NAME,
    transport_request: transport,
    message: `BehaviorImplementation ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: behavior_implementation_name is required',
});
