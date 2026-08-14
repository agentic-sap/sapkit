/**
 * UpdateFunctionGroup — 함수그룹의 **메타데이터(설명)만** 갈아 끼운다.
 *
 * 함수그룹은 소스가 없는 그릇이라 갱신할 코드가 없다. 그래서 이 도구가 하는 일은
 * 저장된 메타데이터 XML을 읽어 `adtcore:description` 한 속성을 바꿔 다시 올리는
 * 것뿐이다(구 `engine/src/handlers/function/high/handleUpdateFunctionGroup.ts:63-234`).
 *
 * ## 사슬 — 구가 실제로 보내는 다섯 요청
 *
 * ```
 * ① 콘텐츠 타입 협상  GET  /sap/bc/adt/discovery              (레거시면 **건너뛴다**)
 * ② 잠금             POST /sap/bc/adt/functions/groups/{소문자}?_action=LOCK&accessMode=MODIFY
 *    (그리고 200ms 대기 — 구가 "잠금이 확실히 서도록" 넣어 둔 자리)
 * ③ 현재 XML 읽기    GET  /sap/bc/adt/functions/groups/{대문자}          Accept: 와일드카드
 * ④ 메타데이터 PUT   PUT  /sap/bc/adt/functions/groups/{대문자}?lockHandle=…[&corrNr=…]
 * ⑤ 해제             POST /sap/bc/adt/functions/groups/{소문자}?_action=UNLOCK&lockHandle=…
 * ```
 *
 * **주소의 대소문자가 자리마다 다르다.** 잠금·해제는 벤더
 * `.../core/functionGroup/lock.js:19, 60`이 `functionGroupName.toLowerCase()`를 쓰고,
 * 읽기·PUT은 대문자 이름을 쓴다 — 읽기는 `read.js:16`의
 * `encodeSapObjectName(functionGroupName)`, PUT은 겉 핸들러가 직접 조립하는
 * `encodeSapObjectName(functionGroupName)`(`:152-153`)이다. 핸들러가 이름을 먼저
 * 대문자로 만들어 두므로(`:81`) 결과적으로 **잠금/해제만 소문자**다.
 * **접어 합치지 않는다** — 합치면 구가 보내던 주소가 달라진다.
 *
 * 잠금·해제 경로는 벤더가 인코딩을 **하지 않는다**(`toLowerCase()`만 부른다).
 * 네임스페이스 이름(`/ACME/ZFG`)에서 슬래시가 날것으로 나가는 것까지 구 그대로다.
 * 여기서 몰래 인코딩하면 구가 보내던 바이트가 달라진다.
 *
 * ## 설명은 **40자**에서 잘린다 — 60자가 아니다
 *
 * 구 핸들러가 이 자리에서만 40자로 자르고 `"`를 `&quot;`로 바꾼다(`:143-149`).
 * 다른 도구들이 쓰는 `limitDescription`은 60자라 **다른 함수**다. 잘린 것은
 * 전문에만 실리고, 응답의 `description`에는 **원본이 그대로** 실린다(`:192`).
 *
 * 갈아 끼우기는 정규식 한 방이다(`:146-149`) — 읽어 온 XML에
 * `adtcore:description="…"`이 **없으면 아무 일도 일어나지 않고** 원본 XML이
 * 그대로 PUT 된다. 구 그대로다.
 *
 * ## 활성화가 **없다** — 실측 결과다
 *
 * 이 사슬에는 활성화 단계가 없다. 구 핸들러에도 벤더 경로에도 없으며
 * (`steps_completed: ['lock','get_current','update_metadata','unlock']`가 그 증언이다),
 * 그래서 이 계열에는 「활성화 응답을 안 읽어 생기는 거짓 성공」이 **존재하지 않는다.**
 * 옆 계열(D2·D41·D121·D122)의 결론을 여기 옮겨 적지 않았다.
 *
 * ## 의도적 차이
 *
 * - **D123** — 잠금 응답의 `sap-adt-lm-handle` **헤더** 경로를 승계하지 않는다.
 * - **D124** — 콘텐츠 타입 협상 캐시가 `CreateFunctionGroup`과 공유되지 않는다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * - PUT의 타임아웃이 구의 하드코딩 30초 대신 접속 프로파일의 `default`다. 요청
 *   바이트에 나타나지 않는다.
 * - 실패 문구의 세부는 구 `extractAdtErrorMessage` 대신 `describeFailure`가 만든다 —
 *   엔진 자체 저작 진단 문구이며 장부 D13이 덮는 자리다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { functionErrorResult, isLegacySystem } from './functions';
import {
  FG_UPDATE_FALLBACK,
  negotiateFunctionGroupUpdateHeaders,
} from './functionGroupContentTypes';
import { describeFailure, encodeObjectName, okResult } from './shared';
import { functionGroupPath } from '../read/internal/adt';

/** 함수그룹 읽기의 Accept — 벤더 `core/functionGroup/read.js:22`의 와일드카드 기본값. */
const ACCEPT_FUNCTION_GROUP_READ = '*/*';

/** 구가 잠금 뒤에 넣어 둔 대기(`handleUpdateFunctionGroup.ts:126-127`). */
export const LOCK_SETTLE_MS = 200;

/**
 * 잠금·해제가 쓰는 경로 — 벤더 `lock.js:19, 60`. **인코딩하지 않고 소문자로만**
 * 만든다. 읽기·PUT의 `functionGroupPath()`(대문자 + 인코딩)와 규칙이 다르다.
 */
export function functionGroupLockPath(name: string): string {
  return `/sap/bc/adt/functions/groups/${name.toLowerCase()}`;
}

/** 구 핸들러가 이 자리에서만 쓰는 40자 자르기(`:143-145`). 공용 60자와 다른 함수다. */
export function limitFunctionGroupDescription(description: string): string {
  return description.length > 40 ? description.substring(0, 40) : description;
}

/** `adtcore:description="…"` 한 속성만 갈아 끼운다 — 없으면 아무 일도 없다(`:146-149`). */
export function patchFunctionGroupDescription(currentXml: string, description: string): string {
  const limited = limitFunctionGroupDescription(description).replace(/"/g, '&quot;');
  return currentXml.replace(/adtcore:description="[^"]*"/, `adtcore:description="${limited}"`);
}

function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}

export const updateFunctionGroup = defineTool(
  {
    name: 'UpdateFunctionGroup',
    description:
      "Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don't have source code to update directly. Uses stateful session with proper lock/unlock mechanism.",
    inputSchema: {
      function_group_name: z
        .string()
        .describe('Function group name (e.g., ZTEST_FG_001). Must exist in the system.'),
      description: z.string().describe('New description for the function group.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['function_group_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.function_group_name || !args.description) {
      return functionErrorResult('function_group_name and description are required');
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    logger.info(`Starting function group metadata update: ${functionGroupName}`);

    try {
      const client = await context.getConnection();

      // ① 협상. **잠그기 전**에 한다 — 구도 세션이 아직 stateless일 때 한다.
      //    레거시에서는 왕복 자체를 건너뛰고 v3 기본값을 쓴다(구 `:100-103`).
      const headers = isLegacySystem(context)
        ? FG_UPDATE_FALLBACK
        : await negotiateFunctionGroupUpdateHeaders(client, logger);

      const readPath = functionGroupPath(functionGroupName);

      // ②~⑤ 잠금 → (대기) → 읽기 → PUT → 해제.
      await client.withLock(functionGroupLockPath(functionGroupName), async (lock) => {
        // 구가 넣어 둔 대기. 와이어에는 나타나지 않지만 잠금이 서기 전에
        // 읽기가 나가는 것을 막으려던 자리라 그대로 옮긴다.
        await new Promise((resolve) => setTimeout(resolve, LOCK_SETTLE_MS));

        const current = await client.request({
          method: 'GET',
          path: readPath,
          accept: ACCEPT_FUNCTION_GROUP_READ,
          timeout: 'default',
        });
        if (!current.body) {
          throw new Error('Failed to get current function group data');
        }

        await client.request({
          method: 'PUT',
          path: readPath,
          params: { lockHandle: lock.handle, corrNr: args.transport_request },
          body: patchFunctionGroupDescription(current.body, args.description),
          contentType: headers.contentType,
          accept: headers.accept,
          timeout: 'default',
        });
      });

      logger.info(`UpdateFunctionGroup completed successfully: ${functionGroupName}`);

      return okResult({
        success: true,
        function_group_name: functionGroupName,
        // 응답에는 **자르지 않은 원본**이 실린다 — 전문에 실린 것과 다를 수 있다.
        description: args.description,
        transport_request: args.transport_request || 'local',
        message: `Function group ${functionGroupName} metadata updated successfully`,
        uri: `/sap/bc/adt/functions/groups/${encodeObjectName(functionGroupName)}`,
        steps_completed: ['lock', 'get_current', 'update_metadata', 'unlock'],
      });
    } catch (error) {
      const detail = describeFailure(error);
      logger.error(
        `Error updating function group metadata ${functionGroupName}: ${detail}`,
      );

      if (statusOf(error) === 404 || detail.includes('not found')) {
        return functionErrorResult(`Function group ${functionGroupName} not found.`);
      }
      return functionErrorResult(`Failed to update function group: ${detail}`);
    }
  },
);
