/**
 * JWT의 **수명만** 읽는다 — 서명은 검증하지 않는다.
 *
 * 이 엔진은 토큰의 **소지자**이지 검증자가 아니다. 서명을 검증할 주체는 SAP
 * 쪽이고, 클라이언트가 같은 일을 흉내 내려면 UAA의 공개키를 받아 와 캐시하고
 * 회전까지 따라가야 한다 — 그 전부가 "언제 갱신할지"라는 이 계층의 질문에는
 * 아무 답도 주지 않는다. 그래서 여기서 하는 일은 payload의 `exp`를 꺼내는
 * 것뿐이고, **위조된 토큰을 여기서 걸러 준다고 기대하면 안 된다**(위조 토큰은
 * SAP이 401로 거절한다 — 그것이 옳은 자리다).
 *
 * `exp`가 없는 토큰(불투명 토큰 포함)도 정상 입력이다. 그때 수명은 토큰 종단점이
 * 함께 준 `expires_in`이 정하고, 그것마저 없으면 **수명을 모른다**로 남는다 —
 * 모르는 것을 "만료 안 함"으로 접지 않는다(`tokenSource.ts`가 그 갈래를 다룬다).
 */

import { AuthError } from './errors';

/**
 * 만료 판정에 두는 여유. **60초.**
 *
 * 왕복 지연·시계 어긋남만큼 미리 갱신하지 않으면, 남은 수명 0.5초짜리 토큰을
 * "아직 유효하다"로 판정해 SAP까지 들고 갔다가 401을 받는다. 그 401은 인증
 * 실패로 보이지만 실제로는 타이밍 문제라 진단이 사람을 엉뚱한 곳으로 보낸다.
 */
export const EXPIRY_BUFFER_SECONDS = 60;

/** base64url 한 조각을 푼다. 모양이 어긋나면 null. */
function decodeSegment(segment: string): string | null {
  if (segment === '') return null;
  // base64url → base64. 패딩은 Buffer가 없어도 받아 주지만 명시해 둔다.
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * JWT payload의 claim들. 서명·헤더는 보지 않는다.
 *
 * @returns 세 조각짜리 JWT가 아니거나 payload가 JSON 객체가 아니면 `null`.
 *   **던지지 않는다** — "JWT가 아니다"는 이 함수의 정상 답이다(불투명 토큰).
 */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = decodeSegment(parts[1] ?? '');
  if (payload === null) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * `exp` claim을 **밀리초 epoch**으로. JWT가 아니거나 `exp`가 없으면 `null`.
 *
 * `exp`는 초 단위다(RFC 7519 §4.1.4). 밀리초로 착각해 곱하지 않으면 1970년으로
 * 읽혀 **모든 토큰이 만료된 것으로 판정**된다.
 *
 * @throws `JWT_MALFORMED` — `exp`가 있는데 유한한 수가 아닐 때. 이건 불투명
 *   토큰이 아니라 **깨진 JWT**다: 조용히 "수명 모름"으로 접으면 갱신이 영영
 *   돌지 않는다.
 */
export function jwtExpiresAtMs(token: string): number | null {
  const claims = decodeJwtClaims(token);
  if (claims === null) return null;
  if (!('exp' in claims)) return null;

  const exp = claims.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new AuthError('JWT_MALFORMED', 'JWT의 exp claim이 유한한 수가 아니다.');
  }
  return Math.trunc(exp * 1000);
}

/**
 * 이 만료 시각이 **지금 기준으로 이미 소진됐는가** — 버퍼를 포함해서.
 *
 * `expiresAtMs === null`(수명 모름)은 `false`다. 모르는 것을 만료로 접으면
 * 불투명 토큰이 매 요청마다 갱신을 부른다. 모름의 처리는 호출부 몫이다.
 */
export function isExpired(
  expiresAtMs: number | null,
  nowMs: number,
  bufferSeconds: number = EXPIRY_BUFFER_SECONDS,
): boolean {
  if (expiresAtMs === null) return false;
  return expiresAtMs - bufferSeconds * 1000 <= nowMs;
}

/**
 * 남은 수명(ms). 수명을 모르면 `null`, 이미 지났으면 음수.
 *
 * **버퍼를 빼지 않은 값**이다 — 진단에 쓰라고 있는 것이고, 판정은
 * {@link isExpired}가 한다. 둘을 섞으면 "만료됐다는데 12초 남았다고 한다"는
 * 진단이 나온다.
 */
export function remainingMs(expiresAtMs: number | null, nowMs: number): number | null {
  return expiresAtMs === null ? null : expiresAtMs - nowMs;
}
