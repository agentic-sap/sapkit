/**
 * `GetServiceDefinition` — 발행 계약 · 와이어 · 갈래 · **짝 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetServiceDefinition`
 *  - 흐름: `engine/src/handlers/service_definition/high/handleGetServiceDefinition.ts:50-126`
 *  - GET 한 번의 주소·Accept:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/serviceDefinition/read.js:39-58`
 *  - 404가 `undefined`로 접히는 자리:
 *    `.../core/serviceDefinition/AdtServiceDefinition.js:123-129`
 */

import { getServiceDefinition } from '../getServiceDefinition';
import { readServiceDefinition } from '../readServiceDefinition';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const SOURCE = 'define service ZSRVD_DEMO {\n  expose ZI_DEMO;\n}';

afterEach(() => {
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getServiceDefinition);
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
      }).toEqual(publishedDeclaration('GetServiceDefinition'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/service_definition/high/` → 채록본 `exposures`의
    // connected_default·noProfile_default 둘에만 뜬다.
    expect(getServiceDefinition.definition.sets).toEqual(['high']);
    expect(getServiceDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getServiceDefinition.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET을 **한 번**만 보낸다 — 소스 주소에 Accept: text/plain', async () => {
    const { requests } = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');
  });

  it('version=inactive가 질의 인자로 실제로 나간다', async () => {
    const { requests } = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO', version: 'inactive' },
      () => ({ body: SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo/source/main?version=inactive`,
    );
  });
});

describe('응답 조립', () => {
  it('본문을 service_definition_data에 담고 상태를 함께 싣는다', async () => {
    const { outcome } = await runTool(
      getServiceDefinition,
      { service_definition_name: 'zsrvd_demo' },
      () => ({ body: SOURCE }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      service_definition_name: 'ZSRVD_DEMO',
      version: 'active',
      service_definition_data: SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });
});

describe('갈래 — 오류로 올린다', () => {
  it('404는 감싸개가 삼켜 **접두사 갈래**로 떨어진다 (마침표 있는 문구가 아니다)', async () => {
    const { outcome } = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to read service definition: ServiceDefinition ZSRVD_DEMO not found',
    );
  });

  it('423은 감싸개가 그대로 던져 잠금 문구 갈래에 닿는다', async () => {
    const { outcome } = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ status: 423, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: ServiceDefinition ZSRVD_DEMO is locked by another user.',
    );
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      getServiceDefinition,
      { service_definition_name: '' },
      () => ({ body: SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: service_definition_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('짝 대조 — `GetServiceDefinition` ↔ `ReadServiceDefinition`', () => {
  it('노출 집합이 다르다 — high(기본만) vs readonly(읽기 전용 표면까지)', () => {
    expect(getServiceDefinition.definition.sets).toEqual(['high']);
    expect(readServiceDefinition.definition.sets).toEqual(['readonly']);
  });

  it('나가는 요청 수가 다르다 — 1회 vs 2회, 그리고 두 번째는 주소가 다르다', async () => {
    const get = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: SOURCE }),
    );
    const read = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: SOURCE }),
    );

    expect(get.requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo/source/main?version=active`,
    ]);
    expect(read.requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo/source/main?version=active`,
      `${TEST_ORIGIN}/sap/bc/adt/ddic/srvd/sources/zsrvd_demo?version=inactive`,
    ]);
  });

  it('실패 처리가 반대다 — Get은 오류, Read는 null을 담은 성공', async () => {
    const get = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ status: 404, body: '' }),
    );
    const read = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ status: 404, body: '' }),
    );

    expect(get.outcome.isError).toBe(true);
    expect(read.outcome.isError).toBe(false);
  });

  it('응답 필드 이름이 다르다 — service_definition_data vs source_code+metadata', async () => {
    const get = await runTool(
      getServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: SOURCE }),
    );
    const read = await runTool(
      readServiceDefinition,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: SOURCE }),
    );

    expect(Object.keys(JSON.parse(get.outcome.text)).sort()).toEqual([
      'service_definition_data',
      'service_definition_name',
      'status',
      'status_text',
      'success',
      'version',
    ]);
    expect(Object.keys(JSON.parse(read.outcome.text)).sort()).toEqual([
      'metadata',
      'service_definition_name',
      'source_code',
      'success',
      'version',
    ]);
  });
});
