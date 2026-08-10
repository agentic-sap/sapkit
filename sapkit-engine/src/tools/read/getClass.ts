/**
 * GetClass — 클래스 소스 한 벌.
 *
 * `with_context`를 켜면 이 클래스가 참조하는 클래스·인터페이스의 **공개 계약만**
 * 접어 `dependency_context`로 덧붙인다 — 한 번의 왕복으로 주변 서명까지 받게
 * 하려는 것이다. 문맥 조립은 결코 본 읽기를 깨뜨리지 않는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server';
import { adtStatusOf, objectSourcePath, readSourceText, statusTextFor } from './internal/adt';
import { buildContextPrologue } from './internal/context';
import { messageOf, ok, returnError } from './internal/results';

export const getClass = defineTool(
  {
    name: 'GetClass',
    description:
      'Retrieve ABAP class source code. Supports reading active or inactive version. Optionally append a compressed dependency context (public signatures of referenced classes/interfaces) via with_context.',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_MY_CLASS).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
      with_context: z
        .boolean()
        .optional()
        .describe(
          'If true, append a "dependency_context" field with compressed public contracts (signatures) of every class/interface referenced by this class, so callers get surrounding context in one call. Function modules referenced via CALL FUNCTION are noted but not resolved. Default false.',
        ),
      context_max_deps: z
        .number()
        .default(10)
        .describe(
          'Max number of dependencies to resolve when with_context is true (1-15). Default 10.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const {
        class_name,
        version = 'active',
        with_context = false,
        context_max_deps = 10,
      } = args;

      if (!class_name) {
        return returnError(new Error('class_name is required'));
      }

      const client = await context.getConnection();
      const className = class_name.toUpperCase();

      context.logger.info(`Reading class ${className}, version: ${version}`);

      try {
        const response = await readSourceText(
          client,
          objectSourcePath('class', className),
          version,
        );
        const sourceCode = response.body;

        const payload: Record<string, unknown> = {
          success: true,
          class_name: className,
          version,
          source_code: sourceCode,
          status: response.status,
          status_text: statusTextFor(response.status),
        };

        if (with_context) {
          payload.dependency_context = await buildContextPrologue(
            client,
            sourceCode,
            context_max_deps,
          );
        }

        context.logger.info(`GetClass completed successfully: ${className}`);
        return ok(JSON.stringify(payload, null, 2));
      } catch (error) {
        context.logger.error(`Error reading class ${className}: ${messageOf(error)}`);

        const status = adtStatusOf(error);
        const message =
          status === 404
            ? `Class ${className} not found.`
            : status === 423
              ? `Class ${className} is locked by another user.`
              : `Failed to read class: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
