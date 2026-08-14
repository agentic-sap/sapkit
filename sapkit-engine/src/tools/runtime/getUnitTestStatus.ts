/**
 * GetUnitTestStatus — 끝난 ABAP Unit 실행의 **상태만** 되읽는다.
 *
 * 고전 ADT 엔드포인트가 동기라 **폴링할 서버측 실행이 없다**. 캐시에 `run_id`가
 * 있다는 것이 곧 「끝났다」이므로 상태는 언제나 `completed`다
 * (`engine/src/handlers/unit_test/high/handleGetUnitTestStatus.ts:1-8, 72-84`).
 *
 * 그래서 `with_long_polling`은 **받기만 하고 아무 일도 하지 않는다.** 구 핸들러도
 * `run_id`만 구조분해한다(`:55`). 발행 표면에서 인자를 빼면 채록본과 어긋나므로
 * 그대로 두고, 값이 답을 바꾸지 않는다는 사실을 시험으로 못 박았다.
 *
 * **채록본에는 `with_long_polling`의 `default: true`가 없다.** 구 핸들러 선언
 * (`:29-33`)에는 있지만 구가 실제로 발행한 스키마에는 실리지 않았다 — 구 서버가
 * JSON Schema를 zod로 되돌릴 때 불린을 `z.preprocess(…)`로 감쌌고
 * (`engine/src/lib/handlers/utils/schemaUtils.ts:14-23, 83-84, 191-193`) 그 래퍼
 * 너머로 기본값이 발행 표면까지 나오지 못했기 때문이다. 발행 선언의 정본은
 * 채록본이므로 여기서도 `.default(true)`를 달지 않는다.
 *
 * SAP에 요청을 보내지 않는 것과 `getConnection()`을 부르는 이유는 `getUnitTest.ts`
 * 머리주석과 같다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { getUnitTestRun, unknownRunMessage } from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

export const getUnitTestStatus = defineTool(
  {
    name: 'GetUnitTestStatus',
    description: 'Retrieve ABAP Unit test run status for a run_id.',
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

      context.logger.info(`Reading unit test status for run_id: ${runId}`);

      const client = await context.getConnection();
      const resultXml = getUnitTestRun(client, runId);
      if (resultXml === undefined) return returnError(new Error(unknownRunMessage(runId)));

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
