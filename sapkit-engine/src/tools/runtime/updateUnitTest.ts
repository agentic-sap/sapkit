/**
 * UpdateUnitTest — **ADT가 지원하지 않는 연산**을 정직하게 거절한다.
 *
 * 발행 설명이 그것을 미리 말한다: "Note: ADT does not support updating unit test
 * runs and will return an error." 구 엔진도 같은 자리를 그렇게 지었다.
 *
 * ## 실측 — SAP에 요청이 나가지 않는다
 *
 * 구 핸들러(`engine/src/handlers/unit_test/high/handleUpdateUnitTest.ts:60-81`)는
 * `client.getUnitTest().update({ runId })`를 부르고, 벤더
 * `AdtUnitTest.update()`(`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/unitTest/AdtUnitTest.js:155-157`)
 * 의 본문은 **한 줄**이다:
 *
 * ```
 *   throw new Error('Update operation is not supported for Unit Test objects in ADT');
 * ```
 *
 * 같은 클래스의 머리주석도 "Update: not supported (test runs cannot be updated)"
 * 라고 적어 둔다(`:17`). 겉 핸들러의 catch가 `extractAdtErrorMessage`로 그 문구를
 * 꺼내는데(`engine/src/lib/utils.ts` — `response`가 없는 평범한 Error면
 * `error.message.trim()`을 돌려준다), 그 결과가 그대로 `return_error`에 실린다.
 *
 * 그래서 관찰 가능한 계약은 둘뿐이고 **어느 쪽에서도 왕복이 없다**:
 *   ⑴ `run_id`가 비면 `Error: run_id is required`
 *   ⑵ 그 밖에는 언제나 `Error: Update operation is not supported for Unit Test objects in ADT`
 *
 * 성공 갈래(`Unit test run … updated successfully.`)는 구에서도 **도달하지 않는
 * 죽은 코드**다. 여기서 되살리면 없는 동작을 지어내는 것이 되므로 옮기지 않았다.
 *
 * ## 왜 `runtime/`에 사는가 · `kind`가 왜 `mutation`인가
 *
 * 자리는 단위시험 가족(`RunUnitTest`·`GetUnitTest*`·`CreateUnitTest`)과 같은
 * `runtime/`이다. SAP 오브젝트를 쓰지 않으므로 `write/`가 아니다 — 같은 폴더의
 * `runtimeCreateProfilerTraceParameters`도 `kind: 'mutation'`이면서 여기 산다.
 *
 * `kind`는 `mutation`이다. 구 가드는 이 이름을 읽기로 분류하지 못해 fail-closed로
 * 막았고(`engine/src/lib/readonlyGuard.ts:95-122` — `Update` 접두사는 READ_PREFIXES에
 * 없고 UNIT_TEST_EXECUTION_TOOLS에도 없다), QA·PRD 양쪽에서 거부했다. `mutation`
 * 선언이 그 판정을 그대로 재현한다. 신 게이트의 이름 교차검사
 * (`src/safety/tier.ts:94-95`의 `DANGEROUS_NAME_RE`)도 `Update`로 시작하는 이름이
 * `read`를 참칭하는 것을 막으므로, 이 선언 말고 다른 선택지가 없다.
 *
 * `targetNames`는 **빈 배열**이다 — `run_id`는 오브젝트 이름이 아니라 실행
 * 식별자이고, 이 도구는 대상 이름 인자를 아예 받지 않는다. 빈 배열은 선언이지
 * 귀찮음의 도피처가 아니다(`ADDING-A-TOOL.md` 3번).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { returnError } from './internal/results';

/**
 * 벤더 `AdtUnitTest.update()`가 던지는 문구 그대로
 * (`.../dist/core/unitTest/AdtUnitTest.js:156`).
 */
export const UNIT_TEST_UPDATE_UNSUPPORTED =
  'Update operation is not supported for Unit Test objects in ADT';

export const updateUnitTest = defineTool(
  {
    name: 'UpdateUnitTest',
    description:
      'Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.',
    inputSchema: {
      run_id: z.string().describe('Run identifier returned by CreateUnitTest/RunUnitTest.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: [],
  },
  async (context, args) => {
    try {
      const runId = args.run_id;
      if (!runId) return returnError(new Error('run_id is required'));

      // 구 `createAdtClient(connection, logger)`의 자리. 접속 객체를 얻는 것 자체는
      // SAP에 나가는 요청이 아니다.
      await context.getConnection();

      context.logger.info(`Updating unit test run: ${runId}`);

      // 벤더가 여기서 던진다 — 왕복은 시작되지 않는다.
      context.logger.error(
        `Error updating unit test run ${runId}: ${UNIT_TEST_UPDATE_UNSUPPORTED}`,
      );
      return returnError(new Error(UNIT_TEST_UPDATE_UNSUPPORTED));
    } catch (error) {
      return returnError(error);
    }
  },
);
