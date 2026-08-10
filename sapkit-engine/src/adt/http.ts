/**
 * ADT 접속 계층의 **전송 이음매**.
 *
 * 왜 내장 `fetch`가 아니라 `node:http`/`node:https`인가 —
 * `ConnectionConfig.rejectUnauthorized`는 **접속마다** 달라야 하는데, 내장
 * fetch(undici)에서 그걸 끄려면 `undici`의 `Agent`를 dispatcher로 넘겨야 하고
 * 그 클래스는 Node 런타임이 공개하지 않는다(`require('undici')` 실패, Node 24
 * 실측). 새 npm 의존성 없이 접속별 TLS 옵션을 지키는 길은 내장 http 모듈뿐이다.
 * 쿠키·CSRF를 직접 다루는 설계 의도에는 오히려 더 맞는다.
 *
 * keep-alive는 쓰지 않는다(`agent: false`) — 요청마다 연결을 닫아 잔류 소켓이
 * 시험 프로세스를 붙잡지 않게 한다.
 */

import * as http from 'node:http';
import * as https from 'node:https';

export interface HttpRequest {
  readonly method: string;
  /** 절대 URL(질의 인자 포함). */
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs: number;
  readonly rejectUnauthorized: boolean;
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  /** 이름은 전부 소문자. 다중 값 헤더는 `, `로 합친다. */
  readonly headers: Readonly<Record<string, string>>;
  /** `Set-Cookie`만은 합치지 않고 원문 배열 그대로 준다. */
  readonly setCookie: readonly string[];
  readonly body: string;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** 응답을 받지 못한 저수준 실패. 상위(AdtClient)가 AdtError로 정규화한다. */
export class HttpTransportError extends Error {
  readonly reason: 'timeout' | 'network';

  constructor(reason: 'timeout' | 'network', message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'HttpTransportError';
    this.reason = reason;
  }
}

function flattenHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    flat[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return flat;
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  const wanted = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
}

export const nodeHttpTransport: HttpTransport = (request) =>
  new Promise<HttpResponse>((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(request.url);
    } catch {
      reject(new HttpTransportError('network', `URL을 해석할 수 없다: ${request.url}`));
      return;
    }

    const secure = target.protocol === 'https:';
    const outgoing: Record<string, string> = { ...request.headers };
    if (request.body !== undefined && !hasHeader(outgoing, 'content-length')) {
      outgoing['Content-Length'] = String(Buffer.byteLength(request.body, 'utf8'));
    }

    const options: https.RequestOptions = {
      method: request.method,
      headers: outgoing,
      // keep-alive 없이 요청 단위 연결 (잔류 소켓 0)
      agent: false,
    };
    if (secure) {
      options.rejectUnauthorized = request.rejectUnauthorized;
    }

    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (): void => {
      if (timer) clearTimeout(timer);
    };

    const fail = (error: Error): void => {
      finish();
      if (settled) return;
      settled = true;
      reject(
        timedOut
          ? new HttpTransportError(
              'timeout',
              `${request.method} ${request.url} 이(가) ${request.timeoutMs}ms 안에 끝나지 않았다`,
              error,
            )
          : new HttpTransportError(
              'network',
              `${request.method} ${request.url} 전송 실패: ${error.message}`,
              error,
            ),
      );
    };

    const client = secure ? https : http;
    const outgoingRequest = client.request(target, options, (response) => {
      const chunks: string[] = [];
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => chunks.push(chunk));
      response.on('error', fail);
      response.on('end', () => {
        finish();
        if (settled) return;
        settled = true;
        resolve({
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? '',
          headers: flattenHeaders(response.headers),
          setCookie: response.headers['set-cookie'] ?? [],
          body: chunks.join(''),
        });
      });
    });

    outgoingRequest.on('error', fail);

    timer = setTimeout(() => {
      timedOut = true;
      outgoingRequest.destroy(new Error('timeout'));
    }, request.timeoutMs);

    if (request.body !== undefined) {
      outgoingRequest.end(request.body, 'utf8');
    } else {
      outgoingRequest.end();
    }
  });
