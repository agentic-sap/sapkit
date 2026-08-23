/**
 * 프로파일 세션 — 기동 **뒤에** 프로파일을 다시 해석할 수 있는 유일한 자리.
 *
 * 여태 코어의 상태는 `resolveStartup()`이 한 번 낸 `Startup` 한 덩이였고 접속은
 * 코어 안의 클로저 지역 변수였다. 그 모양으로는 `ReloadProfile`을 지을 수 없다 —
 * 도구가 프로파일을 다시 읽어 `tier: PRD`라고 답해도 게이트는 기동 시점의 tier로
 * 계속 판정하기 때문이다. **그것이 곧 과통과이고 안전 바닥선이 내려가는 자리다.**
 *
 * 구 엔진의 계약은 그 반대였고, 여기서 되살리는 것이 그 계약이다:
 *
 *   `engine/src/handlers/system/readonly/handleReloadProfile.ts:43-44`
 *     → `activateProfile()` + `invalidateConnectionCache()`
 *   `engine/src/lib/profile.ts:271-280` (`applyProfile`)
 *     → 모듈 캐시 `activeTier`·`activeAlias`를 갈아 끼운다
 *   `engine/src/lib/readonlyGuard.ts:135` (`guardTool`)
 *     → **매 호출** `getActiveTier()`로 그 캐시를 다시 읽는다
 *   `engine/src/lib/utils.ts:857-874` (`invalidateConnectionCache`)
 *     → `cachedConnection`·`cachedConfigSignature`를 비우고
 *       `notifyConnectionResetListeners()`로 클라이언트 캐시까지 떨군다
 *       (`engine/src/lib/clients.ts:44-50`의 `resetClientCache`가 그 청취자다)
 *
 * 구는 그 상태를 **프로세스 전역 모듈 변수**에 두었다. 여기서는 객체 하나에
 * 가둔다 — 시험이 서버를 여럿 세우고, HTTP·SSE 전송은 요청·스트림마다 코어를
 * 새로 만들기 때문이다(`./bootstrap`이 그 코어들에 **같은 세션**을 물린다).
 *
 * ## 이 부품이 지키는 규칙 셋
 *
 * ① **읽기는 언제나 지금 값이다.** 게이트와 도구 컨텍스트가 보는
 *    `tier`·`blocklist`·`profile`·`env`는 전부 {@link ProfileSession.startup}을
 *    거쳐 **매 호출** 다시 읽힌다. 어느 한 곳이라도 스냅샷을 떠서 클로저에
 *    가두면 정확히 그 값이 기동 시점에 고정된다.
 * ② **재적재는 인자를 받지 않는다.** 새 상태는 `startup.input`(argv · 프로세스
 *    env · 디스크의 파일)만의 함수다. 도구가 넘긴 값이 tier·blocklist·접속
 *    대상을 정하는 통로는 없다 — 그것이 이 훅이 연 표면의 상한이다.
 * ③ **되돌아가는 갈래가 없다.** 재적재가 무엇을 만나든 그 결과가 곧 새 상태다.
 *    구는 `loadActiveProfile()`이 던지면 `applyProfile()`에 닿지 못해 **옛 tier와
 *    옛 접속이 그대로 살아남았다**(`engine/src/lib/profile.ts:301-305` — 던지는
 *    자리가 `applyProfile` 앞이다). 여기서는 그러지 않는다: 실패는 무접속 ·
 *    `tier=UNKNOWN` · 잠긴 blocklist로 내려앉는다. 운영자가 프로파일을 바꾸려다
 *    실패했을 때 옛 권한이 조용히 유지되는 쪽보다, 아무것도 못 하는 쪽이 안전
 *    바닥선이다.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { AdtClient } from '../adt';
import type { ConnectionConfig, DeploymentType, SapTier } from '../contracts';
import { disconnectedProfile } from '../profile';
import { readBlocklistConfig } from '../safety';
import { type Startup, resolveStartup } from './startup';

export type ConnectionFactory = (config: ConnectionConfig) => AdtClient;

/** 재적재 전후를 견주기 위한 최소 상태. */
export interface ProfileSnapshot {
  readonly alias: string | null;
  readonly tier: SapTier;
  readonly envPath: string | null;
  readonly systemType: DeploymentType;
}

export interface ProfileReload {
  /** 재적재 뒤 **실제로 유효한** 상태. */
  readonly startup: Startup;
  readonly before: ProfileSnapshot;
  readonly after: ProfileSnapshot;
  /** 버릴 접속이 실제로 있었는가. */
  readonly connectionDropped: boolean;
  /**
   * 재적재된 상태가 **이미 발행된 도구 목록과 어긋나는가** — 배포 축이 기동
   * 시점과 달라졌다는 뜻이다.
   *
   * 이 프로세스로는 고칠 수 없다. 등록은 서버가 전송에 붙기 전에 끝나므로
   * `tools/list`는 기동 시점의 축으로 지어진 목록 그대로다. tier·blocklist·접속은
   * 이미 새 값으로 발효돼 있으므로, 여기가 참이라고 해서 안전 상태가 어긋나
   * 있는 것은 아니다 — 어긋나 있는 것은 **목록**뿐이다. `ReloadProfile`이 이
   * 값을 `restartRequired`로 실어 보고한다.
   */
  readonly exposureStale: boolean;
  /** `tools/list`가 지어진 배포 축. {@link exposureStale}의 짝. */
  readonly bootSystemType: DeploymentType;
  /**
   * 해석 자체가 예외로 끝나 inspection-only로 **봉인**됐다면 그 사유. 정상
   * 경로에서는 null이다. 프로파일을 못 찾은 것(진단으로 끝나는 정상 경로)과
   * 해석기가 던진 것(비정상)을 구분하려고 따로 둔다.
   */
  readonly sealed: string | null;
}

function snapshot(startup: Startup): ProfileSnapshot {
  return {
    alias: startup.profile.alias,
    tier: startup.profile.tier,
    envPath: startup.profile.envPath,
    systemType: startup.profile.systemType,
  };
}

/**
 * 봉인 상태 — **가장 잠긴 상태**를 손으로 짓는다.
 *
 * 해석기가 던진 뒤에는 무엇을 믿어야 할지 알 수 없으므로, 옛 값을 물려받는 것이
 * 하나도 없어야 한다. blocklist는 프로세스 env가 아니라 **빈 env**로 다시
 * 읽는다 — `readBlocklistConfig({})`는 잠긴 기본값(`standard`)에 허용 목록도
 * 확장 목록도 없는 설정이고(`src/safety/blocklist.ts:241-255`), 프로세스 env를
 * 다시 읽으면 `MCP_BLOCKLIST_PROFILE=off` 같은 **느슨한 노브가 봉인을 통과한다**.
 *
 * `sets`만 그대로 둔다. 이미 등록된 도구 목록이 그 값으로 지어졌으므로 여기서
 * 바꿔 봐야 실제 표면은 달라지지 않고, 보고만 어긋난다.
 */
function sealedStartup(previous: Startup, reason: string): Startup {
  const diagnostics = [
    `RELOAD_SEALED: 프로파일 재적재가 예외로 끝났다 — ${reason}. 옛 프로파일로 되돌아가지 않고 ` +
      '무접속(inspection-only) · tier=UNKNOWN · 잠긴 blocklist로 봉인한다. 원인을 고친 뒤 ' +
      'ReloadProfile을 다시 부르거나 서버를 다시 띄워라.',
  ];
  return {
    sets: previous.sets,
    profile: disconnectedProfile(diagnostics),
    envVars: {},
    env: {},
    blocklist: readBlocklistConfig({}),
    destination: null,
    // 봉인은 destination 통로 자체를 버리므로 그 통로의 옵트인도 함께 꺼진다.
    authInteractive: { ...previous.authInteractive, enabled: false },
    unsafe: false,
    diagnostics,
    input: previous.input,
  };
}

/**
 * 서버 코어가 나눠 갖는 **가변 상태 한 덩이** — 현재 기동 상태 + 캐시된 접속.
 *
 * 접속이 게으른 것은 그대로다. 게이트에 막힌 호출은 {@link getConnection}에
 * 닿지 않으므로 접속도 만들어지지 않는다 — 구 엔진 GAP-1 재발 방지의 실체가
 * 그 한 줄이고, 재적재가 생겼다고 달라지지 않는다.
 */
export class ProfileSession {
  private state: Startup;
  private client: AdtClient | null = null;
  private readonly factory: ConnectionFactory;

  /**
   * 기동 시점의 배포 축. `tools/list`가 이 값으로 지어졌고 **재적재로는 바뀌지
   * 않는다** — 등록은 서버가 전송에 붙기 전에 끝난다. 재적재가 다른 축의
   * 프로파일을 물어 오면 `ReloadProfile`이 그 사실을 `restartRequired`로 보고한다.
   */
  readonly bootSystemType: DeploymentType;

  constructor(startup: Startup, factory?: ConnectionFactory) {
    this.state = startup;
    this.bootSystemType = startup.profile.systemType;
    this.factory = factory ?? ((config: ConnectionConfig) => new AdtClient(config));
  }

  /** **지금** 유효한 기동 상태. 읽는 쪽은 붙잡아 두지 말고 그때그때 읽는다. */
  get startup(): Startup {
    return this.state;
  }

  async getConnection(): Promise<AdtClient> {
    if (this.client) return this.client;
    const config = this.state.profile.connection;
    if (!config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured — the server is running inspection-only. ' +
          (this.state.profile.diagnostics.join(' ') ||
            'Point MCP_ENV_PATH at a profile sap.env, pass --env-path=<file>, or set an active profile.'),
      );
    }
    this.client = this.factory(config);
    return this.client;
  }

  /**
   * 활성 프로파일을 다시 해석하고 **캐시된 접속을 버린다**.
   *
   * 순서가 계약이다: 접속을 **먼저** 버린다. 뒤의 해석이 던져도 낡은 접속이
   * 살아남는 갈래가 없어야 하기 때문이다.
   */
  reload(): ProfileReload {
    const before = snapshot(this.state);
    const connectionDropped = this.client !== null;
    this.client = null;

    let sealed: string | null = null;
    try {
      this.state = resolveStartup(this.state.input);
    } catch (error) {
      sealed = error instanceof Error ? error.message : String(error);
      this.state = sealedStartup(this.state, sealed);
    }

    const after = snapshot(this.state);
    return {
      startup: this.state,
      before,
      after,
      connectionDropped,
      exposureStale: after.systemType !== this.bootSystemType,
      bootSystemType: this.bootSystemType,
      sealed,
    };
  }
}
