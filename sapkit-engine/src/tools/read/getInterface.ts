/**
 * GetInterface — 인터페이스 정의 한 벌.
 *
 * `with_context`를 켜면 이 인터페이스가 참조하는 클래스·인터페이스의 **공개
 * 계약만** 접어 `dependency_context`로 덧붙인다. 문맥 조립은 결코 본 읽기를
 * 깨뜨리지 않는다(`GetClass`와 같은 계약).
 *
 * 구 핸들러: `engine/src/handlers/interface/high/handleGetInterface.ts`.
 *
 * ## 와이어 근거 (읽기 전용 참조)
 *
 * `handleGetInterface.ts:90-94`의 `client.getInterface().read({interfaceName}, version)`
 * → `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/interface/AdtInterface.js:117-136`
 * → `core/interface/read.js:28-30`(`getInterfaceSource`)
 * → `core/shared/AdtUtils.js:306-325`(`readObjectSource`)
 * → URI는 `AdtUtils.js:743-755`의 `getObjectSourceUri('interface', …)` =
 *   `/sap/bc/adt/oo/interfaces/{encodeURIComponent(이름)}/source/main?version=…`,
 *   Accept는 `text/plain`(`AdtUtils.js:313`). GET이라 CSRF 취득도 상태유지
 *   헤더도 붙지 않는다.
 *
 * ## 404 문구가 `GetClass`와 다른 이유 — **실측이다, 오타가 아니다**
 *
 * 겉 핸들러만 보면 404는 `Interface {이름} not found.`로 보인다
 * (`handleGetInterface.ts:136-137`). **그 갈래는 실제로는 도달하지 않는다.**
 * 안쪽 `AdtInterface.read()`가 404를 **`undefined`로 접어 삼키기**
 * 때문이다(`AdtInterface.js:129-131`). 그래서 핸들러는 `!readResult` 분기로
 * 떨어져 자기가 만든 `Interface {이름} not found`를 던지고(`:96-98`), 그 예외에는
 * `error.response`가 없으므로 상태 코드 분기를 전부 지나쳐
 * `Failed to read interface: …`로 감싸진다(`:134`).
 *
 * 즉 구 도구가 실제로 내보내던 문구는 **`Error: Failed to read interface:
 * Interface ZIF_X not found`**(마침표 없음)이다. 423은 삼켜지지 않으므로
 * (`AdtInterface.js:132-135`가 재던진다) 그쪽 문구는 겉 핸들러 그대로다.
 *
 * 겉만 읽고 지었다면 여기서 갈렸을 자리다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { adtStatusOf, objectSourcePath, readSourceText, statusTextFor } from './internal/adt';
import { buildContextPrologue } from './internal/context';
import { messageOf, ok, returnError } from './internal/results';

export const getInterface = defineTool(
  {
    name: 'GetInterface',
    description:
      'Retrieve ABAP interface definition. Supports reading active or inactive version. Optionally append a compressed dependency context (public signatures of referenced classes/interfaces) via with_context.',
    inputSchema: {
      interface_name: z.string().describe('Interface name (e.g., Z_MY_INTERFACE).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
      with_context: z
        .boolean()
        .optional()
        .describe(
          'If true, append a "dependency_context" field with compressed public contracts (signatures) of every class/interface referenced by this interface, so callers get surrounding context in one call. Function modules referenced via CALL FUNCTION are noted but not resolved. Default false.',
        ),
      context_max_deps: z
        .number()
        .default(10)
        .describe(
          'Max number of dependencies to resolve when with_context is true (1-15). Default 10.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'read',
    targetNames: ['interface_name'],
  },
  async (context, args) => {
    try {
      const {
        interface_name,
        version = 'active',
        with_context = false,
        context_max_deps = 10,
      } = args;

      if (!interface_name) {
        return returnError(new Error('interface_name is required'));
      }

      const client = await context.getConnection();
      const interfaceName = interface_name.toUpperCase();

      context.logger.info(`Reading interface ${interfaceName}, version: ${version}`);

      try {
        const response = await readSourceText(
          client,
          objectSourcePath('interface', interfaceName),
          version,
        );
        const interfaceData = response.body;

        const payload: Record<string, unknown> = {
          success: true,
          interface_name: interfaceName,
          version,
          interface_data: interfaceData,
          status: response.status,
          status_text: statusTextFor(response.status),
        };

        if (with_context) {
          payload.dependency_context = await buildContextPrologue(
            client,
            interfaceData,
            context_max_deps,
          );
        }

        context.logger.info(`GetInterface completed successfully: ${interfaceName}`);
        return ok(JSON.stringify(payload, null, 2));
      } catch (error) {
        context.logger.error(
          `Error reading interface ${interfaceName}: ${messageOf(error)}`,
        );

        const status = adtStatusOf(error);
        // 404는 구에서 안쪽 패키지가 삼켜 핸들러 자신의 문구가 `Failed to read
        // interface:`로 한 번 더 감싸진다(머리주석 참조). 마침표가 없는 것도
        // 구 그대로다.
        const message =
          status === 404
            ? `Failed to read interface: Interface ${interfaceName} not found`
            : status === 423
              ? `Interface ${interfaceName} is locked by another user.`
              : `Failed to read interface: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
