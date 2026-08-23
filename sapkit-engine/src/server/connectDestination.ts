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
 *  - **`authorization_code`** — 사람이 브라우저 앞에 있어야 끝난다. 기동은 **시작조차
 *    하지 않는다.** 그 갈래는 이 모듈에 오지 않고 `resolveStartup`의
 *    `MCP_DESTINATION_TOKEN_PENDING`에서 이미 끝나 있다.
 *
 * ## 승계 제약 셋(D-091 → D-114 ⓒ) — 여기서도 그대로다
 *
 * ① **토큰은 무상태다.** 이 프로세스의 메모리 말고는 어디에도 없다 — 파일도
 *    키체인도 쓰지 않는다. 수명 판정은 `exp` + 60초 버퍼(`src/auth/jwt.ts`).
 * ② **갱신 실패는 거기서 끝난다.** 이 모듈은 `TokenSource`를 그대로 쓰므로 그
 *    계약을 물려받는다(조용한 재로그인 폴백 없음).
 * ③ **브라우저를 열지 않는다.** 이 모듈이 부르는 것은 `client_credentials`
 *    하나뿐이고, 인가 URL을 여는 코드는 여기에 없다.
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

import { type TokenStatus, TokenSource, UaaClient, isAuthError } from '../auth';
import type { HttpTransport } from '../adt/http';
import type { ConnectionConfig, ResolvedProfile } from '../contracts';
import { DEFAULT_TIMEOUTS, planServiceKeyConnection } from '../profile';
import type { ServiceKeyConfig } from '../profile';
import { PROFILE_SUMMARY_PREFIX, profileSummaryLine } from './startup';
import type { Startup } from './startup';

export interface DestinationConnectOptions {
  /** UAA 왕복의 전송 이음매. 시험이 목을 준다. 기본은 접속 계층과 같은 내장 http/https. */
  readonly transport?: HttpTransport;
  /** 현재 시각. 시험이 주입한다. */
  readonly now?: () => number;
}

/**
 * 기동 상태를 받아 **필요하면** 토큰을 받아 접속을 세운 새 상태를 돌려준다.
 *
 * 할 일이 없으면 **받은 것을 그대로** 돌려준다(같은 객체다). Basic 기동·`--env`
 * 기동·브로커 기동·`authorization_code` destination이 전부 그 갈래이며, 그래서
 * 이 걸음이 기존 경로에 남기는 자국이 0이라는 것을 객체 동일성으로 잴 수 있다.
 */
export async function connectDestination(
  startup: Startup,
  options: DestinationConnectOptions = {},
): Promise<Startup> {
  const selection = startup.destination;
  const key: ServiceKeyConfig | null =
    selection !== null && selection.channel === 'mcp' ? selection.serviceKey : null;

  // 이 걸음이 소유하는 것은 **`--mcp` + `client_credentials` + 붙을 주소가 있는
  // 키** 하나뿐이다. 나머지는 이미 `resolveStartup`이 제 자리에서 끝냈다.
  if (key === null || key.grant !== 'client_credentials') return startup;
  const plan = planServiceKeyConnection(key);
  if (plan.kind !== 'ready') return startup;

  const client = new UaaClient(plan.uaa, {
    ...(options.transport !== undefined ? { transport: options.transport } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  // `TokenSource`를 거쳐 받는다 — 씨앗도 갱신 토큰도 없으므로 `client_credentials`
  // 갈래로 내려가고(그 모듈의 ⓑ), 만료 판정·버퍼가 그 계층의 것 그대로다.
  const source = new TokenSource({
    client,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });

  let token: string;
  try {
    token = await source.accessToken();
  } catch (error) {
    // 실패 사유는 **프로파일 진단에도** 넣는다 — 접속을 요구한 도구가 받는
    // `ERR_NO_CONNECTION`이 그 목록을 그대로 실어 나르기 때문이다
    // (`./session`의 `getConnection`). 넣지 않으면 사람은 stderr를 뒤져야 한다.
    const line = failureLine(key, client.tokenEndpoint, error);
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

  const line = successLine(key, plan.baseUrl, source.status());
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

function lifetime(status: TokenStatus): string {
  if (status.expiresAtMs === null) {
    return 'The token says nothing about its own lifetime (no exp claim and no expires_in)';
  }
  return `The token expires at ${new Date(status.expiresAtMs).toISOString()}`;
}

function successLine(key: ServiceKeyConfig, baseUrl: string, status: TokenStatus): string {
  const where = [
    key.client !== null ? `client ${key.client}` : null,
    key.language !== null ? `language ${key.language}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    `MCP_DESTINATION_CONNECTED: --mcp=${key.destination} acquired a client_credentials token and ` +
    `the connection is configured as Bearer on ${baseUrl}${where === '' ? '' : ` (${where})`}. ` +
    'Nothing has been sent to that system yet — whether it accepts this token is decided by the ' +
    'first request, not by this line. A client_credentials token carries no user identity, and an ' +
    'ABAP system that maps requests to users can answer 401 on every path while the token itself ' +
    'stays valid; if every tool comes back unauthorized, that is the cause, and the destination ' +
    'needs a grant that carries a user rather than a fix on this side. ' +
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

function failureLine(key: ServiceKeyConfig, endpoint: string, error: unknown): string {
  const code = isAuthError(error) ? error.code : 'UNEXPECTED';
  // 진단은 전부 영문이다 — 인증 계층의 한국어 메시지를 통째로 싣지 않고
  // 코드와 원인(HTTP 상태 등 괄호 원문)만 뽑아 영문 문장에 끼운다(리뷰 권고 2).
  // 비밀은 어느 쪽에도 담기지 않는다 — 인증 계층이 UAA 응답의
  // error/error_description 두 칸만 옮기고, cause는 상태·URL뿐이다.
  const raw = error instanceof Error ? error.message : String(error);
  // AuthError.message = "CODE: <한국어 본문> — <원인(HTTP 상태 등)>" 꼴 — 마지막
  // em-dash 뒤가 원인이다. 그것만 영문 문장에 끼운다.
  const dashAt = raw.indexOf('—');
  const cause = dashAt >= 0 ? raw.slice(dashAt + 1).trim() : null;
  const detail =
    code === 'UNEXPECTED' ? raw : `${code}${cause !== null && cause !== '' ? ` (${cause})` : ''}`;

  return (
    `MCP_DESTINATION_TOKEN_FAILED: --mcp=${key.destination} uses the client_credentials grant and ` +
    `startup could not get a token from ${endpoint} — ${detail}. The server starts with no ` +
    'connection and does not fall back to another system. ' +
    `${nextStep(code, key)} ` +
    'Until then use --env=<name>, --env-path=<file>, or an active profile for a Basic connection.'
  );
}
