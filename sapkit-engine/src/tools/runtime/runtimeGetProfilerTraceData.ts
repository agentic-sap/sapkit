/**
 * RuntimeGetProfilerTraceData — 프로파일러 트레이스의 세 가지 뷰를 읽는다.
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts:53-108`)
 * 는 `view` 값으로 세 함수 중 하나를 고르고, 각각의 와이어는
 * `@babamba2/mcp-abap-adt-clients/dist/runtime/traces/profiler.js:201-277`에 있다.
 * 복원은 `internal/traces.ts`가 소유한다 — 경로·질의 인자 순서·`Accept`까지.
 *
 * 여기서 챙기는 갈래는 둘이다:
 *  - `statements` 뷰**에만** `id`·`with_details`·`auto_drill_down_threshold`가
 *    실린다. 다른 두 뷰는 `with_system_events`만 넘긴다 — 구가 그렇게 갈랐다.
 *  - `view`는 **필수 인자**다(구 선언의 `required`에 들어 있다). 그래서 값이
 *    없을 때의 폴백을 짓지 않는다 — hitlist도 statements도 아닌 값은 구와 같이
 *    dbAccesses로 떨어진다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { parseRuntimePayload } from './internal/payload';
import { okJson, returnError } from './internal/results';
import { getTraceDbAccesses, getTraceHitList, getTraceStatements } from './internal/traces';

export const runtimeGetProfilerTraceData = defineTool(
  {
    name: 'RuntimeGetProfilerTraceData',
    description:
      '[runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload.',
    inputSchema: {
      trace_id_or_uri: z.string().describe('Profiler trace ID or full ADT trace URI.'),
      view: z.enum(['hitlist', 'statements', 'db_accesses']).describe('Trace view to retrieve.'),
      with_system_events: z.boolean().describe('Include system events.').optional(),
      id: z.number().describe('Statement node ID (for statements view).').optional(),
      with_details: z
        .boolean()
        .describe('Include statement details (for statements view).')
        .optional(),
      auto_drill_down_threshold: z
        .number()
        .describe('Auto drill-down threshold (for statements view).')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.trace_id_or_uri) throw new Error('Parameter "trace_id_or_uri" is required');

      const client = await context.getConnection();
      const response =
        args.view === 'hitlist'
          ? await getTraceHitList(client, args.trace_id_or_uri, {
              withSystemEvents: args.with_system_events,
            })
          : args.view === 'statements'
            ? await getTraceStatements(client, args.trace_id_or_uri, {
                id: args.id,
                withDetails: args.with_details,
                autoDrillDownThreshold: args.auto_drill_down_threshold,
                withSystemEvents: args.with_system_events,
              })
            : await getTraceDbAccesses(client, args.trace_id_or_uri, {
                withSystemEvents: args.with_system_events,
              });

      return okJson({
        success: true,
        view: args.view,
        trace_id_or_uri: args.trace_id_or_uri,
        status: response.status,
        payload: parseRuntimePayload(response.body),
      });
    } catch (error) {
      context.logger.error(`Error reading profiler trace data: ${String(error)}`);
      return returnError(error);
    }
  },
);
