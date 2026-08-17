/**
 * 인증 계층의 공개 표면 — UAA 토큰 취득과 그 수명.
 *
 * 상위 계층(기동·서버 코어·도구)은 여기서만 가져다 쓴다. 내부 모듈 경로를
 * 직접 참조하지 않는다(`src/adt/index.ts`와 같은 규칙).
 *
 * **이 계층은 SAP에 요청을 보내지 않는다.** UAA에만 말을 걸고, 결과로 나온
 * 토큰을 접속 계층(`src/adt/client.ts`)이 `Bearer`로 싣는다. 접점을 나누지
 * 않는다는 규칙(CLAUDE.md 안전 규칙)의 반대편이 아니다 — UAA는 ADT 표면이
 * 아니라 인가 서버다.
 */

export { AuthError, isAuthError } from './errors';
export type { AuthErrorCode } from './errors';

export { EXPIRY_BUFFER_SECONDS, decodeJwtClaims, isExpired, jwtExpiresAtMs, remainingMs } from './jwt';

export {
  AUTHORIZE_PATH,
  DEFAULT_UAA_TIMEOUT_MS,
  TOKEN_PATH,
  UaaClient,
  uaaEndpoints,
} from './uaa';
export type { AuthorizeUrlParams, TokenSet, UaaClientOptions } from './uaa';

export {
  DEFAULT_CALLBACK_HOST,
  DEFAULT_CALLBACK_PATH,
  acquireByAuthorizationCode,
  startCallbackServer,
} from './callback';
export type {
  AuthorizationCodeFlowOptions,
  CallbackCapture,
  CallbackOptions,
  CallbackResult,
} from './callback';

export { TokenSource } from './tokenSource';
export type { TokenSourceOptions, TokenStatus } from './tokenSource';
