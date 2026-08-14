/**
 * HTTP 전송 — MCP 클라이언트와의 통로다. **SAP과의 통로가 아니다.**
 *
 * 요청 하나에 **전송 하나 · 코어 하나**를 새로 만든다. 취향이 아니라 계약이다:
 * SDK 1.30의 stateless 전송은 재사용을 스스로 막는다("Stateless transport cannot
 * be reused across requests" — `webStandardStreamableHttp.js:176-178`). 구 엔진도
 * 같은 모양이었다(`engine/src/server/StreamableHttpServer.ts:124`
 * `createPerRequestServer` · `:186-189` `sessionIdGenerator: undefined`).
 *
 * 웹 서버는 `node:http`만 쓴다. 구는 express를 썼지만, 이 엔진의 의존은
 * SDK·파서·zod 셋뿐이고 SDK의 전송이 `IncomingMessage`/`ServerResponse`를 그대로
 * 받으므로(`server/streamableHttp.d.ts:107-109`) 넣을 이유가 없다.
 *
 * 표면은 구와 같게 좁다:
 *  - `POST <path>` — MCP 왕복.
 *  - 그 경로의 다른 메서드는 405. 구가 GET(SSE 스트림)을 일부러 막아 둔 것을
 *    승계한다(`StreamableHttpServer.ts:237-243`).
 *  - `GET /mcp/health` — 살아 있는지만.
 *  - 나머지는 404.
 */

import * as http from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import type { ServerCore } from '../core';
import type { HttpTransportConfig } from './config';

export interface HttpTransportOptions {
  readonly config: HttpTransportConfig;
  /** 요청마다 새 코어를 뽑는 자리. 노출 판정·게이트는 코어 안에 그대로 있다. */
  readonly createCore: () => ServerCore;
  /** 진단·감사 통로. */
  readonly stderr: (line: string) => void;
}

export interface HttpBinding {
  /** 실제로 붙은 주소. 포트를 0으로 주면 커널이 고른 값이 여기 들어온다. */
  readonly endpoint: string;
  readonly port: number;
  close(): Promise<void>;
}

const HEALTH_PATH = '/mcp/health';

function send(res: http.ServerResponse, status: number, body: string, type = 'text/plain'): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

/**
 * DNS 리바인딩 보호를 **MCP 경로 밖에도** 적용한다.
 *
 * SDK의 검사는 전송 안에서만 돈다. health를 그 밖에 두면 보호가 걸리지 않은 창이
 * 하나 남으므로 같은 판정을 여기서 한 번 더 한다.
 */
function hostAllowed(config: HttpTransportConfig, req: http.IncomingMessage): boolean {
  if (!config.dnsRebindingProtection || config.allowedHosts.length === 0) return true;
  const host = req.headers.host;
  return typeof host === 'string' && config.allowedHosts.includes(host);
}

export async function openHttpTransport(options: HttpTransportOptions): Promise<HttpBinding> {
  const { config, createCore, stderr } = options;

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      stderr(
        `[sapkit] http request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.end();
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 경로만 필요하다 — 기준 주소를 고정해 둔다. 요청이 들고 온 Host로 URL을
    // 만들면 망가진 헤더 하나가 파싱 예외가 된다.
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (!hostAllowed(config, req)) {
      send(res, 403, `Invalid Host header: ${req.headers.host ?? '(none)'}`);
      return;
    }

    if (pathname === HEALTH_PATH) {
      if (req.method !== 'GET') {
        send(res, 405, 'Method Not Allowed');
        return;
      }
      // 판 번호는 싣지 않는다 — 무인증으로 열린 창이므로 알릴 것을 최소로 둔다.
      send(
        res,
        200,
        JSON.stringify({ status: 'ok', transport: 'http', uptime: Math.floor(process.uptime()) }),
        'application/json',
      );
      return;
    }

    if (pathname !== config.path) {
      send(res, 404, 'Not Found');
      return;
    }

    if (req.method !== 'POST') {
      // 구와 같다 — GET SSE 스트림을 열지 않는다.
      send(res, 405, 'Method Not Allowed');
      return;
    }

    const core = createCore();
    const transport = new StreamableHTTPServerTransport({
      // stateless. 세션을 들지 않으므로 요청 사이에 남는 상태가 없다.
      sessionIdGenerator: undefined,
      enableJsonResponse: config.enableJsonResponse,
      enableDnsRebindingProtection: config.dnsRebindingProtection,
      allowedHosts: [...config.allowedHosts],
      allowedOrigins: [...config.allowedOrigins],
    });

    res.on('close', () => {
      void core.server.close().catch(() => {
        // 응답이 끝난 뒤의 정리 실패는 요청 결과가 아니다.
      });
    });

    await core.server.connect(transport);
    await transport.handleRequest(req, res);
  }

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : config.port);
    });
  });

  // 바인딩에 성공한 뒤의 리스너 오류는 붙잡을 사람이 없으면 프로세스를 죽인다.
  server.on('error', (error: Error) => {
    stderr(`[sapkit] http listener error: ${error.message}`);
  });

  const endpoint = `http://${config.host}:${port}${config.path}`;
  stderr(`[sapkit] transport: http listening · endpoint=${endpoint}`);

  return {
    endpoint,
    port,
    async close(): Promise<void> {
      // keep-alive 소켓이 남으면 프로세스가 안 죽는다.
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
