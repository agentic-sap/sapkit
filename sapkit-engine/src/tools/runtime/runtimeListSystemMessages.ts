/**
 * `RuntimeListSystemMessages` — SM02 시스템 메시지 목록.
 *
 * 구 핸들러: `engine/src/handlers/system/readonly/handleRuntimeListSystemMessages.ts`.
 *
 * ## 와이어 — 한 발
 *
 * ```
 * GET /sap/bc/adt/runtime/systemmessages
 *     [?$query=and ( equals ( user , <값> ) )][&$top=…][&from=…][&to=…]
 *     Accept: application/atom+xml;type=feed
 *     timeout: default
 * ```
 *
 * 겉 핸들러는 `fetchFeed(connection, FEED_URLS.systemMessages, {...}, 'user')`
 * 한 줄이고(`:52-62`), 질의 조립은 `runtimeFeedsHelper.ts:273-315`다. 사용자
 * 속성은 **`user`**다(Gateway 피드의 `username`이 아니다 — 겉 핸들러가 `:61`에서
 * 그 값을 준다). 인자 순서는 `$query` → `$top` → `from` → `to`이고,
 * `max_results`가 0이면 falsy라 실리지 않는 것까지 구와 같다.
 *
 * ## `RuntimeListFeeds`와의 관계
 *
 * `RuntimeListFeeds(feed_type='system_messages')`가 **같은 요청을 보내고 같은
 * 파서를 쓴다.** 갈라지는 것은 응답의 껍질뿐이다:
 *
 *  - 이 도구: `{ success, count, messages }`
 *  - 저 도구: `{ success, feed_type, count, entries }`
 *
 * 구에서도 두 핸들러가 같은 헬퍼를 불렀다. 그래서 파서는 한 자리
 * (`./internal/feedLists.ts`)에 두고 껍질만 각자 만든다.
 *
 * ## 응답
 *
 * `{ success: true, count, messages }`를 들여쓰기 2칸으로(`:65-79`).
 * 오류는 `return_error` — `Error: ` 접두사가 계약이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { FeedQueryOptions } from './internal/gatewayFeed';
import { ACCEPT_FEED, feedQueryParams } from './internal/gatewayFeed';
import { FEED_URLS, parseSystemMessages } from './internal/feedLists';
import { okJson, returnError } from './internal/results';

export const runtimeListSystemMessages = defineTool(
  {
    name: 'RuntimeListSystemMessages',
    description:
      '[runtime] List SM02 system messages. Returns structured entries with id, title, text, severity, validity period, and author.',
    inputSchema: {
      user: z.string().optional().describe('Filter by author username.'),
      max_results: z.number().optional().describe('Maximum number of messages to return.'),
      from: z.string().optional().describe('Start of time range in YYYYMMDDHHMMSS format.'),
      to: z.string().optional().describe('End of time range in YYYYMMDDHHMMSS format.'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/system/readonly/`이고 채록본의 네 조건 전부에 뜬다.
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const options: FeedQueryOptions = {
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      };

      const client = await context.getConnection();
      const response = await client.request({
        method: 'GET',
        path: FEED_URLS.systemMessages,
        // 사용자 속성은 `user`다 — Gateway 피드만 `username`이다.
        params: feedQueryParams(options, 'user'),
        accept: ACCEPT_FEED,
        timeout: 'default',
      });

      const messages = parseSystemMessages(response.body);

      return okJson({
        success: true,
        count: messages.length,
        messages,
      });
    } catch (error) {
      context.logger.error(`Error listing system messages: ${String(error)}`);
      return returnError(error);
    }
  },
);
