/**
 * 시험용 in-process HTTP 서버 + 가짜 접속 설정.
 *
 * 자식 프로세스를 띄우지 않는다 — 이 머신에서 jest가 자식 프로세스 수거에서
 * 비결정적으로 블록된 실측 기록이 있다. 포트는 0(임의 할당)이며 teardown에서
 * `closeAllConnections()`로 살아 있는 소켓을 먼저 끊는다.
 *
 * 여기 쓰이는 호스트·계정·비밀번호는 전부 명백한 가짜다.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ConnectionConfig } from '../../contracts';

export interface RecordedRequest {
  readonly method: string;
  /** 원문 request-target (경로 + 질의). */
  readonly url: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: string;
}

/** 요청 하나에 응답하는 시험 핸들러. `index`는 0부터의 요청 순번. */
export type Responder = (
  request: RecordedRequest,
  response: http.ServerResponse,
  index: number,
) => void;

export interface TestServer {
  readonly baseUrl: string;
  readonly requests: readonly RecordedRequest[];
  /** `index`번째 요청. 없으면 던진다(시험에서 undefined 취급을 없애기 위함). */
  nth(index: number): RecordedRequest;
  countPath(path: string): number;
  close(): Promise<void>;
}

export async function startTestServer(responder: Responder): Promise<TestServer> {
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const target = req.url ?? '/';
      const parsed = new URL(target, 'http://127.0.0.1');
      const record: RecordedRequest = {
        method: req.method ?? 'GET',
        url: target,
        path: parsed.pathname,
        query: parsed.searchParams,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      const index = requests.length;
      requests.push(record);
      try {
        responder(record, res, index);
      } catch (error) {
        res.statusCode = 500;
        res.end(`시험 핸들러 예외: ${String(error)}`);
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    nth(index: number): RecordedRequest {
      const found = requests[index];
      if (!found) {
        throw new Error(`요청 #${index}가 없다 (기록된 요청 ${requests.length}건)`);
      }
      return found;
    },
    countPath(path: string): number {
      return requests.filter((entry) => entry.path === path).length;
    },
    close(): Promise<void> {
      server.closeAllConnections();
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/** 명백히 가짜인 접속 설정. 실제 호스트·자격증명을 절대 넣지 않는다. */
export function testConfig(
  baseUrl: string,
  overrides: Partial<ConnectionConfig> = {},
): ConnectionConfig {
  return {
    baseUrl,
    username: 'TESTUSER',
    password: 'not-a-real-secret',
    client: '100',
    language: 'EN',
    rejectUnauthorized: false,
    timeouts: { default: 3000, csrf: 3000, long: 6000 },
    ...overrides,
  };
}

/** 접속 없이 URL·헤더 조립만 보는 시험용 오프라인 설정. */
export function offlineConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return testConfig('https://sap.example.test:44300', overrides);
}
