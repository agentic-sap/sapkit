/**
 * `DeleteServiceDefinition` — 발행 계약 · 와이어 · 거짓 성공 판정 · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteServiceDefinition`
 *  - 겉 핸들러: `engine/src/handlers/service_definition/high/handleDeleteServiceDefinition.ts:17-132`
 *  - 사슬·세션: `.../dist/core/serviceDefinition/AdtServiceDefinition.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/serviceDefinition/delete.js:19-84` (라벨 `"Service definition"`)
 *
 * **읽기·쓰기 쪽 SRVD URI는 소문자다**(`internal/serviceDefinition.ts`). 삭제만
 * 대문자라 두 자리를 접으면 구가 보내던 주소와 달라진다 — `objectUri`로 못 박는다.
 */

import { deleteServiceDefinition } from '../deleteServiceDefinition';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'ZSAPKIT_SRVD';

describeStandardDeletion({
  tool: deleteServiceDefinition,
  name: 'DeleteServiceDefinition',
  args: { service_definition_name: NAME },
  lowerArgs: { service_definition_name: NAME.toLowerCase() },
  objectUri: `/sap/bc/adt/ddic/srvd/sources/${NAME}`,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['service_definition_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Service definition',
  statusLabel: 'ServiceDefinition',
  subject: 'service definition',
  successPayload: (transport) => ({
    success: true,
    service_definition_name: NAME,
    transport_request: transport,
    message: `ServiceDefinition ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: service_definition_name is required',
});
