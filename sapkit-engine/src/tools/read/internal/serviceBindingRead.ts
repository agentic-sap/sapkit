/**
 * 서비스 바인딩(SRVB) 읽기의 ADT 조각 — `ReadServiceBinding`·`GetServiceBinding`·
 * `ListServiceBindingTypes`·`ValidateServiceBinding`이 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 구 핸들러 `engine/src/handlers/service_binding/{readonly,high}/**`
 * → 벤더 `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js`의
 *   `encodeName`(:23-25) · `read()`(:290-308) · `readMetadata()`(:309-315) ·
 *   `readServiceBinding`(:520-534) · `getServiceBindingTypes`(:434-444) ·
 *   `validateServiceBinding`(:445-462).
 *
 * ```
 * 읽기   GET /sap/bc/adt/businessservices/bindings/{인코딩된 소문자}[?version=…]
 *        Accept: …servicebinding.v1+xml, …servicebinding.v2+xml
 * 종류   GET /sap/bc/adt/businessservices/bindings/bindingtypes
 *        Accept: application/vnd.sap.adt.nameditems.v1+xml, application/xml
 * 검증   GET /sap/bc/adt/businessservices/bindings/validation?objname=…&serviceDefinition=…
 *        Accept: application/vnd.sap.adt.businessservices.servicebinding.v2+xml
 * ```
 *
 * ## `response_format`은 **요청을 바꾸지 않는다** (실측)
 *
 * 구 `serviceBindingPayloadUtils.ts:5-15`에 `resolveServiceBindingAcceptHeader`가
 * 있지만 **어느 핸들러도 그것을 부르지 않는다**(구 트리 전체에 호출처가 없다 —
 * 선언된 자리 한 줄뿐이다). 그래서 `response_format`은 나가는 Accept를 한 글자도
 * 바꾸지 않고, **응답을 어떻게 파싱해 담을지**만 정한다. 죽은 코드를 옮기면
 * 없던 와이어 차이가 생기므로 옮기지 않는다.
 *
 * ## 이름 인코딩이 이 계열만 또 다르다
 *
 * `encodeURIComponent(name.toLowerCase())` — 소문자로 내린 **뒤** 인코딩한다
 * (`AdtService.js:24`). 서비스 정의(SRVD)와 같은 규칙이고, 메타데이터
 * 확장(DDLX)의 「인코딩 없음」과는 다르다. 세 계열을 접어 합치면 안 된다.
 *
 * ## `Validate*`는 **GET이다** — SAP 상태를 바꾸지 않는다
 *
 * 검증 엔드포인트는 GET이고(`AdtService.js:452-461`), 구 안전 게이트도 `Validate`를
 * 읽기 접두사로 분류한다(`engine/src/lib/readonlyGuard.ts:42-54` — "`Check*` /
 * `Validate*`는 ADT 검사 실행이며 절대 변경을 남기지 않는다"). 그래서
 * `ValidateServiceBinding`의 `kind`는 `read`다. **생성 사슬 안의 `transportchecks`
 * POST와 혼동하지 말 것** — 그쪽은 `CreateServiceBinding`이 부르는 다른 요청이다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import { XMLParser } from 'fast-xml-parser';

import { adtStatusOf } from './adt';

/** 서비스 바인딩 컬렉션. */
export const BINDINGS_ROOT = '/sap/bc/adt/businessservices/bindings';

/** 읽기·생성이 함께 싣는 Accept — `AdtService.js:531`·`:507`. */
export const ACCEPT_SERVICE_BINDING =
  'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

/** 종류 조회의 Accept — `AdtService.js:440`. */
export const ACCEPT_NAMED_ITEMS = 'application/vnd.sap.adt.nameditems.v1+xml, application/xml';

/** 검증의 Accept — `AdtService.js:459`. */
export const ACCEPT_SERVICE_BINDING_V2 =
  'application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

export type ServiceBindingResponseFormat = 'xml' | 'json' | 'plain';

/** 벤더 `AdtServiceBinding.encodeName` — 소문자로 내린 **뒤** 인코딩한다. */
export function serviceBindingUri(name: string): string {
  return `${BINDINGS_ROOT}/${encodeURIComponent(name.toLowerCase())}`;
}

/**
 * 바인딩 한 벌. 감싸개 `read()`와 같이 **404는 빈손으로** 접고 나머지는 던진다
 * (`AdtService.js:300-307`).
 */
export async function readServiceBinding(
  client: AdtClient,
  name: string,
  version?: 'active' | 'inactive',
): Promise<AdtResponse | undefined> {
  try {
    return await client.request({
      method: 'GET',
      path: serviceBindingUri(name),
      params: version ? { version } : undefined,
      accept: ACCEPT_SERVICE_BINDING,
      timeout: 'default',
    });
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/**
 * 응답 본문을 `response_format`이 정한 모양으로 접는다 — 구
 * `serviceBindingPayloadUtils.ts:17-54`의 `parseServiceBindingPayload` 그대로.
 *
 * 어느 갈래에서도 **던지지 않는다.** 파싱이 안 되면 원문을 그대로 돌려준다.
 */
export function parseServiceBindingPayload(
  payload: string,
  format: ServiceBindingResponseFormat,
): unknown {
  if (format === 'plain') return payload;

  if (format === 'json') {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }

  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) return payload;

  try {
    // 구와 같은 두 노브뿐이다 — 속성 접두사를 붙이지 않는다.
    return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(trimmed);
  } catch {
    return payload;
  }
}
