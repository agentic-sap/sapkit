/**
 * `GetLocalTestClass` — 발행 계약 · 와이어 · 갈래.
 *
 * 형제 셋과 다른 두 자리를 시험이 붙잡는다.
 *  - 응답에 **`status_text`가 하나 더** 실린다.
 *  - 406 문구가 **한 줄로 끝난다** (URL·응답 조각을 붙이지 않는다).
 */

import { getLocalTestClass } from '../getLocalTestClass';
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

const BASE = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses`;
const CODE = 'CLASS ltcl_test DEFINITION FOR TESTING.\nENDCLASS.';

interface Payload {
  success: boolean;
  class_name: string;
  version: string;
  test_class_code: string;
  status: number;
  status_text: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getLocalTestClass);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetLocalTestClass'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언 — 채록본의 default 두 집합에만 뜬다', () => {
    expect(getLocalTestClass.definition.sets).toEqual(['high']);
    expect(getLocalTestClass.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getLocalTestClass.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('testclasses 인클루드를 활성 판으로 읽는다', async () => {
    const { requests } = await runTool(getLocalTestClass, { class_name: 'zcl_test' }, () => ({
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
      getLocalTestClass,
      { class_name: 'zcl_test', version: 'inactive' },
      () => ({ body: CODE }),
    );

    expect(toolRequests(requests)[0]?.url).toBe(`${BASE}?version=workingArea`);
  });
});

describe('응답', () => {
  it('test_class_code와 함께 status_text까지 싣는다 — 형제와 다른 자리', async () => {
    const { outcome } = await runTool(getLocalTestClass, { class_name: 'zcl_test' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      test_class_code: CODE,
      status: 200,
      status_text: 'OK',
    });
  });
});

describe('갈래', () => {
  it('class_name이 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(getLocalTestClass, { class_name: '' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: class_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });

  it('404는 「없음」 문구로 실린다', async () => {
    const { outcome } = await runTool(getLocalTestClass, { class_name: 'zcl_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.text).toBe(
      'Error: Failed to read local test class: Local test class for ZCL_TEST not found',
    );
  });

  it('423은 잠금 문구다', async () => {
    const { outcome } = await runTool(getLocalTestClass, { class_name: 'zcl_test' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.text).toBe('Error: Class ZCL_TEST is locked by another user.');
  });

  it('406은 한 줄로 끝난다 — URL도 응답 조각도 붙이지 않는다', async () => {
    const { outcome } = await runTool(getLocalTestClass, { class_name: 'zcl_test' }, () => ({
      status: 406,
      body: 'not acceptable here',
    }));

    expect(outcome.text).toBe(
      'Error: Local test class read not supported on this system (HTTP 406).',
    );
  });
});
