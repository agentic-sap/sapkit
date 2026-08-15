/**
 * `GetFunctionGroup` — 발행 계약 · 노출 선언 · 와이어 · 실패 문구.
 *
 * 기대값의 출처는 구 엔진이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - URL·Accept·`version` 무시 →
 *    `@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/AdtFunctionGroup.js:214-232`
 *    와 `core/functionGroup/read.js:14-24`
 *  - 실패 문구 세 갈래 →
 *    `engine/src/handlers/function_group/high/handleGetFunctionGroup.ts:79-121`
 *
 * 404 문구에 **마침표가 없는 것**을 일부러 못 박는다. 구에서 404는 위임 계층이
 * `undefined`로 접어 핸들러가 자기 예외를 던지는 경로를 타므로 `error.response`가
 * 없고, 그래서 전용 404 분기(마침표 있음)가 아니라 일반 문구에 감싸여 나온다.
 * "정리"하면 그 경로 차이가 지워진다.
 */

import { getFunctionGroup } from '../getFunctionGroup';
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

const FG_PATH = `${TEST_ORIGIN}/sap/bc/adt/functions/groups/ZFG_TEST`;
const FG_BODY = '<group:abapFunctionGroup adtcore:name="ZFG_TEST" adtcore:description="lab"/>';

const ARGS = { function_group_name: 'zfg_test' };

interface Payload {
  success: boolean;
  function_group_name: string;
  version: string;
  function_group_data: string;
  status: number;
  status_text: string;
}

async function call(
  args: Record<string, unknown> = ARGS,
  reply: Parameters<typeof runTool>[2] = () => ({ body: FG_BODY }),
): Promise<{ payload: Payload; isError: boolean; text: string; calls: string[]; accepts: string[] }> {
  const { outcome, requests } = await runTool(getFunctionGroup, args, reply);
  const sent = toolRequests(requests);
  return {
    payload: outcome.isError ? ({} as Payload) : (JSON.parse(outcome.text) as Payload),
    isError: outcome.isError,
    text: outcome.text,
    calls: sent.map((request) => `${request.method} ${request.url}`),
    accepts: sent.map((request) => request.headers['Accept'] ?? ''),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getFunctionGroup);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetFunctionGroup'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/function_group/high/` → high 집합. 채록본의 네 노출
    // 조건 중 `*_default` 두 곳에만 뜨고 `*_readonly`에는 뜨지 않는다.
    expect(getFunctionGroup.definition.sets).toEqual(['high']);
    expect(getFunctionGroup.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getFunctionGroup.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET 한 번, 이름은 대문자, Accept는 와일드카드다', async () => {
    const { calls, accepts, payload } = await call();

    expect(calls).toEqual([`GET ${FG_PATH}`]);
    expect(accepts).toEqual(['*/*']);
    expect(payload.function_group_data).toBe(FG_BODY);
  });

  it('version=inactive를 줘도 요청은 한 글자도 달라지지 않는다', async () => {
    const active = await call({ ...ARGS, version: 'active' });
    const inactive = await call({ ...ARGS, version: 'inactive' });

    expect(inactive.calls).toEqual(active.calls);
    expect(inactive.calls.some((entry) => entry.includes('version'))).toBe(false);
    expect(inactive.payload.version).toBe('inactive');
  });

  it('상태 코드와 표준 사유 문구를 함께 싣는다', async () => {
    const { payload } = await call();

    expect(payload).toEqual({
      success: true,
      function_group_name: 'ZFG_TEST',
      version: 'active',
      function_group_data: FG_BODY,
      status: 200,
      status_text: 'OK',
    });
  });
});

describe('실패 문구 — 구의 예외 경로가 세 갈래로 갈린다', () => {
  it('404는 마침표 없이 일반 문구에 감싸여 나온다', async () => {
    const { isError, text } = await call(ARGS, () => ({ status: 404, body: '' }));

    expect(isError).toBe(true);
    expect(text).toBe('Error: Failed to read function group: FunctionGroup ZFG_TEST not found');
  });

  it('423은 마침표가 붙은 전용 문구다', async () => {
    const { isError, text } = await call(ARGS, () => ({ status: 423, body: '' }));

    expect(isError).toBe(true);
    expect(text).toBe('Error: FunctionGroup ZFG_TEST is locked by another user.');
  });

  it('그 밖의 실패는 원인 문구를 그대로 달고 나온다', async () => {
    const { isError, text } = await call(ARGS, () => ({ status: 500, body: 'boom' }));

    expect(isError).toBe(true);
    expect(text.startsWith('Error: Failed to read function group: ')).toBe(true);
    expect(text).not.toContain('not found');
  });

  it('빈 이름은 구와 같은 문구로 거절한다', async () => {
    const { isError, text, calls } = await call({ function_group_name: '' });

    expect(isError).toBe(true);
    expect(text).toBe('Error: function_group_name is required');
    // 인자 검증은 접속을 만들기 전에 끝난다.
    expect(calls).toEqual([]);
  });
});
