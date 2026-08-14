/**
 * `GetPackageTree` — 발행 계약 · 노출 집합 · 왕복 순서 · 트리 조립 · 구의 실측 갈래.
 *
 * ## 기대값을 어디서 뽑았나 (자기확인 회피)
 *
 * 요청 목록과 트리는 **구 패키지의 `getPackageHierarchy`를 가짜 접속에 물려
 * 실제로 돌려서** 받은 것이다
 * (`@babamba2/mcp-abap-adt-clients/dist/core/shared/packageHierarchy.js:311-389`).
 * 아래 픽스처는 그때 물린 것과 같은 XML이고, 기대값은 그 실행의 출력이다.
 *
 * 그 실행이 드러낸 구의 실측 넷을 시험이 고정한다.
 *  - **`NODE_ID`의 앞자리 0이 사라진다**(`000001` → `1`). 파서가 숫자로 바꾼다.
 *  - **`DEVC*` 종류는 종류별 왕복에서 건너뛴다** — 하위 패키지는 뿌리 응답에 있다.
 *  - **`include_subpackages: false`는 하위 패키지를 목록에서 빼지 않고** 그 안으로
 *    안 들어갈 뿐이다(자식이 빈 노드로 남는다).
 *  - **`include_descriptions`는 요청 인자와 출력 양쪽에 걸린다.**
 */

import { getPackageTree, mapAdtTypeToCodeFormat, mapAdtTypeToSupported } from '../getPackageTree';
import {
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';
import type { RecordedRequest, Reply } from './support';

const PATH = '/sap/bc/adt/repository/nodestructure';

function nodeXml(
  nodes: { type: string; name: string; nodeId: string; parentId?: string; description?: string }[],
  types: { type: string; nodeId: string }[],
): string {
  const nodeEls = nodes
    .map(
      (n) =>
        '<SEU_ADT_REPOSITORY_OBJ_NODE>' +
        `<OBJECT_TYPE>${n.type}</OBJECT_TYPE>` +
        `<OBJECT_NAME>${n.name}</OBJECT_NAME>` +
        `<NODE_ID>${n.nodeId}</NODE_ID>` +
        `<PARENT_NODE_ID>${n.parentId ?? ''}</PARENT_NODE_ID>` +
        `<DESCRIPTION>${n.description ?? ''}</DESCRIPTION>` +
        '</SEU_ADT_REPOSITORY_OBJ_NODE>',
    )
    .join('');
  const typeEls = types
    .map(
      (t) =>
        '<SEU_ADT_OBJECT_TYPE_INFO>' +
        `<OBJECT_TYPE>${t.type}</OBJECT_TYPE>` +
        `<NODE_ID>${t.nodeId}</NODE_ID>` +
        '</SEU_ADT_OBJECT_TYPE_INFO>',
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
    `<TREE_CONTENT>${nodeEls}</TREE_CONTENT>` +
    `<OBJECT_TYPES>${typeEls}</OBJECT_TYPES>` +
    '</DATA></asx:values></asx:abap>'
  );
}

const ROOT = nodeXml(
  [{ type: 'DEVC/K', name: 'ZSUB', nodeId: '000010', description: 'Sub package' }],
  [
    { type: 'CLAS/OC', nodeId: '000001' },
    // DEVC/K가 종류 표에 있어도 왕복이 나가지 않아야 한다.
    { type: 'DEVC/K', nodeId: '000002' },
  ],
);
const CLASSES = nodeXml(
  [{ type: 'CLAS/OC', name: 'ZCL_ONE', nodeId: '000101', description: 'One' }],
  [],
);
const SUB_ROOT = nodeXml([], [{ type: 'PROG/P', nodeId: '000003' }]);
const SUB_PROGS = nodeXml(
  [{ type: 'PROG/P', name: 'ZPROG', nodeId: '000201', description: 'Prog' }],
  [],
);

/** 앞자리 0이 사라진 뒤의 node_id로 갈라 준다 — 구가 실제로 보내는 값이다. */
function respond(request: RecordedRequest): Reply {
  const params = new URL(request.url).searchParams;
  const name = params.get('parent_name');
  const nodeId = params.get('node_id');
  if (name === 'ZPKG' && nodeId === null) return { status: 200, body: ROOT };
  if (name === 'ZPKG' && nodeId === '1') return { status: 200, body: CLASSES };
  if (name === 'ZSUB' && nodeId === null) return { status: 200, body: SUB_ROOT };
  if (name === 'ZSUB' && nodeId === '3') return { status: 200, body: SUB_PROGS };
  return { status: 200, body: nodeXml([], []) };
}

afterEach(() => {
  cleanupTempDirs();
});

async function call(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest) => Reply = respond,
) {
  const { outcome, requests } = await runTool(getPackageTree, args, csrfAware(reply));
  const sent = toolRequests(requests);
  return {
    outcome,
    sent,
    payload: outcome.isError ? null : JSON.parse(outcome.text),
    // 왕복마다 (parent_name, node_id) 한 쌍으로 줄여 본다.
    calls: sent.map((request) => {
      const params = new URL(request.url).searchParams;
      return [params.get('parent_name'), params.get('node_id')];
    }),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getPackageTree);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetPackageTree'));
    } finally {
      await harness.close();
    }
  });

  it('sets는 high가 아니라 system이다 — readonly 조건에서도 떠야 한다', () => {
    // 구 경로는 `handlers/system/high/`지만 채록본은 이 도구를 네 조건 전부에
    // 올려 둔다. `readonly`가 `system`을 함께 켜므로(exposition.ts:167-174)
    // `system`이라야 그 넷이 맞는다. `high`로 두면 readonly 두 조건에서 빠진다.
    expect(getPackageTree.definition.sets).toEqual(['system']);
    expect(getPackageTree.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getPackageTree.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('POST 한 종류로만 돌고 헤더가 구와 같다', async () => {
    const { sent } = await call({ package_name: 'ZPKG' });

    expect(sent.every((request) => request.method === 'POST')).toBe(true);
    expect(sent.every((request) => new URL(request.url).pathname === PATH)).toBe(true);
    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
    );
    expect(sent[0]?.headers['Content-Type']).toBe(
      'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
    );
  });

  it('뿌리 요청의 질의 인자와 본문이 구와 같다', async () => {
    const { sent } = await call({ package_name: 'ZPKG' });

    expect(new URL(sent[0]?.url ?? '').search).toBe(
      '?parent_type=DEVC%2FK&parent_name=ZPKG&parent_tech_name=ZPKG&withShortDescriptions=true',
    );
    // node_id가 없을 때 TV_NODEKEY의 기본값은 여섯 자리다.
    expect(sent[0]?.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>',
    );
  });

  it('⚠ NODE_ID의 앞자리 0이 사라진 채 나간다 (구의 실측)', async () => {
    const { sent } = await call({ package_name: 'ZPKG' });
    const typed = sent[1];

    // 픽스처는 000001인데 요청은 1이다.
    expect(new URL(typed?.url ?? '').searchParams.get('node_id')).toBe('1');
    expect(typed?.body).toContain('<TV_NODEKEY>1</TV_NODEKEY>');
  });

  it('DEVC 종류는 종류별 왕복에서 건너뛴다', async () => {
    const { calls } = await call({ package_name: 'ZPKG' });

    // 뿌리 → CLAS 종류 → 하위 패키지 뿌리 → 하위의 PROG 종류. DEVC(000002)는 없다.
    expect(calls).toEqual([
      ['ZPKG', null],
      ['ZPKG', '1'],
      ['ZSUB', null],
      ['ZSUB', '3'],
    ]);
  });

  it('패키지 이름은 대문자로 올려 보낸다', async () => {
    const { calls, payload } = await call({ package_name: 'zpkg' });

    expect(calls[0]?.[0]).toBe('ZPKG');
    expect(payload.package_name).toBe('ZPKG');
  });
});

describe('트리 조립 — 구 코드가 낸 것과 같다', () => {
  it('하위 패키지가 자기 자식을 안고 들어온다', async () => {
    const { payload } = await call({ package_name: 'ZPKG' });

    expect(payload.tree).toEqual({
      name: 'ZPKG',
      adtType: 'DEVC/K',
      type: 'package',
      is_package: true,
      codeFormat: 'xml',
      restoreStatus: 'ok',
      children: [
        {
          name: 'ZSUB',
          adtType: 'DEVC/K',
          type: 'package',
          is_package: true,
          codeFormat: 'xml',
          restoreStatus: 'ok',
          children: [
            {
              name: 'ZPROG',
              adtType: 'PROG/P',
              type: 'program',
              description: 'Prog',
              is_package: false,
              codeFormat: 'source',
              restoreStatus: 'ok',
              children: [],
            },
          ],
        },
        {
          name: 'ZCL_ONE',
          adtType: 'CLAS/OC',
          type: 'class',
          description: 'One',
          is_package: false,
          codeFormat: 'source',
          restoreStatus: 'ok',
          children: [],
        },
      ],
    });
  });

  it('metadata는 실제로 쓰인 값을 되비춘다', async () => {
    const { payload } = await call({ package_name: 'ZPKG' });

    expect(payload.metadata).toEqual({
      include_subpackages: true,
      max_depth: 5,
      include_descriptions: true,
    });
  });

  it('들여쓰기 2칸 JSON이다', async () => {
    const { outcome, payload } = await call({ package_name: 'ZPKG' });

    expect(outcome.text).toBe(JSON.stringify(payload, null, 2));
  });
});

describe('구의 실측 갈래', () => {
  it('include_subpackages:false는 하위 패키지를 남기되 안으로 안 들어간다', async () => {
    const { calls, payload } = await call({ package_name: 'ZPKG', include_subpackages: false });

    // ZSUB 안으로 들어가는 왕복 둘이 사라진다.
    expect(calls).toEqual([
      ['ZPKG', null],
      ['ZPKG', '1'],
    ]);
    // 그래도 목록에는 남는다 — 자식이 빈 채로.
    expect(payload.tree.children[0]).toMatchObject({ name: 'ZSUB', children: [] });
    expect(payload.tree.children[1].name).toBe('ZCL_ONE');
  });

  it('include_descriptions:false는 요청 인자와 출력 양쪽에 걸린다', async () => {
    const { sent, payload } = await call({ package_name: 'ZPKG', include_descriptions: false });

    expect(new URL(sent[0]?.url ?? '').searchParams.get('withShortDescriptions')).toBe('false');
    expect(payload.tree.children[1].description).toBeUndefined();
    expect(payload.metadata.include_descriptions).toBe(false);
  });

  it('⚠ max_depth:0은 0이 아니라 5로 읽힌다 (구의 `|| 5`)', async () => {
    const { calls, payload } = await call({ package_name: 'ZPKG', max_depth: 0 });

    // 0이 그대로 먹었다면 왕복이 한 건도 없어야 한다. 실제로는 기본값 5로 돈다.
    expect(calls).toHaveLength(4);
    expect(payload.metadata.max_depth).toBe(5);
  });

  it('max_depth:1이면 하위 패키지 안으로 들어가지 않는다', async () => {
    const { calls } = await call({ package_name: 'ZPKG', max_depth: 1 });

    expect(calls).toEqual([
      ['ZPKG', null],
      ['ZPKG', '1'],
    ]);
  });

  it('종류별 왕복 하나가 실패해도 그 종류만 빠지고 계속 간다', async () => {
    const { calls, payload } = await call({ package_name: 'ZPKG' }, (request) => {
      const params = new URL(request.url).searchParams;
      if (params.get('parent_name') === 'ZPKG' && params.get('node_id') === '1') {
        return { status: 500, body: 'boom' };
      }
      return respond(request);
    });

    // 왕복은 그대로 시도되고, ZCL_ONE만 결과에서 빠진다.
    expect(calls).toHaveLength(4);
    expect(payload.tree.children.map((child: { name: string }) => child.name)).toEqual(['ZSUB']);
  });

  it('뿌리 왕복이 실패하면 통째로 실패한다', async () => {
    const { outcome } = await call({ package_name: 'ZPKG' }, () => ({ status: 500, body: 'boom' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });

  it('빈 package_name은 접속을 꺼내기 전에 거절한다', async () => {
    const { outcome, sent } = await call({ package_name: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: package_name is required');
    expect(sent).toHaveLength(0);
  });
});

describe('타입 표를 그대로 옮겼다', () => {
  it('정확 일치가 접두사보다 먼저다', () => {
    expect(mapAdtTypeToSupported('TABL/DS')).toBe('structure');
    expect(mapAdtTypeToSupported('TABL/DT')).toBe('table');
    expect(mapAdtTypeToSupported('FUGR/FF')).toBe('functionModule');
    expect(mapAdtTypeToSupported('FUGR/F')).toBe('functionGroup');
    expect(mapAdtTypeToSupported('CLAS/XX')).toBe('class');
    expect(mapAdtTypeToSupported('NOPE/XX')).toBeUndefined();
  });

  it('codeFormat은 DEVC·DOMA·DTEL·FUGR/F만 xml이다', () => {
    expect(mapAdtTypeToCodeFormat('DEVC/K')).toBe('xml');
    expect(mapAdtTypeToCodeFormat('DOMA/DD')).toBe('xml');
    expect(mapAdtTypeToCodeFormat('DTEL/DE')).toBe('xml');
    expect(mapAdtTypeToCodeFormat('FUGR/F')).toBe('xml');
    // FUGR/FF는 FUGR/F 정확 일치에 안 걸리고 접두사 규칙으로 source가 된다.
    expect(mapAdtTypeToCodeFormat('FUGR/FF')).toBe('source');
    expect(mapAdtTypeToCodeFormat('CLAS/OC')).toBe('source');
    expect(mapAdtTypeToCodeFormat('NOPE/XX')).toBeUndefined();
  });
});
