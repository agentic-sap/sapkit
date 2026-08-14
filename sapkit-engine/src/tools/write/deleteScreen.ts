/**
 * DeleteScreen — 프로그램의 화면(Dynpro) 하나를 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 형제 `DeleteGuiStatus`와 **다른 모양이다** (실측 — 짐작하면 틀린다)
 *
 * 겉: `engine/src/handlers/screen/high/handleDeleteScreen.ts:46-150`.
 *
 * ```
 * ① LOCK   POST /sap/bc/adt/programs/programs/{대문자}?_action=LOCK&accessMode=MODIFY
 * ② DELETE 대리자 DYNPRO_DELETE { program, dynpro }   ← **읽기 걸음이 없다**
 * ③ UNLOCK POST …?_action=UNLOCK&lockHandle=…
 * ```
 *
 * GUI 상태는 대리자에 지우는 동작이 없어 전량을 다시 써야 했지만, 화면에는
 * **`DYNPRO_DELETE`가 실제로 있다.** 그래서 `CUA_FETCH` 같은 사전 읽기가 없고
 * 존재 판정도 하지 않는다 — 없는 화면을 지우면 대리자가 실패를 돌려준다.
 * 이미 지어진 `UpdateScreen`이 `DYNPRO_DELETE` + `DYNPRO_INSERT` 짝을 쓰는 것과도
 * 같은 자리다.
 *
 * ## 구를 그대로 둔 자리 · 고친 자리
 *
 *  - **`transport_request`를 받지만 쓰지 않는다**(`DeleteGuiStatus`와 같다).
 *  - **활성화 걸음이 없다.**
 *  - 잠금 손잡이가 없으면 **진행하지 않는다** — 차이 장부 **D113**.
 *  - 클라우드(JWT) 거절 갈래는 짓지 않았다 — 차이 장부 **D112**.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import { programObjectUri, programScopedError } from './internal/programScoped';
import { describeFailure, okResult } from './shared';

export const deleteScreen = defineTool(
  {
    name: 'DeleteScreen',
    description: 'Delete an ABAP Screen (Dynpro) from a program. Handles lock/unlock automatically.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      screen_number: z.string().describe('Screen number to delete.'),
      // 구가 받기만 하고 쓰지 않는 인자.
      transport_request: z.string().describe('Transport request number.').optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || !args.screen_number) {
      return programScopedError('Missing required parameters: program_name and screen_number');
    }

    const programName = args.program_name.toUpperCase();
    const screenNumber = args.screen_number;
    const uri = programObjectUri(programName);
    context.logger.info(`Deleting screen: ${programName}/${screenNumber}`);

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      await client.withLock(uri, async () => {
        await channel.callDispatch('DYNPRO_DELETE', {
          program: programName,
          dynpro: screenNumber,
        });
      });

      context.logger.info(`Screen deleted: ${programName}/${screenNumber}`);
      return okResult({
        success: true,
        program_name: programName,
        screen_number: screenNumber,
        message: `Screen ${programName}/${screenNumber} deleted successfully.`,
        steps_completed: ['lock', 'delete', 'unlock'],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error deleting screen: ${message}`);
      return programScopedError(`Failed to delete screen: ${message}`);
    }
  },
);
