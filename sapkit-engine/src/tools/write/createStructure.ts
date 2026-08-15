/**
 * `CreateStructure` — 필드 명세로 구조체를 만들고 그 DDL을 잠금 아래에서 적용한다.
 *
 * 구 핸들러는 `engine/src/handlers/structure/high/handleCreateStructure.ts`이고,
 * 흐름은 DDL 생성 → 검증 → 로그온 언어 조회 → 껍데기 생성 → **생성 DDL 사전검사**
 * → 잠금 아래 PUT → 해제 → 사후검사 → (활성화)다.
 *
 * `CreateTable`과 성격이 갈리는 자리가 셋이다:
 *
 *  1. **DDL을 SAP에 닿기 전에 만든다.** 명세가 불완전하면 `./structureDdl.ts`가
 *     그 자리에서 던지므로 **아무것도 만들어지지 않는다** — 치울 반쪽 껍데기가
 *     남지 않는다.
 *  2. **필드 적용은 최선 노력이 아니다.** `CreateTable`의 MANDT 스켈레톤은
 *     실패해도 성공으로 답하지만, 여기서는 필드가 곧 사용자가 요청한 것이므로
 *     PUT이 실패하면 실패다(구 `handleCreateStructure.ts:320-345` — 그 try에는
 *     catch가 없고 `finally`의 해제만 있다).
 *  3. **생성 페이로드의 description이 실제 설명이다.** 테이블 쪽은 이름을 넣는
 *     기벽이 있었지만(`createTable.ts` 머리말), 구조체 쪽 벤더 코드는 설명을
 *     제대로 넘긴다(`core/structure/create.js:21`).
 *
 * ## 구와 일부러 다른 것 (`harness/DIVERGENCES.md` D56)
 *
 * **활성화 응답을 읽는다.** 구는 `activate({structureName})`를 부르고 응답을
 * 아예 보지 않아서(`handleCreateStructure.ts:384-386`), 활성화가 오류로 끝나도
 * `activated: true`로 답했다. 여기서는 `E`·`A`·`X`가 있으면 실패로 되돌린다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  describeFailure,
  errorResult,
  parseActivationMessages,
} from './shared';
import { generateStructureDdl } from './structureDdl';
import {
  STRUCTURE_WRITE,
  buildBlueSource,
  compactResult,
  createShell,
  judgeDdicCheck,
  limitDescription,
  putDdlSource,
  resolveMasterLanguage,
  runDdicCheck,
  transportRequestArg,
  validateName,
} from './tableStructureWrite';

const fieldSchema = z.object({
  name: z.string().describe('Field name (e.g., CLIENT, MATERIAL_ID)'),
  data_type: z
    .string()
    .describe('Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.')
    .optional(),
  length: z.number().describe('Field length').optional(),
  decimals: z.number().describe('Decimal places (for DEC, CURR, QUAN types)').default(0),
  domain: z.string().describe('Domain name for type reference (optional)').optional(),
  data_element: z.string().describe('Data element name for type reference (optional)').optional(),
  structure_ref: z.string().describe('Include another structure (optional)').optional(),
  table_ref: z.string().describe('Reference to table type (optional)').optional(),
  description: z.string().describe('Field description').optional(),
  currency_reference: z
    .string()
    .describe(
      'For CURR fields: name of the CUKY field in THIS structure that carries the currency key. Emits @Semantics.amount.currencyCode (optional).',
    )
    .optional(),
  unit_reference: z
    .string()
    .describe(
      'For QUAN fields: name of the UNIT field in THIS structure that carries the unit of measure. Emits @Semantics.quantity.unitOfMeasure (optional).',
    )
    .optional(),
});

const includeSchema = z.object({
  name: z.string().describe('Include structure name'),
  suffix: z.string().describe('Optional suffix for include fields').optional(),
});

function isAlreadyExists(error: unknown): boolean {
  if (error instanceof AdtError && error.status === 409) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already exists');
}

export const createStructure = defineTool(
  {
    name: 'CreateStructure',
    description:
      'Create a new ABAP structure in SAP system with fields and type references. Includes create, activate, and verify steps. The fields/includes input is generated into DDIC "define structure" DDL and applied under lock; creation fails explicitly (before any object is created) when a field spec is incomplete — e.g. a built-in type missing its length, or a field with neither data_element nor data_type.',
    inputSchema: {
      structure_name: z
        .string()
        .describe('Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions.'),
      description: z
        .string()
        .describe('Structure description. If not provided, structure_name will be used.')
        .optional(),
      package_name: z.string().describe('Package name (e.g., ZOK_LOCAL, $TMP for local objects)'),
      transport_request: transportRequestArg(true),
      fields: z.array(fieldSchema).describe('Array of structure fields'),
      includes: z
        .array(includeSchema)
        .describe('Include other structures in this structure')
        .optional(),
      activate: z
        .boolean()
        .describe(
          'Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['structure_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.structure_name) return errorResult('Structure name is required');
    if (!args.package_name) return errorResult('Package name is required');
    if (!Array.isArray(args.fields) || args.fields.length === 0) {
      return errorResult('At least one field is required');
    }

    const structureName = args.structure_name.toUpperCase();

    // **SAP에 닿기 전에** DDL을 만든다. 여기서 던지면 아무것도 만들어지지 않는다.
    let ddlCode: string;
    try {
      ddlCode = generateStructureDdl({
        structureName,
        description: args.description,
        fields: args.fields,
        includes: args.includes,
      });
    } catch (error) {
      return errorResult(
        `Cannot generate structure DDL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const componentCount = args.fields.length + (args.includes?.length ?? 0);
    const shouldActivate = args.activate !== false;
    const description = args.description || structureName;
    logger.info(`Starting structure creation: ${structureName}`);

    try {
      const client = await context.getConnection();

      await validateName(client, STRUCTURE_WRITE, structureName, description);

      const masterLanguage = await resolveMasterLanguage(client);
      await createShell(
        client,
        STRUCTURE_WRITE,
        buildBlueSource({
          kind: STRUCTURE_WRITE,
          name: structureName,
          packageName: args.package_name,
          description: limitDescription(description),
          masterLanguage,
        }),
        args.transport_request,
      );

      // 생성한 DDL을 **쓰기 전에** 검증한다 — 불투명한 PUT 실패 대신 진짜 이유를 낸다.
      const preCheck = await runDdicCheck(
        client,
        STRUCTURE_WRITE,
        structureName,
        'inactive',
        ddlCode,
      );
      const verdict = judgeDdicCheck(preCheck);
      if (verdict.blocked) {
        throw new SourceCheckFailure(
          `Generated DDL check failed: Structure check failed: ${verdict.detail}`,
          preCheck.errors,
          preCheck.warnings,
        );
      }

      // 필드 적용은 사용자가 요청한 것 자체다 — 실패하면 실패다.
      await client.withLock(STRUCTURE_WRITE.lockUri(structureName), async (lock) => {
        await putDdlSource(
          client,
          STRUCTURE_WRITE,
          structureName,
          lock.handle,
          ddlCode,
          args.transport_request,
        );
      });
      logger.info(`Applied ${componentCount} field(s)/include(s) to ${structureName}`);

      // 사후검사는 정보용이다 — 구도 경고만 남기고 넘어간다.
      try {
        await runDdicCheck(client, STRUCTURE_WRITE, structureName, 'inactive');
      } catch (error) {
        logger.warn(
          `Inactive version check had issues: ${structureName} - ${describeFailure(error)}`,
        );
      }

      if (shouldActivate) {
        const body = await activateOne(
          client,
          STRUCTURE_WRITE.activateUri(structureName),
          structureName,
          { contentType: CT_ACTIVATION },
        );
        const failures = activationErrors(parseActivationMessages(body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: structure ${structureName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The structure exists with its fields as an inactive version.`,
            failures,
          );
        }
      }

      return compactResult({
        success: true,
        structure_name: structureName,
        package_name: args.package_name,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        fields_applied: componentCount,
        message: `Structure ${structureName} created with ${componentCount} field(s)/include(s) applied${
          shouldActivate ? ' and activated' : ''
        }`,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error creating structure ${structureName}: ${message}`);
      if (isAlreadyExists(error)) {
        return errorResult(
          `Structure ${structureName} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(`Failed to create structure ${structureName}: ${message}`);
    }
  },
);
