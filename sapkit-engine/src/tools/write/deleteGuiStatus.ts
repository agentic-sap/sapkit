/**
 * DeleteGuiStatus — 프로그램의 GUI 상태 한 개를 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 「지운다」가 **읽고 걸러서 전량 다시 쓰기**다 (실측 — 이 계열의 핵심)
 *
 * 겉: `engine/src/handlers/gui_status/high/handleDeleteGuiStatus.ts:53-181`.
 * 그 핸들러의 주석이 왜 그런지를 적어 둔다: **`RS_CUA_DELETE`(대리자 동작
 * `CUA_DELETE`)는 `RS38L_INCL`의 런타임 로드만 지우고 `rsmpe_stat`/`rsmpe_titt`/
 * `rsmpe_staf`를 건드리지 않는다.** 소스에서 상태를 실제로 없애려면 CUA 전량을
 * 읽어 해당 행을 빼고 다시 써야 한다. 그래서 시퀀스가 이렇다:
 *
 * ```
 * ① LOCK   POST /sap/bc/adt/programs/programs/{대문자}?_action=LOCK&accessMode=MODIFY
 * ② FETCH  대리자 CUA_FETCH { program }
 * ③ (로컬) STA·TIT는 CODE로, SET은 STATUS로 걸러 낸다
 * ④ WRITE  대리자 CUA_WRITE { program, cua_data }   ← **전량**이다
 * ⑤ UNLOCK POST …?_action=UNLOCK&lockHandle=…
 * ```
 *
 * **STA에서 걸러진 행이 하나도 없으면 쓰지 않고 실패**한다("not found in program").
 * 세 표를 지우면서 존재 판정은 STA로만 하는 것도 구 그대로다.
 *
 * 잠금·해제 URI는 `./internal/programScoped.ts`의 `programObjectUri`(대문자 그대로).
 *
 * ## 구를 그대로 둔 자리 · 고친 자리
 *
 *  - **`transport_request`를 받지만 쓰지 않는다.** 발행 스키마에 있고 핸들러가
 *    한 번도 읽지 않는다 — 잠금에도 쓰기에도 실리지 않는다. 발행 표면을 바꾸지
 *    않는다는 규칙이 이겨서 인자는 그대로 두고 동작도 그대로 뒀다.
 *  - **활성화 걸음이 없다.** 형제 `DeleteTextElement`에는 있다.
 *  - 잠금 손잡이가 없으면 **진행하지 않는다** — 차이 장부 **D113**. 구는 그대로
 *    진행해 `CUA_WRITE`를 보냈다.
 *  - 클라우드(JWT) 거절 갈래는 짓지 않았다 — 차이 장부 **D112**.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import { programObjectUri, programScopedError } from './internal/programScoped';
import { describeFailure, okResult } from './shared';

/** CUA 표 하나에서 지울 행을 걸러 낸다. 값 비교는 구 그대로 **엄격 일치**다. */
function without(rows: unknown, key: string, value: string): unknown {
  if (!Array.isArray(rows)) return rows;
  return rows.filter((row) => (row as Record<string, unknown> | null)?.[key] !== value);
}

function lengthOf(rows: unknown): number {
  return Array.isArray(rows) ? rows.length : 0;
}

export const deleteGuiStatus = defineTool(
  {
    name: 'DeleteGuiStatus',
    description:
      'Delete an ABAP GUI Status from a program. Handles lock/unlock automatically.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      status_name: z.string().describe('GUI Status name to delete.'),
      // 구가 받기만 하고 쓰지 않는 인자. 발행 표면을 바꾸지 않는다.
      transport_request: z.string().describe('Transport request number.').optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || !args.status_name) {
      return programScopedError('Missing required parameters: program_name and status_name');
    }

    const programName = args.program_name.toUpperCase();
    const statusName = args.status_name.toUpperCase();
    const uri = programObjectUri(programName);
    context.logger.info(`Deleting GUI status: ${programName}/${statusName}`);

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      await client.withLock(uri, async () => {
        const fetched = await channel.callDispatch('CUA_FETCH', { program: programName });
        const result = fetched.result;
        if (!result || typeof result !== 'object') {
          throw new Error(`Could not fetch CUA data for program ${programName} prior to delete.`);
        }

        const cua = { ...(result as Record<string, unknown>) };
        const staBefore = lengthOf(cua['STA']);
        cua['STA'] = without(cua['STA'], 'CODE', statusName);
        cua['TIT'] = without(cua['TIT'], 'CODE', statusName);
        cua['SET'] = without(cua['SET'], 'STATUS', statusName);

        // 존재 판정은 STA로만 한다 — 구 그대로.
        if (lengthOf(cua['STA']) === staBefore) {
          throw new Error(`GUI Status ${statusName} not found in program ${programName}.`);
        }

        await channel.callDispatch('CUA_WRITE', {
          program: programName,
          cua_data: JSON.stringify(cua),
        });
      });

      context.logger.info(`GUI status deleted: ${programName}/${statusName}`);
      return okResult({
        success: true,
        program_name: programName,
        status_name: statusName,
        message: `GUI Status ${programName}/${statusName} deleted successfully.`,
        steps_completed: ['lock', 'delete', 'unlock'],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error deleting GUI status: ${message}`);
      return programScopedError(`Failed to delete GUI status: ${message}`);
    }
  },
);
