/**
 * ADT 접속 계층 — 인증·세션·CSRF·잠금 수명주기.
 *
 * 한 인스턴스 = 한 SAP 접속. 쿠키와 CSRF 토큰, 보유 중인 잠금 핸들은 전부 이
 * 인스턴스 안(메모리)에만 있고 디스크로 나가지 않는다.
 *
 * 이 계층이 지키는 프로토콜 사실 다섯 가지:
 * 1. 상태 변경(POST/PUT/DELETE)에는 CSRF 토큰이 필요하고, 토큰은 discovery를
 *    `x-csrf-token: Fetch`로 한 번 긁어와 캐시한다. 취득은 primary discovery가
 *    없는 구형 시스템을 위해 폴백 경로까지 훑고 엔드포인트마다 유한 횟수만
 *    되민다. 끝내 못 얻으면 **토큰 없이 본 요청을 보내고 403에서 회복**한다 —
 *    사전 취득 실패가 곧 작업 실패는 아니다. 반대로 토큰과 세션 쿠키는 한 쌍이라
 *    토큰을 새로 받으면 세션도 갈릴 수 있어, 서버가 실제로 거부했을 때의 본 요청
 *    재시도는 **한 번뿐**이다.
 * 2. 잠금은 stateful 세션에서만 산다. 잠금 취득과 해제 사이에 stateless 요청이
 *    끼면 SAP이 다른 워크 프로세스로 라우팅하며 세션을 접고, 그 다음 쓰기가
 *    "잠금 핸들 무효"로 실패한다. 그래서 잠금을 하나라도 들고 있는 동안에는
 *    본 요청이 전부 stateful로 나간다. **CSRF 취득 요청만은 예외로 세션 타입
 *    헤더를 싣지 않는다** — 구 접속 계층이 그렇고, 세션은 쿠키로 이어진다.
 * 3. 잠금 해제는 실패 경로에서도 보장돼야 한다 — `withLock`이 그 계약이다.
 * 4. 실패는 상태 코드와 `<exc:exception>`의 `type/@id`로 판단한다. 메시지 문구로
 *    판단하지 않는다.
 * 5. Basic 인증에서 첫 GET을 401로 튕기며 세션 쿠키만 심어 주는 시스템이 있다.
 *    그 쿠키를 회수해 **한 번만** 되민다.
 *
 * 인증은 두 갈래다 — `ConnectionConfig.authType`이 `jwt`면 `Bearer`, 그 밖의
 * 모든 경우(키가 없는 기존 프로파일 포함)는 `Basic`이다. 갈림은 **헤더 하나**에
 * 그치고 위 다섯 가지 프로토콜 사실은 두 갈래에서 똑같이 적용된다 — CSRF도
 * 세션도 잠금도 인증 방식과 무관하다.
 */

import { randomUUID } from 'node:crypto';

import type { ConnectionConfig } from '../contracts';
import { AuthError } from '../auth/errors';
import { CookieJar } from './cookies';
import { AdtError, adtErrorFromResponse } from './errors';
import { HttpTransportError, nodeHttpTransport } from './http';
import type { HttpResponse, HttpTransport } from './http';
import { buildAdtUrl } from './url';
import type { QueryParams } from './url';
import { XMLParser } from 'fast-xml-parser';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
export type SessionType = 'stateless' | 'stateful';
/** 타임아웃 3종 중 하나를 고르거나, 밀리초를 직접 준다. */
export type TimeoutSelector = 'default' | 'csrf' | 'long' | number;

/** CSRF 토큰을 긁어오는 ADT discovery 경로. */
export const CSRF_DISCOVERY_PATH = '/sap/bc/adt/core/discovery';
/** primary가 없는 구형 시스템(BASIS 7.52 미만)이 답하는 폴백 discovery 경로. */
export const CSRF_DISCOVERY_FALLBACK_PATH = '/sap/bc/adt/discovery';
/** 엔드포인트 하나당 되미는 횟수(첫 시도 제외)와 그 사이 지연 — 구 접속 계층과 같은 값. */
export const CSRF_RETRY_COUNT = 3;
export const CSRF_RETRY_DELAY_MS = 1000;
export const CSRF_FETCH_ACCEPT = 'application/atomsvc+xml';
export const DEFAULT_ACCEPT = 'application/xml, application/json, text/plain, */*';
export const DEFAULT_CONTENT_TYPE = 'text/plain; charset=utf-8';
/** 잠금 결과 협상용 Accept — ADT가 lock.result / lock.result2 중 하나로 답한다. */
export const ACCEPT_LOCK_RESULT =
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, ' +
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9';

/** 취득 순서: primary → 폴백. 앞이 실패해야 뒤를 본다. */
const CSRF_DISCOVERY_PATHS: readonly string[] = [
  CSRF_DISCOVERY_PATH,
  CSRF_DISCOVERY_FALLBACK_PATH,
];

/** CSRF 토큰을 동반하고, 403 거부 시 재취득 경로를 타는 메서드. */
const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
]);

/**
 * 본 요청 **전에** 토큰을 미리 긁어오는 메서드 — 구 접속 계층과 같은 셋이다.
 * PATCH가 빠져 있는 것은 의도다: PATCH는 403 재시도 경로로만 회복한다.
 */
const CSRF_PREFETCH_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  'POST',
  'PUT',
  'DELETE',
]);

/** 인증서 검증 실패 계열. 프로파일에서 검증을 끄면 풀리는 오류들이다. */
const TLS_CERT_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export interface AdtRequestOptions {
  readonly method: HttpMethod;
  /** `/sap/bc/adt/...` — 오브젝트 이름 인코딩은 호출자 책임. */
  readonly path: string;
  readonly params?: QueryParams;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly accept?: string;
  readonly contentType?: string;
  readonly timeout?: TimeoutSelector;
  /** CSRF 토큰 동반 여부. 기본값은 상태 변경 메서드일 때만 true. */
  readonly csrf?: boolean;
}

export interface AdtResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface LockHandle {
  /** 잠근 오브젝트의 ADT 경로. 해제할 때 같은 경로로 돌아간다. */
  readonly objectPath: string;
  readonly handle: string;
  /** 잠금 응답이 알려준 전송요청(CORRNR). 로컬 오브젝트면 없다. */
  readonly transport?: string;
}

export interface LockOptions {
  /** 기본 `MODIFY`. */
  readonly accessMode?: string;
  /** 잠금 요청에 덧붙일 질의 인자. */
  readonly params?: QueryParams;
}

export interface AdtClientOptions {
  /** 전송 계층 교체점(시험·기록/재생용). 기본은 내장 http/https. */
  readonly transport?: HttpTransport;
  /** `sap-adt-connection-id` 고정값. 기본은 인스턴스마다 새 UUID. */
  readonly connectionId?: string;
  /** CSRF 재시도 사이 대기. 기본은 실제로 기다린다 — 시험은 즉시 끝나는 함수를 준다. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** stateful 요청의 `sap-adt-request-id` 생성기. 기본은 요청마다 새 UUID. */
  readonly newRequestId?: () => string;
}

const lockParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

/** 중첩 깊이에 상관없이 첫 번째 `key` 요소의 텍스트를 찾는다. */
function findFirstText(node: unknown, key: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstText(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = node as Record<string, unknown>;
  if (key in record) {
    const value = record[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value && typeof value === 'object') {
      const text = (value as Record<string, unknown>)['#text'];
      return typeof text === 'string' ? text : '';
    }
    return '';
  }
  for (const value of Object.values(record)) {
    const found = findFirstText(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseLockResult(body: string): { handle: string; transport?: string } | null {
  if (!body || !body.includes('<')) return null;
  let document: unknown;
  try {
    document = lockParser.parse(body);
  } catch {
    return null;
  }
  const handle = findFirstText(document, 'LOCK_HANDLE');
  if (!handle) return null;
  const transport = findFirstText(document, 'CORRNR');
  return { handle, transport: transport || undefined };
}

/**
 * 전송 실패 사유를 **지목 가능한** 문구로 만든다.
 *
 * 인증서 검증 실패는 원인이 문구에 없으면 "그냥 접속이 안 된다"로 끝난다. 이
 * 계층은 검증을 기본으로 켜므로(구는 사실상 꺼져 있었다) 자기서명 인증서를 쓰는
 * DEV 시스템이 여기서 막힐 수 있고, 그 해결책이 되는 프로파일 키를 문구에 함께
 * 담아 사람이 바로 손댈 수 있게 한다.
 */
function describeTransportFailure(error: HttpTransportError): string {
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  if (typeof code === 'string' && TLS_CERT_ERROR_CODES.has(code)) {
    return (
      `${error.message} — 서버 인증서를 검증하지 못했다(${code}). ` +
      '자기서명 인증서를 쓰는 시스템이면 프로파일에 TLS_REJECT_UNAUTHORIZED=0을 ' +
      '넣어야 접속된다.'
    );
  }
  return error.message;
}

/** 이 403이 CSRF 토큰 거부인가. 헤더가 정본이고, 본문은 보조 신호다. */
function isCsrfRejection(response: HttpResponse): boolean {
  const header = response.headers['x-csrf-token'];
  if (header && header.trim().toLowerCase() === 'required') return true;
  return /csrf/i.test(response.body);
}

export class AdtClient {
  private readonly config: ConnectionConfig;
  private readonly transport: HttpTransport;
  private readonly connectionId: string;
  /** Basic 자격증명 한 줄. `jwt` 접속에서는 null이다. */
  private readonly basicAuthorization: string | null;
  /** 지금 실을 Bearer 토큰. `basic` 접속에서는 null이다. */
  private bearer: string | null;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newRequestId: () => string;
  private readonly cookies = new CookieJar();
  private readonly locks = new Map<string, LockHandle>();

  private token: string | null = null;
  private session: SessionType = 'stateless';
  private sessionBeforeLocks: SessionType | null = null;

  constructor(config: ConnectionConfig, options: AdtClientOptions = {}) {
    this.config = config;
    this.transport = options.transport ?? nodeHttpTransport;
    this.connectionId = options.connectionId ?? randomUUID();
    this.sleep =
      options.sleep ??
      ((ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        }));
    // 구 계층과 같은 모양 — 하이픈 없는 32자리 16진수.
    this.newRequestId = options.newRequestId ?? (() => randomUUID().replace(/-/g, ''));

    if (config.authType === 'jwt') {
      const token = (config.jwtToken ?? '').trim();
      if (token === '') {
        // 여기서 접지 않으면 인증 헤더 없는 요청이 SAP에 나가고, 돌아온 401은
        // "자격증명이 틀렸다"로 읽힌다 — 실제 원인(토큰을 못 받았다)에서 아주
        // 먼 진단이다. 접속을 만들지 않는 쪽이 안전 강등 계약(D20)과도 같은 결이다.
        throw new AuthError(
          'AUTH_TOKEN_MISSING',
          'authType=jwt 접속인데 실을 토큰이 없다 — 인증 헤더 없이 SAP에 요청을 보내지 않는다.',
        );
      }
      this.basicAuthorization = null;
      this.bearer = token;
    } else {
      // `authType`이 없거나 `basic`이면 지금까지와 똑같다.
      const credentials = Buffer.from(`${config.username}:${config.password}`, 'utf8').toString(
        'base64',
      );
      this.basicAuthorization = `Basic ${credentials}`;
      this.bearer = null;
    }
  }

  get sessionType(): SessionType {
    return this.session;
  }

  /** 이 접속이 무엇으로 인증하는가. `ConnectionConfig`가 정한 값 그대로. */
  get authType(): 'basic' | 'jwt' {
    return this.bearer === null ? 'basic' : 'jwt';
  }

  /**
   * Bearer 토큰을 갈아 끼운다 — 토큰 계층(`src/auth/tokenSource.ts`)이 갱신한
   * 것을 밀어 넣는 자리.
   *
   * **접속 계층이 스스로 토큰을 받아 오지 않는 이유**: 그러려면 이 클래스가
   * UAA 재료와 갱신 정책을 알아야 하고, 헤더를 짓는 동기 경로가 비동기가 된다.
   * 언제 받아 올지는 호출부의 판단(attended 명시성)이고, 여기는 받은 것을
   * 싣기만 한다.
   *
   * @throws `AUTH_TOKEN_MISSING` — 빈 토큰으로 갈아 끼우려 할 때.
   *   `basic` 접속에서 부르는 것도 같은 오류다(인증 방식을 도중에 바꾸지 않는다).
   */
  setBearerToken(token: string): void {
    if (this.bearer === null) {
      throw new AuthError(
        'AUTH_TOKEN_MISSING',
        'Basic 접속에 Bearer 토큰을 실을 수 없다 — 인증 방식은 접속을 만들 때 정해진다.',
      );
    }
    const trimmed = token.trim();
    if (trimmed === '') {
      throw new AuthError('AUTH_TOKEN_MISSING', '빈 Bearer 토큰으로 갈아 끼울 수 없다.');
    }
    this.bearer = trimmed;
  }

  get csrfToken(): string | null {
    return this.token;
  }

  /** 진단·시험용. 보관된 세션 쿠키가 없으면 undefined. */
  cookieHeader(): string | undefined {
    return this.cookies.header();
  }

  /** 아직 해제되지 않은 잠금들. 해제가 실패한 잠금도 여기 남아 누수를 드러낸다. */
  activeLocks(): readonly LockHandle[] {
    return [...this.locks.values()];
  }

  setSessionType(sessionType: SessionType): void {
    this.session = sessionType;
  }

  /** 세션·토큰·잠금 기록을 전부 버린다(서버측 해제는 하지 않는다). */
  reset(): void {
    this.cookies.clear();
    this.locks.clear();
    this.token = null;
    this.session = 'stateless';
    this.sessionBeforeLocks = null;
  }

  // ---------------------------------------------------------------- 요청

  async request(options: AdtRequestOptions): Promise<AdtResponse> {
    const needsCsrf = options.csrf ?? MUTATING_METHODS.has(options.method);
    const token = needsCsrf ? await this.prefetchCsrfToken(options) : undefined;
    let response = await this.send(options, token);

    if (needsCsrf && response.status === 403 && isCsrfRejection(response)) {
      // 딱 한 번. 재시도 루프를 만들지 않는다.
      const refreshed = await this.ensureCsrfToken(true);
      response = await this.send(options, refreshed);
      if (response.status === 403 && isCsrfRejection(response)) {
        throw this.failure(options, response, 'csrf');
      }
    } else if (response.status === 401 && options.method === 'GET') {
      // else-if인 것은 의도다 — CSRF 재시도와 401 회복이 겹쳐 3회 발송이 되지 않게.
      response = await this.recoverUnauthorizedGet(options, token, response);
    }

    if (response.status >= 400) throw this.failure(options, response);
    return { status: response.status, headers: response.headers, body: response.body };
  }

  /**
   * CSRF 토큰을 확보한다. 캐시가 있으면 재사용하고, `force`면 다시 긁어온다.
   *
   * primary discovery가 없는 구형 시스템을 위해 폴백 경로까지 순서대로 시도하고,
   * 엔드포인트마다 유한 횟수만 되민다. 취득 요청은 세션 타입 헤더 없이 나간다
   * (구 접속 계층과 같다 — 세션 연속성은 쿠키가 진다).
   */
  async ensureCsrfToken(force = false): Promise<string> {
    if (!force && this.token !== null) return this.token;
    this.token = null;

    let lastError: unknown;
    for (const path of CSRF_DISCOVERY_PATHS) {
      try {
        const issued = await this.fetchCsrfTokenFrom(path);
        this.token = issued;
        return issued;
      } catch (error) {
        lastError = error;
      }
    }
    // 폴백까지 소진 — 마지막 실패를 그대로 올린다.
    throw lastError;
  }

  // ---------------------------------------------------------------- 잠금

  /** `?_action=LOCK&accessMode=MODIFY`. 성공하면 세션이 stateful로 남는다. */
  async lock(objectPath: string, options: LockOptions = {}): Promise<LockHandle> {
    if (this.locks.size === 0) this.sessionBeforeLocks = this.session;
    this.setSessionType('stateful');

    try {
      const response = await this.request({
        method: 'POST',
        path: objectPath,
        params: {
          _action: 'LOCK',
          accessMode: options.accessMode ?? 'MODIFY',
          ...options.params,
        },
        accept: ACCEPT_LOCK_RESULT,
      });

      const parsed = parseLockResult(response.body);
      if (!parsed) {
        throw new AdtError({
          kind: 'protocol',
          status: response.status,
          method: 'POST',
          url: buildAdtUrl(this.config, objectPath, { _action: 'LOCK' }),
          rawBody: response.body,
          detail: '잠금 응답에서 LOCK_HANDLE을 찾지 못했다',
        });
      }

      const lock: LockHandle = {
        objectPath,
        handle: parsed.handle,
        transport: parsed.transport,
      };
      this.locks.set(objectPath, lock);
      return lock;
    } catch (error) {
      if (this.locks.size === 0) this.restoreSessionAfterLocks();
      throw error;
    }
  }

  /** `?_action=UNLOCK&lockHandle=...`. 마지막 잠금이 풀리면 세션을 되돌린다. */
  async unlock(lock: LockHandle): Promise<void> {
    await this.request({
      method: 'POST',
      path: lock.objectPath,
      params: { _action: 'UNLOCK', lockHandle: lock.handle },
      accept: 'application/xml',
    });
    this.locks.delete(lock.objectPath);
    if (this.locks.size === 0) this.restoreSessionAfterLocks();
  }

  /**
   * 잠금 → 작업 → **반드시** 해제.
   *
   * 작업이 실패하면 해제를 시도한 뒤 **원래 오류**를 올린다(해제 실패가 원인을
   * 가리지 않게). 해제가 실패한 잠금은 `activeLocks()`에 남아 누수가 드러난다.
   */
  async withLock<T>(
    objectPath: string,
    work: (lock: LockHandle) => Promise<T>,
    options: LockOptions = {},
  ): Promise<T> {
    const lock = await this.lock(objectPath, options);
    let result: T;
    try {
      result = await work(lock);
    } catch (error) {
      try {
        await this.unlock(lock);
      } catch {
        // 원래 오류가 이긴다. 못 푼 잠금은 activeLocks()가 증언한다.
      }
      throw error;
    }
    await this.unlock(lock);
    return result;
  }

  /** 남은 잠금을 최선 노력으로 모두 해제한다. 실패는 삼키되 기록에는 남긴다. */
  async releaseAllLocks(): Promise<void> {
    for (const lock of [...this.locks.values()]) {
      try {
        await this.unlock(lock);
      } catch {
        // 최선 노력 — 실패한 잠금은 activeLocks()에 남는다.
      }
    }
  }

  // ------------------------------------------------------------ 내부 구현

  /**
   * 본 요청 전에 토큰을 미리 확보한다. 대상은 POST/PUT/DELETE(또는 호출자가
   * `csrf: true`로 명시한 요청)뿐이다.
   *
   * **실패해도 던지지 않는다** — 토큰 없이 본 요청을 보내고, 서버가 403으로
   * 거부하면 그때 재취득해 한 번 되민다. 구 접속 계층과 같은 회복 경로다.
   */
  private async prefetchCsrfToken(options: AdtRequestOptions): Promise<string | undefined> {
    if (options.csrf !== true && !CSRF_PREFETCH_METHODS.has(options.method)) return undefined;
    try {
      return await this.ensureCsrfToken();
    } catch {
      return undefined;
    }
  }

  /** discovery 한 경로에서 토큰을 긁어온다. 유한 횟수만 되민다. */
  private async fetchCsrfTokenFrom(path: string): Promise<string> {
    const options: AdtRequestOptions = {
      method: 'GET',
      path,
      accept: CSRF_FETCH_ACCEPT,
      timeout: 'csrf',
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= CSRF_RETRY_COUNT; attempt += 1) {
      if (attempt > 0) await this.sleep(CSRF_RETRY_DELAY_MS);

      let response: HttpResponse;
      try {
        response = await this.send(options, 'Fetch', 'stateless');
      } catch (error) {
        // 전송 자체가 실패했다(타임아웃·네트워크). 남은 횟수만큼 되민다.
        lastError = error;
        continue;
      }

      const issued = response.headers['x-csrf-token']?.trim();
      // 상태가 4xx여도 토큰이 실려 오면 채택한다(일부 시스템은 405로 답한다).
      if (issued && issued.toLowerCase() !== 'required') return issued;

      lastError =
        response.status >= 400
          ? this.failure(options, response)
          : new AdtError({
              kind: 'protocol',
              status: response.status,
              method: 'GET',
              url: buildAdtUrl(this.config, path),
              rawBody: response.body,
              detail: 'discovery 응답에 x-csrf-token 헤더가 없다',
            });
    }
    throw lastError;
  }

  /**
   * Basic 인증에서 GET이 401로 튕겼을 때 **한 번만** 되민다.
   *
   * 오류 응답이 심어 준 세션 쿠키는 `send`가 이미 회수해 뒀다. 그것으로 바로
   * 되밀고, 쿠키가 하나도 없으면 CSRF fetch로 쿠키를 얻은 뒤 되민다. 그래도
   * 쿠키가 없으면 원래 401을 그대로 돌려준다 — 세 번째 시도는 없다.
   */
  private async recoverUnauthorizedGet(
    options: AdtRequestOptions,
    csrfHeader: string | undefined,
    unauthorized: HttpResponse,
  ): Promise<HttpResponse> {
    if (this.cookies.header() === undefined) {
      try {
        await this.ensureCsrfToken(true);
      } catch {
        // 쿠키를 못 얻었다. 아래에서 원래 401을 그대로 돌려준다.
      }
    }
    if (this.cookies.header() === undefined) return unauthorized;
    return this.send(options, csrfHeader);
  }

  private restoreSessionAfterLocks(): void {
    this.session = this.sessionBeforeLocks ?? 'stateless';
    this.sessionBeforeLocks = null;
  }

  private resolveTimeout(selector: TimeoutSelector | undefined): number {
    if (typeof selector === 'number') return selector;
    if (selector === 'csrf') return this.config.timeouts.csrf;
    if (selector === 'long') return this.config.timeouts.long;
    return this.config.timeouts.default;
  }

  /**
   * 지금 실을 `Authorization` 값. 생성자가 둘 중 정확히 하나를 세워 두므로
   * 여기서 갈리는 것은 **그 하나를 고르는 일**뿐이다.
   *
   * 마지막 갈래는 도달할 수 없다 — 도달했다면 생성자의 불변식이 깨진 것이므로
   * 빈 헤더로 SAP에 가느니 여기서 이름을 대고 멈춘다.
   */
  private authorizationHeader(): string {
    if (this.bearer !== null) return `Bearer ${this.bearer}`;
    if (this.basicAuthorization !== null) return this.basicAuthorization;
    throw new AuthError(
      'AUTH_TOKEN_MISSING',
      '접속에 실을 인증 정보가 없다 — 인증 헤더 없이 요청을 보내지 않는다.',
    );
  }

  private buildHeaders(
    options: AdtRequestOptions,
    csrfHeader: string | undefined,
    session: SessionType,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: options.accept ?? DEFAULT_ACCEPT,
      'sap-adt-connection-id': this.connectionId,
    };
    if (options.contentType !== undefined) {
      headers['Content-Type'] = options.contentType;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = DEFAULT_CONTENT_TYPE;
    }
    if (session === 'stateful') {
      // 셋은 한 벌이다 — 구 접속 계층은 stateful 요청에 늘 함께 싣는다.
      headers['x-sap-adt-sessiontype'] = 'stateful';
      headers['sap-adt-request-id'] = this.newRequestId();
      headers['X-sap-adt-profiling'] = 'server-time';
    }
    if (csrfHeader !== undefined) headers['x-csrf-token'] = csrfHeader;

    for (const [name, value] of Object.entries(options.headers ?? {})) {
      const lowered = name.toLowerCase();
      // 인증과 세션은 호출자가 갈아끼울 수 없다.
      if (lowered === 'authorization' || lowered === 'cookie') continue;
      headers[name] = value;
    }

    // 인증 3종은 호출자 헤더 뒤에 놓는다 — 덮어쓸 수 없어야 한다.
    headers['Authorization'] = this.authorizationHeader();
    if (this.config.client) headers['X-SAP-Client'] = this.config.client;
    const cookie = this.cookies.header();
    if (cookie) headers['Cookie'] = cookie;
    return headers;
  }

  private async send(
    options: AdtRequestOptions,
    csrfHeader: string | undefined,
    session: SessionType = this.session,
  ): Promise<HttpResponse> {
    const url = buildAdtUrl(this.config, options.path, options.params);
    let response: HttpResponse;
    try {
      response = await this.transport({
        method: options.method,
        url,
        headers: this.buildHeaders(options, csrfHeader, session),
        body: options.body,
        timeoutMs: this.resolveTimeout(options.timeout),
        rejectUnauthorized: this.config.rejectUnauthorized,
      });
    } catch (error) {
      if (error instanceof HttpTransportError) {
        throw new AdtError({
          kind: error.reason,
          method: options.method,
          url,
          detail: describeTransportFailure(error),
          cause: error,
        });
      }
      throw error;
    }
    this.cookies.accept(response.setCookie);
    if (response.setCookie.length > 0 && this.config.client) {
      // SAP은 `X-SAP-Client` 대신 시스템 기본 클라이언트를 담은 `sap-usercontext`를
      // 돌려주기도 한다. 그대로 두면 다음 요청이 기본 클라이언트로 라우팅돼 write가
      // 403으로 막힌다 — 설정된 클라이언트로 덮어쓴다.
      this.cookies.accept([`sap-usercontext=sap-client=${this.config.client}`]);
    }
    return response;
  }

  private failure(
    options: AdtRequestOptions,
    response: HttpResponse,
    kindOverride?: 'csrf',
  ): AdtError {
    return adtErrorFromResponse(
      {
        status: response.status,
        statusText: response.statusText,
        method: options.method,
        url: buildAdtUrl(this.config, options.path, options.params),
        body: response.body,
      },
      kindOverride,
    );
  }
}
