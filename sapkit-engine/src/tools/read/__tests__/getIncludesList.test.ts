/**
 * `GetIncludesList` — 발행 계약 · 와이어(노드 구조 **두 번**) · 갈래 ·
 * **차이 장부 D3의 대체 기대 시험**.
 *
 * D3는 spec §2.4의 M1 사전 등재 3건 중 하나이고, 이 도구를 짓는 판에서 휴면이
 * 활성으로 바뀐다. 아래 「장부 D3」 절이 그 항목의 대체 기대 시험이다 —
 * `harness/replay/divergences.ts`의 D3 `substituteTest`가 이 파일을 지목한다.
 *
 * 전송은 주입된 가짜다. SAP에 붙지 않는다.
 */

import { getIncludesList, withDeadline } from '../getIncludesList';
import { NODE_STRUCTURE_ACCEPT, NODE_STRUCTURE_CONTENT_TYPE } from '../internal/nodeStructure';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const NODE_PATH = '/sap/bc/adt/repository/nodestructure';
const INCLUDES_NODE_ID = '000012';

/** 루트 마디 응답 — 「인클루드」 마디의 NODE_ID를 알려 주는 자리. */
function rootXml(nodeId: string = INCLUDES_NODE_ID): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><TREE_CONTENT>' +
    '<SEU_ADT_OBJECT_TYPE_INFO>' +
    '<OBJECT_TYPE>PROG/P</OBJECT_TYPE><NODE_ID>000001</NODE_ID>' +
    '<OBJECT_TYPE_LABEL>Program</OBJECT_TYPE_LABEL>' +
    '</SEU_ADT_OBJECT_TYPE_INFO>' +
    '<SEU_ADT_OBJECT_TYPE_INFO>' +
    `<OBJECT_TYPE>PROG/I</OBJECT_TYPE><NODE_ID>${nodeId}</NODE_ID>` +
    '<OBJECT_TYPE_LABEL>Includes</OBJECT_TYPE_LABEL>' +
    '</SEU_ADT_OBJECT_TYPE_INFO>' +
    '</TREE_CONTENT>'
  );
}

/** 인클루드 마디 하나. `uri`가 없으면 ADT가 주소를 못 준 항목이다. */
function node(name: string, uri: string | null = `/sap/bc/adt/programs/includes/${name}`): string {
  return (
    '<SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '<OBJECT_TYPE>PROG/I</OBJECT_TYPE>' +
    `<OBJECT_NAME>${name}</OBJECT_NAME>` +
    (uri === null ? '' : `<OBJECT_URI>${uri}</OBJECT_URI>`) +
    '</SEU_ADT_REPOSITORY_OBJ_NODE>'
  );
}

const includesXml = (...nodes: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?><TREE_CONTENT>${nodes.join('')}</TREE_CONTENT>`;

/**
 * 루트 → 인클루드 마디 순으로 답하는 전송.
 *
 * 왕복 번호가 아니라 **질의 인자**로 가른다 — POST 앞의 CSRF 토큰 왕복이 번호를
 * 한 칸씩 밀기 때문이다.
 */
function tree(root: string, includes: string) {
  return csrfAware((request) => ({
    body: request.url.includes('node_id=000000') ? root : includes,
  }));
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getIncludesList);
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
      }).toEqual(publishedDeclaration('GetIncludesList'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/include/readonly/` → readonly 집합.
    // 채록본 `exposures` 네 조건 전부에 뜬다 — 무프로파일(cloud) 축에도 있다.
    expect(getIncludesList.definition.sets).toEqual(['readonly']);
    expect(getIncludesList.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getIncludesList.definition.kind).toBe('read');
  });
});

describe('와이어 — 노드 구조를 두 번 묻는다', () => {
  it('루트 마디를 먼저 묻고, 거기서 얻은 node_id로 다시 묻는다', async () => {
    const { requests } = await runTool(
      getIncludesList,
      { object_name: 'zprog_main', object_type: 'PROG/P' },
      tree(rootXml(), includesXml(node('ZINC_A'))),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(2);
    for (const request of sent) {
      expect(request.method).toBe('POST');
      expect(request.url.startsWith(`${TEST_ORIGIN}${NODE_PATH}?`)).toBe(true);
      expect(request.headers['Accept']).toBe(NODE_STRUCTURE_ACCEPT);
      expect(request.headers['Content-Type']).toBe(NODE_STRUCTURE_CONTENT_TYPE);
      // 이름은 대문자로 올려 보낸다 — 구 `:164`.
      expect(request.url).toContain('parent_name=ZPROG_MAIN');
      expect(request.url).toContain('parent_tech_name=ZPROG_MAIN');
      expect(request.url).toContain('withShortDescriptions=true');
    }

    expect(sent[0]?.url).toContain('node_id=000000');
    expect(sent[0]?.body).toContain('<TV_NODEKEY>000000</TV_NODEKEY>');
    expect(sent[1]?.url).toContain(`node_id=${INCLUDES_NODE_ID}`);
    expect(sent[1]?.body).toContain(`<TV_NODEKEY>${INCLUDES_NODE_ID}</TV_NODEKEY>`);
  });

  it('object_type은 손대지 않고 parent_type으로 그대로 나간다', async () => {
    const { requests } = await runTool(
      getIncludesList,
      { object_name: 'ZCL_X', object_type: 'CLAS/OC' },
      tree(rootXml(), includesXml(node('ZINC_A'))),
    );

    expect(toolRequests(requests)[0]?.url).toContain('parent_type=CLAS%2FOC');
  });
});

describe('응답 모양', () => {
  it('기본은 이름을 줄바꿈으로 이은 평문이다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZPROG_MAIN', object_type: 'PROG/P' },
      tree(rootXml(), includesXml(node('ZINC_A'), node('ZINC_B'))),
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('ZINC_A\nZINC_B');
  });

  it('detailed면 구가 싣던 키를 그대로 실은 JSON이다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZPROG_MAIN', object_type: 'PROG/P', detailed: true },
      tree(rootXml(), includesXml(node('ZINC_A'))),
    );

    expect(JSON.parse(outcome.text)).toEqual({
      object_name: 'ZPROG_MAIN',
      object_type: 'PROG/P',
      detailed: true,
      total_includes: 1,
      includes: ['ZINC_A'],
      includes_node_info: { name: 'PROG/I', node_id: INCLUDES_NODE_ID, label: 'Includes' },
    });
  });

  it('같은 이름이 두 번 오면 한 번만 남는다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZPROG_MAIN', object_type: 'PROG/P' },
      tree(rootXml(), includesXml(node('ZINC_A'), node('ZINC_A'))),
    );

    expect(outcome.text).toBe('ZINC_A');
  });

  it('인클루드 마디 자체가 없으면 빈손이 아니라 문장으로 답한다', async () => {
    const rootWithoutIncludes =
      '<TREE_CONTENT><SEU_ADT_OBJECT_TYPE_INFO>' +
      '<OBJECT_TYPE>PROG/P</OBJECT_TYPE><NODE_ID>000001</NODE_ID>' +
      '<OBJECT_TYPE_LABEL>Program</OBJECT_TYPE_LABEL>' +
      '</SEU_ADT_OBJECT_TYPE_INFO></TREE_CONTENT>';

    const { outcome, requests } = await runTool(
      getIncludesList,
      { object_name: 'zprog_main', object_type: 'PROG/P' },
      csrfAware(() => ({ body: rootWithoutIncludes })),
    );

    expect(outcome.isError).toBe(false);
    // 문구에는 호출자가 준 원본 철자가 그대로 들어간다.
    expect(outcome.text).toBe("No includes found in PROG/P 'zprog_main'.");
    expect(toolRequests(requests)).toHaveLength(1);
  });

  it('object_name이 비면 구와 같은 문장으로 거절한다', async () => {
    const { outcome, requests } = await runTool(
      getIncludesList,
      { object_name: '   ', object_type: 'PROG/P' },
      () => ({ body: '' }),
    );

    expect(outcome.isError).toBe(true);
    // 구의 `MCP error -32602: ` 접두사는 장부 D34가 등재한 차이다.
    expect(outcome.text).toBe('Error: Parameter "object_name" (string) is required and cannot be empty.');
    expect(requests).toHaveLength(0);
  });
});

describe('장부 D3 — `INCLUDE … IF FOUND`가 남긴 비실재 이름을 싣지 않는다', () => {
  /**
   * 판정 규칙: **ADT가 주소(`OBJECT_URI`)를 주지 않은 마디는 실재하는 오브젝트가
   * 아니다.** 근거는 구 엔진 자신의 분류다 —
   * `engine/src/handlers/system/readonly/handleGetObjectInfo.ts:135-145`가 같은
   * 노드 구조 응답에서 `OBJECT_NAME` + `OBJECT_URI`를 가진 마디만 실물 잎으로,
   * `OBJECT_URI`가 없는 마디는 묶음 마디로 가른다.
   */
  it('주소 없는 마디는 목록에서 빠지고, 있는 마디는 그대로 남는다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZUNIVR5120', object_type: 'PROG/P' },
      tree(rootXml(), includesXml(node('ZINC_REAL'), node('ZUNIVI_H011', null))),
    );

    expect(outcome.text).toBe('ZINC_REAL');
  });

  it('빈 주소도 주소 없음으로 본다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZUNIVR5120', object_type: 'PROG/P' },
      tree(rootXml(), includesXml(node('ZINC_REAL'), node('ZUNIVI_H011', ''))),
    );

    expect(outcome.text).toBe('ZINC_REAL');
  });

  it('구는 그 이름을 실었다 — 빠진 것을 detailed가 이름으로 말한다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZUNIVR5120', object_type: 'PROG/P', detailed: true },
      tree(rootXml(), includesXml(node('ZINC_REAL'), node('ZUNIVI_H011', null))),
    );

    expect(JSON.parse(outcome.text)).toMatchObject({
      total_includes: 1,
      includes: ['ZINC_REAL'],
      unresolved_includes: ['ZUNIVI_H011'],
    });
  });

  it('뺄 것이 없으면 detailed 모양은 구와 같다 — 키가 늘지 않는다', async () => {
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZPROG_MAIN', object_type: 'PROG/P', detailed: true },
      tree(rootXml(), includesXml(node('ZINC_A'))),
    );

    expect(Object.keys(JSON.parse(outcome.text))).not.toContain('unresolved_includes');
  });

  it('걸러 낸 뒤 목록이 비어도 폴백으로 흘러내리지 않는다', async () => {
    // PROG/I 마디는 있었으므로 폴백 조건이 아니다. 흘러내리면 D3가 무력해진다.
    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZPROG_MAIN', object_type: 'PROG/P' },
      tree(rootXml(), includesXml(node('ZUNIVI_H011', null))),
    );

    expect(outcome.text).toBe('');
  });
});

describe('폴백 — PROG/I 마디가 하나도 없을 때', () => {
  it('구와 같이 응답 안의 모든 OBJECT_NAME을 걷는다', async () => {
    const other =
      '<TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '<OBJECT_TYPE>FUGR/FF</OBJECT_TYPE><OBJECT_NAME>Z_FM_ONE</OBJECT_NAME>' +
      '</SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT>';

    const { outcome } = await runTool(
      getIncludesList,
      { object_name: 'ZPROG_MAIN', object_type: 'PROG/P' },
      tree(rootXml(), other),
    );

    expect(outcome.text).toBe('Z_FM_ONE');
  });
});

describe('timeout 인자는 실제로 마감을 건다', () => {
  it('제 시간에 끝나면 그 값이 그대로 나온다', async () => {
    await expect(withDeadline(Promise.resolve('ok'), 1000, '늦었다')).resolves.toBe('ok');
  });

  it('마감을 넘기면 준 문구로 거절한다', async () => {
    const never = new Promise<string>(() => {});
    await expect(withDeadline(never, 5, '늦었다')).rejects.toThrow('늦었다');
  });

  it('안쪽이 먼저 실패하면 그 실패가 나온다', async () => {
    const boom = Promise.reject(new Error('안쪽 실패'));
    await expect(withDeadline(boom, 1000, '늦었다')).rejects.toThrow('안쪽 실패');
  });
});
