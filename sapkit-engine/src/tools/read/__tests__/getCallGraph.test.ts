/**
 * `GetCallGraph` — 발행 계약 · 두 방향의 와이어 · BFS 계약 · 조이기 · 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - BFS 계약 → `engine/src/lib/callGraph.ts:105-251`
 *    (**구 엔진 자체 시험 `engine/src/__tests__/unit/callGraph.test.ts`가 있는 자리**)
 *  - 확장기 배선·인자 조이기 → `engine/src/handlers/system/readonly/handleGetCallGraph.ts`
 *  - where-used 두 발 → `@babamba2/…/dist/core/shared/whereUsed.js:159-334`
 *  - 소스 스캐너 → `engine/src/lib/abapDependencyScan.ts`
 */

import { extractFunctionGroupFromUri, getCallGraph } from '../getCallGraph';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';
import type { RecordedRequest, Reply } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const SCOPE = '/sap/bc/adt/repository/informationsystem/usageReferences/scope';
const SEARCH_QUERY_MARK = 'usageReferences?uri=';

const SCOPE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
  '<usagereferences:objectType name="CLAS/OC" isSelected="false"/>' +
  '</usagereferences:usageScopeResult>';

/** where-used 결과 XML — `DEVC/K`는 담는 그릇이라 파서가 뺀다. */
const searchResult = (
  references: ReadonlyArray<{ name: string; type: string; uri?: string; parentUri?: string }>,
): string =>
  '<usagereferences:usageReferenceResult xmlns:usagereferences="x" numberOfResults="9">' +
  '<usagereferences:referencedObjects>' +
  references
    .map(
      (reference) =>
        `<usagereferences:referencedObject uri="${reference.uri ?? ''}"` +
        (reference.parentUri === undefined ? '' : ` parentUri="${reference.parentUri}"`) +
        '>' +
        `<usagereferences:adtObject adtcore:name="${reference.name}" adtcore:type="${reference.type}"/>` +
        '</usagereferences:referencedObject>',
    )
    .join('') +
  '</usagereferences:referencedObjects>' +
  '</usagereferences:usageReferenceResult>';

const isScope = (request: RecordedRequest): boolean => request.url.includes(SCOPE);
const isSearch = (request: RecordedRequest): boolean =>
  request.url.includes(SEARCH_QUERY_MARK) && !request.url.includes(SCOPE);
const isCsrf = (request: RecordedRequest): boolean => request.url.includes('/discovery');

/** 이름별로 where-used 응답을 정해 주는 전송. */
function whereUsedResponder(
  referencesFor: (uri: string) => ReadonlyArray<{
    name: string;
    type: string;
    uri?: string;
    parentUri?: string;
  }>,
): (request: RecordedRequest) => Reply {
  return (request) => {
    if (isCsrf(request)) return { headers: { 'x-csrf-token': 'TEST-TOKEN' } };
    if (isScope(request)) return { status: 200, body: SCOPE_XML };
    const uri = decodeURIComponent(/uri=([^&]*)/.exec(request.url)?.[1] ?? '');
    return { status: 200, body: searchResult(referencesFor(uri)) };
  };
}

interface Graph {
  root: string;
  direction: string;
  depth: number;
  truncated: boolean;
  stats: { node_count: number; edge_count: number; expanded: number; skipped_count: number };
  nodes: Array<{ id: string; depth: number; expandable: boolean }>;
  edges: Array<{ from: string; to: string; kind: string }>;
  skipped: Array<{ node: string; reason: string }>;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getCallGraph);
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
      }).toEqual(publishedDeclaration('GetCallGraph'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    expect(getCallGraph.definition.sets).toEqual(['readonly']);
    expect(getCallGraph.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getCallGraph.definition.kind).toBe('read');
  });
});

describe('와이어 — callers는 마디마다 where-used 두 발', () => {
  it('뿌리 하나에 scope → search 순으로 두 발이 나간다', async () => {
    const { requests } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'zcl_root', depth: 1 },
      whereUsedResponder(() => []),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toContain(SCOPE);
    // 이름은 대문자로 올라가고 URI는 통째로 인코딩된다.
    expect(decodeURIComponent(sent[0]?.url ?? '')).toContain(
      'uri=/sap/bc/adt/oo/classes/ZCL_ROOT',
    );
    expect(sent[0]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml',
    );
    expect(sent[1]?.url).toContain(SEARCH_QUERY_MARK);
    expect(sent[1]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
    );
    // 범위 응답이 본문에 끼워진다 — 바깥 요소 이름만 갈린다.
    expect(sent[1]?.body).toContain('<usagereferences:scope>');
    expect(sent[1]?.body).not.toContain('usageScopeResult');
  });

  it('`enable_all_types`가 없으므로 SAP의 기본 선택을 그대로 쓴다', async () => {
    const { requests } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 1 },
      whereUsedResponder(() => []),
    );

    // `isSelected="false"`가 `"true"`로 뒤집히지 않았다.
    expect(toolRequests(requests)[1]?.body).toContain('isSelected="false"');
  });
});

describe('BFS 계약', () => {
  it('발견한 이웃을 다음 층에서 다시 편다 (used_by 간선)', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 2 },
      whereUsedResponder((uri) =>
        uri.endsWith('ZCL_ROOT')
          ? [{ name: 'ZCL_CALLER', type: 'CLAS/OC', uri: '/sap/bc/adt/oo/classes/ZCL_CALLER' }]
          : [],
      ),
    );
    const graph = JSON.parse(outcome.text) as Graph;

    expect(graph.root).toBe('CLAS:ZCL_ROOT');
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['CLAS:ZCL_CALLER', 'CLAS:ZCL_ROOT']);
    // caller 역할이면 간선은 이웃 → 마디이고 종류가 `used_by`다.
    expect(graph.edges).toEqual([
      { from: 'CLAS:ZCL_CALLER', to: 'CLAS:ZCL_ROOT', kind: 'used_by' },
    ]);
    expect(graph.stats.expanded).toBe(2);
  });

  it('`custom_only`는 뿌리를 건드리지 않고 깊이 1부터 본다', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'CL_STANDARD', depth: 2 },
      whereUsedResponder((uri) =>
        uri.endsWith('CL_STANDARD')
          ? [{ name: 'CL_OTHER', type: 'CLAS/OC', uri: '/sap/bc/adt/oo/classes/CL_OTHER' }]
          : [],
      ),
    );
    const graph = JSON.parse(outcome.text) as Graph;

    // 뿌리는 표준이어도 한 번 편다(expanded 1) — 이웃은 표준이라 펴지 않는다.
    expect(graph.stats.expanded).toBe(2);
    expect(graph.nodes.find((node) => node.id === 'CLAS:CL_OTHER')?.expandable).toBe(false);
  });

  it('`max_nodes`에 닿으면 이웃을 통째로 버리고 truncated를 세운다', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 2, max_nodes: 1 },
      whereUsedResponder((uri) =>
        uri.endsWith('ZCL_ROOT')
          ? [{ name: 'ZCL_A', type: 'CLAS/OC', uri: '/sap/bc/adt/oo/classes/ZCL_A' }]
          : [],
      ),
    );
    const graph = JSON.parse(outcome.text) as Graph;

    expect(graph.truncated).toBe(true);
    expect(graph.stats.node_count).toBe(1);
    // 마디가 안 들어갔으면 간선도 안 들어간다 — 그래야 그래프가 어긋나지 않는다.
    expect(graph.edges).toEqual([]);
  });

  it('자기 참조는 이웃에서 버린다', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 1 },
      whereUsedResponder(() => [
        { name: 'ZCL_ROOT', type: 'CLAS/OC', uri: '/sap/bc/adt/oo/classes/ZCL_ROOT' },
      ]),
    );
    const graph = JSON.parse(outcome.text) as Graph;

    expect(graph.stats.node_count).toBe(1);
    expect(graph.edges).toEqual([]);
  });

  it('확장기가 던지면 삼켜서 skipped에 적고 순회는 이어진다', async () => {
    const { outcome } = await runTool(getCallGraph, { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 1 }, (request) =>
      isCsrf(request) ? { headers: { 'x-csrf-token': 'T' } } : { status: 500, body: 'boom' },
    );
    const graph = JSON.parse(outcome.text) as Graph;

    // 도구 자체는 성공한다 — 실패는 마디 하나의 사정이다.
    expect(outcome.isError).toBe(false);
    expect(graph.skipped).toHaveLength(1);
    expect(graph.skipped[0]?.node).toBe('CLAS:ZCL_ROOT');
    expect(graph.stats.skipped_count).toBe(1);
    expect(graph.nodes[0]?.expandable).toBe(false);
  });
});

describe('callees 방향', () => {
  it('소스를 읽어 정규식 스캐너로 이웃을 만든다 (calls 간선)', async () => {
    const source = [
      'CLASS zcl_root DEFINITION.',
      '  INTERFACES zif_thing.',
      '  DATA lo TYPE REF TO zcl_dep.',
      "  CALL FUNCTION 'Z_FIXTURE_FM'.",
      'ENDCLASS.',
    ].join('\n');

    const { outcome, requests } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', direction: 'callees', depth: 1 },
      (request) =>
        isCsrf(request) ? { headers: { 'x-csrf-token': 'T' } } : { status: 200, body: source },
    );
    const graph = JSON.parse(outcome.text) as Graph;
    const sent = toolRequests(requests);

    // where-used가 아니라 소스 읽기 한 발이다.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toContain('/sap/bc/adt/oo/classes/ZCL_ROOT/source/main');

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'CLAS:ZCL_ROOT', to: 'INTF:ZIF_THING', kind: 'calls' },
        { from: 'CLAS:ZCL_ROOT', to: 'CLAS:ZCL_DEP', kind: 'calls' },
        { from: 'CLAS:ZCL_ROOT', to: 'FUNC:Z_FIXTURE_FM', kind: 'calls' },
      ]),
    );
  });

  it('소스를 못 읽으면 **일부러 던져** skipped에 이유를 남긴다', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', direction: 'callees', depth: 1 },
      (request) =>
        isCsrf(request) ? { headers: { 'x-csrf-token': 'T' } } : { status: 404, body: 'gone' },
    );
    const graph = JSON.parse(outcome.text) as Graph;

    expect(graph.skipped).toHaveLength(1);
    expect(graph.skipped[0]?.reason).toContain('Failed to fetch source');
  });
});

describe('both 방향', () => {
  it('뿌리만 두 방향을 함께 편다 — where-used와 소스 읽기가 같이 나간다', async () => {
    const { outcome, requests } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', direction: 'both', depth: 1 },
      (request) => {
        if (isCsrf(request)) return { headers: { 'x-csrf-token': 'T' } };
        if (isScope(request)) return { status: 200, body: SCOPE_XML };
        if (isSearch(request)) {
          return {
            status: 200,
            body: searchResult([
              { name: 'ZCL_CALLER', type: 'CLAS/OC', uri: '/sap/bc/adt/oo/classes/ZCL_CALLER' },
            ]),
          };
        }
        return { status: 200, body: 'CLASS zcl_root DEFINITION.\n  DATA lo TYPE REF TO zcl_dep.\nENDCLASS.' };
      },
    );
    const graph = JSON.parse(outcome.text) as Graph;
    const urls = toolRequests(requests).map((request) => request.url);

    expect(urls.some((url) => url.includes(SCOPE))).toBe(true);
    expect(urls.some((url) => url.includes('/source/main'))).toBe(true);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'CLAS:ZCL_CALLER', to: 'CLAS:ZCL_ROOT', kind: 'used_by' },
        { from: 'CLAS:ZCL_ROOT', to: 'CLAS:ZCL_DEP', kind: 'calls' },
      ]),
    );
  });
});

describe('인자 조이기 — `||`라 0이 기본값이 된다', () => {
  it('depth: 0은 0이 아니라 2다', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 0 },
      whereUsedResponder(() => []),
    );

    expect((JSON.parse(outcome.text) as Graph).depth).toBe(2);
  });

  it('depth는 1~4로 조인다', async () => {
    const high = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 99 },
      whereUsedResponder(() => []),
    );

    expect((JSON.parse(high.outcome.text) as Graph).depth).toBe(4);
  });

  it('max_nodes: 0도 기본값 100으로 접힌다 (truncated가 서지 않는다)', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 1, max_nodes: 0 },
      whereUsedResponder(() => [
        { name: 'ZCL_A', type: 'CLAS/OC', uri: '/sap/bc/adt/oo/classes/ZCL_A' },
      ]),
    );
    const graph = JSON.parse(outcome.text) as Graph;

    expect(graph.truncated).toBe(false);
    expect(graph.stats.node_count).toBe(2);
  });
});

describe('FUNC 갈래', () => {
  it('뿌리가 FUNC면 function_group이 필수다 — 접속 전에 거절한다', async () => {
    const { outcome, requests } = await runTool(
      getCallGraph,
      { object_type: 'FUNC', object_name: 'Z_FM' },
      whereUsedResponder(() => []),
    );

    expect(outcome.isError).toBe(true);
    // 구 `:373-381` — 메시지 한 줄뿐이다. `Error: ` 접두사가 없다.
    expect(outcome.text).toBe('function_group is required when object_type is FUNC');
    expect(requests).toHaveLength(0);
  });

  it('FUNC 뿌리는 GROUP|NAME으로 where-used를 묻는다', async () => {
    const { requests } = await runTool(
      getCallGraph,
      { object_type: 'FUNC', object_name: 'z_fm', function_group: 'zfg', depth: 1 },
      whereUsedResponder(() => []),
    );

    expect(decodeURIComponent(toolRequests(requests)[0]?.url ?? '')).toContain(
      'uri=/sap/bc/adt/functions/groups/ZFG/fmodules/Z_FM',
    );
  });

  it('함수그룹을 URI에서 캐낸다 — uri, 없으면 parentUri', () => {
    expect(
      extractFunctionGroupFromUri('/sap/bc/adt/functions/groups/zfg/fmodules/z_fm'),
    ).toBe('ZFG');
    expect(extractFunctionGroupFromUri('/sap/bc/adt/oo/classes/ZCL_X')).toBeUndefined();
    expect(extractFunctionGroupFromUri(undefined)).toBeUndefined();
  });

  it('그룹을 못 캔 FUNC 이웃은 펴지 않는다 (구의 알려진 한계)', async () => {
    const { outcome } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: 'ZCL_ROOT', depth: 2 },
      whereUsedResponder((uri) =>
        uri.endsWith('ZCL_ROOT')
          ? [{ name: 'Z_FM', type: 'FUGR/FF', uri: '/no/group/here' }]
          : [],
      ),
    );
    const graph = JSON.parse(outcome.text) as Graph;

    expect(graph.nodes.find((node) => node.id === 'FUNC:Z_FM')?.expandable).toBe(false);
    expect(graph.skipped).toEqual([]);
  });
});

describe('갈래', () => {
  it('빈 object_name은 접속 전에 거절한다 — 요청 0건', async () => {
    const { outcome, requests } = await runTool(
      getCallGraph,
      { object_type: 'CLAS', object_name: '   ' },
      whereUsedResponder(() => []),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('object_name is required');
    expect(requests).toHaveLength(0);
  });
});
