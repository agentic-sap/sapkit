/**
 * CreateProgram — 새 ABAP 프로그램(리포트)의 껍데기를 만든다.
 *
 * 흐름은 구 핸들러(`engine/src/handlers/program/high/handleCreateProgram.ts`)와
 * 같다: 이름 검증 → 로그온 언어 조회 → 생성 → 생성 후 구문검사. 소스는 이
 * 도구가 넣지 않는다(UpdateProgram의 몫).
 *
 * 두 자리가 안전에 직결된다:
 *  - **만들 수 없는 타입을 조용히 대체하지 않는다.** ADT의 programs 컬렉션은
 *    무엇을 달라 하든 PROG/P 껍데기를 만든다. 그래서 include·function group·
 *    class pool을 여기서 받으면 "요청한 타입"이라 이름 붙은 엉뚱한 오브젝트가
 *    생긴다 — 전용 도구를 지목하며 거부한다.
 *  - **마스터 언어를 EN으로 박지 않는다.** 로그온 언어가 EN이 아닌 시스템에서
 *    EN 고정 페이로드는 설명이 빈 채로 되읽히거나 생성이 400으로 막힌다.
 */

import * as z from 'zod';

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server';
import type { ToolContext } from '../../server';
import {
  ACCEPT_VALIDATION,
  CT_PROGRAM,
  SourceCheckFailure,
  assertNoCheckErrors,
  checkStored,
  describeFailure,
  encodeObjectName,
  errorResult,
  limitDescription,
  okResult,
  programUri,
} from './shared';

/** ADT programs 컬렉션이 정직하게 만들 수 있는 타입 — 둘 다 PROG/P다. */
const SUPPORTED_PROGRAM_TYPES = ['executable', 'module_pool'] as const;

/** 구 `convertProgramType` — SAP 내부 코드. */
const PROGRAM_TYPE_CODE: Readonly<Record<string, string>> = {
  executable: '1',
  module_pool: 'M',
};

const DEDICATED_TOOL: Readonly<Record<string, string>> = {
  include: 'CreateInclude',
  function_group: 'CreateFunctionGroup',
  class_pool: 'CreateClass',
  interface_pool: 'CreateInterface',
};

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
const DEFAULT_MASTER_LANGUAGE = 'EN';

const validationParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

interface ValidationVerdict {
  readonly valid: boolean;
  readonly message?: string;
}

/**
 * `/programs/validation`의 답을 읽는다. `CHECK_RESULT=X`거나 아무것도 없으면
 * 통과, `SEVERITY=ERROR`면 거부다. 읽을 수 없는 응답을 거부로 바꾸지 않는다 —
 * 그쪽은 실제 생성 요청이 판정한다.
 */
export function parseValidation(body: string): ValidationVerdict {
  let document: Record<string, unknown>;
  try {
    document = validationParser.parse(body ?? '') as Record<string, unknown>;
  } catch {
    return { valid: true };
  }
  const values = (document['asx:abap'] as Record<string, unknown> | undefined)?.['asx:values'];
  const data = (values as Record<string, unknown> | undefined)?.['DATA'] as
    | Record<string, unknown>
    | undefined;
  if (!data) return { valid: true };
  if (data['CHECK_RESULT'] === 'X') return { valid: true };
  const severity = typeof data['SEVERITY'] === 'string' ? data['SEVERITY'] : undefined;
  const shortText = typeof data['SHORT_TEXT'] === 'string' ? data['SHORT_TEXT'] : undefined;
  return { valid: severity !== 'ERROR', message: shortText };
}

/**
 * 접속된 시스템의 로그온/마스터 언어. 조회가 안 되면 `EN`으로 떨어진다 —
 * 이 조회 실패가 생성 실패가 되어서는 안 된다.
 */
async function resolveMasterLanguage(client: AdtClient): Promise<string> {
  try {
    const response = await client.request({
      method: 'GET',
      path: SYSTEMINFO_PATH,
      accept: SYSTEMINFO_ACCEPT,
    });
    const parsed = JSON.parse(response.body) as { language?: unknown };
    const language = typeof parsed.language === 'string' ? parsed.language.trim().toUpperCase() : '';
    // ADT 언어 코드는 1~3자다. 모양이 다르면 쓰지 않는다 — 페이로드에 쓰레기를
    // 넣느니 알려진 기본값이 낫다.
    if (/^[A-Z]{1,3}$/.test(language)) return language;
  } catch {
    // 조회 불가 — 기본값으로.
  }
  return DEFAULT_MASTER_LANGUAGE;
}

export const createProgram = defineTool(
  {
    name: 'CreateProgram',
    description:
      'Create a new ABAP program (report) in SAP system. Creates the program object in initial state. Use UpdateProgram to set source code afterwards.',
    inputSchema: {
      program_name: z
        .string()
        .describe(
          'Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).',
        ),
      description: z
        .string()
        .describe('Program description. If not provided, program_name will be used.')
        .optional(),
      package_name: z.string().describe('Package name (e.g., ZOK_LAB, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      program_type: z
        .enum(['executable', 'module_pool'])
        .describe(
          "Program type: 'executable' (Report) or 'module_pool'. Both are created in the ADT programs/programs collection (PROG/P). Default: 'executable'. To create an include, function group, class pool, or interface pool use the dedicated tool (CreateInclude / CreateFunctionGroup / CreateClass / CreateInterface) — CreateProgram cannot create those object types.",
        )
        .optional(),
      application: z
        .string()
        .describe(
          "Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'",
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.program_name || !args.package_name) {
      return errorResult('Missing required parameters: program_name and package_name');
    }

    // 요청한 타입을 만들 수 없으면 **만들지 않는다**. 조용한 대체가 곧 오분류다.
    const requestedType = args.program_type as string | undefined;
    if (requestedType && !SUPPORTED_PROGRAM_TYPES.includes(requestedType as never)) {
      const dedicated = DEDICATED_TOOL[requestedType];
      return errorResult(
        dedicated
          ? `CreateProgram cannot create program_type '${requestedType}' — the ADT programs endpoint would silently create a plain executable program (PROG/P) instead. Use ${dedicated} to create a ${requestedType.replace(/_/g, ' ')}.`
          : `Unsupported program_type '${requestedType}'. CreateProgram supports: ${SUPPORTED_PROGRAM_TYPES.join(', ')}.`,
      );
    }

    const programName = args.program_name.toUpperCase();
    const packageName = args.package_name;
    const rawDescription = args.description || programName;
    logger.info(`Starting program creation: ${programName}`);

    try {
      const client = await context.getConnection();

      const validation = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/programs/validation',
        params: {
          objname: programName,
          objtype: 'PROG/P',
          packagename: packageName,
          description: rawDescription,
        },
        accept: ACCEPT_VALIDATION,
      });
      const verdict = parseValidation(validation.body);
      if (!verdict.valid) {
        throw new Error(
          `Program name validation failed: ${verdict.message || 'Invalid program name'}`,
        );
      }

      const masterLanguage = await resolveMasterLanguage(client);
      const description = limitDescription(rawDescription);
      const programType = PROGRAM_TYPE_CODE[requestedType ?? 'executable'] ?? '1';
      const application = args.application || '*';

      const metadata =
        `<?xml version="1.0" encoding="UTF-8"?><program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" ` +
        `xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="${masterLanguage}" ` +
        `adtcore:name="${programName}" adtcore:type="PROG/P" adtcore:masterLanguage="${masterLanguage}" ` +
        `program:programType="${programType}" program:application="${application}">\n` +
        `  <adtcore:packageRef adtcore:name="${packageName}"/>\n` +
        `</program:abapProgram>`;

      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/programs/programs',
        params: { corrNr: args.transport_request },
        body: metadata,
        contentType: CT_PROGRAM,
        accept: CT_PROGRAM,
      });
      logger.info(`Program created: ${programName}`);

      // 생성 뒤 확인. 껍데기는 늘 깨끗해야 하지만, 여기서 패키지·전송요청·이름
      // 쪽 문제가 처음 드러나기도 한다. 오류가 나오면 **성공으로 접지 않는다**.
      const uri = programUri(programName);
      const stepsCompleted = ['validate', 'create'];
      const check = await checkStored(client, uri, 'inactive');
      assertNoCheckErrors(check, 'Program', programName);
      stepsCompleted.push('check');

      return okResult({
        success: true,
        program_name: programName,
        package_name: packageName,
        transport_request: args.transport_request || null,
        program_type: requestedType || 'executable',
        type: 'PROG/P',
        message: `Program ${programName} created successfully. Use UpdateProgram to set source code.`,
        uri: `/sap/bc/adt/programs/programs/${encodeObjectName(programName).toLowerCase()}`,
        steps_completed: stepsCompleted,
        check_warnings: check.warnings.length > 0 ? check.warnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error creating program ${programName}: ${message}`);
      // 구문검사 실패는 진단(줄번호 포함)을 그대로 올린다.
      if (error instanceof SourceCheckFailure) return errorResult(message);
      return errorResult(`Failed to create program ${programName}: ${message}`);
    }
  },
);
