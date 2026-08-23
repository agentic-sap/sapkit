/**
 * soap 통로 — 통로 생성 계약 · 요청 조립 · 응답 해석 · 오류 정규화.
 *
 * 대조 원본은 `engine/src/lib/soapRfc.ts`와 그것이 얹혀 있던 구 접속 계층
 * (`engine/src/lib/utils.ts:902-921` → `@babamba2/mcp-abap-connection`의
 * `AbstractAbapConnection.makeAdtRequest`)이다. 여기서 못박는 것:
 *
 * - **생성 시점 설정 확인**(장부 D12) — 호스트·계정·비밀번호가 없으면 통로가
 *   서지 않고, 그 실패에 요청이 한 건도 나가지 않는다.
 * - **타임아웃 노브**(장부 D11) — 본 요청이 `timeouts.long`을 쓴다. 구도 이
 *   통로에서는 `'long'`(= `SAP_TIMEOUT_LONG`, 기본 60000ms)을 존중했으므로
 *   기본값에서는 동작이 같아야 한다.
 * - **요청 조립** — 주소 `/sap/bc/soap/rfc` · 봉투 전문 · 헤더 한 벌.
 * - **오류 종류 구별** — config / protocol / sap / auth / forbidden / csrf /
 *   not-found / server / http / timeout / network.
 *
 * SAP에 접속하지 않는다. 전부 주입된 가짜 전송이고, 마지막 한 건만 포트 0의
 * in-process `node:http` 서버 상대다.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import type { HttpResponse } from '../../adt/http';
import { HttpTransportError } from '../../adt/http';
import type { ConnectionConfig } from '../../contracts';
import { RfcError } from '../errors';
import { buildSoapEnvelope, createSoapChannel } from '../soap';
import { EXPECTED_AUTHORIZATION, fakeConnection, header, nth, scripted } from './support';

const ORIGIN = 'https://sap.example.test:44300';
const SOAP_URL = `${ORIGIN}/sap/bc/soap/rfc`;
const DISCOVERY_URL = `${ORIGIN}/sap/bc/adt/core/discovery`;
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const URN_NS = 'urn:sap-com:document:sap:rfc:functions';
const DISPATCH_FM = 'ZSAPKIT_ADT_DISPATCH';
const TEXTPOOL_FM = 'ZSAPKIT_ADT_TEXTPOOL';

// ─────────────────────────────────────────────────────────────── 응답 조각

/** 토큰을 발급하고 세션 쿠키를 심는 discovery 응답. */
function csrfIssued(token = 'tok-1'): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'x-csrf-token': token },
    setCookie: ['SAP_SESSIONID_X01_100=sess-1; path=/; HttpOnly; Secure'],
    body: '<app:service/>',
  };
}

function outputs(fields: Readonly<Record<string, string | number>>): string {
  return Object.entries(fields)
    .map(([name, value]) => `      <${name}>${value}</${name}>`)
    .join('\n');
}

function soapBody(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="${SOAP_NS}">
  <soap-env:Body>
${inner}
  </soap-env:Body>
</soap-env:Envelope>`;
}

/** `<FM>.Response` 래퍼가 있는 정상 응답 — SAP이 보통 돌려주는 모양. */
function soapOk(
  fmName: string,
  fields: Readonly<Record<string, string | number>>,
): Partial<HttpResponse> {
  return {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
    body: soapBody(
      `    <rfc:${fmName}.Response xmlns:rfc="${URN_NS}">\n${outputs(fields)}\n    </rfc:${fmName}.Response>`,
    ),
  };
}

/** 래퍼 없이 `Body` 바로 아래 출력이 오는 판 — 구가 폴백으로 받아 주던 모양. */
function soapBare(fields: Readonly<Record<string, string | number>>): Partial<HttpResponse> {
  return { status: 200, body: soapBody(outputs(fields)) };
}

/**
 * SOAP Fault. **기본 상태를 200으로 두는 것은 실측 결과다** — 구는 axios 기본
 * `validateStatus`(2xx만 통과)를 그대로 쓰므로
 * (`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:551-564`
 * 에 override 없음), 500으로 온 Fault는 파서에 닿기 전에 HTTP 실패로 끝난다.
 * 즉 구에서도 Fault 분기는 2xx 응답에서만 산다.
 */
function soapFault(faultstring: string, status = 200): Partial<HttpResponse> {
  return {
    status,
    body: soapBody(
      `    <soap-env:Fault>\n` +
        `      <faultcode>SOAP-ENV:Server</faultcode>\n` +
        `      <faultstring>${faultstring}</faultstring>\n` +
        `    </soap-env:Fault>`,
    ),
  };
}

const DISPATCH_OK = soapOk(DISPATCH_FM, {
  EV_SUBRC: 0,
  EV_MESSAGE: '',
  EV_RESULT: '{"CUA":[]}',
});

// ─────────────────────────────────────────────────────────────── 통로 조립

function channelWith(
  steps: Parameters<typeof scripted>[0],
  connection: ConnectionConfig = fakeConnection(),
) {
  const spy = scripted(steps);
  const channel = createSoapChannel({ connection, env: {}, transport: spy.transport });
  return { channel, spy };
}

/** 통로가 서지 못하는 것을 확인하고 그 오류를 돌려준다. 요청은 0건이어야 한다. */
function creationFailure(connection: ConnectionConfig): RfcError {
  const spy = scripted([]);
  let caught: unknown;
  try {
    createSoapChannel({ connection, env: {}, transport: spy.transport });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RfcError);
  expect(spy.calls).toHaveLength(0);
  return caught as RfcError;
}

describe('soap 통로 — 생성 시점 설정 확인 (장부 D12)', () => {
  it('호스트가 없으면 config 오류로 통로가 서지 않는다', () => {
    const error = creationFailure(fakeConnection({ baseUrl: '' }));
    expect(error.kind).toBe('config');
    expect(error.backend).toBe('soap');
    expect(error.message).toContain('SAP_URL');
  });

  it('계정이 없으면 config 오류', () => {
    const error = creationFailure(fakeConnection({ username: '' }));
    expect(error.kind).toBe('config');
    expect(error.message).toContain('SAP_USERNAME');
  });

  it('비밀번호가 없으면 config 오류', () => {
    const error = creationFailure(fakeConnection({ password: '' }));
    expect(error.kind).toBe('config');
    expect(error.message).toContain('SAP_PASSWORD');
  });

  it('호스트가 URL로 해석되지 않으면 config 오류', () => {
    const error = creationFailure(fakeConnection({ baseUrl: 'not a url' }));
    expect(error.kind).toBe('config');
  });

  it('스킴이 빠진 호스트를 통과시키지 않는다 — 첫 호출에 가서 터지지 않는다', () => {
    // `new URL('sap.example.test:44300')`은 던지지 않는다(스킴으로 읽힌다).
    // 프로토콜을 따로 보지 않으면 이 값이 그대로 통과해 전송 단계에서 터진다.
    const error = creationFailure(fakeConnection({ baseUrl: 'sap.example.test:44300' }));
    expect(error.kind).toBe('config');
    expect(error.message).toContain('http');
  });

  it('http/https가 아닌 스킴도 config 오류', () => {
    const error = creationFailure(fakeConnection({ baseUrl: 'ftp://sap.example.test' }));
    expect(error.kind).toBe('config');
  });

  it('SAP_RFC_* 키는 하나도 요구하지 않는다 — 빈 env로도 선다', () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    expect(channel.backend).toBe('soap');
    // 통로를 세우는 것만으로는 SAP에 아무것도 보내지 않는다.
    expect(spy.calls).toHaveLength(0);
  });

  it('클라이언트 번호가 없어도 통로는 선다 — 구는 접속 생성에서 막았다', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      fakeConnection({ client: undefined }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(header(nth(spy.calls, 1), 'x-sap-client')).toBeUndefined();
  });
});

describe('soap 통로 — 봉투 전문', () => {
  it('구 엔진과 글자 그대로 같은 봉투를 만든다', () => {
    const envelope = buildSoapEnvelope(DISPATCH_FM, {
      IV_ACTION: 'CUA_FETCH',
      IV_PARAMS: '{"program":"SAPMV45A"}',
    });
    expect(envelope).toBe(
      `<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="${SOAP_NS}" xmlns:urn="${URN_NS}">
  <soap-env:Header/>
  <soap-env:Body>
    <urn:${DISPATCH_FM}>
      <IV_ACTION>CUA_FETCH</IV_ACTION>
      <IV_PARAMS>{&quot;program&quot;:&quot;SAPMV45A&quot;}</IV_PARAMS>
    </urn:${DISPATCH_FM}>
  </soap-env:Body>
</soap-env:Envelope>`,
    );
  });

  it('XML 특수문자 5종을 구와 같은 순서로 막는다', () => {
    const envelope = buildSoapEnvelope('ZTEST', { IV_X: `&<>"'` });
    expect(envelope).toContain('<IV_X>&amp;&lt;&gt;&quot;&apos;</IV_X>');
    // `&`를 먼저 바꾸지 않으면 뒤에서 만든 엔티티가 두 번 이스케이프된다.
    expect(envelope).not.toContain('&amp;lt;');
  });

  it('인자 순서를 준 순서 그대로 싣는다', () => {
    const envelope = buildSoapEnvelope(TEXTPOOL_FM, {
      IV_ACTION: 'READ',
      IV_PROGRAM: 'ZTEST',
      IV_LANGUAGE: '',
      IV_TEXTPOOL_JSON: '',
    });
    expect(envelope.indexOf('<IV_ACTION>')).toBeLessThan(envelope.indexOf('<IV_PROGRAM>'));
    expect(envelope.indexOf('<IV_PROGRAM>')).toBeLessThan(envelope.indexOf('<IV_LANGUAGE>'));
    expect(envelope.indexOf('<IV_LANGUAGE>')).toBeLessThan(envelope.indexOf('<IV_TEXTPOOL_JSON>'));
  });
});

describe('soap 통로 — 요청 조립', () => {
  it('POST 주소는 ICF 노드 하나뿐이다 — 질의 인자가 붙지 않는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'SAPMV45A' });

    const post = nth(spy.calls, 1);
    expect(post.method).toBe('POST');
    expect(post.url).toBe(SOAP_URL);
  });

  it('구 접속 계층처럼 POST 앞에서 CSRF 토큰을 먼저 긁어온다', async () => {
    const { channel, spy } = channelWith([csrfIssued('tok-9'), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});

    const fetchCall = nth(spy.calls, 0);
    expect(fetchCall.method).toBe('GET');
    expect(fetchCall.url).toBe(DISCOVERY_URL);
    expect(header(fetchCall, 'x-csrf-token')).toBe('Fetch');
    expect(header(nth(spy.calls, 1), 'x-csrf-token')).toBe('tok-9');
  });

  it('본문은 dispatch 인자 2종을 실은 봉투다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', { program: 'SAPMV45A' });

    expect(nth(spy.calls, 1).body).toBe(
      buildSoapEnvelope(DISPATCH_FM, {
        IV_ACTION: 'CUA_FETCH',
        IV_PARAMS: '{"program":"SAPMV45A"}',
      }),
    );
  });

  it('params를 안 주면 빈 객체로 직렬화한다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH');
    expect(nth(spy.calls, 1).body).toContain('<IV_PARAMS>{}</IV_PARAMS>');
  });

  it('textpool은 인자 4종을 싣고 빈 값을 빈 문자열로 채운다', async () => {
    const TEXTPOOL_OK = soapOk(TEXTPOOL_FM, {
      EV_SUBRC: 0,
      EV_MESSAGE: '',
      EV_RESULT: '[]',
    });
    const { channel, spy } = channelWith([csrfIssued(), TEXTPOOL_OK]);
    await channel.callTextpool('READ', { program: 'ZTEST' });

    expect(nth(spy.calls, 1).body).toBe(
      buildSoapEnvelope(TEXTPOOL_FM, {
        IV_ACTION: 'READ',
        IV_PROGRAM: 'ZTEST',
        IV_LANGUAGE: '',
        IV_TEXTPOOL_JSON: '',
      }),
    );
  });

  it('헤더 한 벌이 구 접속 계층과 같다', async () => {
    const { channel, spy } = channelWith([csrfIssued('tok-1'), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});

    const post = nth(spy.calls, 1);
    expect(header(post, 'content-type')).toBe('text/xml; charset=utf-8');
    expect(header(post, 'soapaction')).toBe(URN_NS);
    // 구는 customHeaders에 Accept를 주지 않아 접속 계층 기본값이 실린다.
    expect(header(post, 'accept')).toBe('application/xml, application/json, text/plain, */*');
    expect(header(post, 'authorization')).toBe(EXPECTED_AUTHORIZATION);
    expect(header(post, 'x-sap-client')).toBe('100');
    expect(header(post, 'cookie')).toBe(
      'SAP_SESSIONID_X01_100=sess-1; sap-usercontext=sap-client=100',
    );
  });
});

describe('soap 통로 — 타임아웃 노브 (장부 D11)', () => {
  it('본 요청은 접속 설정의 long을 쓴다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), DISPATCH_OK]);
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 1).timeoutMs).toBe(6000);
  });

  it('long을 올리면 그 값이 그대로 나간다 — 하드코딩이 없다', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      fakeConnection({ timeouts: { default: 45000, csrf: 15000, long: 90000 } }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 1).timeoutMs).toBe(90000);
  });

  it('SAP_TIMEOUT_LONG 미설정 기본값 60000ms는 구 getTimeout("long")과 같다', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      fakeConnection({ timeouts: { default: 45000, csrf: 15000, long: 60000 } }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 1).timeoutMs).toBe(60000);
  });

  it('CSRF 취득은 별도 노브(csrf)를 쓴다 — long이 아니다', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      fakeConnection({ timeouts: { default: 45000, csrf: 15000, long: 90000 } }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 0).timeoutMs).toBe(15000);
  });

  it('TLS 방침도 접속 설정을 따른다', async () => {
    const { channel, spy } = channelWith(
      [csrfIssued(), DISPATCH_OK],
      fakeConnection({ rejectUnauthorized: true }),
    );
    await channel.callDispatch('CUA_FETCH', {});
    expect(nth(spy.calls, 1).rejectUnauthorized).toBe(true);
  });
});

describe('soap 통로 — 응답 해석', () => {
  it('FM.Response 래퍼 아래의 세 출력을 푼다', async () => {
    const { channel } = channelWith([csrfIssued(), DISPATCH_OK]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result).toEqual({ result: { CUA: [] }, subrc: 0, message: '' });
  });

  it('래퍼가 없으면 Body를 그대로 쓴다 — 구가 둔 판 차이 폴백', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapBare({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{"ok":1}' }),
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toEqual({ ok: 1 });
  });

  it('소문자 출력 이름도 읽는다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(DISPATCH_FM, { ev_subrc: 0, ev_message: 'ok', ev_result: '{"a":1}' }),
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toEqual({ a: 1 });
    expect(result.message).toBe('ok');
  });

  it('EV_RESULT가 JSON이 아니면 원문 문자열 그대로 돌려준다 (구 soap 동작)', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(DISPATCH_FM, { EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: 'not json' }),
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toBe('not json');
  });

  it('EV_RESULT가 아예 없으면 dispatch는 빈 객체로 떨어진다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(DISPATCH_FM, { EV_SUBRC: 0, EV_MESSAGE: '' }),
    ]);
    const result = await channel.callDispatch('CUA_FETCH', {});
    expect(result.result).toEqual({});
  });

  it('EV_RESULT가 아예 없으면 textpool은 빈 배열로 떨어진다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(TEXTPOOL_FM, { EV_SUBRC: 0, EV_MESSAGE: '' }),
    ]);
    const result = await channel.callTextpool('READ', { program: 'ZTEST' });
    expect(result.result).toEqual([]);
  });

  it('textpool READ 결과를 배열로 되돌린다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(TEXTPOOL_FM, {
        EV_SUBRC: 0,
        EV_MESSAGE: '',
        EV_RESULT: '[{"ID":"R","KEY":"","ENTRY":"Title","LENGTH":5}]',
      }),
    ]);
    const result = await channel.callTextpool('READ', { program: 'ZTEST' });
    expect(result.result).toEqual([{ ID: 'R', KEY: '', ENTRY: 'Title', LENGTH: 5 }]);
  });
});

describe('soap 통로 — 오류 종류가 구별된다', () => {
  it('subrc != 0은 sap 오류이고 문구가 구 글자 그대로다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(DISPATCH_FM, { EV_SUBRC: 4, EV_MESSAGE: 'unknown action', EV_RESULT: '{}' }),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error).toBeInstanceOf(RfcError);
    expect(error.kind).toBe('sap');
    expect(error.backend).toBe('soap');
    expect(error.subrc).toBe(4);
    expect(error.sapMessage).toBe('unknown action');
    expect(error.action).toBe('CUA_FETCH');
    expect(error.message).toBe(
      'ZSAPKIT_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): unknown action',
    );
  });

  it('textpool의 subrc != 0도 구 문구 그대로다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapOk(TEXTPOOL_FM, { EV_SUBRC: 8, EV_MESSAGE: 'program not found', EV_RESULT: '[]' }),
    ]);
    const error = (await channel
      .callTextpool('READ', { program: 'ZTEST' })
      .catch((e: unknown) => e)) as RfcError;
    expect(error.message).toBe(
      'ZSAPKIT_ADT_TEXTPOOL error (action=READ, subrc=8): program not found',
    );
  });

  it('SOAP Fault는 sap 오류이고 SAP이 준 문구를 보존한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      soapFault('Function module ZSAPKIT_ADT_DISPATCH not found'),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('sap');
    expect(error.sapMessage).toBe('Function module ZSAPKIT_ADT_DISPATCH not found');
    expect(error.message).toBe('SOAP Fault: Function module ZSAPKIT_ADT_DISPATCH not found');
    // 업무 오류가 아니므로 subrc는 없다 — 두 sap 오류는 이것으로 갈린다.
    expect(error.subrc).toBeUndefined();
  });

  it('HTTP 500으로 실려 온 Fault는 server 오류다 — 구도 파서에 닿기 전에 끝난다', async () => {
    const { channel } = channelWith([csrfIssued(), soapFault('system failure', 500)]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('server');
    expect(error.status).toBe(500);
  });

  it('Envelope/Body가 없으면 protocol 오류', async () => {
    const { channel } = channelWith([csrfIssued(), { status: 200, body: '<html>oops</html>' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
    expect(error.rawBody).toBe('<html>oops</html>');
  });

  it('본문이 XML이 아니어도 protocol 오류로 끝난다', async () => {
    const { channel } = channelWith([csrfIssued(), { status: 200, body: 'not xml at all' }]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('protocol');
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
    expect(error.backend).toBe('soap');
    expect(error.functionModule).toBe(DISPATCH_FM);
  });

  it('CSRF 신호 없는 403은 forbidden으로 남는다 — S_RFC 권한 자리', async () => {
    const { channel, spy } = channelWith([
      csrfIssued(),
      { status: 403, headers: {}, body: 'no authority for S_RFC' },
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('forbidden');
    expect(spy.calls).toHaveLength(2);
  });

  it('403 + required가 반복되면 csrf 오류로 끝난다 — 무한 되밀기가 없다', async () => {
    const rejected = {
      status: 403,
      headers: { 'x-csrf-token': 'Required' },
      body: 'CSRF token validation failed',
    };
    const { channel, spy } = channelWith([
      csrfIssued('tok-1'),
      rejected,
      csrfIssued('tok-2'),
      rejected,
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('csrf');
    expect(spy.calls).toHaveLength(4);
  });

  it('전송 타임아웃을 timeout으로 정규화한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      new HttpTransportError('timeout', '시간이 다 됐다'),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('timeout');
    expect(error.status).toBeUndefined();
  });

  it('연결 실패를 network으로 정규화한다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      new HttpTransportError('network', '접속 실패'),
    ]);
    const error = (await channel.callDispatch('CUA_FETCH', {}).catch((e: unknown) => e)) as RfcError;
    expect(error.kind).toBe('network');
  });

  it('실패해도 다른 통로로 넘어가지 않는다 — 조용한 대체가 없다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), { status: 404, body: 'ICF node off' }]);
    await channel.callDispatch('CUA_FETCH', {}).catch(() => undefined);
    // discovery 1 + soap POST 1. 다른 엔드포인트를 더듬지 않는다.
    expect(spy.calls).toHaveLength(2);
    expect(nth(spy.calls, 1).url).toBe(SOAP_URL);
  });
});

describe('soap 통로 — 내장 전송으로 실제 왕복', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  it('in-process 서버 상대로 CSRF 취득 + SOAP 호출을 완주한다', async () => {
    const seen: { method: string; url: string; contentType?: string; body: string }[] = [];
    server = http.createServer((req, res) => {
      const chunks: string[] = [];
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => chunks.push(chunk));
      req.on('end', () => {
        seen.push({
          method: req.method ?? '',
          url: req.url ?? '',
          contentType: req.headers['content-type'],
          body: chunks.join(''),
        });
        if ((req.url ?? '').includes('/discovery')) {
          res.setHeader('x-csrf-token', 'live-token');
          res.statusCode = 200;
          res.end('<app:service/>');
          return;
        }
        res.setHeader('content-type', 'text/xml; charset=utf-8');
        res.statusCode = 200;
        res.end(
          soapBody(
            `    <rfc:${DISPATCH_FM}.Response xmlns:rfc="${URN_NS}">\n` +
              `      <EV_SUBRC>0</EV_SUBRC>\n` +
              `      <EV_MESSAGE></EV_MESSAGE>\n` +
              `      <EV_RESULT>{"ok":1}</EV_RESULT>\n` +
              `    </rfc:${DISPATCH_FM}.Response>`,
          ),
        );
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const channel = createSoapChannel({
      connection: fakeConnection({ baseUrl: `http://127.0.0.1:${port}` }),
      env: {},
    });

    const result = await channel.callDispatch('CUA_FETCH', { program: 'ZTEST' });
    expect(result.result).toEqual({ ok: 1 });
    expect(seen).toHaveLength(2);
    expect(seen[1]?.method).toBe('POST');
    expect(seen[1]?.url).toBe('/sap/bc/soap/rfc');
    expect(seen[1]?.contentType).toBe('text/xml; charset=utf-8');
    expect(seen[1]?.body).toContain('<urn:ZSAPKIT_ADT_DISPATCH>');
  });
});
