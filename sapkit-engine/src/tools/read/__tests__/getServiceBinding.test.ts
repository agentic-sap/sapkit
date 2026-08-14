/**
 * `GetServiceBinding` — 발행 계약 · 와이어 · 페이로드 세 갈래 · **짝 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetServiceBinding`
 *  - 흐름: `engine/src/handlers/service_binding/high/handleGetServiceBinding.ts:39-84`
 *  - 페이로드 접기: `.../service_binding/high/serviceBindingPayloadUtils.ts:17-54`
 *  - GET 한 번의 주소·Accept:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:520-534`
 */

import { getServiceBinding } from '../getServiceBinding';
import { readServiceBinding } from '../readServiceBinding';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT =
  'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

const BINDING_XML =
  '<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" ' +
  'srvb:published="true" srvb:allowedAction="UNPUBLISH"/>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  service_binding_name: string;
  response_format: string;
  status: number;
  payload: unknown;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getServiceBinding);
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
      }).toEqual(publishedDeclaration('GetServiceBinding'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    expect(getServiceBinding.definition.sets).toEqual(['high']);
    expect(getServiceBinding.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getServiceBinding.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET을 한 번만 보낸다', async () => {
    const { requests } = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/zui_my_binding`,
    );
    expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
  });

  it('**`response_format`은 나가는 Accept를 한 글자도 바꾸지 않는다**', async () => {
    for (const format of ['xml', 'json', 'plain'] as const) {
      const { requests } = await runTool(
        getServiceBinding,
        { service_binding_name: 'ZUI_MY_BINDING', response_format: format },
        () => ({ body: BINDING_XML }),
      );
      expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
      expect(requests[0]?.url).toBe(
        `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/zui_my_binding`,
      );
    }
  });
});

describe('페이로드 접기 — 세 갈래', () => {
  // 구와 같은 두 노브(`ignoreAttributes:false` · `attributeNamePrefix:''`)만 주므로
  // `parseAttributeValue`는 기본값 false다 — **속성 값은 문자열로 남는다.**
  it('xml은 속성 접두사 없이 파싱하고 속성 값은 문자열로 남는다', async () => {
    const { outcome } = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.response_format).toBe('xml');
    expect(payload.payload).toEqual({
      'srvb:serviceBinding': {
        'xmlns:srvb': 'http://www.sap.com/adt/ddic/ServiceBindings',
        'srvb:published': 'true',
        'srvb:allowedAction': 'UNPUBLISH',
      },
    });
  });

  it('plain은 원문을 그대로 싣는다', async () => {
    const { outcome } = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING', response_format: 'plain' },
      () => ({ body: BINDING_XML }),
    );

    expect((JSON.parse(outcome.text) as Payload).payload).toBe(BINDING_XML);
  });

  it('json은 파싱하고, 못 읽으면 원문을 그대로 싣는다 (던지지 않는다)', async () => {
    const parsed = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING', response_format: 'json' },
      () => ({ body: '{"published":true}' }),
    );
    expect((JSON.parse(parsed.outcome.text) as Payload).payload).toEqual({ published: true });

    const broken = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING', response_format: 'json' },
      () => ({ body: BINDING_XML }),
    );
    expect((JSON.parse(broken.outcome.text) as Payload).payload).toBe(BINDING_XML);
  });

  it('xml인데 `<`로 시작하지 않으면 원문을 그대로 싣는다', async () => {
    const { outcome } = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: 'not xml at all' }),
    );

    expect((JSON.parse(outcome.text) as Payload).payload).toBe('not xml at all');
  });
});

describe('갈래 — 오류로 올린다', () => {
  it('404는 이 계열만의 문구로 올라간다', async () => {
    const { outcome } = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Read did not return a response for service binding ZUI_MY_BINDING',
    );
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      getServiceBinding,
      { service_binding_name: '' },
      () => ({ body: BINDING_XML }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: service_binding_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('짝 대조 — `GetServiceBinding` ↔ `ReadServiceBinding`', () => {
  it('노출 집합이 다르다 — high vs readonly', () => {
    expect(getServiceBinding.definition.sets).toEqual(['high']);
    expect(readServiceBinding.definition.sets).toEqual(['readonly']);
  });

  it('나가는 요청 수가 다르다 — 1회 vs 2회 (주소는 같다)', async () => {
    const get = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );
    const read = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );

    expect(get.requests).toHaveLength(1);
    expect(read.requests).toHaveLength(2);
    expect(new Set(read.requests.map((request) => request.url)).size).toBe(1);
  });

  it('실패 처리가 반대다 — Get은 오류, Read는 null을 담은 성공', async () => {
    const get = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ status: 404, body: '' }),
    );
    const read = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ status: 404, body: '' }),
    );

    expect(get.outcome.isError).toBe(true);
    expect(read.outcome.isError).toBe(false);
  });

  it('응답 필드가 다르다 — 파싱된 payload+status vs 원문 두 벌', async () => {
    const get = await runTool(
      getServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );
    const read = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );

    expect(Object.keys(JSON.parse(get.outcome.text)).sort()).toEqual([
      'payload',
      'response_format',
      'service_binding_name',
      'status',
      'success',
    ]);
    expect(Object.keys(JSON.parse(read.outcome.text)).sort()).toEqual([
      'metadata',
      'service_binding_name',
      'source_code',
      'success',
    ]);
    // Get은 파싱해 담고 Read는 원문 그대로다.
    expect(typeof (JSON.parse(get.outcome.text) as Payload).payload).toBe('object');
    expect(typeof (JSON.parse(read.outcome.text) as { source_code: unknown }).source_code).toBe(
      'string',
    );
  });
});
