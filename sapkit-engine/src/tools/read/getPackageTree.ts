/**
 * GetPackageTree — 패키지 하나를 하위 패키지·오브젝트까지 훑어 트리로 만든다.
 *
 * ## 이 묶음에서 유일하게 `system` 집합인 도구다
 *
 * 구 핸들러가 `high` 하위에 있는데도(`engine/src/handlers/system/high/handleGetPackageTree.ts`)
 * 채록본은 이 도구를 **네 노출 조건 전부**에 올려 둔다 — `--exposition=readonly`
 * 에서도 뜬다는 뜻이다. 다른 묶음의 `high` 하위 도구들(`ActivateObjects` 등)은
 * readonly 조건에서 빠지므로, `sets: ['high']`로 선언하면 노출이 어긋난다.
 *
 * 맞는 선언은 **`sets: ['system']`**이다. 구 서버가 `system` 그룹을 통째로
 * 등록했고 신 엔진에서도 `readonly`가 `system`을 함께 켜기 때문이다
 * (`src/safety/exposition.ts:167-174`의 `resolveActiveSets`). 같은 이유로
 * `system/low`의 세 도구도 readonly에서 뜬다 — 그 도구들을 지을 때 같은 판단이
 * 필요하다.
 *
 * ## 와이어 — 한 종류의 요청을 여러 번
 *
 * 겉 핸들러는 `utils.getPackageHierarchy(...)` 한 줄이고(`handleGetPackageTree.ts:87-91`),
 * 실제 왕복은 안쪽 패키지에 있다 —
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:543-545` →
 * `dist/core/shared/packageHierarchy.js:311-389` →
 * `dist/core/shared/nodeStructure.js:29-56`. 요청은 한 종류뿐이다:
 *
 * ```
 * POST /sap/bc/adt/repository/nodestructure
 *      ?parent_type=DEVC%2FK&parent_name=…&parent_tech_name=…&withShortDescriptions=…[&node_id=…]
 * ```
 *
 * `parent_tech_name`에는 **`parent_name`과 같은 값**이 들어간다(`nodeStructure.js:32-34`).
 * 본문은 `TV_NODEKEY` 하나를 담은 asx 문서이고, `node_id`가 없을 때의 기본값은
 * **여섯 자리 `000000`**이다(`nodeStructure.js:38`).
 *
 * 패키지 하나를 훑는 순서는 이렇다(`packageHierarchy.js:311-345`):
 *  1. `node_id` 없이 한 번 — 하위 패키지 목록과 **오브젝트 종류별 `NODE_ID` 표**를 받는다.
 *  2. 그 표를 돌며 종류마다 한 번씩 더 — 단 **`DEVC*` 종류는 건너뛴다**(하위
 *     패키지는 1에서 이미 받았다).
 *  3. 하위 패키지마다 1~3을 되풀이한다. **순차**다 — 그 자리의 주석이 이유를
 *     밝힌다: RFC 접속은 세션당 동시 요청이 하나뿐이라 병렬로 하면 교착한다.
 *
 * ## ⚠ `NODE_ID`의 앞자리 0이 사라진다 (구의 실측)
 *
 * 파서가 `parseAttributeValue: true`라(`packageHierarchy.js:12-17`)
 * `<NODE_ID>000001</NODE_ID>`가 **숫자 1**로 파싱되고, 다시 문자열로 만들면
 * `"1"`이 된다. 그래서 두 번째 요청은 `node_id=000001`이 아니라 **`node_id=1`**로
 * 나가고 본문의 `TV_NODEKEY`도 `1`이다. 고치지 않았다 — 실 시스템이 무엇을
 * 받아들이는지는 이 판이 확인할 수 없고, 구가 이 값으로 동작해 왔다.
 *
 * ## ⚠ `max_depth: 0`은 0이 아니라 5다 (구의 실측)
 *
 * 겉 핸들러가 `args.max_depth || 5`로 읽으므로(`handleGetPackageTree.ts:76`)
 * **0은 falsy라 기본값 5로 바뀐다.** 깊이 0으로 훑는 통로가 없다는 뜻이다.
 * 발행 스키마의 `default: 5`와도 어긋나지 않으므로 그대로 뒀다.
 *
 * ## `include_subpackages: false`가 뜻하는 것
 *
 * 하위 패키지를 **목록에서 빼는 것이 아니라** 그 안으로 더 들어가지 않는 것이다
 * (`packageHierarchy.js:351-353` — 자식 호출의 `maxDepth`를 `currentDepth + 1`로
 * 낮춰 첫 줄의 깊이 가드에 곧바로 걸리게 만든다). 그래서 하위 패키지는 **자식이
 * 빈 노드로** 남는다.
 *
 * ## 오류를 삼키는 자리
 *
 * 종류별 요청 하나가 실패해도 **그 종류만 빠지고 계속 간다**(`:337-341`).
 * XML 파싱 실패도 빈 결과로 접힌다(`:215-220`). 반면 **뿌리 요청과 하위 패키지
 * 요청의 실패는 통째로 던진다** — 감싸는 try가 없다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { failure, ok } from './internal/results';

const NODESTRUCTURE_PATH = '/sap/bc/adt/repository/nodestructure';

/** `nodeStructure.js:50-53`의 두 줄. 세미콜론 뒤 공백 유무까지 구 그대로다. */
const NODESTRUCTURE_ACCEPT =
  'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml';
const NODESTRUCTURE_CONTENT_TYPE = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=null';

/** `packageHierarchy.js:12-17`의 파서 옵션 그대로. 숫자로 보이는 값은 숫자가 된다. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  trimValues: true,
});

export type SupportedType =
  | 'package' | 'domain' | 'dataElement' | 'structure' | 'table' | 'tableType' | 'view'
  | 'class' | 'interface' | 'program' | 'functionGroup' | 'functionModule'
  | 'serviceDefinition' | 'metadataExtension' | 'behaviorDefinition' | 'behaviorImplementation';

export interface PackageTreeNode {
  name: string;
  adtType?: string;
  type?: SupportedType;
  description?: string;
  is_package: boolean;
  codeFormat?: 'source' | 'xml';
  restoreStatus?: 'ok' | 'not-implemented';
  children?: PackageTreeNode[];
}

/** 구 `readNodeValue`(`packageHierarchy.js:18-38`) — 요소가 객체로 와도 본문을 꺼낸다. */
function readNodeValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const text = record['#text'] ?? record['_text'];
    if (typeof text === 'string' || typeof text === 'number' || typeof text === 'boolean') {
      return String(text);
    }
  }
  return undefined;
}

function normalizeAdtType(value: unknown): string | undefined {
  if (!value) return undefined;
  const type = String(value).trim().toUpperCase();
  return type.length > 0 ? type : undefined;
}

const isPackageType = (adtType: string): boolean =>
  adtType === 'DEVC' || adtType.startsWith('DEVC/');

/** 구 `mapAdtTypeToCodeFormat`(`packageHierarchy.js:47-86`) — 검사 순서가 곧 우선순위다. */
export function mapAdtTypeToCodeFormat(adtType: string): 'source' | 'xml' | undefined {
  const type = normalizeAdtType(adtType);
  if (!type) return undefined;
  if (type === 'DEVC/K' || type === 'DEVC') return 'xml';
  if (type.startsWith('DEVC/')) return 'xml';
  if (type.startsWith('DOMA/')) return 'xml';
  if (type.startsWith('DTEL/')) return 'xml';
  if (type === 'FUGR/F' || type === 'FUGR') return 'xml';
  if (type.startsWith('CLAS/')) return 'source';
  if (type.startsWith('INTF/')) return 'source';
  if (type.startsWith('PROG/')) return 'source';
  if (type.startsWith('DDLS/')) return 'source';
  if (type.startsWith('DDLX/')) return 'source';
  if (type.startsWith('SRVD/')) return 'source';
  if (type.startsWith('TABL/DT')) return 'source';
  if (type.startsWith('TABL/DS') || type.startsWith('STRU/')) return 'source';
  if (type.startsWith('TTYP/')) return 'source';
  if (type.startsWith('FUGR/FF')) return 'source';
  if (type.startsWith('BDEF/')) return 'source';
  if (type.startsWith('BIMP/') || type.startsWith('BIMPL/')) return 'source';
  return undefined;
}

const EXACT_TYPE_MAP: Readonly<Record<string, SupportedType>> = {
  'DEVC/K': 'package',
  'DOMA/DD': 'domain',
  'DTEL/DE': 'dataElement',
  'TABL/DS': 'structure',
  'STRU/DT': 'structure',
  'TABL/DT': 'table',
  'TTYP/DF': 'tableType',
  'TTYP/TT': 'tableType',
  'DDLS/DF': 'view',
  'DDLX/EX': 'metadataExtension',
  'CLAS/OC': 'class',
  'INTF/IF': 'interface',
  'INTF/OI': 'interface',
  'PROG/P': 'program',
  'FUGR/FF': 'functionModule',
  'FUGR/F': 'functionGroup',
  FUGR: 'functionGroup',
  'SRVD/SRV': 'serviceDefinition',
  'BDEF/BDO': 'behaviorDefinition',
  'BIMP/BIM': 'behaviorImplementation',
  'BIMP/BI': 'behaviorImplementation',
  'BIMP/BO': 'behaviorImplementation',
};

/** 구 `mapAdtTypeToSupported`(`packageHierarchy.js:88-155`) — 정확 일치 먼저, 그다음 접두사. */
export function mapAdtTypeToSupported(adtType: string | undefined): SupportedType | undefined {
  if (!adtType) return undefined;
  const type = adtType.toUpperCase();
  const exact = EXACT_TYPE_MAP[type];
  if (exact) return exact;
  if (type.startsWith('CLAS/')) return 'class';
  if (type.startsWith('INTF/')) return 'interface';
  if (type.startsWith('PROG/')) return 'program';
  if (type.startsWith('DDLS/')) return 'view';
  if (type.startsWith('DDLX/')) return 'metadataExtension';
  if (type.startsWith('SRVD/')) return 'serviceDefinition';
  if (type.startsWith('DOMA/')) return 'domain';
  if (type.startsWith('DTEL/')) return 'dataElement';
  if (type.startsWith('TABL/DS') || type.startsWith('STRU/')) return 'structure';
  if (type.startsWith('TABL/DT')) return 'table';
  if (type.startsWith('TTYP/')) return 'tableType';
  if (type.startsWith('FUGR/FF')) return 'functionModule';
  if (type.startsWith('FUGR/')) return 'functionGroup';
  if (type.startsWith('DEVC/')) return 'package';
  if (type.startsWith('BDEF/')) return 'behaviorDefinition';
  if (type.startsWith('BIMP/')) return 'behaviorImplementation';
  if (type.startsWith('BIMPL/')) return 'behaviorImplementation';
  return undefined;
}

/** 구 `isRestoreImplemented`(`:157-179`) — 위 표가 아는 종류면 전부 참이다. */
const isRestoreImplemented = (type: SupportedType | undefined): boolean => type !== undefined;

interface RawNode {
  readonly OBJECT_NAME?: unknown;
  readonly OBJECT_TYPE?: unknown;
  readonly NODE_ID?: unknown;
  readonly PARENT_NODE_ID?: unknown;
  readonly DESCRIPTION?: unknown;
}

interface ObjectTypeInfo {
  readonly objectType: string;
  readonly nodeId: string;
}

/** 구 `parseNodeStructure`(`:180-221`) — 실패는 전부 빈 결과로 접힌다. */
export function parseNodeStructure(xml: string): {
  nodes: RawNode[];
  objectTypes: ObjectTypeInfo[];
} {
  const empty = { nodes: [] as RawNode[], objectTypes: [] as ObjectTypeInfo[] };
  try {
    if (!xml) return empty;
    const result = parser.parse(xml) as Record<string, any>;
    const data = result?.['asx:abap']?.['asx:values']?.DATA;

    const rawNodes = data?.TREE_CONTENT?.SEU_ADT_REPOSITORY_OBJ_NODE;
    const nodes: RawNode[] = rawNodes ? (Array.isArray(rawNodes) ? rawNodes : [rawNodes]) : [];

    const rawTypes = data?.OBJECT_TYPES?.SEU_ADT_OBJECT_TYPE_INFO;
    const typeInfos = rawTypes ? (Array.isArray(rawTypes) ? rawTypes : [rawTypes]) : [];

    const objectTypes: ObjectTypeInfo[] = [];
    for (const info of typeInfos) {
      const objectType = readNodeValue(info?.OBJECT_TYPE);
      const nodeId = readNodeValue(info?.NODE_ID);
      if (objectType && nodeId) objectTypes.push({ objectType, nodeId });
    }
    return { nodes, objectTypes };
  } catch {
    return empty;
  }
}

/**
 * 구 `buildTreeFromNodes`(`:222-301`).
 *
 * **`NODE_ID`와 `PARENT_NODE_ID`를 둘 다 가진 노드가 하나라도 있을 때만** 계층을
 * 세운다. 없으면 평평한 목록 그대로다 — 패키지 뿌리 응답이 보통 그렇다.
 */
export function buildTreeFromNodes(
  nodes: readonly RawNode[],
  includeDescriptions: boolean,
): PackageTreeNode[] {
  const nodeMap = new Map<string, PackageTreeNode & { _parentNodeId?: string }>();
  const orderedKeys: string[] = [];
  let hasHierarchy = false;

  for (const node of nodes) {
    const objectName = readNodeValue(node?.OBJECT_NAME);
    const objectType = normalizeAdtType(readNodeValue(node?.OBJECT_TYPE));
    const nodeId = readNodeValue(node?.NODE_ID);
    const parentNodeId = readNodeValue(node?.PARENT_NODE_ID);
    const description = readNodeValue(node?.DESCRIPTION);
    // 이름이나 종류가 없으면 노드가 아니다.
    if (!objectName || !objectType) continue;

    const key = nodeId || `${objectType}:${objectName}:${orderedKeys.length.toString()}`;
    const supported = mapAdtTypeToSupported(objectType);
    nodeMap.set(key, {
      name: String(objectName).trim(),
      adtType: objectType,
      type: supported,
      description: includeDescriptions
        ? description
          ? String(description).trim()
          : undefined
        : undefined,
      is_package: isPackageType(objectType),
      codeFormat: mapAdtTypeToCodeFormat(objectType),
      restoreStatus: isRestoreImplemented(supported) ? 'ok' : 'not-implemented',
      children: [],
      _parentNodeId: parentNodeId,
    });
    orderedKeys.push(key);
    if (nodeId && parentNodeId) hasHierarchy = true;
  }

  const strip = (entry: PackageTreeNode & { _parentNodeId?: string }): PackageTreeNode => {
    delete entry._parentNodeId;
    return entry;
  };

  if (!hasHierarchy) {
    return orderedKeys
      .map((key) => nodeMap.get(key))
      .filter((entry): entry is PackageTreeNode & { _parentNodeId?: string } => entry !== undefined)
      .map(strip);
  }

  const roots: PackageTreeNode[] = [];
  for (const key of orderedKeys) {
    const entry = nodeMap.get(key);
    if (!entry) continue;
    const parentId = entry._parentNodeId;
    // 부모를 못 찾으면 뿌리가 된다 — 버려지지 않는다.
    if (parentId && nodeMap.has(parentId)) nodeMap.get(parentId)?.children?.push(entry);
    else roots.push(entry);
  }
  for (const key of orderedKeys) {
    const entry = nodeMap.get(key);
    if (entry) strip(entry);
  }
  return roots;
}

const createPackageNode = (name: string, children: PackageTreeNode[]): PackageTreeNode => ({
  name,
  adtType: 'DEVC/K',
  type: 'package',
  is_package: true,
  codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
  restoreStatus: 'ok',
  children,
});

/** 구 `fetchNodeStructure`(`nodeStructure.js:29-56`) — 질의 인자와 본문 둘 다 싣는 POST다. */
async function fetchNodeStructure(
  client: AdtClient,
  parentName: string,
  nodeId: string | undefined,
  withShortDescriptions: boolean,
): Promise<string> {
  const nodeKey = nodeId || '000000';
  const response = await client.request({
    method: 'POST',
    path: NODESTRUCTURE_PATH,
    params: {
      parent_type: 'DEVC/K',
      parent_name: parentName,
      // 같은 값이 두 인자에 들어간다 — 구 그대로다.
      parent_tech_name: parentName,
      withShortDescriptions,
      ...(nodeId ? { node_id: nodeId } : {}),
    },
    body:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
      `<asx:values><DATA><TV_NODEKEY>${nodeKey}</TV_NODEKEY></DATA></asx:values>` +
      '</asx:abap>',
    accept: NODESTRUCTURE_ACCEPT,
    contentType: NODESTRUCTURE_CONTENT_TYPE,
    timeout: 'default',
  });
  return response.body;
}

/** 구 `fetchPackageTreeRecursive`(`packageHierarchy.js:311-372`). */
async function fetchPackageTreeRecursive(
  client: AdtClient,
  packageName: string,
  currentDepth: number,
  maxDepth: number,
  includeDescriptions: boolean,
  includeSubpackages: boolean,
): Promise<PackageTreeNode> {
  // 깊이 가드가 맨 앞이다 — 걸리면 요청을 **한 건도** 보내지 않는다.
  if (currentDepth >= maxDepth) return createPackageNode(packageName, []);

  const rootXml = await fetchNodeStructure(client, packageName, undefined, includeDescriptions);
  const { nodes, objectTypes } = parseNodeStructure(rootXml);
  const allNodes: RawNode[] = [...nodes];

  for (const info of objectTypes) {
    // 하위 패키지는 뿌리 응답에 이미 들어 있다.
    if (isPackageType(info.objectType)) continue;
    try {
      const typeXml = await fetchNodeStructure(
        client,
        packageName,
        info.nodeId,
        includeDescriptions,
      );
      allNodes.push(...parseNodeStructure(typeXml).nodes);
    } catch {
      // 종류 하나가 실패해도 그 종류만 빠지고 계속 간다.
    }
  }

  if (allNodes.length === 0) return createPackageNode(packageName, []);

  const children = buildTreeFromNodes(allNodes, includeDescriptions);
  const packageNode = createPackageNode(packageName, children);

  if (currentDepth < maxDepth && children.length > 0) {
    const subpackages = children.filter((child) => child.is_package);
    if (subpackages.length > 0) {
      // include_subpackages가 거짓이면 자식의 maxDepth를 낮춰 곧바로 가드에 걸리게 한다.
      const subMaxDepth = includeSubpackages ? maxDepth : currentDepth + 1;
      const trees: PackageTreeNode[] = [];
      // **순차**다 — RFC 접속은 세션당 동시 요청이 하나뿐이라 병렬은 교착한다.
      for (const subpackage of subpackages) {
        trees.push(
          await fetchPackageTreeRecursive(
            client,
            subpackage.name,
            currentDepth + 1,
            subMaxDepth,
            includeDescriptions,
            includeSubpackages,
          ),
        );
      }
      packageNode.children = packageNode.children?.map((child) => {
        if (!child.is_package) return child;
        const tree = trees.find((candidate) => candidate.name === child.name);
        return tree
          ? { ...tree, children: tree.children || [] }
          : { ...child, children: child.children || [] };
      });
    }
  }

  return packageNode;
}

export const getPackageTree = defineTool(
  {
    name: 'GetPackageTree',
    description:
      '[high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.',
    inputSchema: {
      package_name: z.string().describe('Package name (e.g., "ZMY_PACKAGE")'),
      include_subpackages: z
        .boolean()
        .optional()
        .describe(
          'Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true',
        ),
      max_depth: z
        .number()
        .default(5)
        .describe('Maximum depth for recursive package traversal. Default: 5'),
      include_descriptions: z
        .boolean()
        .optional()
        .describe('Include object descriptions in response. Default: true'),
      debug: z
        .boolean()
        .optional()
        .describe(
          'Include diagnostic metadata in response (counts, types, hierarchy info). Default: false',
        ),
    },
    available_in: ['onprem', 'cloud'],
    // 위 머리주석 참조 — `high`가 아니라 `system`이라야 네 조건이 맞는다.
    sets: ['system'],
    kind: 'read',
    targetNames: ['package_name'],
  },
  async (context, args) => {
    try {
      if (!args.package_name) {
        // 구는 `return_error(new Error(...))`로 접는다 — 접두사 `Error: `가 계약이다.
        return failure('Error: package_name is required');
      }

      const packageName = args.package_name.toUpperCase();
      const includeSubpackages = args.include_subpackages !== false;
      // ⚠ `|| 5`라 0이 5가 된다. 구 그대로다(`handleGetPackageTree.ts:76`).
      const maxDepth = args.max_depth || 5;
      const includeDescriptions = args.include_descriptions !== false;

      context.logger.info(
        `Fetching package tree for ${packageName} (include_subpackages: ${includeSubpackages}, max_depth: ${maxDepth}) using adt-clients`,
      );

      const client = await context.getConnection();
      const tree = await fetchPackageTreeRecursive(
        client,
        packageName,
        0,
        maxDepth,
        includeDescriptions,
        includeSubpackages,
      );

      // 뿌리는 무조건 패키지로 덮어쓴다(`packageHierarchy.js:383-387`).
      tree.name = packageName;
      tree.adtType = 'DEVC/K';
      tree.type = 'package';
      tree.is_package = true;
      tree.codeFormat = mapAdtTypeToCodeFormat('DEVC/K');

      context.logger.debug(`Package tree fetched successfully for ${packageName}`);

      // 구는 들여쓰기 2칸으로 싣는다(`handleGetPackageTree.ts:112-114`).
      return ok(
        JSON.stringify(
          {
            package_name: packageName,
            tree,
            metadata: {
              include_subpackages: includeSubpackages,
              max_depth: maxDepth,
              include_descriptions: includeDescriptions,
            },
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error('Failed to fetch package tree');
      return failure(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);
