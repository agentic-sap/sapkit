/**
 * CreateScreen — 프로그램에 화면(dynpro) 하나를 만든다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/screen/high/handleCreateScreen.ts:64-182`
 *  - 대리자 와이어: `engine/src/lib/odataRfc.ts:288-327` (`ZSAPKIT_ADT_DISPATCH` →
 *    `RPY_DYNPRO_INSERT`)
 *  - 사후 구문검사: `engine/src/lib/preCheckBeforeActivation.ts:375-387` →
 *    `:649-671` → `:503-533`
 *
 * ## 시퀀스 (구 그대로) — **잠그지 않는다**
 *
 *   DYNPRO_INSERT → 부모 프로그램 트리 구문검사 → (활성화)
 *
 * 형제인 `UpdateScreen`은 잠그는데 이쪽은 잠그지 않는다. 구가 그렇게 지었고
 * (`:110-114`에 `makeAdtRequest`가 없다) 그대로 둔다.
 *
 * ## 화면에는 독립 구문검사가 없다
 *
 * 그래서 **부모 프로그램 트리 전체**를 `version="inactive"`로 컴파일해 흐름
 * 로직의 오류를 드러낸다(`preCheckBeforeActivation.ts:375-386`). 그 검사 URI만
 * 프로그램 이름을 **소문자**로 쓴다 — 활성화 URI는 대문자다. 한 도구 안에서
 * 갈리는 이 두 갈래는 `./internal/programScoped.ts` 머리주석에 적었다.
 *
 * ## `dynpro_data`를 주지 않으면 최소 화면을 짓는다
 *
 * 구가 손으로 적어 두던 뼈대 그대로다(`:89-108`) — 20줄 × 83칸, 타입 `N`,
 * PBO/PAI 두 이벤트에 **주석 처리된** 모듈 호출이 하나씩.
 *
 * ## 구와 다른 것
 *  - 장부 D91 — `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
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
  programScopedError,
  runProgramTreeCheck,
} from './internal/programScoped';

/** 구가 손으로 적어 두던 최소 화면 뼈대(`handleCreateScreen.ts:89-108`). */
function minimalScreen(
  programName: string,
  screenNumber: string,
  description: string | undefined,
): string {
  return JSON.stringify({
    HEADER: {
      PROGRAM: programName,
      SCREEN: screenNumber,
      LANGUAGE: 'E',
      DESCRIPT: description || `Screen ${screenNumber}`,
      TYPE: 'N',
      LINES: 20,
      COLUMNS: 83,
    },
    CONTAINERS: [],
    FIELDS_TO_CONTAINERS: [],
    FLOW_LOGIC: [
      { LINE: 'PROCESS BEFORE OUTPUT.' },
      { LINE: `* MODULE STATUS_${screenNumber}.` },
      { LINE: '' },
      { LINE: 'PROCESS AFTER INPUT.' },
      { LINE: `* MODULE USER_COMMAND_${screenNumber}.` },
    ],
  });
}

export const createScreen = defineTool(
  {
    name: 'CreateScreen',
    description: 'Create a new ABAP Screen (Dynpro) on an existing program. Optionally activates.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      screen_number: z.string().describe('Screen number to create (e.g., 0100).'),
      description: z.string().describe('Screen description.').optional(),
      dynpro_data: z
        .string()
        .describe('Full screen definition as JSON. If omitted, creates minimal screen.')
        .optional(),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate: z.boolean().describe('Activate after creation. Default: false.').optional(),
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
    const shouldActivate = args.activate === true;

    context.logger.info(`Creating screen: ${programName} / ${screenNumber}`);

    try {
      const screenData = args.dynpro_data
        ? normalizeDynproData(args.dynpro_data, programName, screenNumber)
        : minimalScreen(programName, screenNumber, args.description);

      const channel = await rfcChannelFor(context);
      await channel.callDispatch('DYNPRO_INSERT', {
        program: programName,
        dynpro: screenNumber,
        dynpro_data: screenData,
      });

      context.logger.info(`Screen created: ${programName}/${screenNumber}`);

      const client = await context.getConnection();
      const check = await runProgramTreeCheck(client, programName);
      assertNoCheckErrors(check, 'Screen', `${programName}/${screenNumber}`);

      if (shouldActivate) {
        await activateParentProgram(client, programName, 'screen');
      }

      return okResult({
        success: true,
        program_name: programName,
        screen_number: screenNumber,
        type: 'DYNP',
        activated: shouldActivate,
        message: shouldActivate
          ? `Screen ${programName}/${screenNumber} created and activated.`
          : `Screen ${programName}/${screenNumber} created (not activated).`,
        steps_completed: ['create', ...(shouldActivate ? ['activate'] : [])],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error creating screen: ${message}`);
      // 구문검사 실패는 줄번호까지 담은 진단이라 접두사 없이 그대로 올린다
      // (구 `:174-177`의 `isPreCheckFailure` 갈래).
      if (error instanceof SourceCheckFailure) return programScopedError(message);
      return programScopedError(`Failed to create screen: ${message}`);
    }
  },
);
