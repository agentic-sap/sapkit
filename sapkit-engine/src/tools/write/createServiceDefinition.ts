/**
 * `CreateServiceDefinition` — 서비스 정의(SRVD) 껍데기를 만들고 활성화한다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `CreateServiceDefinition` · 구 소스
 * `engine/src/handlers/service_definition/high/handleCreateServiceDefinition.ts:25-65`).
 * 몸통의 대조 원본은 같은 파일 `:81-272`. 와이어 근거는
 * `./internal/serviceDefinition` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## 사슬 — 구가 실제로 보내는 다섯 요청
 *
 * ```
 * ① POST /sap/bc/adt/ddic/srvd/sources/validation?objtype=srvdsrv&objname=…[&description=…]
 * ② GET  /sap/bc/adt/core/http/systeminformation        (로그온 언어)
 * ③ POST /sap/bc/adt/ddic/srvd/sources[?corrNr=…]       (껍데기 생성)
 * ④ POST /sap/bc/adt/checkruns?reporters=abapCheckRun   (인액티브 판 검사)
 * ⑤ POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ```
 *
 * **잠금이 없다.** 이 사슬은 소스를 올리지 않으므로 PUT도 LOCK도 타지 않는다 —
 * 데이터 엘리먼트·도메인 생성이 읽기-수정-쓰기로 잠금을 잡는 것과 갈리는 자리다.
 *
 * ## `source_code`는 **와이어에 실리지 않는다** (실측)
 *
 * 발행 스키마에 `source_code`가 있고 설명도 "제공하지 않으면 최소 템플릿"이라고
 * 말하지만, 구 핸들러가 그 값을 넘기는 `create()`의 저수준 함수
 * (`@babamba2/…/core/serviceDefinition/create.js:15-44`)는 **`source_code`를 한
 * 번도 읽지 않는다.** 껍데기 XML만 POST하고 끝이다. 소스를 넣는 통로는
 * `UpdateServiceDefinition`뿐이다. 흉내가 아니라 실측이며, 여기서 소스 업로드를
 * 새로 더하면 그것이 구와의 차이가 된다.
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
  isAlreadyCheckedMessage,
  messageOf,
  resolveMasterLanguage,
  systemContextOf,
} from './dataElementDomainCreate';
import {
  SourceCheckFailure,
  assertNoCheckErrors,
  errorResult,
  limitDescription,
  okResult,
  parseActivationMessages,
} from './shared';
import {
  CT_SERVICE_DEFINITION,
  SRVD_ROOT,
  checkStagedServiceDefinition,
  serviceDefinitionActivationVerdict,
  serviceDefinitionReportedUri,
  serviceDefinitionWriteUri,
} from './internal/serviceDefinition';

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
    description:
      'Create a new ABAP service definition for OData services. Service definitions define the structure and behavior of OData services. Uses stateful session for proper lock management.',
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

      // ③ 껍데기 생성. `source_code`는 여기에 실리지 않는다(머리주석 참조).
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
      logger.debug(`Service definition created: ${name}`);

      // ④ 인액티브 판 검사. "이미 검사됨"만 조용한 성공으로 접는다.
      let check;
      try {
        check = await checkStagedServiceDefinition(client, uri);
      } catch (error) {
        if (!isAlreadyCheckedMessage(messageOf(error))) throw error;
        logger.debug(`${name} was already checked - continuing`);
        check = undefined;
      }
      if (check) assertNoCheckErrors(check, 'Service Definition', name);

      // ⑤ 활성화. 200이어도 속성이 아니라고 하면 실패다.
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

        const verdict = serviceDefinitionActivationVerdict(activation.body);
        if (!verdict.ok) {
          throw new Error(`Service definition activation failed: ${verdict.message}`);
        }
        activationWarnings = parseActivationMessages(activation.body).map(
          (entry) => `${entry.type}: ${entry.text || 'Unknown'}`,
        );
        logger.info(`CreateServiceDefinition completed successfully: ${name}`);
      }

      return okResult({
        success: true,
        service_definition_name: name,
        package_name: packageName,
        transport_request: args.transport_request || null,
        type: 'SRVD/SRV',
        message: shouldActivate
          ? `Service Definition ${name} created and activated successfully`
          : `Service Definition ${name} created successfully (not activated)`,
        // 나가는 주소는 소문자인데 **여기만 대문자**다 — 구 그대로다.
        uri: serviceDefinitionReportedUri(name),
        steps_completed: ['validate', 'create', ...(shouldActivate ? ['activate'] : [])],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      });
    } catch (error) {
      // 구문검사 실패는 진단을 그대로 실어 올린다(접두사 없음 — 구 `:234-239`).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error creating service definition ${name}: ${error.message}`);
        return errorResult(`Error: ${error.message}`);
      }
      logger.error(`Error creating service definition ${name}: ${messageOf(error)}`);
      if (looksAlreadyExists(error)) {
        return errorResult(
          `Error: Service Definition ${name} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(
        `Error: Failed to create service definition: ${createFailureDetail(error)}`,
      );
    }
  },
);
