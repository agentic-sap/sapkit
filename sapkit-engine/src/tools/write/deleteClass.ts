/**
 * DeleteClass — 전역 ABAP 클래스를 SAP에서 **지운다.**
 *
 * ## 이 모듈이 증명하지 못하는 것 (읽고 넘어가지 말 것)
 *
 * **오프라인 계약 시험이 통과했다는 것은 「실제로 지운다」의 증거가 아니다.**
 * 삭제는 재생 대조가 원리상 불가능하다 — 두 번째 실행은 대상이 없어 "없다"로
 * 실패한다. 그래서 이 도구의 요구 증거 급은 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」에 머문다.** 여기 있는 시험이 증명하는 것은 "구와 같은
 * 바이트를 보낸다"까지다.
 *
 * ## 와이어 근거 (겉 핸들러 → 안쪽 패키지)
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleDeleteClass.ts:48-135`가
 * `AdtClass.delete()`를 부른다
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtClass.js`).
 * 그 본문이 나가게 하는 요청은 **두 개뿐**이다:
 *
 * ```
 * ① POST /sap/bc/adt/deletion/check     (stateless)
 * ② POST /sap/bc/adt/deletion/delete    (stateful — finally에서 stateless로 되돌린다)
 * ```
 *
 * 두 전문의 주소·헤더·바이트는 `dist/core/class/delete.js:19-88`이 짓는다.
 * **잠금은 없다** — 벤더 주석이 "requires stateful, but no lock"이라고 적고 실제로도
 * `?_action=LOCK`이 나가지 않는다. 공통 뼈대와 종류별 차이 표는
 * `./internal/deletion.ts` 머리주석.
 *
 * 이름 표기: `encodeSapObjectName(className)` = `encodeURIComponent`이고 **소문자로
 * 내리지 않는다**. 겉 핸들러가 `class_name.toUpperCase()`를 먼저 하므로 URI에는
 * 대문자가 실린다. 같은 클래스라도 `CreateClass`의 구문검사 URI는 소문자였다
 * (`./shared.ts`의 `classUri`) — **자리마다 다르므로 접어 합치지 않는다.**
 *
 * ## 구를 그대로 둔 자리
 *
 * 구는 `if (!deleteResult || !deleteResult.deleteResult)`로 "응답이 없다" 갈래를
 * 갖지만 벤더 `delete()`는 성공하면 언제나 `state.deleteResult`를 채우므로 **도달
 * 불가능한 갈래**다. 죽은 코드를 옮기지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 클래스 주소 — **대문자 그대로.** */
export function classDeletionUri(className: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(className)}`;
}

export const deleteClass = defineTool(
  {
    name: 'DeleteClass',
    description:
      'Delete an ABAP class from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_MY_CLASS).'),
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
    targetNames: ['class_name'],
  },
  async (context, args) => {
    if (!args.class_name) return errorResult('Error: class_name is required');

    const className = args.class_name.toUpperCase();
    context.logger.info(`Starting class deletion: ${className}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: classDeletionUri(className),
        label: 'Class',
        transportRequest: args.transport_request,
        stateful: true,
      });

      context.logger.info(`DeleteClass completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        transport_request: args.transport_request || null,
        message: `Class ${className} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'class',
        label: 'Class',
        name: className,
      });
      context.logger.error(`Error deleting class ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
