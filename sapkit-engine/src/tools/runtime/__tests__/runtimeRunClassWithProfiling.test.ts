/**
 * `RuntimeRunClassWithProfiling` — 발행 계약 · 네 발까지 가는 와이어 · **tier 게이트**.
 *
 * 이 도구는 SAP에서 클래스를 실제로 실행한다. 시험은 **실 SAP에 붙지 않는다** —
 * 전송이 주입된 가짜다.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 실행·트레이스 되찾기 →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/executors/class/ClassExecutor.js:30-124`
 *  - 트레이스 ID 정규식 → 같은 패키지 `dist/runtime/traces/profiler.js:166-192`
 *  - tier 판정 → `engine/src/lib/readonlyGuard.ts:86-93, 109-116`
 */

import { runtimeRunClassWithProfiling } from '../runtimeRunClassWithProfiling';
import {
  cleanupTempDirs,
  csrfAware,
  jsonOf,
  probeTier,
  publishedDeclaration,
  publishedOf,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const PARAMS_PATH = '/sap/bc/adt/runtime/traces/abaptraces/parameters';
const REQUESTS_PATH = '/sap/bc/adt/runtime/traces/abaptraces/requests';
const TRACES_PATH = '/sap/bc/adt/runtime/traces/abaptraces';
const CLASS_RUN = '/sap/bc/adt/oo/classrun';
const PROFILER_ID = '/sap/bc/adt/runtime/traces/abaptraces/parameters/00FIXTURE00';
const TRACE_ID = 'ABCDEF0123456789AA';

/** 트레이스 ID를 담은 응답 본문 — 정규식이 16자 이상 영숫자만 인정한다. */
const TRACE_BODY = `<traces><trace href="${TRACES_PATH}/${TRACE_ID}"/></traces>`;
const EMPTY_TRACES = '<traces/>';

interface Scenario {
  /** 트레이스 조회(`?uri=`) 응답들. 순서대로 소비된다. */
  readonly byUri?: readonly string[];
  /** `…/requests` 목록 응답. */
  readonly requestsList?: string;
  /** `…/abaptraces` 목록 응답. */
  readonly filesList?: string;
  readonly withLocation?: boolean;
}

function replies(scenario: Scenario) {
  let byUriIndex = 0;
  return csrfAware((request) => {
    const url = new URL(request.url);
    if (url.pathname === PARAMS_PATH) {
      return {
        status: 201,
        body: '',
        headers: scenario.withLocation === false ? {} : { location: PROFILER_ID },
      };
    }
    if (url.pathname.startsWith(CLASS_RUN)) return { status: 200, body: 'run accepted' };
    if (url.pathname === REQUESTS_PATH && url.searchParams.has('uri')) {
      const body = scenario.byUri?.[byUriIndex] ?? EMPTY_TRACES;
      byUriIndex += 1;
      return { status: 200, body };
    }
    if (url.pathname === REQUESTS_PATH) {
      return { status: 200, body: scenario.requestsList ?? EMPTY_TRACES };
    }
    if (url.pathname === TRACES_PATH) {
      return { status: 200, body: scenario.filesList ?? EMPTY_TRACES };
    }
    return { status: 404, body: 'unexpected' };
  });
}

async function call(args: Record<string, unknown>, scenario: Scenario = {}) {
  const { outcome, requests } = await runTool(
    runtimeRunClassWithProfiling,
    args,
    replies(scenario),
  );
  const sent = toolRequests(requests);
  return { outcome, sent, paths: sent.map((entry) => new URL(entry.url).pathname) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeRunClassWithProfiling)).toEqual(
      publishedDeclaration('RuntimeRunClassWithProfiling'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeRunClassWithProfiling.definition.sets).toEqual(['readonly']);
    // 프로그램판과 달리 cloud 축에도 있다 — 구 선언 그대로다.
    expect(runtimeRunClassWithProfiling.definition.available_in).toEqual(['onprem', 'cloud']);
  });

  it('kind는 execution이고 대상-이름 인자를 선언한다', () => {
    expect(runtimeRunClassWithProfiling.definition.kind).toBe('execution');
    expect(runtimeRunClassWithProfiling.definition.targetNames).toEqual(['class_name']);
  });
});

describe('와이어', () => {
  it('파라미터 생성 → 실행 → 트레이스 되찾기', async () => {
    const { sent, paths } = await call(
      { class_name: ' zcl_fixture ', description: 'Fixture' },
      { byUri: [TRACE_BODY] },
    );

    expect(paths).toEqual([PARAMS_PATH, `${CLASS_RUN}/ZCL_FIXTURE`, REQUESTS_PATH]);

    const run = new URL(sent[1]?.url ?? '');
    expect(sent[1]?.method).toBe('POST');
    expect(run.searchParams.get('profilerId')).toBe(PROFILER_ID);
    expect(sent[1]?.headers['Accept']).toBe('text/plain');
    expect(sent[1]?.headers['X-sap-adt-profiling']).toBe('server-time');

    const lookup = new URL(sent[2]?.url ?? '');
    expect(sent[2]?.method).toBe('GET');
    expect(lookup.searchParams.get('uri')).toBe(`${CLASS_RUN}/ZCL_FIXTURE`);
    expect(sent[2]?.headers['Accept']).toBe('application/atom+xml;type=feed');
  });

  it('클래스 이름은 인코딩하지 않는다 — 프로그램판과 대칭이 아니지만 실측이 그렇다', async () => {
    const { sent } = await call({ class_name: '/abc/zcl_fix' }, { byUri: [TRACE_BODY] });

    expect(sent[1]?.url).toContain(`${CLASS_RUN}//ABC/ZCL_FIX?`);
  });

  it('응답에 traceId와 트레이스 조회 상태가 함께 실린다', async () => {
    const { outcome } = await call({ class_name: 'ZCL_FIXTURE' }, { byUri: [TRACE_BODY] });

    expect(jsonOf(outcome)).toEqual({
      success: true,
      class_name: 'ZCL_FIXTURE',
      profiler_id: PROFILER_ID,
      trace_id: TRACE_ID,
      run_status: 200,
      trace_requests_status: 200,
    });
  });
});

describe('트레이스 되찾기의 폴백 사다리', () => {
  it('첫 후보가 비면 같은 후보를 한 번 더 묻는다 (구의 중복 후보 그대로)', async () => {
    // 후보 URI 둘은 평범한 대문자 Z 이름에서 같은 값이다.
    const { paths } = await call(
      { class_name: 'ZCL_FIXTURE' },
      { byUri: [EMPTY_TRACES, TRACE_BODY] },
    );

    expect(paths).toEqual([
      PARAMS_PATH,
      `${CLASS_RUN}/ZCL_FIXTURE`,
      REQUESTS_PATH,
      REQUESTS_PATH,
    ]);
  });

  it('후보 둘이 다 비면 requests 목록으로 물러난다', async () => {
    const { outcome, paths } = await call(
      { class_name: 'ZCL_FIXTURE' },
      { byUri: [EMPTY_TRACES, EMPTY_TRACES], requestsList: TRACE_BODY },
    );

    expect(paths).toEqual([
      PARAMS_PATH,
      `${CLASS_RUN}/ZCL_FIXTURE`,
      REQUESTS_PATH,
      REQUESTS_PATH,
      REQUESTS_PATH,
    ]);
    expect(jsonOf(outcome)['trace_id']).toBe(TRACE_ID);
  });

  it('그것도 비면 트레이스 파일 목록까지 본다', async () => {
    const { outcome, paths } = await call(
      { class_name: 'ZCL_FIXTURE' },
      { byUri: [EMPTY_TRACES, EMPTY_TRACES], filesList: TRACE_BODY },
    );

    expect(paths[paths.length - 1]).toBe(TRACES_PATH);
    expect(jsonOf(outcome)['trace_id']).toBe(TRACE_ID);
  });

  it('세 갈래가 전부 비면 구와 같은 문구로 던진다', async () => {
    const { outcome } = await call({ class_name: 'ZCL_FIXTURE' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to resolve traceId after profiled execution for class ZCL_FIXTURE',
    );
  });
});

describe('실행 전에 멈추는 갈래', () => {
  it('profilerId를 못 꺼내면 실행 요청을 보내지 않는다', async () => {
    const { outcome, paths } = await call({ class_name: 'ZCL_FIXTURE' }, { withLocation: false });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to extract profilerId from trace parameters response',
    );
    expect(paths).toEqual([PARAMS_PATH]);
  });

  it('빈 class_name은 요청 자체를 만들지 않는다', async () => {
    const { outcome, paths } = await call({ class_name: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "class_name" is required');
    expect(paths).toEqual([]);
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 실행을 거부한다', async (tier) => {
    const probe = await probeTier(runtimeRunClassWithProfiling, tier, {
      class_name: 'ZCL_FIXTURE',
    });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.outcome.text).toContain('executes ABAP code on the server');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(runtimeRunClassWithProfiling, '', {
      class_name: 'ZCL_FIXTURE',
    });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('executes ABAP code on the server');
    expect(probe.connections).toBe(0);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(runtimeRunClassWithProfiling, 'DEV', {
      class_name: 'ZCL_FIXTURE',
    });

    expect(probe.connections).toBe(1);
    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
  });
});
