/**
 * DeleteFunctionGroup — 함수그룹을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/function_group/high/handleDeleteFunctionGroup.ts:49-132`.
 * 사슬: `…/dist/core/functionGroup/AdtFunctionGroup.js`의 `delete()` — 검사 → 삭제,
 * **세션 무접촉**("no stateful needed - no lock/unlock").
 * 전문: `…/dist/core/functionGroup/delete.js:19-84` — 오브젝트 URI는
 * `/sap/bc/adt/functions/groups/{encodeURIComponent(이름)}`, **대문자 그대로**.
 *
 * ## 라벨 셋이 서로 다르다 (실측 — 이 계열의 함정)
 *
 * | 자리 | 값 | 근거 |
 * |---|---|---|
 * | 벤더의 거짓 성공 판정 | `Function group` (두 낱말) | `delete.js:74` |
 * | 겉 핸들러의 404·423 문구 | `FunctionGroup` (붙여 쓴다) | `handleDeleteFunctionGroup.ts:106`·`:108` |
 * | 겉 핸들러의 일반 실패 주어 | `function group` (두 낱말·소문자) | `:103` |
 *
 * 세 자리가 전부 다르다. 하나로 접으면 구와 문구가 어긋난다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 함수그룹 주소 — **대문자 그대로.** */
export function functionGroupDeletionUri(functionGroupName: string): string {
  return `/sap/bc/adt/functions/groups/${encodeObjectName(functionGroupName)}`;
}

export const deleteFunctionGroup = defineTool(
  {
    name: 'DeleteFunctionGroup',
    description:
      'Delete an ABAP function group from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      function_group_name: z.string().describe('FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['function_group_name'],
  },
  async (context, args) => {
    if (!args.function_group_name) return errorResult('Error: function_group_name is required');

    const functionGroupName = args.function_group_name.toUpperCase();
    context.logger.info(`Starting function group deletion: ${functionGroupName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: functionGroupDeletionUri(functionGroupName),
        label: 'Function group',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteFunctionGroup completed successfully: ${functionGroupName}`);
      return okResult({
        success: true,
        function_group_name: functionGroupName,
        transport_request: args.transport_request || null,
        message: `FunctionGroup ${functionGroupName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'function group',
        label: 'FunctionGroup',
        name: functionGroupName,
      });
      context.logger.error(`Error deleting function group ${functionGroupName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
