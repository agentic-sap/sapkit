/**
 * GetLocalTestClass — 클래스의 `testclasses` 인클루드를 읽는다.
 *
 * ABAP Unit의 로컬 테스트 클래스가 사는 자리다. 클래스 소스 한 벌에는 없으므로
 * `GetClass`로는 볼 수 없다.
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleGetLocalTestClass.ts:47-122`.
 * 형제 셋과 다른 자리 둘:
 *  - 응답에 **`status_text`가 하나 더** 실린다(`:95` — 구는 axios가 준
 *    `statusText`를 그대로 얹었다).
 *  - 406 문구가 **한 줄로 끝난다**(`:113-115`). `GetLocalDefinitions`·
 *    `GetLocalTypes`는 URL과 응답 조각까지 붙인다.
 *
 * 와이어와 `version` 값 변환의 근거는 `internal/classIncludes.ts` 머리주석.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 신 접속 계층의 `AdtResponse`는 HTTP 사유 문구를 싣지 않으므로 `status_text`는
 * 표준 상태 코드 표에서 되살린다(`internal/adt.ts`의 `statusTextFor`) — 200이면
 * `OK`로 같다. 지어내지 않고, 모르는 코드면 빈 문자열이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { statusTextFor } from './internal/adt';
import { classIncludeFailure, readClassInclude } from './internal/classIncludes';
import { ok, returnError } from './internal/results';

const TEXTS = {
  what: 'local test class',
  subject: 'Local test class',
  unsupported: 'plain',
} as const;

export const getLocalTestClass = defineTool(
  {
    name: 'GetLocalTestClass',
    description:
      'Retrieve local test class source code from a class. Supports reading active or inactive version.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
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
    targetNames: ['class_name'],
  },
  async (context, args) => {
    try {
      const { class_name, version = 'active' } = args;
      if (!class_name) return returnError(new Error('class_name is required'));

      const client = await context.getConnection();
      const className = class_name.toUpperCase();

      context.logger.info(`Reading local test class for ${className}, version: ${version}`);

      try {
        const response = await readClassInclude(client, className, 'testclasses', version);
        if (response === undefined) {
          throw new Error(`${TEXTS.subject} for ${className} not found`);
        }

        return ok(
          JSON.stringify(
            {
              success: true,
              class_name: className,
              version,
              test_class_code: response.body,
              status: response.status,
              status_text: statusTextFor(response.status),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading local test class for ${className}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return returnError(new Error(classIncludeFailure(error, className, TEXTS)));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
