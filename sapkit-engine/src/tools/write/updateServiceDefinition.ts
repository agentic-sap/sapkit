/**
 * `UpdateServiceDefinition` — 기존 서비스 정의(SRVD)의 소스를 갈아 끼운다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `UpdateServiceDefinition` · 구 소스
 * `engine/src/handlers/service_definition/high/handleUpdateServiceDefinition.ts:23-52`).
 * 몸통의 대조 원본은 같은 파일 `:67-251`. 와이어 근거는
 * `./internal/serviceDefinition` 머리주석에 파일·줄로 모아 두었다.
 *
 * 시퀀스는 **잠금 → PUT → 쓰기 뒤 구문검사 → 해제 → (활성화)**다.
 *
 * 세 자리가 이 순서의 이유다:
 *  1. **검사가 PUT 뒤에 있다.** 구는 벤더의 `AdtServiceDefinition.update()` 전체
 *     체인을 쓰지 않고 저수준 `update(…, { lockHandle })`만 부른 뒤 엔진 자신의
 *     `runSyntaxCheck({ kind: 'serviceDefinition' })`를 돌린다
 *     (`handleUpdateServiceDefinition.ts:123-142`). 그 검사는 **소스를 실어 보내는
 *     인라인 검사가 아니라 서버에 올라간 인액티브 판을 그대로 컴파일**하므로
 *     PUT 앞에 놓을 수가 없다. `UpdateView`가 쓰기 **전** 검사를 갖는 것과 갈리는
 *     자리이며, 여기서 인라인 검사를 새로 넣으면 그것이 구와의 차이가 된다.
 *  2. 잠금과 PUT 사이가 stateless로 새면 잠금이 증발해 PUT이 423으로 죽는다. 구는
 *     `connection.setSessionType('stateful')`을 손으로 다시 걸어 막았고
 *     (`:120` — 그 자리에 IDES 병리 주석이 그대로 있다), 여기서는 접속 계층의
 *     `withLock`이 그 창을 통째로 stateful로 유지한다.
 *  3. 활성화 응답은 **오류를 담은 채 200으로 온다.** 이 계열은 벤더가 이미
 *     `chkl:properties`를 읽어 판정하므로 그 판정을 그대로 옮긴다(내부 모듈의
 *     「활성화 거짓 성공은 이 계열에 없다」 참조).
 *
 * ## 검사 실패는 접두사 없이 그대로 올라간다
 *
 * 구는 `error.isPreCheckFailure`를 보고 그 문구를 **가공하지 않고** 돌려준다
 * (`:226-231`). 그래서 구문 오류 응답에는 `Failed to update service definition: `
 * 접두사가 붙지 않는다. 여기서는 `SourceCheckFailure`가 그 표를 대신한다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 해제(UNLOCK)가 실패하면 여기서는 오류가 된다. 구는 `finally`에서 해제 실패를
 * 경고로 삼키고 활성화까지 갔다(`:143-158`). 잠금 수명주기는 이 판에서 접속
 * 계층(`withLock`)이 소유하며, 이미 지어진 쓰기 도구들이 전부 같은 계약을 쓴다 —
 * 도구 하나가 그 계층을 다시 짜지 않는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  createFailureDetail,
  isAlreadyCheckedMessage,
  messageOf,
} from './dataElementDomainCreate';
import {
  SourceCheckFailure,
  assertNoCheckErrors,
  errorResult,
  okResult,
  parseActivationMessages,
  putSource,
} from './shared';
import {
  checkStagedServiceDefinition,
  serviceDefinitionActivationVerdict,
  serviceDefinitionReportedUri,
  serviceDefinitionWriteUri,
} from './internal/serviceDefinition';

export const updateServiceDefinition = defineTool(
  {
    name: 'UpdateServiceDefinition',
    description:
      'Update source code of an existing ABAP service definition. Uses stateful session with proper lock/unlock mechanism.',
    inputSchema: {
      service_definition_name: z
        .string()
        .describe('Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system.'),
      source_code: z.string().describe('Complete service definition source code.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
        )
        .optional(),
      activate: z
        .boolean()
        .describe('Activate service definition after update. Default: true.')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_definition/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['service_definition_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.service_definition_name || !args.source_code) {
      return errorResult('Error: service_definition_name and source_code are required');
    }

    const name = args.service_definition_name.toUpperCase();
    const uri = serviceDefinitionWriteUri(name);
    // 구는 `activate !== false`다 — 인자가 없으면 활성화한다.
    const shouldActivate = args.activate !== false;
    const sourceCode = args.source_code;
    logger.info(`Starting service definition source update: ${name}`);

    try {
      const client = await context.getConnection();

      await client.withLock(uri, async (lock) => {
        await putSource(client, uri, lock.handle, sourceCode, args.transport_request);
        logger.debug(`Service definition source uploaded: ${name}`);

        // 구 `runRawCheckRun`은 "이미 검사됨"만 조용한 성공으로 접는다
        // (`preCheckBeforeActivation.ts:526-531`). 나머지는 그대로 올린다.
        let check;
        try {
          check = await checkStagedServiceDefinition(client, uri);
        } catch (error) {
          if (!isAlreadyCheckedMessage(messageOf(error))) throw error;
          logger.debug(`${name} was already checked - continuing`);
          check = undefined;
        }
        if (check) assertNoCheckErrors(check, 'Service Definition', name);
      });
      logger.info(`Service definition updated: ${name}`);

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        const activation = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: 'true' },
          body:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
            `  <adtcore:objectReference adtcore:uri="${uri}" adtcore:name="${name}"/>\n` +
            `</adtcore:objectReferences>`,
          contentType: 'application/xml',
          accept: 'application/xml',
        });

        // 200이어도 속성이 아니라고 하면 실패다 — 벤더가 이미 그렇게 판정한다.
        const verdict = serviceDefinitionActivationVerdict(activation.body);
        if (!verdict.ok) {
          throw new Error(`Service definition activation failed: ${verdict.message}`);
        }
        activationWarnings = parseActivationMessages(activation.body).map(
          (entry) => `${entry.type}: ${entry.text || 'Unknown'}`,
        );
        logger.info(`Service definition activated: ${name}`);
      }

      return okResult({
        success: true,
        service_definition_name: name,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Service Definition ${name} updated and activated successfully`
          : `Service Definition ${name} updated successfully (not activated)`,
        // 나가는 주소는 소문자인데 **여기만 대문자**다 — 구 그대로다.
        uri: serviceDefinitionReportedUri(name),
        steps_completed: [
          'lock',
          'update',
          'check',
          'unlock',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        source_size_bytes: sourceCode.length,
      });
    } catch (error) {
      // 구문검사 실패는 진단을 그대로 실어 올린다(접두사 없음 — 머리주석 참조).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error updating service definition ${name}: ${error.message}`);
        return errorResult(`Error: ${error.message}`);
      }
      // 구는 `error.response?.data`가 있으면 **ADT가 돌려준 원문 본문**을 그대로
      // 싣고, 없을 때만 오류 메시지를 쓴다(`:238-246`). `createFailureDetail`이
      // 그 순서를 그대로 옮긴다.
      const message = createFailureDetail(error);
      logger.error(`Error updating service definition source ${name}: ${message}`);
      return errorResult(`Error: Failed to update service definition: ${message}`);
    }
  },
);
