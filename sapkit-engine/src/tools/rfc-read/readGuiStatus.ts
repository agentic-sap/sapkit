/**
 * ReadGuiStatus — 프로그램의 CUA(GUI 상태) 정의를 통째로 읽는다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/gui_status/readonly/handleReadGuiStatus.ts:33-76`
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:288-327` (`ZSAPKIT_ADT_DISPATCH` →
 *    `RS_CUA_INTERNAL_FETCH`) —
 *    `POST {service}/Dispatch?IV_ACTION='CUA_FETCH'&IV_PARAMS='{"program":"…"}'`
 *
 * **`GetGuiStatus`와 같은 요청을 보낸다.** 갈리는 것 넷:
 *
 * | | `GetGuiStatus` | `ReadGuiStatus` |
 * |---|---|---|
 * | 노출 집합 | `high` | `readonly` |
 * | 인자 | `program_name` + `status_name`(선택) | `program_name`뿐 |
 * | 응답 | `status_name`·`type: 'CUAD'`·`steps_completed`를 더하고 STA를 거른다 | 정의를 **손대지 않고** 싣는다 |
 * | 실패 문구 | `Failed to get GUI status: …` | 원문 그대로 |
 *
 * 이 도구가 **거르지 않는다**는 것이 요점이다 — `PatchGuiStatus`가 Read→merge→Write
 * 를 도는데, 거른 정의를 다시 쓰면 걸러 낸 상태가 통째로 사라진다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from '../read/internal/results';
import { rfcChannelFor } from './rfcChannel';

export const readGuiStatus = defineTool(
  {
    name: 'ReadGuiStatus',
    description:
      '[read-only] Read ABAP GUI Status definition (statuses, function codes, menus, toolbars, titles) for a program.',
    inputSchema: {
      program_name: z.string().describe('Parent program name (e.g., SAPMV45A).'),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    try {
      if (!args.program_name) {
        return returnError(new Error('program_name is required'));
      }

      const programName = args.program_name.toUpperCase();
      context.logger.info(`Reading GUI status data for program: ${programName}`);

      const channel = await rfcChannelFor(context);
      const { result } = await channel.callDispatch('CUA_FETCH', { program: programName });

      context.logger.info(`✅ ReadGuiStatus completed: ${programName}`);

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            // 손대지 않고 그대로 싣는다 — 거르는 것은 `GetGuiStatus`의 몫이다.
            definition: result,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      const message = messageOf(error);
      context.logger.error(`Error reading GUI status: ${message}`);
      return returnError(new Error(message));
    }
  },
);
