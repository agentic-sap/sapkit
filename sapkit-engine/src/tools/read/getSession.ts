/**
 * GetSession — ADT 상태유지 작업에 쓸 세션 ID를 하나 만들어 준다.
 *
 * **SAP에 붙지 않는다.** 구 핸들러
 * (`engine/src/handlers/system/readonly/handleGetSession.ts:43-80`)는 `context`에서
 * `connection`을 구조분해하지만 **한 번도 부르지 않는다.** 주석은 "접속을 세워
 * 쿠키와 CSRF 토큰을 받아 둔다"고 적혀 있지만(`:55-56`) 그 아래에 그런 코드가
 * 없다 — 실제로 하는 일은 `crypto.randomUUID()`에서 하이픈을 뗀 32자 16진
 * 문자열을 만드는 것뿐이다(`engine/src/lib/sessionUtils.ts:48-50`).
 * 그래서 이 도구도 `context.getConnection()`을 호출하지 않는다.
 *
 * ## 이름이 약속하는 것보다 적게 한다 (구를 그대로 옮긴 것)
 *
 * 발행 설명은 "현재 세션 상태(쿠키, CSRF 토큰)를 준다"고 말하지만 구는
 * **`session_state`에 언제나 `null`을 싣는다**(`:69`). 그 자리에 달린 주석이
 * 이유를 밝힌다 — 세션 상태 관리가 auth-broker로 옮겨 가면서 이 핸들러가 내줄
 * 것이 없어졌고, 설명 문구만 남았다. 설명은 채록본과 글자 일치해야 하므로
 * 고치지 않고, 동작도 구대로 `null`을 싣는다.
 *
 * 마찬가지로 **`force_new`는 읽히지만 아무 일도 하지 않는다**(`:49`·`:52` —
 * 디버그 로그의 문구만 갈린다). 보관할 세션이 이 프로세스에 없으므로 "새로
 * 만들라"는 요청과 기본 동작이 같은 것이다. 인자를 지우지 않는 이유는 발행
 * 선언이 채록본과 글자 일치해야 하기 때문이다.
 *
 * 신 엔진의 접속 계층은 자기 세션 수명주기를 스스로 관리하므로(`src/adt/client.ts`)
 * 여기서 만든 ID를 물려받는 통로는 없다. 그것도 구와 같다 — 구에서도 이 ID를
 * 다른 핸들러에 넘기는 배선은 없었다.
 */

import { randomUUID } from 'node:crypto';

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { ok, returnError } from './internal/results';

/**
 * 구 `generateSessionId()` — UUID에서 하이픈을 뗀 32자 16진 문자열
 * (`engine/src/lib/sessionUtils.ts:48-50`).
 */
export function generateSessionId(): string {
  return randomUUID().replace(/-/g, '');
}

export const getSession = defineTool(
  {
    name: 'GetSession',
    description:
      '[read-only] Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.',
    inputSchema: {
      force_new: z
        .boolean()
        .optional()
        .describe('Force creation of a new session even if one exists. Default: false'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const forceNew = args.force_new ?? false;
      context.logger.debug(`Connecting managed session${forceNew ? ' (force new)' : ''}...`);

      const sessionId = generateSessionId();
      context.logger.info(`✅ GetSession completed: session ID ${sessionId.substring(0, 8)}...`);

      // 구는 `return_response({data})`를 쓰므로 본문이 그대로 text 하나가 된다.
      // 들여쓰기 2칸도 구 그대로(`handleGetSession.ts:64-75`).
      return ok(
        JSON.stringify(
          {
            success: true,
            session_id: sessionId,
            session_state: null,
            message:
              'Session ID generated. Use this session_id in subsequent requests to maintain the same session.',
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error('Error getting session:');
      // 구는 `return_error(error)`로 접는다 — 접두사 `Error: `가 계약이다.
      return returnError(error);
    }
  },
);
