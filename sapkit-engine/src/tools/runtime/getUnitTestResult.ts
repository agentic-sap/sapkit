/**
 * GetUnitTestResult — 끝난 ABAP Unit 실행의 **결과만** 되읽는다.
 *
 * 형제 셋 중 혼자만 `format` 인자를 갖고, `junit`을 **명시적으로 거절**한다. 고전
 * ADT 엔드포인트에는 검증된 JUnit 변환 경로가 없어서, 조용히 abapunit 형식을
 * 돌려주면 호출자가 "JUnit을 받았다"고 믿는다
 * (`engine/src/handlers/unit_test/high/handleGetUnitTestResult.ts:1-10, 69-75`).
 *
 * 검사 순서가 계약이다 — `run_id` 없음 → `junit` 거절 → 캐시 조회(`:64-86`).
 * 그래서 모르는 `run_id`에 `format: "junit"`을 주면 **junit 문구가** 나온다.
 *
 * `with_navigation_uris`는 받기만 한다. 구 핸들러도 `run_id`·`format`만
 * 구조분해하고(`:63`), 고전 실행 전문이 `withNavigationUri enabled="true"`로
 * 고정이라 되읽기 쪽에서 켜고 끌 것이 없다. 채록본에 이 인자의 `default: false`가
 * 없는 사연은 `getUnitTestStatus.ts` 머리주석과 같다.
 *
 * SAP에 요청을 보내지 않는 것과 `getConnection()`을 부르는 이유는 `getUnitTest.ts`
 * 머리주석과 같다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { getUnitTestRun, unknownRunMessage } from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

const JUNIT_REFUSAL =
  'format "junit" is not available for the classic ADT ABAP Unit endpoint ' +
  '(no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.';

export const getUnitTestResult = defineTool(
  {
    name: 'GetUnitTestResult',
    description: 'Retrieve ABAP Unit test run result for a run_id.',
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
      if (args.format === 'junit') return returnError(new Error(JUNIT_REFUSAL));

      context.logger.info(`Reading unit test result for run_id: ${runId}`);

      const client = await context.getConnection();
      const resultXml = getUnitTestRun(client, runId);
      if (resultXml === undefined) return returnError(new Error(unknownRunMessage(runId)));

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
