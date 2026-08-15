/**
 * `ReadServiceBinding` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ReadServiceBinding`
 *  - 흐름: `engine/src/handlers/service_binding/readonly/handleReadServiceBinding.ts:26-81`
 *  - **GET이 두 번 나가고 두 요청이 완전히 같은 근거**:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:309-315` —
 *    `readMetadata`가 자기 안에서 `read()`를 다시 부르고, 넘기는 `version`은
 *    `undefined`다.
 *  - 이름 인코딩: 같은 파일 `:23-25`(`encodeURIComponent(name.toLowerCase())`).
 */

import { readServiceBinding } from '../readServiceBinding';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT =
  'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

const BINDING_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" ' +
  'srvb:published="true" adtcore:name="ZUI_MY_BINDING"/>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  service_binding_name: string;
  source_code: string | null;
  metadata: string | null;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readServiceBinding);
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
      }).toEqual(publishedDeclaration('ReadServiceBinding'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    expect(readServiceBinding.definition.sets).toEqual(['readonly']);
    expect(readServiceBinding.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readServiceBinding.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('완전히 **같은** GET을 두 번 보낸다 — 질의 인자가 없다', async () => {
    const { requests } = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.method).toBe('GET');
      expect(request.url).toBe(
        `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/zui_my_binding`,
      );
      expect(request.headers['Accept']).toBe(ACCEPT);
    }
  });

  it('이름은 trim → 대문자 → 소문자 인코딩을 거친다', async () => {
    const { outcome, requests } = await runTool(
      readServiceBinding,
      { service_binding_name: '  zui_my_binding  ' },
      () => ({ body: BINDING_XML }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/zui_my_binding`,
    );
    expect((JSON.parse(outcome.text) as Payload).service_binding_name).toBe('ZUI_MY_BINDING');
  });
});

describe('응답 조립', () => {
  it('두 필드가 **같은 원문 문자열**이다 (파싱하지 않는다)', async () => {
    const { outcome } = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ body: BINDING_XML }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      service_binding_name: 'ZUI_MY_BINDING',
      source_code: BINDING_XML,
      metadata: BINDING_XML,
    });
  });

  it('두 조각은 독립이다 — 첫 GET만 죽어도 metadata는 채워진다', async () => {
    const { outcome } = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      (_request, index) => (index === 0 ? { status: 500, body: 'boom' } : { body: BINDING_XML }),
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(BINDING_XML);
  });
});

describe('갈래 — 실패를 삼킨다', () => {
  it('404여도 성공으로 답하고 두 필드가 null이다', async () => {
    const { outcome, requests } = await runTool(
      readServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(false);
    expect(requests).toHaveLength(2);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      service_binding_name: 'ZUI_MY_BINDING',
      source_code: null,
      metadata: null,
    });
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      readServiceBinding,
      { service_binding_name: '' },
      () => ({ body: BINDING_XML }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: service_binding_name is required');
    expect(requests).toHaveLength(0);
  });
});
