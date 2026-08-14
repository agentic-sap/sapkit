/**
 * `GetLocalTypes` — 발행 계약 · 와이어 · 갈래.
 *
 * 이 도구의 급소는 **이름과 자원이 어긋난다**는 것이다. 도구 이름은
 * "local types"인데 실제로 읽는 ADT 자원은 `includes/implementations`다.
 * 이름을 보고 `includes/types` 같은 경로를 지어내면 조용히 빈손이 된다.
 */

import { getLocalTypes } from '../getLocalTypes';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const BASE = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/includes/implementations`;
const CODE = 'CLASS lcl_helper DEFINITION.\nENDCLASS.\nCLASS lcl_helper IMPLEMENTATION.\nENDCLASS.';

interface Payload {
  success: boolean;
  class_name: string;
  version: string;
  local_types_code: string;
  status: number;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getLocalTypes);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetLocalTypes'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언 — 채록본의 default 두 집합에만 뜬다', () => {
    expect(getLocalTypes.definition.sets).toEqual(['high']);
    expect(getLocalTypes.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getLocalTypes.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('local types는 implementations 인클루드다 — 이름과 자원이 어긋난다', async () => {
    const { requests } = await runTool(getLocalTypes, { class_name: 'zcl_test' }, () => ({
      body: CODE,
    }));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(`${BASE}?version=active`);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
  });

  it('inactive는 workingArea로 바뀌어 나간다', async () => {
    const { requests } = await runTool(
      getLocalTypes,
      { class_name: 'zcl_test', version: 'inactive' },
      () => ({ body: CODE }),
    );

    expect(toolRequests(requests)[0]?.url).toBe(`${BASE}?version=workingArea`);
  });
});

describe('응답', () => {
  it('소스를 local_types_code 키로 싣는다', async () => {
    const { outcome } = await runTool(getLocalTypes, { class_name: 'zcl_test' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      local_types_code: CODE,
      status: 200,
    });
  });
});

describe('갈래', () => {
  it('class_name이 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(getLocalTypes, { class_name: '' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: class_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });

  it('404는 「없음」 문구로 실린다', async () => {
    const { outcome } = await runTool(getLocalTypes, { class_name: 'zcl_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.text).toBe(
      'Error: Failed to read local types: Local types for ZCL_TEST not found',
    );
  });

  it('423은 잠금 문구다', async () => {
    const { outcome } = await runTool(getLocalTypes, { class_name: 'zcl_test' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.text).toBe('Error: Class ZCL_TEST is locked by another user.');
  });

  it('406은 상태·URL·응답 조각까지 붙여 알린다', async () => {
    const { outcome } = await runTool(getLocalTypes, { class_name: 'zcl_test' }, () => ({
      status: 406,
      body: 'not acceptable here',
    }));

    expect(outcome.text).toContain('Local types read not supported on this system (HTTP 406).');
    expect(outcome.text).toContain(`URL: ${BASE}?version=active.`);
    expect(outcome.text).toContain('Response: not acceptable here');
  });
});
