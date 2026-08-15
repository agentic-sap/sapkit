/**
 * `DeleteBehaviorDefinition` — 발행 계약 · 와이어(**이 묶음에서 유일한 압축 배치**) ·
 * 거짓 성공 판정 · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteBehaviorDefinition`
 *  - 겉 핸들러: `engine/src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts:17-139`
 *  - 사슬·세션: `.../dist/core/behaviorDefinition/AdtBehaviorDefinition.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/behaviorDefinition/delete.js:28-89`
 *    (라벨 `'Behavior definition'` · **선언과 루트가 한 줄** · 들여쓰기 4·8칸 ·
 *     이송번호는 trim 없이 truthy 판정)
 *
 * 이름은 **소문자 · 인코딩 없음**이다(`delete.js:29`·`:67`).
 */

import { deleteBehaviorDefinition } from '../deleteBehaviorDefinition';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'Z_SAPKIT_BDEF';

describeStandardDeletion({
  tool: deleteBehaviorDefinition,
  name: 'DeleteBehaviorDefinition',
  args: { behavior_definition_name: NAME },
  lowerArgs: { behavior_definition_name: NAME.toLowerCase() },
  objectUri: `/sap/bc/adt/bo/behaviordefinitions/${NAME.toLowerCase()}`,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['behavior_definition_name'],
  // 압축 배치는 이 종 하나뿐이다. 공백 이송번호가 값으로 실리는 것도 여기만이다.
  layout: 'compact',
  stateful: false,
  vendorLabel: 'Behavior definition',
  statusLabel: 'BehaviorDefinition',
  subject: 'behavior definition',
  successPayload: (transport) => ({
    success: true,
    behavior_definition_name: NAME,
    transport_request: transport,
    message: `BehaviorDefinition ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: behavior_definition_name is required',
});
