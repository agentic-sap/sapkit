import {
  AdtClient,
  CSRF_DISCOVERY_FALLBACK_PATH,
  CSRF_DISCOVERY_PATH,
  CSRF_RETRY_COUNT,
  CSRF_RETRY_DELAY_MS,
} from '../client';
import { AdtError } from '../errors';
import { HttpTransportError } from '../http';
import type { HttpRequest, HttpResponse, HttpTransport } from '../http';
import { offlineConfig, startTestServer, testConfig } from './testServer';
import type { Responder, TestServer } from './testServer';

const OBJECT_PATH = '/sap/bc/adt/oo/classes/zcl_dummy/source/main';

/** 시험이 재시도 지연을 실시간으로 기다리지 않게 한다. */
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

  it('클라이언트를 X-SAP-Client 헤더로 싣고 질의 인자로는 붙이지 않는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH, params: { version: 'active' } });

    const request = server.nth(0);
    expect(request.headers['x-sap-client']).toBe('100');
    expect(request.query.get('version')).toBe('active');
    expect(request.query.get('sap-client')).toBeNull();
  });

  it('언어가 설정돼 있어도 sap-language를 싣지 않는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl, { language: 'DE' }));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    const request = server.nth(0);
    expect(request.query.get('sap-language')).toBeNull();
    expect(request.url).not.toContain('sap-language');
    expect(request.headers['sap-language']).toBeUndefined();
  });

  it('클라이언트가 없으면 X-SAP-Client 헤더도 없다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl, { client: undefined }));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers['x-sap-client']).toBeUndefined();
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
    // 실제 전송 경로가 원인 오류의 code를 그대로 실어 온다 — 문구 정규화가 읽는 값이다.
    const transportError = (error as AdtError).cause;
    expect(transportError).toBeInstanceOf(HttpTransportError);
    expect(typeof ((transportError as HttpTransportError).cause as { code?: unknown }).code).toBe(
      'string',
    );
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

  it('서버가 다른 클라이언트의 sap-usercontext를 돌려줘도 설정값으로 고정한다', async () => {
    // SAP이 X-SAP-Client를 무시하고 시스템 기본 클라이언트(001)를 심는 상황.
    const server = await serve((_req, res) => {
      res.setHeader('set-cookie', [
        'SAP_SESSIONID_X01_001=sess-1; path=/',
        'sap-usercontext=sap-client=001; path=/',
      ]);
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });
    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(client.cookieHeader()).toContain('sap-usercontext=sap-client=100');
    expect(client.cookieHeader()).not.toContain('sap-client=001');
    expect(server.nth(1).headers.cookie).toContain('sap-usercontext=sap-client=100');
    expect(server.nth(1).headers.cookie).toContain('SAP_SESSIONID_X01_001=sess-1');
  });

  it('클라이언트가 없으면 sap-usercontext를 손대지 않는다', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('set-cookie', ['sap-usercontext=sap-client=001; path=/']);
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl, { client: undefined }));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(client.cookieHeader()).toBe('sap-usercontext=sap-client=001');
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
  it('stateless 요청에는 동반 헤더 3종을 하나도 붙이지 않는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(client.sessionType).toBe('stateless');
    expect(server.nth(0).headers['x-sap-adt-sessiontype']).toBeUndefined();
    expect(server.nth(0).headers['sap-adt-request-id']).toBeUndefined();
    expect(server.nth(0).headers['x-sap-adt-profiling']).toBeUndefined();
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

  it('stateful 요청에 profiling과 요청마다 새로운 request-id를 함께 싣는다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    client.setSessionType('stateful');
    await client.request({ method: 'GET', path: OBJECT_PATH });
    await client.request({ method: 'GET', path: OBJECT_PATH });

    const first = server.nth(0).headers;
    const second = server.nth(1).headers;
    expect(first['x-sap-adt-profiling']).toBe('server-time');
    expect(second['x-sap-adt-profiling']).toBe('server-time');
    expect(first['sap-adt-request-id']).toBeTruthy();
    expect(second['sap-adt-request-id']).toBeTruthy();
    expect(second['sap-adt-request-id']).not.toBe(first['sap-adt-request-id']);
  });

  it('request-id 생성기를 주입하면 그 값을 쓴다', async () => {
    const server = await serve((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    let issued = 0;
    const client = new AdtClient(testConfig(server.baseUrl), {
      newRequestId: () => `req-${(issued += 1)}`,
    });

    client.setSessionType('stateful');
    await client.request({ method: 'GET', path: OBJECT_PATH });
    await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(server.nth(0).headers['sap-adt-request-id']).toBe('req-1');
    expect(server.nth(1).headers['sap-adt-request-id']).toBe('req-2');
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
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const error = await client.ensureCsrfToken().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('protocol');
  });

  it('재시도 횟수·지연은 구 접속 계층과 같은 값이다', () => {
    expect(CSRF_RETRY_COUNT).toBe(3);
    expect(CSRF_RETRY_DELAY_MS).toBe(1000);
  });

  it('primary discovery가 없는 시스템에서는 폴백 경로로 토큰을 얻는다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      if (req.path === CSRF_DISCOVERY_FALLBACK_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 200;
      res.end('ok');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    await client.request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' });

    expect(client.csrfToken).toBe('TOKEN-1');
    // primary는 유한 횟수만 되민 뒤 폴백으로 넘어간다.
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(CSRF_RETRY_COUNT + 1);
    expect(server.countPath(CSRF_DISCOVERY_FALLBACK_PATH)).toBe(1);
    expect(server.countPath(OBJECT_PATH)).toBe(1);
    expect(server.nth(server.requests.length - 1).headers['x-csrf-token']).toBe('TOKEN-1');
  });

  it('취득 경로가 모두 죽으면 토큰 없이 보내고 403에서 회복한다', async () => {
    let discoveryAlive = false;
    let posts = 0;
    const sentTokens: (string | undefined)[] = [];
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH || req.path === CSRF_DISCOVERY_FALLBACK_PATH) {
        if (!discoveryAlive) {
          res.statusCode = 500;
          res.end('discovery down');
          return;
        }
        return respondDiscovery(res, 'TOKEN-late');
      }
      posts += 1;
      sentTokens.push(req.headers['x-csrf-token'] as string | undefined);
      if (posts === 1) {
        // 토큰 없이 온 본 요청을 거부하면서 discovery가 되살아난다.
        discoveryAlive = true;
        res.statusCode = 403;
        res.setHeader('x-csrf-token', 'Required');
        res.end('CSRF token validation failed');
        return;
      }
      res.statusCode = 200;
      res.end('applied');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const response = await client.request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' });

    expect(response.body).toBe('applied');
    // 첫 발송에는 토큰이 없었고, 재취득 뒤 딱 한 번만 되밀었다.
    expect(sentTokens).toEqual([undefined, 'TOKEN-late']);
    expect(posts).toBe(2);
    expect(posts).toBeLessThanOrEqual(2);
  });

  it('취득도 본 요청도 끝내 실패하면 재시도가 유한하게 끝난다', async () => {
    let posts = 0;
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH || req.path === CSRF_DISCOVERY_FALLBACK_PATH) {
        res.statusCode = 500;
        res.end('discovery down');
        return;
      }
      posts += 1;
      res.statusCode = 403;
      res.setHeader('x-csrf-token', 'Required');
      res.end('CSRF token validation failed');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const error = await client
      .request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' })
      .catch((e: unknown) => e);

    // 재취득이 끝내 실패하면 그 실패가 올라온다 — 본 요청은 1회만 나갔다.
    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('server');
    expect(posts).toBe(1);
    const attempts = CSRF_RETRY_COUNT + 1;
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(attempts * 2);
    expect(server.countPath(CSRF_DISCOVERY_FALLBACK_PATH)).toBe(attempts * 2);
  });

  it('PATCH는 사전 취득을 하지 않고 403에서만 회복한다', async () => {
    let issued = 0;
    let patches = 0;
    const sentTokens: (string | undefined)[] = [];
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) {
        issued += 1;
        return respondDiscovery(res, `TOKEN-${issued}`);
      }
      patches += 1;
      sentTokens.push(req.headers['x-csrf-token'] as string | undefined);
      if (patches === 1) {
        res.statusCode = 403;
        res.setHeader('x-csrf-token', 'Required');
        res.end('CSRF token validation failed');
        return;
      }
      res.statusCode = 200;
      res.end('patched');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const response = await client.request({ method: 'PATCH', path: OBJECT_PATH, body: '<x/>' });

    expect(response.body).toBe('patched');
    // 첫 PATCH 앞에는 discovery가 없었다.
    expect(server.nth(0).method).toBe('PATCH');
    expect(sentTokens).toEqual([undefined, 'TOKEN-1']);
    expect(patches).toBe(2);
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(1);
  });
});

describe('AdtClient — GET 401 회복', () => {
  it('401이 심어 준 쿠키를 실어 한 번 되민다', async () => {
    let gets = 0;
    const server = await serve((_req, res) => {
      gets += 1;
      if (gets === 1) {
        res.setHeader('set-cookie', ['SAP_SESSIONID_X01_100=sess-1; path=/']);
        res.statusCode = 401;
        res.end('unauthorized');
        return;
      }
      res.statusCode = 200;
      res.end('source');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const response = await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(response.body).toBe('source');
    expect(gets).toBe(2);
    expect(server.nth(0).headers.cookie).toBeUndefined();
    expect(server.nth(1).headers.cookie).toContain('SAP_SESSIONID_X01_100=sess-1');
    // 쿠키가 이미 있었으므로 discovery는 부르지 않는다.
    expect(server.countPath(CSRF_DISCOVERY_PATH)).toBe(0);
  });

  it('쿠키가 없으면 CSRF fetch로 쿠키를 얻은 뒤 되민다', async () => {
    let gets = 0;
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      gets += 1;
      if (gets === 1) {
        res.statusCode = 401;
        res.end('unauthorized');
        return;
      }
      res.statusCode = 200;
      res.end('source');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const response = await client.request({ method: 'GET', path: OBJECT_PATH });

    expect(response.body).toBe('source');
    expect(server.nth(0).path).toBe(OBJECT_PATH);
    expect(server.nth(1).path).toBe(CSRF_DISCOVERY_PATH);
    expect(server.nth(2).headers.cookie).toContain('SAP_SESSIONID_X01_100=sess-1');
    expect(gets).toBe(2);
  });

  it('되민 요청도 401이면 auth 오류로 끝나고 세 번째 시도는 없다', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('set-cookie', ['SAP_SESSIONID_X01_100=sess-1; path=/']);
      res.statusCode = 401;
      res.end('unauthorized');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const error = await client
      .request({ method: 'GET', path: OBJECT_PATH })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('auth');
    expect(server.countPath(OBJECT_PATH)).toBe(2);
  });

  it('쿠키를 끝내 못 얻으면 되밀지 않고 원래 401을 올린다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH || req.path === CSRF_DISCOVERY_FALLBACK_PATH) {
        res.statusCode = 500;
        res.end('discovery down');
        return;
      }
      res.statusCode = 401;
      res.end('unauthorized');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const error = await client
      .request({ method: 'GET', path: OBJECT_PATH })
      .catch((e: unknown) => e);

    expect((error as AdtError).kind).toBe('auth');
    expect(server.countPath(OBJECT_PATH)).toBe(1);
  });

  it('GET이 아닌 401은 되밀지 않는다', async () => {
    const server = await serve((req, res) => {
      if (req.path === CSRF_DISCOVERY_PATH) return respondDiscovery(res, 'TOKEN-1');
      res.statusCode = 401;
      res.end('unauthorized');
    });
    const client = new AdtClient(testConfig(server.baseUrl), NO_SLEEP);

    const error = await client
      .request({ method: 'POST', path: OBJECT_PATH, body: '<x/>' })
      .catch((e: unknown) => e);

    expect((error as AdtError).kind).toBe('auth');
    expect(server.countPath(OBJECT_PATH)).toBe(1);
  });
});

describe('AdtClient — 전송 실패 문구', () => {
  const CERT_CODES = [
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID',
  ];

  function certFailingTransport(code: string): HttpTransport {
    return async () => {
      const cause = Object.assign(new Error('self-signed certificate'), { code });
      throw new HttpTransportError('network', 'GET https://sap.example.test/x 전송 실패', cause);
    };
  }

  it.each(CERT_CODES)('인증서 오류 %s를 지목 가능한 문구로 정규화한다', async (code) => {
    const client = new AdtClient(offlineConfig({ rejectUnauthorized: true }), {
      transport: certFailingTransport(code),
    });

    const error = await client.request({ method: 'GET', path: '/x' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('network');
    expect((error as AdtError).message).toContain(code);
    expect((error as AdtError).message).toContain('TLS_REJECT_UNAUTHORIZED=0');
  });

  it('인증서와 무관한 전송 실패에는 그 문구를 덧붙이지 않는다', async () => {
    const transport: HttpTransport = async () => {
      const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      throw new HttpTransportError('network', 'GET https://sap.example.test/x 전송 실패', cause);
    };
    const client = new AdtClient(offlineConfig(), { transport });

    const error = await client.request({ method: 'GET', path: '/x' }).catch((e: unknown) => e);

    expect((error as AdtError).message).not.toContain('TLS_REJECT_UNAUTHORIZED');
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
