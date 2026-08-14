/**
 * RuntimeListDumps — ST22 런타임 덤프 피드를 페이징·사용자 필터로 읽는다.
 *
 * ## 와이어 근거
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleRuntimeListDumps.ts:49-93`)는
 * `AdtRuntimeClient`에 위임하고, 실제 요청은
 * `@babamba2/mcp-abap-adt-clients/dist/runtime/dumps/read.js:47-73`이 조립한다:
 *
 *  - `GET /sap/bc/adt/runtime/dumps`
 *  - 질의 인자 순서 `$query` → `$inlinecount` → `$top` → `$skip` → `$orderby`,
 *    **`undefined`·`null`·빈 문자열은 싣지 않는다**(`appendIfDefined`).
 *  - `Accept: application/atom+xml;type=feed`, 타임아웃은 `default`.
 *
 * `user`가 있으면 `listRuntimeDumpsByUser`를 타는데, 그것은 같은 함수에
 * `$query = and( equals( user, <트림한 값> ) )`를 얹은 것뿐이다(`read.js:37-73`).
 * 괄호 안쪽 공백까지 구 문자열 그대로다 — 이 값은 SAP이 파싱하는 식이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 질의 인자의 인코딩. 구는 `URLSearchParams`라 공백이 `+`, 괄호가 `%28`로
 * 나갔고, 신 엔진의 URL 계층은 언제나 `encodeURIComponent`(공백 `%20`, 괄호는
 * 그대로)다 — 그 선택의 근거는 `src/adt/url.ts:1-13`에 있고 **도구가 아니라
 * 계층이 소유한다.** 폼 디코딩이든 퍼센트 디코딩이든 두 표현은 같은 문자열로
 * 풀린다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { parseRuntimePayload } from './internal/payload';
import { okJson, returnError } from './internal/results';

export const DUMPS_PATH = '/sap/bc/adt/runtime/dumps';
export const ACCEPT_DUMPS_FEED = 'application/atom+xml;type=feed';

/** `read.js:37-43` — 트림 후 비면 질의를 아예 만들지 않는다. */
export function dumpsUserQuery(user: string | undefined): string | undefined {
  const normalized = user?.trim();
  if (!normalized) return undefined;
  return `and( equals( user, ${normalized} ) )`;
}

/** `read.js:26-31` — `undefined`·`null`·빈 문자열은 인자가 아니다. */
const defined = (value: string | number | undefined): string | undefined =>
  value === undefined || value === null || value === '' ? undefined : String(value);

export const runtimeListDumps = defineTool(
  {
    name: 'RuntimeListDumps',
    description:
      '[runtime] List ABAP runtime dumps with optional user filter and paging. Returns parsed JSON payload.',
    inputSchema: {
      user: z
        .string()
        .describe('Optional username filter. If omitted, dumps for all users are returned.')
        .optional(),
      inlinecount: z
        .enum(['allpages', 'none'])
        .describe('Include total count metadata.')
        .optional(),
      top: z.number().describe('Maximum number of records to return.').optional(),
      skip: z.number().describe('Number of records to skip.').optional(),
      orderby: z.string().describe('ADT order by expression.').optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const client = await context.getConnection();
      const { user, inlinecount, top, skip, orderby } = args;

      const response = await client.request({
        method: 'GET',
        path: DUMPS_PATH,
        params: {
          $query: dumpsUserQuery(user),
          $inlinecount: defined(inlinecount),
          $top: defined(top),
          $skip: defined(skip),
          $orderby: defined(orderby),
        },
        accept: ACCEPT_DUMPS_FEED,
        timeout: 'default',
      });

      return okJson({
        success: true,
        // 구 그대로 — 빈 문자열도 `null`로 접힌다(`|| null`).
        user_filter: user || null,
        status: response.status,
        payload: parseRuntimePayload(response.body),
      });
    } catch (error) {
      context.logger.error(`Error listing runtime dumps: ${String(error)}`);
      return returnError(error);
    }
  },
);
