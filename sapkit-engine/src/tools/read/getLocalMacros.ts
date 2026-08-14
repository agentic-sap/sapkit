/**
 * GetLocalMacros — 클래스의 `macros` 인클루드를 읽는다.
 *
 * 매크로는 **구형 ABAP 릴리스에만 있는 개념**이라 신형 시스템에서는 이
 * 자원 자체가 없을 수 있다. 그런데도 구 핸들러는 406 전용 가지를 짓지
 * 않았다(`engine/src/handlers/class/high/handleGetLocalMacros.ts:98-104` —
 * 404·423 둘뿐이다). 형제 셋(`GetLocalDefinitions`·`GetLocalTypes`·
 * `GetLocalTestClass`)과 달라 보이지만 그것이 실측이고, 맞춰 손보면 표면이
 * 갈라진다.
 *
 * 와이어와 `version` 값 변환의 근거는 `internal/classIncludes.ts` 머리주석.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { classIncludeFailure, readClassInclude } from './internal/classIncludes';
import { ok, returnError } from './internal/results';

const TEXTS = {
  what: 'local macros',
  subject: 'Local macros',
  unsupported: 'none',
} as const;

export const getLocalMacros = defineTool(
  {
    name: 'GetLocalMacros',
    description:
      'Retrieve local macros source code from a class (macros include). Supports reading active or inactive version. Note: Macros are supported in older ABAP versions but not in newer ones.',
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

      context.logger.info(`Reading local macros for ${className}, version: ${version}`);

      try {
        const response = await readClassInclude(client, className, 'macros', version);
        if (response === undefined) {
          throw new Error(`${TEXTS.subject} for ${className} not found`);
        }

        return ok(
          JSON.stringify(
            {
              success: true,
              class_name: className,
              version,
              macros_code: response.body,
              status: response.status,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading local macros for ${className}: ${
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
