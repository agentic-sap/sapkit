/**
 * `DeleteProgram` — 발행 계약 · 삭제 서비스 두 걸음의 와이어 · 거짓 성공 판정 ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteProgram`
 *  - 겉 핸들러: `engine/src/handlers/program/high/handleDeleteProgram.ts:16-134`
 *  - 사슬·세션: `@babamba2/mcp-abap-adt-clients/dist/core/program/AdtProgram.js` delete
 *  - 전문·주소: `.../dist/core/program/delete.js:19-83` (라벨 `"Program"`)
 *
 * 삭제 서비스의 URI는 이 레포가 이미 가진 세 프로그램 URI 조립기 중 **어느 것도
 * 아니다** — 대문자 그대로다. 아래 `objectUri`가 그 실측이다.
 */

import { deleteProgram } from '../deleteProgram';
import { describeStandardDeletion } from './deletionSupport';

const NAME = 'ZSAPKIT_DEMO';

describeStandardDeletion({
  tool: deleteProgram,
  name: 'DeleteProgram',
  args: { program_name: NAME },
  lowerArgs: { program_name: NAME.toLowerCase() },
  objectUri: `/sap/bc/adt/programs/programs/${NAME}`,
  availableIn: ['onprem', 'legacy'],
  targetNames: ['program_name'],
  layout: 'standard',
  stateful: true,
  vendorLabel: 'Program',
  statusLabel: 'Program',
  subject: 'program',
  successPayload: (transport) => ({
    success: true,
    program_name: NAME,
    transport_request: transport,
    message: `Program ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: program_name is required',
});
