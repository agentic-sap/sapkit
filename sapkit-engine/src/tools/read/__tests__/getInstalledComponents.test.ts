/**
 * `GetInstalledComponents` — 발행 계약 · 와이어 · 파싱 · 무응답 갈래.
 *
 * 파일 이름은 규약이다: `<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts`.
 * 이 이름이어야 진척 대장의 계약 열이 이 시험을 그 도구의 증거로 잡는다
 * (`harness/ledger/evidence.ts`의 `findContractTestFiles`).
 *
 * 붙잡는 것은 넷이다.
 *  1. 구 번들이 발행하던 선언과 **글자 그대로** 같은가 (`harness/old-surface/m1-tools.json`).
 *  2. 요청이 구와 같은 자리로 나가는가 — 경로·메서드·`Accept`.
 *  3. 첫 후보가 없으면 둘째로 넘어가고, 둘 다 없으면 **오류가 아니라**
 *     `{ supported: false }`인가.
 *  4. 릴리스마다 다른 키 이름을 같은 표로 접는가 (JSON·XML 양쪽).
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { getInstalledComponents } from '../getInstalledComponents';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const PRIMARY = '/sap/bc/adt/core/http/systeminformation/componentreleases';
const FALLBACK = '/sap/bc/adt/core/systeminformation/componentreleases';

const JSON_HEADERS = { 'content-type': 'application/json' };
const XML_HEADERS = { 'content-type': 'application/xml' };

afterEach(() => {
  cleanupTempDirs();
});

/** 도구를 한 번 부르고 응답 본문을 객체로 되돌려 준다. */
async function call(
  reply: Parameters<typeof runTool>[2],
): Promise<{ payload: any; isError: boolean; urls: string[] }> {
  const { outcome, requests } = await runTool(getInstalledComponents, {}, reply);
  return {
    payload: JSON.parse(outcome.text),
    isError: outcome.isError,
    urls: toolRequests(requests).map((request) => request.url),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getInstalledComponents);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetInstalledComponents'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/system/readonly/` → readonly 집합.
    expect(getInstalledComponents.definition.sets).toEqual(['readonly']);
    expect(getInstalledComponents.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getInstalledComponents.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('첫 후보 경로로 GET 하고, 응답하면 둘째는 묻지 않는다', async () => {
    const { urls } = await call(() => ({ status: 200, body: '[]', headers: JSON_HEADERS }));

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(PRIMARY);
  });

  it('구가 보내던 Accept를 그대로 보낸다', async () => {
    const { requests } = await runTool(getInstalledComponents, {}, () => ({
      status: 200,
      body: '[]',
      headers: JSON_HEADERS,
    }));
    const sent = toolRequests(requests)[0];

    expect(sent?.method).toBe('GET');
    expect(sent?.headers['Accept']).toBe('application/json, application/xml');
    expect(sent?.body).toBeUndefined();
  });

  it('첫 후보가 없으면 둘째 후보로 넘어간다', async () => {
    const { payload, urls } = await call((request) =>
      request.url.includes(PRIMARY)
        ? { status: 404, body: 'not found' }
        : { status: 200, body: JSON.stringify({ components: [{ name: 'SAP_BASIS' }] }), headers: JSON_HEADERS },
    );

    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain(FALLBACK);
    expect(payload.supported).toBe(true);
    expect(payload.components).toEqual([{ name: 'SAP_BASIS' }]);
  });
});

describe('무응답은 오류가 아니다', () => {
  it('두 후보 모두 없으면 supported:false를 isError:false로 돌려준다', async () => {
    const { payload, isError, urls } = await call(() => ({ status: 404, body: 'not found' }));

    expect(isError).toBe(false);
    expect(urls).toHaveLength(2);
    expect(payload).toEqual({
      supported: false,
      reason: `No installed-components endpoint responded on this system (tried: ${PRIMARY}, ${FALLBACK}).`,
    });
  });

  it('응답이 왔지만 모양을 못 알아보면 supported:true에 빈 표다', async () => {
    // 응답한 엔드포인트가 있다는 사실 자체가 답이다 — 파싱 실패로 둘째를 묻지 않는다.
    const { payload, urls } = await call(() => ({ status: 200, body: 'not json at all' }));

    expect(urls).toHaveLength(1);
    expect(payload).toEqual({ supported: true, components: [] });
  });
});

describe('릴리스마다 다른 키 이름을 같은 표로 접는다', () => {
  it('JSON — components 배열과 키 변형', async () => {
    const body = JSON.stringify({
      components: [
        { name: 'SAP_BASIS', release: '757', spLevel: '02', description: 'SAP Basis' },
        { swComponent: 'SAP_ABA', releaseVersion: '757', supportPackage: '01' },
        { component: 'SAP_UI', sp: '03', text: 'UI' },
        { release: '757' },
      ],
    });

    const { payload } = await call(() => ({ status: 200, body, headers: JSON_HEADERS }));

    expect(payload.components).toEqual([
      { name: 'SAP_BASIS', release: '757', spLevel: '02', description: 'SAP Basis' },
      { name: 'SAP_ABA', release: '757', spLevel: '01' },
      { name: 'SAP_UI', spLevel: '03', description: 'UI' },
    ]);
  });

  it('XML — 네임스페이스 접두사를 떼고 속성에서도 읽는다', async () => {
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sic:componentReleases xmlns:sic="http://www.sap.com/adt/systeminformation">',
      '  <sic:component name="SAP_BASIS" release="757" spLevel="02" description="SAP Basis"/>',
      '  <sic:component name="SAP_ABA" release="757"/>',
      '</sic:componentReleases>',
    ].join('\n');

    const { payload } = await call(() => ({ status: 200, body, headers: XML_HEADERS }));

    expect(payload.components).toEqual([
      { name: 'SAP_BASIS', release: '757', spLevel: '02', description: 'SAP Basis' },
      { name: 'SAP_ABA', release: '757' },
    ]);
  });

  it('XML — content-type이 없어도 모양으로 알아본다', async () => {
    const body = '<components><component name="SAP_BASIS"/></components>';

    const { payload } = await call(() => ({ status: 200, body }));

    expect(payload.components).toEqual([{ name: 'SAP_BASIS' }]);
  });
});
