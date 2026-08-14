/**
 * `GetServiceBinding` — 서비스 바인딩(SRVB) 한 벌을 파싱해 돌려준다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetServiceBinding` · 구 소스
 * `engine/src/handlers/service_binding/high/handleGetServiceBinding.ts:9-32`).
 * 몸통의 대조 원본은 같은 파일 `:39-84`. 와이어 근거는
 * `./internal/serviceBindingRead` 머리주석에 파일·줄로 모아 두었다.
 *
 * 짝인 `ReadServiceBinding`과 갈리는 자리 셋:
 *  - GET이 **한 번**이다(짝은 두 번).
 *  - 못 읽으면 **오류로 올린다**(짝은 삼킨다).
 *  - 응답에 `response_format`·`status`가 있고 본문이 **파싱된 `payload`**로
 *    실린다(짝은 원문 문자열 두 개).
 *
 * ## `response_format`은 요청을 바꾸지 않는다 (실측)
 *
 * 나가는 Accept는 언제나 v1+v2 협상 문자열이다. 구에 있는
 * `resolveServiceBindingAcceptHeader`는 **어느 핸들러도 부르지 않는 죽은 코드**라
 * 옮기지 않았다 — 내부 모듈 머리주석 참조. 이 인자는 응답을 어떻게 접어 담을지만
 * 정한다.
 *
 * ## 빈손일 때의 문구가 이 계열만 다르다
 *
 * 감싸개가 404를 빈손으로 접으면(`AdtService.js:300-307`) 구 핸들러는
 * `«Read did not return a response for service binding …»`을 던지고, 그것을
 * `return_error`가 그대로 싣는다 — 서비스 정의·메타데이터 확장의
 * `«… not found»` + 접두사 갈래와 다르다. 문구는 계약이므로 그대로 옮긴다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { ok, returnError } from './internal/results';
import {
  type ServiceBindingResponseFormat,
  parseServiceBindingPayload,
  readServiceBinding as fetchServiceBinding,
} from './internal/serviceBindingRead';

export const getServiceBinding = defineTool(
  {
    name: 'GetServiceBinding',
    description:
      'Retrieve ABAP service binding source/metadata by name via ADT Business Services endpoint.',
    inputSchema: {
      service_binding_name: z
        .string()
        .describe('Service binding name (for example: ZUI_MY_BINDING). Case-insensitive.'),
      response_format: z
        .enum(['xml', 'json', 'plain'])
        .default('xml')
        .describe(
          'Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_binding/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'read',
    targetNames: ['service_binding_name'],
  },
  async (context: ToolContext, args) => {
    try {
      // 구는 인자 검증도 자기 try 안에서 던지고 같은 catch로 접는다(`:46-48`).
      if (!args.service_binding_name) {
        throw new Error('service_binding_name is required');
      }

      const name = args.service_binding_name.trim().toUpperCase();
      const responseFormat: ServiceBindingResponseFormat = args.response_format ?? 'xml';

      const client = await context.getConnection();
      const response = await fetchServiceBinding(client, name);
      if (!response) {
        throw new Error(`Read did not return a response for service binding ${name}`);
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            service_binding_name: name,
            response_format: responseFormat,
            status: response.status,
            payload: parseServiceBindingPayload(response.body, responseFormat),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error(`Error reading service binding: ${String(error)}`);
      return returnError(error);
    }
  },
);
