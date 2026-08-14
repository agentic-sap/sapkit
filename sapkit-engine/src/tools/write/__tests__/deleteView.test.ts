/**
 * `DeleteView` — 발행 계약 · 와이어 · 거짓 성공 판정 · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteView`
 *  - 겉 핸들러: `engine/src/handlers/view/high/handleDeleteView.ts:17-129`
 *  - 사슬·세션: `.../dist/core/view/AdtView.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/view/delete.js:19-84` (라벨 `"View"`)
 *
 * **주소가 `ddic/views`가 아니다** — CDS DDL 소스 컬렉션(`ddic/ddl/sources`)이다.
 * 이름만 보고 짐작하면 틀리는 자리라 `objectUri`로 못 박는다.
 */

import { deleteView } from '../deleteView';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'ZSAPKIT_V_DEMO';

describeStandardDeletion({
  tool: deleteView,
  name: 'DeleteView',
  args: { view_name: NAME },
  lowerArgs: { view_name: NAME.toLowerCase() },
  objectUri: `/sap/bc/adt/ddic/ddl/sources/${NAME}`,
  availableIn: ['onprem', 'cloud', 'legacy'],
  targetNames: ['view_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'View',
  statusLabel: 'View',
  subject: 'view',
  successPayload: (transport) => ({
    success: true,
    view_name: NAME,
    transport_request: transport,
    message: `View ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: view_name is required',
});
