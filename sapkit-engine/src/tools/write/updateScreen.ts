/**
 * UpdateScreen — 화면(dynpro)을 **지웠다 다시 넣는** 방식으로 갈아 끼운다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/screen/high/handleUpdateScreen.ts:66-228`
 *  - 대리자 와이어: `engine/src/lib/odataRfc.ts:288-327` (`RPY_DYNPRO_DELETE` ·
 *    `RPY_DYNPRO_INSERT`)
 *  - 구문검사: `engine/src/lib/preCheckBeforeActivation.ts:375-387` → `:649-671`
 *
 * ## 시퀀스 (구 그대로)
 *
 *   LOCK(부모 프로그램) → DYNPRO_DELETE → DYNPRO_INSERT → 구문검사 → UNLOCK →
 *   (활성화)
 *
 *  - **삭제 실패는 삼킨다** — 화면이 아직 없을 수 있다(`:114-121`). 그래서 이
 *    도구는 "고치기"인 동시에 "없으면 만들기"로 동작한다.
 *  - 구문검사가 **잠금 안에서** 돈다(`:135-147`의 주석 — 해제·활성화 경로가 같은
 *    비활성 버전을 보게 하려는 것). 순서를 바꾸지 않았다.
 *
 * ## 구와 다른 것
 *  - 장부 D91 — `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 *  - **장부 D92** — 구는 잠금 핸들을 못 얻어도 **그대로 진행해** 화면을 지웠다
 *    다시 넣는다(`:109-121`은 `lockHandle`이 `undefined`여도 계속 간다). 여기서는
 *    `client.withLock()`이 그 자리에서 던지므로 삭제·삽입이 나가지 않는다.
 *    같은 묶음의 형제 핸들러(`handleUpdateGuiStatus.ts:160-164`)는 구에서도
 *    던지므로, 안전한 쪽이 구의 의도이기도 하다.
 *  - 장부 D93 — 활성화 응답을 **읽는다**. 구는 버렸다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import { SourceCheckFailure, describeFailure, okResult } from './shared';
import { normalizeDynproData } from './internal/dynproData';
import {
  activateParentProgram,
  assertNoCheckErrors,
  programObjectUri,
  programScopedError,
  runProgramTreeCheck,
} from './internal/programScoped';

export const updateScreen = defineTool(
  {
    name: 'UpdateScreen',
    description:
      'Update an ABAP Screen (Dynpro) definition. Provide full screen data as JSON. Handles lock/unlock automatically.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      screen_number: z.string().describe('Screen number (e.g., 0100).'),
      dynpro_data: z
        .string()
        .describe('Complete screen definition as JSON (from GetScreen/ReadScreen).'),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate: z.boolean().describe('Activate after update. Default: false.').optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || !args.screen_number || !args.dynpro_data) {
      return programScopedError(
        'Missing required parameters: program_name, screen_number, and dynpro_data',
      );
    }

    const programName = args.program_name.toUpperCase();
    const screenNumber = args.screen_number;
    const uri = programObjectUri(programName);
    const shouldActivate = args.activate === true;

    context.logger.info(`Updating screen: ${programName}/${screenNumber}`);

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      await client.withLock(uri, async () => {
        try {
          await channel.callDispatch('DYNPRO_DELETE', {
            program: programName,
            dynpro: screenNumber,
          });
        } catch {
          // 화면이 아직 없을 수 있다 — 구가 그대로 삼킨다.
        }

        await channel.callDispatch('DYNPRO_INSERT', {
          program: programName,
          dynpro: screenNumber,
          dynpro_data: normalizeDynproData(args.dynpro_data, programName, screenNumber),
        });

        // 잠금 안에서 검사한다 — 해제·활성화가 같은 비활성 버전을 보게 하려는 것.
        const check = await runProgramTreeCheck(client, programName);
        assertNoCheckErrors(check, 'Screen', `${programName}/${screenNumber}`);
      });

      if (shouldActivate) {
        await activateParentProgram(client, programName, 'screen');
      }

      context.logger.info(`✅ Screen updated: ${programName}/${screenNumber}`);

      return okResult({
        success: true,
        program_name: programName,
        screen_number: screenNumber,
        type: 'DYNP',
        activated: shouldActivate,
        message: shouldActivate
          ? `Screen ${programName}/${screenNumber} updated and activated.`
          : `Screen ${programName}/${screenNumber} updated (not activated).`,
        steps_completed: ['lock', 'update', 'unlock', ...(shouldActivate ? ['activate'] : [])],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error updating screen: ${message}`);
      if (error instanceof SourceCheckFailure) return programScopedError(message);
      return programScopedError(`Failed to update screen: ${message}`);
    }
  },
);
