/**
 * `GetLocalMacros` — 발행 계약 · 와이어 · 갈래.
 *
 * 형제 셋과 달리 **406을 따로 다루지 않는다**. 매크로는 구형 릴리스에만 있는
 * 개념이라 신형에서 406이 흔한데도 구 핸들러는 그 가지를 짓지 않았다
 * (`engine/src/handlers/class/high/handleGetLocalMacros.ts:98-104`) — 그 사실을
 * 시험이 붙잡아 둔다. 형제와 같아 보이게 손보면 표면이 갈라진다.
 */

import { getLocalMacros } from '../getLocalMacros';
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

const BASE = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/includes/macros`;
const CODE = 'DEFINE mac.\nEND-OF-DEFINITION.';

interface Payload {
  success: boolean;
  class_name: string;
  version: string;
  macros_code: string;
  status: number;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getLocalMacros);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetLocalMacros'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언 — 채록본의 default 두 집합에만 뜬다', () => {
    expect(getLocalMacros.definition.sets).toEqual(['high']);
    expect(getLocalMacros.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getLocalMacros.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('macros 인클루드를 활성 판으로 읽는다', async () => {
    const { requests } = await runTool(getLocalMacros, { class_name: 'zcl_test' }, () => ({
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
      getLocalMacros,
      { class_name: 'zcl_test', version: 'inactive' },
      () => ({ body: CODE }),
    );

    expect(toolRequests(requests)[0]?.url).toBe(`${BASE}?version=workingArea`);
  });
});

describe('응답', () => {
  it('소스를 macros_code 키로 싣는다', async () => {
    const { outcome } = await runTool(getLocalMacros, { class_name: 'zcl_test' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      macros_code: CODE,
      status: 200,
    });
  });
});

describe('갈래', () => {
  it('class_name이 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(getLocalMacros, { class_name: '' }, () => ({
      body: CODE,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: class_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });

  it('404는 「없음」 문구로 실린다', async () => {
    const { outcome } = await runTool(getLocalMacros, { class_name: 'zcl_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.text).toBe(
      'Error: Failed to read local macros: Local macros for ZCL_TEST not found',
    );
  });

  it('423은 잠금 문구다', async () => {
    const { outcome } = await runTool(getLocalMacros, { class_name: 'zcl_test' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.text).toBe('Error: Class ZCL_TEST is locked by another user.');
  });

  it('406에 전용 문구가 없다 — 구가 그 가지를 짓지 않았다', async () => {
    const { outcome } = await runTool(getLocalMacros, { class_name: 'zcl_test' }, () => ({
      status: 406,
      body: 'not acceptable',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('Failed to read local macros:');
    expect(outcome.text).not.toContain('not supported on this system');
  });
});
