/**
 * `UpdateBehaviorDefinition` — BDEF 소스를 갈아 끼운다.
 *
 * 구 핸들러: `engine/src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`
 * (`high/`가 발행되는 쪽 — `low/`의 같은 이름은 `UpdateBehaviorDefinitionLow`라
 * 채록본에 없다).
 *
 * ## 순서 (구 실측 · `handleUpdateBehaviorDefinition.ts:76-152`)
 *
 * (잠금 →) PUT → 구문검사 → (해제 →) (활성화). **인터페이스·클래스와 달리
 * 쓰기 전 검사가 없다** — 구는 소스를 먼저 올리고 저장된 inactive 판을 검사한다.
 *
 * | 단계 | 요청 | 근거 (읽기 전용 참조) |
 * |---|---|---|
 * | LOCK | `POST {소문자 URI}?_action=LOCK&accessMode=MODIFY` · Accept `ACCEPT_LOCK` | `dist/core/behaviorDefinition/lock.js:28-53` |
 * | PUT | `PUT {소문자 URI}/source/main?lockHandle=…[&corrNr=…]` · CT `text/plain; charset=utf-8` · Accept `text/plain` | `.../update.js:45-66` |
 * | 검사 | `POST /sap/bc/adt/checkruns?reporters=abapCheckRun` · CT `…checkobjects+xml` · **Accept 없음** | `engine/src/lib/preCheckBeforeActivation.ts:278-287`·`503-533` |
 * | UNLOCK | `POST {소문자 URI}?_action=UNLOCK&lockHandle=…` | `.../unlock.js:28-34` |
 * | 활성화 | `POST /sap/bc/adt/activation?method=activate&preauditRequested=true` | `dist/utils/activationUtils.js:116-132` |
 *
 * ## `lock_handle`을 주면 **잠그지도 풀지도 않는다**
 *
 * 구는 인자로 받은 잠금 핸들이 있으면 `lockedByUs = false`가 되어 lock·unlock을
 * 통째로 건너뛴다(`:79-99`·`:123-135`). 벤더 쪽도 같다 — `options.lockHandle`이
 * 있으면 저수준 update만 부르는 갈래로 빠진다(`AdtBehaviorDefinition.js:255-272`).
 * 세션도 stateful로 올리지 않는다(그 자리는 스스로 잠갔을 때만이다).
 *
 * ## 구와 다른 것 — 차이 장부에 등재됨
 *
 * - **D100** — **활성화 응답을 읽는다.** 구는 `activate()`의 반환값을 버리고
 *   곧장 `success: true`를 만든다(`:139-152`). SAP은 활성화 실패도 HTTP 200 +
 *   `<chkl:msg type="E">`로 답하므로 그 갈래는 거짓 성공이다.
 * - **D101** — LOCK 요청에 구의 `asx:abap` 템플릿 본문을 싣지 않는다.
 *
 * ## 구와 다른 것 (**차이가 아니다**)
 *
 * 오류 문구의 조립기가 다르다 — 구는 `extractAdtErrorMessage`, 신은
 * `describeFailure`가 벽의 종류를 앞에 붙인다(차이 장부 **D13**). 나가는 요청은
 * 같다.
 *
 * ## 백틱 증식은 이 파일 밖이다 (백로그 13-12 · D-147 조사 — 장부 「관측 등재」)
 *
 * 주석 안 백틱이 왕복마다 배증한다는 관측(4→8 · 2026-07-31 피드백 ③ / 4→16 ·
 * 백로그 13-12 — `UpdateView`는 정상)을 이 판에서 좇았다. **쓰기 경로는 인자를
 * 한 글자도 바꾸지 않는다** — `source_code`가 `putSource`로 그대로 PUT 되고
 * (`shared.ts` · `text/plain; charset=utf-8`), 읽기 경로(`read/internal/behaviorRead.ts`)
 * 에도 이스케이프·치환이 없다. 그래서 우리 쪽 원인은 찾지 못했고 고칠 자리도 없다.
 * 대체 기대 시험(`__tests__/updateBehaviorDefinition.test.ts`의 「백틱 왕복」)이
 * PUT 본문이 입력과 바이트 동일함을 못 박는다 — 그 뒤에도 증식이 관측되면 SAP
 * 쪽(BDEF 소스 저장의 이스케이프)이다. **실기 미검증.**
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { bdefCheckUri, bdefObjectUri, rawCheckRun } from './behaviorUri';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
  putSource,
} from './shared';

export const updateBehaviorDefinition = defineTool(
  {
    name: 'UpdateBehaviorDefinition',
    description:
      'Update source code of an ABAP Behavior Definition (BDEF). Modifies RAP business object behavior: CRUD operations, validations, determinations, actions, and draft handling.',
    inputSchema: {
      name: z.string().describe('Behavior Definition name'),
      source_code: z.string().describe('New source code'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      lock_handle: z
        .string()
        .describe(
          'Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).',
        )
        .optional(),
      activate: z.boolean().describe('Activate after update. Default: true').optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.name || !args.source_code) {
      return errorResult('Error: Missing required parameters');
    }

    const name = args.name.toUpperCase();
    const objectUri = bdefObjectUri(name);
    const shouldActivate = args.activate !== false;
    const sourceCode = args.source_code;
    logger.info(`Starting BDEF update: ${name}`);

    /** PUT + 저장본 구문검사. 잠금 여부와 무관한 몸통이다. */
    const writeAndCheck = async (client: AdtClient, lockHandle: string): Promise<void> => {
      await putSource(client, objectUri, lockHandle, sourceCode, args.transport_request);
      const check = await rawCheckRun(client, bdefCheckUri(name), 'inactive');
      assertNoCheckErrors(check, 'Behavior Definition', name);
    };

    try {
      const client = await context.getConnection();

      if (args.lock_handle) {
        // 남이 잠근 것이다 — 잠그지도 풀지도 않는다.
        await writeAndCheck(client, args.lock_handle);
      } else {
        await client.withLock(objectUri, (lock) => writeAndCheck(client, lock.handle));
      }
      logger.info(`Behavior definition source updated: ${name}`);

      if (shouldActivate) {
        const body = await activateOne(client, objectUri, name, { contentType: CT_ACTIVATION });
        // D100 — 구는 이 본문을 읽지 않았다.
        const failures = activationErrors(parseActivationMessages(body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: behavior definition ${name} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        logger.info(`Behavior definition activated: ${name}`);
      }

      return okResult({
        success: true,
        name,
        message: shouldActivate
          ? `Behavior Definition ${name} updated and activated successfully`
          : `Behavior Definition ${name} updated successfully`,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating BDEF ${name}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
