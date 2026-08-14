/**
 * `UpdateBehaviorImplementation` — BIMP 클래스의 **본체와 구현 인클루드 둘 다**를
 * 갈아 끼운다.
 *
 * 구 핸들러: `engine/src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`
 * (`high/`가 발행되는 쪽). 사슬 본체는 벤더
 * `dist/core/behaviorImplementation/AdtBehaviorImplementation.js:213-347`에 있다.
 *
 * ## 순서 — 요청 여덟(활성화하면 아홉) (전부 실측)
 *
 * | # | 단계 | 요청 | 근거 |
 * |---|---|---|---|
 * | 1 | LOCK | `POST {소문자 URI}?_action=LOCK&accessMode=MODIFY` · Accept `ACCEPT_LOCK` | `core/class/lock.js:18-28` |
 * | 2 | 사전 검사 | `POST /sap/bc/adt/checkruns?reporters=abapCheckRun` · Accept `…checkmessages+xml` · 저장된 inactive 판 | `core/class/check.js:60-77` → `utils/checkRun.js:247-263` |
 * | 3 | PUT 본체 | `PUT {소문자 URI}/source/main?lockHandle=…[&corrNr=…]` · **`FOR BEHAVIOR OF` 껍데기** | `core/class/update.js:94-117` · 본문 문자열 `AdtBehaviorImplementation.js:278-284` |
 * | 4 | PUT 구현 | `PUT {소문자 URI}/includes/implementations?lockHandle=…[&corrNr=…]` | `core/behaviorImplementation/update.js:16-38` |
 * | 5 | 준비 대기 | `GET {대문자 URI}/source/main?version=active&withLongPolling=true` | `AdtBehaviorImplementation.js:295-305` |
 * | 6 | UNLOCK | `POST {소문자 URI}?_action=UNLOCK&lockHandle=…` | `core/class/unlock.js:17` |
 * | 7 | 사후 검사 | 2번과 같은 요청 | `AdtBehaviorImplementation.js:317-319` |
 * | 8 | 활성화 | `POST /sap/bc/adt/activation?method=activate&preauditRequested=true` | `core/class/activation.js:15-17` |
 * | 9 | 준비 대기 | 5번과 같은 요청 | `AdtBehaviorImplementation.js:330-340` |
 *
 * 활성화하지 않으면 8·9 대신 `GET {대문자 URI}/source/main` **하나**가 나간다 —
 * 질의 인자가 없는 판이다(`AdtBehaviorImplementation.js:344` — `version`을 넘기지
 * 않아 `?version=`이 붙지 않는다).
 *
 * **URI 대소문자가 단계마다 다르다.** 잠금·PUT·활성화는 소문자, **읽기만
 * 대문자**다. 표와 근거는 `./behaviorUri.ts` 머리주석에 있다. 베끼지 말고 그
 * 표를 볼 것 — 클래스 계열이라 해서 전부 소문자가 아니다.
 *
 * ## 본체 소스는 **호출자가 준 것이 아니다**
 *
 * 인자 `implementation_code`는 4번(구현 인클루드)에만 실린다. 3번의 본체는 벤더가
 * `class_name`·`behavior_definition`으로 **조립한 고정 껍데기**다. 그래서
 * `behavior_definition`은 이 도구에서 실제로 와이어에 나간다 — 짝인
 * `CreateBehaviorImplementation`에서는 나가지 않는다(그쪽 머리주석 참조).
 *
 * ## 구와 다른 것 — 차이 장부에 등재됨
 *
 * - **D100** — **활성화 실패를 성공으로 접지 않는다.** 구는 활성화 응답의
 *   `<chkl:msg>`를 전부 `activation_warnings`로 옮기고 **`type="E"`가 섞여
 *   있어도** `success: true` · `activated: true`로 답한다
 *   (`handleUpdateBehaviorImplementation.ts:120-172`). SAP은 활성화 실패도 HTTP
 *   200으로 답하므로 이 갈래가 곧 거짓 성공이다. `E`가 아닌 메시지는 구대로
 *   `activation_warnings`에 실린다.
 * - **D101** — LOCK 요청 본문. BDEF 쪽과 같은 항목이며 클래스 잠금은 원래
 *   본문이 `null`이라(`core/class/lock.js:27`) **이 도구에는 영향이 없다.**
 *
 * ## 구와 다른 것 (**차이가 아니다**)
 *
 * 구는 잠금 직후 `connection.setSessionType('stateful')`을 손으로 다시 세운다
 * (`AdtBehaviorImplementation.js:262`) — 벤더 `lock()`이 반환하며 stateless로
 * 되돌리기 때문이다. 신 접속 계층은 잠금을 들고 있는 동안 stateful을 유지하므로
 * 그 손질이 필요 없다. 나가는 요청의 헤더는 같다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  bimpCheckUri,
  bimpImplementationsPath,
  bimpObjectUri,
  bimpReadUri,
  vendorCheckErrors,
  vendorCheckFailed,
} from './behaviorUri';
import {
  ACCEPT_SOURCE,
  CT_ACTIVATION,
  CT_SOURCE,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  checkStored,
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
  putSource,
} from './shared';

/** `AdtBehaviorImplementation.js:278-284`의 껍데기. 빈 줄 배치까지 그대로다. */
export function buildBehaviorMainSource(className: string, behaviorDefinition: string): string {
  return (
    `CLASS ${className} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ${behaviorDefinition}.\n` +
    `\nENDCLASS.\n` +
    `\nCLASS ${className} IMPLEMENTATION.\n` +
    `\nENDCLASS.`
  );
}

/**
 * 벤더 `checkClass`가 오류에서 던지는 문구 그대로
 * (`core/class/check.js:73-76`) — 줄번호를 담지 않고 `'; '`로 잇는다.
 */
async function assertClassCheck(client: AdtClient, className: string): Promise<void> {
  const result = await checkStored(client, bimpCheckUri(className), 'inactive');
  if (!vendorCheckFailed(result)) return;
  const texts = vendorCheckErrors(result)
    .map((entry) => entry.text)
    .join('; ');
  throw new Error(`Class check failed: ${texts}`);
}

/** 5·9번의 준비 대기 읽기. 실패는 경고로 접는다(구도 그렇다). */
async function waitReady(
  client: AdtClient,
  context: ToolContext,
  className: string,
): Promise<void> {
  try {
    await client.request({
      method: 'GET',
      path: `${bimpReadUri(className)}/source/main`,
      params: { version: 'active', withLongPolling: 'true' },
      accept: ACCEPT_SOURCE,
      timeout: 'default',
    });
  } catch (error) {
    context.logger.warn(
      `read with long polling failed (object may not be ready yet): ${describeFailure(error)}`,
    );
  }
}

export const updateBehaviorImplementation = defineTool(
  {
    name: 'UpdateBehaviorImplementation',
    description:
      'Update source code of an existing ABAP behavior implementation class. Updates both main source (with FOR BEHAVIOR OF clause) and implementations include. Uses stateful session with proper lock/unlock mechanism.',
    inputSchema: {
      class_name: z
        .string()
        .describe(
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system.',
        ),
      behavior_definition: z
        .string()
        .describe(
          'Behavior Definition name (e.g., ZI_MY_ENTITY). Must match the behavior definition used when creating the class.',
        ),
      implementation_code: z
        .string()
        .describe(
          'Implementation code for the implementations include. Contains the actual behavior implementation methods.',
        ),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
        )
        .optional(),
      activate: z
        .boolean()
        .describe('Activate behavior implementation after update. Default: true.')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name', 'behavior_definition'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    // 구는 세 인자를 한 문장으로 거른다(`:85-91`).
    if (!args.class_name || !args.behavior_definition || !args.implementation_code) {
      return errorResult(
        'Error: class_name, behavior_definition, and implementation_code are required',
      );
    }

    const className = args.class_name.toUpperCase();
    const behaviorDefinition = args.behavior_definition.toUpperCase();
    const objectUri = bimpObjectUri(className);
    const shouldActivate = args.activate !== false;
    logger.info(
      `Starting behavior implementation source update: ${className} for ${behaviorDefinition}`,
    );

    try {
      const client = await context.getConnection();

      await client.withLock(objectUri, async (lock) => {
        // 2 — 구현 인클루드 코드는 여기에 싣지 않는다. 전체 클래스 코드가
        // 아니어서 그대로 검사하면 거짓 실패가 난다(벤더 주석 `:265-267`).
        await assertClassCheck(client, className);

        // 3 — 본체는 벤더가 조립한 `FOR BEHAVIOR OF` 껍데기다.
        await putSource(
          client,
          objectUri,
          lock.handle,
          buildBehaviorMainSource(className, behaviorDefinition),
          args.transport_request,
        );

        // 4 — 호출자의 코드가 실리는 유일한 자리.
        await client.request({
          method: 'PUT',
          path: bimpImplementationsPath(className),
          params: { lockHandle: lock.handle, corrNr: args.transport_request },
          body: args.implementation_code,
          contentType: CT_SOURCE,
          accept: ACCEPT_SOURCE,
        });

        // 5
        await waitReady(client, context, className);
      });
      logger.info(`Behavior implementation implementations include updated: ${className}`);

      // 7
      await assertClassCheck(client, className);

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        // 8
        const body = await activateOne(client, objectUri, className, {
          contentType: CT_ACTIVATION,
        });
        // 구는 본문에 `<chkl:messages`가 들어 있을 때만 파싱한다(`:122-141`).
        const messages = body.includes('<chkl:messages') ? parseActivationMessages(body) : [];
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          // D100 — 구는 여기서 성공으로 답했다.
          throw new SourceCheckFailure(
            `Activation failed: behavior implementation ${className} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map((entry) => `${entry.type}: ${entry.text || 'Unknown'}`);
        logger.info(`Behavior implementation class activated: ${className}`);

        // 9
        await waitReady(client, context, className);
      } else {
        // 활성화하지 않는 갈래의 마지막 읽기 — **질의 인자가 없다.** 구는 이
        // 읽기를 감싸지 않으므로 실패하면 그대로 오류가 된다.
        await client.request({
          method: 'GET',
          path: `${bimpReadUri(className)}/source/main`,
          accept: ACCEPT_SOURCE,
          timeout: 'default',
        });
      }

      const stepsCompleted = [
        'lock',
        'update_main_source',
        'update_implementations',
        'check',
        'unlock',
      ];
      if (shouldActivate) stepsCompleted.push('activate');

      logger.info(`UpdateBehaviorImplementation completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        behavior_definition: behaviorDefinition,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Behavior Implementation ${className} updated and activated successfully`
          : `Behavior Implementation ${className} updated successfully (not activated)`,
        uri: objectUri,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(
        `Error updating behavior implementation source ${className}: ${message}`,
      );
      return errorResult(`Error: Failed to update behavior implementation: ${message}`);
    }
  },
);
