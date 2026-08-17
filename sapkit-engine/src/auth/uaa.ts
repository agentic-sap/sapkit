/**
 * UAA(XSUAA) 토큰 종단점 클라이언트 — OAuth2 3방식.
 *
 * 다루는 grant는 셋이다:
 *  - `authorization_code` — 사람이 브라우저로 로그인하고 돌아온 코드를 토큰으로
 *    바꾼다. **브라우저를 여는 것은 이 계층이 아니다**(`callback.ts` 머리말).
 *  - `refresh_token` — 만료 전에 조용히 갱신한다.
 *  - `client_credentials` — service key의 clientid/clientsecret만으로 받는다.
 *    사람 상호작용이 없어 **폴백이자 무인 통로**다.
 *
 * ## 전송을 왜 접속 계층에서 빌려 오는가
 *
 * `HttpTransport`(`src/adt/http.ts`)를 그대로 쓴다. 이유는 두 가지다 — ⓐ
 * `rejectUnauthorized`가 **접속마다** 달라야 한다는 제약이 UAA에도 똑같이 걸리고
 * (자기서명 인증서를 쓰는 사설 랜드스케이프의 UAA가 있다), ⓑ 시험이 실 네트워크
 * 없이 목으로 갈아 끼울 이음매가 이미 그 모양이다. 새 HTTP 스택을 하나 더 들이면
 * 타임아웃·TLS 방침이 두 벌로 갈라진다.
 *
 * ## 비밀 취급
 *
 * clientSecret은 **`Authorization: Basic` 헤더로만** 나가고 본문(form)에는 싣지
 * 않는다. 오류 문구에는 UAA 응답의 `error`/`error_description` 두 칸만 옮긴다 —
 * 본문을 통째로 실으면 종단점이 되비추는 토큰이 로그로 샌다.
 */

import type { UaaCredentials } from '../contracts';
import { HttpTransportError, nodeHttpTransport } from '../adt/http';
import type { HttpResponse, HttpTransport } from '../adt/http';
import { AuthError } from './errors';
import { jwtExpiresAtMs } from './jwt';

/** 토큰 종단점 왕복의 기본 시한. ADT 일반 요청(45s)보다 짧게 둔다. */
export const DEFAULT_UAA_TIMEOUT_MS = 30_000;

export const TOKEN_PATH = '/oauth/token';
export const AUTHORIZE_PATH = '/oauth/authorize';

/** 한 번의 취득·갱신이 낳은 결과. **디스크로 나가지 않는다.** */
export interface TokenSet {
  readonly accessToken: string;
  /** 갱신 토큰. 종단점이 주지 않으면 null(예: client_credentials). */
  readonly refreshToken: string | null;
  /** 보통 `bearer`. 종단점이 말하지 않으면 `bearer`로 본다. */
  readonly tokenType: string;
  /**
   * 만료 시각(ms epoch). **JWT의 `exp`가 우선**이고, 없으면 `expires_in`을
   * 취득 시각에 더한다. 둘 다 없으면 null — "수명을 모른다"이지 "만료 안 한다"가
   * 아니다.
   */
  readonly expiresAtMs: number | null;
  readonly scope: string | null;
}

export interface UaaClientOptions {
  /** 전송 이음매. 기본은 접속 계층과 같은 내장 http/https. */
  readonly transport?: HttpTransport;
  /** UAA 서버 인증서 검증. 기본 true — 끄는 것은 명시적 선택이어야 한다. */
  readonly rejectUnauthorized?: boolean;
  readonly timeoutMs?: number;
  /** 현재 시각. 시험이 주입한다. */
  readonly now?: () => number;
}

export interface AuthorizeUrlParams {
  /** 콜백이 돌아올 자리. `callback.ts`가 만든 loopback URL. */
  readonly redirectUri: string;
  /** CSRF 대조값. 콜백이 같은 값을 되돌려 줘야 한다. */
  readonly state: string;
  readonly scope?: string;
}

/** 종단점 두 개. `url`의 끝 슬래시는 잘라 낸다. */
export function uaaEndpoints(url: string): { readonly token: string; readonly authorize: string } {
  const base = url.trim().replace(/\/+$/, '');
  return { token: `${base}${TOKEN_PATH}`, authorize: `${base}${AUTHORIZE_PATH}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** UAA 오류 본문에서 **두 칸만** 건진다. 나머지는 버린다(토큰 유출 방지). */
function describeRejection(response: HttpResponse): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return `HTTP ${response.status}`;
  }
  if (!isRecord(parsed)) return `HTTP ${response.status}`;

  const error = typeof parsed.error === 'string' ? parsed.error : '';
  const description =
    typeof parsed.error_description === 'string' ? parsed.error_description : '';
  const detail = [error, description].filter((part) => part !== '').join(' — ');
  return detail === '' ? `HTTP ${response.status}` : `HTTP ${response.status} (${detail})`;
}

export class UaaClient {
  private readonly credentials: UaaCredentials;
  private readonly transport: HttpTransport;
  private readonly rejectUnauthorized: boolean;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly endpoints: { readonly token: string; readonly authorize: string };
  private readonly basic: string;

  constructor(credentials: UaaCredentials, options: UaaClientOptions = {}) {
    this.credentials = credentials;
    this.transport = options.transport ?? nodeHttpTransport;
    this.rejectUnauthorized = options.rejectUnauthorized ?? true;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_UAA_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
    this.endpoints = uaaEndpoints(credentials.url);
    this.basic = `Basic ${Buffer.from(
      `${credentials.clientId}:${credentials.clientSecret}`,
      'utf8',
    ).toString('base64')}`;
  }

  /** 진단·시험용. 비밀은 없다. */
  get tokenEndpoint(): string {
    return this.endpoints.token;
  }

  /**
   * 사람이 브라우저에서 열 인가 URL. **여는 것은 호출부다.**
   *
   * `response_type=code`이고 `client_secret`은 실리지 않는다 — 이 URL은 주소창에
   * 남고 히스토리에 쌓인다.
   */
  authorizeUrl(params: AuthorizeUrlParams): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: params.redirectUri,
      state: params.state,
    });
    if (params.scope) query.set('scope', params.scope);
    return `${this.endpoints.authorize}?${query.toString()}`;
  }

  /** 콜백이 받아 온 코드를 토큰으로 바꾼다. */
  async exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
    return this.post(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.credentials.clientId,
      }),
      'UAA_REJECTED',
    );
  }

  /**
   * 갱신 토큰으로 새 접근 토큰을 받는다.
   *
   * 실패는 **`UAA_REFRESH_FAILED`**로 나간다 — 거절이든 전송 실패든 갱신
   * 갈래에서 난 것은 하나의 코드로 묶는다. 호출부가 "갱신이 안 됐다"와 "처음
   * 취득이 안 됐다"를 다르게 다뤄야 하기 때문이다(`tokenSource.ts`).
   */
  async refresh(refreshToken: string): Promise<TokenSet> {
    return this.post(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.credentials.clientId,
      }),
      'UAA_REFRESH_FAILED',
    );
  }

  /** 사람 없이 service key 재료만으로 받는다. */
  async clientCredentials(): Promise<TokenSet> {
    return this.post(
      new URLSearchParams({ grant_type: 'client_credentials', response_type: 'token' }),
      'UAA_REJECTED',
    );
  }

  // ------------------------------------------------------------ 내부 구현

  private async post(
    form: URLSearchParams,
    rejectionCode: 'UAA_REJECTED' | 'UAA_REFRESH_FAILED',
  ): Promise<TokenSet> {
    const body = form.toString();
    const grant = form.get('grant_type') ?? '(unknown)';

    let response: HttpResponse;
    try {
      response = await this.transport({
        method: 'POST',
        url: this.endpoints.token,
        headers: {
          Authorization: this.basic,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
        timeoutMs: this.timeoutMs,
        rejectUnauthorized: this.rejectUnauthorized,
      });
    } catch (error) {
      const detail = error instanceof HttpTransportError ? error.message : String(error);
      throw new AuthError(
        rejectionCode === 'UAA_REFRESH_FAILED' ? 'UAA_REFRESH_FAILED' : 'UAA_REQUEST_FAILED',
        `${grant} 요청이 ${this.endpoints.token} 에 닿지 못했다 — ${detail}`,
        { cause: error },
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new AuthError(
        rejectionCode,
        `${this.endpoints.token} 이(가) ${grant} 를 거절했다 — ${describeRejection(response)}`,
      );
    }

    return this.toTokenSet(response, grant, rejectionCode);
  }

  private toTokenSet(
    response: HttpResponse,
    grant: string,
    rejectionCode: 'UAA_REJECTED' | 'UAA_REFRESH_FAILED',
  ): TokenSet {
    // 2xx인데 쓸 수 없는 본문은 성공이 아니다. 여기서 접지 않으면 빈 문자열이
    // `Bearer ` 뒤에 실려 SAP까지 간다.
    const invalid = (reason: string): AuthError =>
      new AuthError(
        rejectionCode === 'UAA_REFRESH_FAILED' ? 'UAA_REFRESH_FAILED' : 'UAA_RESPONSE_INVALID',
        `${this.endpoints.token} 의 ${grant} 응답을 쓸 수 없다 — ${reason}`,
      );

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw invalid('본문이 JSON이 아니다');
    }
    if (!isRecord(parsed)) throw invalid('본문이 JSON 객체가 아니다');

    const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token.trim() : '';
    if (accessToken === '') throw invalid('access_token 칸이 없거나 비어 있다');

    const refreshToken =
      typeof parsed.refresh_token === 'string' && parsed.refresh_token.trim() !== ''
        ? parsed.refresh_token.trim()
        : null;
    const tokenType =
      typeof parsed.token_type === 'string' && parsed.token_type.trim() !== ''
        ? parsed.token_type.trim()
        : 'bearer';
    const scope = typeof parsed.scope === 'string' && parsed.scope !== '' ? parsed.scope : null;

    return {
      accessToken,
      refreshToken,
      tokenType,
      expiresAtMs: this.resolveExpiry(accessToken, parsed.expires_in),
      scope,
    };
  }

  /**
   * `exp`(토큰 자신이 말하는 것)가 `expires_in`(종단점이 말하는 것)을 이긴다.
   *
   * 둘이 어긋나면 SAP이 믿는 쪽은 토큰 안의 `exp`다. `expires_in`은 왕복 지연을
   * 포함하지 않은 발급 시점 기준이라, 그것만 믿으면 항상 조금씩 늦게 갱신한다.
   */
  private resolveExpiry(accessToken: string, expiresIn: unknown): number | null {
    let fromJwt: number | null = null;
    try {
      fromJwt = jwtExpiresAtMs(accessToken);
    } catch {
      // 깨진 exp — 아래 expires_in으로 내려간다. 여기서 던지면 토큰은 멀쩡한데
      // 취득이 통째로 실패한다.
      fromJwt = null;
    }
    if (fromJwt !== null) return fromJwt;

    const seconds =
      typeof expiresIn === 'number'
        ? expiresIn
        : typeof expiresIn === 'string'
          ? Number(expiresIn)
          : Number.NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return this.now() + Math.trunc(seconds) * 1000;
  }
}
