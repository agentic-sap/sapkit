/**
 * `ListServiceBindingTypes` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ListServiceBindingTypes`
 *    (**`required`가 아예 없다** — 인자가 전부 선택이다)
 *  - 흐름: `engine/src/handlers/service_binding/high/handleListServiceBindingTypes.ts:30-61`
 *  - 주소·Accept:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:434-444`
 */

import { listServiceBindingTypes } from '../listServiceBindingTypes';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT = 'application/vnd.sap.adt.nameditems.v1+xml, application/xml';

const TYPES_XML =
  '<nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem">' +
  '<nameditem:namedItem><nameditem:name>ODATA</nameditem:name>' +
  '<nameditem:description>1</nameditem:description>' +
  '<nameditem:data>ODATA V4</nameditem:data></nameditem:namedItem>' +
  '</nameditem:namedItemList>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  response_format: string;
  status: number;
  payload: unknown;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다 (required 절이 없다)', async () => {
    const harness = await harnessFor(listServiceBindingTypes);
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
      }).toEqual(publishedDeclaration('ListServiceBindingTypes'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언과 대상-이름 선언', () => {
    expect(listServiceBindingTypes.definition.sets).toEqual(['high']);
    expect(listServiceBindingTypes.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(listServiceBindingTypes.definition.kind).toBe('read');
    // 대상 오브젝트 이름을 받지 않는다는 명시 선언.
    expect(listServiceBindingTypes.definition.targetNames).toEqual([]);
  });
});

describe('와이어', () => {
  it('질의 인자 없는 GET 한 발이다', async () => {
    const { requests } = await runTool(listServiceBindingTypes, {}, () => ({ body: TYPES_XML }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/bindingtypes`,
    );
    expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
    expect(requests[0]?.body).toBeUndefined();
  });

  it('response_format을 바꿔도 요청은 그대로다', async () => {
    for (const format of ['xml', 'json', 'plain'] as const) {
      const { requests } = await runTool(
        listServiceBindingTypes,
        { response_format: format },
        () => ({ body: TYPES_XML }),
      );
      expect(requests[0]?.url).toBe(
        `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/bindingtypes`,
      );
      expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
    }
  });
});

describe('응답 조립', () => {
  it('본문을 접어 payload에 담되 **종류를 뽑아내지는 않는다**', async () => {
    const { outcome } = await runTool(listServiceBindingTypes, {}, () => ({ body: TYPES_XML }));

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.success).toBe(true);
    expect(payload.response_format).toBe('xml');
    expect(payload.status).toBe(200);
    // 파싱된 트리 그대로다 — `ODATA:1:ODATA V4` 같은 추출 결과가 아니다.
    expect(payload.payload).toEqual({
      'nameditem:namedItemList': {
        'xmlns:nameditem': 'http://www.sap.com/adt/nameditem',
        'nameditem:namedItem': {
          'nameditem:name': 'ODATA',
          'nameditem:description': 1,
          'nameditem:data': 'ODATA V4',
        },
      },
    });
  });

  it('plain은 원문을 그대로 싣는다', async () => {
    const { outcome } = await runTool(listServiceBindingTypes, { response_format: 'plain' }, () => ({
      body: TYPES_XML,
    }));

    expect((JSON.parse(outcome.text) as Payload).payload).toBe(TYPES_XML);
  });
});

describe('갈래', () => {
  it('HTTP 실패는 오류로 올라간다', async () => {
    const { outcome } = await runTool(listServiceBindingTypes, {}, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
