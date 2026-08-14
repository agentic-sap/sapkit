/**
 * `RuntimeGetProfilerTraceData` — 발행 계약 · 뷰 세 갈래의 와이어 · 트레이스 ID 정규화.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 경로·질의 인자·`Accept` →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/runtime/traces/profiler.js:54-84, 201-277`
 *  - 뷰별 분기와 응답 표 →
 *    `engine/src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts:53-108`
 */

import { runtimeGetProfilerTraceData } from '../runtimeGetProfilerTraceData';
import {
  cleanupTempDirs,
  jsonOf,
  publishedDeclaration,
  publishedOf,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const TRACE_ID = 'ABCDEF0123456789AA';
const BASE = '/sap/bc/adt/runtime/traces/abaptraces';

async function call(args: Record<string, unknown>, body = '<hitlist/>') {
  const { outcome, requests } = await runTool(runtimeGetProfilerTraceData, args, () => ({
    status: 200,
    body,
  }));
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeGetProfilerTraceData)).toEqual(
      publishedDeclaration('RuntimeGetProfilerTraceData'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeGetProfilerTraceData.definition.sets).toEqual(['readonly']);
    expect(runtimeGetProfilerTraceData.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(runtimeGetProfilerTraceData.definition.kind).toBe('read');
  });
});

describe('와이어 — 뷰 셋', () => {
  it('hitlist', async () => {
    const { sent, url } = await call({ trace_id_or_uri: TRACE_ID, view: 'hitlist' });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/hitlist`);
    expect(url?.search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe('application/xml');
  });

  it('statements — Accept가 aggcalltree로 갈린다', async () => {
    const { sent, url } = await call({ trace_id_or_uri: TRACE_ID, view: 'statements' });

    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/statements`);
    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.runtime.traces.abaptraces.aggcalltree+xml, application/xml',
    );
  });

  it('db_accesses', async () => {
    const { sent, url } = await call({ trace_id_or_uri: TRACE_ID, view: 'db_accesses' });

    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/dbAccesses`);
    expect(sent[0]?.headers['Accept']).toBe('application/xml');
  });
});

describe('질의 인자', () => {
  it('with_system_events는 문자열 불리언으로 실린다', async () => {
    const { url } = await call({
      trace_id_or_uri: TRACE_ID,
      view: 'hitlist',
      with_system_events: false,
    });

    expect(url?.searchParams.get('withSystemEvents')).toBe('false');
  });

  it('statements 전용 인자는 구와 같은 이름·순서로 실린다', async () => {
    const { url } = await call({
      trace_id_or_uri: TRACE_ID,
      view: 'statements',
      id: 7.9,
      with_details: true,
      auto_drill_down_threshold: 12.4,
      with_system_events: true,
    });

    expect([...(url?.searchParams.keys() ?? [])]).toEqual([
      'id',
      'withDetails',
      'autoDrillDownThreshold',
      'withSystemEvents',
    ]);
    // 구는 Math.trunc로 자른다.
    expect(url?.searchParams.get('id')).toBe('7');
    expect(url?.searchParams.get('autoDrillDownThreshold')).toBe('12');
  });

  it('statements 전용 인자는 다른 뷰에서 무시된다', async () => {
    const { url } = await call({
      trace_id_or_uri: TRACE_ID,
      view: 'hitlist',
      id: 7,
      with_details: true,
      auto_drill_down_threshold: 12,
    });

    expect(url?.search).toBe('');
  });
});

describe('트레이스 ID 정규화', () => {
  it('전체 URI를 주면 ID 조각만 뽑아 경로에 넣는다', async () => {
    const { url } = await call({
      trace_id_or_uri: `${BASE}/${TRACE_ID}/hitlist?withSystemEvents=true`,
      view: 'hitlist',
    });

    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/hitlist`);
  });

  it('뿌리 경로가 없는 값은 트림해서 그대로 쓴다', async () => {
    const { url } = await call({ trace_id_or_uri: `  ${TRACE_ID}  `, view: 'hitlist' });

    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/hitlist`);
  });

  it('빈 값은 요청 전에 거절한다', async () => {
    const { outcome, sent } = await call({ trace_id_or_uri: '', view: 'hitlist' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "trace_id_or_uri" is required');
    expect(sent).toHaveLength(0);
  });
});

describe('응답', () => {
  it('view와 원본 인자를 되비추고 payload를 접어 싣는다', async () => {
    const { outcome } = await call(
      { trace_id_or_uri: TRACE_ID, view: 'hitlist' },
      '<hitlist><row name="ZFIXTURE" grossTime="10"/></hitlist>',
    );
    const body = jsonOf(outcome);

    expect(body['success']).toBe(true);
    expect(body['view']).toBe('hitlist');
    expect(body['trace_id_or_uri']).toBe(TRACE_ID);
    // 구 파서는 태그 값만 숫자로 바꾸고 **속성 값은 문자열로 둔다**
    // (`parseTagValue` 기본 참 · `parseAttributeValue` 기본 거짓). 요약기의
    // 순위 키가 숫자만 보므로 이 차이가 실제로 결과를 가른다.
    expect(body['payload']).toEqual({
      hitlist: { row: { name: 'ZFIXTURE', grossTime: '10' } },
    });
  });
});
