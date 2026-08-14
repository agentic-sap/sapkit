/**
 * UpdateFunctionModule — 기존 함수모듈의 소스를 갈아 끼운다.
 *
 * 시퀀스는 구 핸들러(`engine/src/handlers/function/high/handleUpdateFunctionModule.ts`)와
 * 같다: **잠금 → PUT → 사후 구문검사 → 해제 → (활성화)**.
 *
 * **`UpdateProgram`과 순서가 다르다.** 프로그램 쪽은 쓰기 **앞에** 검사를 두어
 * 깨진 코드가 서버에 닿지 않게 하지만, 여기는 구가 그렇게 짓지 않았다 — 검사가
 * PUT 뒤에 온다. 그래서 검사 실패는 "쓰기가 없던 일이 됐다"는 뜻이 아니다.
 * **쓰기는 비활성 버전으로 남는다.** 도구 설명이 그 사실을 그대로 말하고, 같은
 * 이유로 형제 FM의 기존 결함이 이 검사에 섞여 나온다(함수그룹이 통째로 컴파일되기
 * 때문이다). 그 문장은 구 엔진 자체 시험
 * `engine/src/__tests__/handleUpdateFunctionModule.test.ts`가 못 박은 계약이다 —
 * "고쳐서" 검사를 앞으로 당기면 구와 다른 도구가 된다.
 *
 * ## 와이어 근거 (전부 읽기 전용 참고)
 *
 *  - 구 핸들러 — 위 파일 `:104-199`
 *  - 잠금·해제 — `@babamba2/mcp-abap-adt-clients/dist/core/functionModule/lock.js:14-38` ·
 *    `unlock.js:11-25`
 *  - PUT — 같은 패키지 `core/functionModule/update.js:12-38`
 *    (`?lockHandle=…&corrNr=…` · `Content-Type: text/plain; charset=utf-8` ·
 *    `Accept: text/plain`)
 *  - 사후검사 — `engine/src/lib/preCheckBeforeActivation.ts:243-261`(FM 갈래) ·
 *    `:503-533`(`runRawCheckRun`)
 *  - 활성화 — 같은 패키지 `core/functionModule/activation.js:11-17` →
 *    `utils/activationUtils.js:115-131`
 *
 * ## 읽어야만 아는 두 가지
 *
 *  1. **전송요청을 안 줘도 `corrNr=local`이 실려 나간다.** 구는
 *     `args.transport_request ?? 'local'`로 기본값을 채우고 그 값을 그대로 URL에
 *     붙인다(위 핸들러 `:110`). `'local'`은 truthy라 질의 인자가 **언제나** 붙는다.
 *     "없으면 생략"으로 바꾸면 구와 다른 URL이 나간다.
 *  2. **사후검사 요청에는 Accept가 실리지 않는다.** 구의 `runRawCheckRun`은
 *     `Content-Type`만 넘기므로 접속 계층의 기본 Accept가 나간다
 *     (`AbstractAbapConnection.js:160-165`). 벤더의 `runCheckRun`이 쓰는
 *     `checkmessages` Accept와 **다른 값**이므로 여기서 통일하지 않는다.
 *
 * ## 구와 다른 것 — 등재됨
 *
 * 활성화 응답을 **읽는다**. 구는 응답을 버리고 언제나 `activated: true`를 보고했다.
 * SAP은 활성화 실패도 HTTP 200으로 답하므로 그것은 거짓 성공이다. 장부 D51.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { functionErrorResult, functionModuleUri } from './functions';
import {
  CT_ACTIVATION,
  CT_CHECK_OBJECTS,
  type CheckMessage,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  buildCheckObjectList,
  describeFailure,
  okResult,
  parseActivationMessages,
  parseCheckRun,
  putSource,
} from './shared';
import type { AdtClient } from '../../adt';
import { AdtError } from '../../adt';

/** 이름 길이 상한 — 구 핸들러 `:77-90`. 그룹·모듈 둘 다 30자다. */
const MAX_NAME_LENGTH = 30;

/**
 * 구 `runRawCheckRun`과 같은 요청 — **Accept를 싣지 않는다**(머리주석 2번).
 * `shared.ts`의 `checkStored`는 `checkmessages` Accept를 실으므로 쓰지 않는다.
 */
async function checkStoredWithoutAccept(
  client: AdtClient,
  objectUri: string,
): Promise<ReturnType<typeof parseCheckRun>> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildCheckObjectList(objectUri, 'inactive'),
    contentType: CT_CHECK_OBJECTS,
    timeout: 'default',
  });
  return parseCheckRun(response.body);
}

/** 구 `error.response?.status` 자리. */
function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}

export const updateFunctionModule = defineTool(
  {
    name: 'UpdateFunctionModule',
    description:
      'Update source code of an existing ABAP function module. Locks the function module, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing function modules without re-creating metadata. NOTE: the write persists (as the inactive version) even when the post-write syntax check fails, and those check errors can originate from pre-existing defects in sibling FMs of the same function group — re-read the FM before assuming your write was lost. For repairs spanning many FMs prefer the abapGit path.',
    inputSchema: {
      function_group_name: z
        .string()
        .describe('Function group name containing the function module (e.g., ZOK_FG_MCP01).'),
      function_module_name: z
        .string()
        .describe(
          'Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist.',
        ),
      source_code: z
        .string()
        .describe(
          'Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION.',
        ),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable function modules. For local objects ($TMP package) this can be omitted — the handler defaults to "local".',
        )
        .optional(),
      activate: z
        .boolean()
        .describe(
          'Activate function module after source update. Default: false. Set to true to activate immediately.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['function_module_name', 'function_group_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.function_module_name || args.function_module_name.length > MAX_NAME_LENGTH) {
      return functionErrorResult(
        'Function module name is required and must not exceed 30 characters',
      );
    }
    if (!args.function_group_name || args.function_group_name.length > MAX_NAME_LENGTH) {
      return functionErrorResult(
        'Function group name is required and must not exceed 30 characters',
      );
    }
    if (!args.source_code) {
      return functionErrorResult('Source code is required');
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    const functionModuleName = args.function_module_name.toUpperCase();
    const uri = functionModuleUri(functionGroupName, functionModuleName);
    const shouldActivate = args.activate === true;
    // 머리주석 1번 — 안 주면 'local'이고, 그 값이 그대로 URL에 붙는다.
    const effectiveTransport = args.transport_request ?? 'local';
    const sourceCode = args.source_code;

    logger.info(
      `Starting function module source update: ${functionModuleName} in ${functionGroupName}`,
    );

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];

      // 잠금 보유 구간을 stateful로 유지하는 것은 접속 계층의 `withLock`이
      // 소유한다 — 구 핸들러가 `setSessionType('stateful')`을 손으로 부르던
      // 자리이며, 그 사이가 stateless로 새면 잠금이 증발해 PUT이 423으로 죽는다.
      await client.withLock(uri, async (lock) => {
        await putSource(client, uri, lock.handle, sourceCode, effectiveTransport);
        // 검사는 **쓰기 뒤**다. 실패해도 쓰기는 비활성 버전으로 남아 있다.
        const check = await checkStoredWithoutAccept(client, uri);
        assertNoCheckErrors(check, 'Function module', functionModuleName);
        checkWarnings = [...check.warnings];
      });

      logger.info(`Function module source code updated: ${functionModuleName}`);

      if (shouldActivate) {
        const body = await activateOne(client, uri, functionModuleName, {
          contentType: CT_ACTIVATION,
        });
        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          // 구는 여기서 응답을 버리고 success:true를 돌려줬다(장부 D51).
          throw new SourceCheckFailure(
            `Activation failed: function module ${functionModuleName} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        logger.info(`Function module activated: ${functionModuleName}`);
      }

      return okResult({
        success: true,
        function_module_name: functionModuleName,
        function_group_name: functionGroupName,
        transport_request: effectiveTransport,
        activated: shouldActivate,
        message: `Function module ${functionModuleName} source code updated successfully${
          shouldActivate ? ' and activated' : ''
        }`,
        // 응답 키는 구 그대로다 — `activation_warnings`를 더하지 않는다.
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      // 구문검사·활성화 실패는 진단(줄번호 포함)을 그대로 올린다 —
      // 구 `error.isPreCheckFailure` 갈래와 같은 자리다.
      if (error instanceof SourceCheckFailure) {
        logger.error(
          `Error updating function module ${functionModuleName}: ${error.message}`,
        );
        return functionErrorResult(error.message);
      }

      const detail = describeFailure(error);
      logger.error(
        `Error updating function module source ${functionModuleName}: ${detail}`,
      );

      const status = statusOf(error);
      const reason =
        status === 404
          ? `Function module ${functionModuleName} not found in group ${functionGroupName}.`
          : status === 423
            ? `Function module ${functionModuleName} is locked by another user or lock handle is invalid.`
            : status === 400 && !args.transport_request
              ? `Update failed for ${functionModuleName}. The object may be assigned to a transport request. Pass transport_request explicitly.`
              : detail;
      return functionErrorResult(`Failed to update function module source: ${reason}`);
    }
  },
);
