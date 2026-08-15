/**
 * 런타임 묶음의 반환값 조립 — 구 `return_response` / `return_error`와 같은 모양.
 *
 * 구 런타임 핸들러 11종은 예외 없이 `return_response({ data: JSON.stringify(body,
 * null, 2) })`로 답한다(`engine/src/handlers/system/readonly/handleRuntimeListDumps.ts:73-88`
 * 등). 그래서 **들여쓰기 2칸까지가 응답 계약**이고, 여기서 그 조립을 한 자리에
 * 모은다.
 *
 * `returnError`의 `Error: ` 접두사도 계약의 일부다(구 `engine/src/lib/utils.ts:271-430`
 * 의 `return_error`). 구 함수는 AxiosError의 갈래를 길게 나누지만 그 갈래들은
 * axios 고유의 오류 모양에 붙어 있고 신 엔진에는 그 모양이 없다 — 읽기 묶음이
 * 이미 같은 판단으로 `messageOf` 하나로 좁혀 두었다
 * (`src/tools/read/internal/results.ts:26-40`). 여기서 그 선례를 따른다.
 */

import type { ToolResult } from '../../../server/toolDefinition';

export function ok(text: string): ToolResult {
  return { isError: false, content: [{ type: 'text', text }] };
}

/** 구 런타임 핸들러의 응답 조립 그대로 — `JSON.stringify(body, null, 2)`. */
export function okJson(payload: unknown): ToolResult {
  return ok(JSON.stringify(payload, null, 2));
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

export function returnError(error: unknown): ToolResult {
  return { isError: true, content: [{ type: 'text', text: `Error: ${messageOf(error)}` }] };
}
