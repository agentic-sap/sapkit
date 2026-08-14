/**
 * `RuntimeListSystemMessages` — 발행 계약 · 와이어 · Atom 파싱 · 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 주소·사용자 속성 `user`
 *    → `engine/src/handlers/system/readonly/handleRuntimeListSystemMessages.ts:52-62`
 *  - 질의 조립(`$query` → `$top` → `from` → `to`)
 *    → `engine/src/handlers/system/readonly/runtimeFeedsHelper.ts:273-315`
 *  - 파싱 폴백 사슬 → 같은 파일 `:354-375`
 *  - 응답 모양(들여쓰기 2칸) → 겉 핸들러 `:65-79`
 *
 * 픽스처는 전부 가짜다 — 실제 시스템 정보를 담지 않는다.
 */

import { runtimeListSystemMessages } from '../runtimeListSystemMessages';
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

const SYSTEMMESSAGES = '/sap/bc/adt/runtime/systemmessages';

const feed = (...entries: string[]): string => `<feed>${entries.join('')}</feed>`;

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeListSystemMessages)).toEqual(
      publishedDeclaration('RuntimeListSystemMessages'),
    );
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    // `handlers/system/readonly/` — 이름이 `Runtime*`이지만 접두사가 `List`라
    // 읽기다. 채록본의 네 노출 조건 전부에 뜬다.
    expect(runtimeListSystemMessages.definition.sets).toEqual(['readonly']);
    expect(runtimeListSystemMessages.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(runtimeListSystemMessages.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('systemmessages로 GET 한 발 — Accept는 Atom 피드다', async () => {
    const { requests } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed(),
    }));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toContain(SYSTEMMESSAGES);
    expect(sent[0]?.headers['Accept']).toBe('application/atom+xml;type=feed');
    expect(sent[0]?.body).toBeUndefined();
  });

  it('아무 인자도 안 주면 질의 인자가 붙지 않는다', async () => {
    const { requests } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed(),
    }));

    expect(toolRequests(requests)[0]?.url).not.toContain('?');
  });

  it('사용자 속성이 **`user`**다 (Gateway 피드의 `username`이 아니다)', async () => {
    const { requests } = await runTool(
      runtimeListSystemMessages,
      { user: '  FIXTUSER  ' },
      () => ({ status: 200, body: feed() }),
    );
    const url = toolRequests(requests)[0]?.url ?? '';

    // 괄호 안쪽 공백까지 구 그대로다 — SAP이 파싱하는 식이라 공백이 계약이다.
    // 값은 트림된다(`runtimeFeedsHelper.ts:280`).
    expect(decodeURIComponent(url)).toContain('$query=and ( equals ( user , FIXTUSER ) )');
  });

  it('인자 순서가 `$query` → `$top` → `from` → `to`다', async () => {
    const { requests } = await runTool(
      runtimeListSystemMessages,
      { user: 'U', max_results: 5, from: '20260101000000', to: '20260102000000' },
      () => ({ status: 200, body: feed() }),
    );
    const query = (toolRequests(requests)[0]?.url ?? '').split('?')[1] ?? '';

    expect(query.split('&').map((pair) => pair.split('=')[0])).toEqual([
      '%24query',
      '%24top',
      'from',
      'to',
    ]);
  });

  it('max_results가 0이면 falsy라 실리지 않는다 (구의 검사)', async () => {
    const { requests } = await runTool(runtimeListSystemMessages, { max_results: 0 }, () => ({
      status: 200,
      body: feed(),
    }));

    expect(toolRequests(requests)[0]?.url).not.toContain('top');
  });
});

describe('Atom 파싱', () => {
  it('일곱 칸을 채우고 count를 함께 싣는다', async () => {
    const { outcome } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed(
        [
          '<entry>',
          '<id>SM02/0001</id>',
          '<title>계획 정지</title>',
          '<content>토요일 02:00~04:00</content>',
          '<severity>W</severity>',
          '<validFrom>20260110020000</validFrom>',
          '<validTo>20260110040000</validTo>',
          '<updated>20260101000000</updated>',
          '<author><name>FIXTUSER</name></author>',
          '</entry>',
        ].join(''),
      ),
    }));

    expect(jsonOf(outcome)).toEqual({
      success: true,
      count: 1,
      messages: [
        {
          id: 'SM02/0001',
          title: '계획 정지',
          text: '토요일 02:00~04:00',
          severity: 'W',
          validFrom: '20260110020000',
          validTo: '20260110040000',
          createdBy: 'FIXTUSER',
        },
      ],
    });
  });

  it('severity가 없으면 category/@term이, validFrom이 없으면 updated가 대신 온다', async () => {
    const { outcome } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed(
        [
          '<entry>',
          '<id>SM02/0002</id>',
          '<title>알림</title>',
          '<category term="I"/>',
          '<updated>20260201000000</updated>',
          '</entry>',
        ].join(''),
      ),
    }));
    const payload = jsonOf(outcome) as { messages: Array<Record<string, unknown>> };

    expect(payload.messages[0]?.['severity']).toBe('I');
    expect(payload.messages[0]?.['validFrom']).toBe('20260201000000');
    expect(payload.messages[0]?.['validTo']).toBe('');
    expect(payload.messages[0]?.['createdBy']).toBe('');
  });

  it('항목이 하나면 파서가 객체를 주는데 그 갈래도 배열로 접는다', async () => {
    const { outcome } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed('<entry><id>ONE</id><title>T</title></entry>'),
    }));

    expect((jsonOf(outcome) as { count: number }).count).toBe(1);
  });

  it('entry가 없으면 빈 목록이다 (오류가 아니다)', async () => {
    const { outcome } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed(),
    }));

    expect(outcome.isError).toBe(false);
    expect(jsonOf(outcome)).toEqual({ success: true, count: 0, messages: [] });
  });

  it('응답은 들여쓰기 2칸이다', async () => {
    const { outcome } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 200,
      body: feed(),
    }));

    expect(outcome.text).toContain('\n  "success": true');
  });
});

describe('갈래', () => {
  it('ADT가 거절하면 `Error: ` 접두사를 단 오류로 접는다', async () => {
    const { outcome } = await runTool(runtimeListSystemMessages, {}, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
