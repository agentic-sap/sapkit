/**
 * DeleteLocalMacros — 클래스의 `macros` 인클루드를 **비운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * 겉: `engine/src/handlers/class/high/handleDeleteLocalMacros.ts:47-122`.
 * 사슬: `…/dist/core/class/AdtLocalMacros.js`의 `delete()` — 잠금 →
 * `clearClassInclude(…, 'macros', …)` → 해제. 삭제 서비스를 타지 않는다.
 * 사슬의 와이어 근거는 `./internal/classIncludeClear.ts` 머리주석.
 *
 * 발행 설명이 형제 셋과 다른 한 문장을 더 갖는다 — "Note: Macros are supported in
 * older ABAP versions but not in newer ones." 채록본 글자 그대로 옮긴다.
 * **엔진은 그 사실로 갈라지지 않는다** — 구도 판 검사 없이 같은 요청을 보내고
 * 최신 판에서는 SAP이 거절한다. 없는 분기를 지어내지 않았다.
 *
 * 활성화 응답을 읽는 것은 차이 장부 **D111**.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { activateParentClass, clearClassInclude } from './internal/classIncludeClear';
import { SourceCheckFailure, describeFailure, errorResult, okResult } from './shared';

function failureMessage(error: unknown, className: string): string {
  if (error instanceof SourceCheckFailure) return error.message;
  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `Local macros for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to delete local macros: ${describeFailure(error)}`;
}

export const deleteLocalMacros = defineTool(
  {
    name: 'DeleteLocalMacros',
    description:
      'Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate_on_delete: z
        .boolean()
        .describe('Activate parent class after deleting. Default: false')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name'],
  },
  async (context, args) => {
    if (!args.class_name) return errorResult('Error: class_name is required');

    const className = args.class_name.toUpperCase();
    const shouldActivate = args.activate_on_delete === true;
    context.logger.info(`Deleting local macros for ${className}`);

    try {
      const client = await context.getConnection();
      await clearClassInclude(client, {
        className,
        includeType: 'macros',
        transportRequest: args.transport_request,
      });

      if (shouldActivate) await activateParentClass(client, className, 'local macros include');

      context.logger.info(`DeleteLocalMacros completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        transport_request: args.transport_request || null,
        activated: shouldActivate,
        message: `Local macros deleted successfully from ${className}.`,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      context.logger.error(`Error deleting local macros for ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
