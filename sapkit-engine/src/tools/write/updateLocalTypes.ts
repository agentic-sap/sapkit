/**
 * UpdateLocalTypes — 클래스의 로컬 타입(=`implementations` 인클루드)을 갈아
 * 끼운다.
 *
 * 이름과 자원이 어긋난다(도구 이름은 "local types", ADT 자원은
 * `includes/implementations`). 근거는 읽기 짝
 * `../read/getLocalTypes.ts` 머리주석에 적어 두었다. 사슬(잠금→검사→PUT→해제)의
 * 와이어 근거는 `classIncludeWrite.ts` 머리주석.
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleUpdateLocalTypes.ts:55-166`.
 *
 * ## 의도적 차이 D2 — `activate_on_update:true`의 **거짓 성공**을 고쳤다
 *
 * 이 판의 사전 등재 3건 중 하나이고, "이 도구를 짓는 마일스톤에서 휴면을
 * 활성으로 바꾸고 대체 기대 시험을 저작한다"는 조건이 붙어 있었다.
 *
 * **구 동작(실측)**: `AdtLocalTypes`는 부모 `AdtClass`를 상속하면서 `update()`를
 * **재정의**하는데, 그 본문
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalTypes.js:156-227`)
 * 이 `options`에서 읽는 것은 `lockHandle`과 `sourceCode`뿐이다 —
 * **`activateOnUpdate`를 한 번도 읽지 않는다.** 부모
 * `AdtClass.update()`(`AdtClass.js:253-377`)에는 6단계 활성화가 있지만 재정의가
 * 그것을 가린다. 그런데 겉 핸들러는 그 플래그를 넘긴 뒤
 * (`handleUpdateLocalTypes.ts:87`) 응답에 `activated: activate_on_update`를
 * 그대로 실었다(`:132`). 즉 **활성화 요청이 한 건도 나가지 않은 채 "활성화됨"**
 * 이라고 답했다.
 *
 * 이것이 우연한 누락이 아니라 실측이라는 근거는 **형제 재정의**다:
 * `AdtLocalTestClass.update()`(`AdtLocalTestClass.js:227-235`)에는 "Step 5:
 * Activating parent class"가 있다. 같은 패키지 안에서 한쪽에만 있다.
 *
 * **신 동작**: 요청받았으면 해제 뒤에 실제로 활성화하고, **활성화 응답 본문을
 * 판정한다** — SAP은 활성화 실패도 HTTP 200으로 답하며 `<chkl:msg type="E">`를
 * 담으므로, 보내기만 하고 안 읽으면 거짓 성공이 자리만 옮긴다.
 *
 * - 사람용 장부: `harness/DIVERGENCES.md` M1 사전 등재 표 D2
 * - 기계 장부: `harness/replay/divergences.ts` D2 (이 마일스톤에서 **활성**으로 바꿨다)
 * - 대체 기대 시험: `src/tools/write/__tests__/updateLocalTypes.test.ts`의 「D2」 절
 *
 * ## 구를 그대로 둔 자리
 *
 * 갱신 뒤 클래스 구문검사가 오류를 내도 **갱신 성공은 성공이다.** 벤더
 * `checkClass`가 먼저 던지므로 구 핸들러의 `isPreCheckFailure` 가지에는 닿지
 * 않고 경고만 남는다(`handleUpdateLocalTypes.ts:112-124`). 소스는 실제로
 * 올라갔으므로 이 갈래는 거짓 성공이 아니다.
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
  if (status === 404) return `Local types for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  return `Failed to update local types: ${describeFailure(error)}`;
}

export const updateLocalTypes = defineTool(
  {
    name: 'UpdateLocalTypes',
    description:
      'Update local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
      local_types_code: z.string().describe('Updated source code for local types.'),
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

    if (!args.class_name || !args.local_types_code) {
      return errorResult('class_name and local_types_code are required');
    }

    const className = args.class_name.toUpperCase();
    const shouldActivate = args.activate_on_update === true;
    logger.info(`Updating local types for ${className}`);

    try {
      const client = await context.getConnection();

      await writeClassInclude(client, {
        className,
        includeType: 'implementations',
        source: args.local_types_code,
        subject: 'Local types',
        transportRequest: args.transport_request,
      });
      logger.info(`UpdateLocalTypes completed successfully: ${className}`);

      // **D2** — 구는 여기서 아무것도 하지 않고 activated:true를 답했다.
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
              .join(' | ')}. The local types update is on SAP as an inactive version; the active version is unchanged.`,
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
        message: `Local types updated successfully in ${className}.`,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      logger.error(`Error updating local types for ${className}: ${message}`);
      return errorResult(message);
    }
  },
);
