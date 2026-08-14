/**
 * UpdateView — 기존 뷰(DDLS)의 DDL 소스를 갈아 끼운다.
 *
 * 구 핸들러: `engine/src/handlers/view/high/handleUpdateView.ts`.
 * 와이어 근거는 `./internal/view.ts` 머리주석에 파일·줄로 모아 두었다.
 *
 * 시퀀스는 **잠금 → 쓰기 전 구문검사 → PUT → 해제 → 사후검사 → (활성화)**다.
 * 구 핸들러는 벤더의 `AdtView.update()` **전체 체인을 쓰지 않고** 저수준
 * `update(…, { lockHandle })`만 부르며 자기 손으로 이 순서를 짠다
 * (`handleUpdateView.ts:94-131`) — 그래서 벤더 체인의 long-polling 되읽기 두
 * 번(`AdtView.js`의 `update()` 3.5·6.5단계)은 **나가지 않는다.**
 *
 * 세 자리가 이 순서의 이유다:
 *  1. 검사가 **PUT 앞에** 있다 — 깨진 DDL은 서버에 닿지 않고 활성 버전은
 *     그대로 살아 있는다. 인라인 아티팩트 검사라 잠금도 PUT도 필요 없다.
 *  2. 잠금과 PUT 사이가 stateless로 새면 잠금이 증발해 PUT이 423으로 죽는다.
 *     접속 계층의 `withLock`이 보유 구간을 stateful로 유지하므로 여기서 세션
 *     타입을 다시 만지지 않는다(구는 `connection.setSessionType('stateful')`를
 *     손으로 넣어야 했다 — `handleUpdateView.ts:107`).
 *  3. 활성화 응답은 **오류를 담은 채 200으로 온다.** 아래 참조.
 *
 * ## 두 검사의 Accept가 다르다 (실측)
 *
 * 쓰기 **전** 검사는 `Accept: application/vnd.sap.adt.checkmessages+xml`을 싣고,
 * 쓰기 **뒤** 검사는 Accept를 싣지 않아 접속 계층 기본값으로 나간다. 구의 같은
 * 파일 안에서 갈리는 자리다 — 근거와 재현은 `./internal/view.ts`의
 * `checkStagedView` 주석에 있다.
 *
 * ## 사후검사 결과는 응답에 싣지 않는다
 *
 * 구는 사후검사를 try/catch로 감싸 경고만 남기고 결과를 버린다
 * (`handleUpdateView.ts:148-161`). 그래서 이 도구의 응답에는 `check_warnings`
 * 키가 **없다** — `UpdateProgram`과 갈리는 자리이며, 키를 더하면 응답 형태가
 * 구와 달라진다. 진짜 게이트는 쓰기 전 검사다.
 *
 * ## 활성화 거짓 성공을 고친다 (차이 — `harness/DIVERGENCES.md` D66)
 *
 * 구는 활성화 응답의 `<chkl:msg type="E">`를 **경고 목록에 담기만 하고**
 * `success: true`·`activated: true`로 답한다(`handleUpdateView.ts:184-213`).
 * 활성화되지 않은 것을 활성화됐다고 말하는 것이라 여기서는 실패로 되돌린다 —
 * 사전 등재 D2와 같은 계열이고, `UpdateProgram`이 이미 같은 판정을 하고 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  checkProposed,
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
  putSource,
} from './shared';
import { checkStagedView, viewWriteUri } from './internal/view';

export const updateView = defineTool(
  {
    name: 'UpdateView',
    description:
      'Update DDL source code of an existing CDS View or Classic View. Locks the view, checks new code, uploads new DDL source, unlocks, and optionally activates.',
    inputSchema: {
      view_name: z.string().describe('View name (e.g., ZOK_R_TEST_0002).'),
      ddl_source: z.string().describe('Complete DDL source code.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      activate: z.boolean().describe('Activate after update. Default: false.').optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/view/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['view_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.view_name || !args.ddl_source) {
      return errorResult('Missing required parameters: view_name and ddl_source');
    }

    const viewName = args.view_name.toUpperCase();
    const uri = viewWriteUri(viewName);
    const shouldActivate = args.activate === true;
    const ddlSource = args.ddl_source;
    logger.info(`Starting view source update: ${viewName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();

      await client.withLock(uri, async (lock) => {
        logger.debug(`Pre-write syntax check: ${viewName}`);
        const preCheck = await checkProposed(client, uri, `${uri}/source/main`, ddlSource);
        assertNoCheckErrors(preCheck, 'View', viewName);
        logger.debug(`Pre-write check passed: ${viewName}`);
        await putSource(client, uri, lock.handle, ddlSource, args.transport_request);
      });
      logger.info(`View DDL source updated: ${viewName}`);

      // 사후 인액티브 검사 — 최선 노력이고 결과는 응답에 실리지 않는다
      // (머리주석 참조). 쓰기 전 검사가 이미 업로드를 막았으므로 여기서
      // 실패했다고 쓰기를 되돌리지 않는다.
      logger.debug(`Post-write inactive check: ${viewName}`);
      try {
        await checkStagedView(client, uri);
        logger.debug(`Inactive version check completed: ${viewName}`);
      } catch (error) {
        logger.warn(
          `Inactive version check had issues: ${viewName} - ${describeFailure(error)}`,
        );
      }

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        logger.debug(`Activating view: ${viewName}`);
        let body: string;
        try {
          body = await activateOne(client, uri, viewName, { contentType: CT_ACTIVATION });
        } catch (error) {
          // 구가 조립하던 계약성 문구를 그대로 보존한다.
          throw new Error(`Activation failed: ${describeFailure(error)}`);
        }

        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          // D66 — 구는 여기서 success:true를 돌려줬다.
          throw new SourceCheckFailure(
            `Activation failed: view ${viewName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The DDL source is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map((entry) => `${entry.type}: ${entry.text || 'Unknown'}`);
        logger.info(`View activated: ${viewName}`);
      }

      return okResult({
        success: true,
        view_name: viewName,
        type: 'DDLS',
        activated: shouldActivate,
        message: `View ${viewName} updated${shouldActivate ? ' and activated' : ''} successfully`,
        uri,
        // 구는 이 목록을 **실제 진행과 무관하게 고정**으로 싣는다(사후검사가
        // 실패해도 `check_inactive`가 남는다). 그대로 옮긴다.
        steps_completed: [
          'lock',
          'check_new_code',
          'update',
          'unlock',
          'check_inactive',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating view ${viewName}: ${message}`);
      return errorResult(message);
    }
  },
);
