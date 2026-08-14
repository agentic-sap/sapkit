/**
 * `RuntimeAnalyzeDump` — 발행 계약 · 와이어 · 요약이 언제나 붙는 것 · payload 배제.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json` (구 핸들러의 JSON Schema가
 *    아니다 — 모듈 머리주석의 `include_payload` 절 참조)
 *  - 요약기 → `engine/src/handlers/system/readonly/handleRuntimeAnalyzeDump.ts:41-98`
 *  - 응답 조립 → 같은 파일 `:100-142`
 */

import { runtimeAnalyzeDump } from '../runtimeAnalyzeDump';
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

const DUMP_ID = '00001111222233334444555566667777';
const DUMP_XML =
  '<dump><title>Fixture dump</title><program>ZFIXTURE_PROG</program>' +
  '<nested><user>FIXTUSER</user><client>100</client></nested></dump>';

async function call(args: Record<string, unknown>, body = DUMP_XML) {
  const { outcome, requests } = await runTool(runtimeAnalyzeDump, args, () => ({
    status: 200,
    body,
  }));
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeAnalyzeDump)).toEqual(publishedDeclaration('RuntimeAnalyzeDump'));
  });

  it('include_payload에 default를 달지 않는다 — 구 발행 선언에 없다', async () => {
    // 구 핸들러의 JSON Schema에는 `default: true`가 있지만 구 서버의 zod 변환을
    // 거친 **발행 선언**에는 남지 않았다. 판정 기준은 발행된 쪽이다.
    const published = (await publishedOf(runtimeAnalyzeDump)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(published.properties['include_payload']).toEqual({
      description: 'Include full parsed payload in response.',
      type: 'boolean',
    });
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeAnalyzeDump.definition.sets).toEqual(['readonly']);
    expect(runtimeAnalyzeDump.definition.available_in).toEqual(['onprem', 'cloud']);
    // `RuntimeAnalyze`는 구 tier 가드의 읽기 접두사다.
    expect(runtimeAnalyzeDump.definition.kind).toBe('read');
  });
});

describe('와이어 — RuntimeGetDumpById와 같은 한 발이다', () => {
  it('default 뷰로 덤프 상세를 GET 한다', async () => {
    const { sent, url } = await call({ dump_id: DUMP_ID });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url?.pathname).toBe(`/sap/bc/adt/runtime/dump/${DUMP_ID}`);
    expect(sent[0]?.headers['Accept']).toBe('application/vnd.sap.adt.runtime.dump.v1+xml');
  });

  it('view 인자가 경로 접미사를 바꾼다', async () => {
    const { url } = await call({ dump_id: DUMP_ID, view: 'formatted' }, 'plain');

    expect(url?.pathname).toBe(`/sap/bc/adt/runtime/dump/${DUMP_ID}/formatted`);
  });
});

describe('요약', () => {
  it('요청하지 않아도 언제나 붙고, 중첩된 값까지 긁어온다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID });
    const body = jsonOf(outcome);

    expect(body['success']).toBe(true);
    expect(body['view']).toBe('default');
    expect(body['summary']).toEqual({
      title: 'Fixture dump',
      program: 'ZFIXTURE_PROG',
      user: 'FIXTUSER',
      client: 100,
    });
  });

  it('include_payload를 안 주면 payload가 실린다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID });

    expect(jsonOf(outcome)['payload']).toBeDefined();
  });

  it('include_payload:true도 payload가 실린다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID, include_payload: true });

    expect(jsonOf(outcome)['payload']).toBeDefined();
  });

  it('include_payload:false일 때만 payload 키가 사라진다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID, include_payload: false });
    const body = jsonOf(outcome);

    expect('payload' in body).toBe(false);
    expect(body['summary']).toBeDefined();
  });
});

describe('인자 방어', () => {
  it('빈 dump_id는 요청 전에 거절한다', async () => {
    const { outcome, sent } = await call({ dump_id: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "dump_id" is required');
    expect(sent).toHaveLength(0);
  });
});
