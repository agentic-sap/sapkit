/**
 * `GetObjectNodeFromCache` — 프로세스 전역 캐시에서 마디 하나를 꺼낸다.
 *
 * 구 핸들러: `engine/src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`.
 *
 * ## ⚠ 이 도구는 **언제나 「캐시에 없다」로 답한다.** 그것이 정직한 구현이다
 *
 * 구에서 이 도구가 읽는 것은 `engine/src/lib/getObjectsListCache.ts`의 모듈
 * 수준 싱글턴이고, **다섯 도구가 그 자리에 마지막 결과를 얹었다** —
 * `SearchObject`(`handleSearchObject.ts:139`) · `GetTypeInfo`(`:232`·`:251`) ·
 * `GetWhereUsed`(`:111`) · `GetObjectsByType`(`:175`·`:191`·`:254`) ·
 * `GetObjectsList`(`:210`). 신 엔진은 그 캐시를 승계하지 않았고(장부 D33),
 * 얹던 넷은 이 과제의 무접촉 구역이다.
 *
 * 그래서 고를 수 있는 길은 셋이었다.
 *
 *  ⑴ **캐시를 새로 만들고 `GetObjectsList` 하나만 채운다** — 다섯 중 하나만 채운
 *     캐시는 "GetObjectsList를 먼저 부른 사람에게만 동작하는 도구"를 만든다.
 *     D33이 그것을 미리 물리쳤다: **절반 찬 캐시는 빈 캐시보다 나쁘다.**
 *  ⑵ **캐시를 다섯 도구에 모두 붙인다** — 무접촉 파일 넷을 고치는 일이다.
 *  ⑶ **캐시를 만들지 않고, 캐시가 빈 상태의 구 동작을 그대로 옮긴다** ← 골랐다.
 *
 * ⑶이 추측이 아닌 이유: 구도 **프로세스가 갓 뜬 상태에서는 똑같이 답한다.**
 * `getCache()`가 `null`이면 `node`가 `null`로 남고(`:41-51`), 곧바로
 * `isError: true` + `Node not found in cache`로 접힌다(`:52-59`). 이 판의 응답은
 * 그 갈래와 **글자까지 같다.** 갈라지는 것은 "앞선 도구가 캐시를 채운 뒤"뿐이고,
 * 그 조건은 신 엔진에 존재하지 않는다 — 장부 D130에 등재했다.
 *
 * **`OBJECT_URI` 확장 갈래(`:61-98`)는 옮기지 않았다.** 도달할 수 없는 코드를
 * 미리 써 두면 그것이 곧 추측이다. 캐시를 여는 마일스톤이 그 갈래의 자리다.
 *
 * ## SAP에 붙지 않는다 (구도 이 갈래에서는 붙지 않는다)
 *
 * 구는 캐시 적중 뒤 `OBJECT_URI`가 있을 때만 ADT를 부른다. 적중이 없으면 요청은
 * 한 발도 나가지 않는다. 그래서 이 도구는 `context.getConnection()`을 **부르지
 * 않는다** — 부르지 않는 것이 구와 같은 동작이다.
 *
 * ## 인자 검증 문구
 *
 * 셋 중 하나라도 비면 `object_type, object_name, tech_name required`
 * (`:33-40`). `return_error`를 쓰지 않으므로 **`Error: ` 접두사가 없다.**
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { failure } from './internal/results';

/** 구 `:37` 글자 그대로. */
export const MISSING_ARGS_MESSAGE = 'object_type, object_name, tech_name required';
/** 구 `:58` 글자 그대로. */
export const NOT_IN_CACHE_MESSAGE = 'Node not found in cache';

export const getObjectNodeFromCache = defineTool(
  {
    name: 'GetObjectNodeFromCache',
    description:
      '[read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.',
    inputSchema: {
      object_type: z.string().describe('[read-only] Object type'),
      object_name: z.string().describe('[read-only] Object name'),
      tech_name: z.string().describe('[read-only] Technical name'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/system/readonly/`이고 채록본의 네 조건 전부에 뜬다.
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['object_name', 'tech_name'],
  },
  async (context, args) => {
    const { object_type, object_name, tech_name } = args;
    if (!object_type || !object_name || !tech_name) {
      return failure(MISSING_ARGS_MESSAGE);
    }

    context.logger.debug(
      `Node ${object_type}/${object_name}/${tech_name} not found in cache`,
    );
    return failure(NOT_IN_CACHE_MESSAGE);
  },
);
