/**
 * 오브젝트 한 벌의 소스를 가져오는 분배기 — `Grep*` 두 도구가 함께 쓴다.
 *
 * 구 엔진에서도 이 분배기는 두 도구의 공용이었다
 * (`engine/src/lib/objectSourceFetch.ts` — `handleGrepObjects.ts`와
 * `handleGrepPackages.ts`가 같은 함수를 부른다). 여기 한 자리에 두는 이유가
 * 그것이다: 두 도구가 각자 베껴 쓰면 "이름만 닮은 두 도구"가 소스를 읽는
 * 방식에서 조용히 갈라진다.
 *
 * **실패를 던지지 않는다.** 못 읽은 오브젝트는 `skipReason`을 달고 돌아오고,
 * 호출자는 나머지를 계속 훑는다 — 한 벌의 실패가 나머지 마흔아홉 벌을 못 보게
 * 하면 안 된다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import {
  functionGroupPath,
  includeSourcePath,
  objectSourcePath,
  readSourceText,
} from './adt';
import { fetchNodeStructure } from './nodeStructure';
import { messageOf } from './results';

// ── 함수그룹 전개 (D151) ─────────────────────────────────────────────────────
//
// `fetchObjectSource`의 FUGR 갈래는 함수그룹 **메타데이터**(`/functions/groups/{fg}`)를
// 읽는다 — 거기에는 소스가 없다. 그래서 `GrepObjects(FUGR)`가 실재하는 코드에도
// `total_matches: 0 · skipped: []`로 답했다(2026-07-28·30·31 실측 — `sapkit-feedback.md`).
// 함수그룹의 소스는 그 아래 함수모듈(`FUGR/FF`)과 인클루드(`FUGR/I`)에 있다.
//
// 전개는 리포지터리 노드 구조로 한다 — `GetIncludesList`가 PROG/I를 찾는 것과 같은
// 왕복이다(뿌리 → 묶음 마디의 NODE_ID → 그 마디의 잎). 잎의 `OBJECT_URI`를 ADT가
// 준 그대로 쓰고 `/source/main`만 붙인다 — 주소를 이름에서 지어내지 않는다(D3와
// 같은 원칙: 주소 없는 마디는 실재하는 오브젝트가 아니다). 두 번째 요청의 부모는
// **뿌리 오브젝트 그대로 + node_id**다(`GetIncludesList`의 관례 · 벤더
// `fetchNodeStructure`의 인자 모양). `GetObjectInfo`는 묶음 마디를 부모로 넘기는
// 다른 관례를 쓰는데, 둘 다 실 SAP 채록이 없어 어느 쪽이 옳은지 여기서 단정하지
// 않는다 — 실기 미검증이며, 첫 실접속 세션의 확인 대상이다.

export interface FunctionGroupMember {
  readonly type: 'FUGR/FF' | 'FUGR/I';
  readonly name: string;
  /** ADT가 노드 구조에 실어 준 오브젝트 주소. 소스는 `{uri}/source/main`. */
  readonly uri: string;
}

const MEMBER_TYPES: ReadonlySet<string> = new Set(['FUGR/FF', 'FUGR/I']);

interface RepositoryNode {
  readonly type: string;
  readonly name: string;
  readonly nodeId: string;
  readonly uri: string;
}

/** 노드 구조 응답의 마디들 — `GetIncludesList`와 같은 블록 단위 읽기. */
function parseRepositoryNodes(xml: string): RepositoryNode[] {
  const nodes: RepositoryNode[] = [];
  for (const block of xml.match(/<SEU_ADT_REPOSITORY_OBJ_NODE>(.*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/gs) ?? []) {
    const text = (tag: string): string =>
      (new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block)?.[1] ?? '').trim();
    nodes.push({
      type: text('OBJECT_TYPE'),
      name: text('OBJECT_NAME'),
      nodeId: text('NODE_ID'),
      uri: text('OBJECT_URI'),
    });
  }
  return nodes;
}

/**
 * 함수그룹을 그 안의 함수모듈·인클루드로 전개한다. **던진다** — 호출자가 그 실패를
 * `skipped`의 이유로 옮긴다(조용한 0이 아니라).
 */
export async function expandFunctionGroup(
  client: AdtClient,
  groupName: string,
): Promise<FunctionGroupMember[]> {
  const members: FunctionGroupMember[] = [];
  const seen = new Set<string>();
  const collect = (nodes: readonly RepositoryNode[]): void => {
    for (const node of nodes) {
      if (!MEMBER_TYPES.has(node.type) || node.name === '' || node.uri === '') continue;
      if (seen.has(node.uri)) continue;
      seen.add(node.uri);
      members.push({
        type: node.type as FunctionGroupMember['type'],
        name: decodeURIComponent(node.name),
        uri: node.uri,
      });
    }
  };

  const root = parseRepositoryNodes(
    (await fetchNodeStructure(client, { parentType: 'FUGR/F', parentName: groupName })).body,
  );
  collect(root);
  for (const node of root) {
    // 묶음 마디 — 주소가 없고 NODE_ID가 있으며 FUGR 계열이다(`GetObjectInfo`의 isGroupNode).
    if (node.uri !== '' || node.nodeId === '' || !node.type.startsWith('FUGR/')) continue;
    const children = parseRepositoryNodes(
      (
        await fetchNodeStructure(client, {
          parentType: 'FUGR/F',
          parentName: groupName,
          nodeId: node.nodeId,
        })
      ).body,
    );
    collect(children);
  }
  return members;
}

/** 전개된 구성원 하나의 소스 — 활성 판(`GrepObjects`는 활성 판을 읽는다 — 2026-08-19 실측). */
export function fetchFunctionGroupMemberSource(
  client: AdtClient,
  member: FunctionGroupMember,
): Promise<AdtResponse> {
  return readSourceText(client, `${member.uri}/source/main`, 'active');
}

export type SourceObjectCode = 'CLAS' | 'PROG' | 'INTF' | 'INCL' | 'FUGR' | 'FUNC';

export interface FetchSourceResult {
  readonly source: string | null;
  /** 못 읽은 이유. `source: null`과 짝으로 온다. */
  readonly skipReason?: string;
}

/**
 * 호출자가 준 타입 문자열을 이 분배기가 아는 코드로 분류한다.
 * 독립 인클루드의 ADT 타입은 `PROG/I`이므로 일반 `PROG/`보다 **먼저** 본다.
 * (구 `objectSourceFetch.ts:37-49`와 같은 순서다.)
 */
export function classifySourceType(rawType: string): SourceObjectCode | undefined {
  const type = (rawType ?? '').trim().toUpperCase();
  if (!type) return undefined;
  if (type === 'INCL' || type.startsWith('PROG/I')) return 'INCL';
  if (type === 'CLAS' || type.startsWith('CLAS/')) return 'CLAS';
  if (type === 'PROG' || type.startsWith('PROG/')) return 'PROG';
  if (type === 'INTF' || type.startsWith('INTF/')) return 'INTF';
  if (type === 'FUNC' || type === 'FUGR/FF') return 'FUNC';
  if (type === 'FUGR' || type.startsWith('FUGR/')) return 'FUGR';
  return undefined;
}

/** 오브젝트 하나의 소스. 실패는 던지지 않고 `skipReason`으로 돌아온다. */
export async function fetchObjectSource(
  client: AdtClient,
  toolName: string,
  objectType: string,
  objectName: string,
  warn: (message: string) => void,
): Promise<FetchSourceResult> {
  const code = classifySourceType(objectType);
  const name = (objectName ?? '').trim().toUpperCase();

  if (!name) return { source: null, skipReason: 'object_name is required' };
  if (!code) {
    return {
      source: null,
      skipReason: `Unsupported object_type "${objectType}" for source search (supported: CLAS, PROG, INTF, INCL, FUGR)`,
    };
  }
  if (code === 'FUNC') {
    return {
      source: null,
      skipReason:
        'Function module source requires both function_module_name and function_group_name; not resolvable from object_name alone. Use object_type "FUGR" with the function group name to search the whole group instead.',
    };
  }

  try {
    if (code === 'INCL') {
      const response = await client.request({
        method: 'GET',
        path: includeSourcePath(name),
        timeout: 'default',
      });
      return { source: response.body };
    }
    if (code === 'FUGR') {
      const response = await client.request({
        method: 'GET',
        path: functionGroupPath(name),
        accept: '*/*',
        timeout: 'default',
      });
      return { source: response.body };
    }
    const kind = code === 'CLAS' ? 'class' : code === 'PROG' ? 'program' : 'interface';
    const response = await readSourceText(client, objectSourcePath(kind, name), 'active');
    return { source: response.body };
  } catch (error) {
    warn(`${toolName}: could not fetch source for ${objectType} ${name}: ${messageOf(error)}`);
    return { source: null, skipReason: `Failed to fetch source: ${messageOf(error)}` };
  }
}
