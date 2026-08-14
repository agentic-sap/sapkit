/**
 * GetUnitTest — 끝난 ABAP Unit 실행의 **상태와 결과를 함께** 되읽는다.
 *
 * **SAP에 요청을 보내지 않는다.** 고전 ADT 엔드포인트가 동기라 `RunUnitTest`가
 * 결과를 그 자리에서 받아 캐시했고, 이 도구는 그것을 `run_id`로 되찾을 뿐이다
 * (사연은 `internal/unitTestRuns.ts` 머리주석). 그래서 `kind: 'read'`이고 tier
 * 게이트의 읽기 열에 앉는다 — 구 가드도 `Get` 접두사로 그렇게 판정했다
 * (`engine/src/lib/readonlyGuard.ts:42-54, 118`).
 *
 * 그래도 `getConnection()`은 부른다. 캐시의 **열쇠가 접속 객체**이기 때문이고
 * (세션이 갈리면 결과도 갈린다), 구 핸들러도 `context.connection`을 받아 그
 * 열쇠로 썼다(`handleGetUnitTest.ts:48, 59`). 접속을 만드는 것 자체는 SAP에
 * 나가는 요청이 아니다(`src/adt/client.ts`의 생성자는 I/O를 하지 않는다).
 *
 * 형제 셋과의 차이: 이 도구만 `run_status`와 `run_result`를 **함께** 싣는다.
 * `GetUnitTestStatus`는 상태만, `GetUnitTestResult`는 결과만이다.
 *
 * 구 원본: `engine/src/handlers/unit_test/high/handleGetUnitTest.ts:44-85`.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { getUnitTestRun, unknownRunMessage } from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

export const getUnitTest = defineTool(
  {
    name: 'GetUnitTest',
    description:
      'Retrieve ABAP Unit test run status and result for a previously started run_id.',
    inputSchema: {
      run_id: z.string().describe('Run identifier returned by RunUnitTest.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const runId = args.run_id;
      if (!runId) return returnError(new Error('run_id is required'));

      context.logger.info(`Reading unit test run status/result for run_id: ${runId}`);

      const client = await context.getConnection();
      const resultXml = getUnitTestRun(client, runId);
      if (resultXml === undefined) return returnError(new Error(unknownRunMessage(runId)));

      context.logger.info(`GetUnitTest completed successfully for run_id: ${runId}`);

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
