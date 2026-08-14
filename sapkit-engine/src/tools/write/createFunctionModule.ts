/**
 * CreateFunctionModule — 이미 있는 함수그룹 안에 함수모듈 껍데기를 만든다.
 *
 * 흐름은 구 핸들러(`engine/src/handlers/function/high/handleCreateFunctionModule.ts`)와
 * 같다: 이름 검증 → 생성. **소스는 이 도구가 넣지 않는다**(UpdateFunctionModule의 몫).
 * 패키지도 받지 않는다 — 부모 함수그룹에서 물려받는다.
 *
 * ## 와이어 근거 (전부 읽기 전용 참고)
 *
 *  - 구 핸들러 — 위 파일 `:79-110`
 *  - 위임 — `engine/src/lib/clients.ts:15-32` →
 *    `@babamba2/mcp-abap-adt-clients/dist/core/functionModule/AdtFunctionModule.js:63-113`
 *  - 검증 — 같은 패키지 `core/functionModule/validation.js:47-70`
 *    (`POST /sap/bc/adt/functions/validation?objtype=FUGR/FF&objname=…&fugrname=…`)
 *  - 생성 — 같은 패키지 `core/functionModule/create.js:12-45`
 *    (`POST /sap/bc/adt/functions/groups/{그룹 소문자}/fmodules`)
 *
 * ## 읽어야만 아는 세 가지
 *
 *  1. **검증 결과를 아무도 읽지 않는다.** 구 핸들러는 `validate()`의 반환값을
 *     버린다 — HTTP 오류로 **던질 때만** 흐름이 멈춘다. 응답 본문의 `SEVERITY`를
 *     여기서 판정하면 구가 통과시키던 생성이 막힌다.
 *  2. **설명의 길이 제한이 두 요청에서 다르다.** 검증 질의 인자에는 **자르지 않은**
 *     원문이 나가고(`validation.js:63`), 생성 페이로드에만 60자 제한이 걸린다
 *     (`create.js:24`). 통일하면 둘 중 하나가 구와 달라진다.
 *  3. **그룹 이름만 소문자로 낮춘다.** 생성 URL의 그룹 부분은 소문자인데,
 *     페이로드의 `adtcore:name`(모듈)과 `containerRef`의 그룹 이름은 **대문자
 *     그대로**다. `containerRef`의 `uri`만 다시 소문자다 (`create.js:14`·`:31-34`).
 *
 * 생성 체인에 활성화·구문검사는 없다 — `AdtFunctionModule.create`가 저수준 생성
 * 하나만 부른다. 껍데기에는 검사할 소스가 없기 때문이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_FUNCTION_MODULE_VALIDATION,
  CT_FUNCTION_MODULE,
  FUNCTION_VALIDATION_PATH,
  functionErrorResult,
  functionGroupUri,
  ownerAttributeXml,
  ownerAttributes,
} from './functions';
import { describeFailure, limitDescription, okResult } from './shared';
import { AdtError } from '../../adt';

/** 구 `error.response?.status` 자리. */
function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}

export const createFunctionModule = defineTool(
  {
    name: 'CreateFunctionModule',
    description:
      'Create a new ABAP function module within an existing function group. Creates the function module in initial state. Use UpdateFunctionModule to set source code afterwards.',
    inputSchema: {
      function_group_name: z
        .string()
        .describe('Parent function group name (e.g., ZTEST_FG_001)'),
      function_module_name: z
        .string()
        .describe(
          'Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).',
        ),
      description: z
        .string()
        .describe('Optional description for the function module')
        .optional(),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    // 그룹 이름도 함께 검사받는다 — 생성 URL이 그룹을 겨누므로 좌표가 아니라 대상이다.
    targetNames: ['function_module_name', 'function_group_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.function_group_name) {
      return functionErrorResult('function_group_name is required');
    }
    if (!args.function_module_name) {
      return functionErrorResult('function_module_name is required');
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    const functionModuleName = args.function_module_name.toUpperCase();
    // 구는 설명이 없으면 이름을 설명으로 쓴다.
    const rawDescription = args.description || functionModuleName;

    logger.info(
      `Starting function module creation: ${functionModuleName} in ${functionGroupName}`,
    );

    try {
      const client = await context.getConnection();

      // ① 이름 검증. **응답은 읽지 않는다** — 구도 읽지 않는다(머리주석 1번).
      //    설명은 여기서만 자르지 않고 원문으로 나간다(머리주석 2번).
      await client.request({
        method: 'POST',
        path: FUNCTION_VALIDATION_PATH,
        params: {
          objtype: 'FUGR/FF',
          objname: functionModuleName,
          fugrname: functionGroupName,
          description: rawDescription,
        },
        accept: ACCEPT_FUNCTION_MODULE_VALIDATION,
        timeout: 'default',
      });

      // ② 생성. 패키지는 부모 함수그룹에서 물려받으므로 페이로드에 없다.
      const groupUri = functionGroupUri(functionGroupName);
      const metadata =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<fmodule:abapFunctionModule xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" ` +
        `xmlns:adtcore="http://www.sap.com/adt/core" ` +
        `adtcore:description="${limitDescription(rawDescription)}" ` +
        `adtcore:name="${functionModuleName}" ` +
        `adtcore:type="FUGR/FF"${ownerAttributeXml(ownerAttributes(context))}>\n` +
        `  <adtcore:containerRef adtcore:name="${functionGroupName}" adtcore:type="FUGR/F" adtcore:uri="${groupUri}"/>\n` +
        `</fmodule:abapFunctionModule>`;

      await client.request({
        method: 'POST',
        path: `${groupUri}/fmodules`,
        params: { corrNr: args.transport_request },
        body: metadata,
        contentType: CT_FUNCTION_MODULE,
        accept: CT_FUNCTION_MODULE,
        timeout: 'default',
      });

      logger.info(`Function module created: ${functionModuleName}`);

      return okResult({
        success: true,
        function_module_name: functionModuleName,
        function_group_name: functionGroupName,
        transport_request: args.transport_request || 'local',
        message: `Function module ${functionModuleName} created successfully. Use UpdateFunctionModule to set source code.`,
      });
    } catch (error) {
      const detail = describeFailure(error);
      logger.error(`Error creating function module ${functionModuleName}: ${detail}`);

      // 구는 `409 || error.message.includes('already exists')`로 갈랐다. 뒤쪽
      // 조건은 이 경로에서 **닿을 수 없다** — 여기서 나오는 예외는 전부 HTTP
      // 오류이고 axios의 `message`는 "Request failed with status code 400"이라
      // SAP 문구를 담지 않는다. 신 엔진의 오류 문구는 SAP 텍스트를 **담으므로**,
      // 그대로 옮기면 구가 400 갈래로 보내던 응답이 이쪽으로 새어 순서가 뒤집힌다.
      // 그래서 상태 코드만 본다.
      const status = statusOf(error);
      if (status === 409) {
        return functionErrorResult(
          `Function module ${functionModuleName} already exists in group ${functionGroupName}. Please delete it first or use a different name.`,
        );
      }
      if (status === 404) {
        return functionErrorResult(
          `Function group ${functionGroupName} not found. Create the function group first.`,
        );
      }
      if (status === 400) {
        return functionErrorResult(
          'Bad request. Check if function module name is valid and function group exists.',
        );
      }
      return functionErrorResult(
        `Failed to create function module ${functionModuleName}: ${detail}`,
      );
    }
  },
);
