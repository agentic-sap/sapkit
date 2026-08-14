/**
 * `ReadMetadataExtension` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ReadMetadataExtension`
 *  - 흐름: `engine/src/handlers/metadata_extension/readonly/handleReadMetadataExtension.ts:32-100`
 *  - 두 GET의 주소·Accept·`version` 취급:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/metadataExtension/read.js:27-73`
 *    (이름을 **인코딩하지 않는다** · `active`는 질의 인자로 나가지 않는다 ·
 *     메타데이터 GET에는 `version`이 아예 없다)
 */

import { readMetadataExtension } from '../readMetadataExtension';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const METADATA_ACCEPT = 'application/vnd.sap.adt.ddic.ddlx.v1+xml';

const SOURCE =
  '@Metadata.layer: #CUSTOMER\nannotate entity ZI_DEMO with\n{\n  @UI.lineItem: [{position: 10}]\n  Field1;\n}';
const METADATA =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<ddlxsources:ddlxSource xmlns:ddlxsources="http://www.sap.com/adt/ddic/ddlxsources" adtcore:name="Z_MY_DDLX"/>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  metadata_extension_name: string;
  version: string;
  source_code: string | null;
  metadata: string | null;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readMetadataExtension);
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
      }).toEqual(publishedDeclaration('ReadMetadataExtension'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    expect(readMetadataExtension.definition.sets).toEqual(['readonly']);
    expect(readMetadataExtension.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readMetadataExtension.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET을 두 번 보낸다 — **`active`는 질의 인자로 나가지 않고** 메타 GET에는 version이 없다', async () => {
    const { requests } = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      (request) => ({ body: request.url.includes('/source/main') ? SOURCE : METADATA }),
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx/source/main`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');
    expect(requests[1]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx`);
    expect(requests[1]?.headers['Accept']).toBe(METADATA_ACCEPT);
  });

  it('version=inactive일 때만 소스 GET에 질의 인자가 붙는다', async () => {
    const { requests } = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX', version: 'inactive' },
      () => ({ body: SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx/source/main?version=inactive`,
    );
    // 메타데이터 GET은 그대로다 — version을 아예 받지 않는다.
    expect(requests[1]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx`);
  });

  it('이름은 소문자로 내리기만 하고 **인코딩하지 않는다** (SRVD와 규칙이 다르다)', async () => {
    const { requests } = await runTool(
      readMetadataExtension,
      { metadata_extension_name: '/NS/Z_DDLX' },
      () => ({ body: SOURCE }),
    );

    // encodeURIComponent를 태웠다면 `%2Fns%2Fz_ddlx`가 됐을 자리다.
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddlx/sources//ns/z_ddlx/source/main`,
    );
  });
});

describe('응답 조립', () => {
  it('소스와 메타데이터를 각각 담는다', async () => {
    const { outcome } = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'z_my_ddlx' },
      (request) => ({ body: request.url.includes('/source/main') ? SOURCE : METADATA }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      metadata_extension_name: 'Z_MY_DDLX',
      version: 'active',
      source_code: SOURCE,
      metadata: METADATA,
    });
  });
});

describe('갈래 — 실패를 삼킨다', () => {
  it('404여도 성공으로 답하고 두 필드가 null이다', async () => {
    const { outcome, requests } = await runTool(
      readMetadataExtension,
      { metadata_extension_name: 'Z_MY_DDLX' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(false);
    expect(requests).toHaveLength(2);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      readMetadataExtension,
      { metadata_extension_name: '' },
      () => ({ body: SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: metadata_extension_name is required');
    expect(requests).toHaveLength(0);
  });
});
