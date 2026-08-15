/**
 * GetCdsUnitTestStatus — 끝난 CDS 단위시험 실행의 **상태만** 되읽는다.
 *
 * `GetCdsUnitTest`와 같은 캐시를 읽고 SAP에 요청을 보내지 않는다 — 사연의 정본은
 * `internal/cdsUnitTest.ts` 머리주석과 구
 * `engine/src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts:1-9`다.
 * 벤더의 상태 조회 경로 `/sap/bc/adt/abapunit/runs/{id}`는 ABAP Cloud 전용
 * 컬렉션이라 온프렘에서 404다.
 *
 * ## `status`는 언제나 `completed`다 — 그리고 그것이 사실이다
 *
 * 고전 엔드포인트는 **동기**라 `RunUnitTest`의 POST 응답에 결과가 통째로 실려
 * 온다(`internal/unitTestRuns.ts` 머리주석). 캐시에 들어간 `run_id`는 이미 끝난
 * 실행뿐이므로 "진행 중" 상태가 존재할 수 없다. 구도 같은 자리에서 상수를
 * 실었다(`:73-83`).
 *
 * `with_long_polling`은 **받기만 한다.** 구 핸들러도 `run_id`만 구조분해하고
 * (`:56`), 폴링할 서버측 실행이 애초에 없다. 구 소스 선언의 `default: true`가
 * 발행 표면에 없는 것도 채록본 실측이다 — 형제 `GetUnitTestStatus`와 같은 사연이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { unknownCdsRunMessage } from './internal/cdsUnitTest';
import { getUnitTestRun } from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

export const getCdsUnitTestStatus = defineTool(
  {
    name: 'GetCdsUnitTestStatus',
    description: 'Retrieve CDS unit test run status for a run_id.',
    inputSchema: {
      run_id: z.string().describe('Run identifier returned by unit test run.'),
      with_long_polling: z
        .boolean()
        .describe('Enable long polling while waiting for status.')
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

      context.logger.info(`Reading CDS unit test status for run_id: ${runId}`);

      const client = await context.getConnection();
      const resultXml = getUnitTestRun(client, runId);
      if (resultXml === undefined) return returnError(new Error(unknownCdsRunMessage(runId)));

      return okJson({
        success: true,
        run_id: runId,
        run_status: { status: 'completed' },
      });
    } catch (error) {
      return returnError(error);
    }
  },
);
