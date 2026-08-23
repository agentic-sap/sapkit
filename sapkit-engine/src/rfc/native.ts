/**
 * `native` 통로 — 이 호스트에 설치된 SAP NW RFC SDK를 `node-rfc`로 타서
 * 기설치 함수모듈 `ZSAPKIT_ADT_DISPATCH` / `ZSAPKIT_ADT_TEXTPOOL`을 **RFC 프로토콜로
 * 직접** 부른다. HTTP를 거치지 않으므로 CSRF·쿠키·URL 조립이 통째로 없고,
 * 그 자리를 접속 인자(connection parameters) 조립이 대신한다.
 *
 * 읽은 참조 원본(전부 읽기 전용):
 *   - `engine/src/lib/nativeRfc.ts`                       — **주 참조 원본**. 인자 조립·풀·호출·정규화 전부
 *   - `engine/src/__tests__/lib/nativeRfc.test.ts`        — 구 계약을 못박은 시험(인자 조립의 사실상 정본)
 *   - `engine/src/lib/rfcBackend.ts:32-48`                — 통로 선택 계약과 `native` 분기
 *   - `engine/src/lib/odataRfc.ts:51-70`·`:277`·`:321`    — 이미 승계한 통로(타임아웃·필수 env·오류 문구 비교 기준)
 *   - `engine/src/server/launcher.ts:95-105`              — `SAP_RFC_*` 키가 프로파일에서 넘어오는 규칙
 *   - `interactive/core/procedures/troubleshooting.md` §3 — 통로별 env 키의 문서 정본(필수/기본값/배타 규칙)
 *   - `sapkit-engine/src/rfc/odata.ts`                    — 이 레포에서 이미 지어진 통로. 모양을 여기 맞췄다
 *
 * 필요한 env (활성 프로파일의 `sap.env` → `mergeRfcEnv`):
 *   SAP_RFC_USER · SAP_RFC_PASSWD · SAP_RFC_CLIENT            (항상 필수)
 *   SAP_RFC_LANG                                              (기본 `EN`)
 *   (SAP_RFC_ASHOST + SAP_RFC_SYSNR)                          — 응용서버 직결
 *   또는 (SAP_RFC_MSHOST + SAP_RFC_SYSID [+ _GROUP·_MSSERV])  — 메시지서버 부하분산
 *   SAP_RFC_SNC_QOP를 켜면 SAP_RFC_SNC_MYNAME·_PARTNERNAME이 필수가 되고
 *   SAP_RFC_SNC_LIB는 선택이다.
 * 타임아웃만 `ConnectionConfig`에서 온다 — **자격증명은 오지 않는다.** 구 엔진의
 * native 통로는 ADT 접속과 **다른 기술 사용자**로 로그온하도록 설계돼 있고
 * (`nativeRfc.ts:78-108`은 `process.env`의 `SAP_RFC_*`만 읽는다), 그 분리를
 * 깨고 ADT 자격증명을 RFC로 흘려보내는 것은 승계가 아니라 새 설계다.
 *
 * **오프라인 한계 — 이 통로의 실행 경로는 이 판에서 닫히지 않는다.**
 * `node-rfc`는 컴파일된 네이티브 애드온이고 유료 배포물인 SAP NW RFC SDK 7.50+를
 * 요구한다. 구 엔진에서도 **선택적 의존**(`engine/package.json`의
 * `optionalDependencies`)이고 이 머신에는 설치돼 있지 않으며, 신 엔진의 의존성에
 * 추가하는 것은 이 판의 범위 밖이다. 그래서 여기서 오프라인으로 확정하는 것은
 * **통로 생성 계약 · 접속 인자 조립 · 요청 조립 · 오류 종류 · 타임아웃**까지이고,
 * 실제 디스패치는 SDK가 있는 머신에서만 돈다
 * (차이 장부 `harness/DIVERGENCES.md`의 native 통로 항목).
 * 그 한계를 시험 가능하게 만드는 것이 아래 `createPool` 이음매다 — `odata` 통로의
 * `transport` 주입과 같은 자리이며, **다른 통로로 넘어가는 대체 경로가 아니다.**
 */

import type { ConnectionConfig } from '../contracts';
import { RfcError } from './errors';
import type {
  DispatchResult,
  RfcChannel,
  TextpoolAction,
  TextpoolParams,
  TextpoolResult,
} from './types';

const BACKEND = 'native' as const;
const DISPATCH_FM = 'ZSAPKIT_ADT_DISPATCH';
const TEXTPOOL_FM = 'ZSAPKIT_ADT_TEXTPOOL';
const DEFAULT_LANG = 'EN';
const DEFAULT_GROUP = 'PUBLIC';

/** 구 엔진과 같은 풀 크기 — `engine/src/lib/nativeRfc.ts:65`. */
const POOL_OPTIONS = { low: 0, high: 3, idleTimeout: 300 } as const;

/**
 * `node-rfc` 클라이언트 중 이 통로가 실제로 쓰는 표면.
 *
 * 구 엔진도 애드온의 타입을 가져오지 않고 자기 파일 안에 같은 모양을 직접 적어
 * 뒀다(`engine/src/lib/nativeRfc.ts:24-34`). SDK 없는 머신에서 타입 검사가 돌아야
 * 하기 때문이고, 그 지역 선언이 우리가 묶여 있는 유일한 계약이다.
 */
export interface NativeRfcClient {
  call(
    functionModule: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>>;
}

export interface NativeRfcPool {
  acquire(): Promise<NativeRfcClient>;
  release(client: NativeRfcClient): Promise<void>;
}

/** `new Pool(...)`에 넘기는 것. 구 엔진의 생성 인자와 같은 두 필드다. */
export interface NativeRfcPoolInit {
  readonly connectionParameters: Readonly<Record<string, string>>;
  readonly poolOptions: {
    readonly low: number;
    readonly high: number;
    readonly idleTimeout: number;
  };
}

export type NativeRfcPoolFactory = (init: NativeRfcPoolInit) => NativeRfcPool;

export interface NativeChannelOptions {
  readonly connection: ConnectionConfig;
  /** `SAP_RFC_*` 키들. `mergeRfcEnv`가 만든 것을 그대로 받는다. */
  readonly env: Readonly<Record<string, string>>;
  /**
   * 네이티브 런타임 교체점(시험·기록/재생용). 기본은 `node-rfc` 지연 적재.
   * `odata` 통로의 `transport`와 같은 성격이며, 주입하지 않으면 실물을 쓴다.
   */
  readonly createPool?: NativeRfcPoolFactory;
}

/**
 * native 통로 하나를 만든다.
 *
 * `odata`와 달리 `DdicReadChannel`은 구현하지 않는다 — ECC DDIC 브리지 함수모듈은
 * OData 서비스의 FunctionImport로만 노출돼 있어 RFC 직결로는 닿을 길이 아예 없다
 * (`engine/src/lib/rfcBackend.ts:94-132` · `src/rfc/types.ts`의 `DdicReadChannel` 주석).
 */
export function createNativeChannel(options: NativeChannelOptions): RfcChannel {
  return new NativeChannel(options);
}

class NativeChannel implements RfcChannel {
  readonly backend = BACKEND;

  private readonly connection: ConnectionConfig;
  private readonly connectionParameters: Readonly<Record<string, string>>;
  private readonly createPool: NativeRfcPoolFactory;

  private pooled: NativeRfcPool | null = null;
  private poolError: RfcError | null = null;

  constructor(options: NativeChannelOptions) {
    this.connection = options.connection;
    this.createPool = options.createPool ?? nodeRfcPoolFactory;
    // D12 — 통로를 세우는 시점에 필수 설정을 확정한다. 구 엔진은 이 조립을 첫
    // 호출의 `getPool()` 안에서 해서(`nativeRfc.ts:44-61`), 설정이 빠졌다는
    // 사실이 실제 SAP 호출 시점에야 드러난다.
    this.connectionParameters = readNativeConnectionParams(options.env);
  }

  async callDispatch(
    action: string,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<DispatchResult> {
    const raw = await this.callFunctionModule(DISPATCH_FM, {
      IV_ACTION: action,
      IV_PARAMS: JSON.stringify(params ?? {}),
    });
    return unwrap(raw, { functionModule: DISPATCH_FM, action, emptyResult: {} });
  }

  async callTextpool(action: TextpoolAction, params: TextpoolParams): Promise<TextpoolResult> {
    const raw = await this.callFunctionModule(TEXTPOOL_FM, {
      IV_ACTION: action,
      IV_PROGRAM: params.program,
      IV_LANGUAGE: params.language ?? '',
      IV_TEXTPOOL_JSON: params.textpoolJson ?? '',
    });
    return unwrap(raw, { functionModule: TEXTPOOL_FM, action, emptyResult: [] });
  }

  // ------------------------------------------------------------ 내부 구현

  /**
   * 네이티브 런타임 적재와 풀 생성은 **첫 호출까지 미룬다** — 구 엔진의
   * `getPool()`과 같은 시점이다(`nativeRfc.ts:44-76`). 통로 객체 하나를 만드는
   * 일이 컴파일된 애드온을 끌어오는 부작용을 내면 안 되기 때문이고, D12가 앞당긴
   * 것은 **설정 확인**이지 런타임 적재가 아니다.
   *
   * 실패는 구와 같이 **기억한다** — 두 번째 호출이 같은 적재를 다시 시도하지
   * 않고 같은 오류로 즉시 끝난다(`nativeRfc.ts:46`·`:53`·`:68`).
   */
  private pool(): NativeRfcPool {
    if (this.pooled) return this.pooled;
    if (this.poolError) throw this.poolError;
    try {
      this.pooled = this.createPool({
        connectionParameters: this.connectionParameters,
        poolOptions: POOL_OPTIONS,
      });
    } catch (error) {
      this.poolError =
        error instanceof RfcError
          ? error
          : new RfcError({
              kind: 'config',
              backend: BACKEND,
              message:
                `node-rfc Pool could not be initialised for SAP_RFC_BACKEND=native. ` +
                `Check that libsapnwrfc is resolvable (SAPNWRFC_HOME) and that the SAP_RFC_* ` +
                `connection keys are complete in the active profile's sap.env. ` +
                `Original error: ${describe(error)}`,
              cause: error,
            });
      throw this.poolError;
    }
    return this.pooled;
  }

  /**
   * 대리자 함수모듈 하나를 부른다.
   *
   * D11 — 왕복 전체가 `ConnectionConfig.timeouts.long` 하나에 묶인다. 구 엔진의
   * native 통로에는 **호출 타임아웃이 아예 없다**(`nativeRfc.ts:63-66`의
   * `poolOptions.idleTimeout: 300`은 유휴 연결 회수 주기이지 호출 상한이 아니다).
   * 그래서 응답이 오지 않으면 도구가 무한정 매달린다. 여기서는 연결 획득과 호출을
   * **하나의 예산**으로 묶어 상한을 둔다 — 단계마다 따로 걸면 최악의 경우 두 배가
   * 되기 때문이다.
   */
  private async callFunctionModule(
    functionModule: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const pool = this.pool();
    const budget = startBudget(this.connection.timeouts.long, functionModule);
    try {
      const client = await budget
        .guard(pool.acquire(), '연결 획득')
        .catch((error: unknown) => {
          throw nativeFailure(error, functionModule, '연결 획득');
        });
      try {
        return await budget.guard(client.call(functionModule, params), '호출');
      } catch (error) {
        throw nativeFailure(error, functionModule, '호출');
      } finally {
        // 구와 같이 `finally`에서 되돌린다(`nativeRfc.ts:156-158`) — 호출이
        // 던져도 클라이언트는 풀로 돌아간다.
        await pool.release(client);
      }
    } finally {
      budget.dispose();
    }
  }
}

// ---------------------------------------------------------------- 접속 인자

/**
 * `SAP_RFC_*` env → `node-rfc` 접속 인자.
 *
 * 구 엔진 `readConnectionParams`(`engine/src/lib/nativeRfc.ts:78-108`)를 그대로
 * 옮긴 것이다. 키 이름·기본값·필수 판정·삽입 순서까지 같다. 다른 것은 값의
 * 출처가 `process.env`가 아니라 인자로 받은 env라는 점뿐인데, 그것은 `odata`
 * 통로와 선택기가 이미 택한 모양이다(`src/rfc/select.ts` 머리주석 — 해석 시점을
 * 호출자에게 맡긴다).
 *
 * `ASHOST`와 `MSHOST`는 배타다 — `MSHOST`가 있으면 메시지서버 갈래로 가고
 * `ASHOST`/`SYSNR`은 쳐다보지 않는다(문서 정본:
 * `interactive/core/procedures/troubleshooting.md` §3 "Per-backend env keys").
 */
function readNativeConnectionParams(
  env: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const mshost = trimmed(env.SAP_RFC_MSHOST);
  const user = requireEnv(env, 'SAP_RFC_USER');
  const passwd = requireEnv(env, 'SAP_RFC_PASSWD');
  const client = requireEnv(env, 'SAP_RFC_CLIENT');
  const lang = trimmed(env.SAP_RFC_LANG) || DEFAULT_LANG;

  const base: Record<string, string> = { user, passwd, client, lang };

  if (mshost) {
    // 메시지서버 · 부하분산 접속
    base.mshost = mshost;
    base.sysid = requireEnv(env, 'SAP_RFC_SYSID');
    base.group = trimmed(env.SAP_RFC_GROUP) || DEFAULT_GROUP;
    const msserv = trimmed(env.SAP_RFC_MSSERV);
    if (msserv) base.msserv = msserv;
  } else {
    // 응용서버 직결
    base.ashost = requireEnv(env, 'SAP_RFC_ASHOST');
    base.sysnr = requireEnv(env, 'SAP_RFC_SYSNR');
  }

  const sncQop = trimmed(env.SAP_RFC_SNC_QOP);
  if (sncQop) {
    base.snc_qop = sncQop;
    base.snc_myname = requireEnv(env, 'SAP_RFC_SNC_MYNAME');
    base.snc_partnername = requireEnv(env, 'SAP_RFC_SNC_PARTNERNAME');
    const sncLib = trimmed(env.SAP_RFC_SNC_LIB);
    if (sncLib) base.snc_lib = sncLib;
  }

  return base;
}

/** 키별 안내. 문구 정본은 `troubleshooting.md` §3 "Per-backend env keys". */
const ENV_HINTS: Readonly<Record<string, string>> = {
  SAP_RFC_USER: 'This is the RFC logon user, which may differ from the ADT user.',
  SAP_RFC_PASSWD: 'This is the RFC logon password — keep it in the profile, never in the repo.',
  SAP_RFC_CLIENT: 'Three digits, e.g. 100.',
  SAP_RFC_ASHOST:
    'Set the application-server pair (SAP_RFC_ASHOST + SAP_RFC_SYSNR) or the ' +
    'message-server pair (SAP_RFC_MSHOST + SAP_RFC_SYSID); the two are mutually exclusive.',
  SAP_RFC_SYSNR: 'Two digits, e.g. 00.',
  SAP_RFC_SYSID: 'Required whenever SAP_RFC_MSHOST is set — the three-character system id, e.g. S4H.',
  SAP_RFC_SNC_MYNAME: 'Required once SAP_RFC_SNC_QOP is set.',
  SAP_RFC_SNC_PARTNERNAME: 'Required once SAP_RFC_SNC_QOP is set.',
};

/**
 * 구 엔진의 문구 `<KEY> is required for SAP_RFC_BACKEND=native but not set in
 * sap.env`(`nativeRfc.ts:113-115`)를 앞머리 그대로 두고 안내만 덧붙인다.
 * `odata` 통로의 `requireEnv`와 같은 모양이다(`src/rfc/odata.ts:181-194`).
 */
function requireEnv(env: Readonly<Record<string, string>>, key: string): string {
  const value = trimmed(env[key]);
  if (!value) {
    const hint = ENV_HINTS[key];
    throw new RfcError({
      kind: 'config',
      backend: BACKEND,
      message:
        `${key} is required for SAP_RFC_BACKEND=native but not set in sap.env.` +
        (hint ? ` ${hint}` : ''),
    });
  }
  return value;
}

function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}

// ------------------------------------------------------------------ 실행 예산

interface Budget {
  /** `work`와 예산 만료를 경주시킨다. 만료가 이기면 `timeout` 오류다. */
  guard<T>(work: Promise<T>, step: string): Promise<T>;
  dispose(): void;
}

function startBudget(ms: number, functionModule: string): Budget {
  let step = '연결 획득';
  let reject: ((reason: unknown) => void) | undefined;

  const expiry = new Promise<never>((_, rejectExpiry) => {
    reject = rejectExpiry;
  });
  // 아무도 경주하지 않는 찰나에 타이머가 터져도 미처리 거부가 되지 않게 한다.
  expiry.catch(() => undefined);

  const timer = setTimeout(() => {
    reject?.(
      new RfcError({
        kind: 'timeout',
        backend: BACKEND,
        functionModule,
        message:
          `native RFC 통로: ${functionModule}의 ${step} 단계가 ${ms}ms 안에 끝나지 않았다 ` +
          `(활성 프로파일의 SAP_TIMEOUT_LONG).`,
      }),
    );
  }, ms);

  return {
    guard: <T>(work: Promise<T>, nextStep: string): Promise<T> => {
      step = nextStep;
      return Promise.race([work, expiry]);
    },
    dispose: () => clearTimeout(timer),
  };
}

// -------------------------------------------------------------- 결과·오류 정규화

/** 객체가 아닐 수 있는 값에서 필드 하나를 안전하게 꺼낸다(`odata.ts`와 동일). */
function field(node: unknown, name: string): unknown {
  if (node !== null && typeof node === 'object') {
    return (node as Record<string, unknown>)[name];
  }
  return undefined;
}

function tryParseJson(raw: string, fallback: unknown): unknown {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/**
 * 대리자 함수모듈의 세 출력(`EV_SUBRC`·`EV_MESSAGE`·`EV_RESULT`)을 결과 또는
 * `sap` 오류로 정규화한다. 던질 때의 문구는 **구 엔진 글자 그대로**다
 * (`engine/src/lib/nativeRfc.ts:151-153`·`:188-190`) — 이 문자열이 도구 응답으로
 * 그대로 나가므로 재생 대조의 대상이다(장부 D13의 경계).
 */
function unwrap(
  raw: unknown,
  context: { functionModule: string; action: string; emptyResult: unknown },
): DispatchResult {
  const subrc = Number(field(raw, 'EV_SUBRC') ?? 0);
  const message = String(field(raw, 'EV_MESSAGE') ?? '');
  const result = tryParseJson(String(field(raw, 'EV_RESULT') ?? ''), context.emptyResult);

  if (subrc !== 0) {
    throw new RfcError({
      kind: 'sap',
      backend: BACKEND,
      subrc,
      sapMessage: message,
      action: context.action,
      functionModule: context.functionModule,
      message: `${context.functionModule} error (action=${context.action}, subrc=${subrc}): ${message}`,
    });
  }
  return { result, subrc, message };
}

/**
 * 네이티브 런타임이 던진 것을 `RfcError`로 옮긴다.
 *
 * **`network` 하나로 받는다.** 구 엔진은 이 자리에서 아무 분류도 하지 않고 애드온의
 * 오류를 그대로 위로 흘린다(`nativeRfc.ts:140-158`). 더 잘게 나누려면
 * `RFC_LOGON_FAILURE` 같은 `node-rfc` 고유 오류 어휘를 읽어야 하는데, 그 패키지는
 * 이 레포에 없고 오프라인으로 확인할 수 없다 — 확인하지 못한 어휘로 `auth`를
 * 주장하는 것은 추측이다. 응답을 받지 못했다는 사실만 확실하므로 거기까지만
 * 말하고, 원문 메시지와 `cause`는 그대로 보존한다(장부의 native 통로 항목).
 */
function nativeFailure(error: unknown, functionModule: string, step: string): RfcError {
  if (error instanceof RfcError) return error;
  return new RfcError({
    kind: 'network',
    backend: BACKEND,
    functionModule,
    message: `native RFC 통로 ${step} 실패 (${functionModule}): ${describe(error)}`,
    cause: error,
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ------------------------------------------------------------ 기본 네이티브 런타임

interface NodeRfcModule {
  Pool: new (init: NativeRfcPoolInit) => NativeRfcPool;
}

/**
 * 실물 `node-rfc`를 지연 적재해 풀을 만든다.
 *
 * `import`가 아니라 `require`인 것은 구와 같은 이유다 — 모듈이 없을 수 있는
 * **선택적 네이티브 의존**이라 최상단 import로 묶으면 통로를 고르지 않은
 * 사람에게도 기동이 깨진다(`engine/src/lib/nativeRfc.ts:16-18`·`:50-51`).
 * 적재 실패 문구는 구의 안내(`:53-58`)를 이 레포의 경로 어휘로 옮긴 것이다.
 */
const nodeRfcPoolFactory: NativeRfcPoolFactory = (init) => {
  let loaded: NodeRfcModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('node-rfc') as NodeRfcModule;
  } catch (error) {
    throw new RfcError({
      kind: 'config',
      backend: BACKEND,
      message:
        `node-rfc could not be loaded, so SAP_RFC_BACKEND=native cannot run on this host. ` +
        `Install SAP NW RFC SDK 7.50+, set SAPNWRFC_HOME, and add the optional node-rfc ` +
        `dependency — or pick a transport that needs no local SDK ` +
        `(SAP_RFC_BACKEND=odata is the default). Original error: ${describe(error)}`,
      cause: error,
    });
  }
  return new loaded.Pool(init);
};
