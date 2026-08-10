/**
 * ADT 접속 계층의 공개 표면.
 *
 * 상위 계층(도구·서버 코어)은 여기서만 가져다 쓴다. 내부 모듈 경로를 직접
 * 참조하지 않는다.
 */

export {
  ACCEPT_LOCK_RESULT,
  AdtClient,
  CSRF_DISCOVERY_PATH,
  CSRF_FETCH_ACCEPT,
  DEFAULT_ACCEPT,
  DEFAULT_CONTENT_TYPE,
} from './client';
export type {
  AdtClientOptions,
  AdtRequestOptions,
  AdtResponse,
  HttpMethod,
  LockHandle,
  LockOptions,
  SessionType,
  TimeoutSelector,
} from './client';

export { AdtError, adtErrorFromResponse, parseAdtExceptionXml } from './errors';
export type { AdtErrorInit, AdtErrorKind, AdtExceptionPayload, AdtFailedResponse } from './errors';

export { HttpTransportError, nodeHttpTransport } from './http';
export type { HttpRequest, HttpResponse, HttpTransport } from './http';

export { CookieJar } from './cookies';

export { buildAdtUrl } from './url';
export type { QueryParams, QueryValue } from './url';
