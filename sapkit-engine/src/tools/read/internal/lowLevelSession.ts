/**
 * `*Low` 도구 둘이 공유하는 **세션 복원 갈래**.
 *
 * `GetNodeStructureLow`·`GetObjectStructureLow`는 발행 스키마에 `session_id`와
 * `session_state`를 갖고 있고, **둘 다 주어졌을 때만** 세션을 복원한다
 * (`engine/src/handlers/system/low/handleGetNodeStructure.ts:92-101` ·
 * `handleGetObjectStructure.ts:80-89` — 조건이 `&&`다).
 *
 * 구가 부르는 `restoreSessionInConnection`(`engine/src/lib/utils.ts:763-788`)이
 * 실제로 하는 일은 둘뿐이다:
 *
 *  1. `connection.setSessionId(sessionId)` — 접속의 `sap-adt-connection-id`
 *     헤더 값을 그 문자열로 바꾼다(`@babamba2/mcp-abap-connection/dist/connection/
 *     AbstractAbapConnection.js:101-104`·`:170-173`).
 *  2. `connection.setSessionType('stateful')` — 이후 요청에
 *     `x-sap-adt-sessiontype: stateful`이 붙는다(`:176`).
 *
 * **`session_state`의 내용은 읽지 않는다.** 인자 이름이 `_sessionState`인 것이
 * 그 사실을 적어 둔 것이고, 쿠키도 CSRF 토큰도 꺼내 쓰지 않는다. 실패해도
 * 던지지 않고 경고만 남긴다(`utils.ts:782-787`).
 *
 * 신 엔진이 승계하는 것은 ⑵뿐이다 — ⑴은 차이 장부 D131.
 */

import type { AdtClient } from '../../../adt';

export interface LowLevelSessionArgs {
  readonly session_id?: string | undefined;
  readonly session_state?: unknown;
}

/**
 * 구 `restoreSessionInConnection`의 승계분. 두 인자가 **모두** 있을 때만 돈다.
 * 돌았는지 여부를 돌려준다(시험이 그 자리를 붙잡는다).
 */
export function restoreStatefulSession(client: AdtClient, args: LowLevelSessionArgs): boolean {
  // 구와 같은 **truthy 검사**다(`&&`). `session_state: null`이면 복원하지 않는다.
  if (!args.session_id || !args.session_state) return false;
  client.setSessionType('stateful');
  return true;
}
