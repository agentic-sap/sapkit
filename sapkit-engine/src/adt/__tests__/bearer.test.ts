/**
 * 접속 계층의 **인증 갈림** — Basic / Bearer.
 *
 * 여기서 확인하는 것은 헤더 하나다. 나머지(CSRF·세션·쿠키·잠금)는 인증 방식과
 * 무관하게 같아야 하고, 그것이 같다는 것도 함께 붙잡는다.
 */

import { AuthError } from '../../auth/errors';
import { AdtClient, CSRF_DISCOVERY_PATH } from '../client';
import { startTestServer, testConfig } from './testServer';
import type { Responder, TestServer } from './testServer';

const OBJECT_PATH = '/sap/bc/adt/oo/classes/zcl_dummy/source/main';
const NO_SLEEP = { sleep: async (): Promise<void> => {} };

const open: TestServer[] = [];

async function serve(responder: Responder): Promise<TestServer> {
  const server = await startTestServer(responder);
  open.push(server);
  return server;
}

afterEach(async () => {
  while (open.length > 0) {
    const server = open.pop();
    if (server) await server.close();
  }
});

const EXPECTED_BASIC = `Basic ${Buffer.from('TESTUSER:not-a-real-secret', 'utf8').toString('base64')}`;

describe('AdtClient — Basic 회귀 (기존 동작 불변)', () => {
  it('authType이 없으면 지금까지처럼 Basic이다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.authorization).toBe(EXPECTED_BASIC);
    expect(client.authType).toBe('basic');
  });

  it('authType=basic을 명시해도 같다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl, { authType: 'basic' }));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.authorization).toBe(EXPECTED_BASIC);
  });

  it('jwtToken이 실려 있어도 authType이 jwt가 아니면 Basic이다 — 판별은 authType이 한다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { jwtToken: 'not-a-real-access-token' }),
    );

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.authorization).toBe(EXPECTED_BASIC);
    expect(server.nth(0).headers.authorization).not.toContain('Bearer');
  });
});

describe('AdtClient — Bearer 적재', () => {
  it('authType=jwt면 Bearer를 싣는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: 'not-a-real-access-token' }),
    );

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.authorization).toBe('Bearer not-a-real-access-token');
    expect(client.authType).toBe('jwt');
  });

  it('**사용자·비밀번호가 설정에 남아 있어도 Basic은 나가지 않는다**', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: 'not-a-real-access-token' }),
    );

    await client.request({ method: 'GET', path: OBJECT_PATH });

    const authorization = server.nth(0).headers.authorization ?? '';
    expect(authorization.startsWith('Basic ')).toBe(false);
    expect(authorization).not.toContain(
      Buffer.from('TESTUSER:not-a-real-secret', 'utf8').toString('base64'),
    );
  });

  it('토큰 양옆 공백은 잘라 낸다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: '  padded-token\n' }),
    );

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.authorization).toBe('Bearer padded-token');
  });

  it('호출자가 Authorization을 갈아끼울 수 없다 — Bearer도 Basic과 같은 규칙이다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: 'real-one' }),
    );

    await client.request({
      method: 'GET',
      path: OBJECT_PATH,
      headers: { Authorization: 'Bearer someone-elses', authorization: 'Basic x' },
    });

    expect(server.nth(0).headers.authorization).toBe('Bearer real-one');
  });

  it('클라이언트 헤더·쿠키 고정은 인증 방식과 무관하게 같다', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('set-cookie', ['SAP_SESSIONID_X01_100=sess-1; path=/']);
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: 'not-a-real-access-token' }),
    );

    await client.request({ method: 'GET', path: OBJECT_PATH });
    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers['x-sap-client']).toBe('100');
    expect(server.nth(1).headers.cookie).toContain('sap-usercontext=sap-client=100');
  });

  it('CSRF 취득 요청도 Bearer를 싣는다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) {
        res.setHeader('x-csrf-token', 'token-1');
        res.statusCode = 200;
        res.end('<app:service/>');
        return;
      }
      res.statusCode = 200;
      res.end('done');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: 'not-a-real-access-token' }),
      NO_SLEEP,
    );

    await client.request({ method: 'POST', path: OBJECT_PATH, body: 'x' });

    expect(server.nth(0).path).toBe(CSRF_DISCOVERY_PATH);
    expect(server.nth(0).headers.authorization).toBe('Bearer not-a-real-access-token');
    expect(server.nth(1).headers['x-csrf-token']).toBe('token-1');
    expect(server.nth(1).headers.authorization).toBe('Bearer not-a-real-access-token');
  });
});

describe('AdtClient — 토큰이 없거나 빌 때 (명명 오류)', () => {
  function expectAuthError(work: () => unknown, code: string): void {
    let caught: unknown;
    try {
      work();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe(code);
  }

  it('authType=jwt인데 토큰이 없으면 접속을 만들지 않는다', () => {
    expectAuthError(
      () => new AdtClient(testConfig('https://sap.example.test:44300', { authType: 'jwt' })),
      'AUTH_TOKEN_MISSING',
    );
  });

  it('공백뿐인 토큰도 없는 것과 같다', () => {
    expectAuthError(
      () =>
        new AdtClient(
          testConfig('https://sap.example.test:44300', { authType: 'jwt', jwtToken: '   ' }),
        ),
      'AUTH_TOKEN_MISSING',
    );
  });
});

describe('AdtClient.setBearerToken — 갱신한 토큰 밀어넣기', () => {
  it('다음 요청부터 새 토큰이 실린다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(
      testConfig(server.baseUrl, { authType: 'jwt', jwtToken: 'old-token' }),
    );

    await client.request({ method: 'GET', path: OBJECT_PATH });
    client.setBearerToken('renewed-token');
    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.authorization).toBe('Bearer old-token');
    expect(server.nth(1).headers.authorization).toBe('Bearer renewed-token');
  });

  it('빈 토큰으로 갈아끼울 수 없다', () => {
    const client = new AdtClient(
      testConfig('https://sap.example.test:44300', { authType: 'jwt', jwtToken: 'real' }),
    );
    expect(() => client.setBearerToken('  ')).toThrow(AuthError);
  });

  it('**Basic 접속에는 실을 수 없다** — 인증 방식은 접속을 만들 때 정해진다', () => {
    const client = new AdtClient(testConfig('https://sap.example.test:44300'));
    let caught: unknown;
    try {
      client.setBearerToken('some-token');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe('AUTH_TOKEN_MISSING');
    expect(client.authType).toBe('basic');
  });
});
