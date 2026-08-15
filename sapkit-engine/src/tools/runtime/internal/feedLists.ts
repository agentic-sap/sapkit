/**
 * ADT 피드 **목록** 파싱 — 디스크립터 · 변형 · SM02 시스템 메시지 · ST22 덤프.
 *
 * ## 어디서 읽었나
 *
 * Gateway 오류 피드와 같은 계열이라 안쪽 패키지에 위임하지 않는다. 구 엔진이
 * fr0ster의 `FeedRepository`를 자기 트리로 이식해 두었고
 * (`engine/src/handlers/system/readonly/runtimeFeedsHelper.ts:1-14`), 겉 핸들러
 * 둘(`handleRuntimeListFeeds.ts` · `handleRuntimeListSystemMessages.ts`)이 그
 * 헬퍼를 직접 부른다. 안쪽 패키지에 닿는 지점은 `lib/utils.ts:902-921`의
 * `makeAdtRequestWithTimeout` → `connection.makeAdtRequest` 한 줄이고, 거기서
 * `Accept`는 호출자가 준 값이 이긴다
 * (`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:159-166`).
 *
 * 이 파일이 복원하는 것은 파서 넷이다:
 *  - `parseFeedDescriptors` (`runtimeFeedsHelper.ts:331-341`)
 *  - `parseFeedVariants`    (`:343-352`)
 *  - `parseSystemMessages`  (`:354-375`)
 *  - `parseRuntimeDumpFeed` (`:436-491`)
 *
 * 질의 조립(`feedQueryParams`)·`Accept`·HTML 표 파서는 같은 헬퍼에서 온
 * `./gatewayFeed`가 이미 갖고 있다 — 거기서 가져다 쓴다. 두 벌로 두면 사용자
 * 필터 문자열이 조용히 갈린다.
 *
 * ## 파서 설정은 하나다
 *
 * `runtimeFeedsHelper.ts:152-157` — `ignoreAttributes: false` ·
 * `attributeNamePrefix: '@_'` · `removeNSPrefix: true` · `processEntities: false`.
 * **엔티티를 풀지 않는다**는 것이 요점이다. `<atom:summary type="html">` 안의
 * HTML은 이스케이프된 채로 들어오고, 그 해제는 표 파서가 따로 한다.
 *
 * `removeNSPrefix: true` 때문에 구 코드의 `entry['sm:severity']` 같은 폴백은
 * 도달하지 않는다. 값이 달라지지 않으므로 표현은 구 그대로 두었다.
 */

import { XMLParser } from 'fast-xml-parser';

import { parseHtmlSummaryTable } from './gatewayFeed';

/** `runtimeFeedsHelper.ts:20-24` — 세 피드의 주소. */
export const FEED_URLS = Object.freeze({
  dumps: '/sap/bc/adt/runtime/dumps',
  systemMessages: '/sap/bc/adt/runtime/systemmessages',
  gatewayErrors: '/sap/bc/adt/gw/errorlog',
});

/** `handleRuntimeListFeeds.ts:97`·`:110` — 디스크립터·변형의 주소. */
export const FEEDS_PATH = '/sap/bc/adt/feeds';
export const FEED_VARIANTS_PATH = '/sap/bc/adt/feeds/variants';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
});

type Entry = Record<string, any>;

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** `runtimeFeedsHelper.ts:159-168` — 객체로 온 값에서 `#text`를 꺼낸다. */
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

/** `runtimeFeedsHelper.ts:170-175`. */
function extractCategoryTerm(entry: Entry): string | undefined {
  const category = entry?.['category'];
  if (!category) return undefined;
  if (typeof category === 'object') return category['@_term'];
  return String(category);
}

/** `feed.entry`를 배열로 꺼낸다. 없으면 빈 배열이다. */
function entriesOf(xml: string): Entry[] {
  const parsed = xmlParser.parse(xml) as Record<string, any> | undefined;
  const feed = parsed?.['feed'];
  if (!feed?.['entry']) return [];
  return toArray<Entry>(feed['entry']);
}

export interface FeedDescriptor {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly category?: string | undefined;
}

/** `runtimeFeedsHelper.ts:331-341`. */
export function parseFeedDescriptors(xml: string): FeedDescriptor[] {
  return entriesOf(xml).map((entry) => ({
    id: entry['id'] ?? '',
    title: extractText(entry['title']),
    url: entry['link']?.['@_href'] ?? '',
    category: extractCategoryTerm(entry),
  }));
}

export interface FeedVariant {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

/** `runtimeFeedsHelper.ts:343-352` — 디스크립터에서 `category`만 빠진 모양이다. */
export function parseFeedVariants(xml: string): FeedVariant[] {
  return entriesOf(xml).map((entry) => ({
    id: entry['id'] ?? '',
    title: extractText(entry['title']),
    url: entry['link']?.['@_href'] ?? '',
  }));
}

export interface SystemMessageEntry {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly severity: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly createdBy: string;
}

/**
 * `runtimeFeedsHelper.ts:354-375`.
 *
 * `severity`·`validFrom`은 폴백 사슬이다 — 없으면 `category/@term`,
 * `updated`가 대신 들어간다. **`validFrom`이 `updated`로 채워지는 것**이 특히
 * 눈에 띄는 자리라 시험이 그것을 붙잡는다.
 */
export function parseSystemMessages(xml: string): SystemMessageEntry[] {
  return entriesOf(xml).map((entry) => ({
    id: entry['id'] ?? '',
    title: extractText(entry['title']),
    text: extractText(entry['content']),
    severity: String(
      entry['severity'] ?? entry['sm:severity'] ?? entry['category']?.['@_term'] ?? '',
    ),
    validFrom: String(entry['validFrom'] ?? entry['sm:validFrom'] ?? entry['updated'] ?? ''),
    validTo: String(entry['validTo'] ?? entry['sm:validTo'] ?? ''),
    createdBy: entry['author']?.['name'] ?? '',
  }));
}

export interface DumpFeedEntry {
  readonly id: string;
  readonly dumpId: string;
  readonly detailUrl: string;
  readonly published: string;
  readonly updated: string;
  readonly shortText: string;
  readonly runtimeError: string;
  readonly exception: string;
  readonly program: string;
  readonly applicationComponent: string;
  readonly dateTime: string;
  readonly user: string;
  readonly client: string;
  readonly host: string;
}

/**
 * `runtimeFeedsHelper.ts:436-491` — ST22 덤프 피드.
 *
 * 값의 대부분이 `<atom:summary type="html">` 안의 표에 있다. 표에 없을 때만
 * `category` 두 개(첫째 = 런타임 오류 코드, 둘째 = 프로그램)와 `author/name`이
 * 대신 들어간다. 두 자리는 `??`가 아니라 **`||`**라 빈 문자열도 폴백을 탄다 —
 * 구가 그렇게 적어 둔 이유가 주석에 있다("행이 있는데 비었을 때 종류 정보를
 * 잃지 않게").
 */
export function parseRuntimeDumpFeed(xml: string): DumpFeedEntry[] {
  return entriesOf(xml).map((entry) => {
    const id: string = typeof entry['id'] === 'string' ? entry['id'] : '';
    // 덤프 ID는 `atom:id`의 마지막 경로 조각이다.
    const dumpId = id.split('/').pop() ?? '';

    const categories = toArray<Entry>(entry['category']);
    const runtimeErrorFromCategory = categories.length > 0 ? (categories[0]?.['@_term'] ?? '') : '';
    const programFromCategory = categories.length > 1 ? (categories[1]?.['@_term'] ?? '') : '';

    const selfLink = toArray<Entry>(entry['link']).find((link) => link?.['@_rel'] === 'self');
    const detailUrl = selfLink?.['@_href'] ?? '';

    const summaryHtml =
      typeof entry['summary'] === 'object'
        ? extractText(entry['summary'])
        : String(entry['summary'] ?? '');
    const table = parseHtmlSummaryTable(summaryHtml);

    return {
      id,
      dumpId,
      detailUrl,
      published: entry['published'] ?? '',
      updated: entry['updated'] ?? '',
      shortText: table.get('short text') ?? '',
      runtimeError: table.get('runtime error') || runtimeErrorFromCategory,
      exception: table.get('exception') ?? '',
      program: table.get('program') || programFromCategory,
      applicationComponent: table.get('application component') ?? '',
      dateTime: table.get('date/time') ?? '',
      user: table.get('user') || entry['author']?.['name'] || '',
      client: table.get('client') ?? '',
      host: table.get('host') ?? '',
    };
  });
}
