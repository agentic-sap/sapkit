/**
 * `DeleteFunctionGroup` — 발행 계약 · 와이어 · 거짓 성공 판정 · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteFunctionGroup`
 *  - 겉 핸들러: `engine/src/handlers/function_group/high/handleDeleteFunctionGroup.ts:17-132`
 *  - 사슬·세션: `.../dist/core/functionGroup/AdtFunctionGroup.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/functionGroup/delete.js:19-84`
 *
 * **라벨 셋이 서로 다르다** — 벤더 `Function group` / 상태 문구 `FunctionGroup` /
 * 일반 실패 주어 `function group`. 접으면 구와 어긋나므로 spec에 셋을 따로 적는다.
 */

import { deleteFunctionGroup } from '../deleteFunctionGroup';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'ZSAPKIT_FG';

describeStandardDeletion({
  tool: deleteFunctionGroup,
  name: 'DeleteFunctionGroup',
  args: { function_group_name: NAME },
  lowerArgs: { function_group_name: NAME.toLowerCase() },
  objectUri: `/sap/bc/adt/functions/groups/${NAME}`,
  availableIn: ['onprem', 'cloud', 'legacy'],
  targetNames: ['function_group_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Function group',
  statusLabel: 'FunctionGroup',
  subject: 'function group',
  successPayload: (transport) => ({
    success: true,
    function_group_name: NAME,
    transport_request: transport,
    message: `FunctionGroup ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: function_group_name is required',
});
