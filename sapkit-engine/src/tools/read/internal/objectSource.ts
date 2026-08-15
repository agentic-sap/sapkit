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

import type { AdtClient } from '../../../adt';
import {
  functionGroupPath,
  includeSourcePath,
  objectSourcePath,
  readSourceText,
} from './adt';
import { messageOf } from './results';

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
