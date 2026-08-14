/**
 * `ListServiceBindingTypes` — 시스템이 지원하는 바인딩 종류 목록.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ListServiceBindingTypes` · 구 소스
 * `engine/src/handlers/service_binding/high/handleListServiceBindingTypes.ts:9-24`).
 * 몸통의 대조 원본은 같은 파일 `:30-61`.
 *
 * **인자가 `response_format` 하나뿐이고, 그것마저 요청을 바꾸지 않는다.** 그래서
 * 나가는 것은 언제나 같은 GET 한 발이다:
 *
 * ```
 * GET /sap/bc/adt/businessservices/bindings/bindingtypes
 * Accept: application/vnd.sap.adt.nameditems.v1+xml, application/xml
 * ```
 *
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:434-444`
 * (`getServiceBindingTypes`는 인자를 받지 않는다). 질의 인자도, 대상 이름도 없다 —
 * 그래서 `targetNames`는 **빈 배열로 명시**한다.
 *
 * ## 응답 본문은 이 도구가 파싱하지만 **의미를 읽지는 않는다**
 *
 * 구는 `parseServiceBindingPayload`로 접어 `payload`에 담을 뿐,
 * `extractAvailableBindingTypes`(같은 파일 `:64-84`)로 종류를 뽑아내지 않는다.
 * 그 추출은 **`CreateServiceBinding`의 사전 검사**가 자기 안에서 따로 한다.
 * 여기서 추출을 더하면 응답 형태가 구와 달라진다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { ok, returnError } from './internal/results';
import {
  ACCEPT_NAMED_ITEMS,
  BINDINGS_ROOT,
  type ServiceBindingResponseFormat,
  parseServiceBindingPayload,
} from './internal/serviceBindingRead';

export const listServiceBindingTypes = defineTool(
  {
    name: 'ListServiceBindingTypes',
    description:
      'List available service binding types (for example ODataV2/ODataV4) from ADT Business Services endpoint.',
    inputSchema: {
      response_format: z.enum(['xml', 'json', 'plain']).default('xml'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_binding/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'read',
    // 대상 오브젝트 이름을 아예 받지 않는다는 **명시 선언**이다.
    targetNames: [],
  },
  async (context: ToolContext, args) => {
    try {
      const responseFormat: ServiceBindingResponseFormat = args.response_format ?? 'xml';

      const client = await context.getConnection();
      const response = await client.request({
        method: 'GET',
        path: `${BINDINGS_ROOT}/bindingtypes`,
        accept: ACCEPT_NAMED_ITEMS,
        timeout: 'default',
      });

      return ok(
        JSON.stringify(
          {
            success: true,
            response_format: responseFormat,
            status: response.status,
            payload: parseServiceBindingPayload(response.body, responseFormat),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error(`Error listing service binding types: ${String(error)}`);
      return returnError(error);
    }
  },
);
