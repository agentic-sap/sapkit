/**
 * 인증 계층의 **명명 오류** — 실패마다 지목 가능한 코드를 하나 붙인다.
 *
 * 왜 코드인가: 이 계층의 실패는 대부분 사람이 고쳐야 하는 설정 문제(만료된
 * 갱신 토큰 · 잘못된 clientid · 콜백 포트 점유)이고, 문구만 있으면 호출부가
 * "인증이 안 된다"는 한 덩이로 뭉뚱그려 같은 회복을 시도한다. 접속 계층이
 * 상태 코드와 `<exc:exception>` 으로 판단하고 메시지 문구로 판단하지 않는 것
 * (`src/adt/client.ts` 머리말 4)과 같은 원칙이다.
 *
 * **비밀은 문구에 담지 않는다.** clientSecret·access_token·refresh_token·
 * authorization code 중 어느 것도 오류 문구에 실리지 않는다. UAA가 돌려준
 * 본문도 통째로 싣지 않고 `error`/`error_description` 두 칸만 옮긴다
 * (`src/auth/uaa.ts`) — 종단점이 본문에 토큰을 되비추는 경우가 있다.
 */

export type AuthErrorCode =
  /** `authType === 'jwt'` 인데 실을 토큰이 없다. 접속 계층이 거절하는 자리. */
  | 'AUTH_TOKEN_MISSING'
  /** 토큰 종단점에 요청 자체가 닿지 못했다(네트워크·타임아웃·TLS). */
  | 'UAA_REQUEST_FAILED'
  /** 토큰 종단점이 4xx/5xx로 거절했다. */
  | 'UAA_REJECTED'
  /** 2xx인데 쓸 수 있는 `access_token`이 없다(JSON 아님 · 칸 없음 · 빈 값). */
  | 'UAA_RESPONSE_INVALID'
  /** 갱신 갈래가 실패했다. **조용한 전체 재로그인으로 넘어가지 않는다.** */
  | 'UAA_REFRESH_FAILED'
  /** 갱신할 재료가 없다(갱신 토큰도, client_credentials 재료도 없다). */
  | 'AUTH_NO_REFRESH_MATERIAL'
  /** 콜백이 시한 안에 오지 않았다. 되밀지 않는다. */
  | 'CALLBACK_TIMEOUT'
  /** 호출부가 시그널로 접었다. */
  | 'CALLBACK_ABORTED'
  /** 콜백 서버를 띄우지 못했거나(포트 점유 등) 인가 서버가 `error=`로 답했다. */
  | 'CALLBACK_FAILED'
  /** 콜백의 `state`가 보낸 값과 다르다. */
  | 'CALLBACK_STATE_MISMATCH'
  /** JWT의 모양이 어긋나 claim을 읽을 수 없다. */
  | 'JWT_MALFORMED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(`${code}: ${message}`, options);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** 이 오류가 인증 계층의 명명 오류인지. `instanceof`가 번들 경계를 넘지 못할 때. */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
