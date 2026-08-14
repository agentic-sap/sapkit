/**
 * `GetDataElement` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetDataElement`
 *  - 흐름·오류 문구: `engine/src/handlers/data_element/high/handleGetDataElement.ts:51-163`
 *  - 주소·헤더: `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/read.js:14-26`
 *    (`Accept`는 `.../constants/contentTypes.js:87`)
 *  - 404 삼킴: `.../core/dataElement/AdtDataElement.js:141-148`
 *
 * 짝인 `ReadDataElement`와 무엇이 다른지는 `readDataElement.test.ts`의
 * 「짝 대조」 절이 못 박는다.
 */

import { getDataElement } from '../getDataElement';
import { directHarness, invokeDirect, textOf } from './dataElementDomainSupport';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT =
  'application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml';

/** 실제 응답 모양에 가까운 최소 XML. 도구는 이것을 해석하지 않고 그대로 싣는다. */
const DTEL_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" adtcore:name="ZE_FOO">' +
  '<dtel:dataElement><dtel:typeKind>domain</dtel:typeKind></dtel:dataElement></blue:wbobj>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  data_element_name: string;
  version: string;
  data_element_data: string;
  status: number;
  status_text: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getDataElement);
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
      }).toEqual(publishedDeclaration('GetDataElement'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/data_element/high/` → 채록본에서 `*_default` 두 조건에만
    // 뜬다. `readonly` 조건에는 없으므로 `sets`는 `high`다.
    expect(getDataElement.definition.sets).toEqual(['high']);
    expect(getDataElement.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getDataElement.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('구와 같은 경로로 GET 한 번만 보낸다 — **`?version=`이 붙지 않는다**', async () => {
    const { requests } = await runTool(
      getDataElement,
      { data_element_name: 'ZE_FOO' },
      () => ({ body: DTEL_XML }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/dataelements/ZE_FOO`);
    expect(requests[0]?.url).not.toContain('version=');
    expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
    expect(requests[0]?.body).toBeUndefined();
  });

  it('version=inactive는 응답의 메아리만 바꾸고 요청은 그대로다', async () => {
    const { outcome, requests } = await runTool(
      getDataElement,
      { data_element_name: 'ZE_FOO', version: 'inactive' },
      () => ({ body: DTEL_XML }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/dataelements/ZE_FOO`);
    expect((JSON.parse(outcome.text) as Payload).version).toBe('inactive');
  });

  it('이름은 대문자로 정규화된다 (경로도 응답도)', async () => {
    const { outcome, requests } = await runTool(
      getDataElement,
      { data_element_name: 'ze_foo' },
      () => ({ body: DTEL_XML }),
    );

    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/dataelements/ZE_FOO`);
    expect((JSON.parse(outcome.text) as Payload).data_element_name).toBe('ZE_FOO');
  });
});

describe('응답 조립', () => {
  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    const { outcome } = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 200,
      body: DTEL_XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      data_element_name: 'ZE_FOO',
      version: 'active',
      data_element_data: DTEL_XML,
      status: 200,
      status_text: 'OK',
    });
    // 구는 JSON.stringify(…, null, 2)로 낸다.
    expect(outcome.text.split('\n')[1]).toBe('  "success": true,');
  });
});

describe('갈래', () => {
  it('404는 감싸개가 삼켜 빈손이 되고, 핸들러가 "찾지 못했다"로 던진다', async () => {
    const { outcome } = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 404,
      body: '',
    }));

    // 구 핸들러에 적힌 마침표 있는 `… not found.` 갈래는 도달하지 않는다 —
    // 우리가 던진 Error에는 HTTP 상태가 없기 때문이다(구도 같다).
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to read data element: Data element ZE_FOO not found',
    );
  });

  it('423은 잠금 문구로 접힌다', async () => {
    const { outcome } = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Data element ZE_FOO is locked by another user.');
  });

  it('그 밖의 실패는 "Failed to read data element:" 접두사를 단다', async () => {
    const { outcome } = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: Failed to read data element: /);
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      getDataElement,
      { data_element_name: '' },
      () => ({ body: DTEL_XML }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: data_element_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('ECC 갈림 — 우회로가 이 판에 없다 (차이 장부 D61)', () => {
  it('SAP_VERSION=ECC면 접속을 만들지 않고 브리지 미구현을 알린다', async () => {
    const harness = directHarness({ sapVersion: 'ECC' });
    const result = await invokeDirect(getDataElement, harness, { data_element_name: 'ZE_FOO' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ZMCP_ADT_DDIC_DTEL_READ');
    expect(textOf(result)).toContain('D61');
    // ADT로 흘려보내지 않는다 — ECC 커널에 그 엔드포인트가 없다.
    expect(harness.connections()).toBe(0);
    expect(harness.requests).toHaveLength(0);
  });

  it.each(['ECC', 'ecc', 'Ecc'])('%s는 대소문자를 가리지 않고 갈린다', async (sapVersion) => {
    const harness = directHarness({ sapVersion });
    const result = await invokeDirect(getDataElement, harness, { data_element_name: 'ZE_FOO' });
    expect(result.isError).toBe(true);
    expect(harness.requests).toHaveLength(0);
  });

  // `' ECC '`가 여기 있는 것은 의도다 — 구 게이트는 `toUpperCase()`만 하고
  // **trim 하지 않는다**(`handleGetDataElement.ts:70`).
  it.each([null, 'S4', 'ECC6', '', ' ECC '])('%s는 ADT 직통이다', async (sapVersion) => {
    const harness = directHarness({ sapVersion, reply: () => ({ status: 200, body: DTEL_XML }) });
    const result = await invokeDirect(getDataElement, harness, { data_element_name: 'ZE_FOO' });

    expect(result.isError).toBe(false);
    expect(harness.requests).toHaveLength(1);
  });
});
