/**
 * `zrfc` 통로 — SAP에 설치한 **커스텀 ICF 핸들러** `ZCL_MCP_RFC_HTTP_HANDLER`를
 * 거쳐 기설치 함수모듈 `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL`에 닿는다.
 * 핸들러는 SICF 노드 `/sap/bc/rest/zmcp_rfc`에 마운트돼 있고 `/dispatch`와
 * `/textpool` 두 엔드포인트를 HTTPS/JSON으로 노출한다.
 *
 * **왜 이 통로가 따로 있나**: 다른 넷이 전부 막힌 자리를 위한 것이다 — NW RFC
 * SDK 설치 불가(`native`·`gateway`), `/sap/bc/soap/rfc` 정책 차단(`soap`),
 * ECC에서 Gateway 등록 곤란(`odata`). Basis 작업은 클래스 하나 + SICF 노드
 * 하나뿐이다(구 안내서 `engine/docs/installation/ZRFC_SETUP.md:1-16`).
 *
 * ---
 * ⚠️ **이 판에서는 동작 확인이 불가능하다.**
 * 위 SAP 측 오브젝트 2종이 소유자 시스템에 없으므로, 이 통로는 오프라인
 * 조립 대조까지만 검증됐다. 실제 왕복 확인은 **attended 세션 몫**이다
 * (차이 장부 `harness/DIVERGENCES.md`의 zrfc 항목).
 * ---
 *
 * 구조는 `odata` 통로와 형제다(둘 다 HTTPS + Basic + CSRF 이중제출 쿠키).
 * 갈리는 지점만 적으면:
 *
 * | | `odata` | `zrfc` |
 * |---|---|---|
 * | 필수 env | `SAP_RFC_ODATA_SERVICE_URL` | `SAP_RFC_ZRFC_BASE_URL` |
 * | 토큰 취득 대상 | `{service}/$metadata` (Accept: xml) | `{base}/dispatch` (Accept: json) |
 * | 인자 전달 | URL 질의 인자(OData v2 리터럴) | **JSON 본문** |
 * | 응답 봉투 | `{d:{…}}` · `EV_SUBRC`/`EV_MESSAGE`/`EV_RESULT` | **봉투 없음** · `subrc`/`message`/`result` |
 * | ECC DDIC 브리지 | 있음 | 없음(FM이 OData로만 노출됨) |
 *
 * 필요한 env (활성 프로파일의 `sap.env`):
 *   SAP_RFC_ZRFC_BASE_URL     — 예: https://host:44300/sap/bc/rest/zmcp_rfc
 *   SAP_RFC_ZRFC_CSRF_TTL_SEC — 토큰 캐시 수명(초). 기본 600, 하한 60
 * 자격증명·클라이언트·타임아웃·TLS 방침은 `ConnectionConfig`가 준다. 구는 이
 * 셋을 `process.env`에서 직접 읽는다(`zrfcProxy.ts:65-76` — 접속 계층·인증
 * 브로커를 아예 거치지 않는다).
 *
 * 참조 원본(읽은 시점의 줄번호). ⚠ 아래 `engine/…`는 **전부 구 포크의 경로이고
 * 판7.5(2026-08-22)에서 레포를 떠났다** — 되뜨려면 은퇴 직전 커밋 `2264f89d`를
 * 참조한다. 줄번호를 남겨 두는 이유가 그것이다:
 * - `engine/src/lib/zrfcProxy.ts:1-315`                 — 주 참조. 완성된 구 구현
 * - `engine/abap/zcl_mcp_rfc_http_handler.abap:119-389` — SAP 측이 실제로 답하는 모양
 * - `engine/docs/installation/ZRFC_SETUP.md:17-134`     — 설치 요건과 증상표
 * - `engine/src/lib/rfcBackend.ts:32-48`                — 선택기(구는 `zrfc`를 안 받는다 — 장부 D9)
 * - `engine/src/lib/odataRfc.ts`                        — 형제 통로 비교 기준
 * - `engine/src/lib/clients.ts` · `engine/src/lib/auth/` — 이 통로가 **타지 않는** 경로
 */

import { CookieJar } from '../adt/cookies';
import { HttpTransportError, nodeHttpTransport } from '../adt/http';
import type { HttpResponse, HttpTransport } from '../adt/http';
import type { ConnectionConfig } from '../contracts';
import { RfcError, rfcKindFromStatus, truncateBody } from './errors';
import type {
  DispatchResult,
  RfcChannel,
  TextpoolAction,
  TextpoolParams,
  TextpoolResult,
} from './types';

const BACKEND = 'zrfc' as const;
const DEFAULT_CSRF_TTL_SEC = 600;
const MIN_CSRF_TTL_SEC = 60;
const DISPATCH_FM = 'ZMCP_ADT_DISPATCH';
const TEXTPOOL_FM = 'ZMCP_ADT_TEXTPOOL';

/** SICF 마운트 지점. 진단 문구가 무엇을 켜라고 말할지의 정본이다. */
const SICF_NODE = '/sap/bc/rest/zmcp_rfc';
/** ICF 핸들러 클래스 이름. 토큰이 안 나올 때 지목할 대상. */
const HANDLER_CLASS = 'ZCL_MCP_RFC_HTTP_HANDLER';

/** 핸들러가 노출하는 두 엔드포인트. 토큰 취득도 `/dispatch`를 쓴다. */
type ZrfcEndpoint = 'dispatch' | 'textpool';

export interface ZrfcChannelOptions {
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

function tryParseJson(raw: string, fallback: unknown): unknown {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/**
 * 이 403이 "토큰을 다시 받아라"인가. 헤더가 정본이다.
 * 핸들러는 CSRF 거부에만 `X-CSRF-Token: Required`를 붙인다
 * (`zcl_mcp_rfc_http_handler.abap:384-386`) — deny list 403에는 붙지 않는다.
 */
function isCsrfRefreshSignal(response: HttpResponse): boolean {
  const header = response.headers['x-csrf-token'];
  return header !== undefined && header.trim().toLowerCase() === 'required';
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * zrfc 통로 하나를 만든다.
 *
 * 반환 타입이 `RfcChannel`인 것은 의도다 — `odata`와 달리 ECC DDIC 브리지
 * (`DdicReadChannel`)를 **갖지 않는다.** 브리지 FM은 OData 서비스의
 * FunctionImport로만 노출돼 있어 이 통로에는 닿을 길이 아예 없다
 * (`engine/src/lib/rfcBackend.ts:94-132`도 같은 자리에서 던진다).
 */
export function createZrfcChannel(options: ZrfcChannelOptions): RfcChannel {
  return new ZrfcChannel(options);
}

class ZrfcChannel implements RfcChannel {
  readonly backend = BACKEND;

  private readonly connection: ConnectionConfig;
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly ttlMs: number;
  private readonly authorization: string;

  private session: CsrfSession | null = null;

  constructor(options: ZrfcChannelOptions) {
    this.connection = options.connection;
    this.transport = options.transport ?? nodeHttpTransport;
    this.now = options.now ?? Date.now;
    // 통로를 세우는 시점에 설정을 확정한다(장부 D12) — 첫 호출까지 미루면
    // 실패가 요청 경로에서 터져 "SAP이 거부했다"처럼 보인다. 구는 매 호출마다
    // `required('SAP_RFC_ZRFC_BASE_URL')`을 다시 부른다(`zrfcProxy.ts:105`·`:183`).
    this.baseUrl = this.requireEnv(options.env, 'SAP_RFC_ZRFC_BASE_URL').replace(/\/+$/, '');
    this.ttlMs = readTtlMs(options.env['SAP_RFC_ZRFC_CSRF_TTL_SEC']);
    this.authorization = `Basic ${Buffer.from(
      `${options.connection.username}:${options.connection.password}`,
      'utf8',
    ).toString('base64')}`;
  }

  /**
   * `ZMCP_ADT_DISPATCH` 호출.
   *
   * `params`는 **객체가 아니라 JSON 문자열**로 실린다. ABAP 핸들러가
   * `ls_req-params`를 `IV_PARAMS`에 그대로 넘기므로(`:223-230`), 문자열로 만드는
   * 책임이 이쪽에 있다. 구 주석이 같은 말을 남겼다(`zrfcProxy.ts:254-256`).
   */
  async callDispatch(
    action: string,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<DispatchResult> {
    const raw = await this.postEndpoint('dispatch', {
      action,
      params: JSON.stringify(params ?? {}),
    });
    return this.unwrap(raw, { functionModule: DISPATCH_FM, action, emptyResult: {} });
  }

  /**
   * `ZMCP_ADT_TEXTPOOL` 호출.
   *
   * 본문 필드 이름이 `textpoolJson`인 것은 핸들러가 `/ui2/cl_json`을
   * `pretty_mode-camel_case`로 역직렬화하기 때문이다 — ABAP 쪽 필드는
   * `textpool_json`이다(`:248-268`). 빈 값을 빈 문자열로 채우는 것도 구와 같다.
   */
  async callTextpool(action: TextpoolAction, params: TextpoolParams): Promise<TextpoolResult> {
    const raw = await this.postEndpoint('textpool', {
      action,
      program: params.program,
      language: params.language ?? '',
      textpoolJson: params.textpoolJson ?? '',
    });
    return this.unwrap(raw, { functionModule: TEXTPOOL_FM, action, emptyResult: [] });
  }

  // ------------------------------------------------------------ 내부 구현

  private requireEnv(env: Readonly<Record<string, string>>, key: string): string {
    const value = (env[key] ?? '').trim();
    if (!value) {
      throw new RfcError({
        kind: 'config',
        backend: BACKEND,
        message:
          `${key} is required for SAP_RFC_BACKEND=zrfc but not set in sap.env. ` +
          `Set it to the ICF handler mount point, e.g. ` +
          `https://<host>:<port>${SICF_NODE} (no trailing slash).`,
      });
    }
    return value;
  }

  /** 클라이언트 번호는 질의 인자로 나간다 — 구 `withSapClient`와 같다. */
  private withSapClient(url: string): string {
    const client = this.connection.client;
    if (!client) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}sap-client=${encodeURIComponent(client)}`;
  }

  private endpointUrl(endpoint: ZrfcEndpoint): string {
    return this.withSapClient(`${this.baseUrl}/${endpoint}`);
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
        ...(body === undefined ? {} : { body }),
        // 구는 60초를 하드코딩한다(`zrfcProxy.ts:33`·`:112`·`:189`). 신은
        // 프로파일의 long 타임아웃을 쓴다 — 기본값이 같은 60000ms다(장부 D11).
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
          message: `zrfc RFC 통로 전송 실패 (${method} ${url}): ${error.message}`,
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
    hint = '',
  ): RfcError {
    return new RfcError({
      kind: rfcKindFromStatus(response.status),
      backend: BACKEND,
      status: response.status,
      method,
      url,
      rawBody: truncateBody(response.body),
      message:
        `${what}이(가) HTTP ${response.status}로 응답했다 (${method} ${url}): ` +
        `${truncateBody(response.body)}${hint}`,
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

  /**
   * 토큰 취득. 대상은 `{base}/dispatch`다 — 핸들러의 모든 GET이 동일하게
   * 토큰을 발급하지만(`:131-134`), 존재가 보장된 엔드포인트를 골랐다는 구의
   * 판단을 그대로 승계한다(`zrfcProxy.ts:106-109`).
   *
   * **여기가 SAP 측 오브젝트 부재가 드러나는 자리다.** 증상표
   * (`ZRFC_SETUP.md:127-134`)를 오류 종류로 옮기면:
   *   404 → `not-found`  (SICF 노드가 없거나 비활성)
   *   401 → `auth`       (Basic 로그온 실패)
   *   토큰 헤더 없음 → `protocol` (핸들러 클래스가 비활성)
   * 어느 쪽도 다른 통로로 새지 않는다.
   */
  private async fetchCsrf(): Promise<CsrfSession> {
    const url = this.endpointUrl('dispatch');
    const response = await this.send('GET', url, {
      'X-CSRF-Token': 'Fetch',
      Accept: 'application/json',
    });

    if (!isSuccess(response.status)) {
      throw this.httpFailure(
        'GET',
        url,
        response,
        'CSRF 토큰 취득',
        ` — SICF 노드 ${SICF_NODE}가 활성인지, SAP_RFC_ZRFC_BASE_URL이 그 노드를 가리키는지 확인한다.`,
      );
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
          `핸들러 클래스 ${HANDLER_CLASS}가 설치·활성 상태인지, SICF 노드 ` +
          `${SICF_NODE}가 그 클래스를 핸들러로 달고 활성인지 확인한다.`,
      });
    }

    // 쿠키는 이 통로 안에서만 산다 — 디스크로 나가지 않는다.
    const jar = new CookieJar();
    jar.accept(response.setCookie);

    return { token, cookie: jar.header() ?? '', expiresAt: this.now() + this.ttlMs };
  }

  /**
   * 엔드포인트 하나를 POST 한다. 403 + `x-csrf-token: required`면 토큰을 다시
   * 받아 **한 번만** 되민다 — 되민 뒤에도 거부되면 `csrf` 오류로 끝낸다.
   * (구는 같은 자리에서 자기 자신을 재귀 호출해 상한이 없다 —
   * `zrfcProxy.ts:213-219`. 장부 D10이 odata에 대해 등재한 것과 같은 수리다.)
   */
  private async postEndpoint(
    endpoint: ZrfcEndpoint,
    body: Readonly<Record<string, string>>,
    retried = false,
  ): Promise<unknown> {
    const url = this.endpointUrl(endpoint);
    const session = await this.ensureSession();

    const response = await this.send(
      'POST',
      url,
      {
        'X-CSRF-Token': session.token,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      JSON.stringify(body),
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
      return this.postEndpoint(endpoint, body, true);
    }

    if (!isSuccess(response.status)) {
      throw this.httpFailure(
        'POST',
        url,
        response,
        `zrfc 엔드포인트 /${endpoint}`,
        response.status >= 500
          ? ` — 대리자 함수모듈 ${DISPATCH_FM} / ${TEXTPOOL_FM}이 설치·활성 상태인지 확인한다.`
          : '',
      );
    }

    try {
      return JSON.parse(response.body) as unknown;
    } catch (error) {
      throw new RfcError({
        kind: 'protocol',
        backend: BACKEND,
        status: response.status,
        method: 'POST',
        url,
        rawBody: truncateBody(response.body),
        message: `zrfc 엔드포인트 /${endpoint}이(가) JSON이 아닌 본문으로 답했다 (POST ${url}).`,
        cause: error,
      });
    }
  }

  /**
   * 핸들러가 돌려준 세 출력(`result`·`subrc`·`message`)을 결과 또는 `sap`
   * 오류로 정규화한다.
   *
   * **필드 이름이 소문자다** — odata 통로의 `EV_*`와 다르다. 핸들러가
   * `/ui2/cl_json=>serialize(pretty_name=camel_case)`로 ABAP 구조체
   * `ty_resp {result, subrc, message}`를 내보내기 때문이다(`:207-236`). 그리고
   * **`d` 봉투가 없다** — OData Gateway를 거치지 않으므로 봉투를 씌울 주체가
   * 없다. 봉투를 관대하게 벗기는 코드를 두지 않은 것은 의도다: 그것은 통로가
   * 실제로 무엇을 받았는지 흐리는 조용한 대체다.
   *
   * 던질 때의 문구는 구 엔진 글자 그대로다(`zrfcProxy.ts:264-268`·`:297-301`) —
   * 도구 응답으로 그대로 나가는 계약성 문자열이다(장부 D13의 경계).
   */
  private unwrap(
    raw: unknown,
    context: { functionModule: string; action: string; emptyResult: unknown },
  ): DispatchResult {
    const subrc = Number(field(raw, 'subrc') ?? 0);
    const message = String(field(raw, 'message') ?? '');
    const result = tryParseJson(String(field(raw, 'result') ?? ''), context.emptyResult);

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
}

/**
 * `SAP_RFC_ZRFC_CSRF_TTL_SEC` → 밀리초. 기본 600초, 하한 60초, 숫자가 아니면
 * 기본값 — 구 엔진과 같은 계산이다(`zrfcProxy.ts:58-63`).
 */
function readTtlMs(raw: string | undefined): number {
  const seconds = Number(raw ?? DEFAULT_CSRF_TTL_SEC);
  const resolved = Number.isFinite(seconds) ? seconds : DEFAULT_CSRF_TTL_SEC;
  return Math.max(MIN_CSRF_TTL_SEC, resolved) * 1000;
}
