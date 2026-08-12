/**
 * ECC DDIC 브리지 — FunctionImport `DdicTablRead` 하나.
 *
 * 대조 원본은 `engine/src/lib/odataRfc.ts:564-586`(`callDdicTablRead`)과
 * `engine/src/lib/rfcBackend.ts:94-132`(odata 아닌 통로에서의 정직한 실패)다.
 * 여기서 못박는 것:
 * - `POST {service}/DdicTablRead?IV_NAME='…'&IV_VERSION='…'` — 인자 이름·순서
 * - `IV_VERSION` 기본값 `A`
 * - **문턱이 `subrc >= 8`이다** — 4는 던지지 않고 결과와 함께 돌아온다.
 *   그 4를 어떻게 다룰지는 도구가 정한다(구 핸들러가 그렇게 한다).
 * - `subrc >= 8`의 문구는 구 엔진 글자 그대로
 * - odata가 아닌 통로를 고르면 요청을 **한 건도 보내지 않고** 실패한다
 */

import { RfcError } from '../errors';
import { createDdicReadChannel, createODataChannel, createRfcChannel } from '../index';
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
  const channel = createDdicReadChannel({
    connection: fakeConnection(),
    env,
    transport: spy.transport,
  });
  return { channel, spy };
}

/** 성공 응답 — Form A(이름으로 감싼 봉투). */
const TABL_OK = functionImportOk({
  DdicTablRead: {
    EV_SUBRC: 0,
    EV_MESSAGE: 'TABL ZFOO: 2 field(s), tabclass=TRANSP',
    EV_RESULT: '{"name":"ZFOO","kind":"TABL","fields":[]}',
  },
});

describe('DDIC 브리지 — 요청 조립', () => {
  it('DdicTablRead를 IV_NAME·IV_VERSION 두 인자로 POST 한다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TABL_OK]);
    await channel.callDdicTablRead({ name: 'ZFOO' });

    const call = nth(spy.calls, 1);
    expect(call.method).toBe('POST');
    expect(call.url).toBe(`${SERVICE_URL}/DdicTablRead?IV_NAME='ZFOO'&IV_VERSION='A'&sap-client=100`);
    expect(header(call, 'x-csrf-token')).toBe('tok-1');
    expect(header(call, 'accept')).toBe('application/json');
    expect(header(call, 'authorization')).toBe(EXPECTED_AUTHORIZATION);
  });

  it('version=I를 그대로 싣는다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TABL_OK]);
    await channel.callDdicTablRead({ name: 'ZFOO', version: 'I' });
    expect(nth(spy.calls, 1).url).toContain("IV_VERSION='I'");
  });

  it('이름의 작은따옴표는 OData v2 리터럴 규칙으로 두 배가 된다', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TABL_OK]);
    await channel.callDdicTablRead({ name: "Z'X" });
    expect(nth(spy.calls, 1).url).toContain("IV_NAME='Z''X'");
  });

  it('CSRF 토큰을 먼저 긁어온다 — $metadata 한 번, 본 요청 한 번', async () => {
    const { channel, spy } = channelWith([csrfIssued(), TABL_OK]);
    await channel.callDdicTablRead({ name: 'ZFOO' });
    expect(spy.calls).toHaveLength(2);
    expect(nth(spy.calls, 0).url).toContain('$metadata');
  });
});

describe('DDIC 브리지 — 응답 정규화', () => {
  it('이름으로 감싼 봉투(Form A)를 푼다', async () => {
    const { channel } = channelWith([csrfIssued(), TABL_OK]);
    const result = await channel.callDdicTablRead({ name: 'ZFOO' });
    expect(result.subrc).toBe(0);
    expect(result.message).toBe('TABL ZFOO: 2 field(s), tabclass=TRANSP');
    expect(result.result).toEqual({ name: 'ZFOO', kind: 'TABL', fields: [] });
  });

  it('직결 봉투(Form B)도 푼다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{"name":"ZBAR"}' }),
    ]);
    const result = await channel.callDdicTablRead({ name: 'ZBAR' });
    expect(result.result).toEqual({ name: 'ZBAR' });
  });

  it('EV_RESULT가 비었거나 JSON이 아니면 빈 객체로 떨어진다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '' }),
    ]);
    expect((await channel.callDdicTablRead({ name: 'ZFOO' })).result).toEqual({});

    const broken = channelWith([
      csrfIssued(),
      functionImportOk({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: 'not json' }),
    ]);
    expect((await broken.channel.callDdicTablRead({ name: 'ZFOO' })).result).toEqual({});
  });

  it('subrc=4는 던지지 않는다 — 결과와 함께 돌아온다 (문턱은 8)', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({
        DdicTablRead: { EV_SUBRC: 4, EV_MESSAGE: 'Table ZNOPE not found', EV_RESULT: '' },
      }),
    ]);
    const result = await channel.callDdicTablRead({ name: 'ZNOPE' });
    expect(result.subrc).toBe(4);
    expect(result.message).toBe('Table ZNOPE not found');
    expect(result.result).toEqual({});
  });

  it('subrc=8은 sap 오류이고 문구는 구 엔진 글자 그대로다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({
        DdicTablRead: { EV_SUBRC: 8, EV_MESSAGE: 'DDIC read failed', EV_RESULT: '' },
      }),
    ]);
    const error = (await channel
      .callDdicTablRead({ name: 'ZFOO' })
      .catch((e: unknown) => e)) as RfcError;

    expect(error).toBeInstanceOf(RfcError);
    expect(error.kind).toBe('sap');
    expect(error.backend).toBe('odata');
    expect(error.subrc).toBe(8);
    expect(error.sapMessage).toBe('DDIC read failed');
    expect(error.functionModule).toBe('ZMCP_ADT_DDIC_TABL_READ');
    expect(error.message).toBe(
      'ZMCP_ADT_DDIC_TABL_READ error (name=ZFOO, subrc=8): DDIC read failed',
    );
  });

  it('subrc가 8보다 크면 마찬가지로 던진다', async () => {
    const { channel } = channelWith([
      csrfIssued(),
      functionImportOk({
        DdicTablRead: { EV_SUBRC: 12, EV_MESSAGE: 'boom', EV_RESULT: '' },
      }),
    ]);
    const error = (await channel
      .callDdicTablRead({ name: 'ZFOO' })
      .catch((e: unknown) => e)) as RfcError;
    expect(error.subrc).toBe(12);
  });
});

describe('DDIC 브리지 — 통로 선택', () => {
  it('SAP_RFC_BACKEND 미설정·빈 값이면 odata로 동작한다', async () => {
    const withEmpty = channelWith([csrfIssued(), TABL_OK], rfcEnv({ SAP_RFC_BACKEND: '  ' }));
    await expect(withEmpty.channel.callDdicTablRead({ name: 'ZFOO' })).resolves.toMatchObject({
      subrc: 0,
    });
  });

  it.each(['soap', 'native', 'gateway', 'zrfc'])(
    '%s를 고르면 요청을 한 건도 보내지 않고 정직하게 실패한다',
    (backend) => {
      const spy = scripted([csrfIssued(), TABL_OK]);
      expect(() =>
        createDdicReadChannel({
          connection: fakeConnection(),
          env: rfcEnv({ SAP_RFC_BACKEND: backend }),
          transport: spy.transport,
        }),
      ).toThrow(RfcError);
      expect(spy.calls).toHaveLength(0);
    },
  );

  it('그 실패는 SAP_RFC_BACKEND=odata를 지목한다', () => {
    const error = (() => {
      try {
        createDdicReadChannel({
          connection: fakeConnection(),
          env: rfcEnv({ SAP_RFC_BACKEND: 'soap' }),
        });
        return null;
      } catch (e: unknown) {
        return e as RfcError;
      }
    })();

    expect(error?.kind).toBe('config');
    expect(error?.backend).toBe('soap');
    expect(error?.message).toContain('SAP_RFC_BACKEND=odata');
  });

  it('알 수 없는 통로 이름은 선택 계약대로 거부된다', () => {
    expect(() =>
      createDdicReadChannel({
        connection: fakeConnection(),
        env: rfcEnv({ SAP_RFC_BACKEND: 'bogus' }),
      }),
    ).toThrow(/must be/);
  });
});

describe('기존 공개 표면 불변', () => {
  it('odata 통로는 세 호출을 모두 갖는다', () => {
    const spy = scripted([csrfIssued(), TABL_OK]);
    const channel = createODataChannel({
      connection: fakeConnection(),
      env: rfcEnv(),
      transport: spy.transport,
    });
    expect(typeof channel.callDispatch).toBe('function');
    expect(typeof channel.callTextpool).toBe('function');
    expect(typeof channel.callDdicTablRead).toBe('function');
  });

  it('createRfcChannel은 그대로 RfcChannel을 준다', () => {
    const spy = scripted([csrfIssued(), TABL_OK]);
    const channel = createRfcChannel({
      connection: fakeConnection(),
      env: rfcEnv(),
      transport: spy.transport,
    });
    expect(channel.backend).toBe('odata');
    expect(typeof channel.callDispatch).toBe('function');
  });
});
