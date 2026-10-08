/**
 * `CreateServiceDefinition` — 서비스 정의(SRVD) 껍데기를 만들고 활성화한다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `CreateServiceDefinition` · 구 소스
 * `engine/src/handlers/service_definition/high/handleCreateServiceDefinition.ts:25-65`).
 * 몸통의 대조 원본은 같은 파일 `:81-272`. 와이어 근거는
 * `./internal/serviceDefinition` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## 사슬 — 구가 보내던 다섯 요청 (장부 D156 이전)
 *
 * ```
 * ① POST /sap/bc/adt/ddic/srvd/sources/validation?objtype=srvdsrv&objname=…[&description=…]
 * ② GET  /sap/bc/adt/core/http/systeminformation        (로그온 언어)
 * ③ POST /sap/bc/adt/ddic/srvd/sources[?corrNr=…]       (껍데기 생성)
 * ④ POST /sap/bc/adt/checkruns?reporters=abapCheckRun   (인액티브 판 검사)
 * ⑤ POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ```
 *
 * ## `source_code`는 구에서 **와이어에 실리지 않았다** (실측) — 그래서 고쳤다 (D156)
 *
 * 발행 스키마에 `source_code`가 있고 설명도 "제공하지 않으면 최소 템플릿"이라고
 * 말하지만, 구 핸들러가 그 값을 넘기는 `create()`의 저수준 함수
 * (`@babamba2/…/core/serviceDefinition/create.js:15-44`)는 **`source_code`를 한
 * 번도 읽지 않았다.** 껍데기 XML만 POST하고 그 **빈 비활성 판**을 ④에서 검사했다 —
 * 그래서 S/4 7.57에서는 소스를 줬든 안 줬든 언제나
 * `[L1] Illegal syntax. Malformed service definition`으로 실패했고, **오브젝트는
 * 남았다**(재호출은 `already exists` · `sapkit-feedback.md` 2026-09-17 · 2026-07-29 ·
 * attended 녹화 `fixtures/attended-only/zsapkit63-rap-bdef-bimp-service.json` 10단계 ·
 * 엔진 결함 대장 13-4의 SRVD 갈래).
 *
 * 지금(장부 D156)은 ③ 뒤가 둘로 갈린다:
 *
 * ```
 * source_code 있음: ③ → LOCK → PUT source/main → ④ 검사 → UNLOCK → (⑤ 활성화)
 *                   (`UpdateServiceDefinition`과 같은 함수 — internal/serviceDefinition)
 * source_code 없음: ③에서 멈춘다 — 빈 정의는 검사를 통과할 수 없으므로 ④·⑤를 보내지
 *                   않고 `activated: false`와 「`UpdateServiceDefinition`으로 소스를
 *                   넣으라」를 답한다.
 * ```
 *
 * ③ **뒤**에서 실패하면(PUT·검사·활성화) 오류 문구 끝에 「오브젝트는 이미 생겼다 — 다시
 * 만들지 말고 `UpdateServiceDefinition`으로 이어 가라」를 싣는다. **자동 삭제(롤백)는 하지
 * 않는다** — 쓰기를 하나 더 하는 것이고, 남은 비활성 판에는 호출자의 소스가 들어 있을 수
 * 있다.
 *
 * ## 이름 검증의 **응답 본문은 읽지 않는다** (실측)
 *
 * `validate()`는 응답을 상태에 담아 돌려주기만 하고 구 핸들러는 그것을 보지 않는다
 * (`handleCreateServiceDefinition.ts:120-123` — `await` 뒤 아무 검사 없음). 즉 이
 * 왕복은 **HTTP 오류일 때만** 생성을 막는다. `CreateProgram`이 `CHECK_RESULT`를
 * 파싱하는 것과 갈리므로, 여기서 파싱을 더하면 그것이 차이가 된다.
 *
 * ## 설명은 **두 자리에서 길이가 다르다**
 *
 * 검증 왕복에 실리는 설명은 자르지 않은 원문이고(`validation.js:26-28`), 생성
 * 페이로드에서만 60자로 잘린다(`create.js:20`). 접어 합치면 안 된다.
 *
 * ## 전송요청 검증은 구에서도 **아무 일도 하지 않는다**
 *
 * 구가 부르는 `validateTransportRequest`는 본문이 비어 있는 no-op이다
 * (`engine/src/utils/transportValidation.ts` — "No strict validation"). 옮길 동작이
 * 없다. 실제 판정은 SAP이 한다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_VALIDATION,
  createFailureDetail,
  messageOf,
  resolveMasterLanguage,
  systemContextOf,
} from './dataElementDomainCreate';
import { SourceCheckFailure, errorResult, limitDescription, okResult } from './shared';
import {
  CT_SERVICE_DEFINITION,
  SRVD_ROOT,
  activateServiceDefinition,
  serviceDefinitionReportedUri,
  serviceDefinitionWriteUri,
  writeAndCheckServiceDefinitionSource,
} from './internal/serviceDefinition';

/**
 * 껍데기를 만든 **뒤** 단계가 실패했을 때 오류 문구 끝에 붙는 안내 (D156).
 *
 * 다시 `CreateServiceDefinition`을 부르면 `already exists`로 헛돈다(실측 2026-09-17).
 */
export function shellLeftNote(name: string): string {
  return (
    ` The service definition ${name} was already created on SAP (inactive) before this step failed` +
    ` and is still there — do not call CreateServiceDefinition again (it will answer "already exists");` +
    ` continue with UpdateServiceDefinition(service_definition_name: "${name}", source_code: ...).`
  );
}

/**
 * "이미 있다"의 판정 — **이 핸들러가 쓰던 조합 그대로**다
 * (`handleCreateServiceDefinition.ts:247-250`): 메시지에 `already exists`가 있거나
 * **HTTP 409**. 데이터 엘리먼트·도메인 쪽의 같은 이름 판정기는 409 대신 예외 타입
 * 문자열을 보므로 여기서 몰래 갈아 끼우지 않는다.
 */
function looksAlreadyExists(error: unknown): boolean {
  if (messageOf(error).includes('already exists')) return true;
  return error instanceof AdtError && error.status === 409;
}

/** 껍데기 생성 페이로드 — 벤더 `create.js:22-33`의 XML을 그대로 되짓는다. */
export function buildServiceDefinitionPayload(args: {
  readonly name: string;
  readonly packageName: string;
  readonly description: string;
  readonly masterLanguage: string;
  readonly masterSystem: string;
  readonly responsible: string;
}): string {
  const masterSystemAttr = args.masterSystem
    ? ` adtcore:masterSystem="${args.masterSystem}"`
    : '';
  // `adtcore:responsible`은 값이 비어도 **언제나 붙는다** — 벤더가 그렇게 짓는다
  // (`create.js:31`, `masterSystem`과 달리 조건부가 아니다).
  return (
    `<?xml version="1.0" encoding="UTF-8"?><srvd:srvdSource ` +
    `xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources" ` +
    `xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${args.description}" ` +
    `adtcore:language="${args.masterLanguage}" ` +
    `adtcore:name="${args.name}" ` +
    `adtcore:type="SRVD/SRV" ` +
    `adtcore:masterLanguage="${args.masterLanguage}"${masterSystemAttr} ` +
    `adtcore:responsible="${args.responsible}" ` +
    `srvd:srvdSourceType="S">\n` +
    `  <adtcore:packageRef adtcore:name="${args.packageName}"/>\n` +
    `</srvd:srvdSource>`
  );
}

export const createServiceDefinition = defineTool(
  {
    name: 'CreateServiceDefinition',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json`) — D156.
    description:
      'Create a new ABAP service definition for OData services. Service definitions define the structure and behavior of OData services. Uses stateful session for proper lock management.' +
      ' With source_code the definition is created, the source is written into it (lock, PUT, unlock), then checked and activated (activate defaults to true). Without source_code only an empty inactive shell is created and neither checked nor activated (an empty service definition cannot pass the syntax check; the response says activated: false) — write its source with UpdateServiceDefinition. If a step after creation fails, the object already exists: continue with UpdateServiceDefinition instead of creating it again.',
    inputSchema: {
      service_definition_name: z
        .string()
        .describe(
          'Service definition name (e.g., ZSD_MY_SERVICE). Must follow SAP naming conventions (start with Z or Y).',
        ),
      description: z
        .string()
        .describe(
          'Service definition description. If not provided, service_definition_name will be used.',
        )
        .optional(),
      package_name: z
        .string()
        .describe('Package name (e.g., ZOK_LOCAL, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      source_code: z
        .string()
        .describe(
          'Service definition source code (optional). If not provided, a minimal template will be created.',
        )
        .optional(),
      activate: z
        .boolean()
        .describe('Activate service definition after creation. Default: true.')
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

    if (!args.service_definition_name) {
      return errorResult('Error: service_definition_name is required');
    }
    if (!args.package_name) return errorResult('Error: package_name is required');

    const name = args.service_definition_name.toUpperCase();
    const packageName = args.package_name.toUpperCase();
    const shouldActivate = args.activate !== false;
    // 검증 왕복에는 **자르지 않은 원문**이 실린다(머리주석 참조).
    const rawDescription = args.description || name;
    const uri = serviceDefinitionWriteUri(name);
    const sourceCode = args.source_code;
    const hasSource = typeof sourceCode === 'string' && sourceCode.length > 0;
    // ③이 끝난 뒤의 실패는 오브젝트를 남긴다 — 오류 문구가 그것을 말해야 한다(D156).
    let shellCreated = false;

    logger.info(`Starting service definition creation: ${name}`);

    try {
      const client = await context.getConnection();

      // ① 이름 검증. 구는 응답을 **읽지 않는다** — 보내고 넘어간다.
      await client.request({
        method: 'POST',
        path: `${SRVD_ROOT}/validation`,
        params: { objtype: 'srvdsrv', objname: name, description: rawDescription },
        accept: ACCEPT_VALIDATION,
      });

      // ② 로그온 언어
      const masterLanguage = await resolveMasterLanguage(client);
      const { masterSystem, responsible } = systemContextOf(context);

      // ③ 껍데기 생성. `source_code`는 생성 페이로드에 자리가 없다 — 아래 ④에서 PUT으로 넣는다.
      await client.request({
        method: 'POST',
        path: SRVD_ROOT,
        params: { corrNr: args.transport_request },
        body: buildServiceDefinitionPayload({
          name,
          packageName,
          description: limitDescription(rawDescription),
          masterLanguage,
          masterSystem,
          responsible,
        }),
        contentType: CT_SERVICE_DEFINITION,
        accept: CT_SERVICE_DEFINITION,
      });
      shellCreated = true;
      logger.debug(`Service definition created: ${name}`);

      // 나가는 주소는 소문자인데 **응답의 uri만 대문자**다 — 구 그대로다.
      const reportedUri = serviceDefinitionReportedUri(name);

      // D156 ⓑ — 소스가 없으면 껍데기에서 멈춘다. 빈 정의는 검사를 통과할 수 없으므로
      // (실측 2026-09-17: `[L1] Illegal syntax. Malformed service definition`) 검사·활성화를
      // 보내지 않고, 무엇이 남았는지와 다음 걸음을 응답이 말한다.
      if (!hasSource) {
        logger.info(`CreateServiceDefinition created an empty shell: ${name}`);
        return okResult({
          success: true,
          service_definition_name: name,
          package_name: packageName,
          transport_request: args.transport_request || null,
          type: 'SRVD/SRV',
          activated: false,
          message:
            `Service Definition ${name} created as an empty inactive shell — not checked and not activated: ` +
            `an empty service definition cannot pass the syntax check. ` +
            `Write its source with UpdateServiceDefinition (it checks and activates).`,
          uri: reportedUri,
          steps_completed: ['validate', 'create'],
        });
      }

      // D156 ⓐ — ④ 잠금 → PUT → 쓴 판 검사 → 해제 (`UpdateServiceDefinition`과 같은 함수).
      await writeAndCheckServiceDefinitionSource(
        client,
        uri,
        name,
        sourceCode,
        args.transport_request,
        logger,
      );

      // ⑤ 활성화. 200이어도 속성이 아니라고 하면 실패다.
      let activationWarnings: string[] = [];
      if (shouldActivate) {
        activationWarnings = await activateServiceDefinition(client, uri, name);
        logger.info(`CreateServiceDefinition completed successfully: ${name}`);
      }

      return okResult({
        success: true,
        service_definition_name: name,
        package_name: packageName,
        transport_request: args.transport_request || null,
        type: 'SRVD/SRV',
        activated: shouldActivate,
        message: shouldActivate
          ? `Service Definition ${name} created and activated successfully`
          : `Service Definition ${name} created successfully (not activated)`,
        uri: reportedUri,
        steps_completed: [
          'validate',
          'create',
          'lock',
          'update',
          'check',
          'unlock',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      });
    } catch (error) {
      // D156 ⓒ — 껍데기가 이미 생긴 뒤의 실패는 그 사실과 다음 걸음을 끝에 싣는다.
      const note = shellCreated ? shellLeftNote(name) : '';
      // 구문검사 실패는 진단을 그대로 실어 올린다(접두사 없음 — 구 `:234-239`).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error creating service definition ${name}: ${error.message}`);
        return errorResult(`Error: ${error.message}${note}`);
      }
      logger.error(`Error creating service definition ${name}: ${messageOf(error)}`);
      // 「이미 있다」는 **생성 요청의** 판정이다 — 껍데기 뒤 단계(PUT 등)의 409를 그렇게
      // 읽으면 방금 만든 오브젝트를 지우라고 시키게 된다.
      if (!shellCreated && looksAlreadyExists(error)) {
        return errorResult(
          `Error: Service Definition ${name} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(
        `Error: Failed to create service definition: ${createFailureDetail(error)}${note}`,
      );
    }
  },
);
