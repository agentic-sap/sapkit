/**
 * DeleteLocalTypes — 클래스의 **`implementations`** 인클루드를 비운다.
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 이름과 주소가 어긋난다 (실측 — 이 넷 중 유일하다)
 *
 * 도구 이름은 `LocalTypes`인데 비우는 인클루드는 **`implementations`**다
 * (`…/dist/core/class/AdtLocalTypes.js`의 `delete()`가
 * `clearClassInclude(…, 'implementations', …)`를 부른다). 발행 설명도 "clearing the
 * implementations include"라고 적는다. `definitions`로 짐작하면 **엉뚱한 인클루드를
 * 비운다** — 형제 `DeleteLocalDefinitions`가 그쪽을 소유한다.
 *
 * 겉: `engine/src/handlers/class/high/handleDeleteLocalTypes.ts:47-122`.
 * 사슬의 와이어 근거는 `./internal/classIncludeClear.ts` 머리주석.
 *
 * 활성화 응답을 읽는 것은 차이 장부 **D111**. 같은 인클루드를 쓰는
 * `UpdateLocalTypes`는 그보다 앞선 **D2**로 이미 같은 자리를 고쳤다 — 두 도구가
 * 같은 실패에 다르게 답하지 않게 맞춘 것이다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { activateParentClass, clearClassInclude } from './internal/classIncludeClear';
import { SourceCheckFailure, describeFailure, errorResult, okResult } from './shared';

function failureMessage(error: unknown, className: string): string {
  if (error instanceof SourceCheckFailure) return error.message;
  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `Local types for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to delete local types: ${describeFailure(error)}`;
}

export const deleteLocalTypes = defineTool(
  {
    name: 'DeleteLocalTypes',
    description:
      'Delete local types from an ABAP class by clearing the implementations include. Manages lock, update, unlock, and optional activation.',
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
    context.logger.info(`Deleting local types for ${className}`);

    try {
      const client = await context.getConnection();
      await clearClassInclude(client, {
        className,
        // 이름은 LocalTypes지만 인클루드는 implementations다.
        includeType: 'implementations',
        transportRequest: args.transport_request,
      });

      if (shouldActivate) await activateParentClass(client, className, 'local types include');

      context.logger.info(`DeleteLocalTypes completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        transport_request: args.transport_request || null,
        activated: shouldActivate,
        message: `Local types deleted successfully from ${className}.`,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      context.logger.error(`Error deleting local types for ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
