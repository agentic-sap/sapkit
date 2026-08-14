/**
 * 메타데이터 확장(DDLX) 읽기의 ADT 조각 — `ReadMetadataExtension`·`GetMetadataExtension`이
 * 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 구 핸들러 `engine/src/handlers/metadata_extension/readonly/handleReadMetadataExtension.ts:45-82`
 * · `engine/src/handlers/metadata_extension/high/handleGetMetadataExtension.ts:64-106`
 * → 벤더 감싸개 `@babamba2/mcp-abap-adt-clients/dist/core/metadataExtension/AdtMetadataExtension.js`
 *   의 `read()`(:110-137) · `readMetadata()`(:141-168)
 * → 저수준 `.../core/metadataExtension/read.js`의
 *   `readMetadataExtensionSource`(:55-73) · `readMetadataExtension`(:27-40).
 *
 * ```
 * 소스   GET /sap/bc/adt/ddic/ddlx/sources/{소문자}/source/main[?version=inactive]
 *        Accept: text/plain
 * 메타   GET /sap/bc/adt/ddic/ddlx/sources/{소문자}
 *        Accept: application/vnd.sap.adt.ddic.ddlx.v1+xml   (`contentTypes.js:104`)
 * ```
 *
 * 이 계열만의 함정 셋이다 — 이웃한 서비스 정의(SRVD)와 규칙이 하나도 겹치지 않는다.
 *
 * 1. **이름을 인코딩하지 않는다.** SRVD 쪽은 `encodeSapObjectName(name.toLowerCase())`
 *    인데(`serviceDefinition/read.js:17`) DDLX 쪽은 맨 `name.toLowerCase()`다
 *    (`metadataExtension/read.js:28`·`:56`·`:81`). 슬래시가 든 이름에서 보내는 URL이
 *    갈리므로 접어 합치면 안 된다.
 * 2. **`version=active`는 질의 인자로 나가지 않는다.** 저수준 함수가
 *    `version === 'inactive'`일 때만 붙인다(`read.js:57`). SRVD 쪽은 언제나 붙는다.
 * 3. **메타데이터 GET에는 `version`이 아예 없다**(`read.js:29-30`). SRVD 쪽은
 *    `inactive`가 박혀 있다.
 *
 * ## 404의 취급
 *
 * 감싸개 `read()`는 404에서 `readResult` 없는 상태를 돌려준다(던지지 않는다 —
 * `AdtMetadataExtension.js:127-131`). 여기서는 같은 뜻인 `undefined`로 접는다 —
 * 호출자가 보는 것(“읽은 것이 없다”)이 같다. `readMetadata()`에는 그 삼킴이 없다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 응답 본문이 문자열이다(구는 axios가 파싱한 `data`를 접어야 했다).
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import { adtStatusOf } from './adt';

/** DDLX 컬렉션. */
export const DDLX_ROOT = '/sap/bc/adt/ddic/ddlx/sources';

/** `CT_METADATA_EXTENSION` — `constants/contentTypes.js:104`. 메타데이터 GET의 Accept. */
export const ACCEPT_METADATA_EXTENSION = 'application/vnd.sap.adt.ddic.ddlx.v1+xml';

/** `ACCEPT_SOURCE` — `constants/contentTypes.js:16`. */
export const DDLX_SOURCE_ACCEPT = 'text/plain';

export type MetadataExtensionVersion = 'active' | 'inactive';

/**
 * 나가는 주소의 이름 — **소문자로 내리기만 하고 인코딩하지 않는다**(머리주석 ①).
 */
export function metadataExtensionUri(name: string): string {
  return `${DDLX_ROOT}/${name.toLowerCase()}`;
}

/**
 * 소스 한 벌. **`inactive`일 때만 질의 인자가 붙고**(머리주석 ②) 404는 빈손으로
 * 접는다.
 */
export async function readMetadataExtensionSource(
  client: AdtClient,
  name: string,
  version: MetadataExtensionVersion,
): Promise<AdtResponse | undefined> {
  try {
    return await client.request({
      method: 'GET',
      path: `${metadataExtensionUri(name)}/source/main`,
      params: version === 'inactive' ? { version: 'inactive' } : undefined,
      accept: DDLX_SOURCE_ACCEPT,
      timeout: 'default',
    });
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/** 오브젝트 메타데이터. **질의 인자가 없다**(머리주석 ③) 그리고 404를 삼키지 않는다. */
export function readMetadataExtensionMetadata(
  client: AdtClient,
  name: string,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: metadataExtensionUri(name),
    accept: ACCEPT_METADATA_EXTENSION,
    timeout: 'default',
  });
}
