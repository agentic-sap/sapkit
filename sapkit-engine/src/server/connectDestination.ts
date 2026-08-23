/**
 * 기동 경로의 **토큰 한 걸음** — destination 프로파일을 Bearer 접속으로 세운다.
 *
 * `resolveStartup`은 순수한 해석이다(argv · env · 디스크). 토큰은 그것으로 나오지
 * 않는다 — UAA로 나가는 실왕복이다. 그 왕복을 어디까지 기동이 스스로 해도 되는지를
 * D-114가 **그랜트로 갈랐다**:
 *
 *  - **`client_credentials`** — clientid/clientsecret만으로 끝나는 서버 간 왕복이라
 *    사람이 개입할 자리도 브라우저도 없다. 숨길 「사람 몫」이 없으므로 기동이 첫
 *    토큰을 스스로 받는다. 실패하면 **거기서 끝난다**(fail-closed) — 다른 통로로
 *    대신 붙지 않고, 읽을 만한 진단 한 줄을 남기고 무접속으로 기동한다.
 *  - **`authorization_code`** — 사람이 브라우저 앞에 있어야 끝난다. **D-117 ⓐ가
 *    이 갈래를 열었다**: 명시 옵트인 `--auth-interactive`가 있으면 기동이 콜백을
 *    열고 인가 URL을 stderr로 건네고 사람을 기다린다. 없으면 **오늘과 한 글자도
 *    다르지 않다** — 이 모듈은 받은 상태를 그대로 돌려주고 `resolveStartup`의
 *    `MCP_DESTINATION_TOKEN_PENDING`이 그 자리에서 끝나 있다.
 *
 * ## 왜 이 문단이 개정됐는가
 *
 * 판M2-a(D-114)까지 이 머리말은 「그 갈래는 이 모듈에 오지 않는다」고 적었고,
 * 그것은 참이었다. 판M2-b 실측(D-115)이 그 전제를 무너뜨렸다 —
 * `client_credentials` 토큰에는 `user_name`이 없어 BTP ABAP의 ADT 전 경로가
 * 401이고, **`authorization_code` 사용자 토큰이라야 열린다**(잰 3경로 200).
 * 그러므로 M2에 닿는 경로는 이 그랜트 하나이고, 막고 있던 것은 배선이 아니라
 * 정지선이었다. D-117이 그 정지선을 **플래그 하나로** 열었다.
 *
 * ## 승계 제약 셋(D-091 → D-114 ⓒ) — 여기서도 그대로다
 *
 * ① **토큰은 무상태다.** 이 프로세스의 메모리 말고는 어디에도 없다 — 파일도
 *    키체인도 쓰지 않는다. 수명 판정은 `exp` + 60초 버퍼(`src/auth/jwt.ts`).
 *    그래서 `authorization_code` 기동은 **세션마다 로그인**이다(D-117 정직 유보 ⓐ).
 * ② **갱신 실패는 거기서 끝난다.** 이 모듈은 `TokenSource`를 그대로 쓰므로 그
 *    계약을 물려받는다(조용한 재로그인 폴백 없음). 갱신 배선 자체가 이 판의
 *    범위 밖이다(D-117 ⓕ) — `refresh_token`이 와도 갈아 끼우는 코드는 없다.
 * ③ **브라우저를 열지 않는다.** 이것은 **여전히 참이다.** 「열지 않는다」는 창을
 *    띄우지 말라는 뜻이지 기다리지 말라는 뜻이 아니고(D-117 ⓑ), 이 모듈이 하는
 *    일은 인가 URL을 **stderr에 찍는 것**뿐이다 — 사람이 그것을 복사해 자기가
 *    고른 브라우저에 붙여넣는다. 여는 코드는 여기에도, 이 레포 어디에도 없다.
 *    stdout으로 찍지 않는 이유는 그쪽이 MCP 프로토콜 채널이기 때문이다.
 *
 * ## 여기서 하지 않는 것 — **토큰 갱신**
 *
 * 받는 것은 **첫 토큰 하나**다. 만료된 뒤 다시 받는 배선은 이 판의 범위가 아니고
 * (D-114는 「기동이 첫 토큰을 취득한다」까지를 정했다), 그래서 진단이 그 사실을
 * 그대로 말한다 — 만료되면 서버를 다시 띄워야 한다. 접속에는 `uaa` 재료가 실려
 * 있으므로 뒤 판이 그 위에 갱신을 얹을 수 있다.
 *
 * ## 여기서 확인하지 않는 것 — **그 토큰을 대상이 받는가**
 *
 * 토큰 취득 성공은 **접속 성립이 아니다.** 이 모듈이 세우는 것은 UAA가 토큰을
 * 내줬다는 사실과 그것을 실은 접속 설정까지이고, 대상 시스템이 그 토큰을 받는지는
 * **첫 요청이 말한다.** 판M2-b가 그 간격을 실측했다(D-115): BTP ABAP trial에서
 * `client_credentials` 토큰은 UAA가 200으로 내주지만 **`user_name`이 없어**
 * ADT 전 경로가 401(`sap-authenticated: false`)이었다 — 토큰 자체는 유효한 채로다.
 * 그래서 성공 진단이 「접속이 섰다」로 읽히지 않게 그 사실을 함께 적는다.
 */

import {
  type TokenStatus,
  DEFAULT_CALLBACK_PATH,
  TokenSource,
  UaaClient,
  acquireByAuthorizationCode,
  isAuthError,
} from '../auth';
import type { HttpTransport } from '../adt/http';
import type { ConnectionConfig, ResolvedProfile } from '../contracts';
import { DEFAULT_TIMEOUTS, planServiceKeyConnection } from '../profile';
import type { ServiceKeyConfig } from '../profile';
import { PROFILE_SUMMARY_PREFIX, profileSummaryLine } from './startup';
import type { Startup } from './startup';

/**
 * 인가 콜백을 기다리는 기본 시한 — 3분.
 *
 * **노브가 아니다.** 사람이 브라우저에서 로그인을 마치기에 넉넉하면서, 사람이
 * 자리에 없을 때 기동이 매달리는 시간의 상한이기도 하다. 시험이 옵션으로
 * 짧게 준다.
 */
export const DEFAULT_AUTHORIZE_TIMEOUT_MS = 180_000;

export interface DestinationConnectOptions {
  /** UAA 왕복의 전송 이음매. 시험이 목을 준다. 기본은 접속 계층과 같은 내장 http/https. */
  readonly transport?: HttpTransport;
  /** 현재 시각. 시험이 주입한다. */
  readonly now?: () => number;
  /**
   * 인가 URL을 **사람에게 건네는** 자리. 기본은 stderr 한 줄이다 — 사람이
   * 복사해 붙여넣는다. **브라우저를 여는 구현을 넣지 않는다**(머리말 ③).
   * 시험이 목을 준다.
   */
  readonly openAuthorizeUrl?: (url: string) => void | Promise<void>;
  /** 콜백 주소 덮어쓰기. 기본은 기동이 정한 값(`Startup.authInteractive`). */
  readonly callbackHost?: string;
  readonly callbackPort?: number;
  /** 콜백 대기 시한. 기본 {@link DEFAULT_AUTHORIZE_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * 기본 구현 — **stdout이 아니라 stderr**. stdout은 MCP 프로토콜 채널이다.
 *
 * ⚠ **핸드셰이크 경고가 여기 있는 이유**(D-119 ⓑ): `bootstrap.startFromProcess`는
 * 이 걸음을 **transport를 연결하기 전에** await 한다. 그래서 대기가 시작된 뒤
 * 사람이 보는 출력은 **이 두 줄뿐**이고, 성공 진단은 이미 늦다 — 그때는 기다림이
 * 끝나 있다. D-117 정직 유보 ⓔ가 「진단이 그 사실을 **미리** 말해야 한다」고 적은
 * 자리가 정확히 여기다.
 */
function printAuthorizeUrl(url: string): void {
  process.stderr.write(
    'MCP_DESTINATION_AUTHORIZE_URL: startup is waiting for a browser round trip. Open this URL, ' +
      'sign in, and the loopback callback finishes the login here. Nothing opens on its own. ' +
      'Startup is blocked until then, which delays the MCP handshake for as long as the sign-in ' +
      'takes — a client whose own startup timeout is shorter can score this launch as a failure ' +
      'even after the token arrives, so sign in now or restart without --auth-interactive.\n' +
      `${url}\n`,
  );
}

/**
 * 기동 상태를 받아 **필요하면** 토큰을 받아 접속을 세운 새 상태를 돌려준다.
 *
 * 할 일이 없으면 **받은 것을 그대로** 돌려준다(같은 객체다). Basic 기동·`--env`
 * 기동·브로커 기동·**플래그 없는 `authorization_code` destination**이 전부 그
 * 갈래이며, 그래서 이 걸음이 기존 경로에 남기는 자국이 0이라는 것을 객체
 * 동일성으로 잴 수 있다. `--auth-interactive`를 켠 `authorization_code`만이
 * D-117 ⓐ로 새로 들어온 갈래다.
 */
export async function connectDestination(
  startup: Startup,
  options: DestinationConnectOptions = {},
): Promise<Startup> {
  const selection = startup.destination;
  const key: ServiceKeyConfig | null =
    selection !== null && selection.channel === 'mcp' ? selection.serviceKey : null;

  // 이 걸음이 소유하는 것은 **`--mcp` + 붙을 주소가 있는 키** 둘이다 —
  // `client_credentials`는 언제나, `authorization_code`는 **명시 옵트인이
  // 있을 때만**. 나머지는 이미 `resolveStartup`이 제 자리에서 끝냈다.
  if (key === null) return startup;
  if (key.grant === 'authorization_code' && !startup.authInteractive.enabled) return startup;
  const plan = planServiceKeyConnection(key);
  if (plan.kind !== 'ready') return startup;

  const host = options.callbackHost ?? startup.authInteractive.callbackHost;
  const port = options.callbackPort ?? startup.authInteractive.callbackPort;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUTHORIZE_TIMEOUT_MS;
  const flow: FlowInfo =
    key.grant === 'authorization_code'
      ? {
          grant: 'authorization_code',
          callbackUrl: `http://${host}:${port}${DEFAULT_CALLBACK_PATH}`,
          timeoutMs,
        }
      : { grant: 'client_credentials' };

  const client = new UaaClient(plan.uaa, {
    ...(options.transport !== undefined ? { transport: options.transport } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  // `TokenSource`를 거쳐 받는다 — 씨앗도 갱신 토큰도 없으므로 **처음 취득**
  // 갈래로 내려가고(그 모듈의 ⓑ), 만료 판정·버퍼가 그 계층의 것 그대로다.
  // `acquire` 훅을 주면 그 갈래가 그것을 쓰고, 안 주면 `client_credentials`다 —
  // 그래서 두 그랜트가 같은 한 줄(`accessToken()`)로 합류하고, 성공 진단의
  // 수명 계산도 실패 진단의 코드 분기도 한 벌로 끝난다.
  const source = new TokenSource({
    client,
    ...(flow.grant === 'authorization_code'
      ? {
          acquire: () =>
            acquireByAuthorizationCode({
              client,
              host,
              port,
              timeoutMs,
              openAuthorizeUrl: options.openAuthorizeUrl ?? printAuthorizeUrl,
            }),
        }
      : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });

  let token: string;
  try {
    token = await source.accessToken();
  } catch (error) {
    // 실패 사유는 **프로파일 진단에도** 넣는다 — 접속을 요구한 도구가 받는
    // `ERR_NO_CONNECTION`이 그 목록을 그대로 실어 나르기 때문이다
    // (`./session`의 `getConnection`). 넣지 않으면 사람은 stderr를 뒤져야 한다.
    const line = failureLine(key, client.tokenEndpoint, error, flow);
    return replace(
      startup,
      { ...startup.profile, diagnostics: [...startup.profile.diagnostics, line] },
      line,
    );
  }

  const connection: ConnectionConfig = {
    baseUrl: plan.baseUrl,
    // Bearer 접속에는 사용자·비밀번호가 없다. 접속 계층은 `authType: 'jwt'`에서
    // 이 둘을 아예 보지 않는다(`src/adt/client.ts`의 인증 분기). Basic만 아는
    // RFC 경로(`src/rfc/`)는 이 축에 노출되지 않는다 — destination 접속의
    // 배포 축은 `cloud`이고 그 도구 20종은 `available_in: onprem|legacy`다.
    username: '',
    password: '',
    ...(plan.client !== null ? { client: plan.client } : {}),
    ...(plan.language !== null ? { language: plan.language } : {}),
    // service key에는 TLS 노브가 없다. 검증은 켠 채로 둔다 — 끄는 것은 언제나
    // 명시적 선택이어야 하고, 그 선택을 적을 자리가 이 통로에는 없다.
    rejectUnauthorized: true,
    timeouts: { ...DEFAULT_TIMEOUTS },
    authType: 'jwt',
    jwtToken: token,
    uaa: plan.uaa,
  };

  const line = successLine(key, plan.baseUrl, source.status(), flow);
  const profile: ResolvedProfile = {
    connection,
    // service key는 tier를 말하지 않는다. **UNKNOWN이 곧 fail-closed다** —
    // write도 실행도 전부 거부된다. 넘겨짚어 DEV로 여는 갈래를 두지 않는다.
    tier: 'UNKNOWN',
    systemType: 'cloud',
    sapVersion: null,
    envPath: null,
    alias: null,
    diagnostics: [...startup.profile.diagnostics, line],
  };

  return replace(startup, profile, line);
}

// ------------------------------------------------------------ 내부 구현

/**
 * 새 상태 한 벌. **맨 끝의 한 줄 요약을 다시 쓴다** — 그 줄은 `resolveStartup`이
 * 토큰을 받기 **전에** 지은 것이라, 그대로 두면 접속이 섰는데도 `connection=none`
 * 이라고 적힌 채 남는다.
 */
function replace(startup: Startup, profile: ResolvedProfile, line: string): Startup {
  const kept = startup.diagnostics.filter((entry) => !entry.startsWith(PROFILE_SUMMARY_PREFIX));
  return {
    ...startup,
    profile,
    diagnostics: [...kept, line, profileSummaryLine(profile, startup.sets)],
  };
}

/** 시한을 사람이 읽는 단위로. 1초 미만은 「0s」가 되므로 그때는 ms로 적는다. */
function wait(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`;
}

function lifetime(status: TokenStatus): string {
  if (status.expiresAtMs === null) {
    return 'The token says nothing about its own lifetime (no exp claim and no expires_in)';
  }
  return `The token expires at ${new Date(status.expiresAtMs).toISOString()}`;
}

/**
 * 어느 그랜트로 받았는가 — 그리고 `authorization_code`면 **사람이 붙잡고 있던
 * 것들**(콜백 주소·시한). 성공 문면도 실패 문면도 이것으로 갈린다: 두 그랜트는
 * 실패했을 때 사람이 할 일이 다르고, 성공했을 때 조심할 것도 다르다.
 */
type FlowInfo =
  | { readonly grant: 'client_credentials' }
  | {
      readonly grant: 'authorization_code';
      readonly callbackUrl: string;
      readonly timeoutMs: number;
    };

/**
 * 취득 성공 한 줄.
 *
 * **이름이 `MCP_DESTINATION_CONNECTED`가 아니다**(D-117 ⓖ · D-116 ⓔ). 이
 * 코드가 아는 것은 「UAA가 토큰을 내줬고 접속 설정이 그것을 실었다」까지이고,
 * 대상 시스템이 그 토큰을 받는지는 **첫 요청이 말한다**. `CONNECTED`는 그것을
 * 확인한 자리에 예약돼 있으며 **이 엔진은 아직 그 자리를 방출하지 않는다** —
 * 확인하지 않은 것을 확인했다고 부른 것이 D-115가 데인 자리다.
 */
function successLine(
  key: ServiceKeyConfig,
  baseUrl: string,
  status: TokenStatus,
  flow: FlowInfo,
): string {
  const where = [
    key.client !== null ? `client ${key.client}` : null,
    key.language !== null ? `language ${key.language}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  // 401 안내는 **`client_credentials` 전용**이다 — 그 토큰에 `user_name`이 없어
  // ADT가 거절한다는 실측(D-115)이 근거이고, 사용자 토큰에는 해당하지 않는다.
  // 그 자리를 `authorization_code`에서는 **핸드셰이크 지연 경고**가 대신한다
  // (D-117 정직 유보 ⓔ): 로그인에 걸린 시간만큼 기동이 늦어지므로, 클라이언트
  // 쪽 기동 시한이 그보다 짧으면 기동 자체가 실패로 처리될 수 있다.
  const grantNote =
    flow.grant === 'client_credentials'
      ? 'A client_credentials token carries no user identity, and an ABAP system that maps ' +
        'requests to users can answer 401 on every path while the token itself stays valid; if ' +
        'every tool comes back unauthorized, that is the cause, and the destination needs a grant ' +
        'that carries a user rather than a fix on this side. '
      : 'This token came from a person signing in, so it carries a user identity. Startup blocked ' +
        `on that sign-in (up to ${wait(flow.timeoutMs)}, callback ` +
        `${flow.callbackUrl}), which delays the MCP handshake by however long the browser round ` +
        'trip took — a client whose own startup timeout is shorter can score this launch as a ' +
        'failure even though the token arrived. ';

  return (
    `MCP_DESTINATION_TOKEN_ACQUIRED: --mcp=${key.destination} acquired a ${flow.grant} token and ` +
    `the connection is configured as Bearer on ${baseUrl}${where === '' ? '' : ` (${where})`}. ` +
    'Nothing has been sent to that system yet — whether it accepts this token is decided by the ' +
    'first request, not by this line. ' +
    grantNote +
    `${lifetime(status)}; it lives in this process's memory only, and startup does not renew it — ` +
    'restart the server when it expires. No SAP tier comes with a service key, so tier=UNKNOWN ' +
    'and every write and execution is refused (fail-closed); set up a profile sap.env if this ' +
    'system needs to be writable.'
  );
}

/** 실패마다 **사람이 다음에 할 일**이 다르다 — 인증 계층의 코드로 가른다. */
function nextStep(code: string, key: ServiceKeyConfig): string {
  switch (code) {
    case 'UAA_REQUEST_FAILED':
      return (
        `The token endpoint was not reachable from this machine — check the uaa url in ${key.source} ` +
        'against DNS, the proxy, and any VPN this machine needs, then restart.'
      );
    case 'UAA_REJECTED':
      return (
        `The token endpoint refused these credentials — the clientid/clientsecret in ${key.source} ` +
        'is wrong or its binding secret was rotated. Re-download the service key from BTP and restart.'
      );
    case 'UAA_RESPONSE_INVALID':
      return (
        'The token endpoint answered but the body carried no usable access_token — check that the ' +
        `uaa url in ${key.source} points at the XSUAA token endpoint and not at a proxy or a login page.`
      );
    default:
      return `Fix the cause above in ${key.source} and restart.`;
  }
}

/**
 * 같은 일을 `authorization_code`에 대해. **코드가 겹쳐도 할 일이 다르다** —
 * `UAA_REJECTED`가 여기서는 「비밀이 틀렸다」가 아니라 「코드 교환이 거절됐다」
 * 이고, 사람이 봐야 하는 곳은 BTP의 service key가 아니라 `redirect_uri`
 * 화이트리스트다. 그래서 갈래를 나눈다.
 */
function interactiveNextStep(
  code: string,
  key: ServiceKeyConfig,
  flow: Extract<FlowInfo, { grant: 'authorization_code' }>,
): string {
  switch (code) {
    case 'CALLBACK_TIMEOUT':
      return (
        `No callback arrived at ${flow.callbackUrl} within ${wait(flow.timeoutMs)}, and startup ` +
        'does not push the login again (an authorization code is single-use, so retrying means ' +
        "opening the browser once more, and that is a person's decision). Restart with " +
        '--auth-interactive and finish the sign-in, or check that the browser was actually sent ' +
        'to the URL printed on stderr.'
      );
    case 'CALLBACK_STATE_MISMATCH':
      return (
        'The callback carried a different state than the one this startup sent, so it did not ' +
        'belong to this login and was refused. A stale browser tab from an earlier attempt is ' +
        'the usual cause — close those tabs, restart, and use only the URL this run prints.'
      );
    case 'CALLBACK_FAILED':
      return (
        `The loopback callback could not be held at ${flow.callbackUrl} — either something else ` +
        'already listens on that port (startup does not quietly move to another one, because the ' +
        'redirect_uri would then no longer match what is registered) or the authorization server ' +
        'sent the callback back as an error. Free that port, or point --callback-host and ' +
        "--callback-port at an address that is in this XSUAA client's registered redirect_uri list."
      );
    case 'UAA_REJECTED':
      return (
        'The token endpoint refused the code exchange. The usual cause is a redirect_uri that ' +
        `does not match the one registered on this XSUAA client — this run used ${flow.callbackUrl} ` +
        '(move it with --callback-host and --callback-port; the address is compared as a string, ' +
        'so 127.0.0.1 and localhost are different values). A code that sat unused for too long ' +
        'also expires. A third cause has no fix on this side: this engine sends no PKCE ' +
        'code_challenge, so an XSUAA client configured to require it refuses every exchange here ' +
        'no matter what the redirect_uri says. Check the redirect_uri list in BTP against that ' +
        'address first, then whether this client mandates PKCE, then restart.'
      );
    case 'UAA_REQUEST_FAILED':
      return (
        `The token endpoint was not reachable from this machine — check the uaa url in ${key.source} ` +
        'against DNS, the proxy, and any VPN this machine needs, then restart.'
      );
    default:
      return (
        'The interactive login did not finish. Fix the cause above, then restart with ' +
        '--auth-interactive.'
      );
  }
}

/**
 * 원인 원문을 **끼우지 않는** 코드들.
 *
 * 진단은 전부 영문인데(아래 주석) 이 코드들의 원인 자리는 기계 문자열이 아니라
 * 인증 계층의 한국어 설명이라, 그대로 옮기면 영문 진단에 한국어가 섞인다.
 * 사람이 할 일은 `interactiveNextStep()`이 영문으로 말한다.
 */
const OPAQUE_CAUSE: ReadonlySet<string> = new Set([
  'CALLBACK_TIMEOUT',
  'CALLBACK_STATE_MISMATCH',
  'CALLBACK_ABORTED',
  // 이 둘은 판M2-c가 만든 결함이 아니라 **선재**였다 — 두 그랜트 모두에서 도달
  // 가능하고 em-dash 뒤가 한국어다(`uaa.ts`의 응답 불량 · `tokenSource.ts`의
  // 갱신 재료 없음). 기구를 세운 판이 두 줄로 닫는다(D-119 ⓔ).
  'UAA_RESPONSE_INVALID',
  'AUTH_NO_REFRESH_MATERIAL',
]);

function failureLine(
  key: ServiceKeyConfig,
  endpoint: string,
  error: unknown,
  flow: FlowInfo,
): string {
  const code = isAuthError(error) ? error.code : 'UNEXPECTED';
  // 진단은 전부 영문이다 — 인증 계층의 한국어 메시지를 통째로 싣지 않고
  // 코드와 원인(HTTP 상태 등 괄호 원문)만 뽑아 영문 문장에 끼운다(리뷰 권고 2).
  // 비밀은 어느 쪽에도 담기지 않는다 — 인증 계층이 UAA 응답의
  // error/error_description 두 칸만 옮기고, cause는 상태·URL뿐이다.
  const raw = error instanceof Error ? error.message : String(error);
  // AuthError.message = "CODE: <한국어 본문> — <원인(HTTP 상태 등)>" 꼴 — 마지막
  // em-dash 뒤가 원인이다. 그것만 영문 문장에 끼운다.
  const dashAt = raw.indexOf('—');
  const cause = OPAQUE_CAUSE.has(code) || dashAt < 0 ? null : raw.slice(dashAt + 1).trim();
  const detail =
    code === 'UNEXPECTED' ? raw : `${code}${cause !== null && cause !== '' ? ` (${cause})` : ''}`;

  // 어디서 실패했는지가 그랜트마다 다르다 — 하나는 토큰 종단점 왕복 한 번이고,
  // 다른 하나는 콜백 서버·브라우저 왕복·코드 교환 셋 중 어디든이다.
  const where =
    flow.grant === 'client_credentials'
      ? `startup could not get a token from ${endpoint}`
      : `startup could not finish the interactive login (callback ${flow.callbackUrl}, token ` +
        `endpoint ${endpoint})`;

  return (
    `MCP_DESTINATION_TOKEN_FAILED: --mcp=${key.destination} uses the ${flow.grant} grant and ` +
    `${where} — ${detail}. The server starts with no ` +
    'connection and does not fall back to another system. ' +
    `${flow.grant === 'client_credentials' ? nextStep(code, key) : interactiveNextStep(code, key, flow)} ` +
    'Until then use --env=<name>, --env-path=<file>, or an active profile for a Basic connection.'
  );
}
