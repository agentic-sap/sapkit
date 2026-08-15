/**
 * DeleteView — CDS 뷰(DDLS)를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/view/high/handleDeleteView.ts:47-129`.
 * 사슬: `…/dist/core/view/AdtView.js`의 `delete()` — 검사 → 삭제, **세션 무접촉**.
 * 전문: `…/dist/core/view/delete.js:19-84`.
 *
 * ## 주소가 「뷰」가 아니다 (실측 — 이름만 보고 짐작하면 틀린다)
 *
 * 오브젝트 URI는 `/sap/bc/adt/ddic/ddl/sources/{이름}`이다. `ddic/views`가 아니라
 * **CDS DDL 소스 컬렉션**이며, 같은 계열의 `ddic/tables`·`ddic/structures`·
 * `ddic/domains`·`ddic/dataelements`와 조각 수부터 다르다. 이름은
 * `encodeURIComponent` + **대문자 그대로**다(겉 핸들러가 `.toUpperCase()`를 먼저 한다).
 *
 * ECC 우회 갈래는 **없다** — 구 핸들러에 그 분기가 아예 없다(테이블·도메인·
 * 데이터엘리먼트 셋만 갖는다). 그래서 여기에는 장부 D110이 걸리지 않는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 뷰 주소 — **DDL 소스 컬렉션 · 대문자 그대로.** */
export function viewDeletionUri(viewName: string): string {
  return `/sap/bc/adt/ddic/ddl/sources/${encodeObjectName(viewName)}`;
}

export const deleteView = defineTool(
  {
    name: 'DeleteView',
    description:
      'Delete an ABAP view from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      view_name: z.string().describe('View name (e.g., Z_MY_VIEW).'),
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
    targetNames: ['view_name'],
  },
  async (context, args) => {
    if (!args.view_name) return errorResult('Error: view_name is required');

    const viewName = args.view_name.toUpperCase();
    context.logger.info(`Starting view deletion: ${viewName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: viewDeletionUri(viewName),
        label: 'View',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteView completed successfully: ${viewName}`);
      return okResult({
        success: true,
        view_name: viewName,
        transport_request: args.transport_request || null,
        message: `View ${viewName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'view',
        label: 'View',
        name: viewName,
      });
      context.logger.error(`Error deleting view ${viewName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
