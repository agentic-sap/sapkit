/**
 * RuntimeAnalyzeDump — 덤프 한 건을 읽고 **요약을 항상 붙여** 돌려준다.
 *
 * `RuntimeGetDumpById`와 같은 요청을 보내고(`internal/dump.ts`) 응답 모양만
 * 다르다(`engine/src/handlers/system/readonly/handleRuntimeAnalyzeDump.ts:100-142`):
 * 요약이 조건부가 아니라 언제나 실리고, `payload`는
 * **`include_payload === false`일 때만** 빠진다. 구가 `undefined`를 넣어
 * `JSON.stringify`가 그 키를 떨어뜨리게 한 자리이며, 결과 문자열이 계약이므로
 * 여기서도 키를 넣지 않는 것으로 같은 결과를 만든다.
 *
 * ## 발행 선언에서 조심할 자리 — `include_payload`의 `default`
 *
 * 구 핸들러의 JSON Schema에는 `default: true`가 적혀 있지만
 * (`handleRuntimeAnalyzeDump.ts:25-29`), **구 번들이 실제로 발행한 선언에는
 * 그 `default`가 없다**(`harness/old-surface/m1-tools.json`). 구 서버가
 * JSON Schema를 zod로 되돌릴 때 불리언을 `z.preprocess(...)` 파이프로 감쌌고
 * (`engine/src/lib/handlers/utils/schemaUtils.ts:14-22, 84`), 그 파이프에 얹힌
 * `default`가 발행 스키마까지 살아 나오지 않았기 때문이다. 판정 기준은 **발행된
 * 선언**이므로 여기서도 `default`를 달지 않는다. 동작상으로도 같다 —
 * `include_payload`를 안 주면 `=== false`가 거짓이라 payload가 실린다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { getRuntimeDumpById } from './internal/dump';
import type { DumpView } from './internal/dump';
import { keyFactsOf } from './internal/keyFacts';
import { parseRuntimePayload } from './internal/payload';
import { okJson, returnError } from './internal/results';

export const runtimeAnalyzeDump = defineTool(
  {
    name: 'RuntimeAnalyzeDump',
    description:
      '[runtime] Read runtime dump by ID and return compact analysis summary with key fields.',
    inputSchema: {
      dump_id: z.string().describe('Runtime dump ID.'),
      view: z
        .enum(['default', 'summary', 'formatted'])
        .default('default')
        .describe(
          'Dump view mode to analyze: default payload, summary section, or formatted long text.',
        ),
      include_payload: z
        .boolean()
        .describe('Include full parsed payload in response.')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.dump_id) throw new Error('Parameter "dump_id" is required');

      const view: DumpView = args.view ?? 'default';

      const client = await context.getConnection();
      const response = await getRuntimeDumpById(client, args.dump_id, view);
      const payload = parseRuntimePayload(response.body);

      const body: Record<string, unknown> = {
        success: true,
        dump_id: args.dump_id,
        view,
        status: response.status,
        summary: keyFactsOf(payload),
      };
      // 구는 `payload: args.include_payload === false ? undefined : parsedPayload`다.
      if (args.include_payload !== false) body['payload'] = payload;

      return okJson(body);
    } catch (error) {
      context.logger.error(`Error analyzing runtime dump: ${String(error)}`);
      return returnError(error);
    }
  },
);
