/**
 * UpdateLocalMacros — 클래스의 `macros` 인클루드(구현부에서 쓰는 매크로 정의)를
 * 갈아 끼운다.
 *
 * 발행 설명이 미리 말하듯 매크로는 **옛 ABAP 판에만 있는 기능**이다. 그래도
 * 도구 표면에 있으므로 구가 보내던 요청을 그대로 되살린다.
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleUpdateLocalMacros.ts:55-164`.
 * 사슬(잠금→검사→PUT→해제)의 와이어 근거는 `classIncludeWrite.ts` 머리주석에
 * 파일·줄로 적어 두었다 — **주소는 형제들과 같고 인클루드 이름만 다르다**
 * (벤더 `.../core/class/includes.js:59-61`의 `updateClassMacros`가 공용
 * `updateClassInclude`에 `'macros'`를 넘긴다).
 *
 * 검사 요청이 실어 보내는 주어는 `Macros`다 — 벤더
 * `.../core/class/check.js:140`이 `checkClassInclude(…, 'macros', version, 'Macros')`로
 * 부른다. 형제마다 이 글자가 다르므로(`Test class` · `Local types` · `Definitions`)
 * 하나로 접지 않는다.
 *
 * ## 의도적 차이 D122 — `activate_on_update:true`의 **거짓 성공**을 고쳤다
 *
 * **구 동작(실측)**: `AdtLocalMacros.update()`
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalMacros.js:158-230`)
 * 가 `options`에서 읽는 것은 `lockHandle`과 `sourceCode`뿐이다 —
 * **`activateOnUpdate`를 한 번도 읽지 않는다.** 그런데 겉 핸들러는 그 플래그를
 * 넘긴 뒤(`handleUpdateLocalMacros.ts:85`) 응답에 `activated: activate_on_update`를
 * 그대로 실었다(`:130`). 짝인 `UpdateLocalDefinitions`와 **같은 모양**이며(D121),
 * 근거도 같다: 형제 `AdtLocalTestClass.update()`(`AdtLocalTestClass.js:227-235`)에만
 * 활성화 단계가 있다.
 *
 * **신 동작**: 요청받았으면 해제 뒤에 실제로 활성화하고, **활성화 응답 본문을
 * 판정한다.** 선례는 D2(`UpdateLocalTypes`) · D41(`UpdateLocalTestClass`) ·
 * D121(`UpdateLocalDefinitions`).
 *
 * - 사람용 장부: `harness/DIVERGENCES.md` D122
 * - 대체 기대 시험: 이 도구 시험의 「D122」 절
 * - **기계 장부(`harness/replay/divergences.ts`) 미반영** — 이 묶음 과제는 그 파일이
 *   무접촉이다. 오케스트레이터가 묶음 병합 뒤에 옮긴다.
 *
 * ## 구를 그대로 둔 자리
 *
 * 갱신 뒤 클래스 구문검사가 오류를 내도 **갱신 성공은 성공이다.** 벤더
 * `checkClass`가 평범한 Error로 먼저 던지므로 구 핸들러의 `isPreCheckFailure`
 * 가지에는 닿지 않고 경고만 남는다(`handleUpdateLocalMacros.ts:110-122`).
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 실패 문구의 세부는 구 `extractAdtErrorMessage` 대신 `describeFailure`가 만든다 —
 * 엔진 자체 저작 진단 문구이며 장부 D13이 덮는 자리다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { classCheckUri, writeClassInclude } from './classIncludeWrite';
import {
  CT_ACTIVATION,
  type CheckMessage,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  checkStored,
  classUri,
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
} from './shared';

function failureMessage(error: unknown, className: string): string {
  if (error instanceof SourceCheckFailure) return error.message;
  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `Local macros for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to update local macros: ${describeFailure(error)}`;
}

export const updateLocalMacros = defineTool(
  {
    name: 'UpdateLocalMacros',
    description:
      'Update local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
      macros_code: z.string().describe('Updated source code for local macros.'),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate_on_update: z
        .boolean()
        .describe('Activate parent class after updating. Default: false')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.class_name || !args.macros_code) {
      return errorResult('Error: class_name and macros_code are required');
    }

    const className = args.class_name.toUpperCase();
    const shouldActivate = args.activate_on_update === true;
    logger.info(`Updating local macros for ${className}`);

    try {
      const client = await context.getConnection();

      await writeClassInclude(client, {
        className,
        includeType: 'macros',
        source: args.macros_code,
        subject: 'Macros',
        transportRequest: args.transport_request,
      });
      logger.info(`UpdateLocalMacros completed successfully: ${className}`);

      // **D122** — 구는 여기서 아무것도 하지 않고 activated:true를 답했다.
      // 활성화는 해제 뒤다: 잠긴 채로 활성화하면 SAP이 거부한다.
      if (shouldActivate) {
        const body = await activateOne(client, classUri(className), className, {
          contentType: CT_ACTIVATION,
        });
        const failures = activationErrors(parseActivationMessages(body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: class ${className} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The local macros update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        logger.info(`Parent class activated: ${className}`);
      }

      // 갱신 뒤 클래스 구문검사. 오류가 나와도 갱신 성공을 뒤집지 않는다(머리주석).
      let checkWarnings: CheckMessage[] = [];
      try {
        const check = await checkStored(client, classCheckUri(className), 'inactive');
        if (check.errors.length > 0) {
          throw new Error(`Class check failed: ${check.errors.map((e) => e.text).join('; ')}`);
        }
        checkWarnings = [...check.warnings];
      } catch (error) {
        logger.warn(`Post-update check had issues for ${className}: ${describeFailure(error)}`);
      }

      return okResult({
        success: true,
        class_name: className,
        transport_request: args.transport_request || null,
        activated: shouldActivate,
        message: `Local macros updated successfully in ${className}.`,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      logger.error(`Error updating local macros for ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
