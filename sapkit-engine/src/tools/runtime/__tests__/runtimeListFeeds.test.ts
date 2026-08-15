/**
 * `RuntimeListFeeds` — 발행 계약 · **다섯 갈래의 와이어** · 파서 짝짓기 · 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 다섯 갈래의 주소·파서 짝
 *    → `engine/src/handlers/system/readonly/handleRuntimeListFeeds.ts:93-150`
 *  - 앞의 둘에 질의 인자가 안 붙는 이유 → 같은 파일 `:95-116`
 *    (`fetchFeed`가 아니라 `makeAdtRequestWithTimeout`을 직접 부른다)
 *  - 사용자 속성이 피드마다 다른 것 → 같은 파일 `:125`·`:135`·`:145`
 *  - 파서 넷 → `engine/src/handlers/system/readonly/runtimeFeedsHelper.ts:331-491`
 *  - 응답 모양 → 겉 핸들러 `:152-167`
 *
 * 픽스처는 전부 가짜다 — 실제 시스템 정보를 담지 않는다.
 */

import { runtimeListFeeds } from '../runtimeListFeeds';
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

const feed = (...entries: string[]): string => `<feed>${entries.join('')}</feed>`;

/** ADT 피드는 HTML 표를 XML 안에 이스케이프해 싣는다 — 그 모양을 그대로 만든다. */
const summaryHtml = (rows: ReadonlyArray<readonly [string, string]>): string =>
  `<table>${rows
    .map(([label, value]) => `<tr><td><b>${label}</b></td><td>${value}</td></tr>`)
    .join('')}</table>`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const reply = (body: string) => () => ({ status: 200, body });

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeListFeeds)).toEqual(publishedDeclaration('RuntimeListFeeds'));
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    expect(runtimeListFeeds.definition.sets).toEqual(['readonly']);
    expect(runtimeListFeeds.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(runtimeListFeeds.definition.kind).toBe('read');
  });
});

describe('와이어 — feed_type이 주소를 고른다', () => {
  it.each([
    ['descriptors', '/sap/bc/adt/feeds'],
    ['variants', '/sap/bc/adt/feeds/variants'],
    ['dumps', '/sap/bc/adt/runtime/dumps'],
    ['system_messages', '/sap/bc/adt/runtime/systemmessages'],
    ['gateway_errors', '/sap/bc/adt/gw/errorlog'],
  ])('%s → %s', async (feedType, path) => {
    const { requests } = await runTool(runtimeListFeeds, { feed_type: feedType }, reply(feed()));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect((sent[0]?.url ?? '').split('?')[0]).toContain(path);
    expect(sent[0]?.headers['Accept']).toBe('application/atom+xml;type=feed');
  });

  it('feed_type을 안 주면 descriptors다', async () => {
    const { requests } = await runTool(runtimeListFeeds, {}, reply(feed()));

    expect((toolRequests(requests)[0]?.url ?? '').split('?')[0]).toContain('/sap/bc/adt/feeds');
  });

  it('descriptors·variants에는 질의 인자가 **붙지 않는다** (fetchFeed를 안 쓴다)', async () => {
    for (const feedType of ['descriptors', 'variants']) {
      const { requests } = await runTool(
        runtimeListFeeds,
        { feed_type: feedType, user: 'FIXTUSER', max_results: 3, from: '2026', to: '2027' },
        reply(feed()),
      );

      expect(toolRequests(requests)[0]?.url).not.toContain('?');
    }
  });

  it('dumps·system_messages의 사용자 속성은 `user`다', async () => {
    for (const feedType of ['dumps', 'system_messages']) {
      const { requests } = await runTool(
        runtimeListFeeds,
        { feed_type: feedType, user: 'FIXTUSER' },
        reply(feed()),
      );

      expect(decodeURIComponent(toolRequests(requests)[0]?.url ?? '')).toContain(
        '$query=and ( equals ( user , FIXTUSER ) )',
      );
    }
  });

  it('gateway_errors만 사용자 속성이 `username`이다', async () => {
    const { requests } = await runTool(
      runtimeListFeeds,
      { feed_type: 'gateway_errors', user: 'FIXTUSER' },
      reply(feed()),
    );

    expect(decodeURIComponent(toolRequests(requests)[0]?.url ?? '')).toContain(
      '$query=and ( equals ( username , FIXTUSER ) )',
    );
  });

  it('⚠ 같은 덤프 피드를 `RuntimeListDumps`와 **다른 질의로** 부른다', async () => {
    const { requests } = await runTool(
      runtimeListFeeds,
      { feed_type: 'dumps', user: 'U', max_results: 7 },
      reply(feed()),
    );
    const url = decodeURIComponent(toolRequests(requests)[0]?.url ?? '');

    // 이쪽은 공백이 많은 형태 + `$top`. `RuntimeListDumps`는 `and( equals( user, U ) )`
    // + `$inlinecount`/`$skip`/`$orderby`를 쓴다. 구에서도 조립기가 서로 다른
    // 파일에 있었으므로 합치지 않았다.
    expect(url).toContain('and ( equals ( user , U ) )');
    expect(url).toContain('$top=7');
    expect(url).not.toContain('$inlinecount');
    expect(url).not.toContain('$orderby');
  });
});

describe('파서 짝짓기', () => {
  it('descriptors는 id·title·url·category를 뽑는다', async () => {
    const { outcome } = await runTool(
      runtimeListFeeds,
      { feed_type: 'descriptors' },
      reply(
        feed(
          '<entry><id>dumps</id><title>ST22</title>' +
            '<link href="/sap/bc/adt/runtime/dumps"/><category term="runtime"/></entry>',
        ),
      ),
    );

    expect(jsonOf(outcome)).toEqual({
      success: true,
      feed_type: 'descriptors',
      count: 1,
      entries: [
        { id: 'dumps', title: 'ST22', url: '/sap/bc/adt/runtime/dumps', category: 'runtime' },
      ],
    });
  });

  it('variants는 category 없이 세 칸이다', async () => {
    const { outcome } = await runTool(
      runtimeListFeeds,
      { feed_type: 'variants' },
      reply(feed('<entry><id>v1</id><title>V</title><link href="/u"/><category term="x"/></entry>')),
    );
    const payload = jsonOf(outcome) as { entries: Array<Record<string, unknown>> };

    expect(payload.entries[0]).toEqual({ id: 'v1', title: 'V', url: '/u' });
  });

  it('dumps는 HTML 표에서 값을 캐고, 표가 비면 category로 떨어진다', async () => {
    const { outcome } = await runTool(
      runtimeListFeeds,
      { feed_type: 'dumps' },
      reply(
        feed(
          [
            '<entry>',
            '<id>/sap/bc/adt/runtime/dump/20260814FIXTURE</id>',
            '<published>2026-08-14T09:00:00Z</published>',
            '<updated>2026-08-14T09:00:01Z</updated>',
            '<category term="COMPUTE_INT_PLUS_OVERFLOW"/>',
            '<category term="ZPROG_FIXTURE"/>',
            '<link rel="self" href="/sap/bc/adt/runtime/dump/20260814FIXTURE"/>',
            '<author><name>FIXTUSER</name></author>',
            `<summary type="html">${summaryHtml([
              ['Short Text', '정수 오버플로'],
              ['Exception', 'CX_SY_ARITHMETIC_OVERFLOW'],
              ['Client', '100'],
            ])}</summary>`,
            '</entry>',
          ].join(''),
        ),
      ),
    );
    const payload = jsonOf(outcome) as { entries: Array<Record<string, unknown>> };
    const entry = payload.entries[0] ?? {};

    expect(entry['dumpId']).toBe('20260814FIXTURE');
    expect(entry['detailUrl']).toBe('/sap/bc/adt/runtime/dump/20260814FIXTURE');
    expect(entry['shortText']).toBe('정수 오버플로');
    expect(entry['exception']).toBe('CX_SY_ARITHMETIC_OVERFLOW');
    expect(entry['client']).toBe('100');
    // 표에 없으므로 category 두 개가 대신 들어간다(첫째=오류 코드, 둘째=프로그램).
    expect(entry['runtimeError']).toBe('COMPUTE_INT_PLUS_OVERFLOW');
    expect(entry['program']).toBe('ZPROG_FIXTURE');
    // `user`도 표에 없어 author/name으로 떨어진다.
    expect(entry['user']).toBe('FIXTUSER');
  });

  it('system_messages는 SM02 파서를 쓴다', async () => {
    const { outcome } = await runTool(
      runtimeListFeeds,
      { feed_type: 'system_messages' },
      reply(feed('<entry><id>SM02/1</id><title>T</title><content>C</content></entry>')),
    );
    const payload = jsonOf(outcome) as { entries: Array<Record<string, unknown>> };

    expect(payload.entries[0]?.['text']).toBe('C');
    expect(payload.entries[0]?.['severity']).toBe('');
  });

  it('gateway_errors는 atom:id 접두사에서 종류 이름을 만든다', async () => {
    const { outcome } = await runTool(
      runtimeListFeeds,
      { feed_type: 'gateway_errors' },
      reply(
        feed(
          '<entry><id>FrontendError/020000FIXTURE</id><title>t</title>' +
            `<summary type="html">${summaryHtml([['Short Text', '오류']])}</summary></entry>`,
        ),
      ),
    );
    const payload = jsonOf(outcome) as { entries: Array<Record<string, unknown>> };

    expect(payload.entries[0]?.['type']).toBe('Frontend Error');
    expect(payload.entries[0]?.['shortText']).toBe('오류');
  });
});

describe('응답', () => {
  it('feed_type을 되비추고 count를 함께 싣는다 (들여쓰기 2칸)', async () => {
    const { outcome } = await runTool(
      runtimeListFeeds,
      { feed_type: 'variants' },
      reply(feed('<entry><id>a</id></entry>', '<entry><id>b</id></entry>')),
    );

    expect(outcome.isError).toBe(false);
    const payload = jsonOf(outcome) as Record<string, unknown>;
    expect(payload['feed_type']).toBe('variants');
    expect(payload['count']).toBe(2);
    expect(outcome.text).toContain('\n  "success": true');
  });

  it('entry가 없으면 빈 목록이다 (오류가 아니다)', async () => {
    const { outcome } = await runTool(runtimeListFeeds, {}, reply(feed()));

    expect(jsonOf(outcome)).toEqual({
      success: true,
      feed_type: 'descriptors',
      count: 0,
      entries: [],
    });
  });
});

describe('갈래', () => {
  it('ADT가 거절하면 `Error: ` 접두사를 단 오류로 접는다', async () => {
    const { outcome } = await runTool(runtimeListFeeds, { feed_type: 'dumps' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
