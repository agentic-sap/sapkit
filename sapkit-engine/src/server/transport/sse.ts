/**
 * SSE 전송 — MCP 클라이언트와의 통로다. **SAP과의 통로가 아니다.**
 *
 * 두 갈래가 한 쌍으로 돈다. `GET <ssePath>`가 스트림을 열고(서버→클라이언트),
 * 클라이언트는 그 스트림의 첫 프레임(`event: endpoint`)이 알려 준 주소로
 * `POST <postPath>?sessionId=…`를 보낸다(클라이언트→서버). 응답은 POST의 본문이
 * 아니라 **스트림으로** 돌아온다 — POST 자신은 202만 돌려준다.
 *
 * 그래서 HTTP 전송과 달리 **세션을 든다.** 요청 하나에 코어 하나가 아니라
 * **스트림 하나에 코어 하나**이고, 스트림이 닫히면 그 코어도 닫는다. 구 엔진도
 * 같은 모양이었다(`engine/src/server/SseServer.ts:57-60` `SessionEntry` ·
 * `:190-290` `handleGet` · `:292-339` `handlePost`).
 *
 * 웹 서버는 `node:http`만 쓴다 — 구는 express를 썼지만(`SseServer.ts:165-168`),
 * SDK의 SSE 전송이 `IncomingMessage`/`ServerResponse`를 그대로 받고
 * (`server/sse.d.ts` — `handlePostMessage(req, res, parsedBody?)`) 본문도 스스로
 * 읽으므로(`server/sse.js` `getRawBody`) 넣을 이유가 없다. **새 의존은 0이다.**
 *
 * 표면은 좁다:
 *  - `GET <ssePath>` — 스트림을 연다. 다른 메서드는 405.
 *  - `POST <postPath>` — 메시지를 올린다. 다른 메서드는 405. 모르는 세션은 400.
 *  - `GET /mcp/health` — 살아 있는지만.
 *  - 나머지는 404.
 *
 * **잠금은 HTTP와 같은 것을 쓴다**(하드 게이트 — 전송이 뒷문이 되면 안 된다).
 * 판정은 전부 `./config`에 있고, 여기서는 그 결과를 실행할 뿐이다. 한 가지만
 * 더 한다 — SDK의 헤더 검사는 **POST에서만** 돈다
 * (`server/sse.js` `handlePostMessage` → `validateRequestHeaders`; `start()`는
 * 검사하지 않는다). 스트림을 여는 GET과 health가 그대로면 보호가 걸리지 않은 창이
 * 둘 남으므로 같은 판정을 이 파일이 한 번 더 한다(차이 장부 D31).
 */

import * as http from 'node:http';

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import type { ServerCore } from '../core';
import type { SseTransportConfig } from './config';

export interface SseTransportOptions {
  readonly config: SseTransportConfig;
  /** 스트림마다 새 코어를 뽑는 자리. 노출 판정·게이트는 코어 안에 그대로 있다. */
  readonly createCore: () => ServerCore;
  /** 진단·감사 통로. */
  readonly stderr: (line: string) => void;
}

export interface SseBinding {
  /** 스트림을 여는 주소. 포트를 0으로 주면 커널이 고른 값이 여기 들어온다. */
  readonly endpoint: string;
  /** 메시지를 올리는 주소. */
  readonly postEndpoint: string;
  readonly port: number;
  close(): Promise<void>;
}

const HEALTH_PATH = '/mcp/health';

function send(res: http.ServerResponse, status: number, body: string, type = 'text/plain'): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

/**
 * DNS 리바인딩 보호를 **모든 경로에** 적용한다.
 *
 * Host는 `./http.ts`의 `hostAllowed`와 같은 판정이고(전송마다 잠금이 갈라지지
 * 않게 같은 규칙을 쓴다), Origin은 SDK가 POST에서 하는 것과 같은 규칙이다 —
 * 헤더가 있을 때만 본다(`server/sse.js` `validateRequestHeaders`).
 */
function requestAllowed(config: SseTransportConfig, req: http.IncomingMessage): boolean {
  if (!config.dnsRebindingProtection) return true;
  if (config.allowedHosts.length > 0) {
    const host = req.headers.host;
    if (typeof host !== 'string' || !config.allowedHosts.includes(host)) return false;
  }
  if (config.allowedOrigins.length > 0) {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && !config.allowedOrigins.includes(origin)) return false;
  }
  return true;
}

interface Session {
  readonly transport: SSEServerTransport;
  readonly core: ServerCore;
}

export async function openSseTransport(options: SseTransportOptions): Promise<SseBinding> {
  const { config, createCore, stderr } = options;
  const sessions = new Map<string, Session>();

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      stderr(
        `[sapkit] sse request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.end();
    });
  });

  /** 세션 하나를 접는다. 두 번 불러도 한 번만 접힌다. */
  function dispose(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session === undefined) return;
    sessions.delete(sessionId);
    void session.transport.close().catch(() => {
      // 스트림이 이미 끊긴 뒤의 정리 실패는 요청 결과가 아니다.
    });
    void session.core.server.close().catch(() => {
      // 위와 같다.
    });
  }

  async function openStream(res: http.ServerResponse): Promise<void> {
    const core = createCore();
    const transport = new SSEServerTransport(config.postPath, res, {
      enableDnsRebindingProtection: config.dnsRebindingProtection,
      allowedHosts: [...config.allowedHosts],
      allowedOrigins: [...config.allowedOrigins],
    });
    const sessionId = transport.sessionId;
    sessions.set(sessionId, { transport, core });

    // 닫기 처리를 **연결보다 먼저** 건다 — 연결 도중에 끊긴 스트림이 세션 지도에
    // 남는 갈래를 없애기 위해서다. 구는 연결 뒤에 걸었다(`SseServer.ts:284`).
    res.on('close', () => dispose(sessionId));

    try {
      await core.server.connect(transport);
    } catch (error) {
      dispose(sessionId);
      stderr(
        `[sapkit] sse stream failed to open: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      return;
    }

    // 연결이 끝나기 전에 이미 끊겼다면 `close`가 지나갔을 수 있다.
    if (res.destroyed) dispose(sessionId);
  }

  async function routeMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    // 구와 같은 두 자리에서 세션을 읽는다(`SseServer.ts:293-295`).
    const fromHeader = req.headers['x-session-id'];
    const sessionId =
      url.searchParams.get('sessionId') ??
      (typeof fromHeader === 'string' ? fromHeader : undefined) ??
      '';
    const session = sessions.get(sessionId);
    if (session === undefined) {
      // 세션 번호를 되풀이해 적지 않는다 — 무인증으로 열린 창이다.
      send(res, 400, 'Invalid session');
      return;
    }
    await session.transport.handlePostMessage(req, res);
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 기준 주소를 고정해 둔다 — 요청이 들고 온 Host로 URL을 만들면 망가진 헤더
    // 하나가 파싱 예외가 된다.
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (!requestAllowed(config, req)) {
      send(res, 403, `Invalid Host or Origin header: ${req.headers.host ?? '(none)'}`);
      return;
    }

    if (pathname === HEALTH_PATH) {
      if (req.method !== 'GET') {
        send(res, 405, 'Method Not Allowed');
        return;
      }
      // 판 번호도 세션 수도 싣지 않는다 — 무인증으로 열린 창이므로 알릴 것을
      // 최소로 둔다(구는 둘 다 실었다 — `SseServer.ts:108-116`).
      send(
        res,
        200,
        JSON.stringify({ status: 'ok', transport: 'sse', uptime: Math.floor(process.uptime()) }),
        'application/json',
      );
      return;
    }

    if (pathname === config.ssePath && req.method === 'GET') {
      await openStream(res);
      return;
    }

    if (pathname === config.postPath && req.method === 'POST') {
      await routeMessage(req, res, url);
      return;
    }

    if (pathname === config.ssePath || pathname === config.postPath) {
      send(res, 405, 'Method Not Allowed');
      return;
    }

    send(res, 404, 'Not Found');
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
    stderr(`[sapkit] sse listener error: ${error.message}`);
  });

  const endpoint = `http://${config.host}:${port}${config.ssePath}`;
  const postEndpoint = `http://${config.host}:${port}${config.postPath}`;
  stderr(`[sapkit] transport: sse listening · endpoint=${endpoint} · post=${postEndpoint}`);

  return {
    endpoint,
    postEndpoint,
    port,
    async close(): Promise<void> {
      // 열린 스트림은 응답이 끝나지 않은 소켓이다 — 접지 않으면 프로세스가 안 죽는다.
      for (const sessionId of [...sessions.keys()]) dispose(sessionId);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
