/**
 * `RuntimeRunProgramWithProfiling` — 발행 계약 · 두 발의 와이어 · **tier 게이트**.
 *
 * 이 도구는 SAP에서 프로그램을 실제로 실행한다. 시험은 **실 SAP에 붙지 않는다** —
 * 전송이 주입된 가짜이고, 아래 어느 단언도 실행 요청을 밖으로 내보내지 않는다.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 두 발의 와이어 →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/executors/program/ProgramExecutor.js:28-55`
 *  - tier 판정 → `engine/src/lib/readonlyGuard.ts:86-93, 109-116`
 */

import { runtimeRunProgramWithProfiling } from '../runtimeRunProgramWithProfiling';
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
const RUN_PATH = '/sap/bc/adt/programs/programrun';
const PROFILER_ID = '/sap/bc/adt/runtime/traces/abaptraces/parameters/00FIXTURE00';

/** 첫 요청(파라미터 생성)만 Location을 준다. 두 번째는 실행 응답이다. */
function replies(withLocation: boolean) {
  const headers: Record<string, string> = withLocation ? { location: PROFILER_ID } : {};
  return csrfAware((request) =>
    request.url.includes(PARAMS_PATH)
      ? { status: 201, body: '', headers }
      : { status: 200, body: 'run accepted' },
  );
}

async function call(args: Record<string, unknown>, withLocation = true) {
  const { outcome, requests } = await runTool(
    runtimeRunProgramWithProfiling,
    args,
    replies(withLocation),
  );
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeRunProgramWithProfiling)).toEqual(
      publishedDeclaration('RuntimeRunProgramWithProfiling'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeRunProgramWithProfiling.definition.sets).toEqual(['readonly']);
    expect(runtimeRunProgramWithProfiling.definition.available_in).toEqual(['onprem']);
  });

  it('kind는 execution이고 대상-이름 인자를 선언한다', () => {
    // 구 가드의 RUNTIME_EXECUTION_TOOLS — 단위시험과 달리 QA 예외가 없다.
    expect(runtimeRunProgramWithProfiling.definition.kind).toBe('execution');
    // 녹화 사전 검사가 이 선언을 읽어 SAP 호출 전에 비고객 대상을 막는다.
    expect(runtimeRunProgramWithProfiling.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어 — 두 발이다', () => {
  it('① 파라미터 생성 → ② 프로파일 실행', async () => {
    const { sent } = await call({ program_name: 'zfixture_prog', description: 'Fixture' });

    expect(sent).toHaveLength(2);

    expect(sent[0]?.method).toBe('POST');
    expect(new URL(sent[0]?.url ?? '').pathname).toBe(PARAMS_PATH);
    expect(sent[0]?.headers['Content-Type']).toBe('application/xml');
    expect(sent[0]?.body).toContain('<trc:description value="Fixture"/>');

    const run = new URL(sent[1]?.url ?? '');
    expect(sent[1]?.method).toBe('POST');
    // 이름은 트림 후 대문자다.
    expect(run.pathname).toBe(`${RUN_PATH}/ZFIXTURE_PROG`);
    expect(run.searchParams.get('profilerId')).toBe(PROFILER_ID);
    expect(sent[1]?.headers['Accept']).toBe('text/plain');
    expect(sent[1]?.headers['X-sap-adt-profiling']).toBe('server-time');
  });

  it('네임스페이스 이름은 구처럼 두 번 인코딩된다 (실측 그대로, 개선이 아니다)', async () => {
    const { sent } = await call({ program_name: '/abc/zprog' });

    // encodeURIComponent를 두 번 거치므로 %2F가 %252F가 된다.
    expect(sent[1]?.url).toContain(`${RUN_PATH}/%252FABC%252FZPROG?`);
  });

  it('응답은 실행 상태와 profilerId를 되비춘다 (trace_id는 없다)', async () => {
    const { outcome } = await call({ program_name: 'ZFIXTURE_PROG' });
    const body = jsonOf(outcome);

    expect(body).toEqual({
      success: true,
      program_name: 'ZFIXTURE_PROG',
      profiler_id: PROFILER_ID,
      run_status: 200,
    });
    // 프로그램 실행은 fire-and-forget이라 trace_id를 돌려주지 않는다.
    expect('trace_id' in body).toBe(false);
  });
});

describe('실행 전에 멈추는 갈래', () => {
  it('profilerId를 못 꺼내면 실행 요청을 보내지 않는다', async () => {
    const { outcome, sent } = await call({ program_name: 'ZFIXTURE_PROG' }, false);

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to extract profilerId from trace parameters response',
    );
    // 파라미터 생성 한 발만 나갔다 — 실행은 없었다.
    expect(sent).toHaveLength(1);
    expect(new URL(sent[0]?.url ?? '').pathname).toBe(PARAMS_PATH);
  });

  it('빈 program_name은 요청 자체를 만들지 않는다', async () => {
    const { outcome, sent } = await call({ program_name: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "program_name" is required');
    expect(sent).toHaveLength(0);
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 실행을 거부한다', async (tier) => {
    const probe = await probeTier(runtimeRunProgramWithProfiling, tier, {
      program_name: 'ZFIXTURE_PROG',
    });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.outcome.text).toContain('executes ABAP code on the server');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(runtimeRunProgramWithProfiling, '', {
      program_name: 'ZFIXTURE_PROG',
    });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.outcome.text).toContain('executes ABAP code on the server');
    expect(probe.connections).toBe(0);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(runtimeRunProgramWithProfiling, 'DEV', {
      program_name: 'ZFIXTURE_PROG',
    });

    expect(probe.connections).toBe(1);
    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
  });
});
