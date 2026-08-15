/**
 * `UpdateStructure` — 이미 있는 구조체의 DDL 소스를 갈아 끼운다.
 *
 * 흐름은 `UpdateTable`과 같다(잠금 → 쓰기 전 검사 → PUT → 해제 → 사후검사 →
 * 활성화). 구 핸들러는
 * `engine/src/handlers/structure/high/handleUpdateStructure.ts`이고, 테이블 쪽과
 * 실제로 다른 것은 넷뿐이다:
 *
 *  1. **URI 대소문자가 테이블과 반대다.** 잠금·해제·검사는 소문자, 소스 PUT과
 *     활성화는 대문자다(`core/structure/{lock,update,activation}.js`). 표는
 *     `./tableStructureWrite.ts` 머리말에 있다.
 *  2. **소스 PUT의 Accept가 다르다** — `core/structure/update.js:19`에 그 자리
 *     문자열로 적힌 값이며 테이블의 `text/plain`과 같지 않다.
 *  3. **ECC 우회 갈래가 없다.** 테이블 쪽 두 도구에만 있다.
 *  4. **검사 실패 문구가 한 겹 더 감싸인다** — 벤더 `checkStructure`가 먼저
 *     `Structure check failed: …`로 던지고 구 핸들러가 그것을
 *     `New code check failed: …`로 다시 감쌌다
 *     (`core/structure/check.js:33-46` · `handleUpdateStructure.ts:175-177`).
 *
 * ## 구와 일부러 다른 것 (`harness/DIVERGENCES.md` D56)
 *
 * 활성화 응답의 `E` 메시지를 실패로 되돌린다. 구는 그것을 경고 배열에 담고
 * `success: true`로 답했다.
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
  describeFailure,
  errorResult,
  parseActivationMessages,
} from './shared';
import {
  STRUCTURE_WRITE,
  judgeDdicCheck,
  prettyResult,
  putDdlSource,
  runDdicCheck,
  transportRequestArg,
} from './tableStructureWrite';

const DDL_CODE_DESCRIPTION =
  "Complete DDL source code for structure. Example: '@EndUserText.label : \\'My Structure\\' " +
  '@AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : ' +
  "abap.clnt not null; id : abap.char(10); name : abap.char(255); }'";

export const updateStructure = defineTool(
  {
    name: 'UpdateStructure',
    description:
      'Update DDL source code of an existing ABAP structure. Locks the structure, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing structures without re-creating metadata.',
    inputSchema: {
      structure_name: z
        .string()
        .describe('Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.'),
      ddl_code: z.string().describe(DDL_CODE_DESCRIPTION),
      transport_request: transportRequestArg(false),
      activate: z
        .boolean()
        .describe('Activate structure after source update. Default: true.')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['structure_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.structure_name || !args.ddl_code) {
      return errorResult('Error: structure_name and ddl_code are required');
    }

    const structureName = args.structure_name.toUpperCase();
    const shouldActivate = args.activate !== false;
    const ddlCode = args.ddl_code;
    logger.info(`Starting structure source update: ${structureName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];

      await client.withLock(STRUCTURE_WRITE.lockUri(structureName), async (lock) => {
        const preCheck = await runDdicCheck(
          client,
          STRUCTURE_WRITE,
          structureName,
          'inactive',
          ddlCode,
        );
        const verdict = judgeDdicCheck(preCheck);
        if (verdict.blocked) {
          // 구는 벤더의 `Structure check failed: …`를 다시 감쌌다. 두 겹 모두 보존한다.
          throw new SourceCheckFailure(
            `New code check failed: Structure check failed: ${verdict.detail}`,
            preCheck.errors,
            preCheck.warnings,
          );
        }
        checkWarnings = [...preCheck.warnings];
        await putDdlSource(
          client,
          STRUCTURE_WRITE,
          structureName,
          lock.handle,
          ddlCode,
          args.transport_request,
        );
      });
      logger.info(`Structure source code updated: ${structureName}`);

      try {
        const postCheck = await runDdicCheck(client, STRUCTURE_WRITE, structureName, 'inactive');
        checkWarnings = [...checkWarnings, ...postCheck.errors, ...postCheck.warnings];
      } catch (error) {
        logger.warn(
          `Inactive version check had issues: ${structureName} - ${describeFailure(error)}`,
        );
      }

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        const body = await activateOne(
          client,
          STRUCTURE_WRITE.activateUri(structureName),
          structureName,
          { contentType: CT_ACTIVATION },
        );
        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: structure ${structureName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map((entry) => `${entry.type}: ${entry.text || 'Unknown'}`);
        logger.info(`Structure activated: ${structureName}`);
      }

      return prettyResult({
        success: true,
        structure_name: structureName,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Structure ${structureName} source updated and activated successfully`
          : `Structure ${structureName} source updated successfully (not activated)`,
        uri: STRUCTURE_WRITE.activateUri(structureName),
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
        source_size_bytes: ddlCode.length,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating structure source ${structureName}: ${message}`);
      // 구 `return_error(new Error('Failed to update structure: …'))` — 접두사 포함.
      return errorResult(`Error: Failed to update structure: ${message}`);
    }
  },
);
