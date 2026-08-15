/**
 * UpdateProgram — 기존 프로그램의 소스를 갈아 끼운다.
 *
 * 시퀀스는 잠금 → **쓰기 전 구문검사** → PUT → 해제 → 사후검사 → (활성화)다.
 * 구 핸들러(`engine/src/handlers/program/high/handleUpdateProgram.ts`)와 같다.
 *
 * 세 가지가 이 순서의 이유다:
 *  1. 검사가 **PUT 앞에** 있다 — 깨진 코드는 서버에 닿지 않고, 활성 버전은
 *     그대로 살아 있는다.
 *  2. 잠금과 PUT 사이가 stateless로 새면 SAP이 다른 워크 프로세스로 라우팅하며
 *     세션을 접고, 잠금이 증발해 PUT이 423으로 죽는다. 접속 계층의 `withLock`이
 *     잠금 보유 구간을 stateful로 유지하므로 여기서 다시 손대지 않는다.
 *  3. 활성화 응답은 **오류를 담은 채 200으로 온다**. 상태 코드만 보면 거짓
 *     성공이 된다 — 본문의 `E` 메시지를 실패로 되돌린다.
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
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
  programUri,
  putSource,
} from './shared';

export const updateProgram = defineTool(
  {
    name: 'UpdateProgram',
    description:
      'Update source code of an existing ABAP program. Locks the program, checks new code, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.',
    inputSchema: {
      program_name: z
        .string()
        .describe('Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.'),
      source_code: z.string().describe('Complete ABAP program source code.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      activate: z
        .boolean()
        .describe(
          'Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.program_name || !args.source_code) {
      return errorResult('Missing required parameters: program_name and source_code');
    }

    const programName = args.program_name.toUpperCase();
    const uri = programUri(programName);
    const shouldActivate = args.activate === true;
    const sourceCode = args.source_code;
    logger.info(`Starting program source update: ${programName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];

      await client.withLock(uri, async (lock) => {
        const preCheck = await checkProposed(client, uri, `${uri}/source/main`, sourceCode);
        assertNoCheckErrors(preCheck, 'Program', programName);
        checkWarnings = [...preCheck.warnings];
        await putSource(client, uri, lock.handle, sourceCode, args.transport_request);
      });
      logger.info(`Program source code updated: ${programName}`);

      // 사후검사는 최선 노력이다 — 전송요청·툴링 사정으로 이 패스가 실패해도
      // 쓰기 자체를 되돌리지 않는다. 다만 **결과는 삼키지 않는다**: 경고도
      // 오류도 종류(type)를 단 채 그대로 실려 나간다.
      try {
        const postCheck = await checkStored(client, uri, 'inactive');
        checkWarnings = [...checkWarnings, ...postCheck.errors, ...postCheck.warnings];
      } catch (error) {
        logger.warn(`Inactive version check had issues: ${programName} - ${describeFailure(error)}`);
      }

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        const body = await activateOne(client, uri, programName, {
          contentType: CT_ACTIVATION,
        });
        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          // 구 엔진은 여기서 success:true를 돌려줬다. 활성화되지 않은 것을
          // 활성화됐다고 말하는 것은 거짓 성공이다.
          throw new SourceCheckFailure(
            `Activation failed: program ${programName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map((entry) => `${entry.type}: ${entry.text || 'Unknown'}`);
        logger.info(`Program activated: ${programName}`);
      }

      return okResult({
        success: true,
        program_name: programName,
        type: 'PROG/P',
        activated: shouldActivate,
        message: shouldActivate
          ? `Program ${programName} source updated and activated successfully`
          : `Program ${programName} source updated successfully (not activated)`,
        uri,
        steps_completed: [
          'lock',
          'check_new_code',
          'update',
          'unlock',
          'check_inactive',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
        source_size_bytes: sourceCode.length,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating program source ${programName}: ${message}`);
      if (error instanceof SourceCheckFailure) return errorResult(message);
      return errorResult(`Failed to update program ${programName}: ${message}`);
    }
  },
);
