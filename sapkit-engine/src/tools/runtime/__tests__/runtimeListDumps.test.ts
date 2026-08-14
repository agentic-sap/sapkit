/**
 * `RuntimeListDumps` — 발행 계약 · 와이어 · 질의 조립 · 갈래.
 *
 * 기대값의 출처는 전부 구 엔진 실측이다:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 경로·질의 인자·`Accept` →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/runtime/dumps/read.js:26-73`
 *  - 응답 표 → `engine/src/handlers/system/readonly/handleRuntimeListDumps.ts:73-88`
 *
 * SAP에 붙지 않는다 — 전송은 주입된 가짜다.
 */

import { runtimeListDumps } from '../runtimeListDumps';
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

const FEED = '<feed><entry><id>dump/1</id></entry></feed>';

async function call(args: Record<string, unknown>, body = FEED) {
  const { outcome, requests } = await runTool(runtimeListDumps, args, () => ({
    status: 200,
    body,
  }));
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeListDumps)).toEqual(publishedDeclaration('RuntimeListDumps'));
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/system/readonly/` → readonly 집합.
    expect(runtimeListDumps.definition.sets).toEqual(['readonly']);
    expect(runtimeListDumps.definition.available_in).toEqual(['onprem', 'cloud']);
    // `RuntimeList` 접두사는 구 tier 가드의 읽기 목록에 있다
    // (`engine/src/lib/readonlyGuard.ts:42-54`).
    expect(runtimeListDumps.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('인자가 없으면 질의 없이 피드 경로를 GET 한다', async () => {
    const { sent, url } = await call({});

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url?.pathname).toBe('/sap/bc/adt/runtime/dumps');
    expect(url?.search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe('application/atom+xml;type=feed');
    expect(sent[0]?.body).toBeUndefined();
  });

  it('user는 $query 식으로 옮겨진다 — 괄호 안쪽 공백까지 구 문자열 그대로', async () => {
    const { url, outcome } = await call({ user: '  CB9980000423  ' });

    expect(url?.searchParams.get('$query')).toBe('and( equals( user, CB9980000423 ) )');
    // 응답의 user_filter는 **트림 전 원문**이다 (구 `user || null`).
    expect(jsonOf(outcome)['user_filter']).toBe('  CB9980000423  ');
  });

  it('페이징 인자는 구와 같은 이름·같은 순서로 실린다', async () => {
    const { url } = await call({
      user: 'DEVUSER',
      inlinecount: 'allpages',
      top: 25,
      skip: 5,
      orderby: 'updated desc',
    });

    expect([...(url?.searchParams.keys() ?? [])]).toEqual([
      '$query',
      '$inlinecount',
      '$top',
      '$skip',
      '$orderby',
    ]);
    expect(url?.searchParams.get('$inlinecount')).toBe('allpages');
    expect(url?.searchParams.get('$top')).toBe('25');
    expect(url?.searchParams.get('$skip')).toBe('5');
    expect(url?.searchParams.get('$orderby')).toBe('updated desc');
  });

  it('빈 문자열 user는 필터가 아니다 (구 falsy 검사)', async () => {
    const { url, outcome } = await call({ user: '' });

    expect(url?.search).toBe('');
    expect(jsonOf(outcome)['user_filter']).toBeNull();
  });

  it('공백뿐인 user는 필터를 만들지 않는다 (buildRuntimeDumpsUserQuery의 트림)', async () => {
    const { url } = await call({ user: '   ' });

    expect(url?.searchParams.has('$query')).toBe(false);
  });
});

describe('응답', () => {
  it('XML 본문을 JSON으로 접어 payload에 싣는다', async () => {
    const { outcome } = await call({});
    const body = jsonOf(outcome);

    expect(outcome.isError).toBe(false);
    expect(body['success']).toBe(true);
    expect(body['status']).toBe(200);
    expect(body['payload']).toEqual({ feed: { entry: { id: 'dump/1' } } });
  });

  it('XML이 아닌 본문은 그대로 payload가 된다', async () => {
    const { outcome } = await call({}, 'not xml');

    expect(jsonOf(outcome)['payload']).toBe('not xml');
  });

  it('들여쓰기 2칸으로 직렬화한다 (구 return_response 계약)', async () => {
    const { outcome } = await call({});

    expect(outcome.text.split('\n')[1]).toMatch(/^ {2}"success": true,$/);
  });
});

describe('갈래', () => {
  it('SAP이 오류를 주면 Error: 접두사가 붙은 실패로 접힌다', async () => {
    const { outcome } = await runTool(runtimeListDumps, {}, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
