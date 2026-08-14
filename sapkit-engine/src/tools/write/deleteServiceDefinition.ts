/**
 * DeleteServiceDefinition — 서비스 정의(SRVD)를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/service_definition/high/handleDeleteServiceDefinition.ts:49-132`.
 * 사슬: `…/dist/core/serviceDefinition/AdtServiceDefinition.js`의 `delete()` —
 * 검사 → 삭제, **세션 무접촉**.
 * 전문: `…/dist/core/serviceDefinition/delete.js:19-84` — 오브젝트 URI는
 * `/sap/bc/adt/ddic/srvd/sources/{encodeURIComponent(이름)}`, **대문자 그대로**.
 *
 * ## 같은 SRVD라도 자리마다 표기가 다르다 (실측)
 *
 * 읽기·쓰기 쪽 SRVD URI는 `encodeURIComponent(이름.toLowerCase())`로 **소문자**다
 * (`./internal/serviceDefinition.ts`). 삭제 서비스만 겉 핸들러가 대문자로 올린
 * 이름을 그대로 싣는다 — 두 자리를 접어 합치면 구가 보내던 주소와 달라진다.
 *
 * `DeleteServiceBinding`(SRVB)과도 **다른 계열**이다: 그쪽은 삭제 검사 걸음이 없고
 * 발행취소 사전 걸음이 있으며 전문이 한 줄이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 SRVD 주소 — **대문자 그대로.** */
export function serviceDefinitionDeletionUri(serviceDefinitionName: string): string {
  return `/sap/bc/adt/ddic/srvd/sources/${encodeObjectName(serviceDefinitionName)}`;
}

export const deleteServiceDefinition = defineTool(
  {
    name: 'DeleteServiceDefinition',
    description:
      'Delete an ABAP service definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      service_definition_name: z
        .string()
        .describe('ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['service_definition_name'],
  },
  async (context, args) => {
    if (!args.service_definition_name) {
      return errorResult('Error: service_definition_name is required');
    }

    const serviceDefinitionName = args.service_definition_name.toUpperCase();
    context.logger.info(`Starting service definition deletion: ${serviceDefinitionName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: serviceDefinitionDeletionUri(serviceDefinitionName),
        label: 'Service definition',
        transportRequest: args.transport_request,
      });

      context.logger.info(
        `DeleteServiceDefinition completed successfully: ${serviceDefinitionName}`,
      );
      return okResult({
        success: true,
        service_definition_name: serviceDefinitionName,
        transport_request: args.transport_request || null,
        message: `ServiceDefinition ${serviceDefinitionName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'service definition',
        label: 'ServiceDefinition',
        name: serviceDefinitionName,
      });
      context.logger.error(
        `Error deleting service definition ${serviceDefinitionName}: ${message}`,
      );
      return errorResult(`Error: ${message}`);
    }
  },
);
