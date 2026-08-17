/**
 * 토큰 수명 관리 — **무상태**로.
 *
 * ## 무상태가 무슨 뜻인가
 *
 * 이 계층이 토큰을 두는 곳은 **이 프로세스의 메모리 한 군데뿐**이다. 키체인에
 * 넣지 않고, 세션 파일로 쓰지 않고, 어떤 디렉터리도 만들지 않는다. 프로세스가
 * 끝나면 토큰은 사라지고, 다음 기동은 다시 받는다.
 *
 * 구 부품은 세션 저장소를 갖고 있었고 `--unsafe`에서 실제로 파일을 썼다
 * (`src/profile/destination.ts`의 `BrokerStores` 주석 — 읽기 참조). 그것을
 * 승계하지 않은 이유는 이 엔진의 자격증명 취급이 이미 한 방향으로 정해져
 * 있기 때문이다: 비밀번호는 프로파일이 `keychain:` 참조로 갖고, 서버는 **읽기만**
 * 한다(`src/profile/secrets.ts`). 토큰을 서버가 스스로 어딘가에 **쓰기** 시작하면
 * 그 원칙이 뒤집히고, 지워야 할 비밀이 하나 더 생긴다. 캐시가 메모리에만 있으면
 * 지울 것도 없다.
 *
 * ## 갱신 실패는 재로그인으로 넘어가지 않는다
 *
 * 갱신에 실패하면 **거기서 끝난다** — 이름 있는 진단(`UAA_REFRESH_FAILED`)을
 * 올리고, 처음 취득 갈래로 조용히 흘러내리지 않는다. 흘러내리면 도구 호출
 * 한복판에서 사람 상호작용(브라우저 로그인)이 시작되거나, `client_credentials`
 * 로 **다른 권한 주체**의 토큰이 조용히 대신 실린다. 어느 쪽이든 사람은 자기가
 * 무엇으로 인증됐는지 모른 채 SAP에 요청을 보내게 된다. attended 원칙에서 그
 * 조용함이 문제다.
 *
 * 처음 취득(캐시도 갱신 토큰도 없는 상태)은 다른 이야기다 — 거기엔 뒤집힐
 * 사람의 기대가 없으므로 설정된 방법으로 받는다.
 */

import { AuthError } from './errors';
import { EXPIRY_BUFFER_SECONDS, isExpired, remainingMs } from './jwt';
import type { TokenSet, UaaClient } from './uaa';

export interface TokenSourceOptions {
  /** 갱신·취득을 수행할 UAA 클라이언트. 없으면 씨앗 토큰만 쓴다. */
  readonly client?: UaaClient;
  /** 씨앗 토큰 — 프로파일이나 앞선 왕복이 이미 받아 둔 것. */
  readonly seed?: TokenSet | null;
  /**
   * **처음** 토큰을 얻는 방법. 지정하지 않고 클라이언트만 있으면
   * `client_credentials`로 받는다. 갱신 실패의 폴백으로는 **쓰이지 않는다**.
   */
  readonly acquire?: () => Promise<TokenSet>;
  readonly now?: () => number;
  readonly bufferSeconds?: number;
}

/** 캐시 상태 — 진단·시험용. **비밀은 하나도 담지 않는다.** */
export interface TokenStatus {
  readonly hasToken: boolean;
  readonly expiresAtMs: number | null;
  /** 남은 수명(ms). 수명을 모르면 null. 버퍼는 빼지 않은 값이다. */
  readonly remainingMs: number | null;
  /** 버퍼를 포함해 지금 갱신이 필요한가. */
  readonly needsRenewal: boolean;
  /** 갱신할 재료가 있는가(갱신 토큰 또는 처음 취득 방법). */
  readonly renewable: boolean;
}

export class TokenSource {
  private readonly client: UaaClient | undefined;
  private readonly acquireFirst: (() => Promise<TokenSet>) | undefined;
  private readonly now: () => number;
  private readonly bufferSeconds: number;

  private cached: TokenSet | null;
  private refreshToken: string | null;
  /** 진행 중인 취득·갱신. 동시 호출이 같은 왕복을 두 번 내지 않게 한다. */
  private pending: Promise<TokenSet> | null = null;

  constructor(options: TokenSourceOptions = {}) {
    this.client = options.client;
    this.acquireFirst = options.acquire;
    this.now = options.now ?? (() => Date.now());
    this.bufferSeconds = options.bufferSeconds ?? EXPIRY_BUFFER_SECONDS;
    this.cached = options.seed ?? null;
    this.refreshToken = options.seed?.refreshToken ?? null;
  }

  /**
   * 지금 실을 수 있는 접근 토큰. 필요하면 갱신하고, 못 하면 **던진다**.
   *
   * 만료 판정에는 {@link EXPIRY_BUFFER_SECONDS} 만큼의 여유가 들어간다 — 남은
   * 수명이 그보다 짧으면 아직 살아 있어도 미리 갈아 끼운다.
   */
  async accessToken(): Promise<string> {
    if (this.cached !== null && !this.needsRenewal()) return this.cached.accessToken;

    if (this.pending === null) {
      this.pending = this.renew().finally(() => {
        this.pending = null;
      });
    }
    const fresh = await this.pending;
    return fresh.accessToken;
  }

  status(): TokenStatus {
    const expiresAtMs = this.cached?.expiresAtMs ?? null;
    return {
      hasToken: this.cached !== null,
      expiresAtMs,
      remainingMs: remainingMs(expiresAtMs, this.now()),
      needsRenewal: this.cached === null || this.needsRenewal(),
      renewable: this.refreshToken !== null || this.acquireFirst !== undefined || this.client !== undefined,
    };
  }

  /**
   * 캐시된 접근 토큰을 버린다. **갱신 재료는 남긴다** — 다음 호출이 갱신
   * 갈래를 타게 하려는 것이다(SAP이 401로 거절했을 때 호출부가 쓴다).
   *
   * 갱신 재료까지 버리려면 이 객체를 버리면 된다. 메모리 말고는 아무 데도
   * 없으므로 그것으로 끝이다.
   */
  invalidate(): void {
    this.cached = null;
  }

  // ------------------------------------------------------------ 내부 구현

  private needsRenewal(): boolean {
    return isExpired(this.cached?.expiresAtMs ?? null, this.now(), this.bufferSeconds);
  }

  private async renew(): Promise<TokenSet> {
    // ⓐ 갱신 토큰이 있으면 **갱신만** 한다. 실패는 여기서 끝난다.
    if (this.refreshToken !== null) {
      if (this.client === undefined) {
        throw new AuthError(
          'AUTH_NO_REFRESH_MATERIAL',
          '갱신 토큰은 있는데 UAA 재료(url·clientid·clientsecret)가 없어 갱신할 수 없다.',
        );
      }
      // 던지는 오류는 `UaaClient.refresh`가 이미 `UAA_REFRESH_FAILED`로 붙였다.
      // 여기서 잡아 다른 갈래로 내려가지 않는 것이 이 모듈의 계약이다.
      return this.adopt(await this.client.refresh(this.refreshToken));
    }

    // ⓑ 처음 취득 — 뒤집을 사람의 기대가 없는 자리.
    if (this.acquireFirst !== undefined) return this.adopt(await this.acquireFirst());
    if (this.client !== undefined) return this.adopt(await this.client.clientCredentials());

    throw new AuthError(
      'AUTH_NO_REFRESH_MATERIAL',
      '토큰이 만료됐거나 없는데 받아 올 방법이 없다 — UAA 재료도, 갱신 토큰도, 취득 방법도 주어지지 않았다.',
    );
  }

  private adopt(token: TokenSet): TokenSet {
    this.cached = token;
    // 회전하지 않는 종단점은 새 갱신 토큰을 주지 않는다. 그때 기존 것을 버리면
    // 다음 갱신이 통째로 불가능해진다.
    if (token.refreshToken !== null) this.refreshToken = token.refreshToken;
    return token;
  }
}
