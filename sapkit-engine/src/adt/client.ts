/**
 * ADT 접속 계층 — 인증·세션·CSRF·잠금 수명주기.
 *
 * 한 인스턴스 = 한 SAP 접속. 쿠키와 CSRF 토큰, 보유 중인 잠금 핸들은 전부 이
 * 인스턴스 안(메모리)에만 있고 디스크로 나가지 않는다.
 *
 * 이 계층이 지키는 프로토콜 사실 네 가지:
 * 1. 상태 변경(POST/PUT/DELETE)에는 CSRF 토큰이 필요하고, 토큰은 discovery를
 *    `x-csrf-token: Fetch`로 한 번 긁어와 캐시한다. 토큰과 세션 쿠키는 한 쌍이라
 *    토큰을 새로 받으면 세션도 갈릴 수 있다 — 그래서 재취득은 서버가 실제로
 *    거부했을 때 **한 번만** 한다.
 * 2. 잠금은 stateful 세션에서만 산다. 잠금 취득과 해제 사이에 stateless 요청이
 *    끼면 SAP이 다른 워크 프로세스로 라우팅하며 세션을 접고, 그 다음 쓰기가
 *    "잠금 핸들 무효"로 실패한다. 그래서 잠금을 하나라도 들고 있는 동안에는
 *    CSRF 재취득까지 포함해 **모든** 요청이 stateful로 나간다.
 * 3. 잠금 해제는 실패 경로에서도 보장돼야 한다 — `withLock`이 그 계약이다.
 * 4. 실패는 상태 코드와 `<exc:exception>`의 `type/@id`로 판단한다. 메시지 문구로
 *    판단하지 않는다.
 */

import { randomUUID } from 'node:crypto';

import type { ConnectionConfig } from '../contracts';
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
export const CSRF_FETCH_ACCEPT = 'application/atomsvc+xml';
export const DEFAULT_ACCEPT = 'application/xml, application/json, text/plain, */*';
export const DEFAULT_CONTENT_TYPE = 'text/plain; charset=utf-8';
/** 잠금 결과 협상용 Accept — ADT가 lock.result / lock.result2 중 하나로 답한다. */
export const ACCEPT_LOCK_RESULT =
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, ' +
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9';

const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
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
  private readonly authorization: string;
  private readonly cookies = new CookieJar();
  private readonly locks = new Map<string, LockHandle>();

  private token: string | null = null;
  private session: SessionType = 'stateless';
  private sessionBeforeLocks: SessionType | null = null;

  constructor(config: ConnectionConfig, options: AdtClientOptions = {}) {
    this.config = config;
    this.transport = options.transport ?? nodeHttpTransport;
    this.connectionId = options.connectionId ?? randomUUID();
    const credentials = Buffer.from(`${config.username}:${config.password}`, 'utf8').toString(
      'base64',
    );
    this.authorization = `Basic ${credentials}`;
  }

  get sessionType(): SessionType {
    return this.session;
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
    const token = needsCsrf ? await this.ensureCsrfToken() : undefined;
    let response = await this.send(options, token);

    if (needsCsrf && response.status === 403 && isCsrfRejection(response)) {
      // 딱 한 번. 재시도 루프를 만들지 않는다.
      const refreshed = await this.ensureCsrfToken(true);
      response = await this.send(options, refreshed);
      if (response.status === 403 && isCsrfRejection(response)) {
        throw this.failure(options, response, 'csrf');
      }
    }

    if (response.status >= 400) throw this.failure(options, response);
    return { status: response.status, headers: response.headers, body: response.body };
  }

  /**
   * CSRF 토큰을 확보한다. 캐시가 있으면 재사용하고, `force`면 다시 긁어온다.
   * 잠금 보유 중이면 이 요청도 stateful로 나간다(세션이 끊기면 잠금이 죽는다).
   */
  async ensureCsrfToken(force = false): Promise<string> {
    if (!force && this.token !== null) return this.token;
    this.token = null;

    const options: AdtRequestOptions = {
      method: 'GET',
      path: CSRF_DISCOVERY_PATH,
      accept: CSRF_FETCH_ACCEPT,
      timeout: 'csrf',
    };
    const response = await this.send(options, 'Fetch');
    const issued = response.headers['x-csrf-token']?.trim();

    // 상태가 4xx여도 토큰이 실려 오면 채택한다(일부 시스템은 405로 답한다).
    if (issued && issued.toLowerCase() !== 'required') {
      this.token = issued;
      return issued;
    }
    if (response.status >= 400) throw this.failure(options, response);
    throw new AdtError({
      kind: 'protocol',
      status: response.status,
      method: 'GET',
      url: buildAdtUrl(this.config, CSRF_DISCOVERY_PATH),
      rawBody: response.body,
      detail: 'discovery 응답에 x-csrf-token 헤더가 없다',
    });
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

  private buildHeaders(
    options: AdtRequestOptions,
    csrfHeader: string | undefined,
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
    if (this.session === 'stateful') headers['x-sap-adt-sessiontype'] = 'stateful';
    if (csrfHeader !== undefined) headers['x-csrf-token'] = csrfHeader;

    for (const [name, value] of Object.entries(options.headers ?? {})) {
      const lowered = name.toLowerCase();
      // 인증과 세션은 호출자가 갈아끼울 수 없다.
      if (lowered === 'authorization' || lowered === 'cookie') continue;
      headers[name] = value;
    }

    headers['Authorization'] = this.authorization;
    const cookie = this.cookies.header();
    if (cookie) headers['Cookie'] = cookie;
    return headers;
  }

  private async send(
    options: AdtRequestOptions,
    csrfHeader: string | undefined,
  ): Promise<HttpResponse> {
    const url = buildAdtUrl(this.config, options.path, options.params);
    let response: HttpResponse;
    try {
      response = await this.transport({
        method: options.method,
        url,
        headers: this.buildHeaders(options, csrfHeader),
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
          detail: error.message,
          cause: error,
        });
      }
      throw error;
    }
    this.cookies.accept(response.setCookie);
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
