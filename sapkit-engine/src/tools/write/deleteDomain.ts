/**
 * DeleteDomain — DDIC 도메인을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/domain/high/handleDeleteDomain.ts:48-186`.
 * 사슬: `…/dist/core/domain/AdtDomain.js`의 `delete()` — 검사 → 삭제, **세션 무접촉**.
 * 전문: `…/dist/core/domain/delete.js:19-84` — 오브젝트 URI는
 * `/sap/bc/adt/ddic/domains/{encodeURIComponent(이름)}`, **대문자 그대로**.
 *
 * ## ECC 우회로를 짓지 않았다 (차이 장부 **D110**)
 *
 * 구는 `SAP_VERSION=ECC`에서 `callDdicDoma(connection, 'DELETE', …)` — SAP 측
 * 브리지 함수모듈 `ZSAPKIT_ADT_DDIC_DOMA` — 로 우회한다(`:65-66`·`:148-186`). 이
 * 엔진의 RFC 통로에는 DDIC **읽기** 브리지 하나뿐이라 그 통로가 없고, 그냥 ADT로
 * 흘려보내면 ECC 커널에 없는 엔드포인트에 삭제를 시도하게 된다. 이름 있는 거절로
 * 끝낸다.
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

/** 삭제 서비스 전문에 실리는 도메인 주소 — **대문자 그대로.** */
export function domainDeletionUri(domainName: string): string {
  return `/sap/bc/adt/ddic/domains/${encodeObjectName(domainName)}`;
}

export const deleteDomain = defineTool(
  {
    name: 'DeleteDomain',
    description:
      'Delete an ABAP domain from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      domain_name: z.string().describe('Domain name (e.g., Z_MY_DOMAIN).'),
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
    targetNames: ['domain_name'],
  },
  async (context, args) => {
    if (!args.domain_name) return errorResult('Error: domain_name is required');

    const domainName = args.domain_name.toUpperCase();

    if (isEcc(context.profile.sapVersion)) {
      return errorResult(
        `Error: ${eccDeleteUnsupported('DeleteDomain', 'ZSAPKIT_ADT_DDIC_DOMA', 'domains')}`,
      );
    }

    context.logger.info(`Starting domain deletion: ${domainName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: domainDeletionUri(domainName),
        label: 'Domain',
        transportRequest: args.transport_request,
      });

      context.logger.info(`DeleteDomain completed successfully: ${domainName}`);
      return okResult({
        success: true,
        domain_name: domainName,
        transport_request: args.transport_request || null,
        message: `Domain ${domainName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'domain',
        label: 'Domain',
        name: domainName,
      });
      context.logger.error(`Error deleting domain ${domainName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
