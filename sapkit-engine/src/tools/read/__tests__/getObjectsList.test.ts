/**
 * `GetObjectsList` — 발행 계약 · 노출 선언 · 재귀 와이어 · 파싱 · 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 재귀·시작 노드 키 `000000`·순환 방지
 *    → `engine/src/handlers/search/readonly/handleGetObjectsList.ts:97-134`·`:191-198`
 *  - 파싱 두 정규식 → 같은 파일 `:42-92`
 *  - 응답 모양(들여쓰기 2칸) → 같은 파일 `:200-221`
 *  - 인자 검증 문구 → 같은 파일 `:150-179`
 *  - 와이어 → `@babamba2/…/dist/core/shared/nodeStructure.js:29-56`
 */

import { getObjectsList } from '../getObjectsList';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

/** 오브젝트 마디 하나 — 네 필드가 모두 있어야 담긴다. */
const objectNode = (
  type: string,
  name: string,
  techName: string,
  uri: string | null,
): string =>
  [
    '<SEU_ADT_REPOSITORY_OBJ_NODE>',
    `<OBJECT_TYPE>${type}</OBJECT_TYPE>`,
    `<OBJECT_NAME>${name}</OBJECT_NAME>`,
    `<TECH_NAME>${techName}</TECH_NAME>`,
    uri === null ? '' : `<OBJECT_URI>${uri}</OBJECT_URI>`,
    '</SEU_ADT_REPOSITORY_OBJ_NODE>',
  ].join('');

const typeInfo = (nodeId: string): string =>
  `<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>X</OBJECT_TYPE><NODE_ID>${nodeId}</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>`;

const doc = (...parts: string[]): string => `<asx:abap><asx:values>${parts.join('')}</asx:values></asx:abap>`;

/** POST라 CSRF 왕복이 먼저 온다 — 그 왕복은 계약이 아니다. */
const csrf =
  (bodyFor: (url: string) => string) =>
  (request: { url: string }) =>
    request.url.includes('/discovery')
      ? { headers: { 'x-csrf-token': 'TEST-TOKEN' } }
      : { status: 200, body: bodyFor(request.url) };

const nodeIdOf = (url: string): string => /node_id=([^&]*)/.exec(url)?.[1] ?? '';

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getObjectsList);
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
      }).toEqual(publishedDeclaration('GetObjectsList'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    // `handlers/search/readonly/` — 같은 폴더의 `GetObjectsByType`·`GrepPackages`와
    // 같은 값이다. 채록본의 네 조건 전부에 뜬다.
    expect(getObjectsList.definition.sets).toEqual(['readonly']);
    expect(getObjectsList.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getObjectsList.definition.kind).toBe('read');
  });
});

describe('와이어 — 재귀', () => {
  it('시작 노드 키가 **여섯 자리 `000000`**이다 (`GetNodeStructureLow`의 `0000`이 아니다)', async () => {
    const { requests } = await runTool(
      getObjectsList,
      { parent_name: 'zpkg', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      csrf(() => doc()),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toContain('/sap/bc/adt/repository/nodestructure');
    expect(sent[0]?.url).toContain('node_id=000000');
    expect(sent[0]?.body).toContain('<TV_NODEKEY>000000</TV_NODEKEY>');
    // 이름만 대문자로 올려 보낸다 — 기술명 자리에도 그 값이 들어간다.
    expect(sent[0]?.url).toContain('parent_name=ZPKG');
    expect(sent[0]?.url).toContain('parent_tech_name=ZPKG');
    expect(sent[0]?.url).toContain('parent_type=DEVC%2FK');
    expect(sent[0]?.url).toContain('withShortDescriptions=true');
  });

  it('응답의 NODE_ID마다 한 번씩 더 묻는다', async () => {
    const { requests } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      csrf((url) =>
        nodeIdOf(url) === '000000'
          ? doc(typeInfo('000001'), typeInfo('000002'))
          : doc(objectNode('CLAS/OC', `ZCL_${nodeIdOf(url)}`, 'TECH', '/uri')),
      ),
    );
    const nodeIds = toolRequests(requests).map((request) => nodeIdOf(request.url));

    expect(nodeIds).toEqual(['000000', '000001', '000002']);
  });

  it('같은 NODE_ID를 두 번 묻지 않는다 (visited는 노드 키만 본다)', async () => {
    const { requests } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      // 자식이 부모를 다시 가리키는 순환. 세 번째 요청이 나가면 안 된다.
      csrf((url) => (nodeIdOf(url) === '000000' ? doc(typeInfo('000001')) : doc(typeInfo('000000')))),
    );
    const nodeIds = toolRequests(requests).map((request) => nodeIdOf(request.url));

    expect(nodeIds).toEqual(['000000', '000001']);
  });

  it('with_short_descriptions는 준 값을 Boolean()으로 접고 기본은 참이다', async () => {
    const off = await runTool(
      getObjectsList,
      {
        parent_name: 'ZPKG',
        parent_tech_name: 'ZPKG',
        parent_type: 'DEVC/K',
        with_short_descriptions: false,
      },
      csrf(() => doc()),
    );
    expect(toolRequests(off.requests)[0]?.url).toContain('withShortDescriptions=false');
  });
});

describe('파싱', () => {
  it('네 필드가 모두 있는 마디만 담는다 — OBJECT_URI가 없으면 통째로 빠진다', async () => {
    const { outcome } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG_TECH', parent_type: 'DEVC/K' },
      csrf(() =>
        doc(
          objectNode('CLAS/OC', 'ZCL_A', 'ZCL_A', '/sap/bc/adt/oo/classes/zcl_a'),
          objectNode('PROG/P', 'ZPROG_B', 'ZPROG_B', null),
        ),
      ),
    );

    expect(JSON.parse(outcome.text)).toEqual({
      // 결과 문서에는 **원본 철자**가 실린다(대문자로 올린 것은 와이어 쪽뿐).
      parent_name: 'ZPKG',
      parent_tech_name: 'ZPKG_TECH',
      parent_type: 'DEVC/K',
      total_objects: 1,
      objects: [
        {
          OBJECT_TYPE: 'CLAS/OC',
          OBJECT_NAME: 'ZCL_A',
          TECH_NAME: 'ZCL_A',
          OBJECT_URI: '/sap/bc/adt/oo/classes/zcl_a',
        },
      ],
    });
  });

  it('재귀로 모은 것이 한 배열로 합쳐진다', async () => {
    const { outcome } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      csrf((url) =>
        nodeIdOf(url) === '000000'
          ? doc(objectNode('DEVC/K', 'ZSUB', 'ZSUB', '/u0'), typeInfo('000001'))
          : doc(objectNode('CLAS/OC', 'ZCL_CHILD', 'ZCL_CHILD', '/u1')),
      ),
    );
    const payload = JSON.parse(outcome.text) as { total_objects: number; objects: unknown[] };

    expect(payload.total_objects).toBe(2);
    expect(payload.objects).toEqual([
      { OBJECT_TYPE: 'DEVC/K', OBJECT_NAME: 'ZSUB', TECH_NAME: 'ZSUB', OBJECT_URI: '/u0' },
      {
        OBJECT_TYPE: 'CLAS/OC',
        OBJECT_NAME: 'ZCL_CHILD',
        TECH_NAME: 'ZCL_CHILD',
        OBJECT_URI: '/u1',
      },
    ]);
  });

  it('NODE_ID의 앞자리 0을 **문자열 그대로** 둔다 (XML 파서였다면 수가 된다)', async () => {
    const { requests } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      csrf((url) => (nodeIdOf(url) === '000000' ? doc(typeInfo('000012')) : doc())),
    );
    const nodeIds = toolRequests(requests).map((request) => nodeIdOf(request.url));

    expect(nodeIds).toEqual(['000000', '000012']);
  });

  it('응답은 들여쓰기 2칸이다', async () => {
    const { outcome } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      csrf(() => doc()),
    );

    expect(outcome.text).toContain('\n  "parent_name": "ZPKG"');
    expect(outcome.text).toContain('"total_objects": 0');
  });
});

describe('갈래', () => {
  it.each(['parent_name', 'parent_tech_name', 'parent_type'])(
    '빈 %s는 접속 전에 거절한다 — 요청 0건',
    async (argument) => {
      const args: Record<string, string> = {
        parent_name: 'ZPKG',
        parent_tech_name: 'ZPKG',
        parent_type: 'DEVC/K',
      };
      args[argument] = '   ';

      const { outcome, requests } = await runTool(getObjectsList, args, csrf(() => doc()));

      expect(outcome.isError).toBe(true);
      // 구는 McpError를 던져 자기 catch에서 `ADT error: ${String(error)}`로 접었다.
      // 신 엔진에는 `MCP error -32602: ` 접두사가 없다(장부 D34) — 문장은 글자 그대로다.
      expect(outcome.text).toBe(
        `ADT error: Error: Parameter "${argument}" (string) is required and cannot be empty.`,
      );
      expect(requests).toHaveLength(0);
    },
  );

  it('ADT가 거절하면 `ADT error: ` 접두사를 단 오류로 접는다', async () => {
    const { outcome } = await runTool(
      getObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
      (request) =>
        request.url.includes('/discovery')
          ? { headers: { 'x-csrf-token': 'T' } }
          : { status: 500, body: 'boom' },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('ADT error: ')).toBe(true);
  });
});
