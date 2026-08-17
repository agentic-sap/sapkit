/**
 * `authorization_code` 왕복의 **받는 쪽** — loopback 콜백 서버.
 *
 * 인가 서버는 사람이 브라우저에서 로그인을 마치면 `redirect_uri`로 되돌려
 * 보내면서 질의에 `code`를 싣는다. 그 한 번을 받아 내려면 이 프로세스가 잠깐
 * HTTP를 들어야 한다. 이 모듈이 그 잠깐을 소유한다.
 *
 * ## 지키는 것 넷
 *
 * 1. **loopback에만 바인딩한다.** 기본 호스트는 `127.0.0.1`이고, 이 서버는
 *    인가 코드를 받는 창구다 — 랜 어디서나 닿는 자리에 열면 같은 망의 다른
 *    프로세스가 코드를 가로챌 수 있다.
 * 2. **한 번만 받는다.** 실패하면 이름 있는 오류로 끝나고 **되밀지 않는다** —
 *    인가 코드는 일회용이라 재시도의 뜻이 "브라우저를 다시 여는 것"이 되는데,
 *    그것은 사람의 결정이지 이 계층의 결정이 아니다.
 * 3. **반드시 치운다.** 성공·실패·시한초과·시그널 어느 갈래로 끝나든 타이머를
 *    지우고 살아 있는 소켓을 끊고 서버를 닫는다. 안 그러면 시험 프로세스와
 *    서버 프로세스가 그 포트를 붙잡은 채 남는다.
 * 4. **브라우저를 열지 않는다.** 인가 URL은 호출부에 건네고 끝이다. 도구 호출
 *    도중에 엔진이 사용자 화면에 브라우저를 띄우는 것은 attended 명시성에
 *    어긋난다 — 사람이 무엇을 승인하는지 모른 채 창이 뜬다.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { AuthError } from './errors';
import type { TokenSet, UaaClient } from './uaa';

/** 콜백이 돌아올 기본 경로. */
export const DEFAULT_CALLBACK_PATH = '/callback';
/** 기본 바인딩 호스트 — loopback. */
export const DEFAULT_CALLBACK_HOST = '127.0.0.1';

/** 브라우저 창에 남길 문구. 토큰도 코드도 담지 않는다. */
const PAGE_OK = 'SAPKIT: authorization received. You can close this window.';
const PAGE_FAILED = 'SAPKIT: authorization failed. Return to the terminal for the reason.';

export interface CallbackOptions {
  /** 바인딩할 포트. **0이면 임의 할당**(시험이 쓴다). */
  readonly port: number;
  readonly host?: string;
  readonly path?: string;
  /** 콜백을 기다릴 시한. 넘으면 `CALLBACK_TIMEOUT`. */
  readonly timeoutMs: number;
  /** 주면 콜백의 `state`와 대조한다. 다르면 `CALLBACK_STATE_MISMATCH`. */
  readonly state?: string;
  /** 호출부가 접을 수 있는 손잡이. 접히면 `CALLBACK_ABORTED`. */
  readonly signal?: AbortSignal;
}

export interface CallbackResult {
  readonly code: string;
  readonly state: string | null;
}

export interface CallbackCapture {
  /** 인가 서버에 넘길 `redirect_uri`. **실제로 바인딩된 포트**가 들어 있다. */
  readonly redirectUri: string;
  /** 콜백 한 번. 성공하면 코드, 아니면 인증 계층의 명명 오류. */
  readonly received: Promise<CallbackResult>;
  /** 서버를 닫는다. 여러 번 불러도 안전하다. */
  close(): Promise<void>;
}

/**
 * 콜백 서버를 띄운다. **띄우지 못하면 `CALLBACK_FAILED`로 던진다** — 포트가
 * 점유돼 있는데 조용히 다른 포트로 옮기면 `redirect_uri`가 등록된 값과 어긋나
 * 인가 서버가 거절하고, 그 거절은 원인과 아주 먼 곳에서 보인다.
 */
export async function startCallbackServer(options: CallbackOptions): Promise<CallbackCapture> {
  const host = options.host ?? DEFAULT_CALLBACK_HOST;
  const callbackPath = options.path ?? DEFAULT_CALLBACK_PATH;

  let settle: ((result: CallbackResult) => void) | null = null;
  let fail: ((error: AuthError) => void) | null = null;
  const received = new Promise<CallbackResult>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // 호출부가 즉시 await 하지 않아도 미처리 거부 경고가 뜨지 않게 한다. 파생
  // 프로미스만 삼키므로 호출부는 여전히 같은 거부를 받는다.
  received.catch(() => {});

  const server = http.createServer((req, res) => {
    const target = new URL(req.url ?? '/', `http://${host}`);
    if (target.pathname !== callbackPath) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const error = target.searchParams.get('error');
    const code = target.searchParams.get('code');
    const state = target.searchParams.get('state');

    if (error !== null) {
      // `error_description`은 인가 서버가 사람에게 보이라고 준 문구다. 코드나
      // 토큰이 실리는 칸이 아니므로 그대로 옮긴다.
      const description = target.searchParams.get('error_description');
      respond(res, 400, PAGE_FAILED);
      finish(
        new AuthError(
          'CALLBACK_FAILED',
          `인가 서버가 콜백을 오류로 돌려보냈다 — ${error}${description ? ` (${description})` : ''}`,
        ),
      );
      return;
    }

    if (options.state !== undefined && state !== options.state) {
      respond(res, 400, PAGE_FAILED);
      finish(
        new AuthError(
          'CALLBACK_STATE_MISMATCH',
          '콜백의 state가 보낸 값과 다르다 — 이 콜백은 이 요청이 시작한 로그인이 아니다.',
        ),
      );
      return;
    }

    if (code === null || code === '') {
      respond(res, 400, PAGE_FAILED);
      finish(new AuthError('CALLBACK_FAILED', '콜백에 code가 없다.'));
      return;
    }

    respond(res, 200, PAGE_OK);
    finish({ code, state });
  });

  let done = false;
  let timer: NodeJS.Timeout | undefined;
  const onAbort = (): void => {
    finish(new AuthError('CALLBACK_ABORTED', '호출부가 인가 대기를 접었다.'));
  };

  /** 성공이든 실패든 여기 한 곳에서만 끝난다 — 치우는 코드가 갈라지지 않게. */
  function finish(outcome: CallbackResult | AuthError): void {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    // 서버를 먼저 닫지 않는다 — 응답이 아직 나가는 중일 수 있다. 닫기는
    // `close()`가 소유하고, 호출부는 `finally`에서 부른다.
    if (outcome instanceof AuthError) fail?.(outcome);
    else settle?.(outcome);
  }

  let listenFailed: ((error: AuthError) => void) | null = null;
  const onListenError = (err: Error): void => {
    listenFailed?.(
      new AuthError(
        'CALLBACK_FAILED',
        `콜백 서버를 ${host}:${options.port} 에 띄우지 못했다 — ${err.message}`,
        { cause: err },
      ),
    );
  };

  await new Promise<void>((resolve, reject) => {
    listenFailed = reject;
    server.once('error', onListenError);
    server.listen(options.port, host, resolve);
  }).catch(async (err: unknown) => {
    await closeServer(server);
    throw err;
  });

  // 바인딩에 성공했으므로 기동 실패 감시는 뗀다. 뒤이은 오류는 아래 갈래가
  // 받는다 — 요청 처리 중의 오류가 대기를 영영 매달지 않게 한다.
  server.removeListener('error', onListenError);
  server.on('error', (err: Error) => {
    finish(new AuthError('CALLBACK_FAILED', `콜백 서버가 오류로 멈췄다 — ${err.message}`, { cause: err }));
  });

  // **시한 타이머를 시그널보다 먼저 건다.** 순서를 뒤집으면 이미 접힌 시그널이
  // `finish()`를 먼저 돌려 놓고, 그 뒤에 걸린 타이머는 지울 사람이 없어 시한만큼
  // 프로세스를 붙잡는다(시험 러너가 안 끝나는 것으로 드러났다).
  timer = setTimeout(() => {
    finish(
      new AuthError(
        'CALLBACK_TIMEOUT',
        `인가 콜백이 ${options.timeoutMs}ms 안에 오지 않았다 — 되밀지 않는다(인가 코드는 일회용이라 재시도는 브라우저를 다시 여는 일이고, 그것은 사람의 결정이다).`,
      ),
    );
  }, options.timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const address = server.address() as AddressInfo | null;
  const port = address?.port ?? options.port;

  return {
    redirectUri: `http://${host}:${port}${callbackPath}`,
    received,
    // 닫는 것이 곧 **기다리기를 그만두는 것**이다. 서버만 닫고 시한 타이머를
    // 두면 그 타이머가 시한만큼 프로세스를 붙잡는다 — 이미 끝난 대기라도
    // 마찬가지다. `finish`는 한 번만 먹히므로 이미 끝난 갈래는 그대로다.
    close: async () => {
      finish(new AuthError('CALLBACK_ABORTED', '콜백 서버를 닫았다 — 더 기다리지 않는다.'));
      await closeServer(server);
    },
  };
}

function respond(res: http.ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections();
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

export interface AuthorizationCodeFlowOptions {
  readonly client: UaaClient;
  /** 콜백 포트. 인가 서버에 등록된 `redirect_uri`와 같아야 한다. */
  readonly port: number;
  readonly host?: string;
  readonly path?: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly scope?: string;
  /** `state` 생성기. 기본은 UUID. */
  readonly newState?: () => string;
  /**
   * 인가 URL을 **사람에게 건네는** 자리. 붙여넣기용으로 찍든 브라우저를 열든
   * 호출부가 정한다 — 이 계층은 창을 띄우지 않는다(머리말 4).
   */
  readonly openAuthorizeUrl: (url: string) => void | Promise<void>;
}

/**
 * 왕복 전체 — 콜백 서버 기동 → 인가 URL 전달 → 코드 수신 → 토큰 교환.
 *
 * 어느 단계에서 실패하든 콜백 서버는 닫힌다(`finally`). 실패는 이름 있는
 * 오류이고 이 함수는 아무것도 되밀지 않는다.
 */
export async function acquireByAuthorizationCode(
  options: AuthorizationCodeFlowOptions,
): Promise<TokenSet> {
  const state = (options.newState ?? randomUUID)();
  const capture = await startCallbackServer({
    port: options.port,
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.path !== undefined ? { path: options.path } : {}),
    timeoutMs: options.timeoutMs,
    state,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  try {
    await options.openAuthorizeUrl(
      options.client.authorizeUrl({
        redirectUri: capture.redirectUri,
        state,
        ...(options.scope !== undefined ? { scope: options.scope } : {}),
      }),
    );
    const result = await capture.received;
    return await options.client.exchangeCode(result.code, capture.redirectUri);
  } finally {
    await capture.close();
  }
}
