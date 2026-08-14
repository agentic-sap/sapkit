/**
 * `ListTransports` — 한 사용자의 이송요청 목록.
 *
 * 구 핸들러: `engine/src/handlers/transport/readonly/handleListTransports.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getRequest().list({user, status})` 한 줄이고(`:139-143`),
 * 실제 요청은 안쪽 패키지에서 조립된다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/transport/AdtRequest.js`의 `list()`
 *   → `dist/core/transport/list.js:14-31`
 *
 * ```
 * GET /sap/bc/adt/cts/transportrequests?user=<user>[&status=D]
 *     Accept: application/vnd.sap.adt.transportorganizertree.v1+xml
 *     timeout: getTimeout('default')
 * ```
 *
 * `Accept`는 `dist/constants/contentTypes.js:37`의 `ACCEPT_TRANSPORT_LIST`
 * **한 값**이다 — `GetTransport`가 싣는 두 값짜리 줄과 다르다.
 *
 * `user`는 **언제나 실린다.** 벤더가 `new URLSearchParams({ user: params.user })`로
 * 시작하기 때문에(`list.js:16`) 값이 빈 문자열이면 `?user=`가 그대로 나간다.
 * 나머지 넷(`status`·`dateRange`·`targetSystem`·`type`)은 값이 있을 때만 붙고,
 * 겉 핸들러는 그중 `status` 하나만 넘긴다 — `modifiable_only`가 참이면 `'D'`,
 * 거짓이면 `undefined`(인자 자체가 빠진다).
 *
 * 사용자 기본값은 `args.user || getSystemContext().responsible || SAP_USERNAME || ''`
 * (`:129-133`)이고, 그 `responsible`은 다시 `SAP_RESPONSIBLE || SAP_USERNAME`이다.
 * 여기서는 env에서만 읽는다 — 이미 등재된 결정이다(`harness/DIVERGENCES.md` D62).
 *
 * ## 파서 옵션이 `GetTransport`와 다르다 (구의 실측)
 *
 * 이쪽 파서에는 **`parseAttributeValue`가 없다**(`:95-101`). 그래서
 * `tm:source_client="100"` 같은 값이 수로 바뀌지 않는다 — 같은 XML을 두 도구가
 * 서로 다르게 읽는다는 뜻이고, 구가 그렇다. 맞추지 않았다.
 *
 * ## 네 자리를 전부 훑는다 (구가 고쳤던 자리)
 *
 * 응답은 `tm:root > tm:workbench|tm:customizing > tm:modifiable|tm:released >
 * tm:request[]`다. 구 주석(`:51-62`)이 밝히듯 예전 판은 가운데 층을 빼먹어
 * **조용히 0건**을 돌려줬다. 네 자리를 전부 훑고, 하나도 없으면 뿌리 밑 평평한
 * 모양을 back-compat으로 본다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { ok, returnError } from './internal/results';

const ROOT_PATH = '/sap/bc/adt/cts/transportrequests';

/** `dist/constants/contentTypes.js:37`의 `ACCEPT_TRANSPORT_LIST`. */
const ACCEPT_TRANSPORT_LIST = 'application/vnd.sap.adt.transportorganizertree.v1+xml';

/** 구 `parseTransportListXml`의 파서(`handleListTransports.ts:95-101`) 그대로. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => ['tm:request', 'tm:task'].includes(name),
});

type Node = Record<string, unknown>;

interface TransportEntry {
  readonly number: string;
  readonly description: string;
  readonly type: string;
  readonly status: string;
  readonly owner: string;
  readonly target: string;
}

const asArray = (value: unknown): Node[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value as Node];

/** 구 `collectRequests`(`:63-92`) — 두 갈래 × 두 상태, 그다음 평평한 폴백. */
function collectRequests(root: Node | undefined | null): Node[] {
  const out: Node[] = [];
  if (!root) return out;
  for (const catKey of ['tm:workbench', 'tm:customizing']) {
    const category = root[catKey] as Node | undefined;
    if (!category) continue;
    for (const statusKey of ['tm:modifiable', 'tm:released']) {
      const group = category[statusKey] as Node | undefined;
      if (!group) continue;
      out.push(...asArray(group['tm:request']));
    }
  }
  if (out.length === 0 && root['tm:request']) out.push(...asArray(root['tm:request']));
  return out;
}

/** 구 `parseTransportListXml`(`:94-120`). */
export function parseTransportListXml(xml: string): TransportEntry[] {
  const result = parser.parse(xml) as Node;
  // 구는 `result` 자체까지 뿌리 후보로 본다 — 알아볼 수 없는 문서에서 빈 목록이
  // 나오는 것은 `collectRequests`가 아무것도 못 찾기 때문이다.
  const root = (result['tm:root'] || result['tm:roots'] || result) as Node;
  return collectRequests(root)
    .filter((request) => request)
    .map((request) => ({
      number: (request['tm:number'] as string) || (request['adtcore:name'] as string) || '',
      description: (request['tm:desc'] as string) || (request['tm:description'] as string) || '',
      type: (request['tm:type'] as string) || '',
      status: (request['tm:status'] as string) || '',
      owner: (request['tm:owner'] as string) || '',
      target: (request['tm:target'] as string) || '',
    }))
    .filter((entry) => entry.number);
}

/** 구 `getSystemContext().responsible || SAP_USERNAME || ''`의 자리(D62 참조). */
function sessionUserOf(env: ToolContext['env']): string {
  return env['SAP_RESPONSIBLE'] || env['SAP_USERNAME'] || '';
}

export const listTransports = defineTool(
  {
    name: 'ListTransports',
    description:
      '[read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests.',
    inputSchema: {
      user: z
        .string()
        .optional()
        .describe('SAP user name. If not provided, returns transports for the current user.'),
      modifiable_only: z
        .boolean()
        .optional()
        .describe('Only return modifiable (not yet released) transports. Default: true.'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/transport/readonly/`이고 채록본 exposures 네 조건 전부에 뜬다.
    sets: ['readonly'],
    // 구 `readonlyGuard`의 READ_PREFIXES에 `List`가 있어 읽기다.
    kind: 'read',
  },
  async (context, args) => {
    try {
      const modifiableOnly = args.modifiable_only !== false;
      const user = args.user || sessionUserOf(context.env);

      context.logger.debug(`ListTransports: user=${user}, modifiable_only=${modifiableOnly}`);

      const client = await context.getConnection();
      const response = await client.request({
        method: 'GET',
        path: ROOT_PATH,
        // `user`는 빈 문자열이어도 실린다 — 벤더가 그렇게 조립한다.
        params: { user, ...(modifiableOnly ? { status: 'D' } : {}) },
        accept: ACCEPT_TRANSPORT_LIST,
        timeout: 'default',
      });

      const transports = parseTransportListXml(response.body || '');
      context.logger.info(`ListTransports: found ${transports.length} transport(s)`);

      return ok(
        JSON.stringify({ success: true, count: transports.length, transports }, null, 2),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
