/**
 * GetTransaction — **구 엔진에서 지어진 적이 없는 도구다.**
 *
 * 발행 설명은 "트랜잭션 코드의 프로그램·화면·권한 오브젝트·유형을 준다"고
 * 말하지만, 구 핸들러가 실제로 하는 일은 `{ message: 'Not implemented' }` 한
 * 줄을 돌려주는 것뿐이다
 * (`engine/src/handlers/system/readonly/handleGetTransaction.ts:73-76`).
 *
 * 그 파일에서 진짜 구현은 **주석 처리된 채** 남아 있다(`:52-72`) —
 * `createAdtClient(connection).readTransaction(args.transaction_name)`을 부르려던
 * 흔적이고, 그것을 부르는 import도 함께 주석 처리돼 있다(`:1`·`:4`).
 * XML 파서 `_parseTransactionXml`(`:22-45`)도 밑줄 접두사가 붙은 채 아무도
 * 부르지 않는다. 즉 **미완성인 상태로 표면에 발행돼 있었다.**
 *
 * ## 그래서 이 도구는 무엇을 짓는가
 *
 * 구의 **관측 가능한 동작**을 그대로 옮긴다. 주석 처리된 코드를 되살리지
 * 않는다 — 그것은 이식이 아니라 **새 기능**이고, 이 판의 규칙은 "구가 하던 것을
 * 그대로 옮긴다"이다. 되살리려면 `readTransaction`이 실제로 어떤 주소로 무엇을
 * 보내는지 안쪽 패키지에서 복원하고, 실 시스템에서 확인하고, 응답 형태를 새로
 * 정해야 한다. 그 셋 중 어느 것도 이 판의 근거로 갖고 있지 않다.
 *
 * 인자 `transaction_name`은 **받지만 쓰지 않는다.** 구가 그렇고, 발행 선언은
 * 채록본과 글자 일치해야 하므로 지울 수 없다.
 *
 * **SAP에 붙지 않는다** — 구도 `connection`을 구조분해만 하고 부르지 않는다.
 * 그래서 `context.getConnection()`을 호출하지 않는다.
 *
 * ## 구와 다른 것 (등재된 차이)
 *
 * 구는 `{ type: 'json', json: { message } }`로 실었다(`:75`). `json`은 MCP 규약의
 * 콘텐츠 종류가 아니다 — 신 엔진은 규약대로 text 하나에 JSON 문자열을 싣는다.
 * 장부 등재분의 「콘텐츠 종류」 항목 참조.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { ok } from './internal/results';

export const getTransaction = defineTool(
  {
    name: 'GetTransaction',
    description:
      '[read-only] Retrieve ABAP transaction (t-code) details — program, screen, authorization object, and transaction type (dialog, report, OO).',
    inputSchema: {
      transaction_name: z.string().describe('Name of the ABAP transaction'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    // read라 필수는 아니지만 대상 이름을 받으므로 적어 둔다. 지금은 쓰이지 않아도
    // 나중에 실제로 지어질 때 녹화 사전 검사가 이미 걸려 있게 된다.
    targetNames: ['transaction_name'],
  },
  async () => {
    // 구의 유일한 반환문이다. 인자를 보지 않고, 접속을 꺼내지 않는다.
    return ok(JSON.stringify({ message: 'Not implemented' }));
  },
);
