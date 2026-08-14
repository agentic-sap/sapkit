/**
 * RuntimeRunClassWithProfiling — **SAP에서 ABAP 클래스를 실제로 실행한다.**
 *
 * 정책 분류가 `execution`인 근거는 `runtimeRunProgramWithProfiling.ts`의 머리주석과
 * 같다(구 `RUNTIME_EXECUTION_TOOLS` — QA 예외 없음). `targetNames`는 `class_name`.
 *
 * ## 와이어 — 프로그램판보다 두 걸음이 더 있다
 *
 * `@babamba2/mcp-abap-adt-clients/dist/executors/class/ClassExecutor.js:30-124`:
 *
 *  1. `POST …/traces/abaptraces/parameters` → `Location`에서 `profilerId`.
 *     못 꺼내면 던진다(실행하지 않는다).
 *  2. `POST /sap/bc/adt/oo/classrun/{className}?profilerId=…` ·
 *     `Accept: text/plain` · `X-sap-adt-profiling: server-time`.
 *     **클래스 이름은 인코딩하지 않는다** — 구 `runWithProfilerId`가 이름을 그대로
 *     경로에 넣는다(`:113-124`). 프로그램판의 이중 인코딩과 대칭이 아니지만 실측이
 *     그렇다.
 *  3. `GET …/traces/abaptraces/requests?uri=…`로 **트레이스 ID를 되찾는다.**
 *     후보 URI는 둘이고(`:40-44`) 평범한 대문자 `Z…` 이름에서는 **같은 값이라
 *     같은 요청이 두 번 나간다.** 첫 요청이 ID를 찾으면 두 번째는 나가지 않으므로
 *     정상 경로에서는 한 번뿐이다.
 *  4. 그래도 못 찾으면 `GET …/requests` → 그래도 없으면 `GET …/abaptraces`.
 *     세 갈래가 전부 비면 **던진다** — 실행은 이미 일어난 뒤이므로, 이 오류는
 *     "실행 실패"가 아니라 "트레이스를 못 찾았다"는 뜻이다.
 *
 * 중간 조회의 실패는 삼키고 다음 후보로 넘어간다(`:63-69, 78-98`) — 조회가 막힌
 * 것이 실행 결과를 지우지는 않기 때문이다. 그 삼킴을 로그로 남기는 것까지 구와 같다.
 */

import * as z from 'zod';

import type { AdtClient, AdtResponse } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolLogger } from '../../server/toolDefinition';
import { okJson, returnError } from './internal/results';
import {
  ACCEPT_RUN,
  PROFILING_HEADER,
  createTraceParameters,
  extractProfilerId,
  extractTraceId,
  getTraceRequestsByUri,
  listTraceFiles,
  listTraceRequests,
  profilerParametersFrom,
} from './internal/traces';

export const CLASS_RUN_PATH = '/sap/bc/adt/oo/classrun';

interface TraceLookup {
  readonly traceId: string | undefined;
  readonly traceRequestsResponse: AdtResponse | undefined;
}

/** 3·4단계 — 후보 URI를 차례로 묻고, 안 되면 목록 두 벌로 물러난다. */
async function resolveTraceId(
  client: AdtClient,
  logger: ToolLogger,
  className: string,
): Promise<TraceLookup> {
  const lookupUris = [
    `${CLASS_RUN_PATH}/${className}`,
    `${CLASS_RUN_PATH}/${encodeURIComponent(className).toUpperCase()}`,
  ];

  let traceRequestsResponse: AdtResponse | undefined;
  for (const uri of lookupUris) {
    if (!uri) continue;
    try {
      const current = await getTraceRequestsByUri(client, uri);
      const traceId = extractTraceId(current);
      if (traceId) return { traceId, traceRequestsResponse: current };
      traceRequestsResponse = current;
    } catch (error) {
      logger.debug(
        `Trace lookup by URI failed, trying next URI (class=${className} uri=${uri}): ${String(error)}`,
      );
    }
  }

  let fallbackResponse: AdtResponse | undefined;
  let fallbackTraceId: string | undefined;
  try {
    fallbackResponse = await listTraceRequests(client);
    fallbackTraceId = extractTraceId(fallbackResponse);
  } catch (error) {
    logger.debug(
      `Trace requests list failed, trying trace files (class=${className}): ${String(error)}`,
    );
  }

  if (!fallbackTraceId) {
    try {
      const files = await listTraceFiles(client);
      fallbackTraceId = extractTraceId(files);
      if (fallbackTraceId) fallbackResponse = files;
    } catch (error) {
      logger.debug(`Trace files list also failed (class=${className}): ${String(error)}`);
    }
  }

  return {
    traceId: fallbackTraceId,
    traceRequestsResponse: traceRequestsResponse ?? fallbackResponse,
  };
}

export const runtimeRunClassWithProfiling = defineTool(
  {
    name: 'RuntimeRunClassWithProfiling',
    description:
      '[runtime] Execute ABAP class with profiler enabled and return created profilerId + traceId.',
    inputSchema: {
      class_name: z.string().describe('ABAP class name to execute.'),
      description: z.string().describe('Profiler trace description.').optional(),
      all_procedural_units: z.boolean().optional(),
      all_misc_abap_statements: z.boolean().optional(),
      all_internal_table_events: z.boolean().optional(),
      all_dynpro_events: z.boolean().optional(),
      aggregate: z.boolean().optional(),
      explicit_on_off: z.boolean().optional(),
      with_rfc_tracing: z.boolean().optional(),
      all_system_kernel_events: z.boolean().optional(),
      sql_trace: z.boolean().optional(),
      all_db_events: z.boolean().optional(),
      max_size_for_trace_file: z.number().optional(),
      amdp_trace: z.boolean().optional(),
      max_time_for_tracing: z.number().optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'execution',
    targetNames: ['class_name'],
  },
  async (context, args) => {
    try {
      if (!args.class_name) throw new Error('Parameter "class_name" is required');

      const className = args.class_name.trim().toUpperCase();
      const client = await context.getConnection();

      const parameters = await createTraceParameters(client, profilerParametersFrom(args));
      const profilerId = extractProfilerId(parameters.headers);
      if (!profilerId) {
        throw new Error('Failed to extract profilerId from trace parameters response');
      }

      const run = await client.request({
        method: 'POST',
        path: `${CLASS_RUN_PATH}/${className}`,
        params: { profilerId },
        accept: ACCEPT_RUN,
        headers: PROFILING_HEADER,
        timeout: 'default',
      });

      const lookup = await resolveTraceId(client, context.logger, className);
      if (!lookup.traceId) {
        context.logger.warn(
          `Fallback trace response did not contain trace id (class=${className})`,
        );
        throw new Error(
          `Failed to resolve traceId after profiled execution for class ${className}`,
        );
      }

      return okJson({
        success: true,
        class_name: className,
        profiler_id: profilerId,
        trace_id: lookup.traceId,
        run_status: run.status,
        trace_requests_status: lookup.traceRequestsResponse?.status,
      });
    } catch (error) {
      context.logger.error(`Error running class with profiling: ${String(error)}`);
      return returnError(error);
    }
  },
);
