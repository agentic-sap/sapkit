/**
 * DeleteInterface — 전역 ABAP 인터페이스를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로(두 번째 실행은 "없다"로 실패한다) 이 도구의 요구 증거 급은
 * `attended 실기`이고, 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/interface/high/handleDeleteInterface.ts:47-133`.
 * 사슬: `…/dist/core/interface/AdtInterface.js`의 `delete()` — 검사(stateless) →
 * **stateful로 바꾸고** 삭제 → `finally`에서 stateless로 되돌린다. **잠금은 없다**
 * ("requires stateful, but no lock").
 * 전문: `…/dist/core/interface/delete.js:19-84` — 오브젝트 URI는
 * `/sap/bc/adt/oo/interfaces/{encodeURIComponent(이름)}`이고 **소문자로 내리지
 * 않는다.** 겉 핸들러가 먼저 `.toUpperCase()` 하므로 대문자가 실린다.
 *
 * **같은 인터페이스라도 자리마다 표기가 다르다** — 이미 지어진 `./interfaceUri.ts`의
 * 표가 실측 정본이다(PUT·UNLOCK만 대문자였다). 삭제 서비스의 URI는 **또 다른
 * 자리**이므로 그 표에 얹지 않고 여기서 따로 조립한다.
 *
 * 공통 뼈대와 종류별 차이 표: `./internal/deletion.ts` 머리주석.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 인터페이스 주소 — **대문자 그대로.** */
export function interfaceDeletionUri(interfaceName: string): string {
  return `/sap/bc/adt/oo/interfaces/${encodeObjectName(interfaceName)}`;
}

export const deleteInterface = defineTool(
  {
    name: 'DeleteInterface',
    description:
      'Delete an ABAP interface from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      interface_name: z.string().describe('Interface name (e.g., Z_MY_INTERFACE).'),
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
    targetNames: ['interface_name'],
  },
  async (context, args) => {
    if (!args.interface_name) return errorResult('Error: interface_name is required');

    const interfaceName = args.interface_name.toUpperCase();
    context.logger.info(`Starting interface deletion: ${interfaceName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: interfaceDeletionUri(interfaceName),
        label: 'Interface',
        transportRequest: args.transport_request,
        stateful: true,
      });

      context.logger.info(`DeleteInterface completed successfully: ${interfaceName}`);
      return okResult({
        success: true,
        interface_name: interfaceName,
        transport_request: args.transport_request || null,
        message: `Interface ${interfaceName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'interface',
        label: 'Interface',
        name: interfaceName,
      });
      context.logger.error(`Error deleting interface ${interfaceName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
