/**
 * `RuntimeCreateProfilerTraceParameters` — 발행 계약 · 와이어 · **tier 게이트**.
 *
 * 이 도구는 SAP 상태를 바꾸므로(`POST …/parameters`가 자원을 만든다) 정책 분류가
 * `mutation`이고, tier 게이트가 QA·PRD·미해석에서 **거부**해야 한다. 그 거부를
 * 「거부됐다」로만 확인하면 헛돈다 — 게이트를 들어내도 접속 공장이 던져 `isError`가
 * 참이 되기 때문이다. 그래서 **접속 시도 0회**까지 함께 본다(`support.probeTier`).
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 와이어·본문 XML →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/runtime/traces/profiler.js:31-165`
 *  - tier 판정 → `engine/src/lib/readonlyGuard.ts:35-54, 106-123`
 */

import { runtimeCreateProfilerTraceParameters } from '../runtimeCreateProfilerTraceParameters';
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
const LOCATION = '/sap/bc/adt/runtime/traces/abaptraces/parameters/00FIXTURE00';

async function call(args: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { outcome, requests } = await runTool(
    runtimeCreateProfilerTraceParameters,
    args,
    csrfAware(() => ({ status: 201, body: '', headers })),
  );
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeCreateProfilerTraceParameters)).toEqual(
      publishedDeclaration('RuntimeCreateProfilerTraceParameters'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeCreateProfilerTraceParameters.definition.sets).toEqual(['readonly']);
    expect(runtimeCreateProfilerTraceParameters.definition.available_in).toEqual([
      'onprem',
      'cloud',
    ]);
  });

  it('kind는 mutation이다 — 구 가드가 이 이름을 읽기 목록에서 일부러 뺐다', () => {
    // `engine/src/lib/readonlyGuard.ts:35-54`의 주석: "the bare `Runtime` prefix is
    // deliberately NOT listed so that `RuntimeRun*` / `RuntimeCreate*` fall through
    // to the blocked branch". 그 갈래의 문구는 실행 계열이 아니라 변경 계열이다.
    expect(runtimeCreateProfilerTraceParameters.definition.kind).toBe('mutation');
  });

  it('대상-이름 인자가 없다는 것을 빈 배열로 명시한다', () => {
    // 인자는 설명 문자열과 추적 스위치뿐 — 고객 오브젝트 이름을 받는 자리가 없다.
    expect(runtimeCreateProfilerTraceParameters.definition.targetNames).toEqual([]);
  });
});

describe('와이어', () => {
  it('POST · Accept·Content-Type 모두 application/xml', async () => {
    const { sent, url } = await call({ description: 'Fixture trace' }, { location: LOCATION });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(url?.pathname).toBe(PARAMS_PATH);
    expect(url?.search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe('application/xml');
    expect(sent[0]?.headers['Content-Type']).toBe('application/xml');
  });

  it('description만 주면 본문에 그 한 줄뿐이다 — 기본값은 먹지 않는다', async () => {
    // 구 핸들러가 안 준 스위치까지 키를 명시해 넘기므로, 명시된 undefined가
    // DEFAULT_PROFILER_TRACE_PARAMETERS를 덮어쓴다. 헷갈리기 쉬운 실측이다.
    const { sent } = await call({ description: 'Fixture trace' }, { location: LOCATION });

    expect(sent[0]?.body).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<trc:parameters xmlns:trc="http://www.sap.com/adt/runtime/traces/abaptraces">',
        '  <trc:description value="Fixture trace"/>',
        '</trc:parameters>',
      ].join('\n'),
    );
  });

  it('스위치를 전부 주면 구와 같은 순서로 줄이 선다', async () => {
    const { sent } = await call(
      {
        description: 'Full',
        all_misc_abap_statements: true,
        all_procedural_units: false,
        all_internal_table_events: true,
        all_dynpro_events: false,
        aggregate: true,
        explicit_on_off: false,
        with_rfc_tracing: true,
        all_system_kernel_events: false,
        sql_trace: true,
        all_db_events: false,
        max_size_for_trace_file: 1024.7,
        amdp_trace: true,
        max_time_for_tracing: 60.9,
      },
      { location: LOCATION },
    );

    expect(sent[0]?.body?.split('\n').slice(2, -1)).toEqual([
      '  <trc:allMiscAbapStatements value="true"/>',
      '  <trc:allProceduralUnits value="false"/>',
      '  <trc:allInternalTableEvents value="true"/>',
      '  <trc:allDynproEvents value="false"/>',
      '  <trc:description value="Full"/>',
      '  <trc:aggregate value="true"/>',
      '  <trc:explicitOnOff value="false"/>',
      '  <trc:withRfcTracing value="true"/>',
      '  <trc:allSystemKernelEvents value="false"/>',
      '  <trc:sqlTrace value="true"/>',
      '  <trc:allDbEvents value="false"/>',
      // 숫자는 Math.trunc로 잘린다.
      '  <trc:maxSizeForTraceFile value="1024"/>',
      '  <trc:amdpTrace value="true"/>',
      '  <trc:maxTimeForTracing value="60"/>',
    ]);
  });

  it('description의 XML 특수문자를 이스케이프한다', async () => {
    const { sent } = await call({ description: 'a&b "c" <d>' }, { location: LOCATION });

    expect(sent[0]?.body).toContain(
      '<trc:description value="a&amp;b &quot;c&quot; &lt;d&gt;"/>',
    );
  });
});

describe('profiler_id 추출', () => {
  it('location 헤더의 경로를 그대로 쓴다', async () => {
    const { outcome } = await call({ description: 'x' }, { location: LOCATION });

    expect(jsonOf(outcome)['profiler_id']).toBe(LOCATION);
  });

  it('content-location도 본다', async () => {
    const { outcome } = await call({ description: 'x' }, { 'content-location': LOCATION });

    expect(jsonOf(outcome)['profiler_id']).toBe(LOCATION);
  });

  it('절대 URL이면 경로+질의만 남긴다', async () => {
    const { outcome } = await call(
      { description: 'x' },
      { location: `https://sap.invalid${LOCATION}?a=1` },
    );

    expect(jsonOf(outcome)['profiler_id']).toBe(`${LOCATION}?a=1`);
  });

  it('헤더가 없으면 키가 아예 빠진다 (구도 undefined를 넣어 같은 결과)', async () => {
    const { outcome } = await call({ description: 'x' });
    const body = jsonOf(outcome);

    expect('profiler_id' in body).toBe(false);
    expect(body['success']).toBe(true);
    expect(body['status']).toBe(201);
  });
});

describe('인자 방어', () => {
  it('빈 description은 요청 전에 거절한다', async () => {
    const { outcome, sent } = await call({ description: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "description" is required');
    expect(sent).toHaveLength(0);
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 거부한다', async (tier) => {
    const probe = await probeTier(runtimeCreateProfilerTraceParameters, tier, {
      description: 'blocked',
    });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.outcome.text).toContain('mutates SAP objects');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(runtimeCreateProfilerTraceParameters, '', {
      description: 'blocked',
    });

    expect(probe.outcome.isError).toBe(true);
    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    // 문구까지 본다. `ERR_READONLY_TIER`만 보면 kind를 read로 잘못 달아도 이름
    // 교차검사가 대신 막아 주어 이 체크가 조용히 통과한다(사보타주로 실증).
    expect(probe.outcome.text).toContain('mutates SAP objects');
    expect(probe.connections).toBe(0);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(runtimeCreateProfilerTraceParameters, 'DEV', {
      description: 'allowed',
    });

    expect(probe.connections).toBe(1);
    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
  });
});
