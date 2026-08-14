/**
 * `UpdateServiceBinding` — 서비스 바인딩의 **발행 상태**를 바꾼다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `UpdateServiceBinding` · 구 소스
 * `engine/src/handlers/service_binding/high/handleUpdateServiceBinding.ts:12-56`).
 * 몸통의 대조 원본은 같은 파일 `:67-123`. 와이어 근거는
 * `./internal/serviceBinding` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## 이름이 `Update*`지만 소스도 활성화도 건드리지 않는다 (실측)
 *
 * 이 도구가 하는 일은 **발행/발행취소뿐**이다 — 소스 PUT도, 잠금도, 활성화도
 * 없다(구 도구 설명 자체가 "Update publication state"라고 적는다). 다른 계열의
 * `Update*`와 같은 모양일 것이라고 넘겨짚으면 안 된다. 잠금은 아예 불가능하다 —
 * 벤더의 `lock()`이 «Lock is not supported for service bindings via ADT API»를
 * 던진다(`AdtService.js:425-427`).
 *
 * ## 사슬 — 읽고 나서 **갈래에 따라 두 번째 요청이 없을 수도 있다**
 *
 * ```
 * ① GET  /sap/bc/adt/businessservices/bindings/{소문자}?version=active
 * ② POST /sap/bc/adt/businessservices/{odatav2|odatav4}/{publish|unpublish}jobs
 *        ?servicename=…[&serviceversion=…]     ← 타임아웃 long
 * ```
 *
 * ②가 **나가지 않는 갈래가 둘**이다(벤더 `updateServiceBinding` `:535-580`):
 *  - `desired_publication_state=unchanged` — ①의 응답을 그대로 답으로 쓴다.
 *  - `published`인데 **이미 발행돼 있다** — 역시 ①의 응답을 그대로 쓴다.
 *
 * 그리고 상태 전이가 허용되지 않으면 요청을 보내지 않고 **던진다**:
 * `published`인데 `allowedAction !== 'PUBLISH'`거나, `unpublished`인데
 * `allowedAction !== 'UNPUBLISH'`인 경우다. 문구는 계약이므로 그대로 옮긴다.
 *
 * ## 구는 저수준 `updateServiceBinding`을 부른다 — 뒤따르는 읽기가 없다
 *
 * 감싸개 `update()`(`:316-342`)는 발행 뒤 활성 판을 한 번 더 읽지만, 구 핸들러는
 * 그것을 쓰지 않고 저수준 쪽을 직접 부른다(`handleUpdateServiceBinding.ts:90`).
 * 그래서 GET은 **① 한 번뿐**이다. 감싸개를 쓰면 없던 요청이 하나 늘어난다.
 *
 * ## `service_type`은 필수처럼 보이지만 발행 표면에서는 선택이다
 *
 * 구 핸들러의 `TOOL_DEFINITION.required`에는 `service_type`이 있는데 **채록본에는
 * 없다** — `default: 'ODataV4'`가 붙은 인자를 구 서버의 스키마 변환이 필수에서
 * 빼기 때문이다. 발행 표면이 정본이므로 여기서도 기본값 있는 선택 인자다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  type ServiceBindingResponseFormat,
  parseServiceBindingPayload,
  serviceBindingUri,
} from '../read/internal/serviceBindingRead';
import { ACCEPT_SERVICE_BINDING } from '../read/internal/serviceBindingRead';
import { errorResult, okResult } from './shared';
import {
  type ServiceBindingServiceType,
  parseServiceBindingState,
  publicationJob,
  returnErrorText,
} from './internal/serviceBinding';

export const updateServiceBinding = defineTool(
  {
    name: 'UpdateServiceBinding',
    description:
      'Update publication state for ABAP service binding via AdtServiceBinding workflow.',
    inputSchema: {
      service_binding_name: z.string().describe('Service binding name to update.'),
      desired_publication_state: z
        .enum(['published', 'unpublished', 'unchanged'])
        .describe('Target publication state.'),
      service_type: z
        .enum(['ODataV2', 'ODataV4'])
        .default('ODataV4')
        .describe('OData service type for publish/unpublish action routing.'),
      service_name: z.string().describe('Published service name.'),
      service_version: z.string().describe('Published service version. Optional.').optional(),
      response_format: z.enum(['xml', 'json', 'plain']).default('xml'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_binding/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    // 발행/발행취소는 SAP의 상태를 바꾼다.
    kind: 'mutation',
    targetNames: ['service_binding_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    try {
      // 구는 인자 검증도 자기 try 안에서 던지고 같은 catch로 접는다(`:74-82`).
      if (!args.service_binding_name) throw new Error('service_binding_name is required');
      if (!args.desired_publication_state) throw new Error('desired_publication_state is required');
      if (!args.service_name) throw new Error('service_name is required');

      const name = args.service_binding_name.trim().toUpperCase();
      const responseFormat: ServiceBindingResponseFormat = args.response_format ?? 'xml';
      const serviceType: ServiceBindingServiceType =
        args.service_type === 'ODataV2' ? 'odatav2' : 'odatav4';
      const serviceName = args.service_name.trim().toUpperCase();
      const serviceVersion = args.service_version?.trim() || undefined;
      const desired = args.desired_publication_state;

      const client = await context.getConnection();

      // ① 활성 판을 읽어 현재 상태를 본다.
      const readResponse = await client.request({
        method: 'GET',
        path: serviceBindingUri(name),
        params: { version: 'active' },
        accept: ACCEPT_SERVICE_BINDING,
        timeout: 'default',
      });
      const current = parseServiceBindingState(readResponse.body);
      logger.info(
        `ServiceBinding update: ${name} -> ${desired} (published=${current.published}, allowedAction=${
          current.allowedAction ?? 'UNKNOWN'
        })`,
      );

      // ② 갈래에 따라 발행 작업을 세우거나, ①의 응답을 그대로 답으로 쓴다.
      let response = readResponse;
      if (desired === 'published') {
        if (!current.published) {
          if (current.allowedAction !== 'PUBLISH') {
            throw new Error(
              `Invalid state transition: cannot publish service binding ${name}. allowedAction=${
                current.allowedAction ?? 'UNKNOWN'
              }`,
            );
          }
          response = await publicationJob(
            client,
            'publish',
            serviceType,
            name,
            serviceName,
            serviceVersion,
          );
        }
      } else if (desired === 'unpublished') {
        if (current.allowedAction !== 'UNPUBLISH') {
          throw new Error(
            `Invalid state transition: cannot unpublish service binding ${name}. allowedAction=${
              current.allowedAction ?? 'UNKNOWN'
            }`,
          );
        }
        response = await publicationJob(
          client,
          'unpublish',
          serviceType,
          name,
          serviceName,
          serviceVersion,
        );
      }

      return okResult({
        success: true,
        service_binding_name: name,
        desired_publication_state: desired,
        // 구는 **인자 원문**을 그대로 싣는다 — 소문자로 접은 값이 아니다.
        service_type: args.service_type,
        service_name: serviceName,
        service_version: args.service_version || null,
        response_format: responseFormat,
        status: response.status,
        payload: parseServiceBindingPayload(response.body, responseFormat),
      });
    } catch (error) {
      // 구는 `return_error(error)`를 지난다 — `Error: ` 접두사와 ADT 본문 우선
      // 순서가 그 함수의 계약이다.
      const message = returnErrorText(error);
      logger.error(`Error updating service binding: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
