/**
 * `GetCallGraph` — 호출 관계를 서버 쪽에서 너비 우선으로 펴 준다.
 *
 * 구 핸들러: `engine/src/handlers/system/readonly/handleGetCallGraph.ts`.
 * 순수 BFS 엔진: `engine/src/lib/callGraph.ts` (자체 시험
 * `engine/src/__tests__/unit/callGraph.test.ts`가 그 계약의 정본이다).
 * 이 판에서 그 엔진은 `./internal/callGraph.ts`에 옮겨 두었다.
 *
 * ## 두 방향, 두 가지 왕복
 *
 *  - **callers** — 마디마다 where-used 두 발(`POST …/usageReferences/scope` →
 *    `POST …/usageReferences`). `GetWhereUsed`가 쓰는 것과 **같은 두 발**이고,
 *    `scopeXml`을 주지 않으므로 SAP의 기본 선택을 쓴다.
 *  - **callees** — 마디의 소스를 읽어(`./internal/objectSource.ts`) 정규식
 *    스캐너(`./internal/context.ts`의 `scanAbapDependencies`)로 훑는다. 구도
 *    같은 두 부품을 썼다(`lib/objectSourceFetch.ts` · `lib/abapDependencyScan.ts`).
 *
 * ## 인자 조이기 — 순서와 falsy가 계약이다 (`:297-308`)
 *
 * ```
 * depth     = clamp(1, 4,   trunc(Number(depth)     || 2))
 * max_nodes = clamp(1, 300, trunc(Number(max_nodes) || 100))
 * custom_only = args.custom_only !== false
 * ```
 *
 * `|| `이므로 **`depth: 0`은 0이 아니라 2**이고 `max_nodes: 0`은 100이다.
 * `NaN`도 같은 자리에서 기본값으로 접힌다. 발행 스키마의 `default`와 어긋나지
 * 않으므로 그대로 뒀다.
 *
 * ## `FUNC` 마디의 함수그룹은 **URI에서 캐낸다**
 *
 * where-used 참조의 `uri`(없으면 `parentUri`)에서
 * `/functions/groups/{그룹}/fmodules/`를 정규식으로 뽑아 마디 id에 기억해 둔다
 * (`:122-131`·`:180-187`). 그것을 못 얻은 `FUNC` 마디는 **펴지 않는다**
 * (`:152-157` — `expandable: false`). 뿌리가 `FUNC`일 때는 인자
 * `function_group`이 필수라 그 자리는 채워진다.
 *
 * ## `custom_only`는 뿌리를 건드리지 않는다
 *
 * `node.depth > 0`일 때만 본다(`:145`·`:210`). 표준 오브젝트가 뿌리여도 한 번은
 * 편다는 뜻이고, 발행 설명문도 그렇게 약속한다.
 *
 * ## callees 확장기는 **일부러 던진다**
 *
 * 소스를 못 읽으면 `throw`해서 BFS가 그 이유를 `skipped`에 적게 한다
 * (`:224-226`). 조용히 빈 이웃으로 접으면 "이유 없이 잎이 된 마디"가 된다.
 *
 * ## 응답
 *
 * `{ root, direction, depth, truncated, stats, nodes, edges, skipped }`를
 * 들여쓰기 2칸으로. 오류는 **`Error: ` 접두사 없이** 메시지 한 줄이다
 * (`:373-381` — `return_error`를 쓰지 않는다).
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구의 `classifySourceType`은 `lib/objectSourceFetch.ts:37-49`이고 이 판의 것은
 * `./internal/objectSource.ts`에 같은 순서로 옮겨져 있다 — 같은 함수다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  combineDirectionExpanders,
  isCustomObject,
  makeNodeId,
  runCallGraphBfs,
  fetchWhereUsedReferences,
} from './internal/callGraph';
import type { CallGraphNeighbor, CallGraphNode, ExpandResult, NodeExpander } from './internal/callGraph';
import { scanAbapDependencies } from './internal/context';
import { classifySourceType, fetchObjectSource } from './internal/objectSource';
import { failure, ok } from './internal/results';

const ROOT_OBJECT_TYPES = ['CLAS', 'INTF', 'PROG', 'FUGR', 'FUNC'] as const;

const MAX_DEPTH = 4;
const MAX_MAX_NODES = 300;
const DEFAULT_MAX_NODES = 100;
const DEFAULT_DEPTH = 2;

/** `handleGetCallGraph.ts:52-58` — `FUNC`는 `GROUP|NAME`이라 따로 다룬다. */
const WHERE_USED_TYPE: Readonly<Record<string, string>> = {
  CLAS: 'class',
  INTF: 'interface',
  PROG: 'program',
  FUGR: 'function',
  INCL: 'include',
};

/** `handleGetCallGraph.ts:122-131`. */
export function extractFunctionGroupFromUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  const match = /\/functions\/groups\/([^/]+)\/fmodules\//i.exec(uri);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return match[1].toUpperCase();
  }
}

/** `buildCallersExpander`(`:139-194`). */
function buildCallersExpander(
  client: AdtClient,
  functionGroupOf: Map<string, string>,
  customOnly: boolean,
): NodeExpander {
  return async (node: CallGraphNode): Promise<ExpandResult> => {
    if (customOnly && node.depth > 0 && !isCustomObject(node.name)) {
      return { neighbors: [], expandable: false };
    }

    let whereUsedType: string;
    let objectName = node.name;
    if (node.object_type === 'FUNC') {
      const group = functionGroupOf.get(node.id);
      // 그룹을 싸게 알아내지 못한 함수모듈은 펴지 않는다 — 구의 알려진 한계다.
      if (!group) return { neighbors: [], expandable: false };
      whereUsedType = 'functionmodule';
      objectName = `${group}|${node.name}`;
    } else {
      const mapped = WHERE_USED_TYPE[node.object_type];
      if (!mapped) return { neighbors: [], expandable: false };
      whereUsedType = mapped;
    }

    const references = await fetchWhereUsedReferences(client, objectName, whereUsedType);

    const neighbors: CallGraphNeighbor[] = [];
    for (const reference of references) {
      if (!reference.name) continue;
      const refType = classifySourceType(reference.type) ?? 'OTHER';
      const neighborId = makeNodeId(refType, reference.name);
      if (neighborId === node.id) continue; // 자기 참조는 버린다.

      if (refType === 'FUNC') {
        const group =
          extractFunctionGroupFromUri(reference.uri) ??
          extractFunctionGroupFromUri(reference.parentUri);
        if (group && !functionGroupOf.has(neighborId)) functionGroupOf.set(neighborId, group);
      }

      neighbors.push({ object_type: refType, name: reference.name, role: 'caller' });
    }

    return { neighbors, expandable: true };
  };
}

/** `buildCalleesExpander`(`:203-249`). */
function buildCalleesExpander(
  client: AdtClient,
  context: ToolContext,
  customOnly: boolean,
): NodeExpander {
  return async (node: CallGraphNode): Promise<ExpandResult> => {
    if (customOnly && node.depth > 0 && !isCustomObject(node.name)) {
      return { neighbors: [], expandable: false };
    }
    if (node.object_type === 'OTHER') return { neighbors: [], expandable: false };

    const { source, skipReason } = await fetchObjectSource(
      client,
      'GetCallGraph',
      node.object_type,
      node.name,
      (message) => context.logger.warn(message),
    );
    // 던지는 것이 계약이다 — BFS가 이유를 `skipped`에 적는다.
    if (skipReason || source == null) throw new Error(skipReason ?? 'Source not available');

    const dependencies = scanAbapDependencies(source);
    const neighbors: CallGraphNeighbor[] = [
      ...dependencies.classes.map((name) => ({
        object_type: 'CLAS',
        name,
        role: 'callee' as const,
      })),
      ...dependencies.interfaces.map((name) => ({
        object_type: 'INTF',
        name,
        role: 'callee' as const,
      })),
      ...dependencies.functionModules.map((name) => ({
        object_type: 'FUNC',
        name,
        role: 'callee' as const,
      })),
    ].filter((neighbor) => makeNodeId(neighbor.object_type, neighbor.name) !== node.id);

    return { neighbors, expandable: true };
  };
}

export const getCallGraph = defineTool(
  {
    name: 'GetCallGraph',
    description:
      '[read-only] Build a call-relationship graph (callers and/or callees) for an ABAP object via server-side breadth-first traversal — replaces repeated round-trips of GetWhereUsed by expanding discovered nodes automatically up to a bounded depth and node count. Static analysis only: dynamic calls, BAdI dispatch, and other runtime-only wiring are not captured.',
    inputSchema: {
      object_type: z.enum(ROOT_OBJECT_TYPES).describe('Root ABAP object type.'),
      object_name: z.string().describe('Root ABAP object name.'),
      function_group: z
        .string()
        .optional()
        .describe(
          'Function group name — required only when object_type is FUNC (function modules are addressed as GROUP|NAME).',
        ),
      direction: z
        .enum(['callers', 'callees', 'both'])
        .default('callers')
        .describe(
          "'callers' = who uses the root (default), 'callees' = what the root calls, 'both' = both traversals merged into one graph.",
        ),
      depth: z.number().default(DEFAULT_DEPTH).describe('Max BFS depth from the root (1-4). Default 2.'),
      max_nodes: z
        .number()
        .default(DEFAULT_MAX_NODES)
        .describe('Global cap on total nodes in the returned graph (max 300). Default 100.'),
      custom_only: z
        .boolean()
        .optional()
        .describe(
          'When true (default), only Z*/Y*//NAMESPACE/ custom objects are expanded further during traversal — standard SAP objects still appear as leaf nodes but are not traversed past. The root is always expanded regardless of this flag.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/system/readonly/`이고 채록본의 네 조건 전부에 뜬다.
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['object_name'],
  },
  async (context, args) => {
    try {
      const objectType = String(args?.object_type ?? '')
        .trim()
        .toUpperCase();
      if (!objectType) throw new Error('object_type is required');
      if (!ROOT_OBJECT_TYPES.includes(objectType as (typeof ROOT_OBJECT_TYPES)[number])) {
        throw new Error(`object_type must be one of ${ROOT_OBJECT_TYPES.join(', ')}`);
      }

      const objectName = String(args?.object_name ?? '').trim();
      if (!objectName) throw new Error('object_name is required');
      const rootName = objectName.toUpperCase();

      let functionGroup: string | undefined;
      if (objectType === 'FUNC') {
        functionGroup = String(args?.function_group ?? '')
          .trim()
          .toUpperCase();
        if (!functionGroup) {
          throw new Error('function_group is required when object_type is FUNC');
        }
      }

      const direction = args?.direction ?? 'callers';

      // `||`라 0과 NaN이 기본값으로 접힌다 — 구 그대로다.
      const depth = Math.max(1, Math.min(MAX_DEPTH, Math.trunc(Number(args?.depth) || DEFAULT_DEPTH)));
      const maxNodes = Math.max(
        1,
        Math.min(MAX_MAX_NODES, Math.trunc(Number(args?.max_nodes) || DEFAULT_MAX_NODES)),
      );
      const customOnly = args?.custom_only !== false;

      const rootId = makeNodeId(objectType, rootName);
      context.logger.info(
        `GetCallGraph: root=${rootId} direction=${direction} depth=${depth} max_nodes=${maxNodes} custom_only=${customOnly}`,
      );

      const client = await context.getConnection();
      const functionGroupOf = new Map<string, string>();
      if (objectType === 'FUNC' && functionGroup) functionGroupOf.set(rootId, functionGroup);

      const callersExpander = buildCallersExpander(client, functionGroupOf, customOnly);
      const calleesExpander = buildCalleesExpander(client, context, customOnly);

      const expander: NodeExpander =
        direction === 'callers'
          ? callersExpander
          : direction === 'callees'
            ? calleesExpander
            : combineDirectionExpanders(rootId, callersExpander, calleesExpander);

      const result = await runCallGraphBfs(
        { object_type: objectType, name: rootName },
        expander,
        { maxDepth: depth, maxNodes },
      );

      return ok(
        JSON.stringify(
          {
            root: rootId,
            direction,
            depth,
            truncated: result.truncated,
            stats: result.stats,
            nodes: result.nodes,
            edges: result.edges,
            skipped: result.skipped,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error('Failed to build call graph');
      // 구 `:373-381` — 메시지 한 줄뿐이다. `Error: ` 접두사가 붙지 않는다.
      return failure(error instanceof Error ? error.message : String(error));
    }
  },
);
