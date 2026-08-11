/**
 * 자격증명 참조 해석 시험.
 *
 * 이 모듈이 지켜야 하는 성질은 하나로 줄일 수 있다:
 *
 *   > 해석하지 못한 참조가 **비밀번호 자리로 나가는 경로는 없다.**
 *
 * 실측 사고에서 나온 규칙이다(2026-08-11) — 참조 문자열이 그대로 SAP에 실려
 * 나가 401이 반복됐고 계정이 잠겼다. 그래서 아래 시험은 "성공하면 값을 준다"
 * 보다 **"실패하면 무엇도 주지 않는다"** 쪽이 더 많다.
 *
 * 네이티브 키체인은 태우지 않는다 — `reader` 교체점으로 갈아끼운다.
 */
import type { KeychainReader } from '../secrets';
import { SecretResolutionError, parseKeychainRef, resolveSecret } from '../secrets';

const REF = 'keychain:sapkit/KR-DEV';

describe('parseKeychainRef', () => {
  it('평문은 참조가 아니다', () => {
    expect(parseKeychainRef('not-a-secret')).toBeNull();
    expect(parseKeychainRef('')).toBeNull();
    // 스킴이 중간에 있는 것도 참조가 아니다 — 접두어여야 한다.
    expect(parseKeychainRef('pw-keychain:a/b')).toBeNull();
  });

  // 대소문자 구분은 **구 엔진과 같은 판정**이다(engine/src/lib/secrets.ts).
  // 넓히면 장부 등재가 필요한 차이가 되므로, 현 동작을 여기서 못박아 둔다.
  // 이 시험이 깨졌다면 판정을 바꾼 것이고 장부를 함께 고쳐야 한다는 뜻이다.
  it.each(['Keychain:svc/acct', 'KEYCHAIN:svc/acct'])(
    '스킴은 대소문자를 구분한다 — %s 는 참조가 아니라 평문이다',
    (value) => {
      expect(parseKeychainRef(value)).toBeNull();
      expect(resolveSecret(value, { reader: () => 'unused' })).toBe(value);
    },
  );

  it('service 와 account 로 쪼갠다', () => {
    expect(parseKeychainRef(REF)).toEqual({ service: 'sapkit', account: 'KR-DEV' });
  });

  it('account 안의 슬래시는 보존한다 (첫 슬래시에서만 쪼갠다)', () => {
    expect(parseKeychainRef('keychain:svc/a/b')).toEqual({ service: 'svc', account: 'a/b' });
  });

  it.each([
    ['빈 payload', 'keychain:'],
    ['슬래시 없음', 'keychain:svconly'],
    ['service 없음', 'keychain:/acct'],
    ['account 없음', 'keychain:svc/'],
  ])('모양이 어긋나면 던진다 — %s', (_label, value) => {
    expect(() => parseKeychainRef(value)).toThrow(SecretResolutionError);
    try {
      parseKeychainRef(value);
    } catch (err) {
      expect((err as SecretResolutionError).code).toBe('KEYCHAIN_REF_INVALID');
    }
  });

  // 조용히 평문으로 되돌리면, 오타 난 참조가 비밀번호가 되어 SAP로 날아간다.
  it('어긋난 참조를 평문으로 되돌리지 않는다', () => {
    expect(() => resolveSecret('keychain:broken')).toThrow(SecretResolutionError);
  });
});

describe('resolveSecret', () => {
  it('평문은 그대로 통과한다 — 키체인을 부르지 않는다', () => {
    const reader = jest.fn();
    expect(resolveSecret('not-a-secret', { reader })).toBe('not-a-secret');
    expect(reader).not.toHaveBeenCalled();
  });

  it('참조는 키체인에서 꺼낸 값이 된다', () => {
    const reader = jest.fn().mockReturnValue('actual-password');
    expect(resolveSecret(REF, { reader })).toBe('actual-password');
    expect(reader).toHaveBeenCalledWith({ service: 'sapkit', account: 'KR-DEV' });
  });

  it.each([
    ['항목이 없다', null],
    ['빈 값이다', ''],
  ])('꺼낸 것이 쓸 수 없으면 던진다 — %s', (_label, stored) => {
    const reader = jest.fn().mockReturnValue(stored);
    try {
      resolveSecret(REF, { reader });
      throw new Error('던졌어야 한다');
    } catch (err) {
      expect(err).toBeInstanceOf(SecretResolutionError);
      expect((err as SecretResolutionError).code).toBe('KEYCHAIN_ENTRY_NOT_FOUND');
    }
  });

  it('키체인 조회 자체가 실패하면 KEYCHAIN_UNAVAILABLE 이다', () => {
    const reader = jest.fn(() => {
      throw new Error('libsecret is not running');
    });
    try {
      resolveSecret(REF, { reader });
      throw new Error('던졌어야 한다');
    } catch (err) {
      expect((err as SecretResolutionError).code).toBe('KEYCHAIN_UNAVAILABLE');
      expect((err as Error).message).toContain('libsecret is not running');
    }
  });

  // 하드 성질 — 어떤 실패에서도 참조 문자열이 **반환값으로** 나오지 않는다.
  it.each([
    ['항목 없음', () => null],
    ['조회 실패', () => { throw new Error('nope'); }],
  ])('실패 시 참조 문자열을 반환하지 않는다 — %s', (_label, reader) => {
    let returned: string | undefined;
    try {
      returned = resolveSecret(REF, { reader: reader as () => string | null });
    } catch {
      // 기대한 경로
    }
    expect(returned).toBeUndefined();
  });

  // 키체인이 아예 없는 환경(CI·컨테이너·헤드리스)의 갈래. 명시적 `null`이
  // 그 상황을 뜻하므로 네이티브 모듈 유무와 무관하게 결정론적으로 돈다.
  it('키체인이 없는 환경이면 KEYCHAIN_UNAVAILABLE 이다', () => {
    try {
      resolveSecret(REF, { reader: null });
      throw new Error('던졌어야 한다');
    } catch (err) {
      expect(err).toBeInstanceOf(SecretResolutionError);
      expect((err as SecretResolutionError).code).toBe('KEYCHAIN_UNAVAILABLE');
    }
  });

  // 이 문구는 stderr에 머물지 않고 `core.ts`가 ERR_NO_CONNECTION 본문에 실어
  // MCP 응답으로 내보낸다. 그래서 비밀번호도, **SAP 사용자 ID인 account도**
  // 담기면 안 된다. 고칠 자리는 service 이름만으로 지목된다.
  it('오류 문구에 비밀번호도 account도 싣지 않는다', () => {
    const secret = 'super-secret-value';
    expect(resolveSecret(REF, { reader: () => secret })).toBe(secret);

    for (const reader of [() => null, () => { throw new Error('nope'); }] as KeychainReader[]) {
      try {
        resolveSecret(REF, { reader });
        throw new Error('던졌어야 한다');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('sapkit'); // service 는 남는다 — 고칠 자리를 알려야 한다
        expect(message).not.toContain('KR-DEV'); // account 는 남지 않는다
        expect(message).not.toContain(secret);
      }
    }
  });
});
