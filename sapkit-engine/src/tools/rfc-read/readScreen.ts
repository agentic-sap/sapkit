/**
 * ReadScreen — 화면(dynpro)의 흐름 로직·필드·머리 정보를 읽는다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/screen/readonly/handleReadScreen.ts:37-97`
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:288-327` (`ZMCP_ADT_DISPATCH` →
 *    `RPY_DYNPRO_READ`)
 *
 * **`GetScreen`과 같은 요청을 보낸다.** 갈리는 것은 응답 조립과 실패 문구뿐이며,
 * 그 대조표는 `./dynpro.ts` 머리주석에 있다. 이 도구는 읽기 표면(`readonly`)에
 * 살고 응답에 여분 필드가 없으며, 실패 문구에 접두사를 붙이지 않는다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from '../read/internal/results';
import {
  containersOf,
  dispatchDynproRead,
  fieldsToContainersOf,
  flowLogicOf,
  metadataOf,
} from './dynpro';
import { rfcChannelFor } from './rfcChannel';

export const readScreen = defineTool(
  {
    name: 'ReadScreen',
    description: '[read-only] Read ABAP Screen (Dynpro) flow logic source code, fields, and metadata.',
    inputSchema: {
      program_name: z.string().describe('Parent program name (e.g., SAPMV45A).'),
      screen_number: z.string().describe('Screen number (e.g., 0100).'),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    try {
      if (!args.program_name || !args.screen_number) {
        return returnError(new Error('program_name and screen_number are required'));
      }

      // 프로그램 이름만 대문자로 올린다 — 화면 번호는 받은 그대로 나간다.
      const programName = args.program_name.toUpperCase();
      context.logger.info(`Reading screen: ${programName} / ${args.screen_number}`);

      const channel = await rfcChannelFor(context);
      const { result } = await dispatchDynproRead(channel, programName, args.screen_number);

      context.logger.info(`✅ ReadScreen completed: ${programName}/${args.screen_number}`);

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            screen_number: args.screen_number,
            flow_logic: flowLogicOf(result),
            metadata: metadataOf(result),
            containers: containersOf(result),
            fields_to_containers: fieldsToContainersOf(result),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      const message = messageOf(error);
      context.logger.error(`Error reading screen: ${message}`);
      // 접두사를 붙이지 않는다 — `GetScreen`과 갈리는 자리다.
      return returnError(new Error(message));
    }
  },
);
