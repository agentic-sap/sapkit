/**
 * 서비스 정의(SRVD) 읽기의 ADT 조각 — `ReadServiceDefinition`·`GetServiceDefinition`이
 * 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 구 핸들러 `engine/src/handlers/service_definition/readonly/handleReadServiceDefinition.ts:45-80`
 * · `engine/src/handlers/service_definition/high/handleGetServiceDefinition.ts:64-106`
 * → 벤더 감싸개 `@babamba2/mcp-abap-adt-clients/dist/core/serviceDefinition/AdtServiceDefinition.js`
 * 의 `read()`(:111-130) · `readMetadata()`(:134-161)
 * → 저수준 `.../core/serviceDefinition/read.js`의
 *   `getServiceDefinitionSource`(:39-58) · `getServiceDefinition`(:16-35).
 *
 * ```
 * 소스   GET /sap/bc/adt/ddic/srvd/sources/{소문자}/source/main?version={active|inactive}
 *        Accept: text/plain                       (`constants/contentTypes.js:16` ACCEPT_SOURCE)
 * 메타   GET /sap/bc/adt/ddic/srvd/sources/{소문자}?version=inactive
 *        Accept: application/vnd.sap.adt.ddic.srvd.v1+xml
 *                                                 (`contentTypes.js:102` CT_SERVICE_DEFINITION)
 * ```
 *
 * 두 자리가 함정이다.
 *
 * 1. **URL의 이름은 소문자다.** 두 핸들러 모두 인자를 대문자로 올린 뒤 넘기는데,
 *    저수준 함수가 `encodeSapObjectName(name.toLowerCase())`로 다시 내린다
 *    (`read.js:17`·`:40`). 응답에 메아리치는 이름은 대문자, 나가는 주소는
 *    소문자다 — 접으면 안 된다.
 * 2. **메타데이터 읽기는 `version` 인자를 무시하고 언제나 `inactive`를 보낸다.**
 *    감싸개가 그 값을 하드코딩한다(`AdtServiceDefinition.js:146`). 그래서
 *    `ReadServiceDefinition`에 `version: 'active'`를 줘도 두 번째 GET은
 *    `?version=inactive`로 나간다. 실측이며 흉내가 아니다.
 *
 * ## 404의 취급이 두 경로에서 다르다
 *
 * 감싸개 `read()`는 404를 **`undefined`로 삼키고**(`AdtServiceDefinition.js:123-129`)
 * 나머지는 던진다. `readMetadata()`에는 그 삼킴이 없다 — 저수준 함수를 직접
 * 부르므로 404도 그대로 던진다. `Get*`이 "not found"를 만드는 갈래와
 * `Read*`의 `metadata: null`이 갈리는 자리다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 응답 본문이 문자열이다. 구는 axios가 파싱한 `data`가 객체일 수 있어
 * `typeof … === 'string' ? … : JSON.stringify(…)`로 접었다. 신 접속 계층의
 * `body`는 언제나 문자열이므로 그 갈래가 사라질 뿐 결과는 같다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import { adtStatusOf, encodeObjectName } from './adt';

/** SRVD 컬렉션. */
export const SRVD_ROOT = '/sap/bc/adt/ddic/srvd/sources';

/** `CT_SERVICE_DEFINITION` — `constants/contentTypes.js:102`. 메타데이터 GET의 Accept. */
export const ACCEPT_SERVICE_DEFINITION = 'application/vnd.sap.adt.ddic.srvd.v1+xml';

/** `ACCEPT_SOURCE` — `constants/contentTypes.js:16`. */
export const SRVD_SOURCE_ACCEPT = 'text/plain';

export type ServiceDefinitionVersion = 'active' | 'inactive';

/** 나가는 주소의 이름 — **소문자**로 내린 뒤 인코딩한다(머리주석 ①). */
export function serviceDefinitionUri(name: string): string {
  return `${SRVD_ROOT}/${encodeObjectName(name.toLowerCase())}`;
}

/**
 * 소스 한 벌. 감싸개 `read()`와 같이 **404는 빈손으로** 접고 나머지는 던진다.
 */
export async function readServiceDefinitionSource(
  client: AdtClient,
  name: string,
  version: ServiceDefinitionVersion,
): Promise<AdtResponse | undefined> {
  try {
    return await client.request({
      method: 'GET',
      path: `${serviceDefinitionUri(name)}/source/main`,
      params: { version },
      accept: SRVD_SOURCE_ACCEPT,
      timeout: 'default',
    });
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/**
 * 오브젝트 메타데이터. **`version=inactive`가 박혀 있다**(머리주석 ②) 그리고
 * 404를 삼키지 않는다.
 */
export function readServiceDefinitionMetadata(
  client: AdtClient,
  name: string,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: serviceDefinitionUri(name),
    params: { version: 'inactive' },
    accept: ACCEPT_SERVICE_DEFINITION,
    timeout: 'default',
  });
}
