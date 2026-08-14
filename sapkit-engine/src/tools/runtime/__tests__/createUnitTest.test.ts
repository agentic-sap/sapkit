/**
 * `CreateUnitTest` — 발행 계약 · **벤더 API 전문** · `run_id` 추출 · tier 게이트.
 *
 * 이 도구는 형제 `RunUnitTest`와 발행 선언이 **글자까지 같지만 엔드포인트가 다르다**
 * (`/abapunit/runs` ↔ `/abapunit/testruns`). 그 갈림이 구 엔진의 실측이며, 아래
 * 「와이어」 절이 그것을 붙잡는다.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 전문·엔드포인트·Content-Type → 벤더
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/unitTest/run.js:20-61`
 *    · `dist/constants/contentTypes.js:41`
 *  - `run_id` 추출 순서 → 벤더 `.../unitTest/AdtUnitTest.js:227-270`
 *  - 검증 갈래·응답 조립 → `engine/src/handlers/unit_test/high/handleCreateUnitTest.ts:110-186`
 *  - tier 판정(QA 특례 **없음**) → `engine/src/lib/readonlyGuard.ts:80-84, 106-122`
 */

import { createUnitTest } from '../createUnitTest';
import {
  cleanupTempDirs,
  csrfAware,
  jsonOf,
  probeTier,
  publishedDeclaration,
  publishedOf,
  runTool,
  toolRequests,
} from './unitTestSupport';

afterEach(() => {
  cleanupTempDirs();
});

const RUNS_PATH = '/sap/bc/adt/abapunit/runs';
const CT_RUN = 'application/vnd.sap.adt.api.abapunit.run.v2+xml';
/** 구 접속 계층이 호출자가 Accept를 안 주면 붙이던 값. */
const DEFAULT_ACCEPT = 'application/xml, application/json, text/plain, */*';

const RUN_BODY =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" uri="/sap/bc/adt/abapunit/runs/RUN-FROM-BODY"/>';

const TESTS = [{ container_class: 'zcl_fixture', test_class: 'ltcl_fixture' }];

function replies(
  outcome: { status?: number; body?: string; headers?: Record<string, string> } = {},
) {
  return csrfAware(() => ({
    status: outcome.status ?? 200,
    body: outcome.body ?? RUN_BODY,
    headers: outcome.headers,
  }));
}

async function call(
  args: Record<string, unknown>,
  outcome?: { status?: number; body?: string; headers?: Record<string, string> },
) {
  const { outcome: result, requests } = await runTool(createUnitTest, args, replies(outcome));
  const sent = toolRequests(requests);
  return { result, sent, paths: sent.map((entry) => new URL(entry.url).pathname) };
}

/**
 * 벤더 `run.js:39-51`을 **독립적으로 다시 옮긴 것**이다. 신 모듈의 조립기를
 * 부르지 않는다 — 부르면 자기확인이 된다.
 */
function expectedRunXml(
  tests: ReadonlyArray<{ containerClass: string; testClass: string }>,
  options: {
    title?: string;
    context?: string;
    ownTests?: boolean;
    foreignTests?: boolean;
    addForeignTestsAsPreview?: boolean;
    harmless?: boolean;
    dangerous?: boolean;
    critical?: boolean;
    short?: boolean;
    medium?: boolean;
    long?: boolean;
  } = {},
): string {
  const flag = (value: boolean | undefined, fallback: boolean): string =>
    (value ?? fallback) ? 'true' : 'false';
  const testsXml = tests
    .map(
      (test) =>
        `<aunit:test containerClass="${encodeURIComponent(test.containerClass).toUpperCase()}" class="${test.testClass}"/>`,
    )
    .join('');
  const title = options.title || tests[0]?.testClass || '';
  const context = options.context || 'MCP ABAP ADT Client';
  return `<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" title="${title}" context="${context}">
  <aunit:options>
    <aunit:scope ownTests="${flag(options.ownTests, true)}" foreignTests="${flag(options.foreignTests, false)}" addForeignTestsAsPreview="${flag(options.addForeignTestsAsPreview, true)}"/>
    <aunit:riskLevel harmless="${flag(options.harmless, true)}" dangerous="${flag(options.dangerous, true)}" critical="${flag(options.critical, true)}"/>
    <aunit:duration short="${flag(options.short, true)}" medium="${flag(options.medium, true)}" long="${flag(options.long, true)}"/>
  </aunit:options>
  <aunit:tests>
    ${testsXml}
  </aunit:tests>
</aunit:run>`;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(createUnitTest)).toEqual(publishedDeclaration('CreateUnitTest'));
  });

  it('선언은 형제 RunUnitTest와 글자까지 같다 — 갈리는 것은 엔드포인트다', () => {
    expect(publishedDeclaration('CreateUnitTest').description).toBe(
      publishedDeclaration('RunUnitTest').description,
    );
    expect(publishedDeclaration('CreateUnitTest').inputSchema).toEqual(
      publishedDeclaration('RunUnitTest').inputSchema,
    );
  });

  it('노출·정책 선언 — high, execution, 대상 이름은 container_class 하나', () => {
    expect(createUnitTest.definition.sets).toEqual(['high']);
    expect(createUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createUnitTest.definition.kind).toBe('execution');
    expect(createUnitTest.definition.targetNames).toEqual([
      { arg: 'tests', element: 'container_class' },
    ]);
  });
});

describe('와이어', () => {
  it('POST /abapunit/runs 하나로 끝난다 — 전용 Content-Type · 기본 Accept', async () => {
    const { result, sent, paths } = await call({ tests: TESTS });

    expect(result.isError).toBe(false);
    expect(paths).toEqual([RUNS_PATH]);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.headers['Content-Type']).toBe(CT_RUN);
    expect(sent[0]?.headers['Accept']).toBe(DEFAULT_ACCEPT);
  });

  it('형제 RunUnitTest의 고전 엔드포인트로는 가지 않는다', async () => {
    const { paths } = await call({ tests: TESTS });

    expect(paths).not.toContain('/sap/bc/adt/abapunit/testruns');
  });

  it('전문이 벤더 기본값 그대로다 — 이름은 대문자, title은 첫 test_class', async () => {
    const { sent } = await call({ tests: TESTS });

    expect(sent[0]?.body).toBe(
      expectedRunXml([{ containerClass: 'ZCL_FIXTURE', testClass: 'LTCL_FIXTURE' }]),
    );
  });

  it('title·context를 주면 전문에 실린다 — 형제는 이 둘을 버린다', async () => {
    const { sent } = await call({
      tests: TESTS,
      title: 'Nightly',
      context: 'CI',
    });

    expect(sent[0]?.body).toBe(
      expectedRunXml([{ containerClass: 'ZCL_FIXTURE', testClass: 'LTCL_FIXTURE' }], {
        title: 'Nightly',
        context: 'CI',
      }),
    );
  });

  it('scope·risk_level·duration의 부분 지정은 나머지를 벤더 기본값으로 둔다', async () => {
    const { sent } = await call({
      tests: TESTS,
      scope: { own_tests: false, foreign_tests: true },
      risk_level: { critical: false },
      duration: { long: false },
    });

    expect(sent[0]?.body).toBe(
      expectedRunXml([{ containerClass: 'ZCL_FIXTURE', testClass: 'LTCL_FIXTURE' }], {
        ownTests: false,
        foreignTests: true,
        critical: false,
        long: false,
      }),
    );
  });

  it('여러 시험은 구분자 없이 이어 붙는다 — 중복 컨테이너도 접지 않는다', async () => {
    const { sent } = await call({
      tests: [
        { container_class: 'ZCL_A', test_class: 'LTCL_A' },
        { container_class: 'ZCL_A', test_class: 'LTCL_B' },
      ],
    });

    expect(sent[0]?.body).toContain(
      '<aunit:test containerClass="ZCL_A" class="LTCL_A"/><aunit:test containerClass="ZCL_A" class="LTCL_B"/>',
    );
  });

  it('네임스페이스 이름의 슬래시는 퍼센트 인코딩되고 대문자로 눕는다', async () => {
    const { sent } = await call({
      tests: [{ container_class: '/acme/zcl_x', test_class: 'ltcl_x' }],
    });

    expect(sent[0]?.body).toContain('containerClass="%2FACME%2FZCL_X"');
  });
});

describe('run_id 추출 — 벤더의 순서', () => {
  it('location 헤더가 가장 먼저다', async () => {
    const { result } = await call(
      { tests: TESTS },
      { headers: { location: '/sap/bc/adt/abapunit/runs/RUN-FROM-HEADER' } },
    );

    expect(jsonOf(result)).toEqual({
      success: true,
      run_id: 'RUN-FROM-HEADER',
      message:
        'ABAP Unit run started. Use GetUnitTest with run_id RUN-FROM-HEADER to get status and results.',
    });
  });

  it('content-location · sap-adt-location도 같은 자리에서 읽힌다', async () => {
    const viaContent = await call(
      { tests: TESTS },
      { headers: { 'content-location': '/sap/bc/adt/abapunit/runs/RUN-CL' } },
    );
    const viaAdt = await call(
      { tests: TESTS },
      { headers: { 'sap-adt-location': '/sap/bc/adt/abapunit/runs/RUN-ADT' } },
    );

    expect((jsonOf(viaContent.result) as { run_id: string }).run_id).toBe('RUN-CL');
    expect((jsonOf(viaAdt.result) as { run_id: string }).run_id).toBe('RUN-ADT');
  });

  it('헤더가 없으면 본문의 uri에서 읽는다', async () => {
    const { result } = await call({ tests: TESTS });

    expect((jsonOf(result) as { run_id: string }).run_id).toBe('RUN-FROM-BODY');
  });

  it('헤더가 있어도 /runs/ 조각이 없으면 본문으로 내려간다', async () => {
    const { result } = await call(
      { tests: TESTS },
      { headers: { location: '/sap/bc/adt/somewhere/else' } },
    );

    expect((jsonOf(result) as { run_id: string }).run_id).toBe('RUN-FROM-BODY');
  });

  it('어디서도 못 찾으면 벤더의 문구로 실패한다', async () => {
    const { result } = await call({ tests: TESTS }, { body: '<aunit:run/>' });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('Error: Failed to start unit test run: run ID not returned');
  });

  it('응답 본문은 JSON 두 칸 들여쓰기다 — 구 return_response 그대로', async () => {
    const { result } = await call({ tests: TESTS });

    expect(result.text).toBe(JSON.stringify(jsonOf(result), null, 2));
  });
});

describe('갈래', () => {
  it('tests가 비면 요청이 나가지 않는다', async () => {
    const { result, sent } = await call({ tests: [] });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('Error: tests array with at least one entry is required');
    expect(sent).toHaveLength(0);
  });

  it('**빈 문자열 이름은 그대로 실려 나간다** — 형제 RunUnitTest와 갈리는 자리', async () => {
    // 구 `handleCreateUnitTest`에는 항목별 비어 있지 않음 검사가 없다
    // (`handleRunUnitTest.ts:133-141`에만 있다). 여기서 조용히 강화하면
    // 구가 보내던 요청이 사라진다.
    const { result, sent } = await call({
      tests: [{ container_class: '', test_class: '' }],
    });

    expect(result.isError).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain('<aunit:test containerClass="" class=""/>');
  });

  it('SAP이 404로 답하면(엔드포인트 부재 실측) 오류로 올라온다', async () => {
    const { result } = await call({ tests: TESTS }, { status: 404, body: 'not found' });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('404');
  });
});

describe('tier 게이트 — QA 특례가 **없다**', () => {
  it('DEV에서는 접속까지 간다', async () => {
    const probe = await probeTier(createUnitTest, 'DEV', { tests: TESTS });

    expect(probe.connections).toBe(1);
  });

  it.each(['QA', 'PRD', ''])('%s tier에서는 접속을 열기 전에 막힌다', async (tier) => {
    const probe = await probeTier(createUnitTest, tier, { tests: TESTS });

    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(0);
  });
});
