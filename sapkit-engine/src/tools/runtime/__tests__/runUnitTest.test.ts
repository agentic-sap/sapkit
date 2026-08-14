/**
 * `RunUnitTest` — 발행 계약 · 고전 ADT 전문 · **tier 게이트(QA 특례 포함)**.
 *
 * 이 도구는 **SAP에서 ABAP을 실제로 돌린다**. 시험은 실 SAP에 붙지 않는다 —
 * 전송이 주입된 가짜다.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 전문·엔드포인트·기본값 → `engine/src/lib/abapUnitClassic.ts:61-159`
 *  - 검증 갈래·응답 조립 → `engine/src/handlers/unit_test/high/handleRunUnitTest.ts:118-188`
 *  - tier 판정과 **QA 특례** → `engine/src/lib/readonlyGuard.ts:80-84, 106-118`
 */

import { runUnitTest } from '../runUnitTest';
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

const TESTRUNS_PATH = '/sap/bc/adt/abapunit/testruns';
const CT_CONFIG = 'application/vnd.sap.adt.abapunit.testruns.config.v1+xml';
/** 구 접속 계층이 호출자가 Accept를 안 주면 붙이던 값. */
const DEFAULT_ACCEPT = 'application/xml, application/json, text/plain, */*';

const RUN_RESULT = '<?xml version="1.0"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"/>';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 성공 응답 하나만 내주는 전송. CSRF 왕복은 지나가게 한다. */
function replies(body: string = RUN_RESULT, status = 200) {
  return csrfAware(() => ({ status, body }));
}

async function call(args: Record<string, unknown>, body?: string, status?: number) {
  const { outcome, requests } = await runTool(runUnitTest, args, replies(body, status));
  const sent = toolRequests(requests);
  return { outcome, sent, paths: sent.map((entry) => new URL(entry.url).pathname) };
}

/**
 * 구 `buildRunConfigurationXml`(`abapUnitClassic.ts:85-127`)을 **독립적으로 다시
 * 옮긴 것**이다. 신 모듈을 부르지 않는다 — 부르면 자기확인이 된다.
 */
function expectedConfig(
  classes: readonly string[],
  options: {
    appendAssignedTestsPreview?: boolean;
    assignedTests?: boolean;
    sameProgram?: boolean;
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
  const refs = classes
    .map(
      (cls) =>
        `        <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/${encodeURIComponent(
          cls.toLowerCase(),
        )}"/>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external>
    <coverage active="false"/>
  </external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy appendAssignedTestsPreview="${flag(
      options.appendAssignedTestsPreview,
      true,
    )}" assignedTests="${flag(options.assignedTests, false)}" sameProgram="${flag(
      options.sameProgram,
      true,
    )}"/>
    <testRiskLevels harmless="${flag(options.harmless, true)}" dangerous="${flag(
      options.dangerous,
      true,
    )}" critical="${flag(options.critical, true)}"/>
    <testDurations short="${flag(options.short, true)}" medium="${flag(
      options.medium,
      true,
    )}" long="${flag(options.long, true)}"/>
    <withNavigationUri enabled="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
${refs}
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;
}

const ONE_TEST = [{ container_class: 'ZCL_FIXTURE', test_class: 'LTCL_FIXTURE' }];

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runUnitTest)).toEqual(publishedDeclaration('RunUnitTest'));
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    // 구 경로는 `handlers/unit_test/high/`이고, 채록본의 `exposures`에서 이 도구는
    // `connected_default`·`noProfile_default` 둘에만 뜬다 — readonly 두 조건에는
    // 없다. 그것이 `high`의 표시다.
    expect(runUnitTest.definition.sets).toEqual(['high']);
    expect(runUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
  });

  it('kind는 execution이고 대상-이름 인자를 선언한다', () => {
    expect(runUnitTest.definition.kind).toBe('execution');
    expect(runUnitTest.definition.targetNames).toEqual([
      { arg: 'tests', element: 'container_class' },
    ]);
  });
});

describe('와이어 — 고전 ADT 동기 실행', () => {
  it('POST /abapunit/testruns 하나로 끝난다 (전용 Content-Type · 기본 Accept)', async () => {
    const { sent, paths } = await call({ tests: ONE_TEST });

    expect(paths).toEqual([TESTRUNS_PATH]);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.headers['Content-Type']).toBe(CT_CONFIG);
    expect(sent[0]?.headers['Accept']).toBe(DEFAULT_ACCEPT);
    expect(sent[0]?.body).toBe(expectedConfig(['ZCL_FIXTURE']));
  });

  it('컨테이너 클래스는 대문자로 올리고 URI는 소문자로 쓴다', async () => {
    const { sent } = await call({
      tests: [{ container_class: 'zcl_fixture', test_class: 'ltcl_fixture' }],
    });

    expect(sent[0]?.body).toContain('/sap/bc/adt/oo/classes/zcl_fixture');
  });

  it('네임스페이스 이름은 슬래시를 퍼센트 인코딩한다', async () => {
    const { sent } = await call({
      tests: [{ container_class: '/ACME/ZCL_X', test_class: 'LTCL_X' }],
    });

    expect(sent[0]?.body).toContain('/sap/bc/adt/oo/classes/%2Facme%2Fzcl_x');
  });

  it('오브젝트 선택은 컨테이너 클래스 단위다 — 같은 클래스는 한 번만 실린다', async () => {
    const { sent } = await call({
      tests: [
        { container_class: 'ZCL_FIXTURE', test_class: 'LTCL_A' },
        { container_class: 'zcl_fixture', test_class: 'LTCL_B' },
        { container_class: 'ZCL_OTHER', test_class: 'LTCL_C' },
      ],
    });

    expect(sent[0]?.body).toBe(expectedConfig(['ZCL_FIXTURE', 'ZCL_OTHER']));
    // `objectReferences`(복수, 감싸는 태그)가 부분 일치하지 않게 여는 태그로 센다.
    expect((sent[0]?.body ?? '').match(/<adtcore:objectReference /g)?.length).toBe(2);
  });

  it('scope·risk_level·duration이 옵션 블록의 속성으로 내려간다', async () => {
    const { sent } = await call({
      tests: ONE_TEST,
      scope: { own_tests: false, foreign_tests: true, add_foreign_tests_as_preview: false },
      risk_level: { harmless: true, dangerous: false, critical: false },
      duration: { short: true, medium: false, long: false },
    });

    expect(sent[0]?.body).toBe(
      expectedConfig(['ZCL_FIXTURE'], {
        sameProgram: false,
        assignedTests: true,
        appendAssignedTestsPreview: false,
        harmless: true,
        dangerous: false,
        critical: false,
        short: true,
        medium: false,
        long: false,
      }),
    );
  });

  it('title·context는 받기만 하고 전문에 싣지 않는다 (구 핸들러 실측)', async () => {
    const { sent } = await call({
      tests: ONE_TEST,
      title: 'Fixture run',
      context: 'Fixture context',
    });

    expect(sent[0]?.body).toBe(expectedConfig(['ZCL_FIXTURE']));
    expect(sent[0]?.body).not.toContain('Fixture run');
    expect(sent[0]?.body).not.toContain('Fixture context');
  });
});

describe('응답 — 동기 결과를 run_id 계약으로 다리 놓는다', () => {
  it('success·run_id·message를 들여쓰기 2칸 JSON으로 답한다', async () => {
    const { outcome } = await call({ tests: ONE_TEST });
    const body = jsonOf(outcome);

    expect(body['success']).toBe(true);
    expect(String(body['run_id'])).toMatch(UUID_RE);
    expect(body['message']).toBe(
      `ABAP Unit run started. Use GetUnitTest with run_id ${body['run_id']} to get status and results. ` +
        'Note: the classic ADT endpoint runs all local test classes of each container class — ' +
        'per-test_class sub-selection is not supported by the protocol, so the result may include ' +
        'more test classes than requested.',
    );
    // 구 `return_response({ data: JSON.stringify(body, null, 2) })`.
    expect(outcome.text).toBe(JSON.stringify(body, null, 2));
  });

  it('부를 때마다 새 run_id가 나온다', async () => {
    const first = jsonOf((await call({ tests: ONE_TEST })).outcome);
    const second = jsonOf((await call({ tests: ONE_TEST })).outcome);

    expect(first['run_id']).not.toBe(second['run_id']);
  });
});

describe('갈래 — 요청을 아예 보내지 않는 자리', () => {
  /**
   * `tests`는 채록본에서 필수라, **핸들러에 닿기 전에** 규약 계층의 스키마 검증이
   * 먼저 거부한다. 구도 같은 자리에서 같은 이유로 거부했다(구 서버 역시
   * `required: ['tests']`를 zod로 되돌려 `registerTool`에 넘겼다). 그래서 여기서는
   * 핸들러 문구가 아니라 **요청이 한 발도 나가지 않는다**는 사실만 못 박는다 —
   * 검증 실패 문구는 이 도구의 계약이 아니라 SDK의 것이다.
   */
  it('tests가 없으면 스키마 검증에서 걸리고 요청 0건', async () => {
    const { outcome, paths } = await call({});

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('tests');
    expect(paths).toEqual([]);
  });

  it('tests가 빈 배열이어도 요청 0건', async () => {
    const { outcome, paths } = await call({ tests: [] });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: tests array with at least one entry is required');
    expect(paths).toEqual([]);
  });

  it('항목의 이름이 비면 그 자리 번호와 함께 거부한다', async () => {
    const { outcome, paths } = await call({
      tests: [
        { container_class: 'ZCL_FIXTURE', test_class: 'LTCL_A' },
        { container_class: '  ', test_class: 'LTCL_B' },
      ],
    });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: tests[1] must include non-empty container_class and test_class',
    );
    expect(paths).toEqual([]);
  });
});

describe('갈래 — 응답이 runResult가 아닐 때', () => {
  it('루트가 runResult가 아니면 앞 300자를 실어 던진다', async () => {
    const html = `<html><body>${'x'.repeat(400)}</body></html>`;
    const { outcome } = await call({ tests: ONE_TEST }, html);

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      `Error: ABAP Unit run returned an unexpected response (HTTP 200, no runResult root). ` +
        `First 300 chars: ${html.slice(0, 300)}`,
    );
  });

  it('네임스페이스 접두사가 없는 runResult도 받아들인다', async () => {
    const { outcome } = await call({ tests: ONE_TEST }, '<runResult/>');

    expect(outcome.isError).toBe(false);
    expect(jsonOf(outcome)['success']).toBe(true);
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it('PRD tier에서 실행을 거부한다', async () => {
    const probe = await probeTier(runUnitTest, 'PRD', { tests: ONE_TEST });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.outcome.text).toContain('executes ABAP code on the server');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(runUnitTest, '', { tests: ONE_TEST });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('executes ABAP code on the server');
    expect(probe.connections).toBe(0);
  });

  /**
   * **QA 특례** — 구 가드가 단위시험 실행만 QA에서 통과시킨다
   * (`readonlyGuard.ts:80-84` `UNIT_TEST_EXECUTION_TOOLS` + `:109-112`).
   * 프로파일링 실행(`RuntimeRun*`)에는 이 특례가 **없다**. 여기서 이것을 못 박지
   * 않으면 다음 판이 "실행은 QA에서 전부 막힌다"로 과차단하거나, 반대로 없는
   * 특례를 만들어 안전 바닥선을 낮춘다.
   */
  it('QA tier에서는 지나간다 (구 가드의 단위시험 특례)', async () => {
    const probe = await probeTier(runUnitTest, 'QA', { tests: ONE_TEST });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(runUnitTest, 'DEV', { tests: ONE_TEST });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
