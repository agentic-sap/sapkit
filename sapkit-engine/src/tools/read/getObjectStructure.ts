/**
 * GetObjectStructure — ADT 프로젝트 탐색기의 오브젝트 구조를 들여쓴 트리 글로 접는다.
 *
 * ## 와이어 동작을 어디서 복원했나
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleGetObjectStructure.ts:97-100`)는
 * `createAdtClient(connection, logger).getUtils().getObjectStructure(…)`만 부른다.
 * 요청이 조립되는 자리는 안쪽 패키지다 —
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:560-562` →
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/objectStructure.js:27-45`:
 *
 *  - `GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=…`
 *  - 질의 문자열은 **손으로 이어 붙인다**(axios `params`를 쓰지 않는다). 그래서
 *    인자 순서가 `objecttype` → `objectname`으로 고정된다.
 *  - `Accept: application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml`
 *  - 본문 없음. GET이라 CSRF 취득도 상태유지 헤더도 붙지 않는다.
 *
 * 인자 검증은 그 패키지가 한다(`objectStructure.js:28-33` — `Object type is
 * required` / `Object name is required`). 다만 겉 핸들러가 **먼저** 자기 문구로
 * 막으므로(`handleGetObjectStructure.ts:91-95`) 실제로 사용자에게 닿는 것은
 * 핸들러 쪽 문구다.
 *
 * ## ⚠ 오브젝트 이름이 **두 번** 인코딩된다 (구의 실측 — 그대로 옮겼다)
 *
 * `objectStructure.js:34-35`:
 *
 * ```js
 * const encodedType = encodeURIComponent(objectType);
 * const encodedName = encodeURIComponent(encodeSapObjectName(objectName));
 * ```
 *
 * 그런데 `encodeSapObjectName` 자체가 `encodeURIComponent`다
 * (`@babamba2/mcp-abap-adt-clients/dist/utils/internalUtils.js:19-21`). 즉 이름만
 * **두 겹**으로 인코딩된다 — `/CBY/ACQ_DDL` → `%252FCBY%252FACQ_DDL`. 타입은
 * 한 겹이다(`DDLS/DF` → `DDLS%2FDF`).
 *
 * 이 도구의 발행 설명이 드는 예가 하필 `/CBY/ACQ_DDL`이라, 이름공간 있는
 * 오브젝트에서는 서버가 받는 값이 `/CBY/ACQ_DDL`이 아니라 문자열
 * `%2FCBY%2FACQ_DDL`이 된다. **고치지 않았다** — 무엇이 옳은지는 실 시스템이
 * 정하는데 이 판은 SAP에 붙지 않으므로, 한 겹으로 바꾸는 것은 근거 없는 추측이
 * 된다. 이름에 슬래시가 없는 평범한 오브젝트(`ZI_DEMO`)는 두 인코딩 모두
 * 원문 그대로라 차이가 없다. 시험이 이 두 겹을 글자로 붙잡아 두었으니, 실
 * 시스템에서 확인되는 날 여기가 출발점이다.
 *
 * ## 트리 조립
 *
 * 응답은 `nodeid`/`parentid`를 가진 **평평한 노드 목록**이고, 핸들러가 그것을
 * 중첩 트리로 세운 뒤 글로 직렬화한다(`handleGetObjectStructure.ts:43-76`).
 * **부모를 못 찾은 노드는 뿌리가 된다**(`:54-58`의 else) — 버려지지 않는다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { failure, ok } from './internal/results';

interface FlatNode {
  readonly nodeid: string;
  readonly parentid?: string;
  readonly objecttype: string;
  readonly objectname: string;
}

interface TreeNode {
  readonly objecttype: string;
  readonly objectname: string;
  readonly children: TreeNode[];
}

/** 구 파서 옵션 그대로 — 속성 접두사가 없어 `nodeid` 등이 그대로 키가 된다. */
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

/**
 * 구 `buildNestedTree`(`handleGetObjectStructure.ts:43-61`) 그대로.
 *
 * `parentid`가 있어도 그 부모가 목록에 없으면 **뿌리로 올린다.** 조각난 응답이
 * 와도 노드를 잃지 않는 것이 구의 선택이다.
 */
export function buildNestedTree(flatNodes: readonly FlatNode[]): TreeNode[] {
  const nodeMap: Record<string, TreeNode> = {};
  for (const node of flatNodes) {
    nodeMap[node.nodeid] = {
      objecttype: node.objecttype,
      objectname: node.objectname,
      children: [],
    };
  }

  const roots: TreeNode[] = [];
  for (const node of flatNodes) {
    const self = nodeMap[node.nodeid];
    if (self === undefined) continue;
    const parent = node.parentid === undefined ? undefined : nodeMap[node.parentid];
    if (node.parentid && parent !== undefined) parent.children.push(self);
    else roots.push(self);
  }
  return roots;
}

/** 구 `serializeTree`(`:64-76`) 그대로 — 한 단계마다 두 칸씩 들여쓴다. */
export function serializeTree(tree: readonly TreeNode[], indent = ''): string {
  let result = '';
  for (const node of tree) {
    result += `${indent}- ${node.objecttype}: ${node.objectname}\n`;
    if (node.children.length > 0) {
      result += serializeTree(node.children, `${indent}  `);
    }
  }
  return result;
}

export const getObjectStructure = defineTool(
  {
    name: 'GetObjectStructure',
    description: '[read-only] Retrieve ADT object structure as a compact JSON tree.',
    inputSchema: {
      objecttype: z.string().describe('ADT object type (e.g. DDLS/DF)'),
      objectname: z.string().describe('ADT object name (e.g. /CBY/ACQ_DDL)'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['objectname'],
  },
  async (context, args) => {
    try {
      // 구 핸들러는 `objecttype`/`object_type` 두 이름을 다 받지만(`:89-90`),
      // 발행 스키마는 `objecttype`·`objectname`만 필수로 두므로 다른 이름은
      // 서버 검증에서 먼저 막힌다 — 구에서도 그 별칭 갈래는 닿을 수 없었다.
      const objectType = args.objecttype;
      const objectName = args.objectname;
      if (!objectType || !objectName) {
        throw new Error('objecttype/objectname (or object_type/object_name) are required');
      }

      const client = await context.getConnection();

      // 두 겹 인코딩은 의도가 아니라 구의 실측이다 — 위 머리주석 참조.
      const encodedType = encodeURIComponent(objectType);
      const encodedName = encodeURIComponent(encodeURIComponent(objectName));

      const response = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/repository/objectstructure?objecttype=${encodedType}&objectname=${encodedName}`,
        accept:
          'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml',
        timeout: 'default',
      });
      context.logger.info(`Fetched object structure for ${objectType}/${objectName}`);

      const parsed = parser.parse(response.body) as Record<string, any>;
      const raw = parsed['projectexplorer:objectstructure']?.['projectexplorer:node'];

      // 노드가 하나도 없으면 구는 **오류로** 답한다. 빈 트리를 내지 않는다.
      if (!raw) {
        return failure('No nodes found in object structure response.');
      }

      const nodes: FlatNode[] = Array.isArray(raw) ? raw : [raw];
      const tree = buildNestedTree(nodes);

      return ok(`tree:\n${serializeTree(tree)}`);
    } catch (error) {
      context.logger.error(
        `Failed to fetch object structure for ${args.objecttype}/${args.objectname}`,
      );
      // 구와 같은 문구다 — 접두사 `ADT error: `가 계약의 일부.
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
