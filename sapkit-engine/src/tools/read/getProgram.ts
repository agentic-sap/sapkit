/**
 * GetProgram — 프로그램 소스 한 벌.
 *
 * `available_in`이 `['onprem','legacy']`인 것은 구 선언 그대로다 — cloud 축에서
 * 이 도구는 목록에 뜨지 않는다. 응답 필드 이름이 `program_data`인 것도 구 계약
 * 이며, "소스"가 아니라 "정의"를 담는다고 읽히던 옛 이름을 유지한다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { adtStatusOf, objectSourcePath, readSourceText, statusTextFor } from './internal/adt';
import { buildContextPrologue } from './internal/context';
import { messageOf, ok, returnError } from './internal/results';

export const getProgram = defineTool(
  {
    name: 'GetProgram',
    description:
      'Retrieve ABAP program definition. Supports reading active or inactive version. Optionally append a compressed dependency context (public signatures of referenced classes/interfaces) via with_context.',
    inputSchema: {
      program_name: z.string().describe('Program name (e.g., Z_MY_PROGRAM).'),
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
          'If true, append a "dependency_context" field with compressed public contracts (signatures) of every class/interface referenced by this program, so callers get surrounding context in one call. Function modules referenced via CALL FUNCTION are noted but not resolved. Default false.',
        ),
      context_max_deps: z
        .number()
        .default(10)
        .describe(
          'Max number of dependencies to resolve when with_context is true (1-15). Default 10.',
        ),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    try {
      const {
        program_name,
        version = 'active',
        with_context = false,
        context_max_deps = 10,
      } = args;

      if (!program_name) {
        return returnError(new Error('program_name is required'));
      }

      const client = await context.getConnection();
      const programName = program_name.toUpperCase();

      context.logger.info(`Reading program ${programName}, version: ${version}`);

      try {
        const response = await readSourceText(
          client,
          objectSourcePath('program', programName),
          version,
        );
        const programData = response.body;

        const payload: Record<string, unknown> = {
          success: true,
          program_name: programName,
          version,
          program_data: programData,
          status: response.status,
          status_text: statusTextFor(response.status),
        };

        if (with_context) {
          payload.dependency_context = await buildContextPrologue(
            client,
            programData,
            context_max_deps,
          );
        }

        context.logger.info(`GetProgram completed successfully: ${programName}`);
        return ok(JSON.stringify(payload, null, 2));
      } catch (error) {
        context.logger.error(`Error reading program ${programName}: ${messageOf(error)}`);

        const status = adtStatusOf(error);
        const message =
          status === 404
            ? `Program ${programName} not found.`
            : status === 423
              ? `Program ${programName} is locked by another user.`
              : `Failed to read program: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
