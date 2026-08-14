/**
 * GetObjectInfo — 오브젝트 하나를 뿌리로 리포지터리 트리를 깊이만큼 펼친다.
 *
 * ## 와이어
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleGetObjectInfo.ts:47-70`)는
 * `utils.fetchNodeStructure(parent_type, parent_name, node_id || '0000', true)`를
 * 부르고, 요청은 `@babamba2/mcp-abap-adt-clients/dist/core/shared/nodeStructure.js:29-56`
 * 에서 조립된다 — `GetPackageTree`와 **같은 엔드포인트**다:
 *
 * ```
 * POST /sap/bc/adt/repository/nodestructure
 *      ?parent_type=…&parent_name=…&parent_tech_name=…&withShortDescriptions=true&node_id=…
 * ```
 *
 * 다른 점 셋: `parent_type`이 인자로 들어오고(패키지 트리는 항상 `DEVC/K`),
 * `withShortDescriptions`가 **항상 참**으로 고정이며(`handleGetObjectInfo.ts:61`),
 * 뿌리의 `node_id`가 `'0000'`(**네 자리**)이라 `TV_NODEKEY`도 `0000`이 된다 —
 * 패키지 트리 쪽 기본값 `000000`(여섯 자리)과 다르다. 핸들러가 `'0000'`을 명시로
 * 넘기기 때문이고, 그래서 `node_id` 인자도 **언제나 실린다**.
 *
 * ## 구와 다른 것 (차이가 아니다) — XML 파서 교체
 *
 * 구는 `xml-js`의 compact 모드를 썼고(`handleGetObjectInfo.ts:64`) 그 모드는 요소
 * 본문을 `{ _text: '문자열' }`로 준다. 신 엔진에는 `xml-js`가 없으므로
 * `fast-xml-parser`를 **`parseTagValue: false`**로 써서 본문을 문자열 그대로
 * 받는다. 두 결과를 나란히 찍어 확인했다:
 *
 * ```
 * xml-js: {"NODE_ID":{"_text":"000010"}}
 * fxp   : {"NODE_ID":"000010"}
 * ```
 *
 * 구의 `getText`(`:127-133`)가 **두 모양을 모두 받도록** 지어져 있어(객체면 `_text`,
 * 문자열이면 그대로) 꺼내지는 값은 같은 문자열이다. `parseTagValue: false`가
 * 요점인데, 기본값(참)이면 `000010`이 **숫자 10으로 바뀌어** 앞자리 0을 잃는다 —
 * `xml-js`는 절대 그러지 않는다. 진입점만 다르고 결과가 같으므로 등재할 차이가
 * 아니다.
 *
 * ## 노드 갈래 판정 (`:135-147`)
 *
 * - **말단 잎** = `OBJECT_NAME`과 `OBJECT_URI`가 둘 다 있다.
 * - **묶음 노드** = `NODE_ID`와 `OBJECT_TYPE`이 있고 `OBJECT_URI`가 **없다**.
 * - 둘 다 아니면 버린다.
 * 마지막 단계(`depth + 1 === maxDepth`)에서는 **말단 잎만** 담고 묶음 노드는
 * 버린다 — 더 내려갈 수 없는 묶음은 이름만 남기지 않는다는 뜻이다.
 *
 * ## `maxDepth` 기본값은 사실상 1이다
 *
 * 핸들러에 `getDefaultDepth`(PROG·FUGR면 2, 아니면 1)가 있지만(`:41-45`), 발행
 * 스키마가 `maxDepth`에 `default: 1`을 달아 두어 인자가 생략돼도 **1이 채워져
 * 들어온다.** 그래서 `Number.isInteger`가 참이 되어 그 함수는 닿지 않는다. 구도
 * 같은 스키마였으므로 같이 닿지 않았다. 그래도 옮겨 둔 것은 스키마가 바뀌면
 * 되살아나는 갈래이기 때문이다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import type { AdtClient } from '../../adt';
import type { ToolContext } from '../../server/toolDefinition';
import { defineTool } from '../../server/toolDefinition';
import { failure, ok } from './internal/results';
import { searchObject } from './searchObject';

const NODESTRUCTURE_PATH = '/sap/bc/adt/repository/nodestructure';
const NODESTRUCTURE_ACCEPT =
  'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml';
const NODESTRUCTURE_CONTENT_TYPE = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=null';

/** `parseTagValue: false`가 핵심 — 위 머리주석 참조. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: true,
});

/** 구 `getDefaultDepth`(`handleGetObjectInfo.ts:41-45`). */
export function getDefaultDepth(parentType: string): number {
  const type = parentType?.toUpperCase() || '';
  if (type.startsWith('PROG/') || type.startsWith('FUGR/')) return 2;
  return 1;
}

/**
 * 구 `getText`(`:127-133`) — `xml-js`의 `{_text}`와 평문 문자열을 모두 받는다.
 * `fast-xml-parser`가 속성 있는 요소에 붙이는 `#text`도 함께 본다.
 */
function getText(node: any, key: string): string | undefined {
  if (!node) return undefined;
  const value = node[key];
  if (value && typeof value === 'object') {
    const text = value['_text'] ?? value['#text'];
    return text === undefined || text === null ? undefined : String(text);
  }
  if (typeof value === 'string') return value;
  return undefined;
}

const isTerminalLeaf = (node: any): boolean =>
  !!getText(node, 'OBJECT_NAME') && !!getText(node, 'OBJECT_URI');

const isGroupNode = (node: any): boolean =>
  !!getText(node, 'NODE_ID') && !!getText(node, 'OBJECT_TYPE') && !getText(node, 'OBJECT_URI');

export interface ObjectInfoNode {
  OBJECT_TYPE?: string;
  OBJECT_NAME?: string;
  OBJECT_DESCRIPTION?: string;
  OBJECT_PACKAGE?: string;
  PARENT_NODE_ID?: string;
  CHILDREN?: ObjectInfoNode[];
}

interface Enrichment {
  readonly packageName?: string;
  readonly description?: string;
  readonly type: string;
}

/** 구 `fetchNodeStructureRaw`(`:47-70`)의 요청 부분. */
async function fetchNodes(
  client: AdtClient,
  parentType: string,
  parentName: string,
  nodeId: string,
): Promise<any[]> {
  const response = await client.request({
    method: 'POST',
    path: NODESTRUCTURE_PATH,
    params: {
      parent_type: parentType,
      parent_name: parentName,
      parent_tech_name: parentName,
      // 구는 이 자리에 언제나 true를 넘긴다.
      withShortDescriptions: true,
      node_id: nodeId,
    },
    body:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
      `<asx:values><DATA><TV_NODEKEY>${nodeId}</TV_NODEKEY></DATA></asx:values>` +
      '</asx:abap>',
    accept: NODESTRUCTURE_ACCEPT,
    contentType: NODESTRUCTURE_CONTENT_TYPE,
    timeout: 'default',
  });

  const parsed = parser.parse(response.body) as Record<string, any>;
  const raw = parsed?.['asx:abap']?.['asx:values']?.DATA?.TREE_CONTENT?.SEU_ADT_REPOSITORY_OBJ_NODE;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * 구 `enrichNodeWithSearchObject`(`:72-125`)에 해당하는 자리.
 *
 * **구에서는 이 함수가 언제나 빈손으로 돌아왔다** — 장부 등재분의 「GetObjectInfo의
 * enrich」 항목 참조. 여기서는 의도대로 `SearchObject`를 불러 설명과 패키지를
 * 채운다. 실패는 삼킨다(구도 그랬다) — 보강은 부가 정보이지 이 도구의 본체가 아니다.
 */
async function enrich(
  context: ToolContext,
  objectType: string,
  objectName: string,
): Promise<Enrichment> {
  try {
    const result = await searchObject.handler(context, {
      object_name: objectName,
      object_type: objectType,
      maxResults: 1,
    });
    if (result.isError) return { type: objectType };

    for (const item of result.content) {
      let parsed: { results?: { name?: string; type?: string; description?: string; packageName?: string }[] };
      try {
        parsed = JSON.parse(item.text);
      } catch {
        continue;
      }
      for (const found of parsed.results ?? []) {
        // 구와 같은 조건 — 이름이 대소문자 무시하고 정확히 같아야 한다.
        if (
          found.type &&
          found.name &&
          found.name.toUpperCase() === objectName.toUpperCase()
        ) {
          return {
            packageName: found.packageName || undefined,
            description: found.description || undefined,
            type: found.type,
          };
        }
      }
    }
  } catch {
    // 무시한다 — 구의 `catch (_e) {}`와 같은 자리다.
  }
  return { type: objectType };
}

/** 구 `buildTree`(`:156-247`). */
async function buildTree(
  context: ToolContext,
  client: AdtClient,
  objectType: string,
  objectName: string,
  depth: number,
  maxDepth: number,
  shouldEnrich: boolean,
  nodeId = '',
): Promise<ObjectInfoNode> {
  const enrichment: Enrichment = shouldEnrich
    ? await enrich(context, objectType, objectName)
    : { type: objectType };

  const children: ObjectInfoNode[] = [];
  if (depth < maxDepth) {
    // 뿌리는 '0000', 그 아래는 그 노드의 NODE_ID를 그대로 쓴다.
    const nodes = await fetchNodes(
      client,
      objectType,
      objectName,
      depth === 0 ? '0000' : nodeId,
    );

    for (const node of nodes) {
      if (depth + 1 === maxDepth) {
        // 마지막 단계에서는 말단 잎만 담는다. 묶음 노드는 버린다.
        if (isTerminalLeaf(node)) {
          children.push({
            OBJECT_TYPE: getText(node, 'OBJECT_TYPE'),
            OBJECT_NAME: getText(node, 'OBJECT_NAME'),
            PARENT_NODE_ID: getText(node, 'PARENT_NODE_ID'),
          });
        }
        continue;
      }

      if (isGroupNode(node)) {
        const sub = await buildTree(
          context,
          client,
          getText(node, 'OBJECT_TYPE') ?? '',
          getText(node, 'OBJECT_NAME') ?? '',
          depth + 1,
          maxDepth,
          shouldEnrich,
          String(getText(node, 'NODE_ID') ?? ''),
        );
        const groupNode: ObjectInfoNode = {
          OBJECT_TYPE: getText(node, 'OBJECT_TYPE'),
          OBJECT_NAME: getText(node, 'OBJECT_NAME'),
          PARENT_NODE_ID: getText(node, 'PARENT_NODE_ID'),
        };
        // 묶음 노드는 **자식만** 물려받는다 — 보강 값은 딸려 오지 않는다(구 그대로).
        if (Array.isArray(sub.CHILDREN) && sub.CHILDREN.length > 0) {
          groupNode.CHILDREN = sub.CHILDREN;
        }
        children.push(groupNode);
      } else if (isTerminalLeaf(node)) {
        children.push({
          OBJECT_TYPE: getText(node, 'OBJECT_TYPE'),
          OBJECT_NAME: getText(node, 'OBJECT_NAME'),
          PARENT_NODE_ID: getText(node, 'PARENT_NODE_ID'),
        });
      }
      // 묶음도 잎도 아니면 버린다.
    }
  }

  const resultNode: ObjectInfoNode = {
    OBJECT_TYPE: enrichment.type || objectType,
    OBJECT_NAME: objectName,
    OBJECT_DESCRIPTION: enrichment.description,
    OBJECT_PACKAGE: enrichment.packageName,
  };
  if (children.length > 0) resultNode.CHILDREN = children;
  return resultNode;
}

export const getObjectInfo = defineTool(
  {
    name: 'GetObjectInfo',
    description:
      '[read-only] Return ABAP object tree structure for packages (DEVC), classes (CLAS), programs (PROG), function groups (FUGR), and other objects. Shows root, group nodes, and terminal leaves up to maxDepth. Enrich each node with description and package via SearchObject if enrich=true.',
    inputSchema: {
      parent_type: z.string().describe('[read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)'),
      parent_name: z.string().describe('[read-only] Parent object name'),
      maxDepth: z
        .number()
        .default(1)
        .describe('[read-only] Maximum tree depth (default depends on type)'),
      enrich: z
        .boolean()
        .optional()
        .describe('[read-only] Whether to add description and package via SearchObject (default true)'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['parent_name'],
  },
  async (context, args) => {
    try {
      if (!args.parent_type || !args.parent_name) {
        // 구는 McpError를 던져 자기 catch에서 `error.message`를 실었다.
        return failure('MCP error -32602: parent_type and parent_name are required');
      }

      context.logger.info(
        `Building object info tree for ${args.parent_type}/${args.parent_name}`,
      );

      const maxDepth = Number.isInteger(args.maxDepth)
        ? args.maxDepth
        : getDefaultDepth(args.parent_type);
      const shouldEnrich = typeof args.enrich === 'boolean' ? args.enrich : true;

      const client = await context.getConnection();
      const result = await buildTree(
        context,
        client,
        args.parent_type,
        args.parent_name,
        0,
        maxDepth,
        shouldEnrich,
      );

      context.logger.debug(`Object tree built with depth ${maxDepth} (enrich=${shouldEnrich})`);
      return ok(JSON.stringify(result));
    } catch (error) {
      context.logger.error(
        `Failed to build object info for ${args.parent_type}/${args.parent_name}`,
      );
      // 구는 이 자리에서 `error.message`만 싣는다 — `ADT error: ` 접두사가 없다.
      return failure(error instanceof Error ? error.message : String(error));
    }
  },
);
