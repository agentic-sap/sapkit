/**
 * 모르는 인자 거절 — 도구 스키마에 없는 인자가 **하나라도** 오면 호출을 거절한다
 * (D-152 · 장부 `harness/DIVERGENCES.md` D155).
 *
 * ## 왜 필요한가
 *
 * 도구는 zod raw shape으로 등록되고(`./toolDefinition.ts`), SDK는 호출 인자를
 * `z.object(shape)`로 파싱한다. zod 객체의 기본은 **strip**이다 — 모르는 키를 조용히
 * 지운 뒤 콜백을 부른다. 실사용에서 두 번 그것이 조용한 오답이 됐다(2026-09-18):
 *
 *  ① `GetTableContents(..., where_clause="BUKRS = '1000'")` — 이 도구에 `where_clause`는
 *     없다. 필터 없이 앞 56행이 정상 응답으로 왔고 호출자는 「조건에 맞는 행이 없다」로
 *     읽었다.
 *  ② `CreateBehaviorDefinition(..., source=<BDEF 40줄>)` — `source`가 버려지고 SAP
 *     템플릿이 생성·활성화됐으며 응답은 `success:true`. 호출자의 소스가 사라졌다.
 *
 * 둘 다 「시킨 일」과 「한 일」이 다른데 성공으로 답했다.
 *
 * ## 발행 스키마는 한 글자도 건드리지 않는다
 *
 * strip을 끄는 정공법(`z.strictObject`·`.strict()`·`catchall`·`looseObject`)은 전부
 * `tools/list`의 JSON Schema에 `additionalProperties`를 싣는다. 그러면 채록본 글자
 * 대조(`gates/surface.mjs` ↔ `harness/old-surface/m1-tools.json`)가 깨지고, 그 키를
 * 거부하는 클라이언트(Gemini 계열)가 있다. 그래서 등록은 그대로 두고 **파싱 직전**에
 * 가로챈다 — 이 모듈은 `registerTool`에 넘기는 것을 하나도 바꾸지 않는다.
 *
 * ## 어디서 가로채는가 — `McpServer.validateToolInput`을 인스턴스에서 감싼다
 *
 * 후보 셋을 견줬다.
 *
 *  ⓐ **`validateToolInput` 감싸기 (채택).** SDK가 모르는 키를 지우는 **바로 그 자리**라
 *     원 인자를 그대로 본다. 여기서 던지면 SDK의 `tools/call` 핸들러가 자기
 *     `createToolError`로 접으므로 응답 모양(`{content:[{type:'text',text}], isError:true}`)이
 *     SDK 검증 오류와 **구성상** 같다 — 손으로 다시 짓지 않는다. 판정 순서도 SDK
 *     그대로다(없는 도구·꺼진 도구 → **여기** → SDK 스키마 검증 → 콜백).
 *     기대는 것은 TS상 private인 메서드 **이름 하나와 인자 순서**(tool, args, toolName)다.
 *  ⓑ 트랜스포트 데코레이터. 공개 표면(Transport·JSON-RPC)만 쓰지만 전송 셋(stdio·HTTP·
 *     SSE)과 시험의 in-memory마다 따로 씌워야 하고, **하나라도 빠지면 그 길이 조용히
 *     뚫린다.** 응답도 Protocol 밖에서 직접 보내야 해서 진행·취소·HTTP 스트림 배정
 *     (`relatedRequestId`)을 다시 짜야 한다. 기대는 면이 더 넓다.
 *  ⓒ `server.server.setRequestHandler`를 가로채 `tools/call` 핸들러를 감싸기. 공개
 *     메서드지만 「McpServer가 그 길로 핸들러를 단다」는 내부 동작에 똑같이 기대고, SDK의
 *     없는 도구 판정보다 **앞에** 서며, 오류 결과 모양을 손으로 다시 지어야 한다.
 *
 * ⓐ가 기대는 면이 가장 좁고(메서드 하나) 응답 모양을 SDK에 맡긴다. 번들러는 이름을
 * 바꾸지 않는다(`tools/bundle.mjs` — minify·mangleProps 없음).
 *
 * ## SDK가 바뀌면 — 조용히 꺼지지 않게
 *
 *  - **설치 시점**: 인스턴스에 그 메서드가 없으면 **던진다** → 코어 생성이 실패하고
 *    서버가 뜨지 않는다(서버 시험·스모크 전부 빨개진다).
 *  - **호출 시점**: SDK가 넘긴 도구 이름으로 인자 목록을 못 찾으면 **거절한다**
 *    (fail-closed) — 인자 순서가 바뀐 것이다. 모르는 인자를 흘려보내지 않는다.
 *  - SDK가 이 메서드를 **더 이상 부르지 않으면** 위 둘로는 안 잡힌다 — 실 규약으로
 *    모르는 인자를 보내 핸들러·접속에 닿지 않음을 단언하는 시험
 *    (`./__tests__/unknownArguments.test.ts`)이 그때 빨개진다.
 *
 * ## 게이트보다 앞이다 — 그래도 게이트를 약화하지 않는다
 *
 * SDK의 스키마 검증(필수 인자 누락·타입 오류)은 지금도 콜백보다, 따라서
 * `evaluateToolCall`보다 앞에 있다. 모르는 인자도 같은 부류(호출의 모양이 틀렸다)라
 * 같은 층에 둔다. 거절된 호출은 실행되지 않으므로 게이트가 막을 일이 남지 않고, 통과한
 * 호출은 전부 지금처럼 tier·실데이터 게이트를 지난다. 어느 쪽이든 **접속 0회**다 — 접속은
 * 핸들러 안의 `ctx.getConnection()`에서만 생긴다.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/** 거절 문구의 고정 조각 — 호출자(모델)가 「무시가 아니라 거절」임을 읽는 자리. */
export const UNKNOWN_ARGUMENT_REJECTION = 'Unknown arguments are rejected, not ignored';

/**
 * 받는 인자 목록에 없는 키 — 호출자가 보낸 순서 그대로.
 *
 * `Set`으로 견준다. `in`이나 객체 조회로 견주면 `constructor`·`toString` 같은
 * 프로토타입 이름이 「아는 인자」로 새어 들어간다. 객체가 아닌 인자는 여기서 판정하지
 * 않는다 — SDK의 스키마 검증이 그대로 받는다.
 */
export function unknownArgumentNames(accepted: readonly string[], args: unknown): string[] {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return [];
  const known = new Set(accepted);
  return Object.keys(args).filter((key) => !known.has(key));
}

/**
 * 거절 문구. 머리는 SDK의 검증 오류와 같은 꼴(`Input validation error: Invalid arguments
 * for tool <name>:`)이라 그 문구를 아는 호출자에게 같은 부류로 읽힌다.
 */
export function unknownArgumentMessage(
  toolName: string,
  unknown: readonly string[],
  accepted: readonly string[],
): string {
  const quoted = unknown.map((name) => `'${name}'`).join(', ');
  const which = unknown.length === 1 ? `unknown argument ${quoted}` : `unknown arguments ${quoted}`;
  const takes =
    accepted.length === 0
      ? `${toolName} takes no arguments`
      : `${toolName} accepts only: ${accepted.join(', ')}`;
  return (
    `Input validation error: Invalid arguments for tool ${toolName}: ${which}. ${takes}. ` +
    `${UNKNOWN_ARGUMENT_REJECTION} — the call was not executed and nothing was sent to SAP. ` +
    `Retry without ${unknown.length === 1 ? 'it' : 'them'}, or use a tool whose schema declares the parameter you need.`
  );
}

type ValidateToolInput = (tool: unknown, args: unknown, toolName: unknown) => Promise<unknown>;

/**
 * `server`의 `validateToolInput`을 감싸 모르는 인자를 거절하게 한다.
 *
 * @param acceptedArguments 도구 이름 → 받는 인자 이름(선언 순서). 모르는 도구면 `undefined`.
 * @throws SDK에 그 메서드가 없으면 — 경비 없이 뜨지 않는다.
 */
export function installUnknownArgumentGuard(
  server: McpServer,
  acceptedArguments: (toolName: string) => readonly string[] | undefined,
): void {
  const seam = server as unknown as { validateToolInput?: ValidateToolInput };
  const original = seam.validateToolInput;
  if (typeof original !== 'function') {
    throw new Error(
      'ERR_ARGUMENT_GUARD_SEAM: McpServer.validateToolInput is missing — the MCP SDK changed. ' +
        'The unknown-argument guard cannot be installed, so the server refuses to start instead of ' +
        'silently dropping unknown tool arguments (see src/server/unknownArguments.ts).',
    );
  }

  seam.validateToolInput = async function guardedValidateToolInput(
    this: unknown,
    tool: unknown,
    args: unknown,
    toolName: unknown,
  ): Promise<unknown> {
    const accepted = typeof toolName === 'string' ? acceptedArguments(toolName) : undefined;
    if (accepted === undefined) {
      throw new McpError(
        ErrorCode.InternalError,
        `ERR_ARGUMENT_GUARD: cannot resolve the accepted arguments for tool ${String(toolName)} — ` +
          'the MCP SDK tool-input seam changed. The call is refused rather than letting unknown ' +
          'arguments through; nothing was sent to SAP.',
      );
    }
    const unknown = unknownArgumentNames(accepted, args);
    if (unknown.length > 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        unknownArgumentMessage(toolName as string, unknown, accepted),
      );
    }
    return original.call(this, tool, args, toolName);
  };
}
