/**
 * `soap` 통로 — ICF 노드 `/sap/bc/soap/rfc`가 RFC 함수모듈을 직접 노출하는
 * SAP 내장 경로. 기설치 대리자 `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL`에
 * SOAP 봉투 하나로 닿는다(SAP 측 무접촉 — 결정 D-079 ⑥).
 *
 * **주 참조 원본**: `engine/src/lib/soapRfc.ts` 전량.
 * - `:12-14`   경로·네임스페이스 상수
 * - `:19-39`   봉투 조립
 * - `:44-51`   XML 이스케이프 5종
 * - `:56-89`   응답 해석(Body 없음 · Fault · `FM.Response` 폴백)
 * - `:127-152` 전송 — `POST /sap/bc/soap/rfc`, `'long'` 타임아웃, 헤더 2종
 * - `:162-190` `callDispatch`
 * - `:209-243` `callTextpool`
 *
 * 통로 선택 계약과 이 통로의 위치는 `engine/src/lib/rfcBackend.ts:14-32`.
 * 2026-04-22 이전에는 이것이 **기본 통로**였고, 강화된 Gateway 설치가
 * `/sap/bc/soap/rfc` ICF 노드를 닫는 일이 늘어 기본값이 `odata`로 옮겨 갔다
 * (`rfcBackend.ts:8-12`). 그래서 이 통로가 실패하는 대표적 이유는
 * "ICF 노드가 비활성"과 "`S_RFC` 권한 없음" 둘이며, 둘 다 SAP이 응답을 주므로
 * 조용한 대체가 아니라 오류로 드러나야 한다.
 *
 * ## odata 통로와 갈리는 지점 — 전송을 스스로 짜지 않는다
 *
 * 구 `odataRfc.ts`는 전역 `fetch`로 자기 요청을 직접 조립하지만, 구
 * `soapRfc.ts`는 `makeAdtRequestWithTimeout`(`engine/src/lib/utils.ts:902-921`)을
 * 거쳐 **ADT 접속 계층에 얹혀 있다**. 그래서 인증·클라이언트 헤더·쿠키·CSRF가
 * 전부 그 계층의 것이다(`engine/node_modules/@babamba2/mcp-abap-connection/dist/
 * connection/AbstractAbapConnection.js:139-195` — Accept 기본값 `:162-165`,
 * POST 전 CSRF 사전 취득 `:146-159`, 인증 헤더 `:181`, `x-csrf-token` `:182-187`,
 * `Cookie` 마지막 `:188-192`). 신 엔진에서 그 계층의 대응물은 `AdtClient`이므로
 * 이 통로는 **`AdtClient`를 쓴다**. 직접 http를 부르면 구가 붙이던 헤더 한 벌이
 * 조용히 빠진다.
 *
 * 필요한 env: **없다.** `SAP_RFC_*` 키를 한 개도 읽지 않는다(구 소스 grep 실측 —
 * `soapRfc.ts`에 `process.env` 참조가 0건). 접속 정보는 전부
 * `ConnectionConfig`에서 온다.
 *
 * ## 타임아웃 (장부 D11)
 *
 * 구 soap은 `'long'` 선택자를 넘겼고 그것은
 * `@babamba2/mcp-abap-connection/dist/utils/timeouts.js:5-13`에서
 * `SAP_TIMEOUT_LONG`(기본 60000ms)로 풀린다 — **이 통로에서는 구도 그 노브를
 * 실제로 존중했다**(하드코딩 60초는 구 `odataRfc.ts:51`의 이야기다). 신은
 * `ConnectionConfig.timeouts.long`을 쓰고, 프로파일 계층이 같은 키·같은
 * 기본값으로 그 값을 채운다(`src/profile/resolve.ts:38`·`:281`). 즉 이 통로에
 * 한해 D11은 **동작 변화 없는 승계**다.
 *
 * ## 필수 설정 확인 시점 (장부 D12)
 *
 * 구는 접속 객체를 만들 때 자격증명을 확인하고
 * (`.../connection/BaseAbapConnection.js:53-63`), 그 확인이 실패하면 RFC와
 * 무관한 자리에서 터진다. 신은 **통로를 세우는 시점에** 이 통로가 실제로 쓰는
 * 세 값(호스트·계정·비밀번호)을 확인해 `config` 오류로 즉시 알린다. 첫
 * 디스패치까지 미루지 않는다.
 *
 * `SAP_CLIENT`는 **요구하지 않는다.** 구 접속 계층은 Basic 인증에 그것을
 * 필수로 걸었지만(`BaseAbapConnection.js:60-62`), 그 판정은 "프로파일이 없다"를
 * "SAP_CLIENT가 없다"로 잘못 말하는 자리로 이미 장부 D18에 기록돼 있고, 신
 * 프로파일 계층은 클라이언트 없는 접속을 정상으로 만든다
 * (`src/profile/resolve.ts:266`·`:272`).
 */

import { XMLParser } from 'fast-xml-parser';

import { AdtClient } from '../adt/client';
import type { AdtResponse } from '../adt/client';
import { AdtError } from '../adt/errors';
import type { AdtErrorKind } from '../adt/errors';
import type { HttpTransport } from '../adt/http';
import type { ConnectionConfig } from '../contracts';
import { RfcError, truncateBody } from './errors';
import type { RfcErrorKind } from './errors';
import type {
  DispatchResult,
  RfcChannel,
  TextpoolAction,
  TextpoolParams,
  TextpoolResult,
} from './types';

const BACKEND = 'soap' as const;

/** ICF 노드 경로 — `engine/src/lib/soapRfc.ts:12`. */
const SOAP_RFC_PATH = '/sap/bc/soap/rfc';
/** SOAP 1.1 봉투 네임스페이스 — 같은 파일 `:13`. */
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
/** SAP RFC 함수 네임스페이스. `SOAPAction` 헤더 값으로도 그대로 나간다 — `:14`·`:143`. */
const URN_NS = 'urn:sap-com:document:sap:rfc:functions';
/** `:142` — 구가 보내는 Content-Type 글자 그대로. */
const SOAP_CONTENT_TYPE = 'text/xml; charset=utf-8';

const DISPATCH_FM = 'ZMCP_ADT_DISPATCH';
const TEXTPOOL_FM = 'ZMCP_ADT_TEXTPOOL';

/**
 * ADT 계층의 오류 종류를 RFC 축으로 옮긴다.
 *
 * 한 자리만 대응물이 없다: `lock-conflict`(409/423). `/sap/bc/soap/rfc`는
 * 오브젝트를 잠그지 않으므로 RFC 통로에 그 개념이 없고, "그 밖의 HTTP 실패"로
 * 접는다. 나머지 아홉은 이름까지 같다.
 */
const RFC_KIND_BY_ADT_KIND: Readonly<Record<AdtErrorKind, RfcErrorKind>> = {
  timeout: 'timeout',
  network: 'network',
  auth: 'auth',
  forbidden: 'forbidden',
  csrf: 'csrf',
  'not-found': 'not-found',
  server: 'server',
  protocol: 'protocol',
  http: 'http',
  'lock-conflict': 'http',
};

/**
 * 응답 파서 설정은 구와 **같은 세 옵션**이다(`engine/src/lib/soapRfc.ts:60-64`).
 * `removeNSPrefix`가 있어야 `soap-env:Envelope`·`urn:FM.Response`가 접두사 없는
 * 이름으로 잡힌다.
 */
const soapParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

export interface SoapChannelOptions {
  readonly connection: ConnectionConfig;
  /**
   * `SAP_RFC_*` 키들. **이 통로는 한 개도 읽지 않는다** — 받기만 하는 것은
   * 분배기가 통로마다 같은 옵션 덩이를 넘기기 때문이다.
   */
  readonly env?: Readonly<Record<string, string>>;
  /** 전송 계층 교체점(시험·기록/재생용). 기본은 내장 http/https. */
  readonly transport?: HttpTransport;
  /** odata 통로의 토큰 캐시용 시계. 이 통로는 캐시를 두지 않아 쓰지 않는다. */
  readonly now?: () => number;
}

/** 객체가 아닐 수 있는 값에서 필드 하나를 안전하게 꺼낸다. */
function field(node: unknown, name: string): unknown {
  if (node !== null && typeof node === 'object') {
    return (node as Record<string, unknown>)[name];
  }
  return undefined;
}

/**
 * XML 노드에서 사람이 읽을 텍스트를 꺼낸다. 값이 객체면 `#text`만 본다 —
 * 구는 여기서 객체를 그대로 문자열 보간해 `[object Object]`를 내보냈다
 * (`soapRfc.ts:75-77`). 그 자리는 엔진 자체 저작 진단 문구라 장부 D13의
 * 범위 안이다.
 */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  const text = field(node, '#text');
  if (typeof text === 'string') return text;
  if (typeof text === 'number' || typeof text === 'boolean') return String(text);
  return '';
}

/** 대문자 이름을 먼저 보고 없으면 소문자 — 구와 같은 순서(`soapRfc.ts:172-174`). */
function outputOf(raw: unknown, upper: string, lower: string): unknown {
  const value = field(raw, upper);
  if (value !== undefined && value !== null) return value;
  return field(raw, lower);
}

/**
 * 값 하나의 XML 특수문자를 막는다. 다섯 종·같은 순서 — `soapRfc.ts:44-51`.
 * `&`를 먼저 바꾸지 않으면 뒤에서 만든 엔티티가 두 번 이스케이프된다.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 함수모듈 호출 하나의 SOAP 봉투. 들여쓰기·줄바꿈까지 구와 같은 바이트다
 * (`soapRfc.ts:19-39`) — 와이어에 그대로 나가는 전문이라 재생 대조의 대상이다.
 */
export function buildSoapEnvelope(
  fmName: string,
  params: Readonly<Record<string, string>>,
): string {
  const paramXml = Object.entries(params)
    .map(([key, value]) => `      <${key}>${escapeXml(value)}</${key}>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="${SOAP_NS}" xmlns:urn="${URN_NS}">
  <soap-env:Header/>
  <soap-env:Body>
    <urn:${fmName}>
${paramXml}
    </urn:${fmName}>
  </soap-env:Body>
</soap-env:Envelope>`;
}

/**
 * soap 통로 하나를 만든다.
 *
 * 반환 타입이 `RfcChannel`인 것은 의도다 — ECC DDIC 브리지
 * (`DdicReadChannel`)는 OData FunctionImport로만 노출돼 있어 이 통로에는 닿을
 * 길이 없다(`engine/src/lib/rfcBackend.ts:94-132`). 표면에 얹으면 "던지기만
 * 하는 메서드"가 되고, 그건 표면이 거짓말을 하는 것이다.
 */
export function createSoapChannel(options: SoapChannelOptions): RfcChannel {
  return new SoapChannel(options);
}

class SoapChannel implements RfcChannel {
  readonly backend = BACKEND;

  private readonly client: AdtClient;

  constructor(options: SoapChannelOptions) {
    // 통로를 세우는 시점에 설정을 확정한다(장부 D12). 첫 호출까지 미루면
    // 실패가 요청 경로에서 터져 "SAP이 거부했다"처럼 보인다.
    const connection = requireUsableConnection(options.connection);
    this.client = new AdtClient(
      connection,
      options.transport ? { transport: options.transport } : {},
    );
  }

  /** `engine/src/lib/soapRfc.ts:162-190`와 같은 인자 2종·같은 순서. */
  async callDispatch(
    action: string,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<DispatchResult> {
    const raw = await this.post(DISPATCH_FM, {
      IV_ACTION: action,
      IV_PARAMS: JSON.stringify(params ?? {}),
    });
    return unwrap(raw, { functionModule: DISPATCH_FM, action, absentResult: '{}' });
  }

  /** `engine/src/lib/soapRfc.ts:209-243`와 같은 인자 4종·같은 순서. */
  async callTextpool(action: TextpoolAction, params: TextpoolParams): Promise<TextpoolResult> {
    const raw = await this.post(TEXTPOOL_FM, {
      IV_ACTION: action,
      IV_PROGRAM: params.program,
      IV_LANGUAGE: params.language ?? '',
      IV_TEXTPOOL_JSON: params.textpoolJson ?? '',
    });
    return unwrap(raw, { functionModule: TEXTPOOL_FM, action, absentResult: '[]' });
  }

  // ------------------------------------------------------------ 내부 구현

  /**
   * 봉투 하나를 `/sap/bc/soap/rfc`에 POST 하고 응답 본문을 푼다.
   *
   * 인증·클라이언트 헤더·쿠키·CSRF는 `AdtClient`가 붙인다 — 구가
   * `makeAdtRequestWithTimeout`에 얹혀 얻던 것과 같은 한 벌이다. 여기서 명시하는
   * 것은 구가 `soapRfc.ts:134-145`에서 명시하던 넷뿐이다: 경로 · `'long'`
   * 타임아웃 · `Content-Type` · `SOAPAction`.
   */
  private async post(fmName: string, params: Readonly<Record<string, string>>): Promise<unknown> {
    const envelope = buildSoapEnvelope(fmName, params);

    let response: AdtResponse;
    try {
      response = await this.client.request({
        method: 'POST',
        path: SOAP_RFC_PATH,
        body: envelope,
        contentType: SOAP_CONTENT_TYPE,
        headers: { SOAPAction: URN_NS },
        timeout: 'long',
      });
    } catch (error) {
      throw toRfcError(error, fmName);
    }

    return parseSoapResponse(response, fmName);
  }
}

/**
 * ADT 계층이 올린 실패를 RFC 오류로 옮긴다. `AdtError`가 아니면 그대로 흘려보낸다 —
 * 알 수 없는 예외를 RFC 오류로 감싸면 원인이 지워진다.
 */
function toRfcError(error: unknown, fmName: string): unknown {
  if (!(error instanceof AdtError)) return error;

  const kind = RFC_KIND_BY_ADT_KIND[error.kind];
  const where = `POST ${error.url ?? SOAP_RFC_PATH}`;
  const message =
    error.status === undefined
      ? `soap RFC 통로 전송 실패 (${where}): ${error.message}`
      : `${fmName} 호출이 HTTP ${error.status}로 응답했다 (${where}): ${truncateBody(
          error.rawBody ?? '',
        )}`;

  return new RfcError({
    kind,
    backend: BACKEND,
    status: error.status,
    method: 'POST',
    url: error.url,
    rawBody: error.rawBody === undefined ? undefined : truncateBody(error.rawBody),
    functionModule: fmName,
    message,
    cause: error,
  });
}

/**
 * SOAP 응답 본문에서 함수모듈의 출력 노드를 꺼낸다 — `soapRfc.ts:56-89`.
 *
 * 세 갈래가 그대로다:
 *   1. `Envelope/Body`가 없으면 응답이 SOAP이 아니다.
 *   2. `Body/Fault`가 있으면 SAP이 오류로 답한 것이다. **이 분기는 2xx 응답에서만
 *      산다** — 구는 axios 기본 `validateStatus`(2xx만 통과)를 그대로 쓰므로
 *      (`.../connection/AbstractAbapConnection.js:551-564`에 override 없음),
 *      SOAP 1.1 관례대로 HTTP 500에 실려 온 Fault는 파서에 닿기 전에 HTTP 실패로
 *      끝난다. 신도 같다(`AdtClient`가 4xx/5xx를 먼저 던진다) — 일부러 맞춘 것이다.
 *   3. `<FM>.Response` 래퍼가 있으면 그것을, 없으면 `Body`를 그대로 쓴다.
 *      래퍼 이름이 판마다 달라서 구가 둔 폴백이며(`:83-86`), 여기서도 유지한다 —
 *      **조용한 대체가 아니라 같은 응답의 두 표기**다.
 */
function parseSoapResponse(response: AdtResponse, fmName: string): unknown {
  let parsed: unknown;
  try {
    parsed = soapParser.parse(response.body) as unknown;
  } catch (error) {
    throw protocolError(response, `${fmName} 응답을 XML로 해석하지 못했다`, error);
  }

  const body = field(field(parsed, 'Envelope'), 'Body');
  if (body === undefined || body === null) {
    throw protocolError(
      response,
      `${fmName} 응답에 SOAP Envelope/Body가 없다 — ` +
        `/sap/bc/soap/rfc ICF 노드가 켜져 있는지(SICF) 확인한다`,
    );
  }

  const fault = field(body, 'Fault');
  if (fault !== undefined && fault !== null) {
    // 문구는 구 글자 그대로다(`soapRfc.ts:75-77`) — SAP이 준 faultstring이
    // 그대로 도구 응답에 실려 나가는 계약성 문자열이다.
    const faultString =
      textOf(field(fault, 'faultstring')) ||
      textOf(field(fault, 'detail')) ||
      'Unknown SOAP fault';
    throw new RfcError({
      kind: 'sap',
      backend: BACKEND,
      status: response.status,
      method: 'POST',
      functionModule: fmName,
      sapMessage: faultString,
      rawBody: truncateBody(response.body),
      message: `SOAP Fault: ${faultString}`,
    });
  }

  // 구와 같은 falsy 판정이다 — 래퍼가 비어 있어도 Body로 되돌아간다(`:83`).
  const wrapped = field(body, `${fmName}.Response`);
  return wrapped ? wrapped : body;
}

function protocolError(response: AdtResponse, what: string, cause?: unknown): RfcError {
  return new RfcError({
    kind: 'protocol',
    backend: BACKEND,
    status: response.status,
    method: 'POST',
    rawBody: truncateBody(response.body),
    message: `${what} (HTTP ${response.status}): ${truncateBody(response.body)}`,
    cause,
  });
}

/**
 * 대리자 함수모듈의 세 출력을 결과 또는 `sap` 오류로 정규화한다 —
 * `soapRfc.ts:172-189`(dispatch)·`:225-242`(textpool).
 *
 * **`EV_RESULT`가 JSON이 아닐 때의 낙하지점이 odata 통로와 다르다.** 구 soap은
 * 원문 문자열을 그대로 돌려주고(`:176-181`), 구 odata는 빈 값으로 떨어뜨린다
 * (`engine/src/lib/odataRfc.ts:311`). 각 통로가 구 자기 자신과 같게 두는 쪽을
 * 골랐다 — 재생 대조의 기준이 통로별 구 응답이기 때문이다. 값이 **없을** 때의
 * 기본값(`{}` / `[]`)은 둘이 같다.
 *
 * 던질 때의 문구는 구 글자 그대로다. 이 문자열이 도구 응답으로 나간다.
 */
function unwrap(
  raw: unknown,
  context: { functionModule: string; action: string; absentResult: string },
): DispatchResult {
  const subrc = Number(outputOf(raw, 'EV_SUBRC', 'ev_subrc') ?? 0);
  const message = String(outputOf(raw, 'EV_MESSAGE', 'ev_message') ?? '');
  const resultRaw = String(outputOf(raw, 'EV_RESULT', 'ev_result') ?? context.absentResult);

  let result: unknown;
  try {
    result = JSON.parse(resultRaw) as unknown;
  } catch {
    result = resultRaw;
  }

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
 * 이 통로가 실제로 쓰는 접속 값 셋을 통로 생성 시점에 확인한다(장부 D12).
 *
 * 확인 대상이 `SAP_RFC_*` 키가 아니라 접속 필드인 것은 이 통로가 자기 env를
 * 하나도 갖지 않기 때문이다 — 대신 ADT 접속을 그대로 재사용한다
 * (`src/rfc/README.md` §3의 표, `soapRfc.ts:127-152`).
 */
function requireUsableConnection(connection: ConnectionConfig): ConnectionConfig {
  const baseUrl = (connection.baseUrl ?? '').trim();
  requirePresent(baseUrl, 'SAP_URL');
  requirePresent(connection.username, 'SAP_USERNAME');
  requirePresent(connection.password, 'SAP_PASSWORD');

  let origin: URL;
  try {
    origin = new URL(baseUrl);
  } catch {
    throw configError(
      `SAP_URL must be an absolute http(s) origin for SAP_RFC_BACKEND=soap ` +
        `(got '${baseUrl}'). The soap channel posts the RFC envelope to ` +
        `<origin>${SOAP_RFC_PATH}.`,
    );
  }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
    throw configError(
      `SAP_URL must use http or https for SAP_RFC_BACKEND=soap ` +
        `(got '${origin.protocol}//' in '${baseUrl}').`,
    );
  }
  return connection;
}

function requirePresent(value: string | undefined, key: string): void {
  if ((value ?? '').trim()) return;
  throw configError(
    `${key} is required for SAP_RFC_BACKEND=soap but the active profile did not resolve it. ` +
      `The soap channel reuses the ADT connection (host, credentials, optional client) and needs ` +
      `no SAP_RFC_* key of its own — fix the active profile's sap.env instead.`,
  );
}

function configError(message: string): RfcError {
  return new RfcError({ kind: 'config', backend: BACKEND, message });
}
