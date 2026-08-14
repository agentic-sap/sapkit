/**
 * DeleteDataElement — DDIC 데이터 엘리먼트를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/data_element/high/handleDeleteDataElement.ts:49-192`.
 * 사슬: `…/dist/core/dataElement/AdtDataElement.js`의 `delete()` — 검사 → 삭제,
 * **세션 무접촉**.
 * 전문: `…/dist/core/dataElement/delete.js:19-85` — 오브젝트 URI는
 * `/sap/bc/adt/ddic/dataelements/{encodeURIComponent(이름)}`(한 낱말 · 밑줄 없음),
 * **대문자 그대로**.
 *
 * ## 라벨이 두 자리에서 다르다 (실측)
 *
 * 벤더가 거짓 성공 판정에 넘기는 이름은 `"Data element"`(`delete.js:74`)이고,
 * 겉 핸들러가 404·423 문구에 쓰는 이름도 `Data element`(`:117`·`:119`)이며,
 * 일반 실패 문구의 주어는 `data element`다(`:114`). 다른 종류에서는 이 셋이
 * 대체로 같은 낱말이지만(예: `Table`/`Table`/`table`) 여기서는 띄어쓰기가 들어가
 * 눈으로 옮기면 틀린다.
 *
 * ## ECC 우회로를 짓지 않았다 (차이 장부 **D110**)
 *
 * 구는 `SAP_VERSION=ECC`에서 브리지 함수모듈 `ZMCP_ADT_DDIC_DTEL`로 우회한다
 * (`:66-67`·`:152-192`). 이 엔진의 RFC 통로에는 DDIC **읽기** 브리지뿐이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import {
  deletionFailureMessage,
  eccDeleteUnsupported,
  isEcc,
  runDeletion,
} from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 데이터 엘리먼트 주소 — **대문자 그대로.** */
export function dataElementDeletionUri(dataElementName: string): string {
  return `/sap/bc/adt/ddic/dataelements/${encodeObjectName(dataElementName)}`;
}

export const deleteDataElement = defineTool(
  {
    name: 'DeleteDataElement',
    description:
      'Delete an ABAP data element from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      data_element_name: z.string().describe('Data element name (e.g., Z_MY_DATA_ELEMENT).'),
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
    targetNames: ['data_element_name'],
  },
  async (context, args) => {
    if (!args.data_element_name) return errorResult('Error: data_element_name is required');

    const dataElementName = args.data_element_name.toUpperCase();

    if (isEcc(context.profile.sapVersion)) {
      return errorResult(
        `Error: ${eccDeleteUnsupported('DeleteDataElement', 'ZMCP_ADT_DDIC_DTEL', 'dataelements')}`,
      );
    }

    context.logger.info(`Starting data element deletion: ${dataElementName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: dataElementDeletionUri(dataElementName),
        label: 'Data element',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteDataElement completed successfully: ${dataElementName}`);
      return okResult({
        success: true,
        data_element_name: dataElementName,
        transport_request: args.transport_request || null,
        message: `Data element ${dataElementName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'data element',
        label: 'Data element',
        name: dataElementName,
      });
      context.logger.error(`Error deleting data element ${dataElementName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
