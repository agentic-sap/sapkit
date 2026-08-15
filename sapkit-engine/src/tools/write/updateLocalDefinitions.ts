/**
 * UpdateLocalDefinitions — 클래스의 `definitions` 인클루드(private 섹션 구성요소가
 * 필요로 하는 타입 선언)를 갈아 끼운다.
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleUpdateLocalDefinitions.ts:55-174`.
 * 사슬(잠금→검사→PUT→해제)의 와이어 근거는 `classIncludeWrite.ts` 머리주석에
 * 파일·줄로 적어 두었다 — **주소는 형제들과 같고 인클루드 이름만 다르다**
 * (벤더 `.../core/class/includes.js:42-44`의 `updateClassDefinitions`가
 * 공용 `updateClassInclude`에 `'definitions'`를 넘긴다).
 *
 * 검사 요청이 실어 보내는 주어는 `Definitions`다 — 벤더
 * `.../core/class/check.js:124`가 `checkClassInclude(…, 'definitions', version,
 * 'Definitions')`로 부른다. 형제마다 이 글자가 다르므로(`Test class` ·
 * `Local types` · `Macros`) 하나로 접지 않는다.
 *
 * ## 의도적 차이 D121 — `activate_on_update:true`의 **거짓 성공**을 고쳤다
 *
 * **구 동작(실측)**: `AdtLocalDefinitions`는 부모 `AdtClass`를 상속하면서
 * `update()`를 **재정의**하는데, 그 본문
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalDefinitions.js:157-229`)
 * 이 `options`에서 읽는 것은 `lockHandle`과 `sourceCode`뿐이다 —
 * **`activateOnUpdate`를 한 번도 읽지 않는다.** 그런데 겉 핸들러는 그 플래그를
 * 넘긴 뒤(`handleUpdateLocalDefinitions.ts:87`) 응답에
 * `activated: activate_on_update`를 그대로 실었다(`:139`). 즉 **활성화 요청이 한
 * 건도 나가지 않은 채 "활성화됨"** 이라고 답했다.
 *
 * 우연한 누락이 아니라 실측이라는 근거는 **형제 재정의**다:
 * `AdtLocalTestClass.update()`(`AdtLocalTestClass.js:227-235`)에는 "Step 5:
 * Activating parent class"가 있다. 같은 패키지 안에서 한쪽에만 있다.
 *
 * **신 동작**: 요청받았으면 해제 뒤에 실제로 활성화하고, **활성화 응답 본문을
 * 판정한다** — SAP은 활성화 실패도 HTTP 200으로 답하며 `<chkl:msg type="E">`를
 * 담으므로, 보내기만 하고 안 읽으면 거짓 성공이 자리만 옮긴다. 선례는
 * D2(`UpdateLocalTypes`) · D41(`UpdateLocalTestClass`) — **같은 사슬의 같은 자리**다.
 *
 * - 사람용 장부: `harness/DIVERGENCES.md` D121 (짝인 `UpdateLocalMacros`는 D122 —
 *   같은 모양의 별개 항목이다. 한 도구 한 커밋이라 항목도 갈라 둔다)
 * - 대체 기대 시험: 이 도구 시험의 「D121」 절
 * - **기계 장부(`harness/replay/divergences.ts`) 미반영** — 이 묶음 과제는 그 파일이
 *   무접촉이다. 오케스트레이터가 묶음 병합 뒤에 옮긴다.
 *
 * ## 구를 그대로 둔 자리
 *
 * 갱신 뒤 클래스 구문검사가 오류를 내도 **갱신 성공은 성공이다.** 벤더
 * `checkClass`가 평범한 Error로 먼저 던지므로 구 핸들러의 `isPreCheckFailure`
 * 가지에는 닿지 않고 경고만 남는다(`handleUpdateLocalDefinitions.ts:119-131`).
 * 소스는 실제로 올라갔으므로 이 갈래는 거짓 성공이 아니다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 실패 문구의 세부는 구 `extractAdtErrorMessage` 대신 이 묶음의 `describeFailure`가
 * 만든다 — 엔진 자체 저작 진단 문구이며 장부 D13이 덮는 자리다. 404·423의 전용
 * 문구와 `Error: ` 접두사는 구 그대로다(`engine/src/lib/utils.ts`의 `return_error`).
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
  if (status === 404) return `Local definitions for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to update local definitions: ${describeFailure(error)}`;
}

export const updateLocalDefinitions = defineTool(
  {
    name: 'UpdateLocalDefinitions',
    description:
      'Update local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
      definitions_code: z.string().describe('Updated source code for local definitions.'),
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

    if (!args.class_name || !args.definitions_code) {
      return errorResult('Error: class_name and definitions_code are required');
    }

    const className = args.class_name.toUpperCase();
    const shouldActivate = args.activate_on_update === true;
    logger.info(`Updating local definitions for ${className}`);

    try {
      const client = await context.getConnection();

      await writeClassInclude(client, {
        className,
        includeType: 'definitions',
        source: args.definitions_code,
        subject: 'Definitions',
        transportRequest: args.transport_request,
      });
      logger.info(`UpdateLocalDefinitions completed successfully: ${className}`);

      // **D121** — 구는 여기서 아무것도 하지 않고 activated:true를 답했다.
      // 활성화는 해제 뒤다: 잠긴 채로 활성화하면 SAP이 거부한다.
      if (shouldActivate) {
        const body = await activateOne(client, classUri(className), className, {
          contentType: CT_ACTIVATION,
        });
        const failures = activationErrors(parseActivationMessages(body));
        // 보내기만 하고 안 읽으면 거짓 성공이 자리만 옮긴다.
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: class ${className} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The local definitions update is on SAP as an inactive version; the active version is unchanged.`,
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
        message: `Local definitions updated successfully in ${className}.`,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      logger.error(`Error updating local definitions for ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
