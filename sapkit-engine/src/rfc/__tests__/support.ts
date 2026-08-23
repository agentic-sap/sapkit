/**
 * RFC 분배층 시험 보조물.
 *
 * 자식 프로세스를 띄우지 않는다 — 이 머신에서 jest가 자식 프로세스 수거에서
 * 블록된 실측 기록이 있다. 요청 조립은 **전송 주입**으로 보고, 실제 와이어는
 * `node:http`(포트 0) in-process 서버로 한 건만 확인한다.
 *
 * 여기 쓰이는 호스트·계정·비밀번호는 전부 명백한 가짜다.
 */

import type { HttpRequest, HttpResponse, HttpTransport } from '../../adt/http';
import type { ConnectionConfig } from '../../contracts';

/** 명백히 가짜인 OData 서비스 URL. */
export const SERVICE_URL = 'https://sap.example.test:44300/sap/opu/odata/sap/ZSAPKIT_ADT_SRV';

export function fakeConnection(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    baseUrl: 'https://sap.example.test:44300',
    username: 'TESTUSER',
    password: 'not-a-real-secret',
    client: '100',
    language: 'EN',
    rejectUnauthorized: false,
    timeouts: { default: 3000, csrf: 3000, long: 6000 },
    ...overrides,
  };
}

/** `TESTUSER:not-a-real-secret`의 Basic 헤더 값. */
export const EXPECTED_AUTHORIZATION = `Basic ${Buffer.from(
  'TESTUSER:not-a-real-secret',
  'utf8',
).toString('base64')}`;

export function rfcEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return { SAP_RFC_ODATA_SERVICE_URL: SERVICE_URL, ...overrides };
}

/** 토큰을 발급하고 세션 쿠키를 심는 표준 `$metadata` 응답. */
export function csrfIssued(token = 'tok-1'): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'x-csrf-token': token },
    setCookie: [
      'SAP_SESSIONID_X01_100=sess-1; path=/; HttpOnly; Secure',
      'sap-usercontext=sap-client=100; path=/',
    ],
    body: '<edmx:Edmx/>',
  };
}

/** 성공한 FunctionImport 응답(Form B — `d` 직결). */
export function functionImportOk(fields: Record<string, unknown>): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ d: fields }),
  };
}

export interface ScriptedTransport {
  readonly calls: HttpRequest[];
  readonly transport: HttpTransport;
}

/**
 * 각 요청에 대해 대본의 다음 항목을 돌려준다. `Error`면 던진다(전송 실패 모의).
 * 대본이 바닥나면 마지막 항목을 계속 쓴다 — 재시도 경로를 편하게 쓰기 위함이다.
 */
export function scripted(steps: ReadonlyArray<Partial<HttpResponse> | Error>): ScriptedTransport {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = async (request) => {
    const step = steps[calls.length] ?? steps[steps.length - 1];
    calls.push(request);
    if (step instanceof Error) throw step;
    return {
      status: 200,
      statusText: '',
      headers: {},
      setCookie: [],
      body: '',
      ...(step ?? {}),
    };
  };
  return { calls, transport };
}

/** `calls[index]`를 undefined 없이 꺼낸다. */
export function nth(calls: readonly HttpRequest[], index: number): HttpRequest {
  const found = calls[index];
  if (!found) throw new Error(`요청 #${index}가 없다 (기록된 요청 ${calls.length}건)`);
  return found;
}

/** 헤더를 소문자 이름으로 조회한다(전송에 넘긴 헤더는 원문 대소문자다). */
export function header(request: HttpRequest, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}
