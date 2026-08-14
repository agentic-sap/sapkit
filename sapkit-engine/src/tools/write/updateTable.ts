/**
 * `UpdateTable` — 이미 있는 테이블의 DDL 소스를 갈아 끼운다.
 *
 * 시퀀스는 잠금 → **쓰기 전 검사** → PUT → 해제 → 사후검사 → (활성화)이고,
 * 구 핸들러(`engine/src/handlers/table/high/handleUpdateTable.ts`)와 같다.
 * `UpdateProgram`과 같은 뼈대지만 DDIC이라 다른 것이 셋 있다:
 *
 *  1. **검사 payload의 바깥 `chkrun:version`이 `inactive`다.** 프로그램 쪽
 *     헬퍼(`./shared.ts`의 `buildInlineCheckObjectList`)는 `active`로 박혀 있어
 *     쓸 수 없다 — DDIC은 호출자가 준 버전을 그대로 싣는다
 *     (`@babamba2/mcp-abap-adt-clients/dist/core/table/check.js:16-31`).
 *  2. **검사 결과 판정이 다르다.** `notProcessed`는 메시지가 없어도 오류이고,
 *     완료 통지를 `type="E"`로 되울린 메시지는 오류가 아니며, DDIC이 정상적으로
 *     내는 "inactive version does not exist" / "importing from database"는
 *     통과시킨다. 판정 본체는 `./tableStructureWrite.ts`의 `judgeDdicCheck`.
 *  3. **URI의 대소문자가 단계마다 다르다.** 잠금·활성화는 대문자 이름 그대로,
 *     PUT과 검사는 소문자다. 그 표도 `./tableStructureWrite.ts` 머리말에 있다.
 *
 * 구 핸들러는 `AdtTable.update`를 **저수준 모드**(`{ lockHandle }` 동반)로
 * 부르므로, 벤더 고수준 체인의 long-polling 재조회는 이 경로에 없다
 * (`core/table/AdtTable.js:196-213`).
 *
 * ## 구와 일부러 다른 것 (`harness/DIVERGENCES.md` D56)
 *
 * **활성화 응답의 `E` 메시지를 실패로 되돌린다.** 구는 그것을
 * `activation_warnings`에 담고 `success: true` · `activated: true`로 답했다 —
 * 활성화되지 않은 것을 활성화됐다고 말하는 거짓 성공이다. M1의 쓰기 도구
 * (`updateProgram` · `updateClass` · `updateInclude`)가 이미 같은 판단을 하고
 * 있으므로 이 도구만 예외로 둘 이유가 없다.
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
  TABLE_WRITE,
  isEcc,
  judgeDdicCheck,
  prettyResult,
  putDdlSource,
  runDdicCheck,
  transportRequestArg,
} from './tableStructureWrite';

const DDL_CODE_DESCRIPTION =
  "Complete DDL source code for a TRANSPARENT TABLE. IMPORTANT — use the MANDT data element " +
  "for the client key ('key mandt : mandt not null'), NOT 'abap.clnt' (that's CDS-view syntax). " +
  'Standard SAP tables (MARA, T001, VBAK, …) all use MANDT. The annotation block CreateTable ' +
  'seeded must be preserved verbatim: #NOT_EXTENSIBLE enhancement category, #TRANSPARENT ' +
  'tableCategory, #A deliveryClass, #RESTRICTED dataMaintenance. Example: ' +
  "'@EndUserText.label : \\'My Table\\' @AbapCatalog.enhancement.category : #NOT_EXTENSIBLE " +
  '@AbapCatalog.tableCategory : #TRANSPARENT @AbapCatalog.deliveryClass : #A ' +
  '@AbapCatalog.dataMaintenance : #RESTRICTED define table ztst_table { key mandt : mandt not ' +
  "null; key id : abap.char(10); name : abap.char(255); }'";

/** 구 `handleUpdateTable.ts:91-99`의 문구 그대로. */
const ECC_REFUSAL =
  'UpdateTable is not supported on ECC via this MCP tool. ' +
  "ECC's DDIC write layer is row-based (DD03P), not CDS-DDL-based. " +
  'Call the OData FunctionImport /DdicTabl on ZMCP_ADT_SRV directly with ' +
  'IV_ACTION=\'UPDATE\' and IV_PAYLOAD_JSON = \'{"dd02v":{...},"dd03p":[...]}\'.';

export const updateTable = defineTool(
  {
    name: 'UpdateTable',
    description:
      'Update DDL source code of an existing ABAP table. Locks the table, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing tables without re-creating metadata.',
    inputSchema: {
      table_name: z
        .string()
        .describe('Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist.'),
      ddl_code: z.string().describe(DDL_CODE_DESCRIPTION),
      transport_request: transportRequestArg(false),
      activate: z.boolean().describe('Activate table after source update. Default: true.').optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['table_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.table_name || !args.ddl_code) {
      // 구 `return_error`의 `Error: ` 접두사가 계약이다.
      return errorResult('Error: table_name and ddl_code are required');
    }

    const tableName = args.table_name.toUpperCase();

    // ECC의 DDIC 쓰기 계층은 행 기반(DD02V/DD03P)이라 CDS DDL을 받지 못한다.
    // 조용히 실패하게 두지 않고 여기서 멈춘다.
    if (isEcc(context.profile.sapVersion)) return errorResult(ECC_REFUSAL);

    const shouldActivate = args.activate !== false;
    const ddlCode = args.ddl_code;
    logger.info(`Starting table source update: ${tableName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];

      await client.withLock(TABLE_WRITE.lockUri(tableName), async (lock) => {
        const preCheck = await runDdicCheck(client, TABLE_WRITE, tableName, 'inactive', ddlCode);
        const verdict = judgeDdicCheck(preCheck);
        if (verdict.blocked) {
          // 깨진 DDL은 서버에 닿지 않는다 — PUT 앞에서 멈춘다.
          throw new SourceCheckFailure(
            `New code check failed: ${verdict.detail}`,
            preCheck.errors,
            preCheck.warnings,
          );
        }
        checkWarnings = [...preCheck.warnings];
        await putDdlSource(
          client,
          TABLE_WRITE,
          tableName,
          lock.handle,
          ddlCode,
          args.transport_request,
        );
      });
      logger.info(`Table source code updated: ${tableName}`);

      // 사후검사는 최선 노력이다 — 구도 경고만 남기고 넘어간다. 결과는 삼키지 않는다.
      try {
        const postCheck = await runDdicCheck(client, TABLE_WRITE, tableName, 'inactive');
        checkWarnings = [...checkWarnings, ...postCheck.errors, ...postCheck.warnings];
      } catch (error) {
        logger.warn(`Inactive version check had issues: ${tableName} - ${describeFailure(error)}`);
      }

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        const body = await activateOne(client, TABLE_WRITE.activateUri(tableName), tableName, {
          contentType: CT_ACTIVATION,
        });
        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: table ${tableName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map((entry) => `${entry.type}: ${entry.text || 'Unknown'}`);
        logger.info(`Table activated: ${tableName}`);
      }

      return prettyResult({
        success: true,
        table_name: tableName,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Table ${tableName} source updated and activated successfully`
          : `Table ${tableName} source updated successfully (not activated)`,
        uri: TABLE_WRITE.activateUri(tableName),
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
      logger.error(`Error updating table source ${tableName}: ${message}`);
      // 구는 이 자리를 `return_error(new Error('Failed to update table: …'))`로
      // 접었고, 그 함수가 `Error: ` 접두사를 붙인다(`lib/utils.ts:421-429`).
      // 사전검사 실패도 같은 자리로 흘러 들어가므로 갈래를 두지 않는다 —
      // 구는 그 문구를 `New code check failed: …`로 한 겹 더 감싸 여기로 보냈다.
      return errorResult(`Error: Failed to update table: ${message}`);
    }
  },
);
