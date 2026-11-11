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
 * ## 구와 다른 것 둘 (장부 D162·D163 · 실사용 2026-11-11)
 *
 * - **D162 — 프로그램 컨테이너.** 덧인자 `container_type: "class" | "program"`(기본
 *   `class` = 구 그대로의 바이트)이 실행 설정 전문의 주소 종류를 가른다. 구는 언제나
 *   클래스 주소를 만들어 실행 프로그램 안의 로컬 시험(`ZMMR10` · `LTCL_HELPER`)을 고를
 *   길이 없었다.
 * - **D163 — 빈 실행은 성공이 아니다.** 결과에 시험 클래스가 하나도 없으면 도구 오류로
 *   답하고 run_id를 내지 않는다. 구는 빈 `runResult`에도 `success: true`를 냈고, 그것이
 *   「시험 5개가 통과했다」로 읽힐 자리였다.
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
  type UnitTestContainerType,
  countTestClasses,
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

/** 빈 실행 오류(D163)에 싣는 결과 원문의 앞부분 길이 — 프로그램 단위 경보가 보일 만큼. */
const EMPTY_RUN_EXCERPT_CHARS = 600;

function emptyRunMessage(
  containers: readonly string[],
  containerType: UnitTestContainerType,
  resultXml: string,
): string {
  const hint =
    containerType === 'program'
      ? 'Check that the program exists, is active, and contains local test classes (CLASS … FOR TESTING).'
      : 'If the tests live in an executable program rather than a class, pass the program name as container_class and set container_type: "program". Otherwise check that the class exists, is active, and has local test classes (CLASS … FOR TESTING).';
  return (
    `ABAP Unit run selected no test class for ${containers.join(', ')} (container_type "${containerType}") — ` +
    `nothing was tested, so this is not a pass. ${hint} ` +
    `Result (first ${EMPTY_RUN_EXCERPT_CHARS} chars): ${resultXml.slice(0, EMPTY_RUN_EXCERPT_CHARS)}`
  );
}

export const runUnitTest = defineTool(
  {
    name: 'RunUnitTest',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json`) — D162·D163.
    description:
      'Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.' +
      ' To run the local test classes of an executable program, pass the program name as container_class and set container_type: "program" (default "class"). A run in which SAP selects no test class is returned as an error, not as success — an empty result never counts as a pass.',
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
      // 덧인자(D162) — 채록본에 없던 선택 인자. 기본값이 구 동작(클래스 주소)이다.
      container_type: z
        .enum(['class', 'program'])
        .default('class')
        .describe(
          'What every container_class in tests names: "class" (default, /sap/bc/adt/oo/classes/<name>) or "program" (an executable program whose includes hold local test classes, /sap/bc/adt/programs/programs/<name>). Use separate calls for classes and programs.',
        ),
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

      const containerType: UnitTestContainerType =
        args.container_type === 'program' ? 'program' : 'class';
      const definitions = tests.map((test) => ({
        containerClass: String(test.container_class).toUpperCase(),
        testClass: String(test.test_class).toUpperCase(),
        containerType,
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

      if (countTestClasses(resultXml) === 0) {
        const containers = [...new Set(definitions.map((test) => test.containerClass))];
        return returnError(new Error(emptyRunMessage(containers, containerType, resultXml)));
      }

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
