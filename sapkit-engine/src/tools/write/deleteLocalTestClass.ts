/**
 * DeleteLocalTestClass — 클래스의 `testclasses` 인클루드를 **비운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 「지운다」가 PUT이다
 *
 * 겉: `engine/src/handlers/class/high/handleDeleteLocalTestClass.ts:55-132`.
 * 사슬: `…/dist/core/class/AdtLocalTestClass.js`의 `delete()` — 잠금 →
 * `clearClassTestInclude` → 해제. 삭제 서비스를 타지 않는다. 사슬의 와이어 근거와
 * 「본문이 공백 한 칸인 이유」는 `./internal/classIncludeClear.ts` 머리주석이 정본.
 *
 * ## 구를 그대로 둔 자리 · 고친 자리
 *
 *  - 400 전용 오류 갈래가 **없다**(구에 없다). 404·423만 가른다.
 *  - `activate_on_delete`의 활성화 응답을 **읽는다** — 차이 장부 **D111**.
 *    구는 읽지 않아 활성화 실패도 `activated: true`로 답했다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { activateParentClass, clearClassInclude } from './internal/classIncludeClear';
import { SourceCheckFailure, describeFailure, errorResult, okResult } from './shared';

function failureMessage(error: unknown, className: string): string {
  if (error instanceof SourceCheckFailure) return error.message;
  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `Local test class for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to delete local test class: ${describeFailure(error)}`;
}

export const deleteLocalTestClass = defineTool(
  {
    name: 'DeleteLocalTestClass',
    description:
      'Delete a local test class from an ABAP class by clearing the testclasses include. Manages lock, update, unlock, and optional activation of parent class.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
      transport_request: z
        .string()
        .describe('Transport request number (required for transportable objects).')
        .optional(),
      activate_on_delete: z
        .boolean()
        .describe('Activate parent class after deleting test class. Default: false')
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
    context.logger.info(`Deleting local test class for ${className}`);

    try {
      const client = await context.getConnection();
      await clearClassInclude(client, {
        className,
        includeType: 'testclasses',
        transportRequest: args.transport_request,
      });

      if (shouldActivate) await activateParentClass(client, className, 'local test class');

      context.logger.info(`DeleteLocalTestClass completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        transport_request: args.transport_request || null,
        activated: shouldActivate,
        message: `Local test class deleted successfully from ${className}.`,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      context.logger.error(`Error deleting local test class for ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
