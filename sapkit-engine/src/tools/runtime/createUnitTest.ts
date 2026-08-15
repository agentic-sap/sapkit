/**
 * CreateUnitTest — ABAP Unit 실행을 **벤더 API 엔드포인트**로 시작한다.
 *
 * ## 형제 `RunUnitTest`와 무엇이 다른가 — 이름이 아니라 **엔드포인트가 다르다**
 *
 * 두 도구는 발행 선언(`description`·`inputSchema`)이 **글자 하나까지 같다.**
 * 그런데 구 엔진 안에서 서로 다른 길을 간다:
 *
 * ```
 *   RunUnitTest    → engine/src/lib/abapUnitClassic.ts
 *                    POST /sap/bc/adt/abapunit/testruns      (고전 · 동기 · 실측 확인됨)
 *   CreateUnitTest → 벤더 AdtUnitTest.create()
 *                    POST /sap/bc/adt/abapunit/runs          (벤더 API · 비동기 · run_id 반환)
 * ```
 *
 * 구 `abapUnitClassic.ts:1-33`의 실측 기록은 **`/abapunit/runs`가 없다**고 적는다 —
 * 실 S/4HANA 2021 온프렘과 BASIS 7.00 양쪽에서 `GET /sap/bc/adt/discovery`로 확인.
 * 그래서 구는 `RunUnitTest` **하나만** 고전 엔드포인트로 옮겨 고쳤고,
 * `CreateUnitTest`는 벤더 경로에 그대로 남겨 두었다
 * (`engine/src/handlers/unit_test/high/handleCreateUnitTest.ts:137-160`).
 * **여기서 그 둘을 합치지 않는다** — 합치면 같은 이름이 다른 전문을 보내게 되고,
 * 이 판은 구가 실제로 보내던 것을 되살리는 판이다.
 *
 * 그 결과 이 도구가 돌려주는 `run_id`는 **SAP이 만든 서버측 식별자**이고,
 * `RunUnitTest`가 만드는 프로세스 내 캐시 열쇠와 **다른 종류**다. 그래서
 * `GetUnitTest*` 세 종(캐시 되읽기)은 이 `run_id`를 알지 못한다. 구도 그렇다 —
 * 성공 문구가 "Use GetUnitTest with run_id …"라고 안내하는 것은 구의 글자
 * 그대로이며, 이 판에서 고치지 않는다(요구 급이 `attended 실기`인 자리다).
 *
 * ## 와이어 (벤더 `startClassUnitTestRun`)
 *
 * `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/unitTest/run.js:20-61`
 *
 * ```
 * POST /sap/bc/adt/abapunit/runs
 * Content-Type: application/vnd.sap.adt.api.abapunit.run.v2+xml   (constants/contentTypes.js:41)
 * (Accept는 싣지 않는다 — 벤더가 Content-Type만 넘긴다)
 * timeout: default
 * ```
 *
 * 전문의 기본값은 `boolAttr(값, 기본)`이 정한다(`run.js:13-15`) —
 * `ownTests=true` · `foreignTests=false` · `addForeignTestsAsPreview=true` ·
 * 위험도 셋 전부 `true` · 기간 셋 전부 `true`. `title`은 주지 않으면
 * **첫 시험의 `test_class`**(대문자화된 것), `context`는 `MCP ABAP ADT Client`다.
 * 형제 `RunUnitTest`가 `title`·`context`를 **받고도 버리는** 것과 갈리는 자리다.
 *
 * `run_id` 추출 순서도 벤더 `AdtUnitTest.extractRunId()`
 * (`.../AdtUnitTest.js:227-270`) 그대로다: 응답 헤더
 * `location` → `content-location` → `sap-adt-location`에서 `/runs/<id>`를 찾고,
 * 없으면 본문의 `uri="…"`에서, 그래도 없으면 `<aunit:run … uri="…">`에서 찾는다.
 * 하나도 못 찾으면 벤더가 던지는 문구가 그대로 올라온다(`:84`).
 *
 * ## 인자 검증이 형제보다 **느슨하다** (구 실측 — 맞춰 주지 않는다)
 *
 * `RunUnitTest`는 항목마다 `container_class`·`test_class`가 비어 있지 않은지
 * 본다(`handleRunUnitTest.ts:133-141`). `CreateUnitTest`에는 **그 고리가 없다**
 * (`handleCreateUnitTest.ts:126-135` — 배열이 비었는지만 본다). 빈 문자열을 주면
 * 그대로 전문에 실려 나간다. 여기서 조용히 강화하면 구가 보내던 요청이 사라진다.
 *
 * ## 정책 분류
 *
 * `kind: 'execution'` — SAP에서 ABAP 시험을 돌린다. 다만 구 가드의 QA 특례 목록
 * (`engine/src/lib/readonlyGuard.ts:80-84`)에는 `RunUnitTest`만 있고 이 이름은
 * **없다.** 신 엔진의 `UNIT_TEST_EXECUTION_TOOLS`(`src/safety/tier.ts:57-61`)도
 * 같은 세 이름뿐이므로, `execution`으로 선언하면 QA·PRD 양쪽에서 막히는 구의
 * 판정이 그대로 재현된다. 시험의 「tier 게이트」 절이 그것을 못 박는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { okJson, returnError } from './internal/results';

/** 벤더 `constants/contentTypes.js:41`. */
export const CT_UNIT_TEST_RUN = 'application/vnd.sap.adt.api.abapunit.run.v2+xml';

/** 벤더 `run.js:53`. */
export const UNIT_TEST_RUNS_PATH = '/sap/bc/adt/abapunit/runs';

/** 벤더 `run.js:42`의 기본 문맥 문자열. */
export const DEFAULT_RUN_CONTEXT = 'MCP ABAP ADT Client';

interface TestDefinitionArg {
  readonly container_class?: unknown;
  readonly test_class?: unknown;
}

export interface RunOptionFlags {
  readonly ownTests?: boolean;
  readonly foreignTests?: boolean;
  readonly addForeignTestsAsPreview?: boolean;
  readonly harmless?: boolean;
  readonly dangerous?: boolean;
  readonly critical?: boolean;
  readonly short?: boolean;
  readonly medium?: boolean;
  readonly long?: boolean;
}

/** 벤더 `run.js:13-15`. */
function boolAttr(value: boolean | undefined, fallback: boolean): string {
  return (value ?? fallback) ? 'true' : 'false';
}

export interface UnitTestRunArgs {
  readonly containerClass: string;
  readonly testClass: string;
}

/**
 * 실행 요청 전문 — 벤더 `run.js:39-51`의 글자 그대로다. 들여쓰기와 속성 순서까지
 * 계약으로 본다(SAP은 따지지 않지만, 전문이 달라졌는지를 시험이 문자열로 붙잡는
 * 편이 안전하다).
 */
export function buildUnitTestRunXml(
  tests: readonly UnitTestRunArgs[],
  options: {
    readonly title?: string;
    readonly context?: string;
    readonly flags?: RunOptionFlags;
  } = {},
): string {
  const flags = options.flags ?? {};
  const testsXml = tests
    .map(
      (test) =>
        `<aunit:test containerClass="${encodeURIComponent(test.containerClass).toUpperCase()}" class="${test.testClass}"/>`,
    )
    .join('');

  const title = options.title || (tests[0]?.testClass ?? '');
  const context = options.context || DEFAULT_RUN_CONTEXT;

  return `<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" title="${title}" context="${context}">
  <aunit:options>
    <aunit:scope ownTests="${boolAttr(flags.ownTests, true)}" foreignTests="${boolAttr(flags.foreignTests, false)}" addForeignTestsAsPreview="${boolAttr(flags.addForeignTestsAsPreview, true)}"/>
    <aunit:riskLevel harmless="${boolAttr(flags.harmless, true)}" dangerous="${boolAttr(flags.dangerous, true)}" critical="${boolAttr(flags.critical, true)}"/>
    <aunit:duration short="${boolAttr(flags.short, true)}" medium="${boolAttr(flags.medium, true)}" long="${boolAttr(flags.long, true)}"/>
  </aunit:options>
  <aunit:tests>
    ${testsXml}
  </aunit:tests>
</aunit:run>`;
}

const RUN_ID_IN_URI = /\/runs\/([^/]+)/;

/**
 * 벤더 `AdtUnitTest.extractRunId()`(`.../AdtUnitTest.js:227-270`)의 순서 그대로.
 * 응답 헤더 이름은 접속 계층이 소문자로 눕혀 준다(`src/adt/http.ts:51-56`).
 */
export function extractRunId(
  headers: Readonly<Record<string, string>>,
  body: string,
): string | undefined {
  const locationHeader =
    headers['location'] || headers['content-location'] || headers['sap-adt-location'];
  if (locationHeader) {
    const fromHeader = locationHeader.match(RUN_ID_IN_URI);
    if (fromHeader?.[1]) return fromHeader[1];
  }

  const anyUri = body.match(/uri="([^"]+)"/);
  if (anyUri?.[1]) {
    const fromBody = anyUri[1].match(RUN_ID_IN_URI);
    if (fromBody?.[1]) return fromBody[1];
  }

  const runUri = body.match(/<aunit:run[^>]*uri="([^"]+)"/);
  if (runUri?.[1]) {
    const fromRun = runUri[1].match(RUN_ID_IN_URI);
    if (fromRun?.[1]) return fromRun[1];
  }

  return undefined;
}

export const createUnitTest = defineTool(
  {
    name: 'CreateUnitTest',
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

      // 구는 **배열이 비었는지만** 본다. 항목별 비어 있지 않음 검사는 형제
      // `RunUnitTest`에만 있다(머리주석).
      if (!Array.isArray(tests) || tests.length === 0) {
        return returnError(new Error('tests array with at least one entry is required'));
      }

      const definitions: UnitTestRunArgs[] = tests.map((test) => ({
        containerClass: String(test.container_class).toUpperCase(),
        testClass: String(test.test_class).toUpperCase(),
      }));

      context.logger.info(
        `Starting ABAP Unit run for ${definitions.length} test definition(s)`,
      );

      const client = await context.getConnection();
      const response = await client.request({
        method: 'POST',
        path: UNIT_TEST_RUNS_PATH,
        body: buildUnitTestRunXml(definitions, {
          title: args.title,
          context: args.context,
          flags: {
            ownTests: args.scope?.own_tests,
            foreignTests: args.scope?.foreign_tests,
            addForeignTestsAsPreview: args.scope?.add_foreign_tests_as_preview,
            harmless: args.risk_level?.harmless,
            dangerous: args.risk_level?.dangerous,
            critical: args.risk_level?.critical,
            short: args.duration?.short,
            medium: args.duration?.medium,
            long: args.duration?.long,
          },
        }),
        contentType: CT_UNIT_TEST_RUN,
        timeout: 'default',
      });

      const runId = extractRunId(response.headers, response.body);
      if (!runId) {
        // 벤더가 먼저 던지는 문구다(`AdtUnitTest.js:84`) — 겉 핸들러의
        // "run_id not returned"에는 닿지 않는다.
        throw new Error('Failed to start unit test run: run ID not returned');
      }

      context.logger.info(`CreateUnitTest started. Run ID: ${runId}`);

      return okJson({
        success: true,
        run_id: runId,
        message: `ABAP Unit run started. Use GetUnitTest with run_id ${runId} to get status and results.`,
      });
    } catch (error) {
      context.logger.error(`Error starting ABAP Unit run: ${String(error)}`);
      return returnError(error);
    }
  },
);
