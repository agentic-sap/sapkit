/**
 * 함수그룹 **메타데이터 PUT**의 콘텐츠 타입 협상.
 *
 * 벤더 기본값은 `...groups.v3+xml`인데, S/4HANA 2021 온프렘의 ADT discovery는
 * 함수그룹 컬렉션에 **v2까지만 광고**하고 v3로 보내면 HTTP 415
 * ("ExceptionUnsupportedMediaType") 로 거절한다. 그래서 discovery가 광고하는
 * 미디어 타입 중 가장 높은 판을 골라 쓴다. 실측 기록의 정본은
 * `engine/src/lib/adtFunctionGroupContentTypes.ts:1-23`이다.
 *
 * 헤더 두 줄의 모양은 구 `AdtContentTypesFgNegotiated.functionGroupUpdate()`
 * (`:52-57`) 그대로다 — **Accept는 판 그대로, Content-Type에는 `; charset=utf-8`이
 * 붙는다.** 생성 쪽(`functionGroupCreate()` `:48-50`)은 둘 다 판 그대로라 모양이
 * 다르다. 접어 합치면 구가 보내던 헤더가 달라진다.
 *
 * 문서 파싱 두 조각(`extractCollectionAccepts` · `pickFunctionGroupContentType`)은
 * 이미 `./createFunctionGroup`이 내보내고 있어 **그대로 가져다 쓴다** — 같은
 * discovery 문서를 두 벌로 읽는 코드를 만들지 않는다.
 *
 * ## 캐시가 생성 쪽과 **갈라져 있다** (장부 D124)
 *
 * 구는 접속 하나에 협상 결과를 한 벌만 두고 생성·갱신이 함께 썼다
 * (`adtFunctionGroupContentTypes.ts:109-112`의 `negotiatedCache`). 신 엔진에서는
 * `createFunctionGroup.ts`가 자기 모듈 안에 사설 캐시를 갖고 있고 내보내지 않으므로,
 * 이 파일이 캐시를 하나 더 갖는다. 한 세션에서 생성과 갱신을 이어 부르면 discovery
 * 왕복이 **한 번 더** 나간다. 사연과 해소 조건은 `harness/DIVERGENCES.md` D124.
 */

import type { AdtClient } from '../../adt';
import type { ToolLogger } from '../../server/toolDefinition';
import { extractCollectionAccepts, pickFunctionGroupContentType } from './createFunctionGroup';

const DISCOVERY_PATH = '/sap/bc/adt/discovery';
const DISCOVERY_ACCEPT = 'application/atomsvc+xml';
const FG_COLLECTION_HREF = '/sap/bc/adt/functions/groups';

/** 협상이 실패했을 때 구 핸들러가 직접 적어 두는 두 줄(`handleUpdateFunctionGroup.ts:161-167`). */
export const FG_UPDATE_FALLBACK: FunctionGroupUpdateHeaders = {
  contentType: 'application/vnd.sap.adt.functions.groups.v3+xml; charset=utf-8',
  accept: 'application/vnd.sap.adt.functions.groups.v3+xml',
};

export interface FunctionGroupUpdateHeaders {
  readonly contentType: string;
  readonly accept: string;
}

/** 판 하나에서 갱신 PUT의 두 헤더를 만든다 — 구 `functionGroupUpdate()` 그대로. */
export function updateHeadersFor(mediaType: string): FunctionGroupUpdateHeaders {
  return { contentType: `${mediaType}; charset=utf-8`, accept: mediaType };
}

/**
 * 협상 결과는 접속마다 한 번만 구한다. **실패는 캐시하지 않는다** — 일시적인
 * discovery 장애가 세션 내내 폴백을 고정하지 않게 하려는 것이고, 그 규칙도 구의
 * 주석이 명시한다(`adtFunctionGroupContentTypes.ts:109-111`).
 */
const negotiated = new WeakMap<AdtClient, FunctionGroupUpdateHeaders>();

export async function negotiateFunctionGroupUpdateHeaders(
  client: AdtClient,
  logger: ToolLogger,
): Promise<FunctionGroupUpdateHeaders> {
  const cached = negotiated.get(client);
  if (cached) return cached;

  let body: string;
  try {
    const response = await client.request({
      method: 'GET',
      path: DISCOVERY_PATH,
      accept: DISCOVERY_ACCEPT,
      timeout: 'default',
    });
    body = response.body;
  } catch {
    logger.debug(
      'FunctionGroup content-type negotiation: discovery unavailable, keeping defaults',
    );
    return FG_UPDATE_FALLBACK;
  }

  const mediaType = pickFunctionGroupContentType(
    extractCollectionAccepts(body, FG_COLLECTION_HREF),
  );
  if (!mediaType) {
    logger.debug(
      'FunctionGroup content-type negotiation: no groups media type advertised, keeping defaults',
    );
    return FG_UPDATE_FALLBACK;
  }

  logger.info(`FunctionGroup content-type negotiated from discovery: ${mediaType}`);
  const headers = updateHeadersFor(mediaType);
  negotiated.set(client, headers);
  return headers;
}
