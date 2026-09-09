/**
 * GrepObjects 핸들러 계약.
 *
 * 타입마다 다른 소스 경로로 나가는지, 한 벌의 실패가 나머지의 훑기를 멈추지
 * 않는지, 그리고 나쁜 정규식이 **SAP에 한 바이트도 나가기 전에** 걸리는지.
 */

import { grepObjects } from '../grepObjects';
import { TEST_ORIGIN, cleanupTempDirs, csrfAware, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

interface Aggregate {
  total_matches: number;
  truncated: boolean;
  results: Array<{
    object_type: string;
    object_name: string;
    function_group?: string;
    matches: Array<{ line: number; text: string; context_before: string[]; context_after: string[] }>;
  }>;
  skipped: Array<{ object: string; reason: string }>;
}

const NODE_PATH = '/sap/bc/adt/repository/nodestructure';

/** 노드 구조 응답 — `getObjectInfo.test.ts`와 같은 조립. */
function treeXml(
  nodes: { type?: string; name?: string; nodeId?: string; uri?: string }[],
): string {
  const els = nodes
    .map((n) => {
      const parts: string[] = [];
      if (n.type !== undefined) parts.push(`<OBJECT_TYPE>${n.type}</OBJECT_TYPE>`);
      if (n.name !== undefined) parts.push(`<OBJECT_NAME>${n.name}</OBJECT_NAME>`);
      if (n.nodeId !== undefined) parts.push(`<NODE_ID>${n.nodeId}</NODE_ID>`);
      if (n.uri !== undefined) parts.push(`<OBJECT_URI>${n.uri}</OBJECT_URI>`);
      return `<SEU_ADT_REPOSITORY_OBJ_NODE>${parts.join('')}</SEU_ADT_REPOSITORY_OBJ_NODE>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
    `<TREE_CONTENT>${els}</TREE_CONTENT></DATA></asx:values></asx:abap>`
  );
}

/** 뿌리 — 함수모듈 묶음(000012)·인클루드 묶음(000013)·주소 없는 잡음 하나. */
const FG_ROOT = treeXml([
  { type: 'FUGR/FF', name: 'Function Modules', nodeId: '000012' },
  { type: 'FUGR/I', name: 'Includes', nodeId: '000013' },
  { type: 'FUGR/FX', name: 'Something else', nodeId: '000014' },
]);
const FG_MODULES = treeXml([
  { type: 'FUGR/FF', name: 'Z_FM_A', uri: '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a' },
  // 주소가 없는 마디는 실재하는 오브젝트로 보지 않는다(D3와 같은 원칙).
  { type: 'FUGR/FF', name: 'Z_FM_GHOST' },
]);
const FG_INCLUDES = treeXml([
  { type: 'FUGR/I', name: 'LZFG_ATOP', uri: '/sap/bc/adt/functions/groups/zfg_a/includes/lzfg_atop' },
  { type: 'FUGR/I', name: 'LZFG_AF01', uri: '/sap/bc/adt/functions/groups/zfg_a/includes/lzfg_af01' },
]);

describe('GrepObjects', () => {
  it('타입별 소스 경로로 GET을 보내고 일치 줄을 모아 준다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      {
        objects: [
          { object_type: 'CLAS', object_name: 'zcl_a' },
          { object_type: 'INCL', object_name: 'zincl_b' },
        ],
        pattern: 'SELECT',
      },
      (request) =>
        request.url.includes('/oo/classes/')
          ? { body: 'CLASS zcl_a DEFINITION.\n  SELECT * FROM mara.\nENDCLASS.' }
          : { body: 'no hits here' },
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_A/source/main?version=active`,
      `GET ${TEST_ORIGIN}/sap/bc/adt/programs/includes/ZINCL_B/source/main`,
    ]);

    expect(outcome.isError).toBe(false);
    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.results).toEqual([
      {
        object_type: 'CLAS',
        object_name: 'zcl_a',
        matches: [
          { line: 2, text: '  SELECT * FROM mara.', context_before: [], context_after: [] },
        ],
      },
    ]);
    expect(aggregate.skipped).toEqual([]);
  });

  it('FUNC는 훑지 않고 이유를 남긴다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      { objects: [{ object_type: 'FUNC', object_name: 'z_fm_a' }], pattern: 'anything' },
      () => ({ body: '' }),
    );

    expect(requests).toHaveLength(0);
    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.skipped).toEqual([
      {
        object: 'FUNC z_fm_a',
        reason:
          'Function module source requires both function_module_name and function_group_name; not resolvable from object_name alone. Use object_type "FUGR" with the function group name to search the whole group instead.',
      },
    ]);
  });

  it('한 벌을 못 읽어도 나머지는 계속 훑는다', async () => {
    const { outcome } = await runTool(
      grepObjects,
      {
        objects: [
          { object_type: 'CLAS', object_name: 'zcl_missing' },
          { object_type: 'PROG', object_name: 'zprog_ok' },
        ],
        pattern: 'WRITE',
      },
      (request) =>
        request.url.includes('zcl_missing') || request.url.includes('ZCL_MISSING')
          ? { status: 404, body: '' }
          : { body: "REPORT zprog_ok.\nWRITE 'x'." },
    );

    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.results[0]?.object_name).toBe('zprog_ok');
    expect(aggregate.skipped[0]?.object).toBe('CLAS zcl_missing');
    expect(aggregate.skipped[0]?.reason).toMatch(/^Failed to fetch source: /);
  });

  it('나쁜 정규식은 접속을 얻기 전에 거절된다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      { objects: [{ object_type: 'CLAS', object_name: 'zcl_a' }], pattern: '([unclosed' },
      () => ({ body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Invalid regex pattern "\(\[unclosed": /);
    expect(requests).toHaveLength(0);
  });

  it('빈 objects 배열은 인자 오류다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      { objects: [], pattern: 'x' },
      () => ({ body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('objects must be a non-empty array (1-50 entries)');
    expect(requests).toHaveLength(0);
  });
});

// ── D151 — FUGR는 전개해서 훑는다 ────────────────────────────────────────────

describe('D151 — FUGR는 함수모듈·인클루드로 전개해 훑는다 (구는 메타데이터를 훑어 조용한 0이었다)', () => {
  /** 노드 구조 세 왕복 + 구성원 소스를 답하는 응답기 (노드 구조는 POST라 CSRF 왕복이 앞선다). */
  function fgResponder(sources: Record<string, string>) {
    return csrfAware((request) => {
      const url = new URL(request.url);
      if (url.pathname === NODE_PATH) {
        const nodeId = url.searchParams.get('node_id');
        if (nodeId === '000012') return { body: FG_MODULES };
        if (nodeId === '000013') return { body: FG_INCLUDES };
        if (nodeId === null) return { body: FG_ROOT };
        return { body: treeXml([]) };
      }
      for (const [suffix, body] of Object.entries(sources)) {
        if (url.pathname.endsWith(suffix)) return { body };
      }
      return { status: 404, body: 'not found' };
    });
  }

  const line = (request: { method: string; url: string }): string => {
    const url = new URL(request.url);
    return `${request.method} ${url.pathname}${url.search}`;
  };

  it('뿌리 → 묶음 마디 둘 → 잎의 OBJECT_URI로 소스를 읽고, 구성원 이름으로 보고한다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      { objects: [{ object_type: 'FUGR', object_name: 'zfg_a' }], pattern: 'SELECT' },
      fgResponder({
        '/fmodules/z_fm_a/source/main':
          'FUNCTION z_fm_a.\n  SELECT SINGLE * FROM mara INTO @DATA(ls).\nENDFUNCTION.',
        '/includes/lzfg_atop/source/main': 'FUNCTION-POOL zfg_a.',
        '/includes/lzfg_af01/source/main':
          'FORM helper.\n  SELECT * FROM marc INTO TABLE @DATA(lt).\nENDFORM.',
      }),
    );

    const sent = toolRequests(requests).map(line);
    // 노드 구조 네 왕복 — 뿌리는 node_id 없이, 묶음은 그 NODE_ID로. 부모는 뿌리 오브젝트 그대로.
    // 묶음 마디는 **종류를 가리지 않고** 걷는다(FUGR/FX도) — 실제 마디 타입이 채록되지 않아
    // FF·I만 고르면 진짜 마디를 놓칠 수 있기 때문이다. 잎에서 FF·I만 고른다.
    expect(sent.slice(0, 4)).toEqual([
      `POST ${NODE_PATH}?parent_type=FUGR%2FF&parent_name=ZFG_A&parent_tech_name=ZFG_A&withShortDescriptions=true`,
      `POST ${NODE_PATH}?parent_type=FUGR%2FF&parent_name=ZFG_A&parent_tech_name=ZFG_A&withShortDescriptions=true&node_id=000012`,
      `POST ${NODE_PATH}?parent_type=FUGR%2FF&parent_name=ZFG_A&parent_tech_name=ZFG_A&withShortDescriptions=true&node_id=000013`,
      `POST ${NODE_PATH}?parent_type=FUGR%2FF&parent_name=ZFG_A&parent_tech_name=ZFG_A&withShortDescriptions=true&node_id=000014`,
    ]);
    // 구성원 소스는 ADT가 준 주소 + /source/main · 활성 판. 주소 없는 유령은 읽지 않는다.
    expect(sent.slice(4).sort()).toEqual([
      'GET /sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a/source/main?version=active',
      'GET /sap/bc/adt/functions/groups/zfg_a/includes/lzfg_af01/source/main?version=active',
      'GET /sap/bc/adt/functions/groups/zfg_a/includes/lzfg_atop/source/main?version=active',
    ]);
    // 함수그룹 메타데이터는 더 이상 읽지 않는다.
    expect(sent).not.toContain('GET /sap/bc/adt/functions/groups/ZFG_A');

    expect(outcome.isError).toBe(false);
    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.total_matches).toBe(2);
    expect(aggregate.results).toEqual([
      {
        object_type: 'FUGR/FF',
        object_name: 'Z_FM_A',
        function_group: 'ZFG_A',
        matches: [
          {
            line: 2,
            text: '  SELECT SINGLE * FROM mara INTO @DATA(ls).',
            context_before: [],
            context_after: [],
          },
        ],
      },
      {
        object_type: 'FUGR/I',
        object_name: 'LZFG_AF01',
        function_group: 'ZFG_A',
        matches: [
          {
            line: 2,
            text: '  SELECT * FROM marc INTO TABLE @DATA(lt).',
            context_before: [],
            context_after: [],
          },
        ],
      },
    ]);
    expect(aggregate.skipped).toEqual([]);
  });

  it('전개가 죽으면 조용한 0이 아니라 skipped에 이유가 실린다', async () => {
    const { outcome } = await runTool(
      grepObjects,
      {
        objects: [
          { object_type: 'FUGR', object_name: 'zfg_a' },
          { object_type: 'PROG', object_name: 'zprog_ok' },
        ],
        pattern: 'WRITE',
      },
      csrfAware((request) =>
        new URL(request.url).pathname === NODE_PATH
          ? { status: 500, body: '<exc:exception><message>boom</message></exc:exception>' }
          : { body: "REPORT zprog_ok.\nWRITE 'x'." },
      ),
    );

    const aggregate = JSON.parse(outcome.text) as Aggregate;
    // 다른 오브젝트는 계속 훑는다.
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.skipped).toHaveLength(1);
    expect(aggregate.skipped[0]?.object).toBe('FUGR zfg_a');
    expect(aggregate.skipped[0]?.reason).toMatch(/^Could not expand function group ZFG_A/);
    expect(aggregate.skipped[0]?.reason).toContain('Nothing in the group was scanned');
  });

  it('전개 결과가 비어도 skipped에 남는다 — 「봤는데 없다」로 읽히지 않게', async () => {
    const { outcome } = await runTool(
      grepObjects,
      { objects: [{ object_type: 'FUGR', object_name: 'zfg_empty' }], pattern: 'x' },
      csrfAware(() => ({ body: treeXml([]) })),
    );

    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.total_matches).toBe(0);
    expect(aggregate.skipped).toEqual([
      {
        object: 'FUGR zfg_empty',
        reason:
          'Function group ZFG_EMPTY expanded to no function modules or includes (the repository node structure returned no FUGR/FF or FUGR/I leaf with an address) — nothing was scanned.',
      },
    ]);
  });

  it('구성원 하나를 못 읽어도 나머지 구성원은 훑고, 그 하나는 그룹 이름과 함께 skipped에 남는다', async () => {
    const { outcome } = await runTool(
      grepObjects,
      { objects: [{ object_type: 'FUGR', object_name: 'zfg_a' }], pattern: 'FUNCTION' },
      fgResponder({
        '/fmodules/z_fm_a/source/main': 'FUNCTION z_fm_a.\nENDFUNCTION.',
        '/includes/lzfg_atop/source/main': 'FUNCTION-POOL zfg_a.',
        // lzfg_af01은 404로 떨어진다.
      }),
    );

    const aggregate = JSON.parse(outcome.text) as Aggregate;
    // `FUNCTION z_fm_a.` · `ENDFUNCTION.` · `FUNCTION-POOL zfg_a.` — 셋이 일치한다.
    expect(aggregate.total_matches).toBe(3);
    expect(aggregate.skipped).toEqual([
      {
        object: 'FUGR/I LZFG_AF01 (in ZFG_A)',
        reason: expect.stringMatching(/^Failed to fetch source: /),
      },
    ]);
  });
});
