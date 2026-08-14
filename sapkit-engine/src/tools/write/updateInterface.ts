/**
 * UpdateInterface — 기존 인터페이스의 소스를 갈아 끼운다.
 *
 * 구 핸들러: `engine/src/handlers/interface/high/handleUpdateInterface.ts`.
 * 순서는 잠금 → 쓰기 전 구문검사 → PUT → 해제 → 사후검사 → (활성화)이고,
 * 그 여섯 단계가 응답의 `steps_completed`에 그대로 적힌다.
 *
 * ## 와이어 근거 (읽기 전용 참조 — `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist`)
 *
 * | 단계 | 요청 | 근거 |
 * |---|---|---|
 * | LOCK | `POST {소문자 URI}?_action=LOCK&accessMode=MODIFY` · Accept `ACCEPT_LOCK` · 본문 `null` | `core/interface/lock.js:16-25` |
 * | 사전검사 | `POST /sap/bc/adt/checkruns?reporters=abapCheckRun` · CT `…checkobjects+xml` · Accept `…checkmessages+xml` · 제안 소스를 base64 artifact로 | `engine/src/lib/preCheckBeforeActivation.ts:222-232`·`451-490` |
 * | PUT | `PUT {대문자 URI}/source/main?lockHandle=…[&corrNr=…]` · CT `text/plain; charset=utf-8` · Accept `text/plain` | `core/interface/update.js:15-28` |
 * | UNLOCK | `POST {대문자 URI}?_action=UNLOCK&lockHandle=…` | `core/interface/unlock.js:14-23` |
 * | 사후검사 | `POST /sap/bc/adt/checkruns?reporters=abapCheckRun` · 저장본 URI + `version="inactive"` | `utils/checkRun.js:20-26`·`247-263` |
 * | 활성화 | `POST /sap/bc/adt/activation?method=activate&preauditRequested=true` · CT `…activation+xml` · Accept `application/xml` | `utils/activationUtils.js:114-132` |
 *
 * **URI 대소문자가 단계마다 다르다** — 클래스 계열은 전부 소문자인데 인터페이스만
 * PUT·UNLOCK이 갈라진다. 표와 근거는 `./interfaceUri.ts` 머리주석에 있다.
 * 소스 인자에 `sourceArtifactContentType`이 없는 것도 실측이다:
 * `AdtClient.getInterface()`는 `contentTypes`를 넘기지 않으므로
 * (`clients/AdtClient.js:91-93`) `update.js:20`이 `CT_SOURCE`로 떨어진다.
 *
 * ## 구와 다른 것 — 차이 장부에 등재됨
 *
 * - **D72 — UNLOCK을 잠금과 같은 URI로 보낸다.** 구는 LOCK을 소문자,
 *   UNLOCK을 대문자 URI로 보냈다. 신 엔진에서 잠금 수명주기는 접속 계층이
 *   소유하고(`client.withLock`) 실패 경로의 해제까지 보장하는데, 그 계약은
 *   **잠근 자리와 푸는 자리가 같은 문자열**이라야 성립한다.
 * - **D73 — 활성화 실패를 성공으로 접지 않는다.** 구는 활성화 응답의
 *   `<chkl:msg type="E">`를 `activation_warnings`에 담고도
 *   `success: true, activated: true`로 답한다(`handleUpdateInterface.ts:236-281`).
 *   SAP은 활성화 실패도 HTTP 200으로 답하므로 이것이 곧 거짓 성공이다.
 *
 * ## 구와 다른 것 (**차이가 아니다**)
 *
 * 구는 잠금 직후 `connection.setSessionType('stateful')`을 손으로 다시 세운다
 * (`handleUpdateInterface.ts:145`) — 벤더 `lock()`이 반환하며 stateless로
 * 되돌리기 때문이다(`core/interface/AdtInterface.js:424-427`). 신 접속 계층은
 * 잠금을 들고 있는 동안 stateful을 유지하므로 그 손질이 필요 없다. 나가는
 * 요청의 헤더는 같다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext, ToolResult } from '../../server/toolDefinition';
import { interfaceObjectUri, interfaceRawUri, interfaceStoredCheckUri } from './interfaceUri';
import {
  CT_ACTIVATION,
  type CheckMessage,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  checkProposed,
  checkStored,
  describeFailure,
  errorResult,
  parseActivationMessages,
  putSource,
} from './shared';

/**
 * 구는 이 도구의 성공 응답만 **들여쓰기 없이** 싣는다
 * (`handleUpdateInterface.ts:271-283` — 같은 파일의 다른 도구들과 달리
 * `JSON.stringify`에 `null, 2`가 없다). 소비자는 어차피 파싱하지만, 응답 본문을
 * 글자로 견주는 재생 대조에서는 공백도 값이라 그대로 옮긴다.
 */
function compactResult(payload: unknown): ToolResult {
  return { isError: false, content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

export const updateInterface = defineTool(
  {
    name: 'UpdateInterface',
    description:
      'Update source code of an existing ABAP interface. Uses stateful session with proper lock/unlock mechanism. Lock handle and transport number are passed in URL parameters.',
    inputSchema: {
      interface_name: z
        .string()
        .describe('Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system.'),
      source_code: z
        .string()
        .describe('Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
        )
        .optional(),
      activate: z.boolean().describe('Activate interface after update. Default: true.').optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['interface_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.interface_name || !args.source_code) {
      return errorResult('Error: interface_name and source_code are required');
    }

    const interfaceName = args.interface_name.toUpperCase();
    const objectUri = interfaceObjectUri(interfaceName);
    // 활성화는 인자를 주지 않으면 **켜진다** — 구 `activate !== false`.
    const shouldActivate = args.activate !== false;
    const sourceCode = args.source_code;
    logger.info(`Starting interface source update: ${interfaceName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];

      await client.withLock(objectUri, async (lock) => {
        const preCheck = await checkProposed(
          client,
          objectUri,
          `${objectUri}/source/main`,
          sourceCode,
        );
        assertNoCheckErrors(preCheck, 'Interface', interfaceName);
        checkWarnings = [...preCheck.warnings];
        // PUT만 대문자 URI다 — `./interfaceUri.ts`의 표 참조.
        await putSource(
          client,
          interfaceRawUri(interfaceName),
          lock.handle,
          sourceCode,
          args.transport_request,
        );
      });
      logger.info(`Interface source code updated: ${interfaceName}`);

      // 사후검사는 치명적이지 않다. 구에서는 벤더 `checkInterface`가 오류를
      // 만나면 **던지고**(`core/interface/check.js:11-18`) 핸들러가 그것을
      // `warn`으로 삼키므로(`handleUpdateInterface.ts:214-222`), 오류가 있는
      // 사후검사의 경고는 응답에 실리지 않는다. 그 갈래를 그대로 옮긴다.
      try {
        const postCheck = await checkStored(
          client,
          interfaceStoredCheckUri(interfaceName),
          'inactive',
        );
        if (postCheck.errors.length > 0) {
          logger.warn(
            `Inactive version check had issues: ${interfaceName} | ${postCheck.errors
              .map((entry) => entry.text)
              .join('; ')}`,
          );
        } else if (postCheck.warnings.length > 0) {
          checkWarnings = [...checkWarnings, ...postCheck.warnings];
        }
        logger.info(`Inactive version check completed: ${interfaceName}`);
      } catch (error) {
        logger.warn(
          `Inactive version check had issues: ${interfaceName} | ${describeFailure(error)}`,
        );
      }

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        const body = await activateOne(client, objectUri, interfaceName, {
          contentType: CT_ACTIVATION,
        });
        // 구는 본문에 `<chkl:messages`가 들어 있을 때만 파싱한다
        // (`handleUpdateInterface.ts:234-239`).
        const messages = body.includes('<chkl:messages') ? parseActivationMessages(body) : [];
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          // D73 — 구는 여기서 성공으로 답했다. SAP은 활성화 실패도 200으로
          // 돌려주므로 상태 코드만 믿으면 깨진 인터페이스가 「활성화됨」이 된다.
          throw new SourceCheckFailure(
            `Activation failed: interface ${interfaceName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map(
          (entry) => `${entry.type}: ${entry.text || 'Unknown'}`,
        );
        logger.info(`Interface activated: ${interfaceName}`);
      }

      const stepsCompleted = ['lock', 'check_new_code', 'update', 'unlock', 'check_inactive'];
      if (shouldActivate) stepsCompleted.push('activate');

      return compactResult({
        success: true,
        interface_name: interfaceName,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        message: `Interface ${interfaceName} updated successfully${
          shouldActivate ? ' and activated' : ''
        }`,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
        steps_completed: stepsCompleted,
      });
    } catch (error) {
      // 구문검사·활성화가 찾아낸 오류는 진단(줄번호 포함)을 그대로 올린다 —
      // 구의 `isPreCheckFailure` 갈래(`handleUpdateInterface.ts:287-292`).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error updating interface ${interfaceName}: ${error.message}`);
        return errorResult(`Error: ${error.message}`);
      }
      const message = describeFailure(error);
      logger.error(`Error updating interface source ${interfaceName}: ${message}`);
      return errorResult(`Error: Failed to update interface: ${message}`);
    }
  },
);
