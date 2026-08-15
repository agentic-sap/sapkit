/**
 * `ValidateServiceBinding` — 바인딩 인자들이 성립하는지 ADT에 물어본다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ValidateServiceBinding` · 구 소스
 * `engine/src/handlers/service_binding/high/handleValidateServiceBinding.ts:6-37`).
 * 몸통의 대조 원본은 같은 파일 `:47-91`.
 *
 * ```
 * GET /sap/bc/adt/businessservices/bindings/validation
 *     ?objname=…&serviceDefinition=…[&serviceBindingVersion=…][&description=…][&package=…]
 * Accept: application/vnd.sap.adt.businessservices.servicebinding.v2+xml
 * ```
 *
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:446-462`.
 * 질의 인자의 **이름이 발행 인자와 다르다** — `service_binding_name` → `objname`,
 * `service_definition_name` → `serviceDefinition`, `package_name` → `package`.
 * 구 핸들러가 그렇게 옮겨 담고(`:63-69`) 벤더는 그 객체를 그대로 질의 인자로
 * 쓴다(`:457` — `params`를 통째로 넘긴다). 빈 값은 `undefined`로 접혀 주소에서
 * 아예 빠진다.
 *
 * ## `kind: 'read'`의 근거 — 네 갈래가 같은 곳을 가리킨다
 *
 * 이 묶음에서 `Validate*` 접두어를 가진 유일한 도구이고, 판정 근거는 넷이다.
 *
 * 1. **접두어 규칙이 정본이다.** 구 안전 게이트의 `READ_PREFIXES`에 `'Validate'`가
 *    있고, 그 자리 주석이 이유를 적어 두었다 — "`Check*` / `Validate*`는 ADT 검사
 *    실행이며 **절대 변경을 남기지 않는다**"(`engine/src/lib/readonlyGuard.ts:36-54`).
 * 2. **명시 목록에도 있다.** 같은 파일의 `READ_TOOLS`(접두어로 안 걸리는 compact
 *    계열의 정확한 이름 집합)에 `HandlerServiceBindingValidate`가 들어 있다(`:73`).
 *    같은 동작을 부르는 두 이름이 양쪽에서 모두 읽기로 분류된다.
 * 3. **와이어가 GET이다.** 검증 엔드포인트는 본문 없는 GET이고 질의 인자만
 *    싣는다(`AdtService.js:453-461`). 상태를 바꿀 통로가 없다.
 * 4. **교차검사를 통과한다.** 신 엔진 tier 게이트의 이름 교차검사
 *    (`src/safety/tier.ts:81-82`의 `DANGEROUS_NAME_RE`)는 `Create|Update|Delete|
 *    Activate|Release|Patch|Write|Install|RuntimeRun|RuntimeCreate`만 잡고
 *    `Validate`를 잡지 않는다 — `read` 선언이 잘못된 선언으로 거절되지 않는다.
 *
 * **`CreateServiceBinding`의 transport check와 혼동하지 말 것.** 그쪽은
 * `POST /sap/bc/adt/cts/transportchecks`(`AdtService.js:463-478`)이고 생성 사슬에만
 * 있다. 이름에 "check"가 들어간다고 이 도구의 갈래가 아니다.
 *
 * ## `response_format` 인자가 **없다**
 *
 * 발행 스키마에 그 인자가 없고, 구 핸들러는 `parseServiceBindingPayload(…, 'xml')`로
 * xml을 못 박아 부른다(`:77`). 형식을 고를 통로가 없으므로 여기서도 박는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { ok, returnError } from './internal/results';
import {
  ACCEPT_SERVICE_BINDING_V2,
  BINDINGS_ROOT,
  parseServiceBindingPayload,
} from './internal/serviceBindingRead';

export const validateServiceBinding = defineTool(
  {
    name: 'ValidateServiceBinding',
    description:
      'Validate service binding parameters (name, service definition, package, version) via ADT validation endpoint.',
    inputSchema: {
      service_binding_name: z.string().describe('Service binding name to validate.'),
      description: z.string().describe('Optional description used during validation.').optional(),
      service_definition_name: z.string().describe('Service definition linked to binding.'),
      package_name: z.string().describe('ABAP package for the binding.').optional(),
      service_binding_version: z
        .string()
        .describe('Service binding version (for example: 1.0).')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_binding/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    // 머리주석의 「`kind: 'read'`의 근거」 참조 — 접두어 규칙·명시 목록·GET 와이어·
    // 교차검사 넷이 같은 곳을 가리킨다.
    kind: 'read',
    targetNames: ['service_binding_name'],
  },
  async (context: ToolContext, args) => {
    try {
      // 구는 인자 검증도 자기 try 안에서 던지고 같은 catch로 접는다(`:54-59`).
      if (!args.service_binding_name) {
        throw new Error('service_binding_name is required');
      }
      if (!args.service_definition_name) {
        throw new Error('service_definition_name is required');
      }

      const name = args.service_binding_name.trim().toUpperCase();

      const client = await context.getConnection();
      const response = await client.request({
        method: 'GET',
        path: `${BINDINGS_ROOT}/validation`,
        // 이름이 발행 인자와 다르다 — 머리주석 참조. 순서도 구가 담는 순서다.
        params: {
          objname: name,
          serviceDefinition: args.service_definition_name.trim().toUpperCase(),
          serviceBindingVersion: args.service_binding_version?.trim() || undefined,
          description: args.description?.trim() || undefined,
          package: args.package_name?.trim().toUpperCase() || undefined,
        },
        accept: ACCEPT_SERVICE_BINDING_V2,
        timeout: 'default',
      });

      return ok(
        JSON.stringify(
          {
            success: true,
            service_binding_name: name,
            status: response.status,
            // 형식을 고를 통로가 없다 — 구도 'xml'을 박아 부른다.
            payload: parseServiceBindingPayload(response.body, 'xml'),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error(`Error validating service binding: ${String(error)}`);
      return returnError(error);
    }
  },
);
