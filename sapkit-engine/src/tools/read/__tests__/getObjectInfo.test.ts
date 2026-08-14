/**
 * `GetObjectInfo` — 발행 계약 · 와이어 · 노드 갈래 판정 · 깊이 · **enrich 수리**.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/system/readonly/handleGetObjectInfo.ts:41-309`)의 소스와,
 * 요청 조립부인
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/nodeStructure.js:29-56`에서
 * 뽑았다.
 *
 * ## 이 시험이 구와 **일부러 다른** 한 곳
 *
 * 「enrich가 실제로 채운다」 절은 구의 동작을 재현하지 않는다. 구에서는
 * `enrich`가 언제나 빈손이었고(장부 등재분 「GetObjectInfo의 enrich」 참조),
 * 이 시험이 그 등재의 **대체 기대 시험**이다 — 고친 쪽이 옳다는 것을 여기서
 * 증명한다.
 */

import { getDefaultDepth, getObjectInfo } from '../getObjectInfo';
import {
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';
import type { RecordedRequest, Reply } from './support';

const NODE_PATH = '/sap/bc/adt/repository/nodestructure';
const SEARCH_PATH = '/sap/bc/adt/repository/informationsystem/search';

function treeXml(
  nodes: {
    type?: string;
    name?: string;
    nodeId?: string;
    parentNodeId?: string;
    uri?: string;
  }[],
): string {
  const els = nodes
    .map((n) => {
      const parts: string[] = [];
      if (n.type !== undefined) parts.push(`<OBJECT_TYPE>${n.type}</OBJECT_TYPE>`);
      if (n.name !== undefined) parts.push(`<OBJECT_NAME>${n.name}</OBJECT_NAME>`);
      if (n.nodeId !== undefined) parts.push(`<NODE_ID>${n.nodeId}</NODE_ID>`);
      if (n.parentNodeId !== undefined)
        parts.push(`<PARENT_NODE_ID>${n.parentNodeId}</PARENT_NODE_ID>`);
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

/** 뿌리(0000): 묶음 노드 하나 + 말단 잎 하나 + 어느 쪽도 아닌 것 하나. */
const ROOT_XML = treeXml([
  { type: 'CLAS/OCN', name: 'METHODS', nodeId: '000021', parentNodeId: '0000' },
  { type: 'CLAS/OC', name: 'ZCL_LEAF', parentNodeId: '0000', uri: '/sap/bc/adt/oo/classes/zcl_leaf' },
  { type: 'JUNK' },
]);

/** 묶음 노드 안(000021): 말단 잎 둘. */
const GROUP_XML = treeXml([
  { type: 'CLAS/OM', name: 'DO_WORK', parentNodeId: '000021', uri: '/sap/bc/adt/oo/classes/zcl_a/methods/do_work' },
  { type: 'CLAS/OM', name: 'DO_MORE', parentNodeId: '000021', uri: '/sap/bc/adt/oo/classes/zcl_a/methods/do_more' },
]);

function searchXml(name: string, type: string, description: string, pkg: string): string {
  return (
    '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
    `<adtcore:objectReference adtcore:name="${name}" adtcore:type="${type}" ` +
    `adtcore:description="${description}" adtcore:packageName="${pkg}"/>` +
    '</adtcore:objectReferences>'
  );
}

afterEach(() => {
  cleanupTempDirs();
});

/** 기본 응답기 — 검색은 빈 결과, 노드 구조는 위 픽스처. */
function respond(request: RecordedRequest): Reply {
  const url = new URL(request.url);
  if (url.pathname === SEARCH_PATH) {
    return {
      status: 200,
      body: '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>',
    };
  }
  const nodeId = url.searchParams.get('node_id');
  if (nodeId === '0000') return { status: 200, body: ROOT_XML };
  if (nodeId === '000021') return { status: 200, body: GROUP_XML };
  return { status: 200, body: treeXml([]) };
}

async function call(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest) => Reply = respond,
) {
  const { outcome, requests } = await runTool(getObjectInfo, args, csrfAware(reply));
  const sent = toolRequests(requests);
  return {
    outcome,
    sent,
    payload: outcome.isError ? null : JSON.parse(outcome.text),
    nodeCalls: sent
      .filter((request) => new URL(request.url).pathname === NODE_PATH)
      .map((request) => new URL(request.url).searchParams.get('node_id')),
    searchCalls: sent.filter((request) => new URL(request.url).pathname === SEARCH_PATH).length,
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getObjectInfo);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetObjectInfo'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getObjectInfo.definition.sets).toEqual(['readonly']);
    expect(getObjectInfo.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getObjectInfo.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('뿌리 요청은 node_id=0000이고 TV_NODEKEY도 0000이다 (네 자리)', async () => {
    const { sent } = await call({ parent_type: 'CLAS/OC', parent_name: 'ZCL_A', enrich: false });
    const first = sent[0];

    expect(first?.method).toBe('POST');
    expect(new URL(first?.url ?? '').pathname).toBe(NODE_PATH);
    expect(new URL(first?.url ?? '').search).toBe(
      '?parent_type=CLAS%2FOC&parent_name=ZCL_A&parent_tech_name=ZCL_A&withShortDescriptions=true&node_id=0000',
    );
    // 패키지 트리 쪽 기본값 000000(여섯 자리)과 다르다.
    expect(first?.body).toContain('<TV_NODEKEY>0000</TV_NODEKEY>');
  });

  it('헤더는 nodestructure 계열 그대로다', async () => {
    const { sent } = await call({ parent_type: 'CLAS/OC', parent_name: 'ZCL_A', enrich: false });

    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
    );
    expect(sent[0]?.headers['Content-Type']).toBe(
      'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
    );
  });

  it('NODE_ID의 앞자리 0이 살아남는다 (parseTagValue:false)', async () => {
    // 여기가 xml-js 교체의 핵심이다. 기본 파서였다면 000021이 21이 되어
    // 두 번째 요청이 다른 노드를 가리킨다.
    const { nodeCalls } = await call({
      parent_type: 'CLAS/OC',
      parent_name: 'ZCL_A',
      maxDepth: 2,
      enrich: false,
    });

    expect(nodeCalls).toEqual(['0000', '000021']);
  });
});

describe('노드 갈래 판정과 깊이', () => {
  it('maxDepth 1이면 말단 잎만 담고 묶음 노드는 버린다', async () => {
    const { payload, nodeCalls } = await call({
      parent_type: 'CLAS/OC',
      parent_name: 'ZCL_A',
      maxDepth: 1,
      enrich: false,
    });

    // 더 내려가지 않으므로 왕복은 하나뿐이다.
    expect(nodeCalls).toEqual(['0000']);
    expect(payload).toEqual({
      OBJECT_TYPE: 'CLAS/OC',
      OBJECT_NAME: 'ZCL_A',
      CHILDREN: [
        { OBJECT_TYPE: 'CLAS/OC', OBJECT_NAME: 'ZCL_LEAF', PARENT_NODE_ID: '0000' },
      ],
    });
  });

  it('maxDepth 2면 묶음 노드로 한 단계 더 내려간다', async () => {
    const { payload } = await call({
      parent_type: 'CLAS/OC',
      parent_name: 'ZCL_A',
      maxDepth: 2,
      enrich: false,
    });

    expect(payload.CHILDREN).toEqual([
      {
        OBJECT_TYPE: 'CLAS/OCN',
        OBJECT_NAME: 'METHODS',
        PARENT_NODE_ID: '0000',
        CHILDREN: [
          { OBJECT_TYPE: 'CLAS/OM', OBJECT_NAME: 'DO_WORK', PARENT_NODE_ID: '000021' },
          { OBJECT_TYPE: 'CLAS/OM', OBJECT_NAME: 'DO_MORE', PARENT_NODE_ID: '000021' },
        ],
      },
      { OBJECT_TYPE: 'CLAS/OC', OBJECT_NAME: 'ZCL_LEAF', PARENT_NODE_ID: '0000' },
    ]);
  });

  it('묶음도 잎도 아닌 노드는 버린다', async () => {
    const { payload } = await call({
      parent_type: 'CLAS/OC',
      parent_name: 'ZCL_A',
      maxDepth: 1,
      enrich: false,
    });

    // 픽스처의 세 번째 노드(JUNK)는 어디에도 없다.
    expect(JSON.stringify(payload)).not.toContain('JUNK');
  });

  it('getDefaultDepth — PROG·FUGR만 2다 (스키마 기본값 때문에 실제로는 안 닿는다)', () => {
    expect(getDefaultDepth('PROG/P')).toBe(2);
    expect(getDefaultDepth('FUGR/FF')).toBe(2);
    expect(getDefaultDepth('CLAS/OC')).toBe(1);
    expect(getDefaultDepth('')).toBe(1);
  });
});

describe('enrich가 실제로 채운다 (장부 등재분의 대체 기대 시험)', () => {
  it('기본값에서 SearchObject를 불러 설명과 패키지를 채운다', async () => {
    const { payload, searchCalls } = await call(
      { parent_type: 'CLAS/OC', parent_name: 'ZCL_A', maxDepth: 1 },
      (request) =>
        new URL(request.url).pathname === SEARCH_PATH
          ? { status: 200, body: searchXml('ZCL_A', 'CLAS/OC', 'A demo class', 'ZPKG') }
          : respond(request),
    );

    expect(searchCalls).toBe(1);
    expect(payload.OBJECT_DESCRIPTION).toBe('A demo class');
    expect(payload.OBJECT_PACKAGE).toBe('ZPKG');
    // 검색이 알려 준 종류가 이긴다.
    expect(payload.OBJECT_TYPE).toBe('CLAS/OC');
  });

  it('enrich:false면 SearchObject를 아예 부르지 않는다', async () => {
    const { payload, searchCalls } = await call({
      parent_type: 'CLAS/OC',
      parent_name: 'ZCL_A',
      maxDepth: 1,
      enrich: false,
    });

    expect(searchCalls).toBe(0);
    expect(payload.OBJECT_DESCRIPTION).toBeUndefined();
    expect(payload.OBJECT_PACKAGE).toBeUndefined();
  });

  it('이름이 다르면 채우지 않는다 — 구와 같은 대조 조건', async () => {
    const { payload } = await call(
      { parent_type: 'CLAS/OC', parent_name: 'ZCL_A', maxDepth: 1 },
      (request) =>
        new URL(request.url).pathname === SEARCH_PATH
          ? { status: 200, body: searchXml('ZCL_OTHER', 'CLAS/OC', 'Someone else', 'ZPKG') }
          : respond(request),
    );

    expect(payload.OBJECT_DESCRIPTION).toBeUndefined();
    expect(payload.OBJECT_PACKAGE).toBeUndefined();
  });

  it('검색이 실패해도 트리는 그대로 나온다 — 보강은 부가 정보다', async () => {
    const { payload } = await call(
      { parent_type: 'CLAS/OC', parent_name: 'ZCL_A', maxDepth: 1 },
      (request) =>
        new URL(request.url).pathname === SEARCH_PATH
          ? { status: 500, body: 'boom' }
          : respond(request),
    );

    expect(payload.OBJECT_NAME).toBe('ZCL_A');
    expect(payload.CHILDREN).toHaveLength(1);
    expect(payload.OBJECT_DESCRIPTION).toBeUndefined();
  });
});

describe('오류 갈래', () => {
  it('빈 parent_name은 접속을 꺼내기 전에 거절한다', async () => {
    const { outcome, sent } = await call({ parent_type: 'CLAS/OC', parent_name: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('MCP error -32602: parent_type and parent_name are required');
    expect(sent).toHaveLength(0);
  });

  it('뿌리 왕복이 실패하면 오류다 — 구는 ADT error 접두사를 붙이지 않는다', async () => {
    const { outcome } = await call(
      { parent_type: 'CLAS/OC', parent_name: 'ZCL_A', enrich: false },
      () => ({ status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('ADT error:')).toBe(false);
  });
});
