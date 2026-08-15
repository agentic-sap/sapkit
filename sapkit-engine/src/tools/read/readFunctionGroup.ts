/**
 * ReadFunctionGroup — 함수그룹의 소스와 메타데이터를 한 벌로 읽는다.
 *
 * ## 실측한 두 가지 (겉 선언만 보면 절대 안 보인다)
 *
 *  1. **`version`은 와이어에 나가지 않는다.** 구 위임 계층
 *     `AdtFunctionGroup.read(config, _version, options)`는 두 번째 인자를
 *     **이름부터 `_version`으로 버린다** — 실제 요청은 언제나
 *     `GET /sap/bc/adt/functions/groups/{FG}` 하나다
 *     (`@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/AdtFunctionGroup.js:214-232`
 *     → `core/functionGroup/read.js:14-24`). 인자는 응답에 그대로 되비칠 뿐이다.
 *     함수그룹은 소스를 갖지 않는 컨테이너라서 활성/비활성 축이 없다는 것이 같은
 *     파일 머리주석의 설명이다.
 *  2. **같은 요청이 두 번 나간다.** 구 핸들러는 `read()`로 `source_code`를,
 *     `readMetadata()`로 `metadata`를 채우는데, 함수그룹의 `readMetadata`는
 *     **자기 `read()`를 다시 부른다**(같은 파일 `:237-277` — "For objects without
 *     source code, read() already returns metadata"). 그래서 두 값은 같은
 *     응답에서 나오고 URL·헤더가 완전히 같은 GET이 연달아 두 번 나간다.
 *
 * ## `GetFunctionGroup`과 무엇이 다른가
 *
 * 구 트리의 자리가 요약이다 — 이쪽은 `handlers/function_group/readonly/`,
 * 저쪽은 `handlers/function_group/high/`. 셋이 갈린다.
 *
 *  - **노출 집합** — `readonly`. 읽기 전용 표면에는 이 도구만 뜬다.
 *  - **요청 수** — 이쪽 2회(소스·메타데이터), 저쪽 1회.
 *  - **응답 키와 실패 처리** — 이쪽은 `source_code`+`metadata`이고 읽기가 실패해도
 *     그 자리가 `null`인 성공이다. 저쪽은 `function_group_data`+`status`+
 *     `status_text`이고 404·423을 오류 문구로 올린다.
 *
 * ## 와이어 근거 (전부 읽기 전용 참고)
 *
 *  - 구 핸들러 — `engine/src/handlers/function_group/readonly/handleReadFunctionGroup.ts:42-91`
 *  - 위임 — `engine/src/lib/clients.ts:15-32` →
 *    `AdtFunctionGroup.js:214-277` → `core/functionGroup/read.js:14-24`
 *    (Accept 기본값은 아무 형식이나 받겠다는 와일드카드다)
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { functionGroupPath } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

/**
 * 함수그룹 읽기가 싣는 Accept — 구 `read.js:22`의 기본값(와일드카드)이다.
 * 문자열로만 적는다: 이 값을 블록 주석 안에 그대로 쓰면 주석이 거기서 닫힌다.
 */
export const ACCEPT_FUNCTION_GROUP_READ = '*/*';

/** 구의 truthy 검사(`if (readResult?.readResult?.data)`) — 빈 본문은 없는 것이다. */
function textOrNull(body: string): string | null {
  return body ? body : null;
}

export const readFunctionGroup = defineTool(
  {
    name: 'ReadFunctionGroup',
    description:
      '[read-only] Read ABAP function group source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      function_group_name: z.string().describe('Function group name (e.g., Z_MY_FG).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['function_group_name'],
  },
  async (context, args) => {
    try {
      const { function_group_name, version = 'active' } = args;

      if (!function_group_name) {
        return returnError(new Error('function_group_name is required'));
      }

      const client = await context.getConnection();
      const functionGroupName = function_group_name.toUpperCase();
      const path = functionGroupPath(functionGroupName);

      const read = async (): Promise<string | null> => {
        const response = await client.request({
          method: 'GET',
          path,
          accept: ACCEPT_FUNCTION_GROUP_READ,
          timeout: 'default',
        });
        return textOrNull(response.body);
      };

      let sourceCode: string | null = null;
      try {
        sourceCode = await read();
      } catch (error) {
        context.logger.warn(
          `Could not read source for ${functionGroupName}: ${messageOf(error)}`,
        );
      }

      // 두 번째 왕복은 중복처럼 보이지만 구가 실제로 보내는 것이다 —
      // 위 머리주석 2번. 첫 응답을 재활용하면 요청 수가 달라진다.
      let metadata: string | null = null;
      try {
        metadata = await read();
      } catch (error) {
        context.logger.warn(
          `Could not read metadata for ${functionGroupName}: ${messageOf(error)}`,
        );
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            function_group_name: functionGroupName,
            version,
            source_code: sourceCode,
            metadata,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
