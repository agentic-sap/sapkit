/**
 * `GetObjectStructureLow` — 오브젝트 하나의 구조 문서를 날것 그대로.
 *
 * 구 핸들러: `engine/src/handlers/system/low/handleGetObjectStructure.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getUtils().getObjectStructure(type, name)` 한 줄이고
 * (`:99-102`), 요청은 안쪽 패키지가 조립한다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:560-562`
 *   → `dist/core/shared/objectStructure.js:27-44`
 *
 * ```
 * GET /sap/bc/adt/repository/objectstructure?objecttype={T}&objectname={N}
 *     Accept: application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml
 *     timeout: getTimeout('default')
 * ```
 *
 * ## ⚠ 이름이 **두 번** 인코딩된다 (구의 실측)
 *
 * `objectStructure.js:38`이 `encodeURIComponent(encodeSapObjectName(objectName))`
 * 인데 `encodeSapObjectName`은 그 자체가 `encodeURIComponent`다
 * (`dist/utils/internalUtils.js:19-21`). 그래서 네임스페이스 이름
 * `/1CPR/CL_X`는 `%252F1CPR%252FCL_X`로 나간다 — 한 겹이 아니라 두 겹이다.
 * 타입 쪽(`objecttype`)은 한 겹뿐이라 `CLAS/OC` → `CLAS%2FOC`다. **고치지
 * 않았다** — 구가 이 값으로 동작해 왔고, 실 시스템이 무엇을 받아들이는지는 이
 * 판이 확인할 수 없다.
 *
 * ## 인자가 비면 두 자리에서 걸린다 (문구가 다르다)
 *
 * 겉 핸들러가 먼저 `object_type is required`·`object_name is required`로 접고
 * (`:72-77`), 그 갈래를 지나면 벤더가 다시 `Object type is required`·
 * `Object name is required`로 던진다(`objectStructure.js:28-33`). **도달하는
 * 것은 겉의 문구**다 — 벤더 갈래는 죽은 방어다. 겉 문구만 옮긴다.
 *
 * ## 구와 다른 것 — 등재됨
 *
 * 세션 복원의 절반(`sap-adt-connection-id`)을 승계하지 않는다. 장부 D131.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { restoreStatefulSession } from './internal/lowLevelSession';
import { ok, returnError } from './internal/results';

export const OBJECT_STRUCTURE_PATH = '/sap/bc/adt/repository/objectstructure';

/** `objectStructure.js:41` 글자 그대로. */
export const ACCEPT_OBJECT_STRUCTURE =
  'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml';

/** 채록본의 `session_state` 모양 그대로 — `cookie_store`는 **빈 스키마**다. */
const sessionStateShape = z.object({
  cookies: z.string().optional(),
  csrf_token: z.string().optional(),
  cookie_store: z.unknown().optional(),
});

export const getObjectStructureLow = defineTool(
  {
    name: 'GetObjectStructureLow',
    description:
      '[low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.',
    inputSchema: {
      object_type: z
        .string()
        .describe('Object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K", "DDLS/DF")'),
      object_name: z.string().describe('Object name (e.g., "ZMY_CLASS", "ZMY_PROGRAM")'),
      session_id: z
        .string()
        .optional()
        .describe('Session ID from GetSession. If not provided, a new session will be created.'),
      session_state: sessionStateShape
        .optional()
        .describe(
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    // `handlers/system/low/`에 살지만 구 서버는 `SystemHandlersGroup`에 등록했다
    // (`SystemHandlersGroup.ts:337-339`) — `sets: ['low']`가 아니다.
    sets: ['system'],
    kind: 'read',
    targetNames: ['object_name'],
  },
  async (context, args) => {
    try {
      if (!args?.object_type) return returnError(new Error('object_type is required'));
      if (!args?.object_name) return returnError(new Error('object_name is required'));

      const client = await context.getConnection();
      restoreStatefulSession(client, args);

      context.logger.info(
        `Fetching object structure for ${args.object_type}/${args.object_name}`,
      );

      const response = await client.request({
        method: 'GET',
        path: OBJECT_STRUCTURE_PATH,
        params: {
          objecttype: args.object_type,
          // URL 계층이 한 겹 더 씌우므로 여기서 한 겹을 미리 씌운다 — 구의 두 겹.
          objectname: encodeObjectName(args.object_name),
        },
        accept: ACCEPT_OBJECT_STRUCTURE,
        timeout: 'default',
      });

      context.logger.debug(
        `Object structure fetched successfully for ${args.object_type}/${args.object_name}`,
      );

      return ok(response.body);
    } catch (error) {
      context.logger.error('Failed to fetch object structure');
      return returnError(error);
    }
  },
);
