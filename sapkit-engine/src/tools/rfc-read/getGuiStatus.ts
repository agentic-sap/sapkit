/**
 * GetGuiStatus — CUA(GUI 상태) 정의를 읽고, 원하면 상태 하나로 좁힌다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/gui_status/high/handleGetGuiStatus.ts:39-103`
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:288-327` (`ZMCP_ADT_DISPATCH` →
 *    `RS_CUA_INTERNAL_FETCH`)
 *
 * **`ReadGuiStatus`와 같은 요청을 보낸다.** 갈리는 것 넷의 대조표는
 * `./readGuiStatus.ts` 머리주석에 있다.
 *
 * ## `status_name` 걸러 내기의 실측 (`:67-76`)
 *
 *  - 거르는 것은 **`STA` 배열 하나뿐**이다. `FUN`·`PFK`·`BUT`·`TIT`는 그대로
 *    남으므로, 좁힌 결과라도 다른 상태의 기능코드·F키가 함께 실린다. 구가 그렇게
 *    지었고 그대로 둔다.
 *  - `result.STA ?? result.sta`로 두 갈래를 읽지만, 되싣는 키는 **언제나 대문자
 *    `STA`**다(`{ ...result, STA: filteredSta }`). 소문자로 온 정의를 좁히면
 *    `sta`(원본)와 `STA`(걸러진 것)가 **둘 다** 실린다 — 구의 동작이므로 그대로다.
 *  - `STA`가 배열이 아니면 아무것도 거르지 않는다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from '../read/internal/results';
import { rfcChannelFor } from './rfcChannel';

export const getGuiStatus = defineTool(
  {
    name: 'GetGuiStatus',
    description:
      'Get ABAP GUI Status definition including statuses, function codes, menus, toolbars, and titles.',
    inputSchema: {
      program_name: z.string().describe('Parent program name (e.g., SAPMV45A).'),
      status_name: z
        .string()
        .describe('Optional: filter to a specific GUI Status name. If omitted, returns all statuses.')
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name) {
      return returnError(new Error('Missing required parameter: program_name'));
    }

    const programName = args.program_name.toUpperCase();
    const statusName = args.status_name?.toUpperCase();

    context.logger.info(
      `Getting GUI status: ${programName}${statusName ? ` / ${statusName}` : ''}`,
    );

    try {
      const channel = await rfcChannelFor(context);
      const { result } = await channel.callDispatch('CUA_FETCH', { program: programName });

      let filtered: unknown = result;
      const record = (result ?? {}) as Record<string, unknown>;
      const statuses = record['STA'] ?? record['sta'];
      if (statusName && Array.isArray(statuses)) {
        // 되싣는 키는 언제나 대문자 `STA`다 — 위 머리주석 참조.
        filtered = {
          ...record,
          STA: statuses.filter((row) => {
            const entry = (row ?? {}) as Record<string, unknown>;
            return entry['CODE'] === statusName || entry['code'] === statusName;
          }),
        };
      }

      context.logger.info(`✅ GetGuiStatus completed: ${programName}`);

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            status_name: statusName || null,
            type: 'CUAD',
            definition: filtered,
            steps_completed: ['get_definition'],
          },
          null,
          2,
        ),
      );
    } catch (error) {
      const message = messageOf(error);
      context.logger.error(`Error getting GUI status: ${message}`);
      return returnError(new Error(`Failed to get GUI status: ${message}`));
    }
  },
);
