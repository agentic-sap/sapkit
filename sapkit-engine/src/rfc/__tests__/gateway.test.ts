/**
 * gateway 통로 — 통로 생성 계약과 요청 조립.
 *
 * 대조 원본은 `engine/src/lib/gatewayRfc.ts`와 그 시험
 * `engine/src/__tests__/lib/gatewayRfc.test.ts`다. 구 시험이 "중계기가 구현해야
 * 하는 와이어 계약"을 못박아 둔 자리라, 여기서 같은 것들을 같은 값으로 다시
 * 못박는다. 실 디스패치(중계기·SAP 접속)는 이 판에서 미룬다 — **가짜 전송**으로
 * 조립 결과만 붙잡아 대조한다.
 *
 * 여기서 못박는 것:
 * - 필수 설정(`SAP_RFC_GATEWAY_URL`)이 없으면 **통로 생성 시점**에 `config` 오류 (D12)
 * - `ConnectionConfig.timeouts.long`이 실제로 나가고, 60000ms면 구 하드코딩과 같다 (D11)
 * - 오류 종류가 구별된다 (config·auth·forbidden·not-found·server·http·protocol·
 *   timeout·network·sap)
 * - 주소·전문·헤더가 구 엔진과 같은 형태다
 */

import { HttpTransportError } from '../../adt/http';
import type { HttpResponse } from '../../adt/http';
import { RfcError } from '../errors';
import { createGatewayChannel } from '../gateway';
import { fakeConnection, header, nth, scripted } from './support';
import type { ConnectionConfig } from '../../contracts';

/** 명백히 가짜인 중계기 주소. */
const GATEWAY_URL = 'https://rfc-gw.example.test:8443';
const TOKEN = 'not-a-real-gateway-token';

function gatewayEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return { SAP_RFC_GATEWAY_URL: GATEWAY_URL, SAP_RFC_GATEWAY_TOKEN: TOKEN, ...overrides };
}

/** 중계기의 성공 응답 — `result`는 이미 풀린 값이다(문자열이 아니다). */
function gatewayOk(body: Record<string, unknown>): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const DISPATCH_OK = gatewayOk({ result: { CUA: [] }, subrc: 0, message: '' });
const TEXTPOOL_OK = gatewayOk({ result: [], subrc: 0, message: '' });

function channelWith(
  steps: Parameters<typeof scripted>[0],
  env = gatewayEnv(),
  connection: ConnectionConfig = fakeConnection(),
) {
  const spy = scripted(steps);
  const channel = createGatewayChannel({ connection, env, transport: spy.transport });
  return { channel, spy };
}

describe('gateway 통로 — 통로 생성 계약 (D12)', () => {
  it('SAP_RFC_GATEWAY_URL이 없으면 생성 시점에 config 오류로 통로가 서지 않는다', () => {
    const spy = scripted([DISPATCH_OK]);
    const error = (() => {
      try {
        createGatewayChannel({
          connection: fakeConnection(),
          env: {},
          transport: spy.transport,
        });
        return null;
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(RfcError);
    expect((error as RfcError).kind).toBe('config');
    expect((error as RfcError).backend).toBe('gateway');
    // 요청을 보내기도 전에 막힌다 — 실패가 요청 경로에서 터지지 않는다.
    expect(spy.calls).toHaveLength(0);
  });

  it('공백뿐인 값도 없는 것으로 친다', () => {
    expect(() =>
      createGatewayChannel({
        connection: fakeConnection(),
        env: { SAP_RFC_GATEWAY_URL: '   ' },
        transport: scripted([]).transport,
      }),
    ).toThrow(RfcError);
  });

  it('오류 문구가 키 이름과 통로 이름을 짚는다 — 구 문구를 승계한다', () => {
    const error = (() => {
      try {
        createGatewayChannel({ connection: fakeConnection(), env: {} });
        return null;
      } catch (e: unknown) {
        return e as RfcError;
      }
    })();
    expect(error?.message).toContain(
      'SAP_RFC_GATEWAY_URL is required for SAP_RFC_BACKEND=gateway but not set in sap.env',
    );
  });

  it('토큰은 선택이다 — 없어도 통로는 선다', () => {
    expect(() =>
      createGatewayChannel({
        connection: fakeConnection(),
        env: { SAP_RFC_GATEWAY_URL: GATEWAY_URL },
        transport: scripted([]).transport,
      }),
    ).not.toThrow();
  });

  it('통로 이름은 gateway다', () => {
    const { channel } = channelWith([DISPATCH_OK]);
    expect(channel.backend).toBe('gateway');
  });
});

describe('gateway 통로 — Dispatch 요청 조립', () => {
  it('고정 경로 /rfc/dispatch로 POST 한다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'Z_FOO' });

    expect(spy.calls).toHaveLength(1);
    const post = nth(spy.calls, 0);
    expect(post.method).toBe('POST');
    expect(post.url).toBe(`${GATEWAY_URL}/rfc/dispatch`);
  });

  it('주소의 후행 슬래시를 잘라낸다', async () => {
    const { channel, spy } = channelWith(
      [DISPATCH_OK],
      gatewayEnv({ SAP_RFC_GATEWAY_URL: `${GATEWAY_URL}///` }),
    );
    await channel.callDispatch('PING', {});
    expect(nth(spy.calls, 0).url).toBe(`${GATEWAY_URL}/rfc/dispatch`);
  });

  it('본문은 action + params 한 벌이다 — 구 엔진과 같은 바이트', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('DYNPRO_READ', { program: 'Z_FOO', screen: '0100' });

    expect(nth(spy.calls, 0).body).toBe(
      JSON.stringify({
        action: 'DYNPRO_READ',
        params: { program: 'Z_FOO', screen: '0100' },
      }),
    );
  });

  it('params를 생략하면 빈 객체로 싣는다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('PING');
    expect(nth(spy.calls, 0).body).toBe(JSON.stringify({ action: 'PING', params: {} }));
  });

  it('Content-Type·Accept가 둘 다 application/json이다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('PING', {});
    expect(header(nth(spy.calls, 0), 'content-type')).toBe('application/json');
    expect(header(nth(spy.calls, 0), 'accept')).toBe('application/json');
  });

  it('SAP_RFC_GATEWAY_TOKEN이 있으면 Bearer로 싣는다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('PING', {});
    expect(header(nth(spy.calls, 0), 'authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('토큰이 없으면 Authorization을 아예 싣지 않는다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK], {
      SAP_RFC_GATEWAY_URL: GATEWAY_URL,
    });
    await channel.callDispatch('PING', {});
    expect(header(nth(spy.calls, 0), 'authorization')).toBeUndefined();
  });

  it('SAP 자격증명을 X-SAP-* 헤더로 통과시킨다 — 감사 로그에 실제 개발자가 남는다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('PING', {});

    const post = nth(spy.calls, 0);
    expect(header(post, 'x-sap-user')).toBe('TESTUSER');
    expect(header(post, 'x-sap-password')).toBe('not-a-real-secret');
    expect(header(post, 'x-sap-client')).toBe('100');
    expect(header(post, 'x-sap-language')).toBe('EN');
  });

  it('클라이언트·언어가 없으면 그 헤더를 싣지 않는다', async () => {
    const { channel, spy } = channelWith(
      [DISPATCH_OK],
      gatewayEnv(),
      fakeConnection({ client: undefined, language: undefined }),
    );
    await channel.callDispatch('PING', {});
    expect(header(nth(spy.calls, 0), 'x-sap-client')).toBeUndefined();
    expect(header(nth(spy.calls, 0), 'x-sap-language')).toBeUndefined();
  });

  it('SAP Basic 인증 헤더는 싣지 않는다 — odata 통로와 갈리는 지점', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('PING', {});
    expect(header(nth(spy.calls, 0), 'authorization')).not.toMatch(/^Basic /);
  });
});

describe('gateway 통로 — Textpool 요청 조립', () => {
  it('고정 경로 /rfc/textpool로 인자 4종을 순서대로 싣는다', async () => {
    const { channel, spy } = channelWith([TEXTPOOL_OK]);
    await channel.callTextpool('READ', { program: 'Z_FOO', language: 'EN' });

    const post = nth(spy.calls, 0);
    expect(post.url).toBe(`${GATEWAY_URL}/rfc/textpool`);
    expect(post.body).toBe(
      JSON.stringify({
        action: 'READ',
        program: 'Z_FOO',
        language: 'EN',
        textpool_json: '',
      }),
    );
  });

  it('언어·페이로드를 생략하면 빈 문자열로 채운다', async () => {
    const { channel, spy } = channelWith([TEXTPOOL_OK]);
    await channel.callTextpool('READ', { program: 'Z_FOO' });

    const body = JSON.parse(String(nth(spy.calls, 0).body)) as Record<string, unknown>;
    expect(body.language).toBe('');
    expect(body.textpool_json).toBe('');
  });

  it('WRITE는 페이로드를 그대로 넘긴다', async () => {
    const payload = '[{"ID":"T","KEY":"R","ENTRY":"Hi","LENGTH":2}]';
    const { channel, spy } = channelWith([TEXTPOOL_OK]);
    await channel.callTextpool('WRITE', {
      program: 'Z_FOO',
      language: 'EN',
      textpoolJson: payload,
    });

    const body = JSON.parse(String(nth(spy.calls, 0).body)) as Record<string, unknown>;
    expect(body.action).toBe('WRITE');
    expect(body.textpool_json).toBe(payload);
  });

  it('READ 결과 배열을 그대로 되돌린다 — 한 번 더 파싱하지 않는다', async () => {
    const rows = [{ ID: 'T', KEY: 'R', ENTRY: 'Hi', LENGTH: 2 }];
    const { channel } = channelWith([gatewayOk({ result: rows, subrc: 0, message: '' })]);
    const result = await channel.callTextpool('READ', { program: 'Z_FOO' });
    expect(result.result).toEqual(rows);
    expect(result.subrc).toBe(0);
  });

  it('result가 없으면 빈 배열로 떨어진다', async () => {
    const { channel } = channelWith([gatewayOk({ subrc: 0, message: '' })]);
    const result = await channel.callTextpool('READ', { program: 'Z_FOO' });
    expect(result.result).toEqual([]);
  });

  it('subrc != 0이면 ZMCP_ADT_TEXTPOOL 오류로 정규화한다', async () => {
    const { channel } = channelWith([
      gatewayOk({ result: [], subrc: 8, message: 'auth denied' }),
    ]);
    const error = (await channel
      .callTextpool('READ', { program: 'Z_FOO' })
      .catch((e: unknown) => e)) as RfcError;

    expect(error.kind).toBe('sap');
    expect(error.subrc).toBe(8);
    expect(error.message).toBe(
      'ZMCP_ADT_TEXTPOOL error (action=READ, subrc=8): auth denied',
    );
  });
});

describe('gateway 통로 — 타임아웃 노브와 TLS 방침 (D11)', () => {
  it('접속 설정의 long 타임아웃이 실제로 나간다 — 60초 하드코딩이 아니다', async () => {
    const { channel, spy } = channelWith([DISPATCH_OK]);
    await channel.callDispatch('PING', {});
    expect(nth(spy.calls, 0).timeoutMs).toBe(6000);
  });

  it('long이 기본값 60000ms면 구 하드코딩과 같은 값이 나간다', async () => {
    const { channel, spy } = channelWith(
      [DISPATCH_OK],
      gatewayEnv(),
      fakeConnection({ timeouts: { default: 45_000, csrf: 15_000, long: 60_000 } }),
    );
    await channel.callDispatch('PING', {});
    expect(nth(spy.calls, 0).timeoutMs).toBe(60_000);
  });

  it('접속별 TLS 방침을 그대로 넘긴다', async () => {
    const lax = channelWith([DISPATCH_OK]);
    await lax.channel.callDispatch('PING', {});
    expect(nth(lax.spy.calls, 0).rejectUnauthorized).toBe(false);

    const strict = channelWith(
      [DISPATCH_OK],
      gatewayEnv(),
      fakeConnection({ rejectUnauthorized: true }),
    );
    await strict.channel.callDispatch('PING', {});
    expect(nth(strict.spy.calls, 0).rejectUnauthorized).toBe(true);
  });

  it('SAP_RFC_GATEWAY_TLS_VERIFY는 읽지 않는다 — 구 엔진에서도 죽은 키다', async () => {
    const { channel, spy } = channelWith(
      [DISPATCH_OK],
      gatewayEnv({ SAP_RFC_GATEWAY_TLS_VERIFY: '0' }),
      fakeConnection({ rejectUnauthorized: true }),
    );
    await channel.callDispatch('PING', {});
    // 이 키가 TLS 방침을 뒤집지 않는다. 방침의 주인은 접속 설정 하나뿐이다.
    expect(nth(spy.calls, 0).rejectUnauthorized).toBe(true);
  });
});

describe('gateway 통로 — 응답 정규화와 오류 종류', () => {
  it('성공 응답의 세 필드를 그대로 되돌린다', async () => {
    const { channel } = channelWith([
      gatewayOk({ result: { count: 5 }, subrc: 0, message: 'done' }),
    ]);
    const result = await channel.callDispatch('PING', {});
    expect(result).toEqual({ result: { count: 5 }, subrc: 0, message: 'done' });
  });

  it('result가 없으면 빈 객체로 떨어진다', async () => {
    const { channel } = channelWith([gatewayOk({ subrc: 0, message: '' })]);
    const result = await channel.callDispatch('PING', {});
    expect(result.result).toEqual({});
  });

  it('subrc != 0은 sap 오류이고 subrc·메시지·action을 보존한다', async () => {
    const { channel } = channelWith([
      gatewayOk({ result: {}, subrc: 4, message: 'not found' }),
    ]);
    const error = (await channel
      .callDispatch('CUA_FETCH', {})
      .catch((e: unknown) => e)) as RfcError;

    expect(error.kind).toBe('sap');
    expect(error.backend).toBe('gateway');
    expect(error.subrc).toBe(4);
    expect(error.sapMessage).toBe('not found');
    expect(error.action).toBe('CUA_FETCH');
    expect(error.message).toBe(
      'ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): not found',
    );
  });

  it.each([
    [401, 'auth'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'server'],
    [418, 'http'],
  ] as const)('HTTP %i를 %s로 정규화한다', async (status, kind) => {
    const { channel } = channelWith([{ status, body: 'boom' }]);
    const error = (await channel.callDispatch('PING', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.rawBody).toBe('boom');
  });

  it('본문이 JSON이 아니면 protocol 오류', async () => {
    const { channel } = channelWith([{ status: 200, body: '<html>oops</html>' }]);
    const error = (await channel.callDispatch('PING', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
  });

  it.each(['null', '"just a string"', '42'])(
    'JSON이지만 객체가 아니면 protocol 오류 (%s) — 빈 성공으로 접히지 않는다',
    async (body) => {
      const { channel } = channelWith([{ status: 200, body }]);
      const error = (await channel.callDispatch('PING', {}).catch((e: unknown) => e)) as RfcError;
      expect(error).toBeInstanceOf(RfcError);
      expect(error.kind).toBe('protocol');
    },
  );

  it('전송 타임아웃을 timeout으로 정규화한다', async () => {
    const { channel } = channelWith([new HttpTransportError('timeout', '시간이 다 됐다')]);
    const error = (await channel.callDispatch('PING', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('timeout');
    expect(error.backend).toBe('gateway');
  });

  it('연결 실패를 network으로 정규화하고 죽은 키를 소리내어 짚는다', async () => {
    const { channel } = channelWith([new HttpTransportError('network', 'ECONNREFUSED')]);
    const error = (await channel.callDispatch('PING', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('network');
    expect(error.message).toContain('SAP_RFC_GATEWAY_URL');
    expect(error.message).toContain('TLS_REJECT_UNAUTHORIZED=0');
  });
});
