/**
 * DeleteStructure — DDIC 구조체를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/structure/high/handleDeleteStructure.ts:44-120`.
 * 사슬: `…/dist/core/structure/AdtStructure.js`의 `delete()` — 검사 → 삭제,
 * **세션 무접촉**(테이블과 같다).
 * 전문: `…/dist/core/structure/delete.js:19-85` — 오브젝트 URI는
 * `/sap/bc/adt/ddic/structures/{encodeURIComponent(이름)}`, **대문자 그대로**.
 *
 * ## 테이블과 갈리는 자리 · 갈리지 않는 자리 (실측)
 *
 * | | `DeleteTable` | `DeleteStructure` |
 * |---|---|---|
 * | 오브젝트 URI 조각 | `ddic/tables` | `ddic/structures` |
 * | 이송번호 빈 태그 | 넣는다 | **넣는다** (벤더 주석은 "should NOT"이라 적지만 본문은 넣는다) |
 * | ECC 우회 갈래 | 있다(→ D110) | **없다** — 구 핸들러에 그 분기가 아예 없다 |
 * | 삭제 응답의 `del:object` 수 | 보통 1 | **여럿일 수 있다** (TABL/DS + TABT/DTT) |
 *
 * 마지막 줄이 `assertDeletionSucceeded`가 배열을 다루는 이유다 — 벤더 주석이
 * 구조체를 그 예로 든다(`dist/utils/internalUtils.js`). **전부** `isDeleted="true"`
 * 여야 성공이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 구조체 주소 — **대문자 그대로.** */
export function structureDeletionUri(structureName: string): string {
  return `/sap/bc/adt/ddic/structures/${encodeObjectName(structureName)}`;
}

export const deleteStructure = defineTool(
  {
    name: 'DeleteStructure',
    description:
      'Delete an ABAP structure from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      structure_name: z.string().describe('Structure name (e.g., Z_MY_STRUCTURE).'),
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
    targetNames: ['structure_name'],
  },
  async (context, args) => {
    if (!args.structure_name) return errorResult('Error: structure_name is required');

    const structureName = args.structure_name.toUpperCase();
    context.logger.info(`Starting structure deletion: ${structureName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: structureDeletionUri(structureName),
        label: 'Structure',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteStructure completed successfully: ${structureName}`);
      return okResult({
        success: true,
        structure_name: structureName,
        transport_request: args.transport_request || null,
        message: `Structure ${structureName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'structure',
        label: 'Structure',
        name: structureName,
      });
      context.logger.error(`Error deleting structure ${structureName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
