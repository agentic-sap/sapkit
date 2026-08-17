import { AuthError } from '../errors';
import {
  EXPIRY_BUFFER_SECONDS,
  decodeJwtClaims,
  isExpired,
  jwtExpiresAtMs,
  remainingMs,
} from '../jwt';
import { fakeJwt } from './helpers';

describe('decodeJwtClaims', () => {
  it('payload의 claim을 꺼낸다', () => {
    const token = fakeJwt({ exp: 1_700_000_000, scope: ['uaa.resource'], user_name: 'TESTUSER' });
    expect(decodeJwtClaims(token)).toEqual({
      exp: 1_700_000_000,
      scope: ['uaa.resource'],
      user_name: 'TESTUSER',
    });
  });

  it('세 조각이 아니면 null — 불투명 토큰은 정상 입력이다', () => {
    expect(decodeJwtClaims('opaque-token-without-dots')).toBeNull();
    expect(decodeJwtClaims('two.parts')).toBeNull();
  });

  it('payload가 JSON이 아니면 null (던지지 않는다)', () => {
    const broken = `${Buffer.from('{}').toString('base64url')}.${Buffer.from('not json').toString('base64url')}.sig`;
    expect(decodeJwtClaims(broken)).toBeNull();
  });

  it('payload가 배열이면 null — 객체만 claim으로 본다', () => {
    expect(decodeJwtClaims(fakeJwt([1, 2, 3] as unknown as Record<string, unknown>))).toBeNull();
  });
});

describe('jwtExpiresAtMs', () => {
  it('exp(초)를 밀리초로 바꾼다', () => {
    expect(jwtExpiresAtMs(fakeJwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it('exp가 없으면 null', () => {
    expect(jwtExpiresAtMs(fakeJwt({ user_name: 'TESTUSER' }))).toBeNull();
  });

  it('JWT가 아니면 null', () => {
    expect(jwtExpiresAtMs('opaque-token')).toBeNull();
  });

  it('exp가 수가 아니면 JWT_MALFORMED로 던진다 — 조용히 "수명 모름"으로 접지 않는다', () => {
    let caught: unknown;
    try {
      jwtExpiresAtMs(fakeJwt({ exp: 'soon' }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe('JWT_MALFORMED');
  });
});

describe('isExpired — 만료 판정과 60초 버퍼', () => {
  const now = 1_700_000_000_000;

  it('버퍼 기본값은 60초다', () => {
    expect(EXPIRY_BUFFER_SECONDS).toBe(60);
  });

  it('충분히 남았으면 만료가 아니다', () => {
    expect(isExpired(now + 10 * 60_000, now)).toBe(false);
  });

  it('이미 지났으면 만료다', () => {
    expect(isExpired(now - 1, now)).toBe(true);
  });

  it('**남은 수명이 버퍼보다 짧으면 아직 살아 있어도 만료로 본다**', () => {
    // 59초 남았다 — 왕복 지연이 이 사이에 들어가면 SAP에서 401이 난다.
    expect(isExpired(now + 59_000, now)).toBe(true);
    // 61초 남았다 — 아직 쓴다.
    expect(isExpired(now + 61_000, now)).toBe(false);
  });

  it('경계값(정확히 버퍼만큼 남음)은 만료로 접는다', () => {
    expect(isExpired(now + EXPIRY_BUFFER_SECONDS * 1000, now)).toBe(true);
  });

  it('버퍼를 바꿔 부를 수 있다', () => {
    expect(isExpired(now + 59_000, now, 5)).toBe(false);
    expect(isExpired(now + 59_000, now, 120)).toBe(true);
  });

  it('수명을 모르면(null) 만료가 아니다 — 모름을 만료로 접지 않는다', () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(null, now, 3600)).toBe(false);
  });
});

describe('remainingMs', () => {
  const now = 1_700_000_000_000;

  it('버퍼를 빼지 않은 남은 수명을 준다', () => {
    expect(remainingMs(now + 59_000, now)).toBe(59_000);
  });

  it('지난 토큰은 음수', () => {
    expect(remainingMs(now - 5_000, now)).toBe(-5_000);
  });

  it('수명을 모르면 null', () => {
    expect(remainingMs(null, now)).toBeNull();
  });
});
