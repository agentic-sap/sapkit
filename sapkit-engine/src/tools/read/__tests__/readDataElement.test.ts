/**
 * `ReadDataElement` — 발행 계약 · 와이어 · 갈래 · **짝 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ReadDataElement`
 *  - 흐름: `engine/src/handlers/data_element/readonly/handleReadDataElement.ts:32-103`
 *  - **GET이 두 번 나가는 근거**:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/AdtDataElement.js:154-194`
 *    — `readMetadata`가 자기 안에서 `read()`를 다시 부른다("소스가 없는 오브젝트는
 *    read()가 이미 메타데이터다"). 그래서 성공한 응답의 `source_code`와 `metadata`는
 *    같은 문자열이다.
 */

import { getDataElement } from '../getDataElement';
import { readDataElement } from '../readDataElement';
import { directHarness, invokeDirect } from './dataElementDomainSupport';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT =
  'application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml';

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
  source_code: string | null;
  metadata: string | null;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readDataElement);
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
      }).toEqual(publishedDeclaration('ReadDataElement'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/data_element/readonly/` → 채록본의 네 조건 **전부**에
    // 뜬다(`*_readonly` 포함). 그래서 `sets`는 `readonly`다.
    expect(readDataElement.definition.sets).toEqual(['readonly']);
    expect(readDataElement.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readDataElement.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('같은 주소로 GET을 **두 번** 보낸다 (read + readMetadata)', async () => {
    const { requests } = await runTool(
      readDataElement,
      { data_element_name: 'ZE_FOO' },
      () => ({ body: DTEL_XML }),
    );

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.method).toBe('GET');
      expect(request.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/dataelements/ZE_FOO`);
      expect(request.headers['Accept']).toBe(ACCEPT);
    }
  });

  it('version=inactive여도 요청은 그대로다 — 메아리만 바뀐다', async () => {
    const { outcome, requests } = await runTool(
      readDataElement,
      { data_element_name: 'ze_foo', version: 'inactive' },
      () => ({ body: DTEL_XML }),
    );

    expect(requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/dataelements/ZE_FOO`,
      `${TEST_ORIGIN}/sap/bc/adt/ddic/dataelements/ZE_FOO`,
    ]);
    expect((JSON.parse(outcome.text) as Payload).version).toBe('inactive');
  });
});

describe('응답 조립', () => {
  it('source_code와 metadata가 **같은 본문**이다 (구의 실측 결과)', async () => {
    const { outcome } = await runTool(readDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      body: DTEL_XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      data_element_name: 'ZE_FOO',
      version: 'active',
      source_code: DTEL_XML,
      metadata: DTEL_XML,
    });
    expect(outcome.text.split('\n')[1]).toBe('  "success": true,');
  });

  it('두 번째 GET만 답해도 metadata는 채워진다 (두 조각은 독립이다)', async () => {
    const { outcome } = await runTool(
      readDataElement,
      { data_element_name: 'ZE_FOO' },
      (_request, index) => (index === 0 ? { status: 500, body: 'boom' } : { body: DTEL_XML }),
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(DTEL_XML);
  });
});

describe('갈래 — 실패를 삼킨다', () => {
  it('404여도 성공으로 답하고 두 필드가 null이다', async () => {
    const { outcome, requests } = await runTool(
      readDataElement,
      { data_element_name: 'ZE_FOO' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(false);
    expect(requests).toHaveLength(2);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      data_element_name: 'ZE_FOO',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('500이어도 성공으로 답한다', async () => {
    const { outcome } = await runTool(readDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 500,
      body: 'boom',
    }));

    const payload = JSON.parse(outcome.text) as Payload;
    expect(outcome.isError).toBe(false);
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });

  it('본문이 비면 null이다 (빈 문자열을 싣지 않는다)', async () => {
    const { outcome } = await runTool(readDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 200,
      body: '',
    }));

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });

  it('빈 이름은 요청을 보내기 전에 거부된다 — 이것만은 삼키지 않는다', async () => {
    const { outcome, requests } = await runTool(
      readDataElement,
      { data_element_name: '' },
      () => ({ body: DTEL_XML }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: data_element_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('짝 대조 — `GetDataElement` ↔ `ReadDataElement`', () => {
  it('노출 집합이 다르다 — high(기본만) vs readonly(읽기 전용 표면까지)', () => {
    expect(getDataElement.definition.sets).toEqual(['high']);
    expect(readDataElement.definition.sets).toEqual(['readonly']);
  });

  it('나가는 요청 수가 다르다 — 1회 vs 2회', async () => {
    const get = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      body: DTEL_XML,
    }));
    const read = await runTool(readDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      body: DTEL_XML,
    }));

    expect(get.requests).toHaveLength(1);
    expect(read.requests).toHaveLength(2);
  });

  it('실패 처리가 반대다 — Get은 오류, Read는 null을 담은 성공', async () => {
    const get = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 404,
      body: '',
    }));
    const read = await runTool(readDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      status: 404,
      body: '',
    }));

    expect(get.outcome.isError).toBe(true);
    expect(read.outcome.isError).toBe(false);
  });

  it('응답 필드 이름이 다르다 — data_element_data vs source_code+metadata', async () => {
    const get = await runTool(getDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      body: DTEL_XML,
    }));
    const read = await runTool(readDataElement, { data_element_name: 'ZE_FOO' }, () => ({
      body: DTEL_XML,
    }));

    expect(Object.keys(JSON.parse(get.outcome.text)).sort()).toEqual([
      'data_element_data',
      'data_element_name',
      'status',
      'status_text',
      'success',
      'version',
    ]);
    expect(Object.keys(JSON.parse(read.outcome.text)).sort()).toEqual([
      'data_element_name',
      'metadata',
      'source_code',
      'success',
      'version',
    ]);
  });

  it('ECC에서 갈리는 것은 Get뿐이다 — Read에는 우회로가 없다', async () => {
    const readHarness = directHarness({
      sapVersion: 'ECC',
      reply: () => ({ status: 200, body: DTEL_XML }),
    });
    const readResult = await invokeDirect(readDataElement, readHarness, {
      data_element_name: 'ZE_FOO',
    });

    expect(readResult.isError).toBe(false);
    expect(readHarness.requests).toHaveLength(2);

    const getHarness = directHarness({ sapVersion: 'ECC' });
    const getResult = await invokeDirect(getDataElement, getHarness, {
      data_element_name: 'ZE_FOO',
    });

    expect(getResult.isError).toBe(true);
    expect(getHarness.requests).toHaveLength(0);
  });
});
