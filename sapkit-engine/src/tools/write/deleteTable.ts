/**
 * DeleteTable — DDIC 투명 테이블을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로(두 번째 실행은 "없다"로 실패한다) 요구 증거 급이
 * `attended 실기`이고, 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/table/high/handleDeleteTable.ts:49-143`.
 * 사슬: `…/dist/core/table/AdtTable.js`의 `delete()` — 검사 → 삭제. **세션을 건드리지
 * 않는다**(벤더 주석 "no stateful needed - no lock/unlock"). 클래스·인터페이스·
 * 프로그램이 삭제 걸음을 stateful로 보내는 것과 **여기서 갈린다.**
 * 전문: `…/dist/core/table/delete.js:19-84` — 오브젝트 URI는
 * `/sap/bc/adt/ddic/tables/{encodeURIComponent(이름)}`, **대문자 그대로**.
 *
 * 벤더 주석의 표기 함정 하나: `structure/delete.js`는 "Structures should NOT have
 * empty transportNumber tag"라고 적어 놓고 **본문은 빈 태그를 넣는다.** 테이블도
 * 같은 모양이므로 두 종은 실제로는 **같다** — 주석이 아니라 본문이 계약이다.
 *
 * ## ECC 우회로를 짓지 않았다 (차이 장부 **D110**)
 *
 * 구는 `SAP_VERSION=ECC`면 `callDdicTabl(connection, 'DELETE', …)`로 OData 브리지를
 * 탄다(`handleDeleteTable.ts:66-67`·`:145-185`). 이 엔진의 RFC 통로가 가진 DDIC
 * 능력은 **읽기 브리지 하나**(`callDdicTablRead`)뿐이고 쓰기 브리지를 더하는 것은
 * `src/rfc/**`를 고치는 일이라 이 묶음 밖이다. 그냥 ADT로 흘려보내면 ECC 커널에
 * 없는 엔드포인트에 **삭제를 시도**하게 되므로 이름 있는 거절로 끝낸다.
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

/** 삭제 서비스 전문에 실리는 테이블 주소 — **대문자 그대로.** */
export function tableDeletionUri(tableName: string): string {
  return `/sap/bc/adt/ddic/tables/${encodeObjectName(tableName)}`;
}

export const deleteTable = defineTool(
  {
    name: 'DeleteTable',
    description:
      'Delete an ABAP table from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      table_name: z.string().describe('Table name (e.g., Z_MY_TABLE).'),
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
    targetNames: ['table_name'],
  },
  async (context, args) => {
    if (!args.table_name) return errorResult('Error: table_name is required');

    const tableName = args.table_name.toUpperCase();

    // 구가 ECC에서 갈라지던 자리. 흘려보내지 않는다 — 장부 D110.
    if (isEcc(context.profile.sapVersion)) {
      return errorResult(
        `Error: ${eccDeleteUnsupported('DeleteTable', 'ZSAPKIT_ADT_DDIC_TABL', 'tables')}`,
      );
    }

    context.logger.info(`Starting table deletion: ${tableName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: tableDeletionUri(tableName),
        label: 'Table',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteTable completed successfully: ${tableName}`);
      return okResult({
        success: true,
        table_name: tableName,
        transport_request: args.transport_request || null,
        message: `Table ${tableName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'table',
        label: 'Table',
        name: tableName,
      });
      context.logger.error(`Error deleting table ${tableName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
