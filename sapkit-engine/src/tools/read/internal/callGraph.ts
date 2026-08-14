/**
 * 호출 관계 그래프의 **순수 BFS 엔진**과 그 확장기가 쓰는 where-used 왕복.
 *
 * ## 어디서 읽었나
 *
 * 구는 엔진과 겉을 갈라 두었다 — `engine/src/lib/callGraph.ts`(순수 BFS,
 * SAP·ADT·네트워크 무의존)와 `engine/src/handlers/system/readonly/
 * handleGetCallGraph.ts`(실제 확장기 배선). **구 엔진 자체 시험이 있는 자리**라
 * (`engine/src/__tests__/unit/callGraph.test.ts`) 그 시험이 계약의 정본이다.
 * 여기서도 같은 가름을 유지한다: 이 파일이 엔진, `../getCallGraph.ts`가 배선.
 *
 * where-used 왕복은 구에서 벤더 함수 하나였다
 * (`@babamba2/mcp-abap-adt-clients/dist/core/shared/whereUsed.js:190-334`의
 * `getWhereUsedList`). 이 판의 `GetWhereUsed` 도구가 같은 두 발을 이미 복원해
 * 두었으므로 **정규식 두 개(`buildObjectUri`·`scopeToRequestFragment`)는 거기서
 * 가져다 쓴다** — 두 벌로 두면 조용히 갈라진다.
 *
 * ## 왜 `GetWhereUsed`의 `parseWhereUsed`를 쓰지 않는가
 *
 * 그 파서는 `parentUri`를 버린다. 이 판의 확장기는 함수모듈 이웃의 **함수그룹을
 * URI에서 캐내야** 하고, 그 근거가 `uri` 아니면 `parentUri`다
 * (`handleGetCallGraph.ts:181-183`). 벤더 파서는 `parentUri`를 담는다
 * (`whereUsed.js:315`). 그래서 여기서 한 벌 더 만든다 — 버려진 필드 하나 때문이다.
 */

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient } from '../../../adt';
import { buildObjectUri, scopeToRequestFragment } from '../getWhereUsed';

// ── 순수 BFS 엔진 (`engine/src/lib/callGraph.ts`) ────────────────────────────

/** 한 층을 넓힐 때의 기본 동시성(`callGraph.ts:14`). */
const DEFAULT_CONCURRENCY = 5;

/** Z·Y 접두 또는 `/NAMESPACE/` 시작(`callGraph.ts:17`). */
const CUSTOM_OBJECT_RE = /^\/[A-Z0-9_]+\/|^[YZ]/i;

export function isCustomObject(name: string): boolean {
  return CUSTOM_OBJECT_RE.test(name ?? '');
}

/** `${TYPE}:${NAME}` — 양쪽 다 대문자(`callGraph.ts:25-27`). */
export function makeNodeId(objectType: string, name: string): string {
  return `${(objectType ?? '').toUpperCase()}:${(name ?? '').toUpperCase()}`;
}

export interface CallGraphNodeRef {
  readonly object_type: string;
  readonly name: string;
}

export interface CallGraphNeighbor extends CallGraphNodeRef {
  readonly role: 'caller' | 'callee';
}

export interface ExpandResult {
  readonly neighbors: CallGraphNeighbor[];
  readonly expandable: boolean;
}

export interface CallGraphNode extends CallGraphNodeRef {
  readonly id: string;
  readonly depth: number;
  /** 확장을 시도하기 전까지는 참이다 — "아직 안 폈다"와 "못 편다"를 가른다. */
  expandable: boolean;
}

export interface CallGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'calls' | 'used_by';
}

export interface SkippedNode {
  readonly node: string;
  readonly reason: string;
}

export interface CallGraphResult {
  readonly nodes: CallGraphNode[];
  readonly edges: CallGraphEdge[];
  readonly truncated: boolean;
  readonly skipped: SkippedNode[];
  readonly stats: {
    readonly node_count: number;
    readonly edge_count: number;
    readonly expanded: number;
    readonly skipped_count: number;
  };
}

export type NodeExpander = (node: CallGraphNode) => Promise<ExpandResult>;

export interface CallGraphOptions {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly concurrency?: number;
}

/** 구 `runWithConcurrency`(`engine/src/lib/promisePool.ts`)와 같은 계약. */
async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: limit }, runNext));
}

/**
 * 너비 우선 순회(`callGraph.ts:105-205`).
 *
 * 지키는 것 넷:
 *  - `maxDepth`는 1~4로 **여기서 다시** 조인다(겉에서 이미 조여도 한 번 더).
 *  - 한 마디는 한 번만 편다(순환 안전).
 *  - 확장기가 던지면 **삼켜서** `skipped`에 적는다. 순회는 이어진다.
 *  - `maxNodes`에 닿으면 그 이웃을 **통째로 버린다** — 마디만 빠지고 간선이
 *    남는 일이 없게 `continue`다(`:172-175`).
 */
export async function runCallGraphBfs(
  root: CallGraphNodeRef,
  expander: NodeExpander,
  options: CallGraphOptions,
): Promise<CallGraphResult> {
  const maxDepth = Math.max(1, Math.min(4, options.maxDepth));
  const maxNodes = Math.max(1, options.maxNodes);
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const rootId = makeNodeId(root.object_type, root.name);
  const nodes = new Map<string, CallGraphNode>();
  nodes.set(rootId, {
    id: rootId,
    object_type: root.object_type,
    name: root.name,
    depth: 0,
    expandable: true,
  });

  const edgeKeys = new Set<string>();
  const edges: CallGraphEdge[] = [];
  const skipped: SkippedNode[] = [];
  let truncated = false;
  let expanded = 0;

  const addEdge = (from: string, to: string, kind: 'calls' | 'used_by'): void => {
    const key = `${from}|${to}|${kind}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, kind });
  };

  let frontier = [rootId];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const nextFrontier: string[] = [];

    await runWithConcurrency(frontier, concurrency, async (nodeId) => {
      if (truncated) return;
      const node = nodes.get(nodeId);
      if (!node) return;

      let result: ExpandResult;
      try {
        result = await expander(node);
      } catch (error) {
        node.expandable = false;
        skipped.push({
          node: nodeId,
          reason: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      node.expandable = result.expandable;
      expanded++;
      if (!result.expandable) return;

      for (const neighbor of result.neighbors) {
        const neighborId = makeNodeId(neighbor.object_type, neighbor.name);
        const [from, to, kind]: [string, string, 'calls' | 'used_by'] =
          neighbor.role === 'caller'
            ? [neighborId, nodeId, 'used_by']
            : [nodeId, neighborId, 'calls'];

        if (!nodes.has(neighborId)) {
          if (nodes.size >= maxNodes) {
            truncated = true;
            continue; // 마디와 간선이 어긋나지 않게 이웃을 통째로 버린다.
          }
          nodes.set(neighborId, {
            id: neighborId,
            object_type: neighbor.object_type,
            name: neighbor.name,
            depth: node.depth + 1,
            expandable: true,
          });
          nextFrontier.push(neighborId);
        }
        addEdge(from, to, kind);
      }
    });

    frontier = nextFrontier;
    depth++;
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    truncated,
    skipped,
    stats: {
      node_count: nodes.size,
      edge_count: edges.length,
      expanded,
      skipped_count: skipped.length,
    },
  };
}

/**
 * `direction: 'both'`의 확장기(`callGraph.ts:214-251`).
 *
 * **뿌리만 두 방향을 함께 편다.** 나머지 마디는 자기를 처음 발견한 방향으로만
 * 펴서, "뿌리를 부르는 쪽"과 "뿌리가 부르는 쪽"이 중간에서 섞이지 않게 한다.
 * 역할을 모르는 마디의 기본값은 `callee`다(`:240`).
 */
export function combineDirectionExpanders(
  rootId: string,
  callersExpander: NodeExpander,
  calleesExpander: NodeExpander,
): NodeExpander {
  const roleOf = new Map<string, 'caller' | 'callee'>();

  return async (node: CallGraphNode): Promise<ExpandResult> => {
    if (node.id === rootId) {
      const [callers, callees] = await Promise.all([
        callersExpander(node),
        calleesExpander(node),
      ]);
      for (const neighbor of callers.neighbors) {
        roleOf.set(makeNodeId(neighbor.object_type, neighbor.name), 'caller');
      }
      for (const neighbor of callees.neighbors) {
        const id = makeNodeId(neighbor.object_type, neighbor.name);
        if (!roleOf.has(id)) roleOf.set(id, 'callee');
      }
      return {
        neighbors: [...callers.neighbors, ...callees.neighbors],
        expandable: callers.expandable || callees.expandable,
      };
    }

    const role = roleOf.get(node.id) ?? 'callee';
    const result = role === 'caller' ? await callersExpander(node) : await calleesExpander(node);
    for (const neighbor of result.neighbors) {
      const id = makeNodeId(neighbor.object_type, neighbor.name);
      if (!roleOf.has(id)) roleOf.set(id, role);
    }
    return result;
  };
}

// ── where-used 왕복 (`whereUsed.js:190-334`의 `getWhereUsedList`) ────────────

const SCOPE_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences/scope';
const SEARCH_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences';

/** `dist/constants/contentTypes.js:53-56`의 넷 — `GetWhereUsed`와 같은 값이다. */
const CT_SCOPE_REQUEST = 'application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml';
const ACCEPT_SCOPE_RESPONSE =
  'application/vnd.sap.adt.repository.usagereferences.scope.response.v1+xml';
const CT_SEARCH_REQUEST = 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml';
const ACCEPT_SEARCH_RESULT = 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml';

const SCOPE_REQUEST_BODY =
  '<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageScopeRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageScopeRequest>';

/** `whereUsed.js:14-18`의 설정 — 속성을 **문자열 그대로** 둔다. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
});

export interface CallGraphReference {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
  /** `GetWhereUsed`의 파서가 버리는 값 — 함수그룹을 캐낼 때 쓴다. */
  readonly parentUri?: string;
}

/** `whereUsed.js:277-330` — `DEVC/K`는 담는 그릇이라 목록에서 뺀다. */
export function parseWhereUsedReferences(xml: string): CallGraphReference[] {
  const parsed = parser.parse(xml) as Record<string, any>;
  const root = parsed['usagereferences:usageReferenceResult'];
  if (!root) return [];

  const container = root['usagereferences:referencedObjects'];
  const raw = container?.['usagereferences:referencedObject'];
  const items: any[] = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw];

  const references: CallGraphReference[] = [];
  for (const item of items) {
    const adtObject = item?.['usagereferences:adtObject'];
    if (!adtObject) continue;
    const type = adtObject['@_adtcore:type'] || '';
    if (type === 'DEVC/K') continue;
    references.push({
      uri: item['@_uri'] || '',
      name: adtObject['@_adtcore:name'] || '',
      type,
      parentUri: item['@_parentUri'],
    });
  }
  return references;
}

/**
 * 두 발 — 범위 질의 → 검색. `scopeXml`을 주지 않으므로 **언제나 SAP의 기본
 * 선택**을 쓴다(`handleGetCallGraph.ts:168-171`이 `enableAll`을 넘기지 않는다).
 */
export async function fetchWhereUsedReferences(
  client: AdtClient,
  objectName: string,
  objectType: string,
): Promise<CallGraphReference[]> {
  const uriParam = encodeURIComponent(buildObjectUri(objectName, objectType));

  const scopeResponse = await client.request({
    method: 'POST',
    path: `${SCOPE_PATH}?uri=${uriParam}`,
    body: SCOPE_REQUEST_BODY,
    contentType: CT_SCOPE_REQUEST,
    accept: ACCEPT_SCOPE_RESPONSE,
    timeout: 'default',
  });

  const searchResponse = await client.request({
    method: 'POST',
    path: `${SEARCH_PATH}?uri=${uriParam}`,
    body:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
      '<usagereferences:affectedObjects/>' +
      scopeToRequestFragment(scopeResponse.body) +
      '</usagereferences:usageReferenceRequest>',
    contentType: CT_SEARCH_REQUEST,
    accept: ACCEPT_SEARCH_RESULT,
    timeout: 'default',
  });

  return parseWhereUsedReferences(searchResponse.body);
}
