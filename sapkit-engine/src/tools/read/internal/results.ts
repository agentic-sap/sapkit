/**
 * 도구 반환값 조립 — 구 엔진의 `return_response` / `return_error`와 같은 모양.
 *
 * 구 `return_response`는 응답 본문을 그대로 text 하나에 싣고 `isError:false`를
 * 붙였다. `return_error`는 `Error: <메시지>` 한 줄이다 —
 * **접두사 `Error: `가 계약의 일부**다(구 `utils.ts:421-429`). 구 핸들러 중
 * 일부(GetInclude·GrepObjects·SearchObject)는 그 함수를 쓰지 않고 자기 문구를
 * 만들었으므로, 여기서는 통일하지 않고 도구가 골라 쓴다.
 */

import type { ToolResult } from '../../../server';

export function ok(text: string): ToolResult {
  return { isError: false, content: [{ type: 'text', text }] };
}

/** 결과 없음 — SearchObject가 "찾은 것이 없다"를 이 모양으로 답한다. */
export function okEmpty(): ToolResult {
  return { isError: false, content: [] };
}

export function failure(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** 구 `return_error`가 오류에서 문구를 뽑던 순서. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** 구 `return_error(error)` 그대로 — `Error: ` 접두사가 붙는다. */
export function returnError(error: unknown): ToolResult {
  return failure(`Error: ${messageOf(error)}`);
}

/**
 * 인자 검증 실패.
 *
 * 구는 `McpError(InvalidParams, …)`를 던져 자기 catch에서 잡아 오류 응답으로
 * 접었다. 신 엔진에서 도구가 프로토콜 오류 코드를 직접 고르는 통로는 없고
 * (`isError`만 있다), 서버 코어가 그것을 `InternalError`로 올린다. 문구는
 * 그대로 보존한다.
 */
export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolArgumentError';
  }
}
