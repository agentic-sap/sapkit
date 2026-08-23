/**
 * native 통로 — 통로 생성 계약 · 접속 인자 조립 · 요청 조립 · 오류 종류 · 타임아웃.
 *
 * 대조 원본은 `engine/src/lib/nativeRfc.ts`와 그 구 시험
 * `engine/src/__tests__/lib/nativeRfc.test.ts`다. 구 시험이 `jest.mock('node-rfc',
 * …, { virtual: true })`로 애드온을 통째로 가짜로 세운 자리를, 여기서는 통로가
 * 공개한 `createPool` 이음매 주입으로 대신한다 — 결과는 같고(네이티브 SDK 없이
 * 돌아간다) 전역 모듈 레지스트리를 흔들지 않는다.
 *
 * **SAP에 접속하지 않는다.** 여기 쓰이는 호스트·계정·비밀번호는 전부 명백한 가짜다.
 */

import { RfcError } from '../errors';
import { createNativeChannel } from '../native';
import type {
  NativeRfcClient,
  NativeRfcPool,
  NativeRfcPoolFactory,
  NativeRfcPoolInit,
} from '../native';
import { fakeConnection } from './support';

/** 영영 끝나지 않는 단계(타임아웃 시험용). */
const NEVER = Symbol('영영 끝나지 않는 호출');
type Step = Record<string, unknown> | Error | typeof NEVER;

interface PoolSpy {
  readonly inits: NativeRfcPoolInit[];
  readonly calls: { functionModule: string; params: Readonly<Record<string, unknown>> }[];
  readonly released: NativeRfcClient[];
  acquires: number;
  readonly factory: NativeRfcPoolFactory;
}

function poolSpy(
  options: {
    steps?: readonly Step[];
    acquire?: typeof NEVER | Error;
    factoryError?: Error;
  } = {},
): PoolSpy {
  const steps = options.steps ?? [];
  const spy: PoolSpy = {
    inits: [],
    calls: [],
    released: [],
    acquires: 0,
    factory: (init) => {
      spy.inits.push(init);
      if (options.factoryError) throw options.factoryError;
      return pool;
    },
  };

  const client: NativeRfcClient = {
    call: (functionModule, params) => {
      const index = spy.calls.length;
      spy.calls.push({ functionModule, params });
      const step = steps[index] ?? steps[steps.length - 1];
      if (step === NEVER) return new Promise<Record<string, unknown>>(() => undefined);
      if (step instanceof Error) return Promise.reject(step);
      return Promise.resolve(step ?? {});
    },
  };

  const pool: NativeRfcPool = {
    acquire: () => {
      spy.acquires += 1;
      if (options.acquire === NEVER) return new Promise<NativeRfcClient>(() => undefined);
      if (options.acquire instanceof Error) return Promise.reject(options.acquire);
      return Promise.resolve(client);
    },
    release: (used) => {
      spy.released.push(used);
      return Promise.resolve();
    },
  };

  return spy;
}

/** 응용서버 직결 갈래의 최소 완전 설정. */
function directEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SAP_RFC_ASHOST: 's4h.example.test',
    SAP_RFC_SYSNR: '00',
    SAP_RFC_CLIENT: '100',
    SAP_RFC_USER: 'MCP_RFC',
    SAP_RFC_PASSWD: 'not-a-real-secret',
    ...overrides,
  };
}

/** 메시지서버 · 부하분산 갈래의 최소 완전 설정. */
function messageServerEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SAP_RFC_MSHOST: 'msrv.example.test',
    SAP_RFC_SYSID: 'S4H',
    SAP_RFC_CLIENT: '100',
    SAP_RFC_USER: 'MCP_RFC',
    SAP_RFC_PASSWD: 'not-a-real-secret',
    ...overrides,
  };
}

const DISPATCH_OK = { EV_SUBRC: 0, EV_MESSAGE: 'ok', EV_RESULT: '{"CUA":[]}' };

function channelWith(env: Record<string, string>, spy: PoolSpy, longMs?: number) {
  const base = fakeConnection();
  return createNativeChannel({
    connection:
      longMs === undefined
        ? base
        : fakeConnection({ timeouts: { ...base.timeouts, long: longMs } }),
    env,
    createPool: spy.factory,
  });
}

async function caught(work: Promise<unknown>): Promise<RfcError> {
  const error = await work.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RfcError);
  return error as RfcError;
}

describe('native 통로 — 통로 생성 계약 (D12)', () => {
  it('통로 이름은 native다', () => {
    expect(channelWith(directEnv(), poolSpy()).backend).toBe('native');
  });

  it.each([
    ['SAP_RFC_USER', { SAP_RFC_USER: '' }],
    ['SAP_RFC_PASSWD', { SAP_RFC_PASSWD: '' }],
    ['SAP_RFC_CLIENT', { SAP_RFC_CLIENT: '' }],
    ['SAP_RFC_SYSNR', { SAP_RFC_SYSNR: '' }],
  ])('%s가 없으면 생성 시점에 config 오류로 그 키를 지목한다', (key, missing) => {
    const spy = poolSpy();
    const error = (() => {
      try {
        channelWith(directEnv(missing), spy);
      } catch (e: unknown) {
        return e;
      }
      throw new Error('통로가 만들어졌다 — 생성 시점에 막혔어야 한다');
    })() as RfcError;

    expect(error).toBeInstanceOf(RfcError);
    expect(error.kind).toBe('config');
    expect(error.backend).toBe('native');
    expect(error.message).toContain(
      `${key} is required for SAP_RFC_BACKEND=native but not set in sap.env`,
    );
    // 네이티브 런타임에는 손도 대지 않았다.
    expect(spy.inits).toHaveLength(0);
  });

  it('ASHOST도 MSHOST도 없으면 SAP_RFC_ASHOST를 지목한다', () => {
    const error = (() => {
      try {
        createNativeChannel({
          connection: fakeConnection(),
          env: { SAP_RFC_CLIENT: '100', SAP_RFC_USER: 'x', SAP_RFC_PASSWD: 'y' },
          createPool: poolSpy().factory,
        });
      } catch (e: unknown) {
        return e;
      }
      throw new Error('통로가 만들어졌다');
    })() as RfcError;
    expect(error.kind).toBe('config');
    expect(error.message).toContain('SAP_RFC_ASHOST is required');
    expect(error.message).toContain('mutually exclusive');
  });

  it('MSHOST만 있고 SYSID가 없으면 SAP_RFC_SYSID를 지목한다', () => {
    const error = (() => {
      try {
        channelWith(messageServerEnv({ SAP_RFC_SYSID: '' }), poolSpy());
      } catch (e: unknown) {
        return e;
      }
      throw new Error('통로가 만들어졌다');
    })() as RfcError;
    expect(error.kind).toBe('config');
    expect(error.message).toContain('SAP_RFC_SYSID is required');
  });

  it.each(['SAP_RFC_SNC_MYNAME', 'SAP_RFC_SNC_PARTNERNAME'])(
    'SNC를 켜면 %s가 필수가 된다',
    (key) => {
      const env = directEnv({
        SAP_RFC_SNC_QOP: '8',
        SAP_RFC_SNC_MYNAME: 'p:CN=MCP',
        SAP_RFC_SNC_PARTNERNAME: 'p:CN=S4H',
        [key]: '',
      });
      const error = (() => {
        try {
          channelWith(env, poolSpy());
        } catch (e: unknown) {
          return e;
        }
        throw new Error('통로가 만들어졌다');
      })() as RfcError;
      expect(error.kind).toBe('config');
      expect(error.message).toContain(`${key} is required`);
    },
  );

  it('설정이 온전하면 생성은 성공하고 네이티브 런타임은 아직 적재하지 않는다', () => {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    const channel = channelWith(directEnv(), spy);
    expect(channel).toBeDefined();
    // 구 엔진과 같은 지연 적재 시점 — 풀은 첫 호출에서 만들어진다.
    expect(spy.inits).toHaveLength(0);
    expect(spy.acquires).toBe(0);
  });
});

describe('native 통로 — 접속 인자 조립 (구 대조)', () => {
  async function paramsFor(env: Record<string, string>): Promise<Record<string, string>> {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    await channelWith(env, spy).callDispatch('PING', {});
    const init = spy.inits[0];
    if (!init) throw new Error('풀이 만들어지지 않았다');
    return init.connectionParameters as Record<string, string>;
  }

  it('응용서버 직결 — ashost/sysnr, lang 기본 EN, mshost 없음', async () => {
    const params = await paramsFor(directEnv());
    expect(params).toEqual({
      user: 'MCP_RFC',
      passwd: 'not-a-real-secret',
      client: '100',
      lang: 'EN',
      ashost: 's4h.example.test',
      sysnr: '00',
    });
  });

  it('메시지서버 — mshost/sysid, group 기본 PUBLIC, ashost/sysnr 없음', async () => {
    const params = await paramsFor(messageServerEnv());
    expect(params).toEqual({
      user: 'MCP_RFC',
      passwd: 'not-a-real-secret',
      client: '100',
      lang: 'EN',
      mshost: 'msrv.example.test',
      sysid: 'S4H',
      group: 'PUBLIC',
    });
  });

  it('MSHOST가 있으면 ASHOST/SYSNR은 쳐다보지 않는다 (배타)', async () => {
    const params = await paramsFor(
      messageServerEnv({ SAP_RFC_ASHOST: 's4h.example.test', SAP_RFC_SYSNR: '00' }),
    );
    expect(params.mshost).toBe('msrv.example.test');
    expect(params.ashost).toBeUndefined();
    expect(params.sysnr).toBeUndefined();
  });

  it('GROUP·MSSERV·LANG 재정의를 반영한다', async () => {
    const params = await paramsFor(
      messageServerEnv({
        SAP_RFC_GROUP: 'PROD',
        SAP_RFC_MSSERV: 'sapms36',
        SAP_RFC_LANG: 'KO',
      }),
    );
    expect(params.group).toBe('PROD');
    expect(params.msserv).toBe('sapms36');
    expect(params.lang).toBe('KO');
  });

  it('SNC_QOP를 켜면 SNC 4종이 붙는다', async () => {
    const params = await paramsFor(
      directEnv({
        SAP_RFC_SNC_QOP: '8',
        SAP_RFC_SNC_MYNAME: 'p:CN=MCP',
        SAP_RFC_SNC_PARTNERNAME: 'p:CN=S4H',
        SAP_RFC_SNC_LIB: '/usr/sap/snc.so',
      }),
    );
    expect(params.snc_qop).toBe('8');
    expect(params.snc_myname).toBe('p:CN=MCP');
    expect(params.snc_partnername).toBe('p:CN=S4H');
    expect(params.snc_lib).toBe('/usr/sap/snc.so');
  });

  it('SNC를 안 켜면 SNC 키는 하나도 붙지 않는다', async () => {
    const params = await paramsFor(directEnv({ SAP_RFC_SNC_LIB: '/usr/sap/snc.so' }));
    expect(Object.keys(params).filter((key) => key.startsWith('snc_'))).toEqual([]);
  });

  it('풀 옵션이 구 엔진과 같다 (low 0 · high 3 · idleTimeout 300)', async () => {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    await channelWith(directEnv(), spy).callDispatch('PING', {});
    expect(spy.inits[0]?.poolOptions).toEqual({ low: 0, high: 3, idleTimeout: 300 });
  });

  it('풀은 한 번만 만든다 — 호출 세 번에 생성 한 번', async () => {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    const channel = channelWith(directEnv(), spy);
    await channel.callDispatch('PING', {});
    await channel.callDispatch('PING', {});
    await channel.callDispatch('PING', {});
    expect(spy.inits).toHaveLength(1);
    expect(spy.acquires).toBe(3);
    expect(spy.released).toHaveLength(3);
  });
});

describe('native 통로 — 요청 조립 (구 대조)', () => {
  it('Dispatch — FM 이름과 IV_ACTION·IV_PARAMS가 구와 같다', async () => {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    await channelWith(directEnv(), spy).callDispatch('CUA_FETCH', { program: 'Z_FOO' });
    expect(spy.calls).toEqual([
      {
        functionModule: 'ZSAPKIT_ADT_DISPATCH',
        params: { IV_ACTION: 'CUA_FETCH', IV_PARAMS: '{"program":"Z_FOO"}' },
      },
    ]);
  });

  it('Dispatch — params가 없으면 빈 객체로 직렬화한다', async () => {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    await channelWith(directEnv(), spy).callDispatch('CUA_FETCH');
    expect(spy.calls[0]?.params).toEqual({ IV_ACTION: 'CUA_FETCH', IV_PARAMS: '{}' });
  });

  it('Textpool — 인자 4종을 싣고 빈 값은 빈 문자열로 채운다', async () => {
    const spy = poolSpy({ steps: [{ EV_SUBRC: 0, EV_RESULT: '[]' }] });
    await channelWith(directEnv(), spy).callTextpool('READ', { program: 'Z_FOO' });
    expect(spy.calls).toEqual([
      {
        functionModule: 'ZSAPKIT_ADT_TEXTPOOL',
        params: {
          IV_ACTION: 'READ',
          IV_PROGRAM: 'Z_FOO',
          IV_LANGUAGE: '',
          IV_TEXTPOOL_JSON: '',
        },
      },
    ]);
  });

  it('Textpool — WRITE 페이로드를 그대로 싣는다', async () => {
    const spy = poolSpy({ steps: [{ EV_SUBRC: 0, EV_RESULT: '[]' }] });
    await channelWith(directEnv(), spy).callTextpool('WRITE', {
      program: 'Z_FOO',
      language: 'EN',
      textpoolJson: '[{"ID":"T","KEY":"R","ENTRY":"Hi","LENGTH":2}]',
    });
    expect(spy.calls[0]?.params).toEqual({
      IV_ACTION: 'WRITE',
      IV_PROGRAM: 'Z_FOO',
      IV_LANGUAGE: 'EN',
      IV_TEXTPOOL_JSON: '[{"ID":"T","KEY":"R","ENTRY":"Hi","LENGTH":2}]',
    });
  });
});

describe('native 통로 — 결과 정규화', () => {
  it('Dispatch 성공 세 값을 그대로 되돌린다', async () => {
    const spy = poolSpy({ steps: [{ EV_SUBRC: 0, EV_MESSAGE: 'ok', EV_RESULT: '{"rows":3}' }] });
    const result = await channelWith(directEnv(), spy).callDispatch('CUA_FETCH', {});
    expect(result).toEqual({ result: { rows: 3 }, subrc: 0, message: 'ok' });
  });

  it('Dispatch — EV_RESULT가 JSON이 아니면 빈 객체로 떨어진다', async () => {
    const spy = poolSpy({ steps: [{ EV_SUBRC: 0, EV_RESULT: 'NOT JSON' }] });
    const result = await channelWith(directEnv(), spy).callDispatch('PING', {});
    expect(result.result).toEqual({});
  });

  it('Textpool — EV_RESULT가 없으면 빈 배열로 떨어진다', async () => {
    const spy = poolSpy({ steps: [{ EV_SUBRC: 0 }] });
    const result = await channelWith(directEnv(), spy).callTextpool('READ', { program: 'Z_FOO' });
    expect(result.result).toEqual([]);
  });

  it('Textpool — READ 결과를 배열로 되돌린다', async () => {
    const rows = [{ ID: 'T', KEY: 'R', ENTRY: 'Hello', LENGTH: 5 }];
    const spy = poolSpy({ steps: [{ EV_SUBRC: 0, EV_RESULT: JSON.stringify(rows) }] });
    const result = await channelWith(directEnv(), spy).callTextpool('READ', {
      program: 'Z_FOO',
      language: 'EN',
    });
    expect(result.result).toEqual(rows);
  });
});

describe('native 통로 — 오류 종류가 구별된다', () => {
  it('subrc != 0은 sap 오류이고 문구가 구 엔진 글자 그대로다', async () => {
    const spy = poolSpy({
      steps: [{ EV_SUBRC: 4, EV_MESSAGE: 'program not found', EV_RESULT: '{}' }],
    });
    const error = await caught(channelWith(directEnv(), spy).callDispatch('CUA_FETCH', {}));
    expect(error.kind).toBe('sap');
    expect(error.backend).toBe('native');
    expect(error.subrc).toBe(4);
    expect(error.sapMessage).toBe('program not found');
    expect(error.action).toBe('CUA_FETCH');
    expect(error.functionModule).toBe('ZSAPKIT_ADT_DISPATCH');
    expect(error.message).toBe(
      'ZSAPKIT_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): program not found',
    );
  });

  it('Textpool의 subrc != 0도 같은 형식이다', async () => {
    const spy = poolSpy({
      steps: [{ EV_SUBRC: 8, EV_MESSAGE: 'auth missing', EV_RESULT: '[]' }],
    });
    const error = await caught(
      channelWith(directEnv(), spy).callTextpool('READ', { program: 'Z_FOO' }),
    );
    expect(error.kind).toBe('sap');
    expect(error.message).toBe('ZSAPKIT_ADT_TEXTPOOL error (action=READ, subrc=8): auth missing');
  });

  it('네이티브 호출이 던지면 network 오류로 정규화하고 원문·cause를 보존한다', async () => {
    const cause = new Error('RFC_COMMUNICATION_FAILURE');
    const spy = poolSpy({ steps: [cause] });
    const error = await caught(channelWith(directEnv(), spy).callDispatch('PING', {}));
    expect(error.kind).toBe('network');
    expect(error.backend).toBe('native');
    expect(error.functionModule).toBe('ZSAPKIT_ADT_DISPATCH');
    expect(error.message).toContain('RFC_COMMUNICATION_FAILURE');
    expect(error.cause).toBe(cause);
  });

  it('호출이 던져도 클라이언트는 풀로 돌아간다', async () => {
    const spy = poolSpy({ steps: [new Error('RFC_COMMUNICATION_FAILURE')] });
    await caught(channelWith(directEnv(), spy).callDispatch('PING', {}));
    expect(spy.released).toHaveLength(1);
  });

  it('연결 획득 실패도 network 오류다', async () => {
    const spy = poolSpy({ acquire: new Error('pool exhausted') });
    const error = await caught(channelWith(directEnv(), spy).callDispatch('PING', {}));
    expect(error.kind).toBe('network');
    expect(error.message).toContain('연결 획득');
    // 획득하지 못한 클라이언트를 되돌리려 하지 않는다.
    expect(spy.released).toHaveLength(0);
  });

  it('풀 생성 실패는 config 오류이고, 두 번째 호출은 같은 오류로 즉시 끝난다', async () => {
    const spy = poolSpy({ factoryError: new Error('libsapnwrfc not found') });
    const channel = channelWith(directEnv(), spy);
    const first = await caught(channel.callDispatch('PING', {}));
    const second = await caught(channel.callDispatch('PING', {}));

    expect(first.kind).toBe('config');
    expect(first.message).toContain('libsapnwrfc not found');
    expect(second).toBe(first);
    // 적재를 다시 시도하지 않는다 — 구 엔진의 loadErr 캐시와 같은 자리다.
    expect(spy.inits).toHaveLength(1);
  });

  it('오류 종류 넷이 서로 다르다 — config · sap · network · timeout', async () => {
    const kinds = new Set<string>();

    kinds.add(
      (
        await caught(
          channelWith(directEnv(), poolSpy({ factoryError: new Error('x') })).callDispatch('P'),
        )
      ).kind,
    );
    kinds.add(
      (await caught(channelWith(directEnv(), poolSpy({ steps: [{ EV_SUBRC: 4 }] })).callDispatch('P')))
        .kind,
    );
    kinds.add(
      (
        await caught(
          channelWith(directEnv(), poolSpy({ steps: [new Error('boom')] })).callDispatch('P'),
        )
      ).kind,
    );
    kinds.add(
      (
        await caught(
          channelWith(directEnv(), poolSpy({ steps: [NEVER] }), 20).callDispatch('P'),
        )
      ).kind,
    );

    expect([...kinds].sort()).toEqual(['config', 'network', 'sap', 'timeout']);
  });
});

describe('native 통로 — 타임아웃 노브가 실제로 먹는다 (D11)', () => {
  it.each([25, 45])('호출이 안 끝나면 설정한 %ims에서 timeout 오류가 난다', async (longMs) => {
    const spy = poolSpy({ steps: [NEVER] });
    const started = Date.now();
    const error = await caught(
      channelWith(directEnv(), spy, longMs).callDispatch('CUA_FETCH', {}),
    );
    expect(error.kind).toBe('timeout');
    expect(error.backend).toBe('native');
    expect(error.functionModule).toBe('ZSAPKIT_ADT_DISPATCH');
    // 노브의 값이 그대로 상한이 된다 — 하드코딩된 다른 값이 아니다.
    expect(error.message).toContain(`${longMs}ms`);
    expect(Date.now() - started).toBeGreaterThanOrEqual(longMs - 5);
  });

  it('연결 획득이 안 끝나도 같은 예산에 걸린다', async () => {
    const spy = poolSpy({ acquire: NEVER });
    const error = await caught(channelWith(directEnv(), spy, 25).callDispatch('PING', {}));
    expect(error.kind).toBe('timeout');
    expect(error.message).toContain('연결 획득');
  });

  it('제때 끝나는 호출은 타임아웃이 잡지 않는다', async () => {
    const spy = poolSpy({ steps: [DISPATCH_OK] });
    const result = await channelWith(directEnv(), spy, 25).callDispatch('CUA_FETCH', {});
    expect(result.subrc).toBe(0);
  });

  it('미설정 시 프로파일 기본값 60000ms가 그대로 상한이 된다 (구 60초와 같은 값)', async () => {
    // `src/profile/resolve.ts:38` — SAP_TIMEOUT_LONG 미설정 시 60000ms.
    // 통로는 그 값을 손대지 않고 그대로 쓴다.
    jest.useFakeTimers();
    try {
      const spy = poolSpy({ steps: [NEVER] });
      const base = fakeConnection();
      const channel = createNativeChannel({
        connection: fakeConnection({ timeouts: { ...base.timeouts, long: 60_000 } }),
        env: directEnv(),
        createPool: spy.factory,
      });
      const pending = channel.callDispatch('CUA_FETCH', {});
      const settled = jest.fn();
      pending.catch(settled);

      await jest.advanceTimersByTimeAsync(59_999);
      expect(settled).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(2);
      const error = await caught(pending);
      expect(error.kind).toBe('timeout');
      expect(error.message).toContain('60000ms');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('native 통로 — 실물 네이티브 런타임 (오프라인 한계)', () => {
  const installed = (() => {
    try {
      require.resolve('node-rfc');
      return true;
    } catch {
      return false;
    }
  })();

  // node-rfc가 설치된 머신에서는 이 시험의 전제(모듈 부재)가 성립하지 않는다.
  const maybe = installed ? it.skip : it;

  maybe('createPool을 주입하지 않으면 node-rfc를 적재하고, 없으면 config 오류다', async () => {
    const channel = createNativeChannel({ connection: fakeConnection(), env: directEnv() });
    const error = await caught(channel.callDispatch('PING', {}));
    expect(error.kind).toBe('config');
    expect(error.backend).toBe('native');
    expect(error.message).toContain('node-rfc could not be loaded');
    expect(error.message).toContain('SAPNWRFC_HOME');
  });
});
