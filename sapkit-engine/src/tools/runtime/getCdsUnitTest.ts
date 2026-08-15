/**
 * GetCdsUnitTest — 끝난 CDS 단위시험 실행의 **상태와 결과를 함께** 되읽는다.
 *
 * **SAP에 요청을 보내지 않는다.** 구 핸들러
 * (`engine/src/handlers/unit_test/high/handleGetCdsUnitTest.ts:1-13, 49-93`)의
 * 머리주석이 그 사연의 정본이다: 벤더 `AdtCdsUnitTest.read()`는
 * `/sap/bc/adt/abapunit/runs/{id}` + `/results/{id}`로 되읽는데 그 컬렉션은
 * **온프렘(S/4HANA 2021 · BASIS 7.00)에서 404**다. 그래서 구는 이 도구를
 * `RunUnitTest`가 채운 프로세스 내 캐시 되읽기로 갈아 끼웠다 —
 * 저장소 정본은 `internal/unitTestRuns.ts`.
 *
 * 그래도 `getConnection()`은 부른다. 캐시의 **열쇠가 접속 객체**이기 때문이고
 * (세션이 갈리면 결과도 갈린다), 구 핸들러도 `context.connection`을 그 열쇠로
 * 썼다(`:65`). 접속을 만드는 것 자체는 SAP에 나가는 요청이 아니다.
 *
 * ## 비CDS 형제 `GetUnitTest`와 갈리는 자리 둘
 *
 *  1. `run_id` 인자의 `description`이 다르다 — 이쪽은 "Run identifier returned by
 *     unit test run.", 저쪽은 "…returned by RunUnitTest.". 채록본이 그렇게 갈라져
 *     있으므로 옮길 때 섞지 않는다.
 *  2. 모르는 `run_id`의 문구가 다르다 — `internal/cdsUnitTest.ts` 머리주석 참조.
 *
 * 응답 조립(`run_status` + `run_result` 둘 다)은 형제와 같다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { unknownCdsRunMessage } from './internal/cdsUnitTest';
import { getUnitTestRun } from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

export const getCdsUnitTest = defineTool(
  {
    name: 'GetCdsUnitTest',
    description:
      'Retrieve CDS unit test run status and result for a previously started run_id.',
    inputSchema: {
      run_id: z.string().describe('Run identifier returned by unit test run.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const runId = args.run_id;
      if (!runId) return returnError(new Error('run_id is required'));

      context.logger.info(
        `Reading CDS unit test run status/result for run_id: ${runId}`,
      );

      const client = await context.getConnection();
      const resultXml = getUnitTestRun(client, runId);
      if (resultXml === undefined) return returnError(new Error(unknownCdsRunMessage(runId)));

      context.logger.info(`GetCdsUnitTest completed successfully for run_id: ${runId}`);

      return okJson({
        success: true,
        run_id: runId,
        run_status: { status: 'completed' },
        run_result: resultXml,
      });
    } catch (error) {
      return returnError(error);
    }
  },
);
