/**
 * DeleteProgram — ABAP 프로그램(리포트·모듈풀)을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로(두 번째 실행은 "없다"로 실패한다) 요구 증거 급이
 * `attended 실기`이고, 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/program/high/handleDeleteProgram.ts:48-134`.
 * 사슬: `…/dist/core/program/AdtProgram.js`의 `delete()` — 검사(stateless) →
 * **stateful로 바꾸고** 삭제 → `finally`에서 stateless. **잠금은 없다.**
 * 전문: `…/dist/core/program/delete.js:19-83` — 오브젝트 URI는
 * `/sap/bc/adt/programs/programs/{encodeURIComponent(이름)}`, **대문자 그대로**다
 * (겉 핸들러가 `.toUpperCase()`를 먼저 한다).
 *
 * **같은 프로그램이라도 자리마다 표기가 다르다** — `./shared.ts`의 `programUri()`는
 * 항상 **소문자**이고(쓰기 사슬), `./internal/programScoped.ts`의
 * `programObjectUri()`는 **대문자**(잠금·활성화), `programCheckUri()`는 소문자
 * (구문검사)다. 삭제 서비스의 URI는 그중 어느 것도 아니라 **여기서 따로 조립한다.**
 * 값이 같아 보이는 것과 같은 자리인 것은 다르다.
 *
 * 배포 축이 `['onprem','legacy']`인 것도 실측이다 — 클라우드에는 이 도구가 없다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** 삭제 서비스 전문에 실리는 프로그램 주소 — **대문자 그대로.** */
export function programDeletionUri(programName: string): string {
  return `/sap/bc/adt/programs/programs/${encodeObjectName(programName)}`;
}

export const deleteProgram = defineTool(
  {
    name: 'DeleteProgram',
    description:
      'Delete an ABAP program from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      program_name: z.string().describe('Program name (e.g., Z_MY_PROGRAM).'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name) return errorResult('Error: program_name is required');

    const programName = args.program_name.toUpperCase();
    context.logger.info(`Starting program deletion: ${programName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: programDeletionUri(programName),
        label: 'Program',
        transportRequest: args.transport_request,
        stateful: true,
      });

      context.logger.info(`DeleteProgram completed successfully: ${programName}`);
      return okResult({
        success: true,
        program_name: programName,
        transport_request: args.transport_request || null,
        message: `Program ${programName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'program',
        label: 'Program',
        name: programName,
      });
      context.logger.error(`Error deleting program ${programName}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
