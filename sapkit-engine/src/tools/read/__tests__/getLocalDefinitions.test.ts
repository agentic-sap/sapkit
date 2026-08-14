/**
 * `GetLocalDefinitions` — 발행 계약 · 와이어 · 갈래.
 *
 * 이 도구가 붙잡아야 할 자리는 **`version` 인자의 값이 바뀐다**는 것이다.
 * 도구는 `active|inactive`를 받는데 ADT로 나가는 질의 인자는
 * `active|workingArea`다 — 소스 읽기와 규칙이 다르다.
 */

import { getLocalDefinitions } from '../getLocalDefinitions';
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

const BASE = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/includes/definitions`;
const CODE = 'CLASS lcl_helper DEFINITION.\nENDCLASS.';

interface Payload {
  success: boolean;
  class_name: string;
  version: string;
  definitions_code: string;
  status: number;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getLocalDefinitions);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetLocalDefinitions'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언 — 채록본의 default 두 집합에만 뜬다', () => {
    expect(getLocalDefinitions.definition.sets).toEqual(['high']);
    expect(getLocalDefinitions.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getLocalDefinitions.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('definitions 인클루드를 활성 판으로 읽는다', async () => {
    const { requests } = await runTool(getLocalDefinitions, { class_name: 'zcl_test' }, () => ({
      body: CODE,
    }));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(`${BASE}?version=active`);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
  });

  it('inactive는 workingArea로 바뀌어 나간다 — 소스 읽기와 규칙이 다르다', async () => {
    const { requests } = await runTool(
      getLocalDefinitions,
      { class_name: 'zcl_test', version: 'inactive' },
      () => ({ body: CODE }),
    );

    expect(toolRequests(requests)[0]?.url).toBe(`${BASE}?version=workingArea`);
  });

  it('클래스 이름은 대문자 그대로 나간다 (쓰기 쪽 소문자와 다르다)', async () => {
    const { requests } = await runTool(getLocalDefinitions, { class_name: 'zcl_TeSt' }, () => ({
      body: CODE,
    }));

    expect(toolRequests(requests)[0]?.url).toContain('/classes/ZCL_TEST/includes/');
  });
});

describe('응답', () => {
  it('소스를 definitions_code 키로 싣고 상태를 함께 준다', async () => {
    const { outcome } = await runTool(getLocalDefinitions, { class_name: 'zcl_test' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      definitions_code: CODE,
      status: 200,
    });
  });
});

describe('갈래', () => {
  it('class_name이 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(getLocalDefinitions, { class_name: '' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: class_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });

  it('404는 벤더가 삼켜 「없음」이 되고, 그 문구가 그대로 실린다', async () => {
    // 구 흐름: read()가 404를 undefined로 접고(AdtLocalDefinitions.js:145),
    // 핸들러가 평범한 Error를 던져 기본 가지에 실린다 — `.response`가 없으므로
    // 404 전용 가지에는 닿지 않는다.
    const { outcome } = await runTool(getLocalDefinitions, { class_name: 'zcl_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to read local definitions: Local definitions for ZCL_TEST not found',
    );
  });

  it('423은 잠금 문구다', async () => {
    const { outcome } = await runTool(getLocalDefinitions, { class_name: 'zcl_test' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.text).toBe('Error: Class ZCL_TEST is locked by another user.');
  });

  it('406은 상태·URL·응답 조각까지 붙여 알린다', async () => {
    const { outcome } = await runTool(getLocalDefinitions, { class_name: 'zcl_test' }, () => ({
      status: 406,
      body: 'not acceptable here',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(
      'Local definitions read not supported on this system (HTTP 406).',
    );
    expect(outcome.text).toContain(`URL: ${BASE}?version=active.`);
    expect(outcome.text).toContain('Response: not acceptable here');
  });
});
