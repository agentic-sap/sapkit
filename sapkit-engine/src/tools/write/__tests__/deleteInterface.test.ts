/**
 * `DeleteInterface` — 발행 계약 · 삭제 서비스 두 걸음의 와이어 · 거짓 성공 판정 ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteInterface`
 *  - 겉 핸들러: `engine/src/handlers/interface/high/handleDeleteInterface.ts:16-133`
 *  - 사슬·세션: `@babamba2/mcp-abap-adt-clients/dist/core/interface/AdtInterface.js` delete
 *  - 전문·주소: `.../dist/core/interface/delete.js:19-84` (라벨 `"Interface"`)
 *
 * **이 시험은 「실제로 지운다」를 증명하지 않는다** — 삭제는 재생 대조가 원리상
 * 불가능하고 이 판은 SAP에 붙지 않는다.
 */

import { deleteInterface } from '../deleteInterface';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'ZIF_MY_INTERFACE';

describeStandardDeletion({
  tool: deleteInterface,
  name: 'DeleteInterface',
  args: { interface_name: NAME },
  lowerArgs: { interface_name: NAME.toLowerCase() },
  objectUri: `/sap/bc/adt/oo/interfaces/${NAME}`,
  availableIn: ['onprem', 'cloud', 'legacy'],
  targetNames: ['interface_name'],
  layout: 'standard',
  stateful: true,
  vendorLabel: 'Interface',
  statusLabel: 'Interface',
  subject: 'interface',
  successPayload: (transport) => ({
    success: true,
    interface_name: NAME,
    transport_request: transport,
    message: `Interface ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: interface_name is required',
});
