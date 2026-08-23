/**
 * CreateGuiStatus — 프로그램의 CUA에 상태 한 줄을 **더한다**.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/gui_status/high/handleCreateGuiStatus.ts:67-196`
 *  - 대리자 와이어: `engine/src/lib/odataRfc.ts:288-327` (`ZSAPKIT_ADT_DISPATCH` →
 *    `RS_CUA_INTERNAL_FETCH` / `RS_CUA_INTERNAL_WRITE`)
 *  - 활성화 와이어: `./internal/programScoped.ts` 머리주석
 *
 * ## 시퀀스 (구 그대로) — **잠그지 않는다**
 *
 *   CUA_FETCH(실패해도 계속) → 상태 행 추가 → CUA_WRITE(전량) → (활성화)
 *
 * 형제인 `UpdateGuiStatus`·`PatchGuiStatus`는 부모 프로그램을 잠그는데 이쪽은
 * 잠그지 않는다(`:94-142`에 `makeAdtRequest`가 없다). 구가 그렇게 지었고 그대로
 * 둔다.
 *
 * **CUA_FETCH 실패를 삼키는 것**(`:120-122` — "No existing CUA data - start
 * fresh")이 이 도구가 첫 상태도 만들 수 있는 이유다.
 *
 * `RS_CUA_INTERNAL_WRITE`가 CUA를 통째로 갈아엎으므로, 읽어 온 정의 위에 12개
 * 표를 모두 갖춘 뼈대를 깔고 쓴다. 뼈대의 키 순서(ADM·STA·FUN·MEN·MTX·ACT·
 * BUT·PFK·SET·DOC·TIT·BIV)가 곧 요청 바이트의 순서다.
 *
 * ## 실측한 어긋남 — **쓰는 값과 보고하는 값의 기본값이 다르다**
 *
 * `:126-129`는 상태 행에 `MODAL: args.status_type || 'D'`를 넣는데,
 * `:173`의 응답은 `status_type: args.status_type || 'N'`이라고 답한다. 발행
 * 스키마의 설명도 `Default: "N"`이다. 즉 **`status_type`을 주지 않으면 SAP에는
 * `D`가 들어가고 사용자에게는 `N`이라고 말한다.** 구의 실측이므로 그대로 옮겼고,
 * 시험이 이 어긋남을 글자로 붙잡아 둔다 — 실 시스템에서 어느 쪽이 옳은지
 * 확인되는 날 여기가 출발점이다. (SAP에 붙지 않는 이 판에서 한쪽으로 고치는
 * 것은 근거 없는 추측이 된다.)
 *
 * ## 구와 다른 것
 *  - 장부 D91 — `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 *  - 장부 D93 — 활성화 응답을 **읽는다**. 구는 버렸다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import { describeFailure, okResult } from './shared';
import { activateParentProgram, programScopedError } from './internal/programScoped';

/** 12개 CUA 표를 모두 갖춘 빈 뼈대. 키 순서가 요청 바이트의 순서다. */
function emptyCua(): Record<string, unknown> {
  return {
    ADM: {},
    STA: [],
    FUN: [],
    MEN: [],
    MTX: [],
    ACT: [],
    BUT: [],
    PFK: [],
    SET: [],
    DOC: [],
    TIT: [],
    BIV: [],
  };
}

export const createGuiStatus = defineTool(
  {
    name: 'CreateGuiStatus',
    description:
      'Create a new ABAP GUI Status on an existing program. Optionally activates after creation.',
    inputSchema: {
      program_name: z.string().describe('Parent program name (e.g., Z_MY_PROGRAM).'),
      status_name: z.string().describe('GUI Status name to create (e.g., MAIN_STATUS).'),
      description: z.string().describe('GUI Status description.').optional(),
      status_type: z
        .enum(['N', 'P', 'C'])
        .describe(
          'Status type: "N" (normal/dialog), "P" (popup), "C" (context menu). Default: "N".',
        )
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
    if (!args.program_name || !args.status_name) {
      return programScopedError('Missing required parameters: program_name and status_name');
    }

    const programName = args.program_name.toUpperCase();
    const statusName = args.status_name.toUpperCase();
    const shouldActivate = args.activate === true;

    context.logger.info(`Creating GUI status: ${programName} / ${statusName}`);

    try {
      const channel = await rfcChannelFor(context);

      let cuaData = emptyCua();
      try {
        const { result } = await channel.callDispatch('CUA_FETCH', { program: programName });
        if (result && typeof result === 'object') {
          cuaData = { ...cuaData, ...(result as Record<string, unknown>) };
        }
      } catch {
        // 아직 CUA가 없을 수 있다 — 빈 뼈대로 시작한다.
      }

      // rsmpe_stat에는 TXT 칸이 없다. 상태 설명은 TIT(rsmpe_titt)가 담는다.
      // MODAL의 기본값이 'D'인 것은 구의 실측이다 — 위 머리주석 참조.
      const statuses = Array.isArray(cuaData['STA']) ? (cuaData['STA'] as unknown[]) : [];
      statuses.push({ CODE: statusName, MODAL: args.status_type || 'D' });
      cuaData['STA'] = statuses;

      if (args.description) {
        const titles = Array.isArray(cuaData['TIT']) ? (cuaData['TIT'] as unknown[]) : [];
        titles.push({ CODE: statusName, TEXT: args.description });
        cuaData['TIT'] = titles;
      }

      await channel.callDispatch('CUA_WRITE', {
        program: programName,
        cua_data: JSON.stringify(cuaData),
      });

      context.logger.info(`GUI status created: ${programName}/${statusName}`);

      if (shouldActivate) {
        const client = await context.getConnection();
        await activateParentProgram(client, programName, 'GUI status');
        context.logger.info(`Program activated: ${programName}`);
      }

      return okResult({
        success: true,
        program_name: programName,
        status_name: statusName,
        // 쓴 값('D')이 아니라 구가 답하던 값('N')이다 — 위 머리주석 참조.
        status_type: args.status_type || 'N',
        type: 'CUAD',
        activated: shouldActivate,
        message: shouldActivate
          ? `GUI Status ${programName}/${statusName} created and activated.`
          : `GUI Status ${programName}/${statusName} created (not activated).`,
        steps_completed: ['create', ...(shouldActivate ? ['activate'] : [])],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error creating GUI status: ${message}`);
      return programScopedError(`Failed to create GUI status: ${message}`);
    }
  },
);
