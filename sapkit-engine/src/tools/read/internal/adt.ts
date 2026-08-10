/**
 * 읽기 도구 9종이 함께 쓰는 ADT 조각 — 경로 조립과 소스 읽기.
 *
 * 경로 문자열은 **구 엔진이 실제로 보내던 것 그대로**다. 구 쪽은 이 조립이 세
 * 군데(벤더 클라이언트의 `getObjectSourceUri` · 벤더 `getObjectUri` · 엔진
 * 핸들러의 인라인 문자열)에 흩어져 있었고, 같은 이름을 서로 다른 규칙으로
 * 인코딩한다. 그 차이를 여기 한 자리에 모아 두되 **합치지는 않는다** — 합치면
 * 슬래시가 든 이름(`/NS/ZCL_X`)에서 보내는 URL이 달라진다.
 *
 * 인코딩 두 갈래:
 *  - `encodeObjectName(name)`            — 벤더 `encodeSapObjectName`. 그대로.
 *  - `checkUriName(name)` / `inlineUriName(name)` — 검사 경로는 이름을 소문자로
 *    쓰는데, 벤더는 `encode(name.toLowerCase())`이고 엔진의 인라인 검사는
 *    `encode(name).toLowerCase()`다. 슬래시가 들어가면 `%2F` vs `%2f`로 갈린다.
 */

import { STATUS_CODES } from 'node:http';

import type { AdtClient, AdtResponse } from '../../../adt';
import { AdtError } from '../../../adt';

export type SourceVersion = 'active' | 'inactive';

/** 소스를 읽을 때 구 계층이 싣던 Accept(`ACCEPT_SOURCE`). */
export const SOURCE_ACCEPT = 'text/plain';

/** 벤더 `encodeSapObjectName` — encodeURIComponent 한 겹뿐이다. */
export function encodeObjectName(name: string): string {
  return encodeURIComponent(name);
}

const SOURCE_ROOT = {
  class: '/sap/bc/adt/oo/classes',
  program: '/sap/bc/adt/programs/programs',
  interface: '/sap/bc/adt/oo/interfaces',
} as const;

export type SourceObjectKind = keyof typeof SOURCE_ROOT;

/** `/sap/bc/adt/oo/classes/ZCL_X/source/main` 류. 질의 인자는 붙이지 않는다. */
export function objectSourcePath(kind: SourceObjectKind, name: string): string {
  return `${SOURCE_ROOT[kind]}/${encodeObjectName(name)}/source/main`;
}

/** 독립 인클루드는 오브젝트 축이 달라 별도 경로를 쓴다. */
export function includeSourcePath(name: string): string {
  return `/sap/bc/adt/programs/includes/${encodeObjectName(name)}/source/main`;
}

export function functionModuleSourcePath(groupName: string, moduleName: string): string {
  return (
    `/sap/bc/adt/functions/groups/${encodeObjectName(groupName)}` +
    `/fmodules/${encodeObjectName(moduleName)}/source/main`
  );
}

/** 함수그룹 자체(메타데이터). GrepObjects의 FUGR 갈래가 이걸 읽는다. */
export function functionGroupPath(name: string): string {
  return `/sap/bc/adt/functions/groups/${encodeObjectName(name)}`;
}

/** 벤더 `getObjectUri`의 인코딩 — 이름을 먼저 소문자로 만들고 인코딩한다. */
export function checkUriName(name: string): string {
  return encodeObjectName(name.toLowerCase());
}

/** 엔진 인라인 검사의 인코딩 — 인코딩한 뒤 소문자로 만든다. */
export function inlineUriName(name: string): string {
  return encodeObjectName(name).toLowerCase();
}

export function objectCheckUri(kind: SourceObjectKind, name: string): string {
  return `${SOURCE_ROOT[kind]}/${checkUriName(name)}`;
}

export function objectInlineUri(kind: SourceObjectKind, name: string): string {
  return `${SOURCE_ROOT[kind]}/${inlineUriName(name)}`;
}

export function includeCheckUri(name: string): string {
  return `/sap/bc/adt/programs/includes/${inlineUriName(name)}`;
}

export function functionModuleCheckUri(groupName: string, moduleName: string): string {
  return (
    `/sap/bc/adt/functions/groups/${inlineUriName(groupName)}` +
    `/fmodules/${inlineUriName(moduleName)}`
  );
}

/** 소스 한 벌 읽기. `version`을 주면 `?version=…`이 붙는다(구와 같다). */
export async function readSourceText(
  client: AdtClient,
  path: string,
  version?: SourceVersion,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path,
    params: version ? { version } : undefined,
    accept: SOURCE_ACCEPT,
    timeout: 'default',
  });
}

/**
 * 응답 본문을 소스 텍스트로 본다.
 *
 * 구 핸들러는 axios가 파싱해 둔 `data`가 문자열이 아닐 수 있어
 * `JSON.stringify`로 접었다. 신 접속 계층의 `body`는 항상 문자열이므로 그
 * 갈래는 사라지지만, 빈 본문의 취급(`null`/`''`)은 호출자마다 다르므로 여기서
 * 정하지 않는다.
 */
export function bodyOf(response: AdtResponse): string {
  return response.body;
}

/**
 * 상태 코드의 표준 사유 문구.
 *
 * 구 응답의 `status_text`는 axios가 준 HTTP 사유 문구였다(200이면 `OK`). 신
 * 접속 계층은 `AdtResponse`에 그 문구를 싣지 않으므로 표준 표에서 되살린다 —
 * 지어내지 않고, 모르면 빈 문자열이다.
 */
export function statusTextFor(status: number): string {
  return STATUS_CODES[status] ?? '';
}

/** ADT 실패의 HTTP 상태. 구 핸들러의 `error.response?.status` 자리다. */
export function adtStatusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}
