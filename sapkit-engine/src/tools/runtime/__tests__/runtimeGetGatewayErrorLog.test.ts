/**
 * `RuntimeGetGatewayErrorLog` — 발행 계약 · 두 모드의 와이어 · Atom/HTML 파싱.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 모드 분기 → `engine/src/handlers/system/readonly/handleRuntimeGetGatewayErrorLog.ts:56-124`
 *  - 질의 조립·파싱 → `engine/src/handlers/system/readonly/runtimeFeedsHelper.ts:273-315, 377-429, 493-576`
 *
 * 픽스처는 전부 가짜다 — 실제 시스템 정보를 담지 않는다.
 */

import { runtimeGetGatewayErrorLog } from '../runtimeGetGatewayErrorLog';
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

const ERRORLOG = '/sap/bc/adt/gw/errorlog';

/** ADT 피드는 HTML 표를 XML 안에 이스케이프해 싣는다 — 그 모양을 그대로 만든다. */
function summaryHtml(rows: ReadonlyArray<readonly [string, string]>): string {
  const cells = rows
    .map(([label, value]) => `<tr><td><b>${label}</b></td><td>${value}</td></tr>`)
    .join('');
  return `<table>${cells}</table>`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const LIST_FEED = [
  '<feed>',
  '<entry>',
  '<id>FrontendError/020000DD4A3B1FIXTURE</id>',
  '<title>redundant title</title>',
  '<updated>2026-08-14T09:00:00Z</updated>',
  '<author><name>FIXTUSER</name></author>',
  `<summary type="html">${summaryHtml([
    ['Short Text', 'Fixture failure'],
    ['Transaction ID', '0200FIXTUREGUID (Replay in GW Client)'],
    ['Package', 'ZFIXPKG'],
    ['Application Component', 'ZZ-FIX'],
    ['Client', '100'],
    ['Request Kind', 'GET'],
  ])}</summary>`,
  '</entry>',
  '</feed>',
].join('');

const DETAIL_XML = [
  '<errorEntry type="Frontend Error">',
  '<shortText>Fixture failure</shortText>',
  '<transactionId>0200FIXTUREGUID</transactionId>',
  '<package>ZFIXPKG</package>',
  '<applicationComponent>ZZ-FIX</applicationComponent>',
  '<dateTime>2026-08-14T09:00:00Z</dateTime>',
  '<username>FIXTUSER</username>',
  '<client>100</client>',
  '<requestKind>GET</requestKind>',
  '<serviceInfo namespace="/FIX/" serviceName="ZFIX_SRV" serviceVersion="0001"',
  ' groupId="ZGRP" serviceRepository="DEFAULT" destination="LOCAL"/>',
  '<errorContext><errorInfo>fixture info</errorInfo>',
  '<exceptions><exception type="CX_FIX" raiseLocation="ZCL_FIX">boom</exception></exceptions>',
  '</errorContext>',
  '<sourceCode errorLine="12">',
  '<line number="11" isError="false">WRITE 1.</line>',
  '<line number="12" isError="true">WRITE 2.</line>',
  '</sourceCode>',
  '<callStack><entry number="1" event="METHOD" program="ZCL_FIX" name="RUN" line="12"/></callStack>',
  '</errorEntry>',
].join('');

async function call(args: Record<string, unknown>, body: string) {
  const { outcome, requests } = await runTool(runtimeGetGatewayErrorLog, args, () => ({
    status: 200,
    body,
  }));
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeGetGatewayErrorLog)).toEqual(
      publishedDeclaration('RuntimeGetGatewayErrorLog'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeGetGatewayErrorLog.definition.sets).toEqual(['readonly']);
    // 온프렘 축에만 있다 — 채록본에서도 연결 조건 두 곳에만 뜬다.
    expect(runtimeGetGatewayErrorLog.definition.available_in).toEqual(['onprem']);
    expect(runtimeGetGatewayErrorLog.definition.kind).toBe('read');
  });
});

describe('목록 모드', () => {
  it('인자 없이 피드를 GET 한다', async () => {
    const { sent, url } = await call({}, LIST_FEED);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url?.pathname).toBe(ERRORLOG);
    expect(url?.search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe('application/atom+xml;type=feed');
  });

  it('user 필터는 username 속성으로 나간다 — 덤프 피드의 user와 다르다', async () => {
    const { url } = await call({ user: ' FIXTUSER ' }, LIST_FEED);

    expect(url?.searchParams.get('$query')).toBe('and ( equals ( username , FIXTUSER ) )');
  });

  it('질의 인자는 구와 같은 이름·순서로 실린다', async () => {
    const { url } = await call(
      { user: 'FIXTUSER', max_results: 5, from: '20260814000000', to: '20260814235959' },
      LIST_FEED,
    );

    expect([...(url?.searchParams.keys() ?? [])]).toEqual(['$query', '$top', 'from', 'to']);
    expect(url?.searchParams.get('$top')).toBe('5');
  });

  it('max_results가 0이면 $top을 싣지 않는다 (구 falsy 검사)', async () => {
    const { url } = await call({ max_results: 0 }, LIST_FEED);

    expect(url?.searchParams.has('$top')).toBe(false);
  });

  it('atom:id 접두사에서 종류를, HTML 표에서 나머지를 뽑는다', async () => {
    const { outcome } = await call({}, LIST_FEED);
    const body = jsonOf(outcome);

    expect(body['mode']).toBe('list');
    expect(body['count']).toBe(1);
    expect(body['errors']).toEqual([
      {
        type: 'Frontend Error',
        // 표의 Short Text가 title을 이긴다.
        shortText: 'Fixture failure',
        // "(Replay in GW Client)" 링크는 첫 공백에서 잘린다.
        transactionId: '0200FIXTUREGUID',
        package: 'ZFIXPKG',
        applicationComponent: 'ZZ-FIX',
        dateTime: '2026-08-14T09:00:00Z',
        username: 'FIXTUSER',
        client: '100',
        requestKind: 'GET',
        // atom:link가 없으면 종류+GUID로 주소를 합성한다.
        link: `${ERRORLOG}/Frontend%20Error/020000DD4A3B1FIXTURE`,
      },
    ]);
  });

  it('항목이 없는 피드는 빈 표다', async () => {
    const { outcome } = await call({}, '<feed/>');
    const body = jsonOf(outcome);

    expect(body['count']).toBe(0);
    expect(body['errors']).toEqual([]);
  });
});

describe('상세 모드', () => {
  it('error_url을 그대로 주소로 쓴다', async () => {
    const detailUrl = `${ERRORLOG}/Frontend%20Error/020000DD4A3B1FIXTURE`;
    const { sent, url } = await call({ error_url: detailUrl }, DETAIL_XML);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url?.pathname).toBe(detailUrl);
    expect(sent[0]?.headers['Accept']).toBe('application/atom+xml;type=feed');
  });

  it('상세 XML을 구조로 접는다', async () => {
    const { outcome } = await call({ error_url: `${ERRORLOG}/x/y` }, DETAIL_XML);
    const body = jsonOf(outcome);

    expect(body['mode']).toBe('detail');
    expect(body['error']).toEqual({
      type: 'Frontend Error',
      shortText: 'Fixture failure',
      transactionId: '0200FIXTUREGUID',
      package: 'ZFIXPKG',
      applicationComponent: 'ZZ-FIX',
      dateTime: '2026-08-14T09:00:00Z',
      username: 'FIXTUSER',
      // 태그 값은 파서가 숫자로 바꾼다 — 구도 그대로 직렬화했다.
      client: 100,
      requestKind: 'GET',
      serviceInfo: {
        namespace: '/FIX/',
        serviceName: 'ZFIX_SRV',
        serviceVersion: '0001',
        groupId: 'ZGRP',
        serviceRepository: 'DEFAULT',
        destination: 'LOCAL',
      },
      errorContext: {
        errorInfo: 'fixture info',
        resolution: {},
        exceptions: [{ type: 'CX_FIX', text: 'boom', raiseLocation: 'ZCL_FIX' }],
      },
      sourceCode: {
        lines: [
          { number: '11', content: 'WRITE 1.', isError: false },
          { number: '12', content: 'WRITE 2.', isError: true },
        ],
        errorLine: '12',
      },
      callStack: [
        { number: '1', event: 'METHOD', program: 'ZCL_FIX', name: 'RUN', line: '12' },
      ],
    });
  });
});

describe('갈래', () => {
  it('SAP이 오류를 주면 Error: 접두사가 붙은 실패로 접힌다', async () => {
    const { outcome } = await runTool(runtimeGetGatewayErrorLog, {}, () => ({
      status: 404,
      body: 'not found',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
