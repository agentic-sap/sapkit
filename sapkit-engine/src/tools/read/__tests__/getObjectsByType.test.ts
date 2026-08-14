/**
 * `GetObjectsByType` — 발행 계약 · 와이어 · 파싱 · 표 접기 · 갈래.
 *
 * 파일 이름은 규약이다: `<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts`.
 *
 * 기대값은 **구 엔진 실측**에서 뽑았다 — 선언은 채록본
 * (`harness/old-surface/m1-tools.json`의 `tools`), 와이어는 벤더
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/nodeStructure.js:29-56`,
 * 문구는 `engine/src/handlers/search/readonly/handleGetObjectsByType.ts:180-243`.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { getObjectsByType } from '../getObjectsByType';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';
import type { Reply, RecordedRequest } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const NODE_STRUCTURE = '/sap/bc/adt/repository/nodestructure';

const ACCEPT =
  'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, ' +
  'application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml';

/** 마디 하나. 줄바꿈을 일부러 섞어 `s` 플래그가 필요한 모양으로 둔다. */
function node(type: string, name: string, techName?: string, uri?: string): string {
  return [
    '<SEU_ADT_REPOSITORY_OBJ_NODE>',
    `  <OBJECT_TYPE>${type}</OBJECT_TYPE>`,
    `  <OBJECT_NAME>${name}</OBJECT_NAME>`,
    ...(techName === undefined ? [] : [`  <TECH_NAME>${techName}</TECH_NAME>`]),
    ...(uri === undefined ? [] : [`  <OBJECT_URI>${uri}</OBJECT_URI>`]),
    '</SEU_ADT_REPOSITORY_OBJ_NODE>',
  ].join('\n');
}

function treeXml(...nodes: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>',
    '<TREE_CONTENT>',
    ...nodes,
    '</TREE_CONTENT>',
    '</DATA></asx:values></asx:abap>',
  ].join('\n');
}

const ARGS = {
  parent_name: 'zpkg',
  parent_tech_name: 'ZPKG_TECH',
  parent_type: 'DEVC/K',
  node_id: '000012',
};

async function call(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest, index: number) => Reply,
): Promise<{ text: string; isError: boolean; sent: RecordedRequest[] }> {
  const { outcome, requests } = await runTool(getObjectsByType, args, csrfAware(reply));
  return { text: outcome.text, isError: outcome.isError, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getObjectsByType);
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
      }).toEqual(publishedDeclaration('GetObjectsByType'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/search/readonly/` → readonly 집합.
    expect(getObjectsByType.definition.sets).toEqual(['readonly']);
    // 구 `TOOL_DEFINITION.available_in`은 legacy가 **없다**(GrepPackages와 다른 점).
    expect(getObjectsByType.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getObjectsByType.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('POST 한 번 · 질의 인자 순서 · 본문 노드 키 · 헤더 둘', async () => {
    const { sent } = await call(ARGS, () => ({ body: treeXml() }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toBe(
      `${TEST_ORIGIN}${NODE_STRUCTURE}` +
        '?parent_type=DEVC%2FK&parent_name=ZPKG&parent_tech_name=ZPKG' +
        '&withShortDescriptions=true&node_id=000012',
    );
    expect(sent[0]?.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
        '<asx:values><DATA><TV_NODEKEY>000012</TV_NODEKEY></DATA></asx:values>' +
        '</asx:abap>',
    );
    expect(sent[0]?.headers['Accept']).toBe(ACCEPT);
    expect(sent[0]?.headers['Content-Type']).toBe(
      'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
    );
  });

  it('`parent_tech_name` 인자는 와이어에 실리지 않는다 — 그 자리에 부모 이름이 간다', async () => {
    // 벤더 `nodeStructure.js:34`가 `parent_tech_name: parentName`으로 못박아 둔
    // 탓이다. 인자는 필수인데 값은 버려진다 — 겉 핸들러만 읽으면 놓치는 자리다.
    const { sent } = await call(ARGS, () => ({ body: treeXml() }));

    expect(sent[0]?.url).toContain('parent_tech_name=ZPKG');
    expect(sent[0]?.url).not.toContain('ZPKG_TECH');
  });

  it('with_short_descriptions를 주면 그 값이 실리고, 안 주면 true다', async () => {
    const off = await call({ ...ARGS, with_short_descriptions: false }, () => ({
      body: treeXml(),
    }));
    expect(off.sent[0]?.url).toContain('withShortDescriptions=false');

    const fallback = await call(ARGS, () => ({ body: treeXml() }));
    expect(fallback.sent[0]?.url).toContain('withShortDescriptions=true');
  });
});

describe('응답 접기', () => {
  it("format:'raw'는 원문을 그대로 돌려준다", async () => {
    const xml = treeXml(node('CLAS/OC', 'ZCL_A'));
    const { text, isError, sent } = await call({ ...ARGS, format: 'raw' }, () => ({ body: xml }));

    expect(isError).toBe(false);
    expect(text).toBe(xml);
    expect(sent).toHaveLength(1);
  });

  it('마디가 없으면 오류가 아니라 「없다」 한 줄이고, 부모 이름은 **원본 철자**다', async () => {
    const { text, isError } = await call(ARGS, () => ({ body: treeXml() }));

    expect(isError).toBe(false);
    // 와이어에는 ZPKG(대문자)가 나갔지만 문구에는 호출자가 준 zpkg가 남는다.
    expect(text).toBe("No objects found for node_id '000012' in DEVC/K 'zpkg'.");
  });

  it('한 종류뿐이면 「Object Type」 머리에 종류별 요약 줄이 없다', async () => {
    const xml = treeXml(
      node('CLAS/OC', 'ZCL_A', 'ZCL_A', '/sap/bc/adt/oo/classes/zcl_a'),
      node('CLAS/OC', 'ZCL_B'),
    );
    const { text } = await call(ARGS, () => ({ body: xml }));

    expect(text).toBe(
      "Found 2 objects for node_id '000012' in DEVC/K 'zpkg':\n\n" +
        '📁 Object Type: CLAS/OC\n\n' +
        '   • ZCL_A\n     URI: /sap/bc/adt/oo/classes/zcl_a\n' +
        '   • ZCL_B\n' +
        '\n📊 Summary: 2 objects found\n',
    );
  });

  it('두 종류 이상이면 종류별로 묶고 요약에 종류별 수를 덧붙인다', async () => {
    const xml = treeXml(
      node('CLAS/OC', 'ZCL_A'),
      node('PROG/P', 'ZPROG_A'),
      node('CLAS/OC', 'ZCL_B'),
    );
    const { text } = await call(ARGS, () => ({ body: xml }));

    expect(text).toBe(
      "Found 3 objects for node_id '000012' in DEVC/K 'zpkg':\n\n" +
        '📁 Type: CLAS/OC (2 objects)\n' +
        '   • ZCL_A\n' +
        '   • ZCL_B\n' +
        '\n' +
        '📁 Type: PROG/P (1 objects)\n' +
        '   • ZPROG_A\n' +
        '\n' +
        '\n📊 Summary: 3 objects found\n' +
        '   CLAS/OC: 2 objects\n' +
        '   PROG/P: 1 objects\n',
    );
  });

  it('기술명이 이름과 다를 때만 괄호로 덧붙고, 이름·URI는 퍼센트 해제를 지난다', async () => {
    const xml = treeXml(node('CLAS/OC', '%2FNS%2FZCL_A', 'ZCL_A_TECH', '/sap/bc/adt/oo/classes/%2Fns%2Fzcl_a'));
    const { text } = await call(ARGS, () => ({ body: xml }));

    expect(text).toContain('   • /NS/ZCL_A (ZCL_A_TECH)\n     URI: /sap/bc/adt/oo/classes//ns/zcl_a\n');
  });

  it('TECH_NAME이 없으면 이름을 기술명으로 삼아 괄호가 붙지 않는다', async () => {
    const xml = treeXml(node('CLAS/OC', 'ZCL_A'));
    const { text } = await call(ARGS, () => ({ body: xml }));

    expect(text).toContain('   • ZCL_A\n');
    expect(text).not.toContain('(ZCL_A)');
  });
});

describe('갈래', () => {
  it.each([
    ['parent_name', { ...ARGS, parent_name: '   ' }],
    ['parent_tech_name', { ...ARGS, parent_tech_name: '' }],
    ['parent_type', { ...ARGS, parent_type: '' }],
    ['node_id', { ...ARGS, node_id: ' ' }],
  ])('빈 %s는 SAP에 한 바이트도 나가기 전에 거절된다', async (argument, args) => {
    const { text, isError, sent } = await call(args, () => ({ body: treeXml() }));

    expect(isError).toBe(true);
    expect(text).toBe(
      `ADT error: Error: Parameter "${argument}" (string) is required and cannot be empty.`,
    );
    expect(sent).toHaveLength(0);
  });

  it('ADT가 거절하면 `ADT error: ` 접두사를 단 오류로 접는다', async () => {
    const { text, isError } = await call(ARGS, () => ({ status: 404, body: 'not found' }));

    expect(isError).toBe(true);
    expect(text).toMatch(/^ADT error: /);
  });
});
