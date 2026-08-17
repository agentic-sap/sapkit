/**
 * 인증 계층 시험의 공용 재료.
 *
 * **실 네트워크는 0이다** — UAA 왕복은 전송 이음매(`HttpTransport`)를 목으로
 * 갈아 끼워 돌고, 콜백 서버만 loopback에서 실제로 뜬다(그것이 시험 대상이다).
 *
 * 여기 쓰이는 호스트·clientid·clientsecret·토큰은 전부 명백한 가짜다.
 */

import type { UaaCredentials } from '../../contracts';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../adt/http';

/** 명백히 가짜인 UAA 재료. */
export function fakeUaa(overrides: Partial<UaaCredentials> = {}): UaaCredentials {
  return {
    url: 'https://uaa.example.test',
    clientId: 'sb-not-a-real-client',
    clientSecret: 'not-a-real-secret',
    ...overrides,
  };
}

/** 서명하지 않은 세 조각짜리 JWT. 인증 계층은 서명을 보지 않는다. */
export function fakeJwt(payload: Record<string, unknown>, signature = 'not-a-real-signature'): string {
  const b64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.${signature}`;
}

export interface MockTransport {
  readonly calls: HttpRequest[];
  readonly transport: HttpTransport;
  /** `index`번째 요청. 없으면 던진다. */
  nth(index: number): HttpRequest;
  /** `index`번째 요청 본문을 form으로 읽는다. */
  form(index: number): URLSearchParams;
}

/** 응답을 순서대로 돌려주는 목. 준비한 것보다 많이 부르면 던진다. */
export function mockTransport(responses: readonly (Partial<HttpResponse> | Error)[]): MockTransport {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = async (request) => {
    const next = responses[calls.length];
    calls.push(request);
    if (next === undefined) {
      throw new Error(`목에 준비되지 않은 ${calls.length}번째 요청이 나갔다: ${request.url}`);
    }
    if (next instanceof Error) throw next;
    return { status: 200, statusText: 'OK', headers: {}, setCookie: [], body: '', ...next };
  };
  return {
    calls,
    transport,
    nth(index: number): HttpRequest {
      const found = calls[index];
      if (!found) throw new Error(`요청 #${index}가 없다 (기록 ${calls.length}건)`);
      return found;
    },
    form(index: number): URLSearchParams {
      return new URLSearchParams(this.nth(index).body ?? '');
    },
  };
}

/** 토큰 종단점의 성공 응답 본문. */
export function tokenBody(
  fields: Record<string, unknown> = {},
): { readonly status: number; readonly body: string } {
  return {
    status: 200,
    body: JSON.stringify({
      access_token: 'not-a-real-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      ...fields,
    }),
  };
}
