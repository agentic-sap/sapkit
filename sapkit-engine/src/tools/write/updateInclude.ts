/**
 * UpdateInclude — Type I 인클루드(PROG/I)의 소스를 갈아 끼운다.
 *
 * 구 핸들러는 `engine/src/handlers/include/high/handleUpdateInclude.ts`.
 * 프로그램·클래스와 두 군데가 다르고, 둘 다 의도된 차이다:
 *
 *  1. **URI가 대문자다.** 구는 인클루드만 이름을 대문자 그대로 실어 보낸다.
 *     소문자로 접어 넣지 않는다.
 *  2. **인클루드는 혼자 검사되지 않는다.** SAP의 checkruns 리포터는 PROG/I를
 *     단독으로 컴파일하려 들며 "REPORT 문이 없다" 같은 잡음을 낸다. 그래서
 *     `main_program`이 주어졌을 때만, **부모 프로그램 트리**를 바깥 대상으로
 *     두고 인클루드 소스를 인라인으로 얹어 컴파일한다. 이것이 인클루드 변경에
 *     대해 여러 오류를 한 번에 돌려주는 유일한 경로다.
 *
 * 그리고 **활성화가 실질적인 검증 관문**이다: SAP은 활성화 실패를 200 + 본문
 * `<chkl:msg type="E">`로 알린다. 여기서 그것을 실패로 되돌리지 않으면 깨진
 * 인클루드가 조용히 "성공"으로 보고된다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  CT_ACTIVATION_REQUEST,
  type CheckMessage,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  checkProposed,
  describeFailure,
  errorResult,
  includeUri,
  okResult,
  parseActivationMessages,
  programUri,
  putSource,
} from './shared';

export const updateInclude = defineTool(
  {
    name: 'UpdateInclude',
    description:
      'Update source code of an existing ABAP Include program (Type I). Locks the include, uploads new source code, and unlocks. Optionally activates after update. Use this instead of UpdateProgram for Type I include programs.',
    inputSchema: {
      include_name: z
        .string()
        .describe('Include program name. Must already exist as Type I include in SAP.'),
      source_code: z
        .string()
        .describe(
          'Complete ABAP include source code. Do NOT include a REPORT statement — include programs start directly with code or comments.',
        ),
      main_program: z
        .string()
        .describe(
          'Name of the parent/master program that contains this include. When provided, a program-wide syntax check is run after the source is uploaded to catch ABAP errors in the new include code. Highly recommended.',
        )
        .optional(),
      transport_request: z
        .string()
        .describe('Transport request number. Required for transportable packages.')
        .optional(),
      activate: z
        .boolean()
        .describe(
          'Activate include after source update. Default: false. Set to true to activate immediately.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.include_name || !args.source_code) {
      return errorResult('Missing required parameters: include_name and source_code');
    }

    const includeName = args.include_name.toUpperCase();
    const baseUri = includeUri(includeName);
    const shouldActivate = args.activate === true;
    const sourceCode = args.source_code;
    let currentStep = 'start';
    let checkWarnings: CheckMessage[] = [];

    logger.info(`Starting include source update: ${includeName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();

      if (args.main_program) {
        currentStep = 'check_new_code';
        const mainProgram = args.main_program.toUpperCase();
        const check = await checkProposed(
          client,
          programUri(mainProgram),
          `${baseUri}/source/main`,
          sourceCode,
        );
        assertNoCheckErrors(check, 'Include', includeName);
        checkWarnings = [...check.warnings];
        logger.info(`Pre-write check passed: ${includeName} via ${mainProgram}`);
      }

      currentStep = 'lock';
      await client.withLock(baseUri, async (lock) => {
        currentStep = 'update';
        await putSource(client, baseUri, lock.handle, sourceCode, args.transport_request);
        currentStep = 'unlock';
      });
      logger.info(`Include source code updated: ${includeName}`);

      if (shouldActivate) {
        currentStep = 'activate';
        const body = await activateOne(client, baseUri, includeName, {
          contentType: CT_ACTIVATION_REQUEST,
          timeout: 'long',
        });
        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Include ${includeName} activation failed (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. Active version on SAP is unchanged; broken source is staged as inactive and must be replaced via a second UpdateInclude call.`,
            failures,
            messages.filter((entry) => entry.type === 'W'),
          );
        }
        checkWarnings = messages.filter((entry) => entry.type === 'W');
        logger.info(`Include activated: ${includeName}`);
      }

      return okResult({
        success: true,
        include_name: includeName,
        type: 'PROG/I',
        activated: shouldActivate,
        message: shouldActivate
          ? `Include ${includeName} source updated and activated successfully`
          : `Include ${includeName} source updated successfully (not activated)`,
        uri: baseUri.toLowerCase(),
        steps_completed: ['lock', 'update', 'unlock', ...(shouldActivate ? ['activate'] : [])],
        source_size_bytes: sourceCode.length,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating include ${includeName} at step=${currentStep}: ${message}`);
      return errorResult(
        `Failed to update include ${includeName} at step=${currentStep}: ${message}`,
      );
    }
  },
);
