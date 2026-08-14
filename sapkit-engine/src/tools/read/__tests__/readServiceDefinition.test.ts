/**
 * `ReadServiceDefinition` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ReadServiceDefinition`
 *  - 흐름: `engine/src/handlers/service_definition/readonly/handleReadServiceDefinition.ts:32-98`
 *  - 두 GET의 주소·Accept:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/serviceDefinition/read.js:16-58`
 *  - **메타데이터 GET이 `version=inactive`로 못 박혀 있다**:
 *    `.../core/serviceDefinition/AdtServiceDefinition.js:146`
 */

import { readServiceDefinition } from '../readServiceDefinition';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const SOURCE_ACCEPT = 'text/plain';
const METADATA_ACCEPT = 'application/vnd.sap.adt.ddic.srvd.v1+xml';

const SOURCE = '@EndUserText.label: \'demo\'\ndefine service ZSRVD_DEMO {\n  expose ZI_DEMO;\n}';
const METADATA =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<srvd:srvdSource xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources" adtcore:name="ZSRVD_DEMO"/>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  service_definition_name: string;
  version: string;
  source_code: string | null;
  metadata: string | null;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readServiceDefinition);
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
      }).toEqual(publishedDeclaration('ReadServiceDefinition'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/service_definition/readonly/` → 채록본 `exposures`의
    // 네 조건 **전부**에 뜬다.
    expect(readServiceDefinition.definition.sets).toEqual(['readonly']);
    expect(readServiceDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readServiceDefinition.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET을 두 번 보낸다 — 소스와 메타데이터의 주소·Accept가 서로 다르다', async () => {
    const { requests } = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      (request) => ({ body: request.url.includes('/source/main') ? SOURCE : METADATA }),
    );

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe(SOURCE_ACCEPT);
    expect(requests[1]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo?version=inactive`,
    );
    expect(requests[1]?.headers['Accept']).toBe(METADATA_ACCEPT);
  });

  it('주소의 이름은 **소문자**다 — 응답의 메아리만 대문자다', async () => {
    const { outcome, requests } = await runTool(
      readServiceDefinition,
      { service_definition_name: 'zsrvd_demo' },
      () => ({ body: SOURCE }),
    );

    for (const request of requests) {
      expect(request.url).toContain('/srvd/sources/zsrvd_demo');
    }
    expect((JSON.parse(outcome.text) as Payload).service_definition_name).toBe('ZSRVD_DEMO');
  });

  it('version=inactive를 줘도 **메타데이터 GET은 그대로 inactive**이고 소스만 따라간다', async () => {
    const { outcome, requests } = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO', version: 'inactive' },
      () => ({ body: SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo/source/main?version=inactive`,
    );
    expect(requests[1]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo?version=inactive`,
    );
    expect((JSON.parse(outcome.text) as Payload).version).toBe('inactive');
  });
});

describe('응답 조립', () => {
  it('소스와 메타데이터를 각각 담는다', async () => {
    const { outcome } = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      (request) => ({ body: request.url.includes('/source/main') ? SOURCE : METADATA }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      service_definition_name: 'ZSRVD_DEMO',
      version: 'active',
      source_code: SOURCE,
      metadata: METADATA,
    });
  });

  it('두 조각은 독립이다 — 소스만 죽어도 메타데이터는 채워진다', async () => {
    const { outcome } = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      (request) =>
        request.url.includes('/source/main')
          ? { status: 500, body: 'boom' }
          : { body: METADATA },
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(METADATA);
  });
});

describe('갈래 — 실패를 삼킨다', () => {
  it('404여도 성공으로 답하고 두 필드가 null이다', async () => {
    const { outcome, requests } = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(false);
    expect(requests).toHaveLength(2);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      service_definition_name: 'ZSRVD_DEMO',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('빈 이름은 요청을 보내기 전에 거부된다 — 이것만은 삼키지 않는다', async () => {
    const { outcome, requests } = await runTool(
      readServiceDefinition,
      { service_definition_name: '' },
      () => ({ body: SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: service_definition_name is required');
    expect(requests).toHaveLength(0);
  });
});
