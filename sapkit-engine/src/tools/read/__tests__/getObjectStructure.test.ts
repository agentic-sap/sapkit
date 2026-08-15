/**
 * `GetObjectStructure` — 발행 계약 · 와이어(두 겹 인코딩 포함) · 트리 조립 · 갈래.
 *
 * ## 기대값을 어디서 뽑았나 (자기확인 회피)
 *
 * `OLD_ENGINE_TREE_TEXT`는 **구 엔진의 `buildNestedTree`·`serializeTree`를 그대로
 * 떼어 내 실행한 출력**이다(`engine/src/handlers/system/readonly/handleGetObjectStructure.ts:43-76`).
 * 와이어 문자열은 안쪽 패키지
 * (`@babamba2/mcp-abap-adt-clients/dist/core/shared/objectStructure.js:34-44`)에서
 * 글자로 옮겼다.
 *
 * 시험이 붙잡는 구의 실측 둘:
 *  - **이름이 두 번 인코딩된다.** 타입은 한 번이다. 이름공간 있는 오브젝트에서만
 *    드러나므로 그 경우를 따로 물린다.
 *  - **부모를 못 찾은 노드는 버려지지 않고 뿌리가 된다.**
 */

import { buildNestedTree, getObjectStructure, serializeTree } from '../getObjectStructure';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';
import type { Reply } from './support';

const PATH = '/sap/bc/adt/repository/objectstructure';

/** 뿌리 하나 + 손자 하나 + 부모 없는 고아 하나. 구 코드에 그대로 물렸던 입력이다. */
const XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">',
  '  <projectexplorer:node nodeid="1" objecttype="DDLS/DF" objectname="ZI_DEMO"/>',
  '  <projectexplorer:node nodeid="2" parentid="1" objecttype="DDLS/DFF" objectname="FIELD_A"/>',
  '  <projectexplorer:node nodeid="3" parentid="1" objecttype="DDLS/DFF" objectname="FIELD_B"/>',
  '  <projectexplorer:node nodeid="4" parentid="2" objecttype="DDLS/DFX" objectname="SUB"/>',
  '  <projectexplorer:node nodeid="5" parentid="99" objecttype="DDLS/DFF" objectname="ORPHAN"/>',
  '</projectexplorer:objectstructure>',
].join('\n');

/** 구 코드를 실행해 받은 출력 그대로. 손으로 고치지 말 것. */
const OLD_ENGINE_TREE_TEXT =
  'tree:\n' +
  '- DDLS/DF: ZI_DEMO\n' +
  '  - DDLS/DFF: FIELD_A\n' +
  '    - DDLS/DFX: SUB\n' +
  '  - DDLS/DFF: FIELD_B\n' +
  '- DDLS/DFF: ORPHAN\n';

const SINGLE_NODE_XML = [
  '<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">',
  '  <projectexplorer:node nodeid="1" objecttype="CLAS/OC" objectname="ZCL_ONE"/>',
  '</projectexplorer:objectstructure>',
].join('\n');

afterEach(() => {
  cleanupTempDirs();
});

async function call(args: Record<string, unknown>, reply: () => Reply) {
  const { outcome, requests } = await runTool(getObjectStructure, args, reply);
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0]?.url ?? '' };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getObjectStructure);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetObjectStructure'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getObjectStructure.definition.sets).toEqual(['readonly']);
    expect(getObjectStructure.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getObjectStructure.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET 한 번으로 끝나고 Accept가 구와 같다', async () => {
    const { sent } = await call({ objecttype: 'DDLS/DF', objectname: 'ZI_DEMO' }, () => ({
      status: 200,
      body: XML,
    }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(new URL(sent[0]?.url ?? '').pathname).toBe(PATH);
    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml',
    );
    expect(sent[0]?.body).toBeUndefined();
  });

  it('질의 인자 순서가 objecttype → objectname이다 (손으로 이어 붙인 문자열)', async () => {
    const { url } = await call({ objecttype: 'DDLS/DF', objectname: 'ZI_DEMO' }, () => ({
      status: 200,
      body: XML,
    }));

    expect(new URL(url).search).toBe('?objecttype=DDLS%2FDF&objectname=ZI_DEMO');
  });

  it('⚠ 이름은 두 번, 타입은 한 번 인코딩된다 (구의 실측)', async () => {
    // 발행 설명이 드는 예가 하필 이름공간 오브젝트라 여기서 드러난다.
    const { url } = await call(
      { objecttype: 'DDLS/DF', objectname: '/CBY/ACQ_DDL' },
      () => ({ status: 200, body: XML }),
    );

    // 타입: `/` → `%2F` (한 겹). 이름: `/` → `%2F` → `%252F` (두 겹).
    expect(new URL(url).search).toBe(
      '?objecttype=DDLS%2FDF&objectname=%252FCBY%252FACQ_DDL',
    );
  });

  it('슬래시 없는 이름은 두 겹이어도 원문 그대로다', async () => {
    const { url } = await call({ objecttype: 'CLAS/OC', objectname: 'ZCL_ONE' }, () => ({
      status: 200,
      body: SINGLE_NODE_XML,
    }));

    expect(new URL(url).search).toBe('?objecttype=CLAS%2FOC&objectname=ZCL_ONE');
  });
});

describe('트리 조립', () => {
  it('구 코드가 낸 트리 글과 글자까지 같다', async () => {
    const { outcome } = await call({ objecttype: 'DDLS/DF', objectname: 'ZI_DEMO' }, () => ({
      status: 200,
      body: XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe(OLD_ENGINE_TREE_TEXT);
  });

  it('노드가 하나뿐이면 배열이 아니어도 트리가 된다', async () => {
    const { outcome } = await call({ objecttype: 'CLAS/OC', objectname: 'ZCL_ONE' }, () => ({
      status: 200,
      body: SINGLE_NODE_XML,
    }));

    expect(outcome.text).toBe('tree:\n- CLAS/OC: ZCL_ONE\n');
  });

  it('부모를 못 찾은 노드는 버려지지 않고 뿌리가 된다', () => {
    const roots = buildNestedTree([
      { nodeid: '5', parentid: '99', objecttype: 'DDLS/DFF', objectname: 'ORPHAN' },
    ]);

    expect(roots).toHaveLength(1);
    expect(serializeTree(roots)).toBe('- DDLS/DFF: ORPHAN\n');
  });
});

describe('갈래', () => {
  it('노드가 없으면 빈 트리가 아니라 오류다', async () => {
    const { outcome } = await call({ objecttype: 'DDLS/DF', objectname: 'ZI_DEMO' }, () => ({
      status: 200,
      body: '<projectexplorer:objectstructure xmlns:projectexplorer="x"/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('No nodes found in object structure response.');
  });

  it('HTTP 오류는 ADT error 문구로 접힌다', async () => {
    const { outcome } = await call({ objecttype: 'DDLS/DF', objectname: 'ZI_DEMO' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('ADT error: ')).toBe(true);
  });

  it('빈 이름은 접속을 꺼내기 전에 구의 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ objecttype: 'DDLS/DF', objectname: '' }, () => ({
      status: 200,
      body: XML,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'ADT error: Error: objecttype/objectname (or object_type/object_name) are required',
    );
    expect(sent).toHaveLength(0);
  });
});
