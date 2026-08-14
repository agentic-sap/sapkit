/**
 * SAP Gateway 오류 로그(/IWFND/ERROR_LOG) 피드 — 질의 조립과 Atom 파싱.
 *
 * ## 어디서 읽었나
 *
 * 이 계열만은 안쪽 패키지에 위임하지 않는다. 구 엔진이 fr0ster의 `FeedRepository`를
 * 자기 트리로 이식해 두었고(`engine/src/handlers/system/readonly/runtimeFeedsHelper.ts:1-14`),
 * 겉 핸들러가 그 헬퍼를 직접 부른다(`handleRuntimeGetGatewayErrorLog.ts:56-124`).
 * 안쪽 패키지에 닿는 지점은 `lib/utils.ts:902-921`의 `makeAdtRequestWithTimeout`
 * → `connection.makeAdtRequest` 한 줄이고, 거기서 `Accept`는 호출자가 준 값이
 * 이긴다(`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:159-166`).
 *
 * 그래서 이 파일이 복원하는 것은 셋이다:
 *  - 질의 조립 (`runtimeFeedsHelper.ts:273-315`) — 사용자 필터의 속성 이름이
 *    피드마다 다르다. Gateway는 `username`이고 덤프·시스템 메시지는 `user`다.
 *  - 목록 Atom 파싱 (`:377-429`) — 값의 대부분이 `<atom:summary type="html">`
 *    안의 HTML 표에 들어 있어 그 표를 긁어야 한다.
 *  - 상세 XML 파싱 (`:493-576`) — `errorlog:` 접두사가 있는 모양과 없는 모양을
 *    모두 받는다.
 */

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient, AdtResponse } from '../../../adt';

/** `runtimeFeedsHelper.ts:20-24` — 이 도구가 쓰는 것은 gatewayErrors 하나다. */
export const GATEWAY_ERRORLOG_PATH = '/sap/bc/adt/gw/errorlog';
export const ACCEPT_FEED = 'application/atom+xml;type=feed';

/** `runtimeFeedsHelper.ts:152-157`의 설정 그대로 — 엔티티를 **풀지 않는다**. */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
});

export interface GatewayErrorEntry {
  readonly type: string;
  readonly shortText: string;
  readonly transactionId: string;
  readonly package: string;
  readonly applicationComponent: string;
  readonly dateTime: string;
  readonly username: string;
  readonly client: string;
  readonly requestKind: string;
  readonly link?: string;
}

export interface FeedQueryOptions {
  readonly user?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const text = record['#text'];
    if (typeof text === 'string') return text;
    if (typeof text === 'number') return String(text);
    return '';
  }
  return String(value);
}

function extractCategoryTerm(entry: Record<string, unknown>): string | undefined {
  const category = entry['category'];
  if (!category) return undefined;
  if (typeof category === 'object') {
    return (category as Record<string, unknown>)['@_term'] as string | undefined;
  }
  return String(category);
}

/** `runtimeFeedsHelper.ts:186-200`. */
function decodeHtmlEntitiesOnce(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

/**
 * ADT 피드는 HTML을 **두 겹으로** 이스케이프해 보낸다(`&amp;nbsp;`). 안정될
 * 때까지 최대 3번 푼다 (`runtimeFeedsHelper.ts:207-216`).
 */
function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  let previous = input;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeHtmlEntitiesOnce(previous);
    if (next === previous) return next;
    previous = next;
  }
  return previous;
}

/**
 * `<b>라벨</b></td><td>값</td>` 표를 소문자 라벨 → 값의 Map으로 접는다
 * (`runtimeFeedsHelper.ts:224-254`). **먼저 나온 라벨이 이긴다.**
 */
export function parseHtmlSummaryTable(summaryHtml: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!summaryHtml) return map;
  const decoded = summaryHtml.includes('&lt;') ? decodeHtmlEntities(summaryHtml) : summaryHtml;
  const rowRegex = /<b[^>]*>\s*([^<]+?)\s*<\/b>\s*<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
  let match: RegExpExecArray | null = rowRegex.exec(decoded);
  while (match) {
    const label = (match[1] ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const value = (match[2] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (label && !map.has(label)) map.set(label, value);
    match = rowRegex.exec(decoded);
  }
  return map;
}

/** `FrontendError` → `Frontend Error` (`runtimeFeedsHelper.ts:260-266`). */
function prettyTypeFromIdPrefix(prefix: string): string {
  if (!prefix) return '';
  return prefix
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 피드 질의 인자. Gateway 피드의 사용자 속성은 `username`이다
 * (`handleRuntimeGetGatewayErrorLog.ts:100`가 그 값을 넘긴다).
 *
 * 인자 순서는 구 `URLSearchParams` 조립 순서 그대로다: `$query` → `$top` →
 * `from` → `to`. `maxResults`가 0이면 실리지 않는 것도 구와 같다(falsy 검사).
 */
export function feedQueryParams(
  options: FeedQueryOptions,
  userAttribute = 'username',
): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  if (options.user) {
    params['$query'] = `and ( equals ( ${userAttribute} , ${options.user.trim()} ) )`;
  }
  if (options.maxResults) params['$top'] = String(options.maxResults);
  if (options.from) params['from'] = options.from;
  if (options.to) params['to'] = options.to;
  return params;
}

/** GET 피드 (`runtimeFeedsHelper.ts:297-315`). */
export function fetchGatewayErrorFeed(
  client: AdtClient,
  options: FeedQueryOptions,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: GATEWAY_ERRORLOG_PATH,
    params: feedQueryParams(options),
    accept: ACCEPT_FEED,
    timeout: 'default',
  });
}

/** GET 상세 (`handleRuntimeGetGatewayErrorLog.ts:64-72`) — 주소는 호출자가 준 것. */
export function fetchGatewayErrorDetail(
  client: AdtClient,
  errorUrl: string,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: errorUrl,
    accept: ACCEPT_FEED,
    timeout: 'default',
  });
}

/** 목록 Atom 파싱 (`runtimeFeedsHelper.ts:377-429`). */
export function parseGatewayErrors(xml: string): GatewayErrorEntry[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown> | undefined;
  const feed = parsed?.['feed'] as Record<string, unknown> | undefined;
  if (!feed?.['entry']) return [];

  return toArray<Record<string, unknown>>(
    feed['entry'] as Record<string, unknown> | Record<string, unknown>[],
  ).map((entry) => {
    // atom:id의 접두사가 항목 종류다 — "FrontendError/020000DD…" → "Frontend Error".
    const rawId = typeof entry['id'] === 'string' ? entry['id'] : '';
    const slashIndex = rawId.indexOf('/');
    const idPrefix = slashIndex > 0 ? rawId.slice(0, slashIndex) : '';
    const type = prettyTypeFromIdPrefix(idPrefix) || extractCategoryTerm(entry) || '';

    const summaryHtml =
      typeof entry['summary'] === 'object'
        ? extractText(entry['summary'])
        : String(entry['summary'] ?? '');
    const table = parseHtmlSummaryTable(summaryHtml);

    // 트랜잭션 ID 칸에는 "(Replay in GW Client)" 링크가 따라붙는다 — 첫 공백에서 자른다.
    const transactionId = (table.get('transaction id') ?? '').split(/\s+/)[0] ?? '';
    const shortText = table.get('short text') ?? extractText(entry['title']) ?? '';

    const link = entry['link'] as Record<string, unknown> | undefined;
    const hrefFromLink = link?.['@_href'] as string | undefined;
    const guid = slashIndex > 0 ? rawId.slice(slashIndex + 1) : '';
    const synthesized =
      type && guid ? `${GATEWAY_ERRORLOG_PATH}/${encodeURIComponent(type)}/${guid}` : '';
    const author = entry['author'] as Record<string, unknown> | undefined;

    return {
      type,
      shortText,
      transactionId,
      package: table.get('package') ?? '',
      applicationComponent: table.get('application component') ?? '',
      dateTime: (entry['updated'] as string | undefined) ?? '',
      username: (author?.['name'] as string | undefined) ?? '',
      client: table.get('client') ?? '',
      requestKind: table.get('request kind') ?? '',
      link: hrefFromLink || synthesized,
    };
  });
}

/**
 * 값의 타입이 `string`이 아니라 `string | number`인 자리들이 있다. 태그 값은
 * 파서가 숫자로 바꾸므로(`parseTagValue` 기본 참) `<client>100</client>`는
 * 숫자 `100`으로 실린다. 구 인터페이스는 `string`이라 적어 두었지만 **런타임
 * 값은 숫자였고 그대로 직렬화됐다** — 여기서는 타입을 실측에 맞춘다.
 */
export interface GatewayErrorDetail {
  readonly type: string;
  readonly shortText: string | number;
  readonly transactionId: string | number;
  readonly package: string | number;
  readonly applicationComponent: string | number;
  readonly dateTime: string | number;
  readonly username: string | number;
  readonly client: string | number;
  readonly requestKind: string | number;
  readonly serviceInfo: Record<string, string>;
  readonly errorContext: {
    readonly errorInfo: string | number;
    readonly resolution: Record<string, unknown>;
    readonly exceptions: ReadonlyArray<{ type: string; text: string; raiseLocation: string }>;
  };
  readonly sourceCode: {
    readonly lines: ReadonlyArray<{
      number: number | string;
      content: string;
      isError: boolean;
    }>;
    readonly errorLine: number | string;
  };
  readonly callStack: ReadonlyArray<{
    number: number | string;
    event: string;
    program: string;
    name: string;
    line: number | string;
  }>;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** 속성에서 온 값 — 파서가 속성은 문자열로 두므로 이쪽은 정말 문자열이다. */
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * 구의 `a ?? b ?? ''` 그대로 — **타입을 강제하지 않는다.** 태그 값이 숫자로
 * 파싱된 자리를 문자열로 눌러 담으면 구와 다른 응답이 된다.
 */
const firstDefined = (...candidates: unknown[]): string | number => {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) return candidate as string | number;
  }
  return '';
};

/**
 * 상세 XML 파싱 (`runtimeFeedsHelper.ts:493-576`).
 *
 * `removeNSPrefix: true`인 파서를 쓰면서도 구는 `errorlog:` 접두사가 붙은 키를
 * **먼저** 본다. 접두사가 붙은 채 오는 경로를 실제로 만났다는 뜻이므로 그대로
 * 옮긴다 — 정리하면 그 경로가 조용히 죽는다.
 */
export function parseGatewayErrorDetail(xml: string): GatewayErrorDetail {
  const parsed = record(xmlParser.parse(xml));
  const root = record(parsed['errorlog:errorEntry'] ?? parsed['errorEntry'] ?? parsed);

  const callStackRaw =
    record(root['errorlog:callStack'])['errorlog:entry'] ?? record(root['callStack'])['entry'] ?? [];
  const callStack = toArray<Record<string, unknown>>(
    callStackRaw as Record<string, unknown> | Record<string, unknown>[],
  ).map((entry, index) => ({
    number: (entry['@_number'] as number | string | undefined) ?? index,
    event: str(entry['@_event']),
    program: str(entry['@_program']),
    name: str(entry['@_name']),
    line: (entry['@_line'] as number | string | undefined) ?? 0,
  }));

  const linesRaw =
    record(root['errorlog:sourceCode'])['errorlog:line'] ?? record(root['sourceCode'])['line'] ?? [];
  const lines = toArray<Record<string, unknown>>(
    linesRaw as Record<string, unknown> | Record<string, unknown>[],
  ).map((line, index) => ({
    number: (line?.['@_number'] as number | string | undefined) ?? index,
    content: extractText(line),
    isError: line?.['@_isError'] === 'true' || line?.['@_isError'] === true,
  }));

  const exceptionsRaw =
    record(record(root['errorlog:errorContext'])['errorlog:exceptions'])['errorlog:exception'] ??
    record(record(root['errorContext'])['exceptions'])['exception'] ??
    [];
  const exceptions = toArray<Record<string, unknown>>(
    exceptionsRaw as Record<string, unknown> | Record<string, unknown>[],
  ).map((entry) => ({
    type: str(entry?.['@_type']),
    text: extractText(entry),
    raiseLocation: str(entry?.['@_raiseLocation']),
  }));

  const serviceInfo = record(root['errorlog:serviceInfo'] ?? root['serviceInfo']);

  return {
    type: str(root['@_type']),
    shortText: firstDefined(root['errorlog:shortText'], root['shortText']),
    transactionId: firstDefined(root['errorlog:transactionId'], root['transactionId']),
    package: firstDefined(root['errorlog:package'], root['package']),
    applicationComponent: firstDefined(
      root['errorlog:applicationComponent'],
      root['applicationComponent'],
    ),
    dateTime: firstDefined(root['errorlog:dateTime'], root['dateTime']),
    username: firstDefined(root['errorlog:username'], root['username']),
    client: firstDefined(root['errorlog:client'], root['client']),
    requestKind: firstDefined(root['errorlog:requestKind'], root['requestKind']),
    serviceInfo: {
      namespace: str(serviceInfo['@_namespace']),
      serviceName: str(serviceInfo['@_serviceName']),
      serviceVersion: str(serviceInfo['@_serviceVersion']),
      groupId: str(serviceInfo['@_groupId']),
      serviceRepository: str(serviceInfo['@_serviceRepository']),
      destination: str(serviceInfo['@_destination']),
    },
    errorContext: {
      errorInfo: firstDefined(
        record(root['errorlog:errorContext'])['errorlog:errorInfo'],
        record(root['errorContext'])['errorInfo'],
      ),
      resolution: {},
      exceptions,
    },
    sourceCode: {
      lines,
      errorLine:
        (record(root['errorlog:sourceCode'])['@_errorLine'] as number | string | undefined) ??
        (record(root['sourceCode'])['@_errorLine'] as number | string | undefined) ??
        0,
    },
    callStack,
  };
}
