/**
 * `GetPackageContents` — 패키지 하나의 내용물을 **평평한 목록**으로.
 *
 * 구 핸들러: `engine/src/handlers/package/readonly/handleGetPackageContents.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `utils.getPackageContentsList(...)` 한 줄이고(`:53-60`), 실제
 * 왕복은 안쪽 패키지에 있다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:521-523`
 *   → `dist/core/shared/packageContentsList.js:160-236`
 *   → `dist/core/shared/nodeStructure.js:29-56`
 *
 * 요청은 한 종류뿐이고, `GetPackageTree`가 쓰는 것과 **같은 엔드포인트**다:
 *
 * ```
 * POST /sap/bc/adt/repository/nodestructure
 *      ?parent_type=DEVC%2FK&parent_name=…&parent_tech_name=…&withShortDescriptions=…[&node_id=…]
 * ```
 *
 * `parent_tech_name`에는 `parent_name`과 **같은 값**이 들어가고(`nodeStructure.js:32-34`),
 * 본문은 `TV_NODEKEY` 하나를 담은 asx 문서이며 `node_id`가 없을 때의 기본값은
 * 여섯 자리 `000000`이다(`:39`).
 *
 * 훑는 순서(`packageContentsList.js:160-199`):
 *  1. `node_id` 없이 한 번 — 하위 패키지 목록과 **오브젝트 종류별 `NODE_ID` 표**.
 *  2. 그 표를 돌며 종류마다 한 번씩 더 — **`DEVC*` 종류는 건너뛴다**(하위
 *     패키지는 1에서 이미 받았다). **종류 하나가 실패해도 그 종류만 빠진다**(`:186-192`).
 *  3. `include_subpackages`가 참이면 하위 패키지마다 1~2를 되풀이한다. **순차**다.
 *
 * ## `GetPackageTree`와 헷갈리지 말 것 (같은 엔드포인트, 다른 계약)
 *
 *  1. **결과 모양** — 이쪽은 평평한 배열, 그쪽은 트리 한 덩이(`package_name`·
 *     `tree`·`metadata` 키를 가진 객체).
 *  2. **항목 키** — 이쪽은 `name`·`adtType`·`type`·`description`·`packageName`·
 *     `isPackage`. 그쪽은 `is_package`·`codeFormat`·`restoreStatus`·`children`.
 *  3. **`include_subpackages` 기본값** — 이쪽은 **거짓**(`options?.includeSubpackages
 *     === true`, `packageContentsList.js:211`), 그쪽은 참.
 *  4. **`max_depth: 0`** — 이쪽은 `?? 5`라 **0이 0으로 산다**(하위 패키지를 한 발도
 *     묻지 않는다). 그쪽은 겉 핸들러의 `|| 5` 때문에 0이 5가 된다.
 *  5. **안전 집합** — 이쪽만 `readonly`라 `--exposition=readonly` 표면에 뜬다.
 *
 * ## ⚠ `NODE_ID`의 앞자리 0이 사라진다 (구의 실측)
 *
 * 파서가 태그 값을 수로 바꾸므로(`packageContentsList.js:10-15`의 옵션 —
 * `parseTagValue`를 끄지 않았다) `<NODE_ID>000012</NODE_ID>`가 **수 12**가 되고,
 * 다시 문자열로 만들면 `"12"`가 된다. 그래서 두 번째 요청은 `node_id=000012`가
 * 아니라 **`node_id=12`**로 나가고 본문의 `TV_NODEKEY`도 `12`다. 고치지 않았다 —
 * 구가 이 값으로 동작해 왔고, `GetPackageTree`도 같은 자리에서 같다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 *  - 구 핸들러에는 `args.filePath`로 결과를 파일에 쓰는 갈래가 있지만
 *    (`handleGetPackageContents.ts:72-74`) **발행 스키마에 그 인자가 없어** MCP
 *    통로로는 닿지 않는다. 짓지 않았다.
 *  - 인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다 — 이미
 *    등재된 축소분이다(`harness/DIVERGENCES.md` D34).
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { failure, messageOf, ok } from './internal/results';

const NODESTRUCTURE_PATH = '/sap/bc/adt/repository/nodestructure';

/** `nodeStructure.js:50-53`의 두 줄. 세미콜론 뒤 공백 유무까지 구 그대로다. */
const NODESTRUCTURE_ACCEPT =
  'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml';
const NODESTRUCTURE_CONTENT_TYPE = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=null';

const PARENT_TYPE = 'DEVC/K';

/** `packageContentsList.js:10-15`의 파서 옵션 그대로. 수로 보이는 값은 수가 된다. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  trimValues: true,
});

type SupportedType =
  | 'package' | 'domain' | 'dataElement' | 'structure' | 'table' | 'tableType' | 'view'
  | 'class' | 'interface' | 'program' | 'functionGroup' | 'functionModule'
  | 'serviceDefinition' | 'metadataExtension' | 'behaviorDefinition' | 'behaviorImplementation';

interface ContentItem {
  readonly name: string;
  readonly adtType: string;
  readonly type: SupportedType | undefined;
  readonly description: string | undefined;
  readonly packageName: string;
  readonly isPackage: boolean;
}

/** 구 `readNodeValue`(`packageContentsList.js:16-36`) — 요소가 객체로 와도 본문을 꺼낸다. */
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

const isPackageType = (adtType: string): boolean =>
  adtType === 'DEVC' || adtType.startsWith('DEVC/');

/**
 * 구 `mapAdtTypeToSupported`(`packageContentsList.js:38-101`) — 정확 일치 먼저,
 * 그다음 접두사. `GetPackageTree` 쪽 표와 **한 줄이 다르다**: 이 표에는
 * `'BIMP/BI'`·`'BIMP/BO'` 항목이 없다(접두사 `BIMP/`가 받아 낸다).
 */
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
};

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
  return undefined;
}

interface RawNode {
  readonly OBJECT_NAME?: unknown;
  readonly OBJECT_TYPE?: unknown;
  readonly DESCRIPTION?: unknown;
}

interface ObjectTypeInfo {
  readonly objectType: string;
  readonly nodeId: string;
}

/** 구 `parseNodeStructure`(`:102-140`) — 실패는 전부 빈 결과로 접힌다. */
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

/** 구 `parseNodesToItems`(`:141-159`) — 이름이나 종류가 없으면 항목이 아니다. */
function toItems(
  nodes: readonly RawNode[],
  packageName: string,
  includeDescriptions: boolean,
): ContentItem[] {
  const items: ContentItem[] = [];
  for (const node of nodes) {
    const objectName = readNodeValue(node?.OBJECT_NAME);
    const objectType = readNodeValue(node?.OBJECT_TYPE)?.toUpperCase();
    const description = readNodeValue(node?.DESCRIPTION);
    if (!objectName || !objectType) continue;
    items.push({
      name: String(objectName).trim(),
      adtType: objectType,
      type: mapAdtTypeToSupported(objectType),
      description: includeDescriptions && description ? String(description).trim() : undefined,
      packageName,
      isPackage: isPackageType(objectType),
    });
  }
  return items;
}

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
      parent_type: PARENT_TYPE,
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

/** 구 `fetchPackageContentsFlat`(`packageContentsList.js:160-199`). */
async function fetchFlat(
  client: AdtClient,
  packageName: string,
  includeDescriptions: boolean,
): Promise<ContentItem[]> {
  const rootXml = await fetchNodeStructure(client, packageName, undefined, includeDescriptions);
  const { nodes, objectTypes } = parseNodeStructure(rootXml);
  const items = toItems(nodes, packageName, includeDescriptions);

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
      items.push(...toItems(parseNodeStructure(typeXml).nodes, packageName, includeDescriptions));
    } catch {
      // 종류 하나가 실패해도 그 종류만 빠지고 계속 간다.
    }
  }
  return items;
}

export const getPackageContents = defineTool(
  {
    name: 'GetPackageContents',
    description:
      '[read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages.',
    inputSchema: {
      package_name: z.string().describe('Name of the ABAP package (e.g., "ZMY_PACKAGE")'),
      include_subpackages: z
        .boolean()
        .optional()
        .describe('Include contents of subpackages recursively (default: false)'),
      max_depth: z
        .number()
        .optional()
        .describe('Maximum depth for recursive package traversal (default: 5)'),
      include_descriptions: z
        .boolean()
        .optional()
        .describe('Include object descriptions in response (default: true)'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/package/readonly/`이고 채록본 `exposures` 네 조건 전부에 뜬다.
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['package_name'],
  },
  async (context, args) => {
    try {
      if (!args.package_name) {
        // 구는 `McpError(InvalidParams, …)`를 던져 자기 catch에서 접었다 — 문장은
        // 그대로, 접두사만 빠진다(D34).
        return failure('Package name is required');
      }

      const client = await context.getConnection();
      const packageName = args.package_name.toUpperCase();
      // 셋의 기본값이 서로 다르다 — 구 그대로다(`packageContentsList.js:210-212`).
      const includeSubpackages = args.include_subpackages === true;
      const maxDepth = args.max_depth ?? 5;
      const includeDescriptions = args.include_descriptions !== false;

      const items = await fetchFlat(client, packageName, includeDescriptions);

      if (includeSubpackages) {
        const visited = new Set<string>([packageName]);

        const walk = async (subpackageName: string, depth: number): Promise<ContentItem[]> => {
          if (depth >= maxDepth || visited.has(subpackageName)) return [];
          visited.add(subpackageName);
          const subItems = await fetchFlat(client, subpackageName, includeDescriptions);
          // 자식 목록은 **훑기 전에** 한 번 고정된다 — 되풀이 중에 `visited`가
          // 늘어도 이 목록은 바뀌지 않는다(구 그대로).
          const nested = subItems.filter((item) => item.isPackage && !visited.has(item.name));
          const nestedItems: ContentItem[] = [];
          for (const child of nested) {
            // **순차**다 — RFC 접속은 세션당 동시 요청이 하나뿐이라 병렬은 교착한다.
            nestedItems.push(...(await walk(child.name, depth + 1)));
          }
          return [...subItems, ...nestedItems];
        };

        for (const subpackage of items.filter((item) => item.isPackage)) {
          items.push(...(await walk(subpackage.name, 1)));
        }
      }

      return ok(JSON.stringify(items, null, 2));
    } catch (error) {
      // 구는 여기서 `Error: ` 접두사를 붙이지 않는다 — `return_error`를 쓰지 않고
      // 자기 손으로 접는다(`handleGetPackageContents.ts:77-87`).
      return failure(messageOf(error));
    }
  },
);
