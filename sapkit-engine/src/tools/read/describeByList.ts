/**
 * DescribeByList — 오브젝트 여러 개를 `SearchObject`로 한 번에 훑는다.
 *
 * **자기 요청을 조립하지 않는다.** 구 핸들러
 * (`engine/src/handlers/system/readonly/handleDescribeByList.ts:64-69`)는 목록의
 * 원소마다 `handleSearchObject`를 부를 뿐이고, 그래서 와이어는 전적으로
 * `SearchObject`의 것이다. 신 엔진에서도 같은 자리를 지킨다 — 이미 지어 둔
 * `searchObject` 도구의 핸들러를 그대로 부른다. 검색 경로를 여기서 다시 짜면
 * 두 도구가 조용히 갈라진다.
 *
 * ## 원소 하나를 처리하는 순서 (구 `:64-138`)
 *
 * 1. `SearchObject(object_name = obj.name, object_type = obj.type)`
 * 2. 결과가 **비었거나 오류이면 타입을 빼고 한 번 더** 부른다(`:74-88`). 타입이
 *    틀렸을 때를 구제하려는 갈래다.
 * 3. 두 번째도 비었거나 오류이면 **그 오브젝트를 건너뛴다**(`:90-98`). 목록
 *    전체가 실패하지 않는다.
 * 4. 살아남은 결과의 `content[]`를 돌며 각 `text`를 JSON으로 풀고, `results`
 *    배열이 있으면 **펼쳐서 합치고** 없으면 통째로 담는다(`:108-123`).
 * 5. 오브젝트 하나당 `{ name, results }` 한 덩이를 **콘텐츠 블록 하나**로 싣는다.
 *
 * 그래서 이 도구의 응답은 **text 블록 여러 개**다 — 오브젝트 수만큼. 구도
 * 그랬고(`:141-144`), 신 엔진의 `ToolResult.content`도 배열이라 그대로 옮긴다.
 * 이 도구에는 콘텐츠 종류를 바꿀 일이 없다(구가 `type: 'text'`를 썼다).
 *
 * ## 구를 그대로 옮긴 자리 둘
 *
 * - **아무것도 못 찾아도 `isError: false`다**(`:140-144`의 주석이 그렇게 못 박는다).
 *   빈 `content: []`가 정상 답이다.
 * - `obj.name`이 없으면 `SearchObject`가 두 번 다 거절하므로 그 원소는 조용히
 *   건너뛰어진다. 발행 스키마가 `name`을 필수로 두지 않기 때문에(채록본의
 *   `items`에 `required`가 없다) 실제로 닿을 수 있는 갈래다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 인자 검증에서 `status`·`body`를 붙인 오류를 **던졌다**(`:45-59`). 신
 * 엔진에서 도구가 오류를 올리는 통로는 `isError`뿐이고, 서버 코어가 그것을
 * `InternalError`로 올린다(`src/server/core.ts:182`) — 구에서도 던진 오류를 SDK가
 * 같은 코드로 감쌌으므로 호출자가 보는 문구는 같다. 실어 두었던 `status`·`body`는
 * 어느 쪽에서도 호출자에게 전달되지 않았다.
 */

import * as z from 'zod';

import type { ToolResult, ToolTextContent } from '../../server/toolDefinition';
import { defineTool } from '../../server/toolDefinition';
import { failure } from './internal/results';
import { searchObject } from './searchObject';

/** 구가 「쓸 수 없는 답」으로 치던 조건 그대로(`handleDescribeByList.ts:76-84`). */
function isUnusable(result: ToolResult | null): boolean {
  if (result === null || result === undefined) return true;
  if (result.isError) return true;
  return Array.isArray(result.content) && result.content.length === 0;
}

/**
 * 콘텐츠 블록들에서 `results` 배열을 펼쳐 모은다(`:108-123`).
 *
 * `SearchObject`는 `{ results, rawXML }`을 JSON 문자열로 싣는다. 그중 `results`만
 * 펼치고, 모양이 다르면(파싱 실패 포함) **버리지 않고 통째로** 담는 것이 구의
 * 선택이다 — 알아보지 못한 답도 호출자가 보게 한다.
 */
function flattenResults(content: readonly ToolTextContent[]): unknown[] {
  const all: unknown[] = [];
  for (const item of content) {
    try {
      const parsed = JSON.parse(item.text) as { results?: unknown };
      if (Array.isArray(parsed?.results)) all.push(...parsed.results);
      else all.push(parsed);
    } catch {
      // JSON이 아니면 블록 자체를 담는다. 구가 `item`을 담던 자리다.
      all.push(item);
    }
  }
  return all;
}

export const describeByList = defineTool(
  {
    name: 'DescribeByList',
    description:
      '[read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.',
    inputSchema: {
      objects: z.array(
        z.object({
          name: z
            .string()
            .optional()
            .describe('[read-only] Object name (required, must be valid ABAP object name or mask)'),
          type: z
            .string()
            .optional()
            .describe('[read-only] Optional type (e.g. PROG/P, CLAS/OC, etc.)'),
        }),
      ),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    // `SearchObject`와 같은 이유로 선언하지 않는다 — 원소의 `name`은 대상이
    // 아니라 검색 마스크이고, 응답에 원본 소스가 실리지 않는다.
  },
  async (context, args) => {
    const objects = args.objects;
    if (!Array.isArray(objects) || objects.length === 0) {
      return failure(
        'Missing or invalid parameters: objects (array) is required and must not be empty.',
      );
    }

    context.logger.info(`Describing ${objects.length} objects via search`);

    const content: ToolTextContent[] = [];
    for (const object of objects) {
      const name = object?.name;

      // ① 타입까지 주고 찾는다.
      let result: ToolResult = await searchObject.handler(context, {
        object_name: name,
        object_type: object?.type,
      });

      // ② 비었거나 오류면 타입을 빼고 한 번 더.
      if (isUnusable(result)) {
        result = await searchObject.handler(context, { object_name: name });
        // ③ 그래도 안 되면 이 오브젝트는 건너뛴다.
        if (isUnusable(result)) continue;
      }

      // 여기 닿은 결과의 content는 비어 있지 않다(②가 걸러 냈다).
      const results = flattenResults(result.content);
      content.push({ type: 'text', text: JSON.stringify({ name, results }) });
    }

    // 아무것도 못 찾아도 오류가 아니다 — 구가 주석으로 못 박은 자리다.
    return { isError: false, content };
  },
);
