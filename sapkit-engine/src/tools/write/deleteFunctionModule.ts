/**
 * DeleteFunctionModule — 함수모듈을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/function_module/high/handleDeleteFunctionModule.ts:57-145`.
 * 사슬: `…/dist/core/functionModule/AdtFunctionModule.js`의 `delete()` — 검사 →
 * 삭제, **세션 무접촉**.
 * 전문: `…/dist/core/functionModule/delete.js:14-92`.
 *
 * ## 이 계열의 유일한 **두 단짜리 주소**
 *
 * ```
 * /sap/bc/adt/functions/groups/{그룹}/fmodules/{모듈}
 * ```
 *
 * 두 이름 모두 `encodeURIComponent` + **대문자 그대로**이고, **검사 걸음도 같은
 * 주소**를 쓴다(`delete.js:22-33`과 `:53-55`가 같은 조립). 그래서 이 도구는
 * 대상-이름 인자가 **둘**이며, 녹화 사전 검사도 둘 다 Z·Y인지 본다 — 그룹이
 * 표준이면(예: `MG`) SAP 호출 전에 막힌다.
 *
 * 라벨 셋: 벤더 `Function module` / 상태 문구 `FunctionModule` / 일반 실패 주어
 * `function module`. 함수그룹과 같은 모양의 함정이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 함수모듈 주소 — 그룹·모듈 **둘 다 대문자 그대로.** */
export function functionModuleDeletionUri(
  functionGroupName: string,
  functionModuleName: string,
): string {
  return (
    `/sap/bc/adt/functions/groups/${encodeObjectName(functionGroupName)}` +
    `/fmodules/${encodeObjectName(functionModuleName)}`
  );
}

export const deleteFunctionModule = defineTool(
  {
    name: 'DeleteFunctionModule',
    description:
      'Delete an ABAP function module from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      function_module_name: z
        .string()
        .describe('FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).'),
      function_group_name: z
        .string()
        .describe('FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).'),
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
    // 두 이름 모두 사전 검사의 대상이다 — 그룹이 표준이면 SAP 호출 전에 막힌다.
    targetNames: ['function_module_name', 'function_group_name'],
  },
  async (context, args) => {
    if (!args.function_module_name || !args.function_group_name) {
      return errorResult(
        'Error: Missing required parameters: function_module_name and function_group_name',
      );
    }

    const functionModuleName = args.function_module_name.toUpperCase();
    const functionGroupName = args.function_group_name.toUpperCase();
    context.logger.info(`Starting function module deletion: ${functionModuleName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: functionModuleDeletionUri(functionGroupName, functionModuleName),
        label: 'Function module',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteFunctionModule completed successfully: ${functionModuleName}`);
      return okResult({
        success: true,
        function_module_name: functionModuleName,
        function_group_name: functionGroupName,
        transport_request: args.transport_request || null,
        message: `FunctionModule ${functionModuleName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'function module',
        label: 'FunctionModule',
        name: functionModuleName,
      });
      context.logger.error(`Error deleting function module ${functionModuleName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
