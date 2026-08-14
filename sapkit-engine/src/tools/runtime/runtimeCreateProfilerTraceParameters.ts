/**
 * RuntimeCreateProfilerTraceParameters — 프로파일러 트레이스 파라미터를 만든다.
 *
 * ## 정책 분류가 `mutation`인 근거 (이 묶음에서 가장 헷갈리는 자리)
 *
 * 이 도구는 ABAP을 실행하지 않는다. `POST
 * /sap/bc/adt/runtime/traces/abaptraces/parameters`로 **서버에 자원 하나를
 * 만들고** 그 URI를 `Location` 헤더로 돌려받는다(`profiler.js:131-165`). 즉
 * SAP 상태를 바꾸므로 `read`가 아니고, 코드를 돌리지 않으므로 `execution`도
 * 아니다.
 *
 * 구 엔진의 실측 판정과도 이것이 맞는다. 구 tier 가드는 읽기 접두사 목록에
 * `RuntimeAnalyze`·`RuntimeGet`·`RuntimeList` 셋만 올려 두고 **`RuntimeCreate*`가
 * 차단 갈래로 떨어지도록 일부러 비워 두었다**(`engine/src/lib/readonlyGuard.ts:35-54`
 * 의 주석 그대로). 그때 나오는 문구가 "mutates SAP objects (or is not classified
 * read-only); only DEV profiles may run it."다(`:120-122`) — 실행 계열 문구가
 * 아니라 변경 계열 문구다. 신 엔진의 tier 게이트도 `mutation`을 QA·PRD·UNKNOWN
 * 세 등급 전부에서 거부한다(`src/safety/tier.ts:120-124`).
 *
 * `targetNames`는 **빈 배열**이다. 이 도구의 인자는 설명 문자열과 추적 스위치뿐,
 * 고객 오브젝트 이름을 받는 자리가 없다. 빈 배열은 "받지 않는다"는 명시 선언이다
 * (`src/server/toolDefinition.ts:141-158`).
 *
 * ## 기본값이 거의 먹지 않는다
 *
 * 구 핸들러는 인자를 안 준 스위치까지 **키를 명시해서** 안쪽 패키지에 넘긴다
 * (`handleRuntimeCreateProfilerTraceParameters.ts:64-79`). 그 명시된 `undefined`가
 * `DEFAULT_PROFILER_TRACE_PARAMETERS`를 덮어써서, `description`만 준 호출이
 * 실제로 보내는 본문은 `<trc:description .../>` 한 줄이다. 자세한 근거는
 * `internal/traces.ts`의 `buildTraceParametersXml` 주석에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { okJson, returnError } from './internal/results';
import {
  createTraceParameters,
  extractProfilerId,
  profilerParametersFrom,
} from './internal/traces';

export const runtimeCreateProfilerTraceParameters = defineTool(
  {
    name: 'RuntimeCreateProfilerTraceParameters',
    description:
      '[runtime] Create ABAP profiler trace parameters and return profilerId (URI) for profiled execution.',
    inputSchema: {
      description: z.string().describe('Human-readable trace description.'),
      all_misc_abap_statements: z.boolean().optional(),
      all_procedural_units: z.boolean().optional(),
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
    kind: 'mutation',
    targetNames: [],
  },
  async (context, args) => {
    try {
      if (!args.description) throw new Error('Parameter "description" is required');

      const client = await context.getConnection();
      const response = await createTraceParameters(client, profilerParametersFrom(args));

      return okJson({
        success: true,
        profiler_id: extractProfilerId(response.headers),
        status: response.status,
      });
    } catch (error) {
      context.logger.error(`Error creating profiler trace parameters: ${String(error)}`);
      return returnError(error);
    }
  },
);
