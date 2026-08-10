import { AdtClient, CSRF_DISCOVERY_PATH } from '../client';
import { AdtError } from '../errors';
import type { HttpRequest, HttpResponse, HttpTransport } from '../http';
import { offlineConfig, startTestServer, testConfig } from './testServer';
import type { Responder, TestServer } from './testServer';

const OBJECT_PATH = '/sap/bc/adt/oo/classes/zcl_dummy/source/main';

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

/** 토큰을 발급하고 세션 쿠키를 심는 표준 discovery 응답. */
function respondDiscovery(res: import('node:http').ServerResponse, token: string): void {
  res.setHeader('x-csrf-token', token);
  res.setHeader('set-cookie', [
    'SAP_SESSIONID_X01_100=sess-1; path=/; HttpOnly; Secure',
    'sap-usercontext=sap-client=100; path=/',
  ]);
  res.statusCode = 200;
  res.end('<app:service/>');
}

function spyTransport(response: Partial<HttpResponse> = {}): {
  calls: HttpRequest[];
  transport: HttpTransport;
} {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = async (request) => {
    calls.push(request);
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      setCookie: [],
      body: '',
      ...response,
    };
  };
  return { calls, transport };
}

describe('AdtClient — 요청 공통 처리', () => {
  it('Basic 인증 헤더를 실어 보낸다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    const expected = `Basic ${Buffer.from('TESTUSER:not-a-real-secret', 'utf8').toString('base64')}`;
    expect(server.nth(0).headers.authorization).toBe(expected);
  });

  it('sap-client·sap-language를 질의 인자로 붙인다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH, params: { version: 'active' } });

    const request = server.nth(0);
    expect(request.query.get('version')).toBe('active');
    expect(request.query.get('sap-client')).toBe('100');
    expect(request.query.get('sap-language')).toBe('EN');
  });

  it('Accept 기본값을 쓰고 호출자 지정이 이를 이긴다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });
    await client.request({ method: 'GET', path: OBJECT_PATH, accept: 'text/plain' });

    expect(server.nth(0).headers.accept).toContain('application/xml');
    expect(server.nth(1).headers.accept).toBe('text/plain');
  });

  it('본문이 있으면 Content-Type·Content-Length를 채운다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'PUT', path: OBJECT_PATH, body: 'REPORT z.' });

    const put = server.nth(1);
    expect(put.body).toBe('REPORT z.');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers['content-length']).toBe(String(Buffer.byteLength('REPORT z.')));
  });

  it('4xx를 AdtError로 정규화하고 원문을 보존한다', async () => {
    const body = '<exc:exception><type id="ExceptionResourceNotFound"/><message lang="EN">not there</message></exc:exception>';
    const server = await serve((_req, res) => {
      res.statusCode = 404;
      res.end(body);
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client.request({ method: 'GET', path: OBJECT_PATH }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    const adtError = error as AdtError;
    expect(adtError.kind).toBe('not-found');
    expect(adtError.status).toBe(404);
    expect(adtError.adtType).toBe('ExceptionResourceNotFound');
    expect(adtError.rawBody).toBe(body);
  });

  it('타임아웃을 timeout 종류의 AdtError로 정규화한다', async () => {
    const server = await serve(() => {
      /* 응답하지 않는다 */
    });
    const client = new AdtClient(testConfig(server.baseUrl, {
      timeouts: { default: 60, csrf: 60, long: 60 },
    }));

    const error = await client.request({ method: 'GET', path: OBJECT_PATH }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('timeout');
    expect((error as AdtError).status).toBeUndefined();
  });

  it('접속 실패를 network 종류의 AdtError로 정규화한다', async () => {
    const dead = await startTestServer((_req, res) => res.end('ok'));
    const baseUrl = dead.baseUrl;
    await dead.close();
    const client = new AdtClient(testConfig(baseUrl));

    const error = await client.request({ method: 'GET', path: OBJECT_PATH }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('network');
  });
});

describe('AdtClient — 세션 수립·재사용', () => {
  it('응답의 Set-Cookie를 보관해 후속 요청에 같은 세션을 싣는다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.ensureCsrfToken();
    await client.request({ method: 'GET', path: OBJECT_PATH });
    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers.cookie).toBeUndefined();
    expect(server.nth(1).headers.cookie).toBe(
      'SAP_SESSIONID_X01_100=sess-1; sap-usercontext=sap-client=100',
    );
    expect(server.nth(2).headers.cookie).toBe(server.nth(1).headers.cookie);
  });

  it('sap-adt-connection-id는 한 클라이언트 안에서 고정이고 인스턴스마다 다르다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const first = new AdtClient(testConfig(server.baseUrl));
    const second = new AdtClient(testConfig(server.baseUrl));

    await first.request({ method: 'GET', path: OBJECT_PATH });
    await first.request({ method: 'GET', path: OBJECT_PATH });
    await second.request({ method: 'GET', path: OBJECT_PATH });

    const id = server.nth(0).headers['sap-adt-connection-id'];
    expect(id).toBeTruthy();
    expect(server.nth(1).headers['sap-adt-connection-id']).toBe(id);
    expect(server.nth(2).headers['sap-adt-connection-id']).not.toBe(id);
  });

  it('reset()이 쿠키와 CSRF 토큰을 버린다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.ensureCsrfToken();
    expect(client.csrfToken).toBe('TOKEN-1');
    expect(client.cookieHeader()).toBeDefined();

    client.reset();

    expect(client.csrfToken).toBeNull();
    expect(client.cookieHeader()).toBeUndefined();
    expect(client.sessionType).toBe('stateless');
  });
});

describe('AdtClient — stateful 세션', () => {
  it('stateless 요청에는 세션 타입 헤더를 붙이지 않는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(client.sessionType).toBe('stateless');
    expect(server.nth(0).headers['x-sap-adt-sessiontype']).toBeUndefined();
  });

  it('stateful로 전환하면 이후 요청에 x-sap-adt-sessiontype: stateful을 싣는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    client.setSessionType('stateful');
    await client.request({ method: 'GET', path: OBJECT_PATH });
    client.setSessionType('stateless');
    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(server.nth(1).headers['x-sap-adt-sessiontype']).toBeUndefined();
  });
});

describe('AdtClient — CSRF 토큰 수명주기', () => {
  it('읽기 요청은 토큰을 취득하지도 싣지도 않는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(0);
    expect(server.nth(0).headers['x-csrf-token']).toBeUndefined();
  });

  it('상태 변경 요청 전에 Fetch로 토큰을 취득해 싣는다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' });

    const fetchCall = server.nth(0);
    expect(fetchCall.method).toBe('GET');
    expect(fetchCall.path).toBe(CSRF_DISCOVERY_PATH);
    expect(fetchCall.headers['x-csrf-token']).toBe('Fetch');
    expect(fetchCall.headers.accept).toBe('application/atomsvc+xml');
    expect(server.nth(1).headers['x-csrf-token']).toBe('TOKEN-1');
    expect(client.csrfToken).toBe('TOKEN-1');
  });

  it('취득한 토큰을 캐시해 재취득하지 않는다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' });
    await client.request({ method: 'PUT', path: OBJECT_PATH, body: '<x/>' });
    await client.request({ method: 'DELETE', path: OBJECT_PATH });

    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(1);
    expect(server.countPath(OBJECT_PATH)).toBe(3);
  });

  it('403 + x-csrf-token: Required면 한 번 재취득하고 한 번만 재시도한다', async () => {
    let issued = 0;
    let posts = 0;
    const sentTokens: (string | undefined)[] = [];
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) {
        issued += 1;
        return respondDiscovery(res, `TOKEN-${issued}`);
      }
      posts += 1;
      sentTokens.push(req.headers['x-csrf-token'] as string | undefined);
      if (posts === 1) {
        res.statusCode = 403;
        res.setHeader('x-csrf-token', 'Required');
        res.end('CSRF token validation failed');
        return;
      }
      res.statusCode = 200;
      res.end('applied');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    const response = await client.request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' });

    expect(response.status).toBe(200);
    expect(response.body).toBe('applied');
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(2);
    expect(posts).toBe(2);
    expect(sentTokens).toEqual(['TOKEN-1', 'TOKEN-2']);
    expect(client.csrfToken).toBe('TOKEN-2');
  });

  it('재시도 후에도 거부되면 무한 재시도 없이 csrf 오류로 끝낸다', async () => {
    let issued = 0;
    let posts = 0;
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) {
        issued += 1;
        return respondDiscovery(res, `TOKEN-${issued}`);
      }
      posts += 1;
      res.statusCode = 403;
      res.setHeader('x-csrf-token', 'Required');
      res.end('CSRF token validation failed');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client
      .request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('csrf');
    expect((error as AdtError).status).toBe(403);
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(2);
    expect(posts).toBe(2);
  });

  it('CSRF와 무관한 403은 재취득하지 않고 그대로 올린다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 403;
      res.end('<exc:exception><type id="ExceptionAuthorizationFailure"/><message lang="EN">no auth</message></exc:exception>');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client
      .request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' })
      .catch((e: unknown) => e);

    expect((error as AdtError).kind).toBe('forbidden');
    expect((error as AdtError).adtType).toBe('ExceptionAuthorizationFailure');
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(1);
  });

  it('토큰 헤더 없는 discovery 응답은 protocol 오류다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('<app:service/>');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client.ensureCsrfToken().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('protocol');
  });
});

describe('AdtClient — 전송 계층으로 넘기는 옵션', () => {
  it('rejectUnauthorized를 그대로 전달한다', async () => {
    const strict = spyTransport();
    await new AdtClient(offlineConfig({ rejectUnauthorized: true }), {
      transport: strict.transport,
    }).request({ method: 'GET', path: '/x' });
    expect(strict.calls[0]?.rejectUnauthorized).toBe(true);

    const lax = spyTransport();
    await new AdtClient(offlineConfig({ rejectUnauthorized: false }), {
      transport: lax.transport,
    }).request({ method: 'GET', path: '/x' });
    expect(lax.calls[0]?.rejectUnauthorized).toBe(false);
  });

  it('타임아웃 3종을 선택자에 따라 적용한다', async () => {
    const spy = spyTransport({ headers: { 'x-csrf-token': 'TOKEN-1' } });
    const client = new AdtClient(offlineConfig(), { transport: spy.transport });

    await client.request({ method: 'GET', path: '/x' });
    await client.request({ method: 'GET', path: '/x', timeout: 'long' });
    await client.request({ method: 'GET', path: '/x', timeout: 1234 });
    await client.ensureCsrfToken();

    expect(spy.calls[0]?.timeoutMs).toBe(3000);
    expect(spy.calls[1]?.timeoutMs).toBe(6000);
    expect(spy.calls[2]?.timeoutMs).toBe(1234);
    expect(spy.calls[3]?.timeoutMs).toBe(3000);
    expect(spy.calls[3]?.url).toContain(CSRF_DISCOVERY_PATH);
  });

  it('Authorization·Cookie는 호출자 헤더로 덮어쓸 수 없다', async () => {
    const spy = spyTransport();
    const client = new AdtClient(offlineConfig(), { transport: spy.transport });

    await client.request({
      method: 'GET',
      path: '/x',
      headers: { Authorization: 'Basic spoofed', 'X-Custom': 'kept' },
    });

    expect(spy.calls[0]?.headers['Authorization']).toContain('Basic ');
    expect(spy.calls[0]?.headers['Authorization']).not.toBe('Basic spoofed');
    expect(spy.calls[0]?.headers['X-Custom']).toBe('kept');
  });
});
