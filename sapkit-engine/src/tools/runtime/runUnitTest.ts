/**
 * RunUnitTest — **SAP에서 ABAP Unit 시험을 실제로 돌린다.**
 *
 * ## 정책 분류가 `execution`인 근거, 그리고 **QA 특례**
 *
 * 구 가드(`engine/src/lib/readonlyGuard.ts:80-84`)의 `UNIT_TEST_EXECUTION_TOOLS`에
 * 이 이름이 있고, 판정(`:106-118`)은 이렇게 갈린다:
 *
 * ```
 *   DEV  → 통과
 *   QA   → 통과   ← **특례**. 「시험을 돌리는 것이 QA 시스템의 용도다」
 *   PRD  → 거부   "executes ABAP code on the server and is blocked on PRD profiles."
 *   미해석 → 거부 (fail-closed)
 * ```
 *
 * 같은 파일의 `RUNTIME_EXECUTION_TOOLS`(`:89-93` — 프로파일링 실행)에는 **이 특례가
 * 없다.** 두 목록을 뭉뚱그리면 과차단(QA에서 단위시험을 못 돌린다)이거나 바닥선
 * 저하(QA에서 임의 ABAP이 돈다)가 된다. 신 엔진에서 그 갈림은
 * `src/safety/tier.ts`의 `UNIT_TEST_EXECUTION_TOOLS`가 이미 승계해 갖고 있으므로,
 * 여기서는 `kind: 'execution'`이라고만 선언하면 게이트가 실측대로 판정한다.
 * 음성시험은 `__tests__/runUnitTest.test.ts`의 「tier 게이트」 절이다.
 *
 * `targetNames`는 `tests[].container_class` **하나뿐**이다. `test_class`는 컨테이너
 * 안의 로컬 시험 클래스(`LTCL_…`)라 고객 네임스페이스(Z·Y) 규칙에 걸리지 않는다 —
 * 함께 선언하면 정상적인 녹화가 전부 사전 검사에 막힌다.
 *
 * ## 와이어
 *
 * 요청은 **한 발**이다. 조립·발송·결과 캐시는 `internal/unitTestRuns.ts`가 갖고
 * 있고(그 파일 머리주석이 엔드포인트 실측의 정본), 여기서는 인자 검증과 응답
 * 조립만 한다 — 구 `engine/src/handlers/unit_test/high/handleRunUnitTest.ts:118-188`
 * 의 몫과 같다.
 *
 * `title`·`context` 인자는 **받기만 하고 전문에 싣지 않는다.** 구 핸들러도
 * `{ tests, scope, risk_level, duration }`만 구조분해한다(`:124`). 고전 실행 설정
 * 전문에 그 둘을 담을 자리가 없기 때문이다. 발행 표면에서 인자를 빼면 채록본과
 * 어긋나므로 그대로 두고, 무시된다는 사실을 시험으로 못 박았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import {
  SYNC_RUN_MIN_TIMEOUT_MS,
  runClassicUnitTest,
  storeUnitTestRun,
} from './internal/unitTestRuns';
import { okJson, returnError } from './internal/results';

/** 접속 프로파일의 `long` 타임아웃 기본값(`src/profile/resolve.ts:38`). */
const FALLBACK_LONG_TIMEOUT_MS = 60_000;

interface TestDefinitionArg {
  readonly container_class?: unknown;
  readonly test_class?: unknown;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export const runUnitTest = defineTool(
  {
    name: 'RunUnitTest',
    description:
      'Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.',
    inputSchema: {
      tests: z
        .array(
          z.object({
            container_class: z
              .string()
              .describe('Class that owns the test include (e.g., ZCL_MAIN_CLASS).'),
            test_class: z
              .string()
              .describe('Test class name inside the include (e.g., LTCL_MAIN_CLASS).'),
          }),
        )
        .describe('List of container/test class pairs to execute.'),
      title: z.string().describe('Optional title for the ABAP Unit run.').optional(),
      context: z.string().describe('Optional context string shown in SAP tools.').optional(),
      scope: z
        .object({
          own_tests: z.boolean().optional(),
          foreign_tests: z.boolean().optional(),
          add_foreign_tests_as_preview: z.boolean().optional(),
        })
        .optional(),
      risk_level: z
        .object({
          harmless: z.boolean().optional(),
          dangerous: z.boolean().optional(),
          critical: z.boolean().optional(),
        })
        .optional(),
      duration: z
        .object({
          short: z.boolean().optional(),
          medium: z.boolean().optional(),
          long: z.boolean().optional(),
        })
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'execution',
    targetNames: [{ arg: 'tests', element: 'container_class' }],
  },
  async (context, args) => {
    try {
      const tests = args.tests as unknown as TestDefinitionArg[] | undefined;

      if (!Array.isArray(tests) || tests.length === 0) {
        return returnError(new Error('tests array with at least one entry is required'));
      }
      for (let i = 0; i < tests.length; i += 1) {
        const entry = tests[i];
        if (nonEmpty(entry?.container_class) === null || nonEmpty(entry?.test_class) === null) {
          return returnError(
            new Error(`tests[${i}] must include non-empty container_class and test_class`),
          );
        }
      }

      const definitions = tests.map((test) => ({
        containerClass: String(test.container_class).toUpperCase(),
        testClass: String(test.test_class).toUpperCase(),
      }));

      context.logger.info(
        `Starting ABAP Unit run for ${definitions.length} test definition(s)`,
      );

      const client = await context.getConnection();
      const longTimeout = context.profile.connection?.timeouts.long ?? FALLBACK_LONG_TIMEOUT_MS;
      const resultXml = await runClassicUnitTest(
        client,
        definitions,
        {
          scope: args.scope
            ? {
                ownTests: args.scope.own_tests,
                foreignTests: args.scope.foreign_tests,
                addForeignTestsAsPreview: args.scope.add_foreign_tests_as_preview,
              }
            : undefined,
          riskLevel: args.risk_level,
          duration: args.duration,
        },
        Math.max(longTimeout, SYNC_RUN_MIN_TIMEOUT_MS),
      );

      const runId = storeUnitTestRun(client, resultXml);
      context.logger.info(`RunUnitTest started. Run ID: ${runId}`);

      return okJson({
        success: true,
        run_id: runId,
        message: `ABAP Unit run started. Use GetUnitTest with run_id ${runId} to get status and results. Note: the classic ADT endpoint runs all local test classes of each container class — per-test_class sub-selection is not supported by the protocol, so the result may include more test classes than requested.`,
      });
    } catch (error) {
      context.logger.error(`Error starting ABAP Unit run: ${String(error)}`);
      return returnError(error);
    }
  },
);
