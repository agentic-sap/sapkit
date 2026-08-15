/**
 * `GetMetadataExtension` — 발행 계약 · 와이어 · 갈래 · **짝 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetMetadataExtension`
 *  - 흐름: `engine/src/handlers/metadata_extension/high/handleGetMetadataExtension.ts:50-126`
 *  - GET 한 번의 주소·Accept:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/metadataExtension/read.js:55-73`
 *  - 404가 `readResult` 없는 상태로 접히는 자리:
 *    `.../core/metadataExtension/AdtMetadataExtension.js:127-131`
 */

import { getMetadataExtension } from '../getMetadataExtension';
import { readMetadataExtension } from '../readMetadataExtension';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const SOURCE = '@Metadata.layer: #CUSTOMER\nannotate entity ZI_DEMO with\n{\n  Field1;\n}';

afterEach(() => {
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getMetadataExtension);
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
      }).toEqual(publishedDeclaration('GetMetadataExtension'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    expect(getMetadataExtension.definition.sets).toEqual(['high']);
    expect(getMetadataExtension.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getMetadataExtension.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET을 **한 번**만 보내고 active에는 질의 인자가 붙지 않는다', async () => {
    const { requests } = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ body: SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx/source/main`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');
  });

  it('version=inactive일 때만 질의 인자가 나간다', async () => {
    const { requests } = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX', version: 'inactive' },
      () => ({ body: SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx/source/main?version=inactive`,
    );
  });
});

describe('응답 조립', () => {
  it('본문을 metadata_extension_data에 담고 상태를 함께 싣는다', async () => {
    const { outcome } = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'z_my_ddlx' },
      () => ({ body: SOURCE }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      metadata_extension_name: 'Z_MY_DDLX',
      version: 'active',
      metadata_extension_data: SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });
});

describe('갈래 — 오류로 올린다', () => {
  it('404는 감싸개가 접어 **접두사 갈래**로 떨어진다', async () => {
    const { outcome } = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to read metadata extension: MetadataExtension Z_MY_DDLX not found',
    );
  });

  it('423은 그대로 던져져 잠금 문구 갈래에 닿는다', async () => {
    const { outcome } = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ status: 423, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: MetadataExtension Z_MY_DDLX is locked by another user.');
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      getMetadataExtension,
      { metadata_extension_name: '' },
      () => ({ body: SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: metadata_extension_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('짝 대조 — `GetMetadataExtension` ↔ `ReadMetadataExtension`', () => {
  it('노출 집합이 다르다 — high vs readonly', () => {
    expect(getMetadataExtension.definition.sets).toEqual(['high']);
    expect(readMetadataExtension.definition.sets).toEqual(['readonly']);
  });

  it('나가는 요청이 다르다 — 소스 1회 vs 소스+메타 2회', async () => {
    const get = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ body: SOURCE }),
    );
    const read = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ body: SOURCE }),
    );

    expect(get.requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx/source/main`,
    ]);
    expect(read.requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx/source/main`,
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx`,
    ]);
  });

  it('실패 처리가 반대다 — Get은 오류, Read는 null을 담은 성공', async () => {
    const get = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ status: 404, body: '' }),
    );
    const read = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ status: 404, body: '' }),
    );

    expect(get.outcome.isError).toBe(true);
    expect(read.outcome.isError).toBe(false);
  });

  it('응답 필드 이름이 다르다 — metadata_extension_data vs source_code+metadata', async () => {
    const get = await runTool(
      getMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ body: SOURCE }),
    );
    const read = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ body: SOURCE }),
    );

    expect(Object.keys(JSON.parse(get.outcome.text)).sort()).toEqual([
      'metadata_extension_data',
      'metadata_extension_name',
      'status',
      'status_text',
      'success',
      'version',
    ]);
    expect(Object.keys(JSON.parse(read.outcome.text)).sort()).toEqual([
      'metadata',
      'metadata_extension_name',
      'source_code',
      'success',
      'version',
    ]);
  });
});
