/**
 * `CreateServiceBinding` — 서비스 바인딩(SRVB)을 만들고 활성화한다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `CreateServiceBinding` · 구 소스
 * `engine/src/handlers/service_binding/high/handleCreateServiceBinding.ts:11-76`).
 * 몸통의 대조 원본은 같은 파일 `:92-187` → 벤더 사슬
 * `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:190-266`.
 * 와이어 근거는 `./internal/serviceBinding` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## 사슬 — 구가 실제로 보내는 아홉 요청 (활성화까지 갈 때)
 *
 * ```
 * ① GET  /sap/bc/adt/businessservices/bindings/bindingtypes      (지원 종류 확인)
 * ② POST /sap/bc/adt/cts/transportchecks                          (이송 사전 검사)
 * ③ GET  /sap/bc/adt/core/http/systeminformation?_=<시각>         (언어·시스템·담당자)
 * ④ POST /sap/bc/adt/businessservices/bindings[?corrNr=…]         (생성)
 * ⑤ POST /sap/bc/adt/checkruns                                    (인액티브 검사)
 * ⑥ POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ⑦ GET  /sap/bc/adt/businessservices/bindings/{소문자}?version=active
 * ⑧ GET  /sap/bc/adt/businessservices/{odatav2|odatav4}/{대문자}?servicename=…&serviceversion=…&srvdname=…
 * ⑨ POST /sap/bc/adt/checkruns                                    (활성 검사)
 * ```
 *
 * `activate=false`면 ⑥·⑨가 빠지고 ⑦의 `version`이 `inactive`가 된다(일곱 요청).
 * **잠금이 없다** — 벤더가 이 계열의 `lock()`을 막아 두었다(`:425-427`).
 *
 * ## ①이 게이트다 — 지원하지 않는 종류면 **아무것도 만들지 않는다**
 *
 * 종류 목록에서 `이름:설명:데이터` 집합을 뽑아 `ODATA:1:ODATA V4` 같은 열쇠가
 * 있는지 본다(`:64-84`·`:111-121`). 없으면 `«Binding type …/… is not available on
 * current ADT system»`을 던지고 사슬이 거기서 끝난다.
 *
 * ## `binding_type`은 **경로를 가르지만 페이로드는 가르지 않는다** (실측)
 *
 * 구 핸들러의 `bindingType`은 `args.binding_type === 'ODataV2' ? 'ODATA' : 'ODATA'`
 * 라 **어느 쪽이든 언제나 `'ODATA'`**다(`handleCreateServiceBinding.ts:115` — 삼항의
 * 두 갈래가 같은 값이다). 갈리는 것은 `bindingVersion`(`V2`/`V4`)과 `serviceType`
 * (`odatav2`/`odatav4`)뿐이고, 그 둘이 ①의 열쇠와 ⑧의 주소를 정한다. 오타처럼
 * 보여도 발행 표면의 동작이므로 그대로 옮긴다.
 *
 * ## ③은 env가 아니라 **SAP에서** 언어·시스템·담당자를 얻는다
 *
 * `createServiceBinding`이 `getSystemInformation`을 직접 부르고 그 응답에서
 * `language`·`systemID`·`userName`을 꺼낸다(`:499-504`). 서비스 정의·메타데이터
 * 확장 생성이 env(`SAP_MASTER_SYSTEM`·`SAP_USERNAME`)를 읽는 것과 갈리는 자리다 —
 * 차이 D62의 대상이 아니다. 조회 실패는 전부 삼켜 `EN` + 두 속성 생략이 된다.
 *
 * ## ⑤·⑨의 검사 결과는 **읽지 않고 버린다** (구 그대로)
 *
 * 사슬은 두 검사 응답을 상태에 담기만 하고 판정하지 않는다. 그래서 구문 오류가
 * 있어도 생성은 성공으로 끝난다. 여기서 판정을 더하면 그것이 구와의 차이가 되므로
 * 더하지 않았다 — 차이 D105의 「함께 보아야 할 것」에 그 판단을 적어 두었다.
 *
 * ## 활성화 거짓 성공을 고친다 (차이 — `harness/DIVERGENCES.md` D105)
 *
 * 구는 활성화 응답을 아무도 읽지 않고 `activated`에 **인자를 그대로 메아리친다.**
 * `E`/`A`/`X` 메시지를 실패로 되돌린다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_SERVICE_BINDING,
  type ServiceBindingResponseFormat,
  BINDINGS_ROOT,
  parseServiceBindingPayload,
  serviceBindingUri,
} from '../read/internal/serviceBindingRead';
import {
  ACCEPT_CHECK_MESSAGES,
  CT_CHECK_OBJECTS,
  SourceCheckFailure,
  activationErrors,
  errorResult,
  okResult,
  parseActivationMessages,
} from './shared';
import {
  ACCEPT_ODATA_V2,
  ACCEPT_ODATA_V4,
  ACCEPT_TRANSPORT_CHECK,
  CT_SERVICE_BINDING_V2,
  CT_TRANSPORT_CHECK,
  type ServiceBindingServiceType,
  bindingObjectReferences,
  bindingTypeAvailabilityKey,
  buildServiceBindingCreateXml,
  buildTransportCheckXml,
  extractAvailableBindingTypes,
  fetchSystemInformation,
  returnErrorText,
} from './internal/serviceBinding';

/** 벤더 `checkServiceBinding`(`AdtService.js:594-612`)의 본문 — **한 줄이다.** */
function checkObjectList(bindingUri: string, version: 'active' | 'inactive'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" ` +
    `xmlns:adtcore="http://www.sap.com/adt/core">` +
    `<chkrun:checkObject adtcore:uri="${bindingUri}" chkrun:version="${version}"/>` +
    `</chkrun:checkObjectList>`
  );
}

export const createServiceBinding = defineTool(
  {
    name: 'CreateServiceBinding',
    description:
      'Create ABAP service binding via ADT Business Services endpoint. XML is generated from high-level parameters.',
    inputSchema: {
      service_binding_name: z.string().describe('Service binding name.'),
      service_definition_name: z.string().describe('Referenced service definition name.'),
      package_name: z.string().describe('ABAP package name.'),
      description: z
        .string()
        .describe('Optional description. Defaults to service_binding_name when omitted.')
        .optional(),
      binding_type: z
        .enum(['ODataV2', 'ODataV4'])
        .default('ODataV4')
        .describe('OData binding type.'),
      service_binding_version: z
        .string()
        .describe('Service binding ADT version. Default inferred from type.')
        .optional(),
      service_name: z
        .string()
        .describe('Published service name. Default: service_binding_name if omitted.')
        .optional(),
      service_version: z
        .string()
        .describe('Published service version. Default: 0001.')
        .optional(),
      transport_request: z
        .string()
        .describe('Optional transport request for transport checks.')
        .optional(),
      activate: z
        .boolean()
        .describe('Activate service binding after create. Default: true.')
        .optional(),
      response_format: z.enum(['xml', 'json', 'plain']).default('xml'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_binding/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['service_binding_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    try {
      // 구는 인자 검증도 자기 try 안에서 던지고 같은 catch로 접는다(`:99-107`).
      if (!args.service_binding_name) throw new Error('service_binding_name is required');
      if (!args.service_definition_name) throw new Error('service_definition_name is required');
      if (!args.package_name) throw new Error('package_name is required');

      const name = args.service_binding_name.trim().toUpperCase();
      const serviceDefinitionName = args.service_definition_name.trim().toUpperCase();
      const packageName = args.package_name.trim().toUpperCase();
      const responseFormat: ServiceBindingResponseFormat = args.response_format ?? 'xml';
      // 삼항의 두 갈래가 같은 값이다 — 머리주석 참조.
      const bindingType = 'ODATA';
      const bindingVersion =
        args.service_binding_version ?? (args.binding_type === 'ODataV2' ? 'V2' : 'V4');
      const serviceType: ServiceBindingServiceType =
        args.binding_type === 'ODataV2' ? 'odatav2' : 'odatav4';
      const serviceName = (args.service_name || name).trim().toUpperCase();
      const serviceVersion = (args.service_version || '0001').trim();
      const description = (args.description || name).trim();
      const shouldActivate = args.activate !== false;
      const uri = serviceBindingUri(name);

      const client = await context.getConnection();

      // ① 지원 종류 게이트. 여기서 막히면 아무것도 만들지 않는다.
      const types = await client.request({
        method: 'GET',
        path: `${BINDINGS_ROOT}/bindingtypes`,
        accept: 'application/vnd.sap.adt.nameditems.v1+xml, application/xml',
        timeout: 'default',
      });
      const available = extractAvailableBindingTypes(types.body);
      if (!available.has(bindingTypeAvailabilityKey(bindingType, bindingVersion))) {
        throw new Error(
          `Binding type ${bindingType}/${bindingVersion} is not available on current ADT system`,
        );
      }

      // ② 이송 사전 검사. 구는 `runTransportCheck`를 넘기지 않으므로 언제나 돈다.
      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/cts/transportchecks',
        body: buildTransportCheckXml({
          objectName: name,
          packageName,
          description,
          operation: 'I',
        }),
        contentType: CT_TRANSPORT_CHECK,
        accept: ACCEPT_TRANSPORT_CHECK,
        timeout: 'default',
      });

      // ③ 언어·시스템·담당자를 SAP에서 얻는다(env가 아니다 — 머리주석 참조).
      const systemInfo = await fetchSystemInformation(client);

      // ④ 생성
      const created = await client.request({
        method: 'POST',
        path: BINDINGS_ROOT,
        params: { corrNr: args.transport_request },
        body: buildServiceBindingCreateXml({
          bindingName: name,
          packageName,
          description,
          serviceDefinitionName,
          serviceName,
          serviceVersion,
          bindingType,
          bindingVersion,
          masterLanguage: systemInfo?.language ?? 'EN',
          masterSystem: systemInfo?.systemID,
          responsible: systemInfo?.userName,
        }),
        contentType: CT_SERVICE_BINDING_V2,
        accept: ACCEPT_SERVICE_BINDING,
        timeout: 'default',
      });
      logger.info(`Service binding created: ${name}`);

      // ⑤ 인액티브 검사 — **결과를 읽지 않는다**(구 그대로, D105의 「함께 보아야 할 것」).
      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/checkruns',
        body: checkObjectList(uri, 'inactive'),
        contentType: CT_CHECK_OBJECTS,
        accept: ACCEPT_CHECK_MESSAGES,
        timeout: 'default',
      });

      // ⑥ 활성화. D105 — 구는 이 응답을 읽지 않고 인자를 메아리쳤다.
      if (shouldActivate) {
        const activation = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: 'true' },
          body: bindingObjectReferences(name),
          contentType: 'application/xml',
          accept: 'application/xml',
          timeout: 'default',
        });

        const failures = activationErrors(parseActivationMessages(activation.body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: service binding ${name} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The binding exists on SAP as an inactive version.`,
            failures,
          );
        }
        logger.info(`Service binding activated: ${name}`);
      }

      // ⑦ 만들어진 판을 되읽는다.
      const readBack = await client.request({
        method: 'GET',
        path: uri,
        params: { version: shouldActivate ? 'active' : 'inactive' },
        accept: ACCEPT_SERVICE_BINDING,
        timeout: 'default',
      });

      // ⑧ 생성정보 조회 — 종류에 따라 주소와 Accept가 갈린다.
      const generated = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/businessservices/${serviceType}/${encodeURIComponent(name)}`,
        params: {
          servicename: serviceName,
          serviceversion: serviceVersion,
          srvdname: serviceDefinitionName,
        },
        accept: serviceType === 'odatav2' ? ACCEPT_ODATA_V2 : ACCEPT_ODATA_V4,
        timeout: 'default',
      });

      // ⑨ 활성 검사 — 역시 결과를 읽지 않는다.
      if (shouldActivate) {
        await client.request({
          method: 'POST',
          path: '/sap/bc/adt/checkruns',
          body: checkObjectList(uri, 'active'),
          contentType: CT_CHECK_OBJECTS,
          accept: ACCEPT_CHECK_MESSAGES,
          timeout: 'default',
        });
      }

      return okResult({
        success: true,
        service_binding_name: name,
        service_definition_name: serviceDefinitionName,
        package_name: packageName,
        // 구는 **인자 원문**(없으면 기본값 문자열)을 싣는다.
        binding_type: args.binding_type ?? 'ODataV4',
        service_binding_version: bindingVersion,
        service_name: serviceName,
        service_version: serviceVersion,
        activated: shouldActivate,
        response_format: responseFormat,
        status: created.status,
        payload: parseServiceBindingPayload(created.body, responseFormat),
        read_payload: parseServiceBindingPayload(readBack.body, responseFormat),
        generated_info: parseServiceBindingPayload(generated.body, responseFormat),
      });
    } catch (error) {
      // 활성화 실패는 진단을 그대로 실어 올린다(D105).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error creating service binding: ${error.message}`);
        return errorResult(`Error: ${error.message}`);
      }
      const message = returnErrorText(error);
      logger.error(`Error creating service binding: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
