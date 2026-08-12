/**
 * 자격증명 참조 해석 — `SAP_PASSWORD=keychain:<service>/<account>`.
 *
 * 프로파일의 `SAP_PASSWORD`는 비밀번호 **자체**일 수도 있고 OS 키체인(윈도우
 * 자격 증명 관리자 · macOS 키체인 · Linux libsecret)의 **사물함 번호**일 수도
 * 있다. 구 엔진이 그 형식을 정했고(`engine/src/lib/secrets.ts` — 읽기 참조),
 * 실제 배포 프로파일이 그 형식을 쓴다.
 *
 * **왜 이 모듈이 M1에 뒤늦게 들어왔는가**: 신 엔진이 이 계층 없이 참조 문자열을
 * 그대로 비밀번호로 보내 SAP이 401을 냈고, 시퀀스가 계속 태워져 실패 로그온이
 * 쌓이면서 **계정이 잠기는 사고**가 났다(2026-08-11 실측). 그래서 이 모듈의
 * 설계 목표는 "해석에 성공한다"가 아니라 **"해석하지 못했으면 접속을 만들지
 * 않는다"**이다 — 참조 문자열이 비밀번호 자리에 실려 나가는 경로가 없어야 한다.
 *
 * 읽기만 한다. 키체인에 쓰거나 지우는 것은 프로파일 관리(`sapkit:setup`)의
 * 일이지 서버의 일이 아니다.
 *
 * **오류 문구는 좁게 쓴다.** 여기서 만든 문구는 stderr에 머물지 않고
 * `src/server/core.ts`가 `ERR_NO_CONNECTION` 본문에 실어 MCP 응답으로 내보낸다.
 * 배포 형식의 account 자리는 **SAP 사용자 ID**이므로(`interactive/core/policies/
 * credential-handling.md`) 문구에 담지 않는다 — 고칠 자리는 service 이름과
 * 프로파일 파일만으로 충분히 지목된다.
 */

const KEYCHAIN_SCHEME = 'keychain:';

/** 스킴만 확인한다 — "참조인가 아닌가"의 판정. */
const HAS_SCHEME = /^keychain:/;

export type SecretErrorCode = 'KEYCHAIN_REF_INVALID' | 'KEYCHAIN_UNAVAILABLE' | 'KEYCHAIN_ENTRY_NOT_FOUND';

export class SecretResolutionError extends Error {
  constructor(
    readonly code: SecretErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SecretResolutionError';
  }
}

export interface KeychainReference {
  readonly service: string;
  readonly account: string;
}

/** 키체인 항목 하나에서 비밀번호를 읽는 것. 없으면 null. */
export type KeychainReader = (ref: KeychainReference) => string | null;

/**
 * `keychain:<service>/<account>` 를 쪼갠다.
 *
 * @returns 참조가 아니면 `null` (평문 비밀번호는 그대로 통과한다)
 * @throws `KEYCHAIN_REF_INVALID` — 스킴은 붙었는데 모양이 어긋날 때.
 *   조용히 평문으로 되돌리지 않는다: `keychain:` 로 시작하는 값이 비밀번호
 *   자체일 가능성보다, 오타 난 참조일 가능성이 압도적으로 높다.
 *
 * **대소문자는 구분한다** — 구 엔진과 같은 판정이다. `Keychain:` 은 참조가
 * 아니라 평문으로 다뤄진다. 넓히면 구 엔진과 갈라져 장부 등재가 필요해지므로,
 * 지금은 현 동작을 시험으로 못박아 둔다(`__tests__/secrets.test.ts`).
 */
export function parseKeychainRef(value: string): KeychainReference | null {
  if (!HAS_SCHEME.test(value)) return null;

  // 첫 조각이 service, **나머지 전부**가 account 다 — 배포 형식
  // `keychain:sc4sap/<alias>/<user>` 처럼 account 가 슬래시를 품는다.
  const [service, ...rest] = value.slice(KEYCHAIN_SCHEME.length).split('/');
  const account = rest.join('/');
  if (service === undefined || service === '' || account === '') {
    throw new SecretResolutionError(
      'KEYCHAIN_REF_INVALID',
      `SAP_PASSWORD가 "${KEYCHAIN_SCHEME}" 로 시작하는데 모양이 어긋난다 — 형식은 ${KEYCHAIN_SCHEME}<service>/<account> 다.`,
    );
  }
  return { service, account };
}

/**
 * 네이티브 키체인 모듈을 **늦게** 부른다.
 *
 * 이 모듈이 없는 환경(CI·컨테이너·헤드리스)에서도 서버 자체는 떠야 한다 —
 * 평문 프로파일이나 무접속 기동은 키체인과 무관하기 때문이다. 그래서 불러오기
 * 실패는 기동을 막지 않고, **참조를 실제로 만났을 때만** 오류가 된다.
 */
function nativeReader(): KeychainReader | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@napi-rs/keyring') as {
      Entry: new (service: string, account: string) => { getPassword(): string | null };
    };
    return (ref) => new mod.Entry(ref.service, ref.account).getPassword();
  } catch {
    return null;
  }
}

export interface ResolveSecretOptions {
  /**
   * 키체인 읽기 교체점. 생략하면 `@napi-rs/keyring` 을 쓴다.
   * **명시적 `null`은 "이 환경에 키체인이 없다"**는 뜻이며, 그 갈래를
   * 결정론적으로 시험할 수 있게 열어 둔 자리다.
   */
  readonly reader?: KeychainReader | null;
}

/**
 * `SAP_PASSWORD` 값을 실제 비밀번호로 바꾼다.
 *
 * 평문은 그대로 통과한다. 참조는 키체인에서 꺼낸다. **꺼내지 못하면 던진다** —
 * 참조 문자열을 비밀번호로 되돌려 주는 갈래는 없다.
 */
export function resolveSecret(value: string, options: ResolveSecretOptions = {}): string {
  const ref = parseKeychainRef(value);
  if (ref === null) return value;

  // `??` 를 쓰지 않는다 — 명시적 null("키체인 없음")이 기본값으로 새면
  // 시험하려던 갈래가 사라진다.
  const reader = 'reader' in options ? options.reader : nativeReader();
  if (reader === null || reader === undefined) {
    throw new SecretResolutionError(
      'KEYCHAIN_UNAVAILABLE',
      'SAP_PASSWORD가 키체인 참조인데 @napi-rs/keyring 을 불러오지 못했다 — ' +
        '이 플랫폼에 네이티브 키체인 모듈이 없거나 해석 경로(NODE_PATH)에 없다.',
    );
  }

  let password: string | null;
  try {
    password = reader(ref);
  } catch (err) {
    throw new SecretResolutionError(
      'KEYCHAIN_UNAVAILABLE',
      `키체인 조회가 실패했다 (service="${ref.service}"): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 빈 문자열도 "없음"으로 다룬다. 빈 비밀번호로 로그온을 시도하는 것은
  // 실패 로그온을 한 건 쌓는 것 말고 아무 일도 하지 않는다.
  // (구 엔진은 빈 문자열을 비밀번호로 돌려준다 — 장부 등재분.)
  if (password === null || password === '') {
    throw new SecretResolutionError(
      'KEYCHAIN_ENTRY_NOT_FOUND',
      `키체인에 쓸 수 있는 항목이 없다 (service="${ref.service}") — sap.env의 SAP_PASSWORD가 가리키는 계정으로 다시 등록해야 한다.`,
    );
  }
  return password;
}
