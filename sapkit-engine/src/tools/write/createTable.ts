/**
 * `CreateTable` — 새 테이블의 껍데기를 만들고 **MANDT 스켈레톤**을 얹는다.
 *
 * 구 핸들러는 `engine/src/handlers/table/high/handleCreateTable.ts`이고, 흐름은
 * 검증 → 로그온 언어 조회 → 생성 → (스켈레톤 적용)이다. 필드는 이 도구가 넣지
 * 않는다 — `UpdateTable`의 몫이다.
 *
 * 세 자리가 이 도구의 성격을 정한다:
 *
 *  1. **생성 페이로드의 `adtcore:description`은 사용자 설명이 아니라 테이블
 *     이름이다.** 벤더 `createTable`이 `limitDescription(params.table_name)`을
 *     쓰고 `AdtTable.create`는 설명을 아예 넘기지 않는다
 *     (`core/table/create.js:26` · `core/table/AdtTable.js:70-79`). 사용자 설명이
 *     실제로 가는 곳은 **검증 요청 하나뿐**이다. 이상해 보이지만 구 동작이므로
 *     고치지 않는다 — 고치면 재생 대조에서 본문이 어긋난다.
 *  2. **스켈레톤 적용은 최선 노력이다.** SAP이 만들어 주는 기본 껍데기는
 *     CDS 문법의 `key client : abap.clnt`인데, 투명 테이블의 정상 패턴은 MANDT
 *     데이터 엘리먼트다. 그대로 두면 사용자의 첫 `UpdateTable`이
 *     `ExceptionResourceAlreadyExists`로 막힌다. 그래서 곧바로 MANDT 스켈레톤을
 *     밀어 넣되, **실패해도 테이블은 이미 존재하므로 오류로 만들지 않고**
 *     `skeleton: 'client-fallback'`으로 사실대로 답한다.
 *  3. **ECC에는 만들지 않는다.** ECC의 DDIC 쓰기 계층은 행 기반(DD02V + DD03P)
 *     이라 여기서 만드는 CDS 스타일 DDL을 받지 못한다.
 *
 * 검증 응답은 **해석하지 않는다** — 구도 그렇다(`AdtTable.validate`는 응답을
 * 그대로 돌려줄 뿐이다). 이름이 나쁘면 요청 자체가 4xx로 실패한다.
 *
 * ## 구와 일부러 다른 것 (`harness/DIVERGENCES.md` D56)
 *
 * 이 도구는 활성화를 부르지 않으므로 D56의 활성화 조항이 직접 닿지는 않는다.
 * 같은 묶음의 다른 셋과 함께 등재해 두었다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { describeFailure, errorResult } from './shared';
import {
  TABLE_WRITE,
  buildBlueSource,
  compactResult,
  createShell,
  isEcc,
  limitDescription,
  putDdlSource,
  resolveMasterLanguage,
  transportRequestArg,
  validateName,
} from './tableStructureWrite';

/** 구 `handleCreateTable.ts:94-103`의 문구 그대로. */
const ECC_REFUSAL =
  'CreateTable is not supported on ECC via this MCP tool. ' +
  "ECC's DDIC write layer is row-based (DD02V + DD03P) and does not accept " +
  'the S/4HANA CDS-style DDL skeleton this handler generates. ' +
  'Call the OData FunctionImport /DdicTabl on ZMCP_ADT_SRV directly with ' +
  'IV_ACTION=\'CREATE\' and IV_PAYLOAD_JSON = \'{"dd02v":{...},"dd03p":[...]}\'.';

/**
 * SAP 기본 껍데기(`key client : abap.clnt`)를 대신할 투명 테이블 스켈레톤.
 * 구 `handleCreateTable.ts:142-153`과 같은 글자다 — 주석 블록 넷은 `UpdateTable`이
 * 그대로 보존하라고 안내하는 바로 그 블록이다.
 */
function mandtSkeleton(tableName: string, description: string): string {
  const label = description.replace(/'/g, "''");
  return `@EndUserText.label : '${label}'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table ${tableName.toLowerCase()} {
  key mandt : mandt not null;
}`;
}

/** 구는 문구와 상태 코드 양쪽으로 "이미 있다"를 판정했다. */
function isAlreadyExists(error: unknown): boolean {
  if (error instanceof AdtError && error.status === 409) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already exists');
}

export const createTable = defineTool(
  {
    name: 'CreateTable',
    description:
      'Create a new ABAP table via the ADT API. Creates the table object in initial state. Use UpdateTable to set DDL code afterwards.',
    inputSchema: {
      table_name: z
        .string()
        .describe('Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.'),
      description: z.string().describe('Table description for validation and creation.').optional(),
      package_name: z
        .string()
        .describe('Package name (e.g., ZOK_LOCAL, $TMP for local objects)'),
      transport_request: transportRequestArg(true),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['table_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.table_name) return errorResult('Table name is required');
    if (!args.package_name) return errorResult('Package name is required');

    const tableName = args.table_name.toUpperCase();
    if (isEcc(context.profile.sapVersion)) return errorResult(ECC_REFUSAL);

    // 검증에는 사용자 설명이, 생성 페이로드에는 테이블 이름이 간다 — 구의 갈림이다.
    const validationDescription = args.description || tableName;
    logger.info(`Starting table creation: ${tableName}`);

    try {
      const client = await context.getConnection();

      await validateName(client, TABLE_WRITE, tableName, validationDescription);

      const masterLanguage = await resolveMasterLanguage(client);
      await createShell(
        client,
        TABLE_WRITE,
        buildBlueSource({
          kind: TABLE_WRITE,
          name: tableName,
          packageName: args.package_name,
          description: limitDescription(tableName),
          masterLanguage,
        }),
        args.transport_request,
      );
      logger.info(`Table created: ${tableName}`);

      // 여기서부터는 **최선 노력**이다. 테이블은 이미 존재하므로 실패해도
      // 만들기 자체를 되돌리지 않는다.
      let skeletonApplied = false;
      try {
        await client.withLock(TABLE_WRITE.lockUri(tableName), async (lock) => {
          await putDdlSource(
            client,
            TABLE_WRITE,
            tableName,
            lock.handle,
            mandtSkeleton(tableName, validationDescription),
            args.transport_request,
          );
        });
        skeletonApplied = true;
        logger.info(`Applied MANDT-based transparent-table skeleton: ${tableName}`);
      } catch (error) {
        logger.warn(
          `Failed to apply MANDT skeleton for ${tableName} — leaving SAP default (abap.clnt). ` +
            `UpdateTable DDL must use 'key client : abap.clnt not null' + '#RESTRICTED' + ` +
            `'#NOT_EXTENSIBLE'. Error: ${describeFailure(error)}`,
        );
      }

      return compactResult({
        success: true,
        table_name: tableName,
        package_name: args.package_name,
        transport_request: args.transport_request || 'local',
        skeleton: skeletonApplied ? 'mandt' : 'client-fallback',
        message: skeletonApplied
          ? `Table ${tableName} created with MANDT skeleton. Use UpdateTable to add fields (preserve #NOT_EXTENSIBLE, #RESTRICTED, and 'key mandt : mandt not null').`
          : `Table ${tableName} created (MANDT skeleton apply FAILED — SAP default 'key client : abap.clnt' applies). Use UpdateTable carefully preserving the CDS-style skeleton.`,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error creating table ${tableName}: ${message}`);
      // 구는 이 자리에서 McpError를 던졌고 그 문구가 그대로 나갔다 —
      // `return_error`를 지나지 않으므로 `Error: ` 접두사가 없다.
      if (isAlreadyExists(error)) {
        return errorResult(
          `Table ${tableName} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(`Failed to create table ${tableName}: ${message}`);
    }
  },
);
