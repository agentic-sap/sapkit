/**
 * odata 통로 — 요청 조립과 오류 정규화.
 *
 * 대조 원본은 `engine/src/lib/odataRfc.ts`다. 여기서 못박는 것:
 * - CSRF 2단 악수(`GET {service}/$metadata`, `X-CSRF-Token: Fetch`)와 토큰 캐시
 * - FunctionImport URL의 OData v2 문자열 리터럴 인코딩과 인자 순서
 * - `sap-client` 질의 인자 부착
 * - 403 + `x-csrf-token: required`에서 **한 번만** 되밀기
 * - `d` 봉투 두 형태(이름 감싼 형/직결형)
 * - subrc != 0을 구조화된 `sap` 오류로 정규화
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { RfcError } from '../errors';
import { HttpTransportError } from '../../adt/http';
import { createODataChannel } from '../odata';
import {
  EXPECTED_AUTHORIZATION,
  SERVICE_URL,
  csrfIssued,
  fakeConnection,
  functionImportOk,
  header,
  nth,
  rfcEnv,
  scripted,
} from './support';

function channelWith(steps: Parameters<typeof scripted>[0], env = rfcEnv()) {
  const spy = scripted(steps);
  const channel = createODataChannel({
    connection: fakeConnection(),
    env,
    transport: spy.transport,
  });
  return { channel, spy };
}

const DISPATCH_OK = functionImportOk({
  Dispatch: { EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{"CUA":[]}' },
});

describe('odata 통로 — CSRF 취득', () => {
  it('$metadata를 Fetch 헤더로 긁어온다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'SAPMV45A' });

    const fetchCall = nth(spy.calls, 0);
    expect(fetchCall.method).toBe('GET');
    expect(fetchCall.url).toBe(`${SERVICE_URL}/$metadata?sap-client=100`);
    expect(header(fetchCall, 'x-csrf-token')).toBe('Fetch');
    expect(header(fetchCall, 'accept')).toBe('application/xml');
    expect(header(fetchCall, 'authorization')).toBe(EXPECTED_AUTHORIZATION);
    expect(fetchCall.body).toBeUndefined();
  });

  it('접속 설정의 long 타임아웃과 TLS 방침을 쓴다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).timeoutMs).toBe(6000);
    expect(nth(spy.calls, 0).rejectUnauthorized).toBe(false);
  });

  it('토큰을 캐시한다 — 두 번째 호출은 $metadata를 다시 치지 않는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK, DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});
    await channel.callDispatch('CUA_FETCH', {});
    expect(spy.calls.filter((call) => call.url.includes('$metadata'))).toHaveLength(1);
  });

  it('TTL이 지나면 다시 취득한다', async () => {
    const spy = scripted([csrfIssued('tok-1'), DISPATCH_OK, csrfIssued('tok-2'), DISPATCH_OK]);
    let clock = 1_000_000;
    const channel = createODataChannel({
      connection: fakeConnection(),
      env: rfcEnv({ SAP_RFC_ODATA_CSRF_TTL_SEC: '600' }),
      transport: spy.transport,
      now: () => clock,
    });

    await channel.callDispatch('CUA_FETCH', {});
    clock += 601_000;
    await channel.callDispatch('CUA_FETCH', {});

    expect(spy.calls.filter((call) => call.url.includes('$metadata'))).toHaveLength(2);
    expect(header(nth(spy.calls, 3), 'x-csrf-token')).toBe('tok-2');
  });

  it('TTL 하한은 60초다 — 0이나 음수를 줘도 그 아래로 내려가지 않는다', async () => {
    const spy = scripted([csrfIssued('tok-1'), DISPATCH_OK, DISPATCH_OK]);
    let clock = 0;
    const channel = createODataChannel({
      connection: fakeConnection(),
      env: rfcEnv({ SAP_RFC_ODATA_CSRF_TTL_SEC: '0' }),
      transport: spy.transport,
      now: () => clock,
    });
    await channel.callDispatch('CUA_FETCH', {});
    clock += 59_000;
    await channel.callDispatch('CUA_FETCH', {});
    expect(spy.calls.filter((call) => call.url.includes('$metadata'))).toHaveLength(1);
  });

  it('토큰 헤더가 없으면 protocol 오류', async () => {
    const { channel } = channelWith([{ status: 200, headers: {}, body: '<edmx:Edmx/>' }]);
    const error = await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RfcError);
    expect((error as RfcError).kind).toBe('protocol');
  });

  it('토큰 자리에 required가 오면 발급이 아니므로 protocol 오류', async () => {
    const { channel } = channelWith([
      { status: 200, headers: { 'x-csrf-token': 'Required' }, body: '' },
    ]);
    const error = await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e);
    expect((error as RfcError).kind).toBe('protocol');
  });

  it('$metadata가 404면 not-found 오류로 정규화된다', async () => {
    const { channel } = channelWith([{ status: 404, body: 'no service' }]);
    const error = await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e);
    expect((error as RfcError).kind).toBe('not-found');
    expect((error as RfcError).status).toBe(404);
  });
});

describe('odata 통로 — FunctionImport 요청 조립', () => {
  it('Dispatch URL·인자 순서·문자열 리터럴 인코딩이 구 엔진과 같다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'SAPMV45A' });

    const post = nth(spy.calls, 1);
    expect(post.method).toBe('POST');
    expect(post.url).toBe(
      `${SERVICE_URL}/Dispatch` +
        `?IV_ACTION='CUA_FETCH'` +
        `&IV_PARAMS='%7B%22program%22%3A%22SAPMV45A%22%7D'` +
        `&sap-client=100`,
    );
  });

  it('작은따옴표는 OData v2 규칙대로 두 배가 된다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { owner: "O'BRIEN" });
    expect(nth(spy.calls, 1).url).toContain("O''BRIEN");
  });

  it('params가 없으면 빈 객체로 직렬화한다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH');
    expect(nth(spy.calls, 1).url).toContain("IV_PARAMS='%7B%7D'");
  });

  it('POST 헤더에 토큰·쿠키·Accept가 실린다', async () => {
    const { channel, spy } = channelWith([csrfIssued('tok-9'), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});

    const post = nth(spy.calls, 1);
    expect(header(post, 'x-csrf-token')).toBe('tok-9');
    expect(header(post, 'accept')).toBe('application/json');
    expect(header(post, 'authorization')).toBe(EXPECTED_AUTHORIZATION);
    expect(header(post, 'cookie')).toBe(
      'SAP_SESSIONID_X01_100=sess-1; sap-usercontext=sap-client=100',
    );
  });

  it('본문 없는 POST다 — 길이 0을 명시한다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 1).body).toBe('');
  });

  it('서비스 URL의 후행 슬래시를 정규화한다', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      rfcEnv({ SAP_RFC_ODATA_SERVICE_URL: `${SERVICE_URL}///` }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).url).toBe(`${SERVICE_URL}/$metadata?sap-client=100`);
  });

  it('클라이언트가 없으면 sap-client를 붙이지 않는다', async () => {
    const spy = scripted([csrfIssued(), DISPATCH_OK]);
    const channel = createODataChannel({
      connection: fakeConnection({ client: undefined }),
      env: rfcEnv(),
      transport: spy.transport,
    });
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).url).toBe(`${SERVICE_URL}/$metadata`);
    expect(nth(spy.calls, 1).url).not.toContain('sap-client');
  });

  it('SAP_RFC_ODATA_SERVICE_URL이 없으면 config 오류로 통로가 서지 않는다', () => {
    expect(() =>
      createODataChannel({
        connection: fakeConnection(),
        env: {},
        transport: scripted([]).transport,
      }),
    ).toThrow(RfcError);
  });
});

describe('odata 통로 — Textpool', () => {
  const TEXTPOOL_OK = functionImportOk({
    EV_SUBRC: 0,
    EV_MESSAGE: '',
    EV_RESULT: '[{"ID":"R","KEY":"","ENTRY":"Title","LENGTH":5}]',
  });

  it('인자 4종을 순서대로 싣고 빈 값은 빈 문자열로 채운다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    await channel.callTextpool('READ', { program: 'ZTEST' });

    expect(nth(spy.calls, 1).url).toBe(
      `${SERVICE_URL}/Textpool` +
        `?IV_ACTION='READ'` +
        `&IV_PROGRAM='ZTEST'` +
        `&IV_LANGUAGE=''` +
        `&IV_TEXTPOOL_JSON=''` +
        `&sap-client=100`,
    );
  });

  it('주어진 언어와 페이로드를 그대로 싣는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    await channel.callTextpool('WRITE', {
      program: 'ZTEST',
      language: 'EN',
      textpoolJson: '[]',
    });
    const url = nth(spy.calls, 1).url;
    expect(url).toContain("IV_LANGUAGE='EN'");
    expect(url).toContain("IV_TEXTPOOL_JSON='%5B%5D'");
  });

  it('READ 결과를 배열로 되돌린다', async () => {
    const { channel } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    const result = await channel.callTextpool('READ', { program: 'ZTEST' });
    expect(result.subrc).toBe(0);
    expect(result.result).toEqual([{ ID: 'R', KEY: '', ENTRY: 'Title', LENGTH: 5 }]);
  });

  it('EV_RESULT가 JSON이 아니면 빈 배열로 떨어진다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: 'not json' }),
    ]);
    const result = await channel.callTextpool('READ', { program: 'ZTEST' });
    expect(result.result).toEqual([]);
  });

  it('subrc != 0이면 ZMCP_ADT_TEXTPOOL 오류로 정규화한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 8, EV_MESSAGE: 'program not found', EV_RESULT: '[]' }),
    ]);
    const error = (await channel
      .callTextpool('READ', { program: 'ZTEST' })
      .catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('sap');
    expect(error.subrc).toBe(8);
    expect(error.message).toBe(
      'ZMCP_ADT_TEXTPOOL error (action=READ, subrc=8): program not found',
    );
  });
});

describe('odata 통로 — 응답 봉투와 SAP 오류', () => {
  it('이름으로 감싼 봉투(Form A)를 푼다', async () => {
    const { channel } = channelWith([csrfIssued(), DISPATCH_OK]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toEqual({ CUA: [] });
    expect(result.subrc).toBe(0);
  });

  it('직결 봉투(Form B)도 푼다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{"FLOW_LOGIC":[]}' }),
    ]);
    const result = await channel.callDispatch('DYNPRO_READ', {});
    expect(result.result).toEqual({ FLOW_LOGIC: [] });
  });

  it('d 봉투가 없으면 protocol 오류', async () => {
    const { channel } = channelWith([csrfIssued(), { status: 200, body: '{"other":1}' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
  });

  it('본문이 JSON이 아니면 protocol 오류', async () => {
    const { channel } = channelWith([csrfIssued(), { status: 200, body: '<html>oops</html>' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
  });

  it('EV_RESULT가 JSON이 아니면 빈 객체로 떨어진다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: 'not json' }),
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toEqual({});
  });

  it('subrc != 0은 sap 오류이고 subrc·메시지·action을 보존한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({
        Dispatch: { EV_SUBRC: 4, EV_MESSAGE: 'unknown action', EV_RESULT: '{}' },
      }),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('sap');
    expect(error.backend).toBe('odata');
    expect(error.subrc).toBe(4);
    expect(error.sapMessage).toBe('unknown action');
    expect(error.action).toBe('CUA_FETCH');
    expect(error.message).toBe(
      'ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): unknown action',
    );
  });
});

describe('odata 통로 — CSRF 재시도와 HTTP 오류', () => {
  const CSRF_REJECTED = {
    status: 403,
    headers: { 'x-csrf-token': 'Required' },
    body: 'CSRF token validation failed',
  };

  it('403 + required면 토큰을 다시 받아 한 번 되민다', async () => {
    const { channel, spy } = channelWith([
      csrfIssued('tok-1'),
      CSRF_REJECTED,
      csrfIssued('tok-2'),
      DISPATCH_OK,
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.subrc).toBe(0);
    expect(spy.calls).toHaveLength(4);
    expect(header(nth(spy.calls, 3), 'x-csrf-token')).toBe('tok-2');
  });

  it('되민 뒤에도 403이면 csrf 오류로 끝난다 — 무한 재귀가 없다', async () => {
    const { channel, spy } = channelWith([
      csrfIssued('tok-1'),
      CSRF_REJECTED,
      csrfIssued('tok-2'),
      CSRF_REJECTED,
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('csrf');
    expect(spy.calls).toHaveLength(4);
  });

  it('403인데 재취득 신호가 없으면 forbidden으로 남는다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      { status: 403, headers: {}, body: 'no authority for S_SERVICE' },
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('forbidden');
    expect(error.status).toBe(403);
  });

  it.each([
    [401, 'auth'],
    [404, 'not-found'],
    [500, 'server'],
    [418, 'http'],
  ] as const)('HTTP %i를 %s로 정규화한다', async (status, kind) => {
    const { channel } = channelWith([csrfIssued(), { status, body: 'boom' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it('전송 타임아웃을 timeout으로 정규화한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      new HttpTransportError('timeout', '시간이 다 됐다'),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('timeout');
  });

  it('연결 실패를 network으로 정규화한다', async () => {
    const { channel } = channelWith([new HttpTransportError('network', '접속 실패')]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('network');
  });
});

describe('odata 통로 — 내장 전송으로 실제 왕복', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  it('in-process 서버 상대로 CSRF 악수 + Dispatch를 완주한다', async () => {
    const seen: { method: string; url: string; contentLength?: string }[] = [];
    server = http.createServer((req, res) => {
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        contentLength: req.headers['content-length'],
      });
      if ((req.url ?? '').includes('$metadata')) {
        res.setHeader('x-csrf-token', 'live-token');
        res.setHeader('set-cookie', ['SAP_SESSIONID_X01_100=live; path=/']);
        res.statusCode = 200;
        res.end('<edmx:Edmx/>');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({ d: { Dispatch: { EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{"ok":1}' } } }),
      );
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const channel = createODataChannel({
      connection: fakeConnection(),
      env: rfcEnv({ SAP_RFC_ODATA_SERVICE_URL: `http://127.0.0.1:${port}/sap/opu/odata/sap/ZSRV` }),
    });

    const result = await channel.callDispatch('CUA_FETCH', { program: 'ZTEST' });
    expect(result.result).toEqual({ ok: 1 });
    expect(seen).toHaveLength(2);
    // 본문 없는 POST라도 길이를 명시한다 — chunked로 나가지 않는다.
    expect(seen[1]?.contentLength).toBe('0');
  });
});
