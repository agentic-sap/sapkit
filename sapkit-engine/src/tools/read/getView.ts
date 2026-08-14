/**
 * GetView — 뷰(DDLS) 소스 한 벌. 요청 **한 번**으로 끝난다.
 *
 * 구 핸들러: `engine/src/handlers/view/high/handleGetView.ts`.
 * 와이어 근거는 `./internal/view.ts` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## `ReadView`와 무엇이 다른가 (실측)
 *
 * 이름이 비슷하지만 **같은 도구가 아니다.** 대충 같게 지으면 아래 셋이 조용히
 * 사라진다 — 시험이 셋 다 못박는다(`__tests__/getView.test.ts`).
 *
 *  1. **왕복 수** — `GetView`는 소스 하나(1회), `ReadView`는 소스 + 메타데이터(2회).
 *  2. **응답 키** — `GetView`는 `view_data`·`status`·`status_text`,
 *     `ReadView`는 `source_code`·`metadata`. 겹치는 키가 하나도 없다.
 *  3. **없는 뷰의 취급** — `GetView`는 **오류**로 답하고, `ReadView`는
 *     `success: true` + 전부 `null`로 답한다. 안전 등급도 갈린다:
 *     `ReadView`만 `readonly` 집합이라 `--exposition=readonly` 표면에 뜬다.
 *
 * ## 404 문구가 이중으로 포장돼 있는 이유 (구의 실제 관측값)
 *
 * 구 핸들러에는 `if (error.response?.status === 404) → 'View X not found.'`라는
 * 갈래가 있지만 **그 줄은 도달하지 않는다.** 벤더의 `AdtView.read()`가 404를
 * 예외가 아니라 `undefined`로 접어 돌려주기 때문이다(`dist/core/view/AdtView.js`
 * 의 `read()` — `if (e.response?.status === 404) return undefined`). 그래서
 * 핸들러는 `!readResult` 갈래로 들어가 `View X not found`를 **자기 try 안에서**
 * 던지고, 자기 catch가 그것을 다시 `Failed to read view: …`로 감싼다. 관측되는
 * 문구는 `Failed to read view: View X not found`이지 `View X not found.`가
 * 아니다. 여기서는 **관측값을 승계한다** — 도달하지 않는 갈래를 되살리면 그것이
 * 구와의 차이가 된다. 반대로 423은 `read()`가 그대로 되던지므로 살아 있는
 * 갈래이고, 문구도 마침표까지 구 그대로다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { adtStatusOf, statusTextFor } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';
import { readViewSource } from './internal/view';

export const getView = defineTool(
  {
    name: 'GetView',
    description:
      'Retrieve ABAP view definition. Supports reading active or inactive version.',
    inputSchema: {
      view_name: z.string().describe('View name (e.g., Z_MY_VIEW).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/view/high/`이고, 채록본 `exposures`에서도
    // connected_default·noProfile_default 둘에만 뜬다(readonly 조건에는 없다).
    sets: ['high'],
    kind: 'read',
    targetNames: ['view_name'],
  },
  async (context, args) => {
    try {
      const { view_name, version = 'active' } = args;

      if (!view_name) {
        return returnError(new Error('view_name is required'));
      }

      const client = await context.getConnection();
      const viewName = view_name.toUpperCase();

      context.logger.info(`Reading view ${viewName}, version: ${version}`);

      try {
        const response = await readViewSource(client, viewName, version);

        context.logger.info(`GetView completed successfully: ${viewName}`);
        return ok(
          JSON.stringify(
            {
              success: true,
              view_name: viewName,
              version,
              // 구는 axios가 파싱해 둔 `data`가 객체일 때 JSON.stringify로
              // 접었다. 신 접속 계층의 `body`는 언제나 문자열이라 그 갈래가
              // 사라졌을 뿐 결과는 같다 — 차이가 아니다.
              view_data: response.body,
              status: response.status,
              status_text: statusTextFor(response.status),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(`Error reading view ${viewName}: ${messageOf(error)}`);

        const status = adtStatusOf(error);
        const message =
          status === 404
            ? // 머리주석 참조 — 구에서 관측되는 문구는 이 이중 포장이다.
              `Failed to read view: View ${viewName} not found`
            : status === 423
              ? `View ${viewName} is locked by another user.`
              : `Failed to read view: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
