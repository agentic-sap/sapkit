/**
 * GetLocalDefinitions — 클래스의 `definitions` 인클루드를 읽는다.
 *
 * 이 인클루드가 담는 것은 **private 섹션의 컴포넌트가 쓰는 타입 선언**이다.
 * 클래스 소스 한 벌에는 나타나지 않으므로 `GetClass`로는 볼 수 없다.
 *
 * 와이어와 `version` 값 변환(`inactive` → `workingArea`)의 근거는
 * `internal/classIncludes.ts` 머리주석에 파일·줄로 적어 두었다. 구 핸들러는
 * `engine/src/handlers/class/high/handleGetLocalDefinitions.ts:45-131`.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { classIncludeFailure, readClassInclude } from './internal/classIncludes';
import { ok, returnError } from './internal/results';

const TEXTS = {
  what: 'local definitions',
  subject: 'Local definitions',
  unsupported: 'detailed',
} as const;

export const getLocalDefinitions = defineTool(
  {
    name: 'GetLocalDefinitions',
    description:
      'Retrieve local definitions source code from a class (definitions include). Supports reading active or inactive version.',
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

      context.logger.info(`Reading local definitions for ${className}, version: ${version}`);

      try {
        const response = await readClassInclude(client, className, 'definitions', version);
        // 벤더 read()가 404를 undefined로 접는다 — "없음"은 아래 문구로 실린다.
        if (response === undefined) {
          throw new Error(`${TEXTS.subject} for ${className} not found`);
        }

        return ok(
          JSON.stringify(
            {
              success: true,
              class_name: className,
              version,
              definitions_code: response.body,
              status: response.status,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading local definitions for ${className}: ${
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
