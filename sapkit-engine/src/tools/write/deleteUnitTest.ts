/**
 * DeleteUnitTest — **ADT가 지원하지 않는다.** 실행하면 정직하게 실패한다.
 *
 * ## 이 도구는 SAP에 요청을 보내지 않는다 (실측)
 *
 * 겉: `engine/src/handlers/unit_test/high/handleDeleteUnitTest.ts:44-88`.
 * 벤더 `…/dist/core/unitTest/AdtUnitTest.js`의 `delete()`는 본문이 한 줄이다:
 *
 * ```js
 * async delete(_config) {
 *   throw new Error('Delete operation is not supported for Unit Test objects in ADT');
 * }
 * ```
 *
 * 그래서 **어떤 주소도 치지 않는다.** 발행 설명도 그렇게 말한다("Note: ADT does not
 * support deleting unit test runs and will return an error"). 이 문구는 **SAP이 아니라
 * 구 엔진이 조립해 도구 응답에 실어 보내던 계약성 문구**이므로 글자 그대로 보존한다
 * (장부 D13이 그 경계를 정한다).
 *
 * 구가 접속을 먼저 만드는 것도 그대로다 — `createAdtClient(connection, logger)`가
 * 예외보다 앞에 있다(`:59`). 그래서 이 엔진도 `getConnection()`을 먼저 부른다.
 * 무프로파일 기동에서는 그 호출이 `ERR_NO_CONNECTION`으로 던지는데, 그것도 구가
 * 접속 없이 이 도구를 부를 수 없던 것과 같은 결이다.
 *
 * ## `targetNames`가 **빈 배열**인 이유
 *
 * 이 도구가 받는 것은 `run_id` 하나이고 그것은 **오브젝트 이름이 아니라 실행
 * 식별자**다(`CreateUnitTest`/`RunUnitTest`가 돌려준 값). 고객 네임스페이스로
 * 판정할 대상이 없으므로 빈 배열을 **명시 선언**한다 — 빈 배열은 선언이지
 * 귀찮음의 도피처가 아니며, 선언 자체를 빠뜨리면
 * `src/tools/__tests__/targetNames.test.ts`가 거부한다. 어차피 SAP 호출이 0회라
 * 사전 검사가 막을 것도 없다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { describeFailure, errorResult } from './shared';

/** 벤더가 던지는 문구 — 글자 그대로다(`dist/core/unitTest/AdtUnitTest.js`). */
export const UNIT_TEST_DELETE_UNSUPPORTED =
  'Delete operation is not supported for Unit Test objects in ADT';

export const deleteUnitTest = defineTool(
  {
    name: 'DeleteUnitTest',
    description:
      'Delete an ABAP Unit test run. Note: ADT does not support deleting unit test runs and will return an error.',
    inputSchema: {
      run_id: z.string().describe('Run identifier returned by CreateUnitTest/RunUnitTest.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    // 대상 오브젝트 이름 인자가 없다 — `run_id`는 실행 식별자다. 명시 선언.
    targetNames: [],
  },
  async (context, args) => {
    if (!args.run_id) return errorResult('Error: run_id is required');

    context.logger.info(`Deleting unit test run: ${args.run_id}`);

    try {
      // 구도 예외보다 먼저 클라이언트를 만든다. 요청은 한 건도 나가지 않는다.
      await context.getConnection();
      throw new Error(UNIT_TEST_DELETE_UNSUPPORTED);
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error deleting unit test run ${args.run_id}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
