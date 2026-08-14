/**
 * GetFunctionGroup — 함수그룹 정의 한 벌.
 *
 * ## 실측: `version`은 와이어에 나가지 않는다
 *
 * 구 위임 계층 `AdtFunctionGroup.read(config, _version, options)`는 두 번째 인자를
 * **이름부터 `_version`으로 버린다** — 실제 요청은 언제나
 * `GET /sap/bc/adt/functions/groups/{FG}` 하나이고, 인자는 응답에 되비칠 뿐이다
 * (`@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/AdtFunctionGroup.js:214-232`
 * → `core/functionGroup/read.js:14-24`). 함수그룹은 소스를 갖지 않는 컨테이너라
 * 활성/비활성 축이 없다는 것이 같은 파일 머리주석의 설명이다. 선언에 남아 있는
 * `version`은 **표면 계약이므로 지운다는 선택지가 없다** — 채록본과 글자 일치여야
 * 한다.
 *
 * ## 실측: 404 문구가 다른 실패들과 모양이 다르다
 *
 * 구는 404를 위임 계층에서 `undefined`로 접고(같은 파일 `:225-231`), 핸들러가
 * 그것을 `new Error('FunctionGroup X not found')`로 바꿔 **자기 catch로 던진다**
 * (`engine/src/handlers/function_group/high/handleGetFunctionGroup.ts:79-121`).
 * 그 예외에는 `error.response`가 없으므로 404 분기(`... not found.`)를 타지 못하고
 * 일반 문구 `Failed to read function group: ...`에 감싸여 나간다. **마침표가 없는
 * 쪽**이 그 경로를 지났다는 증거다. 423은 위임 계층이 그대로 던지므로 마침표가
 * 붙은 전용 문구로 나간다.
 *
 * ## `ReadFunctionGroup`과 무엇이 다른가
 *
 * 구 트리의 자리가 요약이다 — 이쪽은 `handlers/function_group/high/`, 저쪽은
 * `handlers/function_group/readonly/`. 노출 집합(high ↔ readonly) · 요청 수
 * (1회 ↔ 2회) · 응답 키(`function_group_data`+`status` ↔ `source_code`+`metadata`) ·
 * 실패 처리(오류 ↔ null을 담은 성공)가 갈린다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { adtStatusOf, functionGroupPath, statusTextFor } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

/**
 * 함수그룹 읽기가 싣는 Accept — 구 `read.js:22`의 기본값(와일드카드)이다.
 * 문자열로만 적는다: 이 값을 블록 주석 안에 그대로 쓰면 주석이 거기서 닫힌다.
 */
export const ACCEPT_FUNCTION_GROUP_READ = '*/*';

export const getFunctionGroup = defineTool(
  {
    name: 'GetFunctionGroup',
    description:
      'Retrieve ABAP function group definition. Supports reading active or inactive version.',
    inputSchema: {
      function_group_name: z.string().describe('FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
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

      context.logger.info(
        `Reading function group ${functionGroupName}, version: ${version}`,
      );

      try {
        const response = await client.request({
          method: 'GET',
          path: functionGroupPath(functionGroupName),
          accept: ACCEPT_FUNCTION_GROUP_READ,
          timeout: 'default',
        });

        context.logger.info(
          `GetFunctionGroup completed successfully: ${functionGroupName}`,
        );

        return ok(
          JSON.stringify(
            {
              success: true,
              function_group_name: functionGroupName,
              version,
              function_group_data: response.body,
              status: response.status,
              status_text: statusTextFor(response.status),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading function group ${functionGroupName}: ${messageOf(error)}`,
        );

        const status = adtStatusOf(error);
        // 404만 문구 모양이 다른 이유는 위 머리주석 참조 — 구의 예외 경로가
        // 다르다. 마침표를 붙여 "정리"하면 그 자국이 지워진다.
        const message =
          status === 404
            ? `Failed to read function group: FunctionGroup ${functionGroupName} not found`
            : status === 423
              ? `FunctionGroup ${functionGroupName} is locked by another user.`
              : `Failed to read function group: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
