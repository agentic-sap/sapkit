/**
 * GetScreen — 화면(dynpro) 정의를 머리 정보·필드·흐름 로직까지 읽는다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/screen/high/handleGetScreen.ts:37-102`
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:288-327` (`ZSAPKIT_ADT_DISPATCH` →
 *    `RPY_DYNPRO_READ`)
 *
 * **`ReadScreen`과 같은 요청을 보낸다.** 갈리는 것 넷은 `./dynpro.ts` 머리주석의
 * 대조표에 적었다. 이 도구는 쓰기 표면(`high`)에 살고, 응답에 `type: 'DYNP'`와
 * `steps_completed`를 더하며, 실패에 `Failed to get screen: ` 접두사를 붙인다.
 *
 * `type: 'DYNP'`가 `screen_number` **바로 뒤**에 오는 것이 구의 자리다 —
 * JSON 키 순서가 응답 바이트이므로 옮기지 않는다.
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

export const getScreen = defineTool(
  {
    name: 'GetScreen',
    description:
      'Get ABAP Screen (Dynpro) definition including metadata, fields, and flow logic source code.',
    inputSchema: {
      program_name: z.string().describe('Parent program name (e.g., SAPMV45A).'),
      screen_number: z.string().describe('Screen number (e.g., 0100).'),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || !args.screen_number) {
      return returnError(new Error('Missing required parameters: program_name and screen_number'));
    }

    const programName = args.program_name.toUpperCase();
    context.logger.info(`Getting screen: ${programName} / ${args.screen_number}`);

    try {
      const channel = await rfcChannelFor(context);
      const { result } = await dispatchDynproRead(channel, programName, args.screen_number);

      context.logger.info(`✅ GetScreen completed: ${programName}/${args.screen_number}`);

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            screen_number: args.screen_number,
            type: 'DYNP',
            flow_logic: flowLogicOf(result),
            metadata: metadataOf(result),
            containers: containersOf(result),
            fields_to_containers: fieldsToContainersOf(result),
            steps_completed: ['get_metadata', 'get_flow_logic'],
          },
          null,
          2,
        ),
      );
    } catch (error) {
      const message = messageOf(error);
      context.logger.error(`Error getting screen: ${message}`);
      return returnError(new Error(`Failed to get screen: ${message}`));
    }
  },
);
