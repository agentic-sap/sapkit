/**
 * `authorization_code` 왕복 — **실 브라우저 없이**.
 *
 * 콜백 서버는 진짜로 loopback에 뜨고(그것이 시험 대상이다), 인가 서버 역할은
 * 시험이 직접 `code=`를 들고 그 자리로 요청을 보내는 것으로 대신한다. UAA
 * 토큰 종단점은 전송 목이라 바깥으로 나가는 요청은 하나도 없다.
 */

import * as http from 'node:http';

import { AuthError } from '../errors';
import { DEFAULT_CALLBACK_HOST, acquireByAuthorizationCode, startCallbackServer } from '../callback';
import type { CallbackCapture } from '../callback';
import { UaaClient } from '../uaa';
import { fakeUaa, mockTransport, tokenBody } from './helpers';

const open: CallbackCapture[] = [];

/** 시험이 끝나면 무조건 닫는다 — 포트를 붙잡은 채 남지 않게. */
async function capture(
  options: Parameters<typeof startCallbackServer>[0],
): Promise<CallbackCapture> {
  const started = await startCallbackServer(options);
  open.push(started);
  return started;
}

afterEach(async () => {
  while (open.length > 0) {
    const server = open.pop();
    if (server) await server.close();
  }
});

/**
 * 인가 서버가 되돌려보내는 리다이렉트 한 번. 상태 코드만 돌려준다.
 *
 * `agent: false` — keep-alive를 쓰면 시험이 끝난 뒤에도 클라이언트 소켓이 남아
 * 러너가 안 끝난다(`src/adt/__tests__/testServer.ts`와 같은 이유).
 */
function hit(url: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const request = http.get(url, { agent: false }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    request.on('error', reject);
  });
}

async function rejection(work: Promise<unknown>): Promise<AuthError> {
  try {
    await work;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }
  throw new Error('던지지 않았다 — 실패로 다뤄야 하는 갈래다');
}

describe('startCallbackServer — 코드 캡처', () => {
  it('실제로 바인딩된 포트가 들어간 redirect_uri를 준다', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000 });
    const url = new URL(server.redirectUri);

    expect(url.hostname).toBe(DEFAULT_CALLBACK_HOST);
    expect(url.pathname).toBe('/callback');
    expect(Number(url.port)).toBeGreaterThan(0);
  });

  it('code를 실은 콜백을 받아 낸다', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000 });

    const status = await hit(`${server.redirectUri}?code=not-a-real-code&state=state-1`);

    expect(status).toBe(200);
    await expect(server.received).resolves.toEqual({ code: 'not-a-real-code', state: 'state-1' });
  });

  it('경로를 지정할 수 있다', async () => {
    const server = await capture({ port: 0, path: '/oauth/done', timeoutMs: 5_000 });
    expect(new URL(server.redirectUri).pathname).toBe('/oauth/done');

    await hit(`${server.redirectUri}?code=c`);
    await expect(server.received).resolves.toEqual({ code: 'c', state: null });
  });

  it('다른 경로는 404이고 대기를 끝내지 않는다', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000 });
    const base = new URL(server.redirectUri).origin;

    expect(await hit(`${base}/favicon.ico`)).toBe(404);

    // 아직 안 끝났다 — 그 다음 진짜 콜백이 끝낸다.
    await hit(`${server.redirectUri}?code=late-code`);
    await expect(server.received).resolves.toMatchObject({ code: 'late-code' });
  });

  it('브라우저에 돌려주는 본문에 코드가 담기지 않는다', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000 });
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get(`${server.redirectUri}?code=secret-looking-code`, { agent: false }, (response) => {
          const chunks: string[] = [];
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => chunks.push(chunk));
          response.on('end', () => resolve(chunks.join('')));
        })
        .on('error', reject);
    });
    expect(body).not.toContain('secret-looking-code');
  });
});

describe('startCallbackServer — 실패 갈래 (되밀지 않는다)', () => {
  it('state가 다르면 CALLBACK_STATE_MISMATCH', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000, state: 'expected' });

    expect(await hit(`${server.redirectUri}?code=c&state=someone-elses`)).toBe(400);
    expect((await rejection(server.received)).code).toBe('CALLBACK_STATE_MISMATCH');
  });

  it('state를 요구했는데 아예 없어도 불일치다', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000, state: 'expected' });

    await hit(`${server.redirectUri}?code=c`);
    expect((await rejection(server.received)).code).toBe('CALLBACK_STATE_MISMATCH');
  });

  it('인가 서버가 error=로 답하면 CALLBACK_FAILED이고 사유를 옮긴다', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000 });

    expect(
      await hit(`${server.redirectUri}?error=access_denied&error_description=User%20said%20no`),
    ).toBe(400);
    const error = await rejection(server.received);
    expect(error.code).toBe('CALLBACK_FAILED');
    expect(error.message).toContain('access_denied');
    expect(error.message).toContain('User said no');
  });

  it('code가 없으면 CALLBACK_FAILED', async () => {
    const server = await capture({ port: 0, timeoutMs: 5_000 });

    await hit(server.redirectUri);
    expect((await rejection(server.received)).code).toBe('CALLBACK_FAILED');
  });

  it('시한이 지나면 CALLBACK_TIMEOUT — 되밀지 않는다', async () => {
    const server = await capture({ port: 0, timeoutMs: 30 });

    const error = await rejection(server.received);
    expect(error.code).toBe('CALLBACK_TIMEOUT');
    expect(error.message).toContain('30ms');
  });

  it('시그널로 접으면 CALLBACK_ABORTED', async () => {
    const controller = new AbortController();
    const server = await capture({ port: 0, timeoutMs: 5_000, signal: controller.signal });

    controller.abort();
    expect((await rejection(server.received)).code).toBe('CALLBACK_ABORTED');
  });

  it('이미 접힌 시그널이면 기다리지 않고 바로 끝난다', async () => {
    const controller = new AbortController();
    controller.abort();
    const server = await capture({ port: 0, timeoutMs: 60_000, signal: controller.signal });

    expect((await rejection(server.received)).code).toBe('CALLBACK_ABORTED');
  });

  it('점유된 포트에는 뜨지 않고 CALLBACK_FAILED로 던진다 — 조용히 옮기지 않는다', async () => {
    const held = await capture({ port: 0, timeoutMs: 5_000 });
    const port = Number(new URL(held.redirectUri).port);

    const error = await rejection(startCallbackServer({ port, timeoutMs: 5_000 }));
    expect(error.code).toBe('CALLBACK_FAILED');
  });
});

describe('startCallbackServer — 치우기', () => {
  it('close()는 여러 번 불러도 안전하고 포트를 놓아준다', async () => {
    const server = await startCallbackServer({ port: 0, timeoutMs: 5_000 });
    const port = Number(new URL(server.redirectUri).port);

    await server.close();
    await server.close();

    // 같은 포트에 다시 뜬다 = 정말 놓았다.
    const again = await capture({ port, timeoutMs: 5_000 });
    expect(Number(new URL(again.redirectUri).port)).toBe(port);
  });

  // 서버만 닫고 시한 타이머를 두면 그 타이머가 시한만큼 프로세스를 붙잡는다 —
  // 시험 러너가 안 끝나는 것으로 실제로 드러났다.
  it('**close()는 기다리던 대기도 끝낸다** — 남은 시한 타이머가 없다', async () => {
    const server = await startCallbackServer({ port: 0, timeoutMs: 60_000 });

    await server.close();

    expect((await rejection(server.received)).code).toBe('CALLBACK_ABORTED');
  });

  it('이미 끝난 대기는 close()가 뒤집지 않는다', async () => {
    const server = await startCallbackServer({ port: 0, timeoutMs: 60_000 });
    await hit(`${server.redirectUri}?code=captured`);
    await expect(server.received).resolves.toMatchObject({ code: 'captured' });

    await server.close();

    await expect(server.received).resolves.toMatchObject({ code: 'captured' });
  });

  it('시한초과로 끝난 뒤에도 타이머가 남지 않는다(닫으면 포트가 풀린다)', async () => {
    const server = await startCallbackServer({ port: 0, timeoutMs: 20 });
    const port = Number(new URL(server.redirectUri).port);

    await rejection(server.received);
    await server.close();

    const again = await capture({ port, timeoutMs: 5_000 });
    expect(Number(new URL(again.redirectUri).port)).toBe(port);
  });
});

describe('acquireByAuthorizationCode — 왕복 전체', () => {
  it('인가 URL을 호출부에 건네고, 콜백 코드를 토큰으로 바꾼다', async () => {
    const mock = mockTransport([tokenBody({ refresh_token: 'not-a-real-refresh' })]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    let handed = '';
    const token = await acquireByAuthorizationCode({
      client,
      port: 0,
      timeoutMs: 5_000,
      newState: () => 'state-fixed',
      openAuthorizeUrl: (url) => {
        handed = url;
        // 인가 서버가 사람을 되돌려보낸 셈 친다.
        const redirect = new URL(url).searchParams.get('redirect_uri') ?? '';
        void hit(`${redirect}?code=not-a-real-code&state=state-fixed`);
      },
    });

    // 브라우저를 열지 않는다 — URL을 건네받은 것이 전부다.
    const authorize = new URL(handed);
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('state')).toBe('state-fixed');
    const redirectUri = authorize.searchParams.get('redirect_uri') ?? '';
    expect(redirectUri).toContain(`http://${DEFAULT_CALLBACK_HOST}:`);

    // 교환 요청이 같은 redirect_uri로 나갔다.
    expect(mock.form(0).get('grant_type')).toBe('authorization_code');
    expect(mock.form(0).get('code')).toBe('not-a-real-code');
    expect(mock.form(0).get('redirect_uri')).toBe(redirectUri);
    expect(token.accessToken).toBe('not-a-real-access-token');
    expect(token.refreshToken).toBe('not-a-real-refresh');
  });

  it('state가 어긋나면 교환을 **시도하지 않는다**', async () => {
    const mock = mockTransport([]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    const error = await rejection(
      acquireByAuthorizationCode({
        client,
        port: 0,
        timeoutMs: 5_000,
        newState: () => 'state-fixed',
        openAuthorizeUrl: (url) => {
          const redirect = new URL(url).searchParams.get('redirect_uri') ?? '';
          void hit(`${redirect}?code=c&state=wrong`);
        },
      }),
    );

    expect(error.code).toBe('CALLBACK_STATE_MISMATCH');
    expect(mock.calls).toHaveLength(0);
  });

  it('시한초과로 실패해도 콜백 서버는 닫힌다', async () => {
    const mock = mockTransport([]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });
    let port = 0;

    const error = await rejection(
      acquireByAuthorizationCode({
        client,
        port: 0,
        timeoutMs: 30,
        openAuthorizeUrl: (url) => {
          port = Number(new URL(new URL(url).searchParams.get('redirect_uri') ?? '').port);
        },
      }),
    );

    expect(error.code).toBe('CALLBACK_TIMEOUT');
    expect(mock.calls).toHaveLength(0);
    // 포트가 풀렸다 = finally가 닫았다.
    const again = await capture({ port, timeoutMs: 5_000 });
    expect(Number(new URL(again.redirectUri).port)).toBe(port);
  });
});
