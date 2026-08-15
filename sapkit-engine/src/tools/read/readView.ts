/**
 * ReadView — 뷰(DDLS)의 소스 **와** 메타데이터. 요청 **두 번**이다.
 *
 * 구 핸들러: `engine/src/handlers/view/readonly/handleReadView.ts`.
 * 와이어 근거는 `./internal/view.ts` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## `GetView`와 무엇이 다른가 (실측)
 *
 *  1. **왕복 수** — 소스(`…/source/main?version=…`, Accept `text/plain`) 뒤에
 *     메타데이터(`…/{name}`, Accept `application/vnd.sap.adt.ddlSource+xml`)를
 *     한 번 더 부른다. 메타데이터 쪽에는 **`version`이 실리지 않는다** — 구
 *     핸들러가 `readMetadata({ viewName })`를 옵션 없이 부르기 때문이다.
 *  2. **응답 키** — `source_code`·`metadata`. `GetView`의 `view_data`·`status`·
 *     `status_text`와 겹치는 키가 하나도 없다.
 *  3. **실패를 오류로 올리지 않는다** — 두 왕복 모두 최선 노력이다. 뷰가
 *     없어도(404) 응답은 `success: true`이고 값만 `null`이 된다. `GetView`는
 *     같은 상황에서 오류다. 이 관대함이 `ReadView`를 `readonly` 집합에 둘 수
 *     있게 하는 성질이며, 채록본 `exposures`에서도 이 도구만 네 조건 전부에
 *     뜬다(`GetView`는 둘뿐).
 *
 * ## 빈 본문은 `null`로 남는다
 *
 * 구는 `if (readResult?.readResult?.data)` — **truthy 검사**로 값을 채운다.
 * 그래서 본문이 빈 문자열이면 200이어도 `source_code`는 `null`이다. 여기서
 * `!== undefined`로 바꾸면 빈 뷰의 응답이 구와 달라진다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from './internal/results';
import { readViewMetadata, readViewSource } from './internal/view';

export const readView = defineTool(
  {
    name: 'ReadView',
    description:
      '[read-only] Read ABAP view (CDS view) source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      view_name: z.string().describe('View name (e.g., Z_MY_VIEW).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/view/readonly/`이고, 채록본 `exposures`의 네 조건
    // (connected/noProfile × default/readonly) 전부에 뜬다 — 뷰 묶음에서 이
    // 도구 하나뿐이다.
    sets: ['readonly'],
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

      let sourceCode: string | null = null;
      try {
        const response = await readViewSource(client, viewName, version);
        // truthy 검사 — 빈 본문은 `null`로 남는다(머리주석 참조).
        if (response.body) sourceCode = response.body;
      } catch (error) {
        context.logger.warn(`Could not read source for ${viewName}: ${messageOf(error)}`);
      }

      // 소스가 실패해도 메타데이터는 **그대로 시도한다** — 구가 두 블록을 서로
      // 독립된 try로 두었다. 하나가 죽었다고 다른 하나를 건너뛰지 않는다.
      let metadata: string | null = null;
      try {
        const response = await readViewMetadata(client, viewName);
        if (response.body) metadata = response.body;
      } catch (error) {
        context.logger.warn(`Could not read metadata for ${viewName}: ${messageOf(error)}`);
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            view_name: viewName,
            version,
            source_code: sourceCode,
            metadata,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
