/**
 * DeleteLocalDefinitions — 클래스의 `definitions` 인클루드를 **비운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * 겉: `engine/src/handlers/class/high/handleDeleteLocalDefinitions.ts:47-124`.
 * 사슬: `…/dist/core/class/AdtLocalDefinitions.js`의 `delete()` — 잠금 →
 * `clearClassInclude(…, 'definitions', …)` → 해제. 삭제 서비스를 타지 않는다.
 * 사슬의 와이어 근거와 「본문이 공백 한 칸인 이유」는
 * `./internal/classIncludeClear.ts` 머리주석이 정본.
 *
 * `DeleteLocalTestClass`와 **발행 스키마의 설명 문구가 다르다** — 이송번호는
 * "Transport request number."(짧은 판)이고 활성화 인자는 "Activate parent class
 * after deleting. Default: false"다. 형제 도구의 문구를 베끼면 채록본과 글자가
 * 어긋난다.
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
  if (status === 404) return `Local definitions for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to delete local definitions: ${describeFailure(error)}`;
}

export const deleteLocalDefinitions = defineTool(
  {
    name: 'DeleteLocalDefinitions',
    description:
      'Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.',
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
    context.logger.info(`Deleting local definitions for ${className}`);

    try {
      const client = await context.getConnection();
      await clearClassInclude(client, {
        className,
        includeType: 'definitions',
        transportRequest: args.transport_request,
      });

      if (shouldActivate) await activateParentClass(client, className, 'local definitions include');

      context.logger.info(`DeleteLocalDefinitions completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        transport_request: args.transport_request || null,
        activated: shouldActivate,
        message: `Local definitions deleted successfully from ${className}.`,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      context.logger.error(`Error deleting local definitions for ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
