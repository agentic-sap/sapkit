/**
 * GetLocalTypes — 클래스의 로컬 타입(=`implementations` 인클루드)을 읽는다.
 *
 * **이름과 자원이 어긋난다.** 도구 이름은 "local types"인데 ADT가 내주는
 * 자원은 `includes/implementations`다. 로컬 헬퍼 클래스·인터페이스 선언·타입
 * 선언이 전부 그 한 인클루드에 들어 있기 때문이고, 이름만 보고
 * `includes/types` 같은 경로를 지어내면 조용히 빈손이 된다. 근거는
 * `AdtLocalTypes.read()`가 `getClassImplementationsInclude`를 부르는 자리다
 * (`…/dist/core/class/AdtLocalTypes.js:130-150` → `…/dist/core/class/read.js:134-146`).
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleGetLocalTypes.ts:45-127`.
 * 와이어와 `version` 값 변환의 근거는 `internal/classIncludes.ts` 머리주석.
 *
 * 쓰기 짝은 `src/tools/write/updateLocalTypes.ts`이고, 그쪽에는 **의도적 차이
 * D2**가 걸려 있다(구는 활성화를 요청하지 않고도 `activated:true`를 답했다).
 * 읽기인 이 도구는 그 차이와 무관하다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { classIncludeFailure, readClassInclude } from './internal/classIncludes';
import { ok, returnError } from './internal/results';

const TEXTS = {
  what: 'local types',
  subject: 'Local types',
  unsupported: 'detailed',
} as const;

export const getLocalTypes = defineTool(
  {
    name: 'GetLocalTypes',
    description:
      'Retrieve local types source code from a class (implementations include). Supports reading active or inactive version.',
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

      context.logger.info(`Reading local types for ${className}, version: ${version}`);

      try {
        const response = await readClassInclude(client, className, 'implementations', version);
        if (response === undefined) {
          throw new Error(`${TEXTS.subject} for ${className} not found`);
        }

        return ok(
          JSON.stringify(
            {
              success: true,
              class_name: className,
              version,
              local_types_code: response.body,
              status: response.status,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading local types for ${className}: ${
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
