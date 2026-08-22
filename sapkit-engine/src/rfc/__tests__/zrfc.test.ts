/**
 * zrfc 통로 — 요청 조립과 오류 정규화.
 *
 * **이 판에서 동작 확인이 불가능한 통로다.** `zrfc`는 SAP 측에 커스텀 ICF 핸들러
 * 클래스 `ZCL_MCP_RFC_HTTP_HANDLER`와 SICF 노드 `/sap/bc/rest/zmcp_rfc`가 있어야만
 * 대답을 하는데, 그 오브젝트는 소유자 시스템에 설치돼 있지 않다. 그래서 여기서
 * 못박는 **요청 조립 대조가 이 통로의 정확성 근거 전부**다 — 재생 대조도, 실접속
 * 확인도 이 판에는 없다.
 *
 * 대조 원본(줄번호는 읽은 시점의 것). ⚠ 아래 `engine/…`는 **전부 구 포크의
 * 경로이고 판7.5(2026-08-22)에서 레포를 떠났다** — 되뜨려면 은퇴 직전 커밋
 * `2264f89d`를 참조한다:
 * - `engine/src/lib/zrfcProxy.ts:104-156`  — CSRF 취득(GET `{base}/dispatch`)
 * - `engine/src/lib/zrfcProxy.ts:179-240`  — 엔드포인트 POST(헤더·본문·403 되밀기)
 * - `engine/src/lib/zrfcProxy.ts:247-303`  — dispatch/textpool 본문 조립과 결과 정규화
 * - `engine/abap/zcl_mcp_rfc_http_handler.abap:161-293` — SAP 측이 실제로 돌려주는 모양
 * - `engine/docs/installation/ZRFC_SETUP.md:125-134` — 오브젝트가 없을 때의 증상표
 */

import { HttpTransportError } from '../../adt/http';
import type { HttpResponse } from '../../adt/http';
import { RfcError } from '../errors';
import { createZrfcChannel } from '../zrfc';
import { EXPECTED_AUTHORIZATION, fakeConnection, header, nth, scripted } from './support';

/** 명백히 가짜인 ICF 핸들러 마운트 지점. `ZRFC_SETUP.md:71`의 모양 그대로다. */
const BASE_URL = 'https://sap.example.test:44300/sap/bc/rest/zmcp_rfc';

function zrfcEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return { SAP_RFC_ZRFC_BASE_URL: BASE_URL, ...overrides };
}

/**
 * 핸들러가 CSRF 토큰을 발급했을 때의 응답.
 * `zcl_mcp_rfc_http_handler.abap:165-174` — 헤더 하나 + 쿠키 `zrfc_csrf` 하나,
 * 본문 없음.
 */
function csrfIssued(token = 'tok-1'): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'x-csrf-token': token },
    setCookie: [`zrfc_csrf=${token}; path=/sap/bc/rest/zmcp_rfc`],
    body: '',
  };
}

/**
 * 대리자 호출이 성공했을 때의 응답. `d` 봉투가 **없다** — 핸들러가
 * `/ui2/cl_json=>serialize(pretty_name=camel_case)`로 세 필드를 평평하게
 * 내보내기 때문이다(`zcl_mcp_rfc_http_handler.abap:207-236`).
 */
function endpointOk(fields: {
  result?: string;
  subrc?: number;
  message?: string;
}): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ result: '', subrc: 0, message: '', ...fields }),
  };
}

/** 핸들러의 `send_error` 응답 모양(`:375-389`). */
function endpointError(status: number, error: string, csrf = false): Partial<HttpResponse> {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(csrf ? { 'x-csrf-token': 'Required' } : {}),
    },
    body: JSON.stringify({ error }),
  };
}

const DISPATCH_OK = endpointOk({ result: '{"CUA":[]}' });

function channelWith(steps: Parameters<typeof scripted>[0], env = zrfcEnv()) {
  const spy = scripted(steps);
  const channel = createZrfcChannel({
    connection: fakeConnection(),
    env,
    transport: spy.transport,
  });
  return { channel, spy };
}

describe('zrfc 통로 — 통로 생성 시점의 설정 확인 (D12)', () => {
  it('통로 이름이 zrfc다', () => {
    const { channel } = channelWith([]);
    expect(channel.backend).toBe('zrfc');
  });

  it('SAP_RFC_ZRFC_BASE_URL이 없으면 config 오류로 통로가 서지 않는다', () => {
    let caught: unknown;
    try {
      createZrfcChannel({
        connection: fakeConnection(),
        env: {},
        transport: scripted([]).transport,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RfcError);
    const error = caught as RfcError;
    expect(error.kind).toBe('config');
    expect(error.backend).toBe('zrfc');
    expect(error.message).toContain('SAP_RFC_ZRFC_BASE_URL');
  });

  it('빈 값·공백만 있어도 없는 것으로 본다', () => {
    for (const value of ['', '   ']) {
      expect(() =>
        createZrfcChannel({
          connection: fakeConnection(),
          env: { SAP_RFC_ZRFC_BASE_URL: value },
          transport: scripted([]).transport,
        }),
      ).toThrow(RfcError);
    }
  });

  it('설정이 없으면 요청을 한 건도 보내지 않는다', () => {
    const spy = scripted([csrfIssued(), DISPATCH_OK]);
    expect(() =>
      createZrfcChannel({ connection: fakeConnection(), env: {}, transport: spy.transport }),
    ).toThrow(RfcError);
    expect(spy.calls).toHaveLength(0);
  });
});

describe('zrfc 통로 — CSRF 취득 조립 (구 zrfcProxy.ts:104-133 대조)', () => {
  it('GET {base}/dispatch를 Fetch 헤더로 친다 — $metadata가 아니다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'SAPMV45A' });

    const fetchCall = nth(spy.calls, 0);
    expect(fetchCall.method).toBe('GET');
    expect(fetchCall.url).toBe(`${BASE_URL}/dispatch?sap-client=100`);
    expect(header(fetchCall, 'x-csrf-token')).toBe('Fetch');
    expect(header(fetchCall, 'accept')).toBe('application/json');
    expect(header(fetchCall, 'authorization')).toBe(EXPECTED_AUTHORIZATION);
    // 취득 요청에는 쿠키도 본문도 없다.
    expect(header(fetchCall, 'cookie')).toBeUndefined();
    expect(fetchCall.body).toBeUndefined();
  });

  it('base URL의 후행 슬래시를 정규화한다 (구 normaliseBaseUrl)', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      zrfcEnv({ SAP_RFC_ZRFC_BASE_URL: `${BASE_URL}///` }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).url).toBe(`${BASE_URL}/dispatch?sap-client=100`);
  });

  it('클라이언트가 없으면 sap-client를 붙이지 않는다', async () => {
    const spy = scripted([csrfIssued(), DISPATCH_OK]);
    const channel = createZrfcChannel({
      connection: fakeConnection({ client: undefined }),
      env: zrfcEnv(),
      transport: spy.transport,
    });
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).url).toBe(`${BASE_URL}/dispatch`);
    expect(nth(spy.calls, 1).url).not.toContain('sap-client');
  });

  it('토큰을 캐시한다 — 두 번째 호출은 취득을 다시 하지 않는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK, DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});
    await channel.callDispatch('CUA_FETCH', {});
    expect(spy.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('SAP_RFC_ZRFC_CSRF_TTL_SEC가 지나면 다시 취득한다', async () => {
    const spy = scripted([csrfIssued('tok-1'), DISPATCH_OK, csrfIssued('tok-2'), DISPATCH_OK]);
    let clock = 1_000_000;
    const channel = createZrfcChannel({
      connection: fakeConnection(),
      env: zrfcEnv({ SAP_RFC_ZRFC_CSRF_TTL_SEC: '600' }),
      transport: spy.transport,
      now: () => clock,
    });

    await channel.callDispatch('CUA_FETCH', {});
    clock += 601_000;
    await channel.callDispatch('CUA_FETCH', {});

    expect(spy.calls.filter((call) => call.method === 'GET')).toHaveLength(2);
    expect(header(nth(spy.calls, 3), 'x-csrf-token')).toBe('tok-2');
  });

  it('TTL 하한은 60초다 — 구 Math.max(60, …)와 같다', async () => {
    const spy = scripted([csrfIssued('tok-1'), DISPATCH_OK, DISPATCH_OK]);
    let clock = 0;
    const channel = createZrfcChannel({
      connection: fakeConnection(),
      env: zrfcEnv({ SAP_RFC_ZRFC_CSRF_TTL_SEC: '0' }),
      transport: spy.transport,
      now: () => clock,
    });
    await channel.callDispatch('CUA_FETCH', {});
    clock += 59_000;
    await channel.callDispatch('CUA_FETCH', {});
    expect(spy.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('숫자가 아닌 TTL은 기본 600초로 떨어진다', async () => {
    const spy = scripted([csrfIssued('tok-1'), DISPATCH_OK, DISPATCH_OK]);
    let clock = 0;
    const channel = createZrfcChannel({
      connection: fakeConnection(),
      env: zrfcEnv({ SAP_RFC_ZRFC_CSRF_TTL_SEC: 'nonsense' }),
      transport: spy.transport,
      now: () => clock,
    });
    await channel.callDispatch('CUA_FETCH', {});
    clock += 599_000;
    await channel.callDispatch('CUA_FETCH', {});
    expect(spy.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });
});

describe('zrfc 통로 — 타임아웃 노브 (D11)', () => {
  it('접속 설정의 long 타임아웃과 TLS 방침을 쓴다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).timeoutMs).toBe(6000);
    expect(nth(spy.calls, 1).timeoutMs).toBe(6000);
    expect(nth(spy.calls, 0).rejectUnauthorized).toBe(false);
  });

  it('설정을 안 건드리면 구의 하드코딩 60초와 같다', async () => {
    const spy = scripted([csrfIssued(), DISPATCH_OK]);
    const channel = createZrfcChannel({
      connection: fakeConnection({ timeouts: { default: 45_000, csrf: 15_000, long: 60_000 } }),
      env: zrfcEnv(),
      transport: spy.transport,
    });
    await channel.callDispatch('CUA_FETCH', {});
    // 구: `engine/src/lib/zrfcProxy.ts:33` DEFAULT_TIMEOUT_MS = 60_000
    expect(nth(spy.calls, 0).timeoutMs).toBe(60_000);
  });
});

describe('zrfc 통로 — Dispatch 요청 조립 (구 zrfcProxy.ts:247-258 대조)', () => {
  it('POST {base}/dispatch에 action과 JSON 문자열 params를 싣는다', async () => {
    const { channel, spy } = channelWith([csrfIssued('tok-9'), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'SAPMV45A' });

    const post = nth(spy.calls, 1);
    expect(post.method).toBe('POST');
    expect(post.url).toBe(`${BASE_URL}/dispatch?sap-client=100`);
    // params는 **객체가 아니라 JSON 문자열**이다 — ABAP 쪽이 ls_req-params를
    // IV_PARAMS로 그대로 넘기기 때문이다(구 주석 :254-256).
    expect(post.body).toBe(
      JSON.stringify({ action: 'CUA_FETCH', params: '{"program":"SAPMV45A"}' }),
    );
    expect(JSON.parse(post.body ?? '')).toEqual({
      action: 'CUA_FETCH',
      params: '{"program":"SAPMV45A"}',
    });
  });

  it('params가 없으면 빈 객체를 직렬화해 싣는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH');
    expect(nth(spy.calls, 1).body).toBe(JSON.stringify({ action: 'CUA_FETCH', params: '{}' }));
  });

  it('POST 헤더 5종이 구와 같다', async () => {
    const { channel, spy } = channelWith([csrfIssued('tok-9'), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});

    const post = nth(spy.calls, 1);
    expect(header(post, 'x-csrf-token')).toBe('tok-9');
    expect(header(post, 'authorization')).toBe(EXPECTED_AUTHORIZATION);
    expect(header(post, 'accept')).toBe('application/json');
    expect(header(post, 'content-type')).toBe('application/json; charset=utf-8');
    expect(header(post, 'cookie')).toBe('zrfc_csrf=tok-9');
  });

  it('쿠키가 없으면 Cookie 헤더를 아예 싣지 않는다', async () => {
    const { channel, spy } = channelWith([
      { status: 200, headers: { 'x-csrf-token': 'tok-1' }, setCookie: [], body: '' },
      DISPATCH_OK,
    ]);
    await channel.callDispatch('CUA_FETCH', {});
    expect(header(nth(spy.calls, 1), 'cookie')).toBeUndefined();
  });
});

describe('zrfc 통로 — Textpool 요청 조립 (구 zrfcProxy.ts:275-291 대조)', () => {
  const TEXTPOOL_OK = endpointOk({
    result: '[{"ID":"R","KEY":"","ENTRY":"Title","LENGTH":5}]',
  });

  it('네 필드를 싣고 빈 값은 빈 문자열로 채운다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    await channel.callTextpool('READ', { program: 'ZTEST' });

    const post = nth(spy.calls, 1);
    expect(post.url).toBe(`${BASE_URL}/textpool?sap-client=100`);
    // 필드 이름은 `textpoolJson` — ABAP 쪽이 camel_case로 역직렬화한다(구 주석 :288-289).
    expect(post.body).toBe(
      JSON.stringify({ action: 'READ', program: 'ZTEST', language: '', textpoolJson: '' }),
    );
  });

  it('주어진 언어와 페이로드를 그대로 싣는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    await channel.callTextpool('WRITE', {
      program: 'ZTEST',
      language: 'EN',
      textpoolJson: '[]',
    });
    expect(nth(spy.calls, 1).body).toBe(
      JSON.stringify({ action: 'WRITE', program: 'ZTEST', language: 'EN', textpoolJson: '[]' }),
    );
  });

  it('READ 결과를 배열로 되돌린다', async () => {
    const { channel } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    const result = await channel.callTextpool('READ', { program: 'ZTEST' });
    expect(result.subrc).toBe(0);
    expect(result.result).toEqual([{ ID: 'R', KEY: '', ENTRY: 'Title', LENGTH: 5 }]);
  });

  it('result가 JSON이 아니면 빈 배열로 떨어진다 (구 fallback `[]`)', async () => {
    const { channel } = channelWith([csrfIssued(), endpointOk({ result: 'not json' })]);
    const result = await channel.callTextpool('READ', { program: 'ZTEST' });
    expect(result.result).toEqual([]);
  });

  it('subrc != 0이면 ZMCP_ADT_TEXTPOOL 오류로 정규화한다 — 문구는 구 글자 그대로', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      endpointOk({ subrc: 8, message: 'program not found', result: '[]' }),
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

describe('zrfc 통로 — 응답 정규화 (구 zrfcProxy.ts:260-269 대조)', () => {
  it('평평한 세 필드를 푼다 — d 봉투가 없다', async () => {
    const { channel } = channelWith([csrfIssued(), DISPATCH_OK]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result).toEqual({ result: { CUA: [] }, subrc: 0, message: '' });
  });

  it('odata식 d 봉투를 억지로 풀지 않는다 — 핸들러가 그 모양을 내지 않는다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      {
        status: 200,
        body: JSON.stringify({ d: { result: '{"CUA":[]}', subrc: 0, message: '' } }),
      },
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    // 필드가 없으니 기본값으로 떨어진다 — 조용히 다른 모양을 받아 주지 않는다.
    expect(result.result).toEqual({});
  });

  it('result가 JSON이 아니면 빈 객체로 떨어진다 (구 fallback `{}`)', async () => {
    const { channel } = channelWith([csrfIssued(), endpointOk({ result: 'not json' })]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toEqual({});
  });

  it('subrc != 0은 sap 오류이고 subrc·메시지·action을 보존한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      endpointOk({ subrc: 4, message: 'unknown action', result: '{}' }),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('sap');
    expect(error.backend).toBe('zrfc');
    expect(error.subrc).toBe(4);
    expect(error.sapMessage).toBe('unknown action');
    expect(error.action).toBe('CUA_FETCH');
    expect(error.functionModule).toBe('ZMCP_ADT_DISPATCH');
    expect(error.message).toBe(
      'ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): unknown action',
    );
  });

  it('본문이 JSON이 아니면 protocol 오류', async () => {
    const { channel } = channelWith([csrfIssued(), { status: 200, body: '<html>oops</html>' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
  });
});

describe('zrfc 통로 — CSRF 재시도 (D10과 같은 상한)', () => {
  it('403 + required면 토큰을 다시 받아 한 번 되민다', async () => {
    const { channel, spy } = channelWith([
      csrfIssued('tok-1'),
      endpointError(403, 'Missing or mismatched X-CSRF-Token header/cookie', true),
      csrfIssued('tok-2'),
      DISPATCH_OK,
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.subrc).toBe(0);
    expect(spy.calls).toHaveLength(4);
    expect(header(nth(spy.calls, 3), 'x-csrf-token')).toBe('tok-2');
  });

  it('되민 뒤에도 403이면 csrf 오류로 끝난다 — 구의 무한 재귀가 없다', async () => {
    const { channel, spy } = channelWith([
      csrfIssued('tok-1'),
      endpointError(403, 'CSRF', true),
      csrfIssued('tok-2'),
      endpointError(403, 'CSRF', true),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('csrf');
    expect(spy.calls).toHaveLength(4);
  });

  it('403인데 재취득 신호가 없으면 forbidden으로 남는다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      endpointError(403, "Function module 'SXPG_CALL_SYSTEM' is on the deny list"),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('forbidden');
    expect(error.status).toBe(403);
  });
});

/**
 * **이 판의 마지막 방어선.** SAP 측 오브젝트가 없을 때 어떤 모양으로 실패하는지를
 * 여기서 못박는다 — 실기 확인이 불가능하므로, 증상표(`ZRFC_SETUP.md:127-134`)가
 * 말하는 각 상황을 오류 종류로 옮긴 것이 곧 계약이다.
 */
describe('zrfc 통로 — SAP 측 오브젝트가 없을 때 정직하게 실패한다', () => {
  it('SICF 노드가 없으면(404) not-found — 조용히 다른 경로로 새지 않는다', async () => {
    const { channel, spy } = channelWith([{ status: 404, body: 'Not Found' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('not-found');
    expect(error.status).toBe(404);
    expect(error.backend).toBe('zrfc');
    // 무엇을 켜야 하는지를 지목한다.
    expect(error.message).toContain('/sap/bc/rest/zmcp_rfc');
    // 토큰을 못 받았으니 대리자 호출은 나가지 않는다.
    expect(spy.calls).toHaveLength(1);
  });

  it('핸들러 클래스가 비활성이면(토큰 헤더 없음) protocol — 클래스 이름을 지목한다', async () => {
    const { channel, spy } = channelWith([
      // 활성화되지 않은 노드는 토큰 없이 200을 낼 수 있다.
      { status: 200, headers: {}, body: '{"service":"zrfc","status":"ok"}' },
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
    expect(error.message).toContain('ZCL_MCP_RFC_HTTP_HANDLER');
    expect(spy.calls).toHaveLength(1);
  });

  it('토큰 자리에 Required가 오면 발급이 아니므로 protocol', async () => {
    const { channel } = channelWith([
      { status: 200, headers: { 'x-csrf-token': 'Required' }, body: '' },
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect((error as RfcError).kind).toBe('protocol');
  });

  it('대리자 함수모듈이 없으면(500) server — 원문 본문을 진단에 남긴다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      endpointError(500, 'Function module ZMCP_ADT_DISPATCH does not exist'),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('server');
    expect(error.status).toBe(500);
    expect(error.rawBody).toContain('ZMCP_ADT_DISPATCH');
  });

  it('그 실패를 성공으로 둔갑시키지 않는다 — 결과값이 아니라 던지기다', async () => {
    const { channel } = channelWith([csrfIssued(), endpointError(500, 'boom')]);
    await expect(channel.callDispatch('CUA_FETCH', {})).rejects.toBeInstanceOf(RfcError);
  });

  it.each([
    [401, 'auth'],
    [404, 'not-found'],
    [418, 'http'],
  ] as const)('대리자 호출의 HTTP %i를 %s로 정규화한다', async (status, kind) => {
    const { channel } = channelWith([csrfIssued(), { status, body: 'boom' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it('호스트에 닿지 못하면 network', async () => {
    const { channel } = channelWith([new HttpTransportError('network', '접속 실패')]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('network');
  });

  it('시간이 다 되면 timeout', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      new HttpTransportError('timeout', '시간이 다 됐다'),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('timeout');
  });
});
