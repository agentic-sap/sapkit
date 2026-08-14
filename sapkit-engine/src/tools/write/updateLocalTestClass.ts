/**
 * UpdateLocalTestClass — 클래스의 `testclasses` 인클루드(ABAP Unit 로컬 테스트
 * 클래스)를 갈아 끼운다.
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleUpdateLocalTestClass.ts:65-185`.
 * 사슬(잠금→검사→PUT→해제)의 와이어 근거는 `classIncludeWrite.ts` 머리주석에
 * 파일·줄로 적어 두었다.
 *
 * ## 의도적 차이 D41 — 활성화 실패를 성공으로 접지 않는다
 *
 * 구는 `activate_on_update:true`에서 활성화 요청을 **보내기는 했다**
 * (`…/dist/core/class/AdtLocalTestClass.js:227-235`). 그런데 그 **응답 본문을
 * 읽지 않았다** — `activateObjectInSession`은 응답을 그대로 돌려주고
 * (`dist/utils/activationUtils.js:116-133`), `AdtClass.activate()`는 HTTP 4xx
 * 에서만 던진다(`AdtClass.js:436-468`). **SAP은 활성화 실패도 HTTP 200으로
 * 답하며 `<chkl:msg type="E">`를 담는다.** 그래서 깨진 테스트 클래스가
 * `activated:true`로 보고됐다 — 이 레포에 CLAS 거짓 성공 실증 이력이 있는 바로
 * 그 모양이다.
 *
 * 신 엔진은 본문을 읽고 실패로 되돌린다. 이미 지어진 `UpdateClass`가 같은
 * 자리를 같은 방식으로 고쳤으므로, 여기서 구를 재현하면 **같은 엔진 안에서 두
 * 도구가 같은 실패에 다르게 답하게** 된다.
 *
 * - 사람용 장부: `harness/DIVERGENCES.md` D41
 * - 대체 기대 시험: `src/tools/write/__tests__/updateLocalTestClass.test.ts`의
 *   「D41」 절
 * - **기계 장부(`harness/replay/divergences.ts`) 미반영** — 이 묶음 과제는 그
 *   파일을 D2 활성화 말고는 건드리지 않기로 걸려 있다. 오케스트레이터가 묶음
 *   병합 뒤에 옮긴다.
 *
 * ## 구를 그대로 둔 자리
 *
 * 갱신 뒤 클래스 구문검사가 오류를 내도 **갱신 성공은 성공이다.** 벤더
 * `checkClass`가 먼저 던지므로 구 핸들러의 `isPreCheckFailure` 가지에는 닿지
 * 않고 경고만 남는다(`handleUpdateLocalTestClass.ts:129-141`). 소스는 실제로
 * 올라갔으므로 이 갈래는 거짓 성공이 아니다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { writeClassInclude } from './classIncludeWrite';
import { classCheckUri } from './classIncludeWrite';
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
  if (status === 404) return `Local test class for ${className} not found.`;
  if (status === 423) return `Class ${className} is locked by another user.`;
  if (status === 400) return `Bad request. ${describeFailure(error)}`;
  return `Failed to update local test class: ${describeFailure(error)}`;
}

export const updateLocalTestClass = defineTool(
  {
    name: 'UpdateLocalTestClass',
    description:
      'Update a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.',
    inputSchema: {
      class_name: z.string().describe('Parent class name (e.g., ZCL_MY_CLASS).'),
      test_class_code: z.string().describe('Updated source code for the local test class.'),
      transport_request: z
        .string()
        .describe('Transport request number (required for transportable objects).')
        .optional(),
      activate_on_update: z
        .boolean()
        .describe('Activate parent class after updating test class. Default: false')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.class_name) return errorResult('class_name is required');
    if (!args.test_class_code) return errorResult('test_class_code is required');

    const className = args.class_name.toUpperCase();
    const shouldActivate = args.activate_on_update === true;
    logger.info(`Updating local test class for ${className}`);

    try {
      const client = await context.getConnection();

      await writeClassInclude(client, {
        className,
        includeType: 'testclasses',
        source: args.test_class_code,
        subject: 'Test class',
        transportRequest: args.transport_request,
      });
      logger.info(`UpdateLocalTestClass completed successfully: ${className}`);

      // 활성화는 **해제 뒤**다 — 잠긴 채로 활성화하면 SAP이 거부한다.
      if (shouldActivate) {
        const body = await activateOne(client, classUri(className), className, {
          contentType: CT_ACTIVATION,
        });
        const failures = activationErrors(parseActivationMessages(body));
        // D41 — 200으로 돌아온 실패를 여기서 잡는다.
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: class ${className} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The test class update is on SAP as an inactive version; the active version is unchanged.`,
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
        message: `Local test class updated successfully in ${className}.`,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = failureMessage(error, className);
      logger.error(`Error updating local test class for ${className}: ${message}`);
      return errorResult(message);
    }
  },
);
