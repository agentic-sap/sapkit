/**
 * `GetNodeStructureLow` — 리포지터리 트리 **한 마디**를 날것 그대로.
 *
 * 구 핸들러: `engine/src/handlers/system/low/handleGetNodeStructure.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getUtils().fetchNodeStructure(...)` 한 줄이고(`:111-116`),
 * 요청 조립은 안쪽 패키지에 있다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:435-436`
 *   → `dist/core/shared/nodeStructure.js:29-56`
 *
 * 이 판에서는 그 와이어가 이미 `./internal/nodeStructure.ts`에 한 자리로 서 있다
 * (`GetObjectsByType`·`GetIncludesList`가 함께 쓴다). 여기서 다시 짜지 않는다.
 *
 * ## `node_id` 기본값이 **네 자리 `0000`**이다 — `GetPackageTree`와 다르다
 *
 * 겉 핸들러가 `args.node_id || '0000'`으로 읽으므로(`:114`) 이 도구는 **언제나**
 * `node_id` 질의 인자를 싣고, 본문의 `TV_NODEKEY`도 같은 값이 된다. 벤더가 가진
 * "`node_id`가 없으면 여섯 자리 `000000`" 갈래(`nodeStructure.js:38-39`)는 이
 * 도구에서 **도달하지 않는다** — 겉이 기본값을 먼저 채우기 때문이다. 발행
 * 스키마의 `default: "0000"`과도 같은 값이다.
 *
 * 빈 문자열을 주면 `||`가 falsy로 보고 `'0000'`으로 바꾼다. 그것도 구 그대로다.
 *
 * ## `with_short_descriptions`의 기본값은 참이다
 *
 * `args.with_short_descriptions !== false`(`:115`) — 주지 않으면 참이고,
 * `false`를 명시할 때만 거짓이다. 발행 스키마에는 `default`가 실리지 않으므로
 * (채록본에 없다) 기본값은 **선언이 아니라 코드**가 갖는다.
 *
 * ## 인자 검증은 접속보다 앞이다
 *
 * `parent_type`·`parent_name`이 비면 `return_error(new Error(...))`로 접는다
 * (`:84-89`) — SAP 호출이 나가기 전이다. 문구의 `Error: ` 접두사가 계약이다.
 *
 * ## 구와 다른 것 — 등재됨
 *
 * 세션 복원의 절반(`sap-adt-connection-id`를 호출자가 준 `session_id`로 바꾸는
 * 것)을 승계하지 않는다. 장부 D131 · 자세한 것은 `./internal/lowLevelSession.ts`.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { restoreStatefulSession } from './internal/lowLevelSession';
import { fetchNodeStructure } from './internal/nodeStructure';
import { ok, returnError } from './internal/results';

/** 겉 핸들러가 채우는 기본 노드 키 — 벤더 기본값 `000000`이 아니다. */
export const DEFAULT_NODE_ID = '0000';

/** 채록본의 `session_state` 모양 그대로 — `cookie_store`는 **빈 스키마**다. */
const sessionStateShape = z.object({
  cookies: z.string().optional(),
  csrf_token: z.string().optional(),
  cookie_store: z.unknown().optional(),
});

export const getNodeStructureLow = defineTool(
  {
    name: 'GetNodeStructureLow',
    description:
      '[low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.',
    inputSchema: {
      parent_type: z.string().describe('Parent object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K")'),
      parent_name: z.string().describe('Parent object name'),
      node_id: z
        .string()
        .default(DEFAULT_NODE_ID)
        .describe('Optional node ID (default: "0000" for root). Use to fetch child nodes.'),
      with_short_descriptions: z
        .boolean()
        .optional()
        .describe('Include short descriptions in response'),
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
    // 구 경로는 `handlers/system/low/`지만 **`low`가 아니다.** 구 서버는 이 도구를
    // `SystemHandlersGroup`에 등록했고(`engine/src/lib/handlers/groups/
    // SystemHandlersGroup.ts:331-333`), 런처는 `readonly` 노출에서 그 그룹을 통째로
    // 켠다(`engine/src/server/launcher.ts:277-280`). 그래서 채록본의 네 조건 전부에
    // 뜬다 — `sets: ['low']`로 적으면 어느 조건에도 안 뜬다.
    sets: ['system'],
    kind: 'read',
    targetNames: ['parent_name'],
  },
  async (context, args) => {
    try {
      if (!args?.parent_type) return returnError(new Error('parent_type is required'));
      if (!args?.parent_name) return returnError(new Error('parent_name is required'));

      const client = await context.getConnection();
      restoreStatefulSession(client, args);

      context.logger.info(
        `Fetching node structure for ${args.parent_type}/${args.parent_name}`,
      );

      const response = await fetchNodeStructure(client, {
        parentType: args.parent_type,
        parentName: args.parent_name,
        nodeId: args.node_id || DEFAULT_NODE_ID,
        withShortDescriptions: args.with_short_descriptions !== false,
      });

      context.logger.debug(
        `Node structure fetched successfully for ${args.parent_type}/${args.parent_name}`,
      );

      return ok(response.body);
    } catch (error) {
      context.logger.error('Failed to fetch node structure');
      return returnError(error);
    }
  },
);
