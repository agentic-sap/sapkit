/**
 * RuntimeGetDumpById — 덤프 한 건을 ID로 읽는다.
 *
 * 와이어는 `internal/dump.ts`에 있고 그 근거도 거기 적었다. 이 파일이 소유하는
 * 것은 **응답의 모양**이다(`engine/src/handlers/system/readonly/handleRuntimeGetDumpById.ts:103-153`):
 *
 *  - `response_mode`가 `summary`·`both`일 때만 `summary` 키가 붙는다.
 *  - `response_mode`가 `summary`이면 `payload`를 **아예 싣지 않는다**
 *    (`JSON.stringify`가 `undefined` 키를 떨어뜨리는 것이 아니라, 구는 키를
 *    조건부로 넣는다 — 결과는 같지만 조립 방식이 그렇다).
 *  - `view`는 요청 인자이면서 동시에 응답에 되비쳐진다.
 *
 * 인자 검증 문구도 구 그대로다 — `Parameter "dump_id" is required`.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { getRuntimeDumpById } from './internal/dump';
import type { DumpView } from './internal/dump';
import { keyFactsOf } from './internal/keyFacts';
import { parseRuntimePayload } from './internal/payload';
import { okJson, returnError } from './internal/results';

export const runtimeGetDumpById = defineTool(
  {
    name: 'RuntimeGetDumpById',
    description:
      '[runtime] Read a specific ABAP runtime dump by dump ID. Returns parsed JSON payload. Use response_mode="both" or "summary" to also include a compact key-facts summary (title, exception, program, line, user, date...).',
    inputSchema: {
      dump_id: z
        .string()
        .describe('Runtime dump ID (for example: 694AB694097211F1929806D06D234D38).'),
      view: z
        .enum(['default', 'summary', 'formatted'])
        .default('default')
        .describe('Dump view mode: default payload, summary section, or formatted long text.'),
      response_mode: z
        .enum(['payload', 'summary', 'both'])
        .default('payload')
        .describe(
          'Controls what is returned: "payload" (default, legacy) — full parsed dump data only, "summary" — compact key facts only (title, exception, program, line, user, date...), "both" — summary + full payload.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.dump_id) throw new Error('Parameter "dump_id" is required');

      const view: DumpView = args.view ?? 'default';
      const responseMode = args.response_mode ?? 'payload';

      const client = await context.getConnection();
      const response = await getRuntimeDumpById(client, args.dump_id, view);
      const payload = parseRuntimePayload(response.body);

      const body: Record<string, unknown> = {
        success: true,
        dump_id: args.dump_id,
        view,
        response_mode: responseMode,
        status: response.status,
      };
      if (responseMode === 'summary' || responseMode === 'both') {
        body['summary'] = keyFactsOf(payload);
      }
      if (responseMode !== 'summary') {
        body['payload'] = payload;
      }

      return okJson(body);
    } catch (error) {
      context.logger.error(`Error reading runtime dump by ID: ${String(error)}`);
      return returnError(error);
    }
  },
);
