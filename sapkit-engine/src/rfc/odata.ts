/**
 * `odata` 통로 — SAP OData v2 서비스 `ZSAPKIT_ADT_SRV`의 FunctionImport
 * `Dispatch` / `Textpool`을 거쳐 기설치 함수모듈 `ZSAPKIT_ADT_DISPATCH` /
 * `ZSAPKIT_ADT_TEXTPOOL`에 닿는다.
 *
 * **M1이 짓는 유일한 통로다** — 소유자 프로파일이 실제로 타는 경로이기 때문이다
 * (근거는 `README.md`). 이름·경로·인자 계약은 구 엔진
 * `engine/src/lib/odataRfc.ts`와 동일하게 두며, SAP 측에는 아무것도 새로
 * 설치하지 않는다(결정 D-079 ⑥).
 *
 * 필요한 env (활성 프로파일의 `sap.env`):
 *   SAP_RFC_ODATA_SERVICE_URL  — 예: https://host:44300/sap/opu/odata/sap/ZSAPKIT_ADT_SRV
 *   SAP_RFC_ODATA_CSRF_TTL_SEC — 토큰 캐시 수명(초). 기본 600, 하한 60
 * 자격증명·클라이언트·타임아웃·TLS 방침은 `ConnectionConfig`가 준다.
 *
 * CSRF 2단 악수:
 *   1. GET  {service}/$metadata  +  `X-CSRF-Token: Fetch`
 *      → 응답 헤더의 토큰 + `Set-Cookie` 세션
 *   2. POST {service}/Dispatch?IV_ACTION='...'&IV_PARAMS='...'
 *      +  `X-CSRF-Token: <토큰>` + `Cookie`
 *   403 + `x-csrf-token: required` → 캐시를 비우고 **한 번만** 되민다.
 *
 * 서버 쪽 함정(구 소스가 실측으로 남긴 것): SEGW `ZCL_ZSAPKIT_ADT_MPC_EXT`의 모든
 * FunctionImport는 `set_return_complex_type()`과 `set_return_multiplicity('1')`을
 * **둘 다** 불러야 한다. 뒤쪽이 빠지면 `$metadata`에서 `ReturnType` 속성이 조용히
 * 사라지고 모든 POST가 HTTP 500으로 떨어진다. 또 FunctionImport URL에
 * `$format=json`을 붙이면 Gateway가 거부하므로 `Accept` 헤더로만 협상한다.
 */

import { CookieJar } from '../adt/cookies';
import { HttpTransportError, nodeHttpTransport } from '../adt/http';
import type { HttpResponse, HttpTransport } from '../adt/http';
import type { ConnectionConfig } from '../contracts';
import { RfcError, rfcKindFromStatus, truncateBody } from './errors';
import type {
  DdicReadChannel,
  DdicReadResult,
  DdicTablReadParams,
  DispatchResult,
  RfcChannel,
  TextpoolAction,
  TextpoolParams,
  TextpoolResult,
} from './types';

const BACKEND = 'odata' as const;
const DEFAULT_CSRF_TTL_SEC = 600;
const MIN_CSRF_TTL_SEC = 60;
const DISPATCH_FM = 'ZSAPKIT_ADT_DISPATCH';
const TEXTPOOL_FM = 'ZSAPKIT_ADT_TEXTPOOL';
const DDIC_TABL_READ_FM = 'ZSAPKIT_ADT_DDIC_TABL_READ';

/** 이 통로가 부르는 FunctionImport 이름들. 봉투 이름 탐지에도 쓴다. */
type FunctionImportName = 'Dispatch' | 'Textpool' | 'DdicTablRead';

export interface ODataChannelOptions {
  readonly connection: ConnectionConfig;
  /** `SAP_RFC_*` 키들. `mergeRfcEnv`가 만든 것을 그대로 받는다. */
  readonly env: Readonly<Record<string, string>>;
  /** 전송 계층 교체점(시험·기록/재생용). 기본은 내장 http/https. */
  readonly transport?: HttpTransport;
  /** 토큰 캐시 수명 판정에 쓰는 시계. 기본 `Date.now`. */
  readonly now?: () => number;
}

interface CsrfSession {
  readonly token: string;
  /** 요청에 실을 `Cookie` 헤더 값. 없으면 빈 문자열. */
  readonly cookie: string;
  readonly expiresAt: number;
}

/** 객체가 아닐 수 있는 값에서 필드 하나를 안전하게 꺼낸다. */
function field(node: unknown, name: string): unknown {
  if (node !== null && typeof node === 'object') {
    return (node as Record<string, unknown>)[name];
  }
  return undefined;
}

/**
 * OData v2 문자열 리터럴: 작은따옴표로 감싸고, 안의 작은따옴표는 두 배로 쓴다.
 * 감싸는 따옴표 자체는 인코딩하지 않는다(`encodeURIComponent`는 `'`를 건드리지
 * 않으므로 두 배가 된 따옴표도 그대로 남는다) — 구 엔진과 같은 바이트다.
 */
function encodeODataStringLiteral(value: string): string {
  return `'${encodeURIComponent(value.replace(/'/g, "''"))}'`;
}

function tryParseJson(raw: string, fallback: unknown): unknown {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/** 이 403이 "토큰을 다시 받아라"인가. 헤더가 정본이다. */
function isCsrfRefreshSignal(response: HttpResponse): boolean {
  const header = response.headers['x-csrf-token'];
  return header !== undefined && header.trim().toLowerCase() === 'required';
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * odata 통로 하나를 만든다.
 *
 * 반환 타입이 `RfcChannel`보다 넓은 것은 이 통로만 ECC DDIC 브리지에 닿기
 * 때문이다(`DdicReadChannel` 주석 참조). 통로 이름만 보는 호출자는 그대로
 * `RfcChannel`로 받으면 된다.
 */
export function createODataChannel(options: ODataChannelOptions): RfcChannel & DdicReadChannel {
  return new ODataChannel(options);
}

class ODataChannel implements RfcChannel, DdicReadChannel {
  readonly backend = BACKEND;

  private readonly connection: ConnectionConfig;
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private readonly serviceUrl: string;
  private readonly ttlMs: number;
  private readonly authorization: string;

  private session: CsrfSession | null = null;

  constructor(options: ODataChannelOptions) {
    this.connection = options.connection;
    this.transport = options.transport ?? nodeHttpTransport;
    this.now = options.now ?? Date.now;
    // 통로를 세우는 시점에 설정을 확정한다 — 첫 호출까지 미루면 실패가 요청
    // 경로에서 터져 "SAP이 거부했다"처럼 보인다.
    this.serviceUrl = this.requireEnv(options.env, 'SAP_RFC_ODATA_SERVICE_URL').replace(/\/+$/, '');
    this.ttlMs = readTtlMs(options.env['SAP_RFC_ODATA_CSRF_TTL_SEC']);
    this.authorization = `Basic ${Buffer.from(
      `${options.connection.username}:${options.connection.password}`,
      'utf8',
    ).toString('base64')}`;
  }

  async callDispatch(
    action: string,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<DispatchResult> {
    const raw = await this.postFunctionImport('Dispatch', {
      IV_ACTION: action,
      IV_PARAMS: JSON.stringify(params ?? {}),
    });
    return this.unwrap(raw, { functionModule: DISPATCH_FM, action, emptyResult: {} });
  }

  async callTextpool(action: TextpoolAction, params: TextpoolParams): Promise<TextpoolResult> {
    const raw = await this.postFunctionImport('Textpool', {
      IV_ACTION: action,
      IV_PROGRAM: params.program,
      IV_LANGUAGE: params.language ?? '',
      IV_TEXTPOOL_JSON: params.textpoolJson ?? '',
    });
    return this.unwrap(raw, { functionModule: TEXTPOOL_FM, action, emptyResult: [] });
  }

  /**
   * ECC DDIC 브리지. 구 엔진의 `callDdicTablRead`와 같은 이름·같은 두 인자다
   * (`engine/src/lib/odataRfc.ts:564-586`).
   */
  async callDdicTablRead(params: DdicTablReadParams): Promise<DdicReadResult> {
    const raw = await this.postFunctionImport('DdicTablRead', {
      IV_NAME: params.name,
      IV_VERSION: params.version ?? 'A',
    });
    return this.unwrapDdic(raw, params.name);
  }

  // ------------------------------------------------------------ 내부 구현

  private requireEnv(env: Readonly<Record<string, string>>, key: string): string {
    const value = (env[key] ?? '').trim();
    if (!value) {
      throw new RfcError({
        kind: 'config',
        backend: BACKEND,
        message:
          `${key} is required for SAP_RFC_BACKEND=odata but not set in sap.env. ` +
          `Set it to the ZSAPKIT_ADT_SRV service root, e.g. ` +
          `https://<host>:<port>/sap/opu/odata/sap/ZSAPKIT_ADT_SRV (no trailing slash).`,
      });
    }
    return value;
  }

  /** 클라이언트 번호는 질의 인자로 나간다 — ADT 경로(헤더+쿠키)와 다르다. */
  private withSapClient(url: string): string {
    const client = this.connection.client;
    if (!client) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}sap-client=${encodeURIComponent(client)}`;
  }

  private functionImportUrl(actionName: string, params: Readonly<Record<string, string>>): string {
    const pairs = Object.entries(params).map(
      ([key, value]) => `${key}=${encodeODataStringLiteral(value)}`,
    );
    const path = pairs.length > 0 ? `${actionName}?${pairs.join('&')}` : actionName;
    return this.withSapClient(`${this.serviceUrl}/${path}`);
  }

  private async send(
    method: 'GET' | 'POST',
    url: string,
    headers: Readonly<Record<string, string>>,
    body?: string,
  ): Promise<HttpResponse> {
    try {
      return await this.transport({
        method,
        url,
        headers: { ...headers, Authorization: this.authorization },
        // 본문 없는 POST에도 `Content-Length: 0`이 나가도록 빈 문자열을 준다.
        ...(body === undefined ? {} : { body }),
        timeoutMs: this.connection.timeouts.long,
        rejectUnauthorized: this.connection.rejectUnauthorized,
      });
    } catch (error) {
      if (error instanceof HttpTransportError) {
        throw new RfcError({
          kind: error.reason,
          backend: BACKEND,
          method,
          url,
          message: `odata RFC 통로 전송 실패 (${method} ${url}): ${error.message}`,
          cause: error,
        });
      }
      throw error;
    }
  }

  private httpFailure(
    method: 'GET' | 'POST',
    url: string,
    response: HttpResponse,
    what: string,
  ): RfcError {
    return new RfcError({
      kind: rfcKindFromStatus(response.status),
      backend: BACKEND,
      status: response.status,
      method,
      url,
      rawBody: truncateBody(response.body),
      message: `${what}이(가) HTTP ${response.status}로 응답했다 (${method} ${url}): ${truncateBody(
        response.body,
      )}`,
    });
  }

  /** 캐시된 토큰이 살아 있으면 그대로, 아니면 새로 긁어온다. */
  private async ensureSession(): Promise<CsrfSession> {
    const cached = this.session;
    if (cached !== null && cached.expiresAt > this.now()) return cached;
    const fresh = await this.fetchCsrf();
    this.session = fresh;
    return fresh;
  }

  private async fetchCsrf(): Promise<CsrfSession> {
    const url = this.withSapClient(`${this.serviceUrl}/$metadata`);
    const response = await this.send('GET', url, {
      'X-CSRF-Token': 'Fetch',
      Accept: 'application/xml',
    });

    if (!isSuccess(response.status)) {
      throw this.httpFailure('GET', url, response, 'CSRF 토큰 취득($metadata)');
    }

    const token = response.headers['x-csrf-token']?.trim();
    if (!token || token.toLowerCase() === 'required') {
      throw new RfcError({
        kind: 'protocol',
        backend: BACKEND,
        status: response.status,
        method: 'GET',
        url,
        rawBody: truncateBody(response.body),
        message:
          `CSRF 토큰 취득 응답에 x-csrf-token 헤더가 없다 (GET ${url}). ` +
          `서비스가 /IWFND/MAINT_SERVICE에 등록돼 있고 URL 경로가 맞는지 확인한다.`,
      });
    }

    // 쿠키는 이 통로 안에서만 산다 — 디스크로 나가지 않는다.
    const jar = new CookieJar();
    jar.accept(response.setCookie);

    return { token, cookie: jar.header() ?? '', expiresAt: this.now() + this.ttlMs };
  }

  /**
   * FunctionImport 하나를 POST 한다. 403 + `x-csrf-token: required`면 토큰을
   * 다시 받아 **한 번만** 되민다 — 되민 뒤에도 거부되면 `csrf` 오류로 끝낸다.
   * (구 엔진은 같은 자리에서 자기 자신을 재귀 호출해 상한이 없다.)
   */
  private async postFunctionImport(
    actionName: FunctionImportName,
    params: Readonly<Record<string, string>>,
    retried = false,
  ): Promise<unknown> {
    const url = this.functionImportUrl(actionName, params);
    const session = await this.ensureSession();

    const response = await this.send(
      'POST',
      url,
      {
        'X-CSRF-Token': session.token,
        Accept: 'application/json',
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      '',
    );

    if (response.status === 403 && isCsrfRefreshSignal(response)) {
      if (retried) {
        throw new RfcError({
          kind: 'csrf',
          backend: BACKEND,
          status: response.status,
          method: 'POST',
          url,
          rawBody: truncateBody(response.body),
          message: `CSRF 토큰을 다시 받은 뒤에도 거부됐다 (POST ${url}).`,
        });
      }
      this.session = null;
      return this.postFunctionImport(actionName, params, true);
    }

    if (!isSuccess(response.status)) {
      throw this.httpFailure('POST', url, response, `FunctionImport ${actionName}`);
    }

    let body: unknown;
    try {
      body = JSON.parse(response.body) as unknown;
    } catch (error) {
      throw new RfcError({
        kind: 'protocol',
        backend: BACKEND,
        status: response.status,
        method: 'POST',
        url,
        rawBody: truncateBody(response.body),
        message: `FunctionImport ${actionName}이(가) JSON이 아닌 본문으로 답했다 (POST ${url}).`,
        cause: error,
      });
    }

    // OData v2 봉투는 두 형태로 온다: `{d:{Dispatch:{…}}}`(이름 감쌈)와
    // `{d:{…}}`(직결). 이름 쪽을 먼저 보고, 없으면 `d`를 그대로 쓴다.
    const envelope = field(body, 'd');
    if (envelope === undefined || envelope === null) {
      throw new RfcError({
        kind: 'protocol',
        backend: BACKEND,
        status: response.status,
        method: 'POST',
        url,
        rawBody: truncateBody(response.body),
        message: `FunctionImport ${actionName}의 응답에 'd' 봉투가 없다 (POST ${url}).`,
      });
    }
    if (typeof envelope === 'object' && actionName in (envelope as object)) {
      return (envelope as Record<string, unknown>)[actionName];
    }
    return envelope;
  }

  /**
   * 대리자 함수모듈의 세 출력(`EV_SUBRC`·`EV_MESSAGE`·`EV_RESULT`)을 결과 또는
   * `sap` 오류로 정규화한다. `subrc != 0`이면 던진다 — 구 엔진과 같은 문구를
   * 쓴다(이 문자열이 도구 응답으로 그대로 나가므로 재생 대조의 대상이다).
   */
  private unwrap(
    raw: unknown,
    context: { functionModule: string; action: string; emptyResult: unknown },
  ): DispatchResult {
    const subrc = Number(field(raw, 'EV_SUBRC') ?? 0);
    const message = String(field(raw, 'EV_MESSAGE') ?? '');
    const resultRaw = String(field(raw, 'EV_RESULT') ?? '');
    const result = tryParseJson(resultRaw, context.emptyResult);

    if (subrc !== 0) {
      throw new RfcError({
        kind: 'sap',
        backend: BACKEND,
        subrc,
        sapMessage: message,
        action: context.action,
        functionModule: context.functionModule,
        message: `${context.functionModule} error (action=${context.action}, subrc=${subrc}): ${message}`,
      });
    }
    return { result, subrc, message };
  }

  /**
   * DDIC 브리지의 세 출력을 정규화한다.
   *
   * **문턱이 다르다.** 대리자 두 종은 `subrc != 0`이면 곧 실패지만, DDIC
   * 브리지는 `subrc >= 8`일 때만 던진다(`engine/src/lib/odataRfc.ts:580`).
   * 4는 "찾지 못했다" 계열이라 메시지와 함께 정상 반환되고, 그것을 어떻게
   * 표현할지는 도구가 정한다 — 구 핸들러가 `subrc !== 0`을 자기 문구로 다시
   * 판정하는 이유다. 여기서 4를 던지면 그 문구가 영영 나오지 않는다.
   *
   * 던질 때의 문구는 구 엔진 글자 그대로다 — 도구 응답으로 나가는 계약성
   * 문자열이다(장부 D13의 경계).
   */
  private unwrapDdic(raw: unknown, name: string): DdicReadResult {
    const subrc = Number(field(raw, 'EV_SUBRC') ?? 0);
    const message = String(field(raw, 'EV_MESSAGE') ?? '');
    const result = tryParseJson(String(field(raw, 'EV_RESULT') ?? ''), {});

    if (subrc >= 8) {
      throw new RfcError({
        kind: 'sap',
        backend: BACKEND,
        subrc,
        sapMessage: message,
        functionModule: DDIC_TABL_READ_FM,
        message: `${DDIC_TABL_READ_FM} error (name=${name}, subrc=${subrc}): ${message}`,
      });
    }
    return { result, subrc, message };
  }
}

/**
 * `SAP_RFC_ODATA_CSRF_TTL_SEC` → 밀리초. 기본 600초, 하한 60초, 숫자가 아니면
 * 기본값 — 구 엔진과 같은 계산이다.
 */
function readTtlMs(raw: string | undefined): number {
  const seconds = Number(raw ?? DEFAULT_CSRF_TTL_SEC);
  const resolved = Number.isFinite(seconds) ? seconds : DEFAULT_CSRF_TTL_SEC;
  return Math.max(MIN_CSRF_TTL_SEC, resolved) * 1000;
}
