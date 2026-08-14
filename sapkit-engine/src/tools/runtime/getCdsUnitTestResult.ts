/**
 * GetCdsUnitTestResult — 끝난 CDS 단위시험 실행의 **결과만** 되읽는다.
 *
 * `GetCdsUnitTest`와 같은 캐시를 읽고 SAP에 요청을 보내지 않는다 — 사연의 정본은
 * `internal/cdsUnitTest.ts` 머리주석과 구
 * `engine/src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts:1-9`다.
 * 벤더의 되읽기 경로 `/sap/bc/adt/abapunit/results/{id}`는 ABAP Cloud 전용
 * 컬렉션이라 온프렘에서 404다.
 *
 * ## 형제 셋 중 혼자만 `format`을 갖고, `junit`을 **명시적으로 거절**한다
 *
 * 고전 ADT 엔드포인트에는 검증된 JUnit 변환 경로가 없다. 조용히 abapunit을
 * 돌려주면 호출자가 "JUnit을 받았다"고 믿는다(`:68-74`).
 *
 * **검사 순서가 계약이다** — `run_id` 없음 → `junit` 거절 → 캐시 조회(`:62-85`).
 * 그래서 모르는 `run_id`에 `format: "junit"`을 주면 **junit 문구가** 나온다.
 * 비CDS 형제 `GetUnitTestResult`도 같은 순서이며, 거절 문구도 글자까지 같다.
 * 갈리는 것은 **모르는 run_id의 문구**뿐이다.
 *
 * `with_navigation_uris`는 받기만 한다. 구 핸들러도 `run_id`·`format`만
 * 구조분해하고(`:62`), 고전 실행 전문이 `withNavigationUri enabled="true"`로
 * 고정이라 되읽기 쪽에서 켜고 끌 것이 없다. 구 소스 선언의 `default: false`가
 * 발행 표면에 없는 것도 채록본 실측이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { unknownCdsRunMessage } from './internal/cdsUnitTest';
import { getUnitTestRun } from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

/**
 * 구 `handleGetCdsUnitTestResult.ts:69-73`의 문장 그대로. 비CDS 형제
 * (`getUnitTestResult.ts`)와 **같은 문장**이며, 시험이 그 동일성을 못 박는다.
 */
export const CDS_JUNIT_REFUSAL =
  'format "junit" is not available for the classic ADT ABAP Unit endpoint ' +
  '(no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.';

export const getCdsUnitTestResult = defineTool(
  {
    name: 'GetCdsUnitTestResult',
    description: 'Retrieve CDS unit test run result for a run_id.',
    inputSchema: {
      run_id: z.string().describe('Run identifier returned by unit test run.'),
      with_navigation_uris: z
        .boolean()
        .describe('Include navigation URIs in result if supported.')
        .optional(),
      format: z
        .enum(['abapunit', 'junit'])
        .describe('Result format: abapunit or junit.')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const runId = args.run_id;
      if (!runId) return returnError(new Error('run_id is required'));
      if (args.format === 'junit') return returnError(new Error(CDS_JUNIT_REFUSAL));

      context.logger.info(`Reading CDS unit test result for run_id: ${runId}`);

      const client = await context.getConnection();
      const resultXml = getUnitTestRun(client, runId);
      if (resultXml === undefined) return returnError(new Error(unknownCdsRunMessage(runId)));

      return okJson({
        success: true,
        run_id: runId,
        run_result: resultXml,
      });
    } catch (error) {
      return returnError(error);
    }
  },
);
