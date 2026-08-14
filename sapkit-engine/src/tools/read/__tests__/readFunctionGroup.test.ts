/**
 * `ReadFunctionGroup` — 발행 계약 · 노출 선언 · 와이어 · 갈래.
 *
 * 기대값의 출처는 구 엔진이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 요청 수·URL·Accept →
 *    `@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/AdtFunctionGroup.js:214-277`
 *    와 `core/functionGroup/read.js:14-24`
 *
 * 이 파일이 못 박는 두 실측:
 *  ⑴ **`version`이 와이어에 나가지 않는다** — 구 위임 계층이 그 인자를 버린다.
 *  ⑵ **같은 GET이 두 번 나간다** — 메타데이터가 소스와 같은 응답에서 나온다.
 * 둘 다 겉 선언만 보고 지으면 반드시 틀리는 자리다.
 *
 * 마지막 절은 `GetFunctionGroup`과의 차이를 같은 인자로 견준다.
 */

import { getFunctionGroup } from '../getFunctionGroup';
import { readFunctionGroup } from '../readFunctionGroup';
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
  source_code: string | null;
  metadata: string | null;
}

async function call(
  args: Record<string, unknown> = ARGS,
  reply: Parameters<typeof runTool>[2] = () => ({ body: FG_BODY }),
): Promise<{
  payload: Payload;
  isError: boolean;
  calls: string[];
  accepts: string[];
}> {
  const { outcome, requests } = await runTool(readFunctionGroup, args, reply);
  const sent = toolRequests(requests);
  return {
    payload: JSON.parse(outcome.text) as Payload,
    isError: outcome.isError,
    calls: sent.map((request) => `${request.method} ${request.url}`),
    accepts: sent.map((request) => request.headers['Accept'] ?? ''),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readFunctionGroup);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('ReadFunctionGroup'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/function_group/readonly/` → readonly 집합.
    expect(readFunctionGroup.definition.sets).toEqual(['readonly']);
    expect(readFunctionGroup.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(readFunctionGroup.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('같은 GET이 두 번 나간다 — 메타데이터가 소스와 같은 응답에서 나온다', async () => {
    const { calls, accepts, payload } = await call();

    expect(calls).toEqual([`GET ${FG_PATH}`, `GET ${FG_PATH}`]);
    expect(accepts).toEqual(['*/*', '*/*']);
    expect(payload.source_code).toBe(FG_BODY);
    expect(payload.metadata).toBe(FG_BODY);
  });

  it('이름을 대문자로 올려 경로에 넣는다', async () => {
    const { calls, payload } = await call({ function_group_name: 'zfg_test' });

    expect(calls[0]).toBe(`GET ${FG_PATH}`);
    expect(payload.function_group_name).toBe('ZFG_TEST');
  });

  it('version=inactive를 줘도 요청은 한 글자도 달라지지 않는다', async () => {
    const active = await call({ ...ARGS, version: 'active' });
    const inactive = await call({ ...ARGS, version: 'inactive' });

    expect(inactive.calls).toEqual(active.calls);
    expect(inactive.calls.some((entry) => entry.includes('version'))).toBe(false);
    // 인자는 응답에 되비칠 뿐이다.
    expect(active.payload.version).toBe('active');
    expect(inactive.payload.version).toBe('inactive');
  });
});

describe('읽기 실패는 오류가 아니라 null이다', () => {
  it('404여도 success:true에 null 두 개다', async () => {
    const { isError, payload, calls } = await call(ARGS, () => ({ status: 404, body: '' }));

    expect(isError).toBe(false);
    expect(calls).toHaveLength(2);
    expect(payload).toEqual({
      success: true,
      function_group_name: 'ZFG_TEST',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('둘째 왕복만 실패하면 첫째 값은 살아 있다', async () => {
    const { payload } = await call(ARGS, (_request, index) =>
      index === 0 ? { body: FG_BODY } : { status: 500, body: 'boom' },
    );

    expect(payload.source_code).toBe(FG_BODY);
    expect(payload.metadata).toBeNull();
  });

  it('빈 본문은 빈 문자열이 아니라 null로 접힌다', async () => {
    const { payload } = await call(ARGS, () => ({ body: '' }));

    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });
});

describe('인자 검증', () => {
  it('빈 이름은 구와 같은 문구로 거절한다', async () => {
    const { outcome } = await runTool(readFunctionGroup, { function_group_name: '' }, () => ({
      body: FG_BODY,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: function_group_name is required');
  });
});

describe('GetFunctionGroup과의 차이 — 같은 인자를 두 도구에 먹여 견준다', () => {
  it('노출 집합이 갈린다: Read=readonly · Get=high', () => {
    expect(readFunctionGroup.definition.sets).toEqual(['readonly']);
    expect(getFunctionGroup.definition.sets).toEqual(['high']);
  });

  it('요청 수가 갈린다: Read=2회 · Get=1회 (URL은 같다)', async () => {
    const read = await runTool(readFunctionGroup, ARGS, () => ({ body: FG_BODY }));
    const get = await runTool(getFunctionGroup, ARGS, () => ({ body: FG_BODY }));

    expect(toolRequests(read.requests).map((request) => request.url)).toEqual([
      FG_PATH,
      FG_PATH,
    ]);
    expect(toolRequests(get.requests).map((request) => request.url)).toEqual([FG_PATH]);
  });

  it('응답 키가 다르다: Read=source_code/metadata · Get=function_group_data/status', async () => {
    const read = await runTool(readFunctionGroup, ARGS, () => ({ body: FG_BODY }));
    const get = await runTool(getFunctionGroup, ARGS, () => ({ body: FG_BODY }));

    expect(Object.keys(JSON.parse(read.outcome.text) as object)).toEqual([
      'success',
      'function_group_name',
      'version',
      'source_code',
      'metadata',
    ]);
    expect(Object.keys(JSON.parse(get.outcome.text) as object)).toEqual([
      'success',
      'function_group_name',
      'version',
      'function_group_data',
      'status',
      'status_text',
    ]);
  });

  it('404에서 갈린다: Read는 null을 담은 성공, Get은 오류다', async () => {
    const notFound = () => ({ status: 404, body: '' });
    const read = await runTool(readFunctionGroup, ARGS, notFound);
    const get = await runTool(getFunctionGroup, ARGS, notFound);

    expect(read.outcome.isError).toBe(false);
    expect(get.outcome.isError).toBe(true);
  });

  it('둘 다 version을 와이어에 싣지 않는다 — 차이가 아니라 공통이다', async () => {
    const read = await runTool(readFunctionGroup, { ...ARGS, version: 'inactive' }, () => ({
      body: FG_BODY,
    }));
    const get = await runTool(getFunctionGroup, { ...ARGS, version: 'inactive' }, () => ({
      body: FG_BODY,
    }));

    for (const requests of [read.requests, get.requests]) {
      expect(toolRequests(requests).every((request) => !request.url.includes('version'))).toBe(
        true,
      );
    }
  });
});
