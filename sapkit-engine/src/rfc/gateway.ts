/**
 * `gateway` 통로 — 원격 **중계 미들웨어**에 HTTPS/JSON으로 보내면, 그 중계기가
 * 자기 호스트의 NW RFC SDK(`node-rfc`)로 기설치 함수모듈 `ZSAPKIT_ADT_DISPATCH` /
 * `ZSAPKIT_ADT_TEXTPOOL`을 부른다.
 *
 *   MCP 클라이언트 ──HTTPS/JSON──▶ RFC 중계기 ──RFC──▶ SAP
 *
 * 개발자 노트북에 NW RFC SDK·MSVC 빌드도구·S-user 내려받기를 두지 않으려는
 * 배치다. 그 짐은 전부 중계기 한 대가 진다.
 *
 * ── 참조 원본 (전부 읽기 전용으로 읽었다) ────────────────────────────────
 *   `engine/src/lib/gatewayRfc.ts`               주 참조 원본 (전량 1-169)
 *   `engine/src/__tests__/lib/gatewayRfc.test.ts` 와이어 계약의 실측 (전량)
 *   `engine/src/lib/rfcBackend.ts:27-77`          통로 선택기·공통 계약
 *   `engine/src/lib/odataRfc.ts`                  비교 기준(같은 계열의 다른 통로)
 *   `engine/src/lib/clients.ts` · `engine/src/lib/auth/`  — **이 통로와 무관함을
 *     실측했다**: 두 곳 어디에도 `gateway` 언급이 0건이고, 구 `gatewayRfc.ts`는
 *     전역 `fetch`만 쓰는 자족 모듈이라 `@babamba2/*` 위임 구현이 없다.
 *
 * ── 중계기 계약 (구 소스 주석 `gatewayRfc.ts:25-29`의 실측) ──────────────
 *   POST /rfc/dispatch   body { action, params }                  → { result, subrc, message }
 *   POST /rfc/textpool   body { action, program, language,
 *                               textpool_json }                   → { result, subrc, message }
 *   GET  /health                                                  → { status: "ok", ... }
 * `/health`는 구 코드가 **부르지 않는다**(주석에만 있다) — 승계할 구현이 없어
 * 여기서도 짓지 않는다. 진단 절차 쪽 용도다
 * (`interactive/core/procedures/troubleshooting.md:212`).
 *
 * ── 필요한 env (활성 프로파일의 `sap.env`) ───────────────────────────────
 *   SAP_RFC_GATEWAY_URL   — **필수**. 예: `https://rfc-gw.company.com:8443`
 *                           (후행 슬래시는 잘라낸다)
 *   SAP_RFC_GATEWAY_TOKEN — 선택. 중계기 ACL용 Bearer 토큰. 있으면 실린다
 *   SAP_RFC_GATEWAY_TLS_VERIFY — **구 엔진이 읽지 않는 죽은 키다.** 레포 전체
 *     grep 실측: `gatewayRfc.ts`의 주석 한 줄(:18)과 오류 문구 한 줄(:98),
 *     그리고 제품 문서뿐이고 **코드가 이 값을 참조하는 자리는 없다**. 구에서
 *     자기서명 중계기가 통했던 것은 이 키 덕이 아니라 TLS 검증이 애초에 꺼져
 *     있었기 때문이다(장부 D4). 신 엔진의 TLS 방침은 접속 축 하나
 *     (`ConnectionConfig.rejectUnauthorized` ← `TLS_REJECT_UNAUTHORIZED`)로
 *     모았으므로 여기서도 읽지 않는다. 대신 **전송이 실패했을 때의 진단이 이
 *     사실을 소리내어 말한다** — 조용히 무시하면 그 자체가 함정이다.
 *
 * SAP 자격증명은 요청마다 `X-SAP-*` 헤더로 중계기에 넘어간다. 중계기가 그 값으로
 * 사용자별 RFC 세션을 열기 때문에 SAP 감사 로그에 실제 개발자가 남는다(공용
 * 서비스 계정이 아니다). 구는 이 넷을 `process.env`에서 읽었지만
 * (`gatewayRfc.ts:63-69`) 신 엔진에서는 같은 값을 `ConnectionConfig`가 소유한다 —
 * **출처만 다르고 와이어는 같다.** 빈 값이면 헤더를 싣지 않는 것도 구와 같다.
 *
 * ── `odata` 통로와 무엇이 다른가 ─────────────────────────────────────────
 * 둘 다 HTTPS/JSON이라 겹쳐 보이지만 **상대가 다르다.** `odata`는 SAP 자신의
 * Gateway(OData v2 서비스 `ZSAPKIT_ADT_SRV`)와 말하고, `gateway`는 **우리가 세운
 * 중계 서버**와 말한다. 그래서:
 *
 *   - **CSRF 악수가 없다.** 중계기는 SAP Gateway가 아니라 우리 서버라 토큰
 *     캐시·403 되밀기·`$metadata` 왕복이 통째로 없다. 요청 1건 = 왕복 1회다.
 *   - **인증 축이 둘로 갈린다.** 중계기에는 Bearer 토큰(선택), SAP에는 `X-SAP-*`
 *     통과 헤더. `odata`처럼 SAP Basic 헤더를 실어 보내지 **않는다**.
 *   - **주소가 고정 경로 2개다.** `sap-client` 질의 인자도, OData v2 문자열
 *     리터럴 인코딩도 없다. 클라이언트 번호는 `X-SAP-Client` 헤더로 간다.
 *   - **전문이 본문이다.** `odata`는 인자를 URL 질의에 싣고 본문 없는 POST를
 *     보내지만, 여기서는 JSON 본문 하나에 다 담는다.
 *   - **결과가 이미 풀려 있다.** `odata`는 `d` 봉투 속 `EV_RESULT`가 JSON
 *     **문자열**이라 한 번 더 파싱해야 하지만, 중계기는 `result`를 값 그대로
 *     준다(구 실측 `gatewayRfc.ts:133`·`:162`). 그래서 "JSON이 아니면 기본값으로
 *     떨어진다"는 갈래가 이 통로에는 없다.
 *   - **ECC DDIC 브리지가 없다.** 그 함수모듈은 OData FunctionImport로만
 *     노출돼 있어 이 통로에는 닿을 길이 자체가 없다(`types.ts`의
 *     `DdicReadChannel` 주석 · `engine/src/lib/rfcBackend.ts:94-132`).
 *     그래서 이 파일은 `RfcChannel`만 구현한다.
 *
 * ── 구와 일부러 다르게 둔 것 (전부 이미 등재된 항목) ─────────────────────
 *   D11 타임아웃 — 구는 60초 하드코딩(`gatewayRfc.ts:35`). 신은
 *        `ConnectionConfig.timeouts.long`. 기본값이 60000ms로 같아 설정을 안
 *        건드리면 동작이 같다.
 *   D12 필수 설정 확인 시점 — 구는 요청마다 `required()`를 부른다
 *        (`gatewayRfc.ts:75` — 첫 호출에서야 터진다). 신은 통로를 세울 때
 *        확인해 `config` 오류로 즉시 알린다.
 *   D13 진단 문구 — 엔진이 스스로 지어내는 산문은 이 레포의 결로 새로 썼다.
 *        **단, 도구 응답으로 그대로 나가는 계약성 문자열은 글자 그대로 보존한다**:
 *        `ZSAPKIT_ADT_DISPATCH error (action=…, subrc=…): …`
 *        (`gatewayRfc.ts:136`·`:166`).
 *    D4 TLS — 접속별 `rejectUnauthorized`. 위 `_TLS_VERIFY` 항목 참조.
 */

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

const BACKEND = 'gateway' as const;
const DISPATCH_FM = 'ZSAPKIT_ADT_DISPATCH';
const TEXTPOOL_FM = 'ZSAPKIT_ADT_TEXTPOOL';

/** 중계기의 고정 경로 2개(`gatewayRfc.ts:130`·`:154`). */
const DISPATCH_PATH = '/rfc/dispatch';
const TEXTPOOL_PATH = '/rfc/textpool';

export interface GatewayChannelOptions {
  readonly connection: ConnectionConfig;
  /** `SAP_RFC_*` 키들. `mergeRfcEnv`가 만든 것을 그대로 받는다. */
  readonly env: Readonly<Record<string, string>>;
  /** 전송 계층 교체점(시험·기록/재생용). 기본은 내장 http/https. */
  readonly transport?: HttpTransport;
}

/** 객체가 아닐 수 있는 값에서 필드 하나를 안전하게 꺼낸다. */
function field(node: unknown, name: string): unknown {
  if (node !== null && typeof node === 'object') {
    return (node as Record<string, unknown>)[name];
  }
  return undefined;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * gateway 통로 하나를 만든다.
 *
 * `odata`와 달리 반환 타입이 `RfcChannel` 그대로다 — 이 통로는 ECC DDIC
 * 브리지에 닿지 않는다(머리주석 참조).
 */
export function createGatewayChannel(options: GatewayChannelOptions): RfcChannel {
  return new GatewayChannel(options);
}

class GatewayChannel implements RfcChannel {
  readonly backend = BACKEND;

  private readonly connection: ConnectionConfig;
  private readonly transport: HttpTransport;
  private readonly baseUrl: string;
  /** 중계기 ACL용 Bearer 토큰. 비어 있으면 `Authorization`을 아예 싣지 않는다. */
  private readonly token: string;

  constructor(options: GatewayChannelOptions) {
    this.connection = options.connection;
    this.transport = options.transport ?? nodeHttpTransport;
    // 통로를 세우는 시점에 설정을 확정한다(D12) — 첫 호출까지 미루면 실패가 요청
    // 경로에서 터져 "중계기가/SAP이 거부했다"처럼 보인다.
    this.baseUrl = this.requireEnv(options.env, 'SAP_RFC_GATEWAY_URL').replace(/\/+$/, '');
    this.token = (options.env.SAP_RFC_GATEWAY_TOKEN ?? '').trim();
  }

  async callDispatch(
    action: string,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<DispatchResult> {
    // 본문 키 순서는 구 엔진 그대로다(`gatewayRfc.ts:130`) — 중계기가 JSON을
    // 파싱하므로 순서는 의미가 없지만, 와이어 바이트를 대조 가능하게 둔다.
    const body = await this.postJson(DISPATCH_PATH, { action, params });
    return this.unwrap(body, {
      functionModule: DISPATCH_FM,
      action,
      emptyResult: {},
    });
  }

  async callTextpool(action: TextpoolAction, params: TextpoolParams): Promise<TextpoolResult> {
    const body = await this.postJson(TEXTPOOL_PATH, {
      action,
      program: params.program,
      language: params.language ?? '',
      textpool_json: params.textpoolJson ?? '',
    });
    return this.unwrap(body, {
      functionModule: TEXTPOOL_FM,
      action,
      emptyResult: [],
    });
  }

  // ------------------------------------------------------------ 내부 구현

  private requireEnv(env: Readonly<Record<string, string>>, key: string): string {
    const value = (env[key] ?? '').trim();
    if (!value) {
      throw new RfcError({
        kind: 'config',
        backend: BACKEND,
        message:
          `${key} is required for SAP_RFC_BACKEND=gateway but not set in sap.env. ` +
          `Set it to the RFC gateway middleware root, e.g. ` +
          `https://rfc-gw.<company>.com:8443 (no trailing slash, no path).`,
      });
    }
    return value;
  }

  /**
   * 중계기에 실을 헤더.
   *
   * 자격증명 통과(`X-SAP-*`)는 구 엔진과 같은 이름·같은 조건이다
   * (`gatewayRfc.ts:51-72`) — **값이 비어 있으면 헤더를 싣지 않는다.** 구는
   * `process.env`를, 신은 `ConnectionConfig`를 읽을 뿐이다.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const { username, password, client, language } = this.connection;
    if (username) headers['X-SAP-User'] = username;
    if (password) headers['X-SAP-Password'] = password;
    if (client) headers['X-SAP-Client'] = client;
    if (language) headers['X-SAP-Language'] = language;

    return headers;
  }

  /**
   * 중계기에 JSON 하나를 POST 하고 파싱된 본문을 돌려준다.
   *
   * 왕복이 한 번뿐이라 `odata`의 CSRF 재시도 같은 갈래가 없다 — 실패는 곧
   * 실패다. 조용한 대체는 만들지 않는다.
   */
  private async postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const payload = JSON.stringify(body);

    let response: HttpResponse;
    try {
      response = await this.transport({
        method: 'POST',
        url,
        headers: this.buildHeaders(),
        body: payload,
        // D11 — 구는 60초 하드코딩. 여기서는 접속 설정의 long이 실제로 먹는다.
        timeoutMs: this.connection.timeouts.long,
        rejectUnauthorized: this.connection.rejectUnauthorized,
      });
    } catch (error) {
      if (error instanceof HttpTransportError) {
        throw new RfcError({
          kind: error.reason,
          backend: BACKEND,
          method: 'POST',
          url,
          message:
            `gateway RFC 통로 전송 실패 (POST ${url}): ${error.message}. ` +
            `SAP_RFC_GATEWAY_URL이 닿는 주소인지, 중계기의 TLS 인증서가 신뢰되는지 확인한다. ` +
            `자기서명 인증서라면 프로파일에 TLS_REJECT_UNAUTHORIZED=0을 넣는다 — ` +
            `SAP_RFC_GATEWAY_TLS_VERIFY는 구 엔진에서도 읽히지 않는 죽은 키다.`,
          cause: error,
        });
      }
      throw error;
    }

    if (!isSuccess(response.status)) {
      throw new RfcError({
        kind: rfcKindFromStatus(response.status),
        backend: BACKEND,
        status: response.status,
        method: 'POST',
        url,
        rawBody: truncateBody(response.body),
        message: `RFC 중계기가 HTTP ${response.status}로 응답했다 (POST ${url}): ${truncateBody(
          response.body,
        )}`,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body) as unknown;
    } catch (error) {
      throw new RfcError({
        kind: 'protocol',
        backend: BACKEND,
        status: response.status,
        method: 'POST',
        url,
        rawBody: truncateBody(response.body),
        message: `RFC 중계기가 JSON이 아닌 본문으로 답했다 (POST ${url}).`,
        cause: error,
      });
    }

    // 구는 `body.subrc`를 곧바로 읽어 본문이 `null`이면 TypeError로 터진다.
    // 여기서는 같은 실패를 `protocol`로 이름 붙여 내보낸다 — 성공으로 접히지
    // 않게 하는 것이 요점이다(`null`을 그냥 통과시키면 subrc 0인 빈 성공이 된다).
    if (parsed === null || typeof parsed !== 'object') {
      throw new RfcError({
        kind: 'protocol',
        backend: BACKEND,
        status: response.status,
        method: 'POST',
        url,
        rawBody: truncateBody(response.body),
        message: `RFC 중계기의 응답이 JSON 객체가 아니다 (POST ${url}).`,
      });
    }

    return parsed;
  }

  /**
   * 중계기 응답의 세 필드(`result`·`subrc`·`message`)를 결과 또는 `sap` 오류로
   * 정규화한다.
   *
   * `odata`와 갈리는 지점: **`result`가 이미 풀린 값이다.** 중계기가 SDK 반환을
   * 그대로 JSON에 실어 주므로 한 번 더 파싱하지 않는다(`gatewayRfc.ts:133`).
   * 없을 때의 기본값만 호출별로 다르다 — 디스패치는 `{}`, 텍스트풀은 `[]`.
   *
   * 던질 때의 문구는 구 엔진 글자 그대로다 — 도구 응답으로 나가는 계약성
   * 문자열이다(장부 D13의 경계).
   */
  private unwrap(
    body: unknown,
    context: { functionModule: string; action: string; emptyResult: unknown },
  ): DispatchResult {
    const subrc = Number(field(body, 'subrc') ?? 0);
    const message = String(field(body, 'message') ?? '');
    const result = field(body, 'result') ?? context.emptyResult;

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
