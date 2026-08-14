/**
 * `ReadFunctionModule` — 발행 계약 · 노출 선언 · 와이어 · 갈래.
 *
 * 기대값의 출처는 **구 엔진**이지 이 구현이 아니다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 곁읽기 기본값·경고 문구 → 구 엔진 자체 시험
 *    `engine/src/__tests__/handleReadFunctionModule.test.ts` (계약 정본)
 *  - URL·Accept → `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:269-326`
 *
 * 마지막 절이 **`GetFunctionModule`과의 차이를 못 박는다.** 이름이 비슷한 두
 * 도구를 대충 같게 지으면 그 차이가 조용히 사라지므로, 같은 인자를 두 도구에
 * 먹여 서로 다른 것을 시험이 직접 견준다.
 */

import { getFunctionModule } from '../getFunctionModule';
import { readFunctionModule } from '../readFunctionModule';
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

const BASE = `${TEST_ORIGIN}/sap/bc/adt/functions/groups/ZFG_TEST/fmodules/Z_FM_TEST`;
const SOURCE_PATH = `${BASE}/source/main`;
const ACTIVE_SOURCE = 'FUNCTION z_fm_test. active. ENDFUNCTION.';
const INACTIVE_SOURCE = 'FUNCTION z_fm_test. INACTIVE EDIT. ENDFUNCTION.';
const METADATA = '<fmodule:abapFunctionModule adtcore:name="Z_FM_TEST"/>';

const ARGS = { function_module_name: 'z_fm_test', function_group_name: 'zfg_test' };

interface Payload {
  success: boolean;
  function_module_name: string;
  function_group_name: string;
  version: string;
  source_code: string | null;
  metadata: string | null;
  warning?: string;
}

/** 소스는 버전에 따라, 그 밖의 GET은 메타데이터로 답한다. */
const serve: Parameters<typeof runTool>[2] = (request) => {
  if (request.url.includes('/source/main')) {
    return { body: request.url.includes('version=inactive') ? INACTIVE_SOURCE : ACTIVE_SOURCE };
  }
  return { body: METADATA };
};

async function call(
  args: Record<string, unknown> = ARGS,
  reply: Parameters<typeof runTool>[2] = serve,
): Promise<{ payload: Payload; isError: boolean; calls: string[]; accepts: string[] }> {
  const { outcome, requests } = await runTool(readFunctionModule, args, reply);
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
    const harness = await harnessFor(readFunctionModule);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('ReadFunctionModule'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/function_module/readonly/` → readonly 집합.
    // 채록본의 네 노출 조건 중 `*_readonly` 두 곳에도 이 도구가 뜬다.
    expect(readFunctionModule.definition.sets).toEqual(['readonly']);
    expect(readFunctionModule.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(readFunctionModule.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('소스 → 메타데이터 순으로 두 번 GET 한다', async () => {
    const { calls, accepts } = await call();

    expect(calls).toEqual([`GET ${SOURCE_PATH}?version=active`, `GET ${BASE}`]);
    // 소스는 text/plain, 메타데이터는 fmodules 세 판을 늘어놓은 Accept.
    expect(accepts[0]).toBe('text/plain');
    expect(accepts[1]).toBe(
      'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
    );
  });

  it('이름을 대문자로 올려 경로에 넣고 응답에도 대문자로 싣는다', async () => {
    const { payload } = await call();

    expect(payload.function_module_name).toBe('Z_FM_TEST');
    expect(payload.function_group_name).toBe('ZFG_TEST');
    expect(payload.source_code).toBe(ACTIVE_SOURCE);
    expect(payload.metadata).toBe(METADATA);
  });

  it('version=inactive는 소스 질의 인자에만 실린다 (메타데이터 경로는 그대로)', async () => {
    const { calls, payload } = await call({ ...ARGS, version: 'inactive' });

    expect(calls).toEqual([`GET ${SOURCE_PATH}?version=inactive`, `GET ${BASE}`]);
    expect(payload.version).toBe('inactive');
    expect(payload.source_code).toBe(INACTIVE_SOURCE);
  });
});

describe('곁읽기는 옵트인이다 (구 엔진 시험이 정본)', () => {
  it('기본값에서는 비활성 판을 읽지 않고 경고도 붙이지 않는다', async () => {
    const { calls, payload } = await call();

    expect(calls.some((entry) => entry.includes('version=inactive'))).toBe(false);
    expect(payload.warning).toBeUndefined();
  });

  it('check_inactive=true이고 비활성 판이 다르면 경고를 붙인다', async () => {
    const { calls, payload } = await call({ ...ARGS, check_inactive: true });

    expect(calls).toEqual([
      `GET ${SOURCE_PATH}?version=active`,
      `GET ${BASE}`,
      `GET ${SOURCE_PATH}?version=inactive`,
    ]);
    expect(payload.warning).toContain('inactive (unactivated) version');
  });

  it('check_inactive=true라도 비활성 판이 같으면 경고가 없다', async () => {
    const { payload } = await call({ ...ARGS, check_inactive: true }, (request) =>
      request.url.includes('/source/main') ? { body: ACTIVE_SOURCE } : { body: METADATA },
    );

    expect(payload.warning).toBeUndefined();
  });

  it('version=inactive를 직접 읽으면 곁읽기가 없다', async () => {
    const { calls } = await call({ ...ARGS, version: 'inactive', check_inactive: true });

    expect(calls.filter((entry) => entry.includes('version=inactive'))).toHaveLength(1);
  });

  it('본 읽기가 빈손이면 곁읽기를 시도하지 않는다', async () => {
    const { calls, payload } = await call({ ...ARGS, check_inactive: true }, (request) =>
      request.url.includes('/source/main')
        ? { status: 404, body: '' }
        : { body: METADATA },
    );

    expect(calls).toEqual([`GET ${SOURCE_PATH}?version=active`, `GET ${BASE}`]);
    expect(payload.source_code).toBeNull();
    expect(payload.warning).toBeUndefined();
  });
});

describe('읽기 실패는 오류가 아니라 null이다', () => {
  it('소스·메타데이터가 모두 404여도 success:true에 null 두 개다', async () => {
    const { isError, payload } = await call(ARGS, () => ({ status: 404, body: 'not found' }));

    expect(isError).toBe(false);
    expect(payload).toEqual({
      success: true,
      function_module_name: 'Z_FM_TEST',
      function_group_name: 'ZFG_TEST',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('메타데이터만 실패하면 소스는 살아 있다', async () => {
    const { isError, payload } = await call(ARGS, (request) =>
      request.url.includes('/source/main')
        ? { body: ACTIVE_SOURCE }
        : { status: 500, body: 'boom' },
    );

    expect(isError).toBe(false);
    expect(payload.source_code).toBe(ACTIVE_SOURCE);
    expect(payload.metadata).toBeNull();
  });

  it('빈 본문은 빈 문자열이 아니라 null로 접힌다 (구의 truthy 검사)', async () => {
    const { payload } = await call(ARGS, () => ({ body: '' }));

    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });
});

describe('GetFunctionModule과의 차이 — 같은 인자를 두 도구에 먹여 견준다', () => {
  it('노출 집합이 갈린다: Read=readonly · Get=high', () => {
    expect(readFunctionModule.definition.sets).toEqual(['readonly']);
    expect(getFunctionModule.definition.sets).toEqual(['high']);
  });

  it('Read는 메타데이터를 더 읽고, Get은 소스만 읽는다', async () => {
    const read = await runTool(readFunctionModule, ARGS, serve);
    const get = await runTool(getFunctionModule, { ...ARGS, check_inactive: false }, serve);

    expect(toolRequests(read.requests).map((request) => request.url)).toEqual([
      `${SOURCE_PATH}?version=active`,
      BASE,
    ]);
    expect(toolRequests(get.requests).map((request) => request.url)).toEqual([
      `${SOURCE_PATH}?version=active`,
    ]);
  });

  it('곁읽기 기본값이 반대다: Read=꺼짐 · Get=켜짐', async () => {
    const read = await runTool(readFunctionModule, ARGS, serve);
    const get = await runTool(getFunctionModule, ARGS, serve);

    const inactiveReads = (requests: ReturnType<typeof toolRequests>) =>
      requests.filter((request) => request.url.includes('version=inactive')).length;

    expect(inactiveReads(toolRequests(read.requests))).toBe(0);
    expect(inactiveReads(toolRequests(get.requests))).toBe(1);
  });

  it('응답 키가 다르다: Read=source_code/metadata · Get=function_module_data/status', async () => {
    const read = await runTool(readFunctionModule, ARGS, serve);
    const get = await runTool(getFunctionModule, { ...ARGS, check_inactive: false }, serve);

    expect(Object.keys(JSON.parse(read.outcome.text) as object)).toEqual([
      'success',
      'function_module_name',
      'function_group_name',
      'version',
      'source_code',
      'metadata',
    ]);
    expect(Object.keys(JSON.parse(get.outcome.text) as object)).toEqual([
      'success',
      'function_module_name',
      'function_group_name',
      'version',
      'function_module_data',
      'status',
      'status_text',
    ]);
  });

  it('404에서 갈린다: Read는 null을 담은 성공, Get은 오류다', async () => {
    const notFound = () => ({ status: 404, body: '' });
    const read = await runTool(readFunctionModule, ARGS, notFound);
    const get = await runTool(getFunctionModule, ARGS, notFound);

    expect(read.outcome.isError).toBe(false);
    expect(get.outcome.isError).toBe(true);
    expect(get.outcome.text).toBe('Error: FunctionModule Z_FM_TEST not found.');
  });
});
