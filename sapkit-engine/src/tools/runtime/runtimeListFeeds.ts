/**
 * `RuntimeListFeeds` — ADT 런타임 피드 다섯 갈래를 한 도구로.
 *
 * 구 핸들러: `engine/src/handlers/system/readonly/handleRuntimeListFeeds.ts`.
 *
 * ## 와이어 — `feed_type`이 주소와 파서를 함께 고른다 (`:93-150`)
 *
 * ```
 * descriptors     GET /sap/bc/adt/feeds                     → parseFeedDescriptors
 * variants        GET /sap/bc/adt/feeds/variants            → parseFeedVariants
 * dumps           GET /sap/bc/adt/runtime/dumps      +질의  → parseRuntimeDumpFeed
 * system_messages GET /sap/bc/adt/runtime/systemmessages +질의 → parseSystemMessages
 * gateway_errors  GET /sap/bc/adt/gw/errorlog        +질의  → parseGatewayErrors
 *   Accept: application/atom+xml;type=feed   ·  timeout: default
 * ```
 *
 * **앞의 둘에는 질의 인자가 붙지 않는다.** 겉 핸들러가 `fetchFeed`를 쓰지 않고
 * `makeAdtRequestWithTimeout`을 직접 부르기 때문이다(`:95-103`·`:108-116`) —
 * `user`·`max_results`·`from`·`to`를 줘도 무시된다.
 *
 * ## ⚠ 사용자 필터의 속성 이름이 피드마다 다르다
 *
 * `dumps`·`system_messages`는 `user`, `gateway_errors`는 `username`이다
 * (`:125`·`:135`·`:145`). 질의 문자열은
 * `and ( equals ( <속성> , <트림한 값> ) )`이고 괄호 안쪽 공백까지 구 그대로다
 * (`runtimeFeedsHelper.ts:277-282`) — SAP이 파싱하는 식이라 공백이 계약이다.
 *
 * ## ⚠ 같은 덤프 피드를 `RuntimeListDumps`와 **다른 질의로** 부른다
 *
 * 둘 다 `/sap/bc/adt/runtime/dumps`로 가지만 질의 조립이 갈린다:
 *
 * | | 사용자 질의 | 나머지 인자 |
 * |---|---|---|
 * | `RuntimeListDumps` | `and( equals( user, X ) )` (공백 적음) | `$inlinecount`·`$top`·`$skip`·`$orderby` |
 * | `RuntimeListFeeds` | `and ( equals ( user , X ) )` (공백 많음) | `$top`·`from`·`to` |
 *
 * 두 조립기가 구에서도 서로 다른 파일에 있었다(`@babamba2/…/dist/runtime/dumps/
 * read.js:37-73` 대 `runtimeFeedsHelper.ts:273-315`). 합치면 한쪽의 와이어가
 * 바뀐다 — 합치지 않았다.
 *
 * ## 응답
 *
 * `{ success: true, feed_type, count, entries }`를 들여쓰기 2칸으로
 * (`:152-167`). 파서 다섯이 전부 배열을 돌려주므로 `count`는 언제나 수다 —
 * `Array.isArray(data) ? data.length : undefined` 갈래의 뒤쪽은 도달하지 않는다.
 *
 * 구는 `return_response`에 `status`·`statusText`·`headers`·`config`도 실었지만
 * 그 함수가 읽는 것은 `data` 하나뿐이다(`engine/src/lib/utils.ts:97-107`).
 * 프로토콜에 실린 적이 없는 값이라 옮기지 않았다.
 */

import * as z from 'zod';

import type { AdtClient, AdtResponse } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { FeedQueryOptions } from './internal/gatewayFeed';
import { ACCEPT_FEED, feedQueryParams, parseGatewayErrors } from './internal/gatewayFeed';
import {
  FEED_URLS,
  FEEDS_PATH,
  FEED_VARIANTS_PATH,
  parseFeedDescriptors,
  parseFeedVariants,
  parseRuntimeDumpFeed,
  parseSystemMessages,
} from './internal/feedLists';
import { okJson, returnError } from './internal/results';

const FEED_TYPES = ['descriptors', 'variants', 'dumps', 'system_messages', 'gateway_errors'] as const;

type FeedType = (typeof FEED_TYPES)[number];

/** 질의 인자 없이 한 발 (`handleRuntimeListFeeds.ts:95-116`). */
function getPlainFeed(client: AdtClient, path: string): Promise<AdtResponse> {
  return client.request({ method: 'GET', path, accept: ACCEPT_FEED, timeout: 'default' });
}

/** 질의 인자를 붙여 한 발 (`runtimeFeedsHelper.ts:297-315`). */
function getFilteredFeed(
  client: AdtClient,
  path: string,
  options: FeedQueryOptions,
  userAttribute: string,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path,
    params: feedQueryParams(options, userAttribute),
    accept: ACCEPT_FEED,
    timeout: 'default',
  });
}

export const runtimeListFeeds = defineTool(
  {
    name: 'RuntimeListFeeds',
    description:
      '[runtime] List available ADT runtime feeds or read a specific feed type. Feed types: dumps, system_messages, gateway_errors. Without feed_type returns available feed descriptors.',
    inputSchema: {
      feed_type: z
        .enum(FEED_TYPES)
        .default('descriptors')
        .describe(
          'Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.',
        ),
      user: z.string().optional().describe('Filter feed entries by SAP username.'),
      max_results: z.number().optional().describe('Maximum number of entries to return.'),
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
      const feedType: FeedType = args?.feed_type ?? 'descriptors';
      const options: FeedQueryOptions = {
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      };

      const client = await context.getConnection();

      let entries: unknown[];
      switch (feedType) {
        case 'descriptors':
          entries = parseFeedDescriptors((await getPlainFeed(client, FEEDS_PATH)).body);
          break;
        case 'variants':
          entries = parseFeedVariants((await getPlainFeed(client, FEED_VARIANTS_PATH)).body);
          break;
        case 'dumps':
          entries = parseRuntimeDumpFeed(
            (await getFilteredFeed(client, FEED_URLS.dumps, options, 'user')).body,
          );
          break;
        case 'system_messages':
          entries = parseSystemMessages(
            (await getFilteredFeed(client, FEED_URLS.systemMessages, options, 'user')).body,
          );
          break;
        case 'gateway_errors':
          entries = parseGatewayErrors(
            (await getFilteredFeed(client, FEED_URLS.gatewayErrors, options, 'username')).body,
          );
          break;
      }

      return okJson({
        success: true,
        feed_type: feedType,
        count: entries.length,
        entries,
      });
    } catch (error) {
      context.logger.error(`Error reading feeds: ${String(error)}`);
      return returnError(error);
    }
  },
);
