/**
 * GetObjectsByType — 부모 마디 아래에서 **한 종류**의 오브젝트만 훑어 온다.
 *
 * 요청은 노드 구조 조회 한 번뿐이고(`internal/nodeStructure.ts`), 나머지는 그
 * 응답 XML을 사람이 읽을 표로 접는 일이다. `format: 'raw'`면 접지 않고 원문을
 * 그대로 돌려준다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/search/readonly/handleGetObjectsByType.ts`
 *  - 와이어: `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:435-436`
 *    → 같은 패키지 `dist/core/shared/nodeStructure.js:29-56`
 *
 * ## 구를 읽고 알게 된 것 둘 — 겉만 봤으면 놓쳤을 자리
 *  1. **`parent_tech_name`은 필수 인자인데 와이어에 실리지 않는다.** 벤더가
 *     `parent_tech_name` 질의 인자에 `parentName`을 넣기 때문이다
 *     (`nodeStructure.js:34`). 인자를 없애지도 이름을 바꾸지도 않고 그대로 받되,
 *     보내는 값은 구와 같게 둔다.
 *  2. 부모 이름은 **대문자로 올려** 보내지만, 응답 문구에는 호출자가 준 원본
 *     철자가 그대로 들어간다(구 `:166-171` 대 `:184`·`:197`).
 *
 * ## 구와 다른 것
 *  - 구는 결과를 프로세스 전역 `objectsListCache`에 얹어 `GetObjectNodeFromCache`
 *    가 나중에 읽게 했다(`engine/src/lib/getObjectsListCache.ts`). 그 캐시를
 *    읽는 도구는 아직 짓지 않았으므로 M1에서는 얹지 않는다 —
 *    `harness/DIVERGENCES.md`의 「도구 사이 캐시」 항목.
 *  - 인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다(같은 장부
 *    「인자 오류 문구」 항목). 문장 자체는 글자 그대로다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { fetchNodeStructure } from './internal/nodeStructure';
import { failure, ok } from './internal/results';

/** 트리 응답에서 뽑아낸 오브젝트 하나. */
export interface RepositoryObjectNode {
  name: string;
  type: string;
  tech_name: string;
  uri?: string;
}

const NODE_BLOCK = /<SEU_ADT_REPOSITORY_OBJ_NODE>(.*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/gs;

/**
 * `SEU_ADT_REPOSITORY_OBJ_NODE` 마디에서 이름·타입·기술명·URI를 뽑는다.
 *
 * **구와 같은 정규식 파싱이다** — 같은 응답을 다루는 `GrepPackages` 쪽은
 * fast-xml-parser로 읽는데, 그것은 두 도구가 구에서 서로 다른 파서를 썼기
 * 때문이다(구 `handleGetObjectsByType.ts:45-98` 대 벤더
 * `packageContentsList.js:103-163`). 합치면 값이 달라진다: XML 파서는
 * `<NODE_ID>000012</NODE_ID>`를 숫자 12로 읽지만 이쪽 정규식은 문자열을 그대로
 * 본다.
 *
 * 이름·기술명·URI는 `decodeURIComponent`를 지난다. 그 호출이 던지면 구는
 * 그때까지 모은 것만 돌려줬으므로(전체를 try로 감싼 탓) 여기서도 그렇게 한다.
 */
export function parseObjectNodes(xmlData: string): RepositoryObjectNode[] {
  const objects: RepositoryObjectNode[] = [];
  try {
    for (const block of xmlData.match(NODE_BLOCK) ?? []) {
      const type = /<OBJECT_TYPE>([^<]+)<\/OBJECT_TYPE>/.exec(block);
      const name = /<OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/.exec(block);
      if (!type || !name) continue;

      const tech = /<TECH_NAME>([^<]+)<\/TECH_NAME>/.exec(block);
      const uri = /<OBJECT_URI>([^<]+)<\/OBJECT_URI>/.exec(block);

      const objectName = decodeURIComponent(name[1] ?? '');
      objects.push({
        name: objectName,
        type: type[1] ?? '',
        tech_name: tech ? decodeURIComponent(tech[1] ?? '') : objectName,
        uri: uri ? decodeURIComponent(uri[1] ?? '') : undefined,
      });
    }
  } catch {
    // 구도 파싱 실패를 삼키고 여기까지 모은 것을 돌려줬다.
  }
  return objects;
}

/** 오브젝트 한 줄. 기술명이 이름과 다를 때만 괄호로 덧붙는다. */
function renderObject(object: RepositoryObjectNode): string {
  let line = `   • ${object.name}`;
  if (object.tech_name !== object.name) line += ` (${object.tech_name})`;
  if (object.uri) line += `\n     URI: ${object.uri}`;
  return `${line}\n`;
}

/** 구 `:196-243`의 문구를 글자 그대로 옮긴 것. 이모지도 그대로다. */
export function renderObjectList(
  objects: readonly RepositoryObjectNode[],
  nodeId: string,
  parentType: string,
  parentName: string,
): string {
  let text = `Found ${objects.length} objects for node_id '${nodeId}' in ${parentType} '${parentName}':\n\n`;
  const types = [...new Set(objects.map((object) => object.type))];

  if (types.length > 1) {
    for (const type of types) {
      const ofType = objects.filter((object) => object.type === type);
      text += `📁 Type: ${type} (${ofType.length} objects)\n`;
      for (const object of ofType) text += renderObject(object);
      text += '\n';
    }
  } else {
    text += `📁 Object Type: ${types[0]}\n\n`;
    for (const object of objects) text += renderObject(object);
  }

  text += `\n📊 Summary: ${objects.length} objects found\n`;
  if (types.length > 1) {
    for (const type of types) {
      const count = objects.filter((object) => object.type === type).length;
      text += `   ${type}: ${count} objects\n`;
    }
  }
  return text;
}

/** 구의 `McpError(InvalidParams, …)` 자리. 문장은 글자 그대로다. */
function required(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Parameter "${argument}" (string) is required and cannot be empty.`);
  }
  return value;
}

export const getObjectsByType = defineTool(
  {
    name: 'GetObjectsByType',
    description:
      '[read-only] Retrieves all ABAP objects of a specific type (classes, tables, programs, interfaces, etc.) under a given parent node. Useful for listing all objects of one type within a package or composite object.',
    inputSchema: {
      parent_name: z.string().describe('[read-only] Parent object name'),
      parent_tech_name: z.string().describe('[read-only] Parent technical name'),
      parent_type: z.string().describe('[read-only] Parent object type'),
      node_id: z.string().describe('[read-only] Node ID'),
      format: z.string().optional().describe("[read-only] Output format: 'raw' or 'parsed'"),
      with_short_descriptions: z
        .boolean()
        .optional()
        .describe('[read-only] Include short descriptions'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    // 읽기 도구에는 요구되지 않지만, 이 도구는 **구체적인 오브젝트 이름 둘**을
    // 받는다(마스크가 아니다). 적어 두면 녹화 사전 검사가 그만큼 넓어진다.
    targetNames: ['parent_name', 'parent_tech_name'],
  },
  async (context, args) => {
    try {
      const parentName = required(args.parent_name, 'parent_name');
      required(args.parent_tech_name, 'parent_tech_name');
      const parentType = required(args.parent_type, 'parent_type');
      const nodeId = required(args.node_id, 'node_id');

      const withShortDescriptions =
        args.with_short_descriptions !== undefined
          ? Boolean(args.with_short_descriptions)
          : true;
      const format = args.format || 'parsed';

      const client = await context.getConnection();
      const response = await fetchNodeStructure(client, {
        parentType,
        // 이름만 대문자로 올린다. 아래 문구에는 원본 철자가 쓰인다.
        parentName: parentName.toUpperCase(),
        nodeId,
        withShortDescriptions,
      });

      if (format === 'raw') return ok(response.body);

      const objects = parseObjectNodes(response.body);
      if (objects.length === 0) {
        return ok(`No objects found for node_id '${nodeId}' in ${parentType} '${parentName}'.`);
      }
      return ok(renderObjectList(objects, nodeId, parentType, parentName));
    } catch (error) {
      // 구와 같은 문구다 — 접두사 `ADT error: `가 계약의 일부.
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
