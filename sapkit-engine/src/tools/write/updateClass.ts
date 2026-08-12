/**
 * UpdateClass — 기존 클래스의 소스를 갈아 끼운다.
 *
 * 시퀀스는 UpdateProgram과 같다: 잠금 → 쓰기 전 구문검사 → PUT → 해제 →
 * 사후검사 → (활성화). 구 핸들러는
 * `engine/src/handlers/class/high/handleUpdateClass.ts`.
 *
 * **활성화 판정이 이 도구의 급소다.** 구 핸들러는 활성화 요청이 200으로
 * 돌아오면 그대로 `success: true`를 돌려줬는데, SAP은 활성화 실패도 200으로
 * 답하며 본문에 `<chkl:msg type="E">`를 담는다. 그래서 깨진 클래스가
 * "활성화됨"으로 보고됐다(이 레포의 CLAS 거짓 성공 실증). 여기서는 본문을 읽고
 * 실패로 되돌린다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  CT_ACTIVATION,
  type CheckMessage,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  checkProposed,
  checkStored,
  classUri,
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
  putSource,
} from './shared';

export const updateClass = defineTool(
  {
    name: 'UpdateClass',
    description:
      'Update source code of an existing ABAP class. Locks, checks, updates, unlocks, and optionally activates.',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_TEST_CLASS_001).'),
      source_code: z.string().describe('Complete ABAP class source code.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      activate: z.boolean().describe('Activate after update. Default: false.').optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.class_name || !args.source_code) {
      return errorResult('Missing required parameters: class_name and source_code');
    }

    const className = args.class_name.toUpperCase();
    const uri = classUri(className);
    const shouldActivate = args.activate === true;
    const sourceCode = args.source_code;
    logger.info(`Starting UpdateClass for ${className} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];

      await client.withLock(uri, async (lock) => {
        const preCheck = await checkProposed(client, uri, `${uri}/source/main`, sourceCode);
        assertNoCheckErrors(preCheck, 'Class', className);
        checkWarnings = [...preCheck.warnings];
        await putSource(client, uri, lock.handle, sourceCode, args.transport_request);
      });
      logger.info(`Class source code updated: ${className}`);

      try {
        const postCheck = await checkStored(client, uri, 'inactive');
        checkWarnings = [...checkWarnings, ...postCheck.errors, ...postCheck.warnings];
      } catch (error) {
        logger.warn(`Inactive version check had issues: ${className} - ${describeFailure(error)}`);
      }

      if (shouldActivate) {
        const body = await activateOne(client, uri, className, { contentType: CT_ACTIVATION });
        const failures = activationErrors(parseActivationMessages(body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: class ${className} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        logger.info(`Class activated: ${className}`);
      }

      return okResult({
        success: true,
        class_name: className,
        activated: shouldActivate,
        message: `Class ${className} updated${shouldActivate ? ' and activated' : ''} successfully`,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating class ${className}: ${message}`);
      return errorResult(message);
    }
  },
);
