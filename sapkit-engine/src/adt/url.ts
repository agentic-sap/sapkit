/**
 * ADT URL 조립.
 *
 * 질의 인자는 `URLSearchParams` 대신 직접 인코딩한다 — `URLSearchParams`는 공백을
 * `+`로 쓰는데, 잠금 핸들처럼 서버가 그대로 돌려받아야 하는 값에서 `+`/공백
 * 왕복이 어긋날 수 있다. 여기서는 항상 `encodeURIComponent`(공백 = `%20`)다.
 *
 * 경로 자체는 인코딩하지 않는다 — 오브젝트 이름 인코딩은 호출하는 도구 계층의
 * 몫이고, 여기서 두 번 인코딩하면 망가진다.
 *
 * 클라이언트 번호와 로그온 언어는 **여기서 붙지 않는다**. 클라이언트는 질의
 * 인자가 아니라 `X-SAP-Client` 헤더 + `sap-usercontext` 쿠키로 나가고(접속 계층
 * 소관), 언어는 ADT 요청에 아예 싣지 않는다 — 구 접속 계층 실측.
 */

import type { ConnectionConfig } from '../contracts';

export type QueryValue = string | number | boolean | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;

export function buildAdtUrl(
  config: ConnectionConfig,
  path: string,
  params?: QueryParams,
): string {
  const origin = config.baseUrl.replace(/\/+$/, '');
  const questionMark = path.indexOf('?');
  const rawPath = questionMark === -1 ? path : path.slice(0, questionMark);
  const rawQuery = questionMark === -1 ? '' : path.slice(questionMark + 1);
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  // 삽입 순서 유지: path에 이미 있던 질의 → 호출자 params
  const query = new Map<string, string>();
  for (const [name, value] of new URLSearchParams(rawQuery)) {
    query.set(name, value);
  }
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined) continue;
      query.set(name, String(value));
    }
  }

  if (query.size === 0) return `${origin}${normalizedPath}`;
  const search = [...query.entries()]
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${origin}${normalizedPath}?${search}`;
}
