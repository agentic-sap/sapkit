/**
 * 패키지 내용 평면 목록 — 노드 구조 조회를 되풀이해 패키지 하나의 오브젝트를 편다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/search/readonly/handleGrepPackages.ts:131-155`
 *    (`createAdtClient(...).getUtils().getPackageContentsList(name, {…})`)
 *  - 한 다리: `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:521-522`
 *  - 정본: 같은 패키지 `dist/core/shared/packageContentsList.js:103-237`
 *
 * ## 왕복이 한 번이 아니다
 *
 * 패키지 하나를 펴는 데 **최소 두 번**이 든다. 첫 요청(`node_id` 없음)은
 * 하위 패키지 마디와 함께 **`OBJECT_TYPES` 표**를 준다 — 오브젝트 종류마다
 * `NODE_ID`가 하나씩 적힌 표다. 실제 오브젝트는 그 `NODE_ID`로 한 번 더 물어야
 * 나온다. 그래서 종류가 n가지면 요청은 `1 + n`번이고, 종류별 요청 하나가
 * 실패해도 나머지는 계속 간다(벤더 `:188-190`의 빈 catch).
 *
 * ## XML 파서가 값을 바꾼다 — 실측
 *
 * 벤더 파서는 `parseTagValue`를 끄지 않아 **태그 본문의 숫자를 숫자로 읽는다.**
 * `<NODE_ID>000012</NODE_ID>`는 `12`가 되고, `readNodeValue`가 그것을 다시
 * 문자열로 만들어 `'12'`가 된다. 즉 **두 번째 요청에 나가는 `node_id`는
 * `000012`가 아니라 `12`다.** 설치된 두 판(구 엔진 · 신 엔진)에서 같은 결과를
 * 확인했다. 같은 XML을 정규식으로 읽는 `GetObjectsByType` 쪽은 `000012`를 그대로
 * 보므로, 두 도구가 같은 응답을 서로 다르게 읽는다 — 파서를 합치면 사라지는
 * 차이다. 합치지 않는다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 벤더는 항목마다 `type`(ADT 타입 → `class`·`table` 같은 자체 어휘)과
 * `description`을 함께 실었다. `GrepPackages`는 **둘 다 읽지 않는다** —
 * `isPackage`·`adtType`·`name` 셋만 본다. 결과가 같으므로 옮기지 않았다.
 * `includeDescriptions`는 와이어(`withShortDescriptions`)를 가르므로 남긴다.
 */

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient } from '../../../adt';
import { fetchNodeStructure } from './nodeStructure';

/** 벤더와 같은 파서 설정(`packageContentsList.js:11-16`). 값 해석이 여기 달렸다. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  trimValues: true,
});

export interface PackageItem {
  readonly name: string;
  /** 대문자로 올린 ADT 타입(`CLAS/OC` 류). */
  readonly adtType: string;
  readonly isPackage: boolean;
}

export interface PackageContentsOptions {
  readonly includeSubpackages?: boolean;
  /** 하위 패키지 재귀 깊이. 벤더 기본값 5. */
  readonly maxDepth?: number;
  /** 벤더 기본값은 참이다(`!== false`). */
  readonly includeDescriptions?: boolean;
}

/** 태그 본문을 문자열로 되돌린다(벤더 `readNodeValue`). */
function readNodeValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const text = (value as Record<string, unknown>)['#text'] ?? (value as Record<string, unknown>)._text;
    if (typeof text === 'string' || typeof text === 'number' || typeof text === 'boolean') {
      return String(text);
    }
  }
  return undefined;
}

function isPackageType(adtType: string): boolean {
  return adtType === 'DEVC' || adtType.startsWith('DEVC/');
}

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

interface ParsedNodeStructure {
  readonly nodes: unknown[];
  readonly objectTypes: Array<{ objectType: string; nodeId: string }>;
}

/** 트리 마디와 종류별 `NODE_ID` 표를 뽑는다. 파싱 실패는 빈 결과다(벤더와 같다). */
export function parseNodeStructure(xml: string): ParsedNodeStructure {
  const empty: ParsedNodeStructure = { nodes: [], objectTypes: [] };
  try {
    if (!xml) return empty;
    const document = parser.parse(xml) as Record<string, any>;
    const data = document?.['asx:abap']?.['asx:values']?.DATA;

    const nodes = asArray(data?.TREE_CONTENT?.SEU_ADT_REPOSITORY_OBJ_NODE);

    const objectTypes: Array<{ objectType: string; nodeId: string }> = [];
    for (const info of asArray(data?.OBJECT_TYPES?.SEU_ADT_OBJECT_TYPE_INFO)) {
      const objectType = readNodeValue((info as Record<string, unknown>)?.OBJECT_TYPE);
      const nodeId = readNodeValue((info as Record<string, unknown>)?.NODE_ID);
      if (objectType && nodeId) objectTypes.push({ objectType, nodeId });
    }

    return { nodes, objectTypes };
  } catch {
    return empty;
  }
}

function toItems(nodes: readonly unknown[]): PackageItem[] {
  const items: PackageItem[] = [];
  for (const node of nodes) {
    const record = node as Record<string, unknown>;
    const name = readNodeValue(record?.OBJECT_NAME);
    const adtType = readNodeValue(record?.OBJECT_TYPE)?.toUpperCase();
    if (!name || !adtType) continue;
    items.push({ name: name.trim(), adtType, isPackage: isPackageType(adtType) });
  }
  return items;
}

/** 패키지 하나를 편다 — 첫 요청 + 종류별 요청. 하위 패키지는 재귀하지 않는다. */
async function fetchFlat(
  client: AdtClient,
  packageName: string,
  includeDescriptions: boolean,
): Promise<PackageItem[]> {
  const response = await fetchNodeStructure(client, {
    parentType: 'DEVC/K',
    parentName: packageName,
    withShortDescriptions: includeDescriptions,
  });
  const { nodes, objectTypes } = parseNodeStructure(response.body);

  // 첫 응답이 주는 마디는 하위 패키지다.
  const items = toItems(nodes);

  for (const typeInfo of objectTypes) {
    // 하위 패키지는 첫 응답에 이미 있으므로 DEVC/K 종류는 다시 묻지 않는다.
    if (isPackageType(typeInfo.objectType)) continue;
    try {
      const typeResponse = await fetchNodeStructure(client, {
        parentType: 'DEVC/K',
        parentName: packageName,
        nodeId: typeInfo.nodeId,
        withShortDescriptions: includeDescriptions,
      });
      items.push(...toItems(parseNodeStructure(typeResponse.body).nodes));
    } catch {
      // 종류 하나를 못 받아도 나머지 종류는 계속 본다(벤더와 같다).
    }
  }

  return items;
}

/**
 * 패키지 내용을 평면 목록으로 받는다.
 *
 * `includeSubpackages`면 하위 패키지를 깊이 상한까지 재귀한다. 방문 집합은
 * **호출 하나마다 새로 만든다** — 패키지 여러 벌을 훑을 때 서로 이미 본 것을
 * 건너뛰지 않는 구 동작을 그대로 둔다(구는 패키지마다 이 함수를 따로 부른다).
 */
export async function getPackageContentsList(
  client: AdtClient,
  packageName: string,
  options: PackageContentsOptions = {},
): Promise<PackageItem[]> {
  const includeSubpackages = options.includeSubpackages === true;
  const maxDepth = options.maxDepth ?? 5;
  const includeDescriptions = options.includeDescriptions !== false;
  const root = packageName.toUpperCase();

  const items = await fetchFlat(client, root, includeDescriptions);
  if (!includeSubpackages) return items;

  const subpackages = items.filter((item) => item.isPackage);
  const visited = new Set<string>([root]);

  const walk = async (name: string, depth: number): Promise<PackageItem[]> => {
    if (depth >= maxDepth || visited.has(name)) return [];
    visited.add(name);
    const subItems = await fetchFlat(client, name, includeDescriptions);
    const nested: PackageItem[] = [];
    for (const child of subItems.filter((item) => item.isPackage && !visited.has(item.name))) {
      nested.push(...(await walk(child.name, depth + 1)));
    }
    return [...subItems, ...nested];
  };

  for (const subpackage of subpackages) {
    items.push(...(await walk(subpackage.name, 1)));
  }
  return items;
}
