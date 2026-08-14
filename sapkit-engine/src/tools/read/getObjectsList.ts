/**
 * `GetObjectsList` — 부모 마디 아래를 **재귀로** 훑어 오브젝트를 평평하게 모은다.
 *
 * 구 핸들러: `engine/src/handlers/search/readonly/handleGetObjectsList.ts`.
 *
 * ## `GetObjectsByType`와 같은 엔드포인트, 다른 계약
 *
 * 요청은 둘 다 노드 구조 조회(`internal/nodeStructure.ts`)뿐이지만:
 *
 *  1. 이쪽은 **재귀**다. 응답의 `SEU_ADT_OBJECT_TYPE_INFO/NODE_ID`를 전부 꺼내
 *     그 마디마다 다시 묻는다(`handleGetObjectsList.ts:119-131`). 그쪽은 한 발이다.
 *  2. 시작 마디가 **여섯 자리 `000000`**이다(`:195`). `GetNodeStructureLow`의
 *     네 자리 `0000`이 아니다.
 *  3. 이쪽은 `OBJECT_URI`가 **있는 마디만** 담는다(네 필드가 모두 있어야 한다 —
 *     `:56`). 그쪽은 URI 없이도 담는다.
 *  4. 이쪽의 결과는 `{parent_name, parent_tech_name, parent_type, total_objects,
 *     objects}` 한 덩이의 JSON이고, 그쪽은 사람이 읽을 표(또는 `format:'raw'`)다.
 *  5. 이쪽에는 `format`·`node_id` 인자가 없다.
 *
 * ## 순환 방지는 **`node_id`로만** 한다
 *
 * `visited`가 담는 것은 노드 키뿐이라(`:103-106`) 부모 이름·타입은 보지 않는다.
 * 같은 마디를 두 번 묻지 않는 것이 전부다. 재귀는 **순차**이며 벤더의
 * 동시성 제한이 걸려 있지 않다 — 구 그대로 한 발씩 보낸다.
 *
 * ## 파싱은 정규식이다 (구와 같은 파서)
 *
 * `:42-92`가 `SEU_ADT_REPOSITORY_OBJ_NODE` 블록과 `SEU_ADT_OBJECT_TYPE_INFO`
 * 블록을 각각 정규식으로 훑는다. XML 파서로 바꾸면 `<NODE_ID>000012</NODE_ID>`가
 * 숫자 12로 읽혀 다음 요청의 `node_id`가 달라진다 — `GetObjectsByType`이 같은
 * 이유로 정규식을 지켰다. 파싱은 `try/catch`로 감싸여 있어 도중에 던지면 **그때까지
 * 모은 것만** 남는다(`:65-67`·`:88-90`).
 *
 * ## 응답에 실리던 `cache` 키는 발행되지 않는다 (차이가 아니다)
 *
 * 구 핸들러는 반환 객체에 `cache: objectsListCache.getCache()`를 얹지만(`:220`),
 * 구 서버가 `tools/call` 응답으로 내보내는 것은 `{ content }` 하나뿐이다
 * (`engine/src/server/BaseMcpServer.ts:445-465` — `return { content }`).
 * 그 키는 프로토콜에 실린 적이 없다.
 *
 * ## 구와 다른 것 — 등재됨
 *
 * 이 도구는 구에서 프로세스 전역 `objectsListCache`를 **채우는** 다섯 도구 중
 * 하나다(`:210`). 신 엔진은 그 캐시를 승계하지 않는다 — 장부 D33과, 이 판에서
 * 그 결정을 닫은 D130.
 *
 * 인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다(장부 D34).
 * 문장 자체는 글자 그대로다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { fetchNodeStructure } from './internal/nodeStructure';
import { failure, ok } from './internal/results';

/** 재귀가 시작하는 마디 — 여섯 자리다(`handleGetObjectsList.ts:195`). */
export const ROOT_NODE_ID = '000000';

export interface RepositoryObject {
  OBJECT_TYPE: string;
  OBJECT_NAME: string;
  TECH_NAME: string;
  OBJECT_URI: string;
}

const NODE_BLOCK = /<SEU_ADT_REPOSITORY_OBJ_NODE>([\s\S]*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/g;
const TYPE_INFO_BLOCK = /<SEU_ADT_OBJECT_TYPE_INFO>([\s\S]*?)<\/SEU_ADT_OBJECT_TYPE_INFO>/g;

/**
 * `parseValidObjects`(`:42-69`) — **네 필드가 모두 있는 마디만** 담는다.
 * 하나라도 없으면 그 마디는 통째로 빠진다.
 */
export function parseValidObjects(xmlData: string): RepositoryObject[] {
  const nodes: RepositoryObject[] = [];
  try {
    for (const match of xmlData.matchAll(NODE_BLOCK)) {
      const nodeXml = match[1] ?? '';
      const type = /<OBJECT_TYPE>([^<]+)<\/OBJECT_TYPE>/.exec(nodeXml);
      const name = /<OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/.exec(nodeXml);
      const techName = /<TECH_NAME>([^<]+)<\/TECH_NAME>/.exec(nodeXml);
      const uri = /<OBJECT_URI>([^<]+)<\/OBJECT_URI>/.exec(nodeXml);
      if (!type || !name || !techName || !uri) continue;
      nodes.push({
        OBJECT_TYPE: type[1] as string,
        OBJECT_NAME: name[1] as string,
        TECH_NAME: techName[1] as string,
        OBJECT_URI: uri[1] as string,
      });
    }
  } catch {
    // 구 `:65-67` — 던지면 그때까지 모은 것만 돌려준다.
  }
  return nodes;
}

/** `parseNodeIds`(`:74-92`) — 종류 정보 블록마다 `NODE_ID` 하나. */
export function parseNodeIds(xmlData: string): string[] {
  const nodeIds: string[] = [];
  try {
    for (const match of xmlData.matchAll(TYPE_INFO_BLOCK)) {
      const nodeId = /<NODE_ID>([^<]+)<\/NODE_ID>/.exec(match[1] ?? '');
      if (nodeId) nodeIds.push(nodeId[1] as string);
    }
  } catch {
    // 같은 이유로 삼킨다(`:88-90`).
  }
  return nodeIds;
}

/** `collectValidObjectsStrict`(`:97-134`) — 순차 재귀, `visited`는 노드 키만 본다. */
async function collectValidObjects(
  client: AdtClient,
  parentName: string,
  parentType: string,
  nodeId: string,
  withShortDescriptions: boolean,
  visited: Set<string>,
): Promise<RepositoryObject[]> {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const response = await fetchNodeStructure(client, {
    parentType,
    parentName,
    nodeId,
    withShortDescriptions,
  });
  const xml = response.body;

  const objects = parseValidObjects(xml);
  for (const childNodeId of parseNodeIds(xml)) {
    objects.push(
      ...(await collectValidObjects(
        client,
        parentName,
        parentType,
        childNodeId,
        withShortDescriptions,
        visited,
      )),
    );
  }
  return objects;
}

/** 구의 `McpError(InvalidParams, …)` 자리. 문장은 글자 그대로다(`:150-179`). */
function required(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Parameter "${argument}" (string) is required and cannot be empty.`);
  }
  return value;
}

export const getObjectsList = defineTool(
  {
    name: 'GetObjectsList',
    description:
      '[read-only] Recursively retrieves all child ABAP repository objects for a given parent — programs (PROG), function groups (FUGR), classes (CLAS), packages (DEVC), and other composite objects — including nested includes and subcomponents.',
    inputSchema: {
      parent_name: z.string().describe('[read-only] Parent object name'),
      parent_tech_name: z.string().describe('[read-only] Parent technical name'),
      parent_type: z.string().describe('[read-only] Parent object type (e.g. PROG/P, FUGR)'),
      with_short_descriptions: z
        .boolean()
        .optional()
        .describe('[read-only] Include short descriptions (default: true)'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/search/readonly/`이고 채록본의 네 조건 전부에 뜬다.
    // `SearchHandlersGroup`은 노출과 무관하게 늘 켜지지만, 같은 디렉터리의
    // `GetObjectsByType`·`GrepPackages`가 이미 `readonly`로 서 있어 맞춘다.
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['parent_name', 'parent_tech_name'],
  },
  async (context, args) => {
    try {
      const parentName = required(args.parent_name, 'parent_name');
      const parentTechName = required(args.parent_tech_name, 'parent_tech_name');
      const parentType = required(args.parent_type, 'parent_type');

      const withShortDescriptions =
        args.with_short_descriptions !== undefined
          ? Boolean(args.with_short_descriptions)
          : true;

      const client = await context.getConnection();
      const objects = await collectValidObjects(
        client,
        // 이름만 대문자로 올려 보낸다. 결과 문서에는 원본 철자가 실린다(`:193`·`:202`).
        parentName.toUpperCase(),
        parentType,
        ROOT_NODE_ID,
        withShortDescriptions,
        new Set<string>(),
      );

      return ok(
        JSON.stringify(
          {
            parent_name: parentName,
            parent_tech_name: parentTechName,
            parent_type: parentType,
            total_objects: objects.length,
            objects,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      // 구 `:222-233` — 접두사 `ADT error: `가 계약의 일부다.
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
