/**
 * `RuntimeAnalyzeProfilerTrace` — 발행 계약 · 뷰 셋의 와이어 · 요약기.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 뷰별 분기와 **statements에도 withSystemEvents만 넘기는 것** →
 *    `engine/src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts:136-153`
 *  - 요약기의 후보 선별·순위·압축 → 같은 파일 `:43-121`
 */

import { pickTopEntries, runtimeAnalyzeProfilerTrace } from '../runtimeAnalyzeProfilerTrace';
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
  const { outcome, requests } = await runTool(runtimeAnalyzeProfilerTrace, args, () => ({
    status: 200,
    body,
  }));
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeAnalyzeProfilerTrace)).toEqual(
      publishedDeclaration('RuntimeAnalyzeProfilerTrace'),
    );
  });

  it('view에는 default가 있고 description은 없다 (구 선언 그대로)', async () => {
    const published = (await publishedOf(runtimeAnalyzeProfilerTrace)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(published.properties['view']).toEqual({
      default: 'hitlist',
      type: 'string',
      enum: ['hitlist', 'statements', 'db_accesses'],
    });
    // top의 기본값 10은 **핸들러 코드**에만 있고 발행 스키마에는 없다.
    expect(published.properties['top']).toEqual({
      description: 'Number of top rows for summary. Default: 10.',
      type: 'number',
    });
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeAnalyzeProfilerTrace.definition.sets).toEqual(['readonly']);
    expect(runtimeAnalyzeProfilerTrace.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(runtimeAnalyzeProfilerTrace.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('view를 안 주면 hitlist로 나간다', async () => {
    const { sent, url } = await call({ trace_id_or_uri: TRACE_ID });

    expect(sent).toHaveLength(1);
    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/hitlist`);
    expect(sent[0]?.headers['Accept']).toBe('application/xml');
  });

  it('statements 뷰에는 withSystemEvents만 실린다 — 구가 그렇게 좁혔다', async () => {
    const { url } = await call({
      trace_id_or_uri: TRACE_ID,
      view: 'statements',
      with_system_events: true,
    });

    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/statements`);
    expect([...(url?.searchParams.keys() ?? [])]).toEqual(['withSystemEvents']);
  });

  it('db_accesses 뷰', async () => {
    const { url } = await call({ trace_id_or_uri: TRACE_ID, view: 'db_accesses' });

    expect(url?.pathname).toBe(`${BASE}/${TRACE_ID}/dbAccesses`);
  });

  it('빈 trace_id_or_uri는 요청 전에 거절한다', async () => {
    const { outcome, sent } = await call({ trace_id_or_uri: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "trace_id_or_uri" is required');
    expect(sent).toHaveLength(0);
  });
});

describe('요약기 (pickTopEntries)', () => {
  const rows = {
    rows: [
      { name: 'C', grossTime: 5, nested: { note: 'x' } },
      { name: 'A', grossTime: 30 },
      { name: 'B', grossTime: 12 },
      { name: 'no-number' },
    ],
  };

  it('숫자를 하나라도 가진 객체만 후보 줄이다', () => {
    const summary = pickTopEntries(rows, 10);

    // 바깥 `rows` 객체와 `no-number`·`nested`는 숫자가 없어 빠진다.
    expect(summary.total_records).toBe(3);
  });

  it('순위 키의 첫 값으로 내림차순 정렬한다', () => {
    const summary = pickTopEntries(rows, 10);

    expect(summary.top_records.map((row) => row['name'])).toEqual(['A', 'B', 'C']);
  });

  it('스칼라 필드만 남긴다', () => {
    const summary = pickTopEntries(rows, 10);

    expect(summary.top_records[0]).toEqual({ name: 'A', grossTime: 30 });
    expect(summary.top_records[2]).toEqual({ name: 'C', grossTime: 5 });
  });

  it('total_records는 잘라 낸 뒤가 아니라 후보 전체의 수다', () => {
    const summary = pickTopEntries(rows, 1);

    expect(summary.total_records).toBe(3);
    expect(summary.top_records).toHaveLength(1);
  });

  it('top의 하한은 1이다 — 0을 줘도 한 줄은 나온다', () => {
    expect(pickTopEntries(rows, 0).top_records).toHaveLength(1);
  });

  it('순위 키가 없으면 0점이라 원래 순서가 유지된다', () => {
    const summary = pickTopEntries({ rows: [{ name: 'first', other: 9 }, { name: 'second', other: 99 }] }, 10);

    expect(summary.top_records.map((row) => row['name'])).toEqual(['first', 'second']);
  });
});

describe('응답', () => {
  it('요약과 payload를 함께 싣는다', async () => {
    const { outcome } = await call(
      { trace_id_or_uri: TRACE_ID, top: 1 },
      '<hitlist><row><name>ZFIX</name><grossTime>7</grossTime></row></hitlist>',
    );
    const body = jsonOf(outcome);

    expect(body['success']).toBe(true);
    expect(body['view']).toBe('hitlist');
    expect(body['summary']).toEqual({
      total_records: 1,
      top_records: [{ name: 'ZFIX', grossTime: 7 }],
    });
    expect(body['payload']).toBeDefined();
  });
});
