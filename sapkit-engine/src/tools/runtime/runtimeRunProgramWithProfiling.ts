/**
 * RuntimeRunProgramWithProfiling — **SAP에서 ABAP 프로그램을 실제로 실행한다.**
 *
 * ## 정책 분류 `execution`의 근거
 *
 * 구 tier 가드는 이 이름을 `RUNTIME_EXECUTION_TOOLS`에 넣고 **QA·PRD 양쪽에서
 * 거부**한다(`engine/src/lib/readonlyGuard.ts:86-93, 114-116`) — 단위시험 실행과
 * 달리 QA 예외가 없다. 신 엔진의 tier 게이트도 `execution`을 그렇게 다루고,
 * QA 예외는 `UNIT_TEST_EXECUTION_TOOLS` 세 이름에만 준다
 * (`src/safety/tier.ts:57-61, 113-118`). 그래서 `kind: 'execution'`이 구 판정과
 * 같은 자리다. `targetNames`는 실행 대상인 `program_name`이다 — 녹화 사전 검사가
 * 이 선언을 읽어 **SAP 호출이 나가기 전에** 비고객 오브젝트를 막는다.
 *
 * ## 와이어 (두 발이다)
 *
 * `@babamba2/mcp-abap-adt-clients/dist/executors/program/ProgramExecutor.js:28-55`:
 *
 *  1. `POST /sap/bc/adt/runtime/traces/abaptraces/parameters` — 트레이스 파라미터.
 *     응답 `Location`에서 `profilerId`를 꺼내고, **못 꺼내면 던진다**(실행하지
 *     않는다).
 *  2. `POST /sap/bc/adt/programs/programrun/{name}?profilerId=…` ·
 *     `Accept: text/plain` · `X-sap-adt-profiling: server-time`.
 *
 * 프로그램 실행은 **fire-and-forget**이라 `trace_id`를 돌려주지 않는다 — 구 주석이
 * 그렇게 적어 두었고(`ProgramExecutor.js:39-41`), 응답 표에도 그 키가 없다.
 * 트레이스는 `RuntimeListProfilerTraceFiles`로 뒤에 찾는다.
 *
 * ## 구의 이중 인코딩을 그대로 옮겼다 (일부러다)
 *
 * `runWithProfiling`이 `encodeSapObjectName(name).toUpperCase()`로 한 번 인코딩한
 * 값을 `runWithProfilerId`에 넘기고, 그 함수가 **또 한 번** 인코딩한다
 * (`ProgramExecutor.js:32, 44`). 평범한 `Z…` 이름에는 아무 효과가 없고,
 * 네임스페이스 이름(`/ABC/PROG`)에서만 `%2F`가 `%252F`가 된다. 고치면 구와 다른
 * 주소로 나가는 것이고, 어느 쪽이 옳은지는 **오프라인으로 확정할 수 없다**
 * — 그래서 실측한 주소를 그대로 보낸다. 시험이 이 자리를 못 박아 둔다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { okJson, returnError } from './internal/results';
import {
  ACCEPT_RUN,
  PROFILING_HEADER,
  createTraceParameters,
  extractProfilerId,
  profilerParametersFrom,
} from './internal/traces';

export const PROGRAM_RUN_PATH = '/sap/bc/adt/programs/programrun';

export const runtimeRunProgramWithProfiling = defineTool(
  {
    name: 'RuntimeRunProgramWithProfiling',
    description:
      '[runtime] Execute ABAP program with profiler enabled and return created profilerId + traceId.',
    inputSchema: {
      program_name: z.string().describe('ABAP program name to execute.'),
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
    available_in: ['onprem'],
    sets: ['readonly'],
    kind: 'execution',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    try {
      if (!args.program_name) throw new Error('Parameter "program_name" is required');

      const programName = args.program_name.trim().toUpperCase();
      const client = await context.getConnection();

      const parameters = await createTraceParameters(client, profilerParametersFrom(args));
      const profilerId = extractProfilerId(parameters.headers);
      if (!profilerId) {
        throw new Error('Failed to extract profilerId from trace parameters response');
      }

      // 구의 이중 인코딩 — 머리주석 참조.
      const pathName = encodeURIComponent(
        encodeURIComponent(programName).toUpperCase(),
      ).toUpperCase();

      const run = await client.request({
        method: 'POST',
        path: `${PROGRAM_RUN_PATH}/${pathName}`,
        params: { profilerId },
        accept: ACCEPT_RUN,
        headers: PROFILING_HEADER,
        timeout: 'default',
      });

      return okJson({
        success: true,
        program_name: programName,
        profiler_id: profilerId,
        run_status: run.status,
      });
    } catch (error) {
      context.logger.error(`Error running program with profiling: ${String(error)}`);
      return returnError(error);
    }
  },
);
