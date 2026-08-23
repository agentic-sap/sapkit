/**
 * 기동 계약 — `process.argv`와 `process.env`만으로 서버의 상태를 정한다.
 *
 * 셰임(`interactive/server/launch.cjs`)은 번들을 **같은 프로세스에서
 * `require()`** 하므로, 신 엔진에 넘어오는 것은 argv와 env뿐이다. 이 모듈이
 * 그 둘을 읽어 노출 집합·프로파일·안전 노브를 확정한다.
 *
 * 셰임이 하는 일(launch.cjs):
 *  - 활성 프로파일의 `sap.env`를 찾아 `process.env.MCP_ENV_PATH`에 넣는다.
 *  - `process.argv`를 `[node, script, ...rest, '--exposition=<하나>']`로
 *    재조립한다. 값은 `readonly` 또는 `readonly,high` 둘 중 하나다.
 *  - **`--env-path` 또는 `--mcp`가 argv에 있으면 일부러 `MCP_ENV_PATH`를
 *    세팅하지 않는다**(344-347행) — 번들이 그 인자를 스스로 읽는다고 보기
 *    때문이다. 그래서 그 argv 통로 처리가 여기 있다.
 *
 * 셰임은 수정하지 않는다(구 부품 무접촉). 맞추는 쪽은 이쪽이다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DEFAULT_CALLBACK_PATH, uaaEndpoints } from '../auth';
import type { HandlerSet, ResolvedProfile } from '../contracts';
import {
  type DestinationSelection,
  type PlatformLookup,
  type ProfileResolution,
  type ServiceKeyConfig,
  disconnectedProfile,
  planServiceKeyConnection,
  readServiceKey,
  resolveBrokerStores,
  resolveProfileDetailed,
  resolveSessionEnv,
} from '../profile';
import {
  type BlocklistConfig,
  expositionFromArgvDetailed,
  readBlocklistConfig,
  resolveSafetyEnv,
  resolveUnsafeFlag,
} from '../safety';

/**
 * `--auth-interactive`가 콜백을 열 **기본 호스트**.
 *
 * 인증 계층의 `DEFAULT_CALLBACK_HOST`는 `127.0.0.1`이고 **그것은 그대로 둔다** —
 * 그 상수는 바인딩 안전(루프백 IP 고정)에 관한 그 계층의 결정이다. 여기 값은
 * 다른 것을 정한다: **XSUAA에 등록된 `redirect_uri` 문자열**이다. 판M2-b 실측에서
 * 화이트리스트가 받은 것은 `http://localhost:8080/callback`이었고, XSUAA는 이
 * 주소를 문자열·패턴으로 대조하므로 `127.0.0.1`로 조립하면 포트가 맞아도 거부된다
 * (D-116 ⓒ · D-117 ⓔ). 아는 것을 기본값으로 둔다.
 */
export const DEFAULT_INTERACTIVE_CALLBACK_HOST = 'localhost';
/** 같은 실측이 준 포트. `:8123`으로는 콜백이 오지 않았다(D-115). */
export const DEFAULT_INTERACTIVE_CALLBACK_PORT = 8080;

/**
 * `authorization_code` destination의 **정지선을 여는 열쇠**와 그 콜백 주소.
 *
 * D-091 ⓑ → D-114 ⓑ가 좁힌 정지선을 D-117 ⓐ가 **명시 옵트인 하나**로 열었다.
 * `enabled`가 거짓이면 그 destination은 오늘과 한 글자도 다르지 않다 — 무접속
 * 기동이고 UAA 왕복 0이다. 참일 때만 기동이 콜백을 열고 인가 URL을 stderr로
 * 건네고 **사람을 기다린다**.
 *
 * 노브 이름이 `--callback-*`인 이유: `--host`/`--port`는 HTTP/SSE 전송이 이미
 * 쓴다(`./transport/config.ts`). 같은 이름을 나눠 쓰면 웹 표면을 여는 인자와
 * 로그인 콜백을 여는 인자가 한 글자 차이로 뒤바뀐다.
 */
export interface AuthInteractive {
  /** `--auth-interactive`가 argv에 있는가. */
  readonly enabled: boolean;
  readonly callbackHost: string;
  readonly callbackPort: number;
}

export interface StartupInput {
  /** **전체** `process.argv` (`[node, script, ...]`). 앞 둘은 내부에서 버린다. */
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  /** 사용자 홈. 시험이 주입한다. */
  readonly homedir?: string;
}

/**
 * 기본값이 이미 적용된 기동 입력.
 *
 * `Startup` 안에 그대로 실려 다니는 이유는 하나다 — **재적재가 같은 통로로 다시
 * 해석해야 하기 때문**이다(`./session`의 `ProfileSession.reload`). 다른 통로로
 * 다시 해석하면 재적재 자체가 D16·D17이 막아 둔 사고 자리(운영자가 고르지 않은
 * 시스템에 조용히 붙는 것)를 뒷문으로 되살린다.
 */
export interface ResolvedStartupInput {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly homedir?: string;
}

export interface Startup {
  /** `tools/list`를 가르는 활성 핸들러 집합. */
  readonly sets: HandlerSet[];
  readonly profile: ResolvedProfile;
  /** 프로파일 `sap.env`의 원문 값들. 안전 노브가 여기서도 온다. */
  readonly envVars: Readonly<Record<string, string>>;
  /** 프로세스 env 위에 프로파일 값을 얹은 것. 도구 컨텍스트가 이것을 본다. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly blocklist: BlocklistConfig;
  /**
   * `--mcp=<destination>` · `--env=<name>` · 브로커 스위치(`--auth-broker` ·
   * `MCP_USE_AUTH_BROKER=true`)가 고른 인증 통로. 하나도 없으면 null.
   *
   * 통로가 열렸다고 접속이 생긴 것은 아니다 — `--env`는 세션 env 파일을 기존
   * Basic 해석기에 태워 접속을 만들지만, **이 함수** 안에서 `--mcp`와 브로커
   * 통로는 여전히 **재료 조립까지만** 한다. `--mcp`의 토큰은 기동 경로의 다음
   * 걸음(`./connectDestination`)이 받는다 — `client_credentials`는 언제나(D-114
   * ⓑ), `authorization_code`는 **`--auth-interactive`가 켜졌을 때만**(D-117 ⓐ).
   * 브로커 통로는 그 위에 destination 이름조차 고르지 않으므로, 접속을 소유하지
   * 않은 채 열려 있을 수 있다. 접속 여부는 언제나 `profile.connection`이 정본이다.
   */
  readonly destination: DestinationSelection | null;
  /**
   * `--auth-interactive`와 그 콜백 주소. 이 값을 읽는 곳은 기동 경로의 다음
   * 걸음(`./connectDestination`) 하나뿐이다.
   */
  readonly authInteractive: AuthInteractive;
  /** `MCP_UNSAFE` / `--unsafe`. 게이트에는 아무 영향이 없다. */
  readonly unsafe: boolean;
  /** 사람이 읽을 기동 진단. 서버가 그대로 stderr에 쓴다. */
  readonly diagnostics: string[];
  /**
   * 이 상태를 만든 입력. **재적재의 유일한 입력**이며, 도구가 넘긴 값은 여기에
   * 섞이지 않는다 — 재적재 결과가 (argv · 프로세스 env · 디스크의 파일)만의
   * 함수라는 것이 `ReloadProfile`이 연 표면의 상한이다.
   */
  readonly input: ResolvedStartupInput;
}

/** 인자 하나의 값을 읽는다. `--name=v`와 `--name v` 둘 다. 첫 등장이 이긴다. */
function argValue(args: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[i + 1] ?? '';
  }
  return undefined;
}

/**
 * `--auth-interactive` · `--callback-host` · `--callback-port`를 읽는다.
 *
 * 포트가 포트가 아니면 **기본값으로 되돌리고 그 사실을 말한다.** 조용히
 * 되돌리지 않는 이유는 콜백 계층이 적어 둔 것과 같다(`src/auth/callback.ts`
 * 머리말 — 「조용히 다른 포트로 옮기면 `redirect_uri`가 등록된 값과 어긋나
 * 인가 서버가 거절하고, 그 거절은 원인과 아주 먼 곳에서 보인다」).
 */
function resolveAuthInteractive(
  args: readonly string[],
  diagnostics: string[],
): AuthInteractive {
  const rawHost = (argValue(args, '--callback-host') ?? '').trim();
  const rawPort = (argValue(args, '--callback-port') ?? '').trim();

  let callbackPort = DEFAULT_INTERACTIVE_CALLBACK_PORT;
  if (rawPort !== '') {
    const parsed = Number(rawPort);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
      callbackPort = parsed;
    } else {
      diagnostics.push(
        `CALLBACK_PORT_INVALID: --callback-port=${rawPort} is not a port number (1-65535), so the ` +
          `loopback callback stays on ${DEFAULT_INTERACTIVE_CALLBACK_PORT}. That address has to ` +
          "match a redirect_uri registered on the XSUAA client, so fix the argument if this key's " +
          'whitelist names a different port.',
      );
    }
  }

  return {
    enabled: args.includes('--auth-interactive'),
    callbackHost: rawHost === '' ? DEFAULT_INTERACTIVE_CALLBACK_HOST : rawHost,
    callbackPort,
  };
}

/**
 * 구 `envResolver.resolvePathLike`와 같은 규칙 — 절대경로는 그대로, 상대는
 * cwd 기준으로 푼다(`engine/src/lib/config/envResolver.ts:18-21`).
 */
function resolveEnvPathLike(raw: string, cwd: string): string {
  return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

/**
 * 프로파일이 **아무것도 찾지 못한** 상태인지.
 *
 * cwd의 `.env` 폴백을 여기에만 허용하기 위한 판정이다. 홈 고정이 깨졌거나
 * (`ENV_INVALID`), 주입된 경로가 없거나(`ENV_PATH_MISSING`), 포인터가 가리킨
 * 프로파일이 없는 경우(`PROFILE_NOT_FOUND`)는 프로파일 계층이 **의도적으로**
 * 종결시킨 상태다 — 그 자리에서 프로젝트 로컬 파일로 흘러내리면 운영자가
 * 고르지 않은 시스템에 붙는다.
 */
function nothingResolved(profile: ResolvedProfile): boolean {
  return (
    profile.envPath === null &&
    profile.alias === null &&
    profile.diagnostics.length === 1 &&
    (profile.diagnostics[0] ?? '').startsWith('NO_PROFILE:')
  );
}

/**
 * 브로커 통로를 켠 스위치들. 비어 있으면 꺼진 것이다.
 *
 * 구 파서는 인자와 환경변수를 **합친다** —
 * `hasFlag('--auth-broker') || process.env.MCP_USE_AUTH_BROKER === 'true'`
 * (`engine/src/lib/config/ArgumentsParser.ts:182-183`). 그 합에 대해 Variant 3이
 * `!useAuthBroker`를 요구한다(`engine/src/lib/auth/brokerFactory.ts:185`).
 * **정의를 여기 하나로 두는 이유**: 이 값은 통로를 여는 판단과 cwd `.env`
 * 폴백을 잠그는 판단 **양쪽**에 쓰이고, 둘이 어긋나면 정확히 D17이 잡았던
 * 구멍(환경변수로 켠 기동이 cwd `.env`에 붙는 것)이 되돌아온다.
 */
/**
 * service key 하나를 읽은 **결과를 사람 말로** — 한 줄.
 *
 * 세 갈래이고, 갈래마다 사람이 할 일이 다르므로 진단 코드도 다르다:
 *  - `MCP_DESTINATION_NO_SERVICE_URL` — 토큰을 받아도 붙을 주소가 키에 없다.
 *    그랜트와 무관하게 끝나는 자리라 그랜트보다 먼저 말한다.
 *  - `MCP_DESTINATION_TOKEN_REQUIRED` — 기동이 곧 받아 온다
 *    (`./connectDestination`). 이 줄은 그 다음 줄의 머리말이다. 두 그랜트가
 *    여기 온다: `client_credentials`는 언제나, `authorization_code`는
 *    **`--auth-interactive`가 켜졌을 때만**(D-117 ⓐ). 무엇을 하려는지는 문면이
 *    갈라 말한다 — 한쪽은 서버 간 왕복이고 다른 쪽은 사람을 기다린다.
 *  - `MCP_DESTINATION_TOKEN_PENDING` — `authorization_code`인데 그 플래그가
 *    **없을 때**. **여기서 끝난다**: 기동은 시작하지 않고, 사람이 무엇을 해야
 *    하는지만 말한다. 「Startup does not begin that flow」가 참인 것은 정확히
 *    이 조건에서이므로(D-117 ⓖ) 다음 걸음으로 그 플래그를 함께 안내한다.
 */
function describeServiceKeyDestination(
  name: string,
  key: ServiceKeyConfig,
  interactive: AuthInteractive,
): string {
  const plan = planServiceKeyConnection(key);
  const shape = `${key.source}, ${key.storeType} shape`;
  const basic =
    'use --env=<name>, --env-path=<file>, or an active profile for a Basic connection.';

  if (plan.kind === 'no-service-url') {
    return (
      `MCP_DESTINATION_NO_SERVICE_URL: --mcp=${name} resolved its service key (${shape}) and its ` +
      'OAuth2 material is complete, but the key names no ADT service URL — a token would have ' +
      'nowhere to go, so the server starts with no connection and no token is requested. Add the ' +
      `ABAP service URL to ${key.source} (an "abap": { "url": ... } block, or "sap_url"), or ${basic}`
    );
  }

  const grant =
    `the ${key.grant} grant ` +
    (key.grantDeclared
      ? '(declared by the key)'
      : '(the default for a key that declares no granttype)');

  if (key.grant === 'client_credentials') {
    return (
      `MCP_DESTINATION_TOKEN_REQUIRED: --mcp=${name} resolved its service key (${shape}, service ` +
      `URL ${plan.baseUrl}) and it uses ${grant}. That grant needs no person and no browser, so ` +
      'startup acquires the first token itself — the next diagnostic says whether it got one. ' +
      'A profile reload does not: ReloadProfile re-reads argv, the environment and the disk, and ' +
      'a token is on none of them, so reloading a --mcp startup ends inspection-only and the ' +
      'server has to be restarted.'
    );
  }

  const callback =
    `http://${interactive.callbackHost}:${interactive.callbackPort}${DEFAULT_CALLBACK_PATH}`;

  if (interactive.enabled) {
    return (
      `MCP_DESTINATION_TOKEN_REQUIRED: --mcp=${name} resolved its service key (${shape}, service ` +
      `URL ${plan.baseUrl}) and it uses ${grant}. --auth-interactive is on, so startup binds a ` +
      `loopback callback on ${callback}, prints the authorization URL on stderr, and waits for a ` +
      'person to open it and sign in — it still opens no browser itself. That callback address ' +
      'has to be registered as a redirect_uri on this XSUAA client, or the authorization server ' +
      'refuses the redirect; --callback-host and --callback-port move it. The next diagnostic ' +
      'says whether a token arrived. A profile reload does not bring one back — ReloadProfile ' +
      're-reads argv, the environment and the disk, and a token is on none of them.'
    );
  }

  return (
    `MCP_DESTINATION_TOKEN_PENDING: --mcp=${name} resolved its service key (${shape}, service ` +
    `URL ${plan.baseUrl}) and it uses ${grant}. Startup does not begin that flow — it ends at a ` +
    'browser a person drives, and this engine never opens one — so the server starts with no ' +
    `connection. The authorization endpoint is ${uaaEndpoints(plan.uaa.url).authorize} ` +
    `(client_id ${plan.uaa.clientId}, response_type=code, redirect_uri a loopback callback that ` +
    'startup does not bind). Next: pass --auth-interactive and restart — startup then binds that ' +
    `callback on ${callback} (move it with --callback-host and --callback-port), prints the ` +
    'authorization URL on stderr for a person to open, and waits for the browser round trip; the ' +
    "callback address has to be one of this XSUAA client's registered redirect_uri values or the " +
    'authorization server refuses the redirect. Or, if this destination is meant to run ' +
    `server-to-server, add "granttype": "client_credentials" to ${key.source} and restart — ` +
    `startup acquires that token on its own. Otherwise ${basic}`
  );
}

function brokerSwitches(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const on: string[] = [];
  if (args.includes('--auth-broker')) on.push('--auth-broker');
  if ((env.MCP_USE_AUTH_BROKER ?? '').trim() === 'true') on.push('MCP_USE_AUTH_BROKER=true');
  return on;
}

/**
 * 진단 맨 끝의 한 줄 요약이 시작하는 글자.
 *
 * 기동 경로가 이 줄 **뒤에** 상태를 더 바꿀 수 있으므로(`./connectDestination`이
 * 토큰을 받아 접속을 세운다) 그 뒤에 이 줄을 다시 쓸 자리가 필요하다. 접두사를
 * 여기 하나로 두는 이유는 그것뿐이다 — 낡은 요약이 `connection=none`이라고
 * 적힌 채 남으면 진단이 자기 자신과 어긋난다.
 */
export const PROFILE_SUMMARY_PREFIX = '[sapkit] profile: ';

/** 그 한 줄. */
export function profileSummaryLine(
  profile: ResolvedProfile,
  sets: readonly HandlerSet[],
): string {
  return (
    `${PROFILE_SUMMARY_PREFIX}${profile.alias ?? '(none)'} · tier=${profile.tier} · ` +
    `systemType=${profile.systemType} · connection=${profile.connection ? 'yes' : 'none'} · ` +
    `exposition=${sets.join(',') || '(empty)'}`
  );
}

export function resolveStartup(input: StartupInput = {}): Startup {
  const argv = input.argv ?? process.argv;
  const args = argv.slice(2);
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const diagnostics: string[] = [];

  // ① 노출 — 셰임이 붙인 하나를 읽는다. 첫 등장이 이긴다(구 파서와 같다).
  const exposition = expositionFromArgvDetailed(args);
  diagnostics.push(...exposition.diagnostics);

  // ② 접속 — argv 통로가 먼저다.
  const authInteractive = resolveAuthInteractive(args, diagnostics);
  const explicitEnvPath = argValue(args, '--env-path');

  // `--mcp=<destination>`과 `--env=<name>`은 **destination 인자**다 — 운영자가
  // 어느 시스템에 붙을지 **이름으로** 고른 것이다. `--env`는 플랫폼 세션
  // 디렉터리의 `<name>.env`를, `--mcp`는 service key 저장소의 `<name>.json`을
  // 가리킨다(구 `envResolver.ts:30-53` · `brokerFactory.ts:146-183`).
  // `argValue`의 접두사는 `--env=`이므로 `--env-path`는 여기 걸리지 않는다.
  const mcpDestination = (argValue(args, '--mcp') ?? '').trim();
  const envDestination = (argValue(args, '--env') ?? '').trim();
  const authBrokerPath = (argValue(args, '--auth-broker-path') ?? '').trim();

  const envPathOption =
    explicitEnvPath !== undefined && explicitEnvPath.trim() !== ''
      ? resolveEnvPathLike(explicitEnvPath.trim(), cwd)
      : undefined;
  const injectedEnvPath = (env.MCP_ENV_PATH ?? '').trim();

  const lookup: PlatformLookup = {
    env,
    cwd,
    ...(input.homedir !== undefined ? { homedir: input.homedir } : {}),
    ...(authBrokerPath !== '' ? { authBrokerPath } : {}),
  };

  /** 프로파일 계층에 넘길 공통 인자. */
  const profileOptions = {
    cwd,
    env,
    ...(input.homedir !== undefined ? { homedir: input.homedir } : {}),
  };

  let destination: DestinationSelection | null = null;
  let resolution: ProfileResolution;

  if (mcpDestination !== '') {
    // ⓐ `--mcp` — service key 통로. 구 브로커의 Variant 1이고, Variant 2·3보다
    //    앞이다. **이 통로가 접속을 소유한다** — 실패했다고 MCP_ENV_PATH나 활성
    //    프로파일이나 cwd `.env`로 대신 붙지 않는다. 운영자가 고른 시스템이
    //    아닌 곳에 조용히 붙는 것이 D16·D17이 막아 둔 사고 자리다.
    //
    //    **이 함수는 토큰을 받지 않는다** — 순수한 해석이고, `ProfileSession`의
    //    재적재도 같은 통로로 다시 돈다. 토큰은 기동 경로의 다음 걸음
    //    (`./connectDestination`)이 받으며, D-114 ⓑ가 그 자리를 그랜트로 갈랐다:
    //    `client_credentials`는 사람이 개입할 자리가 없으므로 기동이 자동으로
    //    받는다. `authorization_code`는 사람이 브라우저 앞에 있어야 끝나므로
    //    **명시 옵트인 `--auth-interactive`가 있을 때만** 시작한다(D-117 ⓐ) —
    //    없으면 오늘 그대로 시작하지 않는다(attended 명시성 · 장부 D15).
    const channelDiagnostics: string[] = [];
    if (envDestination !== '') {
      channelDiagnostics.push(
        `ENV_DESTINATION_IGNORED: --env=${envDestination} was ignored because --mcp=${mcpDestination} names a service-key destination, which outranks it (the measured broker tries the service key first: engine/src/lib/auth/brokerFactory.ts:146-183).`,
      );
    }

    const found = readServiceKey(mcpDestination, lookup);
    switch (found.kind) {
      case 'ok': {
        destination = {
          channel: 'mcp',
          name: mcpDestination,
          source: found.key.source,
          serviceKey: found.key,
        };
        // 갈래마다 사람이 할 일이 다르다 — "곧 받아 온다" · "사람이 시작해야
        // 한다" · "토큰을 받아도 붙을 주소가 없다"는 서로 다른 이야기다.
        channelDiagnostics.push(
          describeServiceKeyDestination(mcpDestination, found.key, authInteractive),
        );
        break;
      }
      case 'unsafe-name':
        channelDiagnostics.push(
          `MCP_DESTINATION_INVALID: --mcp=${mcpDestination} is not a destination name — ${found.reason}. A destination names a file inside the service-key store, never a path; the server starts with no connection.`,
        );
        break;
      case 'not-found':
        channelDiagnostics.push(
          `MCP_DESTINATION_NOT_FOUND: --mcp=${mcpDestination} has no service key at ${found.path}${
            found.available.length
              ? ` (available: ${found.available.join(', ')})`
              : ' (no service keys found there)'
          } — the server starts with no connection and does not fall back to another system.`,
        );
        break;
      default:
        channelDiagnostics.push(
          `SERVICE_KEY_INVALID: the service key for --mcp=${mcpDestination} at ${found.path} could not be used — ${found.reason}. The server starts with no connection.`,
        );
        break;
    }
    if (destination === null) {
      destination = { channel: 'mcp', name: mcpDestination, source: null, serviceKey: null };
    }
    resolution = { profile: disconnectedProfile(channelDiagnostics), envVars: {} };
  } else if (envDestination !== '' && envPathOption === undefined && injectedEnvPath === '') {
    // ⓑ `--env` — 세션 env 파일 통로(구 Variant 2). 경로 인자(`--env-path`·
    //    `MCP_ENV_PATH`)가 있으면 그쪽이 이기므로 여기 오지 않는다
    //    (구 `resolveEnvFilePath`: envPath가 envDestination보다 앞).
    //
    //    찾은 파일은 **기존 Basic 해석기에 그대로 태운다** — 자격증명·키체인·
    //    tier·안전 노브가 전부 한 경로를 지나야 통로마다 규칙이 갈라지지 않는다.
    const found = resolveSessionEnv(envDestination, lookup);
    if (found.kind === 'ok') {
      destination = {
        channel: 'env',
        name: envDestination,
        source: found.path,
        serviceKey: null,
      };
      resolution = resolveProfileDetailed({ ...profileOptions, envPath: found.path });
    } else {
      destination = { channel: 'env', name: envDestination, source: null, serviceKey: null };
      const channelDiagnostics: string[] =
        found.kind === 'unsafe-name'
          ? [
              `ENV_DESTINATION_INVALID: --env=${envDestination} is not a session name — ${found.reason}. --env names a file inside the session store; use --env-path=<file> to point at a path. The server starts with no connection.`,
            ]
          : [
              `ENV_DESTINATION_NOT_FOUND: --env=${envDestination} has no session env file at ${found.path}${
                found.available.length
                  ? ` (available: ${found.available.join(', ')})`
                  : ' (no session env files found there)'
              } — the server starts with no connection and does not fall back to another system.`,
            ];
      resolution = { profile: disconnectedProfile(channelDiagnostics), envVars: {} };
    }
  } else {
    if (envDestination !== '') {
      diagnostics.push(
        `ENV_DESTINATION_IGNORED: --env=${envDestination} was ignored because an explicit env-file path (${
          envPathOption !== undefined ? '--env-path' : 'MCP_ENV_PATH'
        }) outranks it (the measured parser tries envPath before envDestination: engine/src/lib/config/envResolver.ts:35-43).`,
      );
    }

    resolution = resolveProfileDetailed({
      ...profileOptions,
      ...(envPathOption !== undefined ? { envPath: envPathOption } : {}),
    });

    // ③ cwd의 `.env` — 구 브로커의 마지막 폴백(`brokerFactory.ts:184-200`,
    //    Variant 3: stdio + cwd에 `.env`가 있고 `--auth-broker`가 아닐 때).
    //    아무것도 해석되지 않았을 때에만 본다. destination 인자(`--mcp`·`--env`)가
    //    있으면 보지 않는다 — 구 파서도 `--mcp`가 있으면 이 폴백을 잠갔고
    //    (`ArgumentsParser.ts:170`, `else if (!result.mcp)`), `--env`는 세션
    //    디렉터리 경로를 만들어 폴백 자체가 닿지 않았다(같은 파일 158-176행).
    //    두 인자는 위 갈래가 이미 걸러 내지만, **잠금은 여기에도 그대로 적는다**
    //    — 사고가 났던 자리이므로 조건이 한 군데 더 있는 편이 낫다.
    //
    //    브로커 선택은 **인자와 환경변수 두 통로**를 갖는다 — 구 파서가
    //    `hasFlag('--auth-broker') || process.env.MCP_USE_AUTH_BROKER === 'true'`로
    //    합치고(`ArgumentsParser.ts:182-183`) Variant 3이 그 합에 대해 `!useAuthBroker`를
    //    요구한다(`brokerFactory.ts:185`). 인자만 보면 환경변수로 브로커를 켠 기동이
    //    운영자가 고르지 않은 cwd `.env`에 붙는다.
    const switches = brokerSwitches(args, env);
    const useAuthBroker = switches.length > 0;
    if (
      resolution.profile.connection === null &&
      nothingResolved(resolution.profile) &&
      envPathOption === undefined &&
      mcpDestination === '' &&
      envDestination === '' &&
      !injectedEnvPath &&
      !useAuthBroker
    ) {
      const cwdEnv = path.resolve(cwd, '.env');
      if (fs.existsSync(cwdEnv)) {
        resolution = resolveProfileDetailed({ ...profileOptions, envPath: cwdEnv });
      }
    }

    // ④ 브로커 통로 — `--auth-broker` · `MCP_USE_AUTH_BROKER=true`.
    //
    //    **자리가 여기인 이유.** 구에서 이 스위치는 Variant 1(`--mcp`)과
    //    Variant 2(`--env`·`--env-path`·`MCP_ENV_PATH`)보다 **뒤**이고 Variant 3
    //    (cwd `.env`)보다 **앞**이다 — Variant 1·2의 조건에는 이 스위치가 아예
    //    없고 Variant 3만 `!useAuthBroker`를 요구한다
    //    (`engine/src/lib/auth/brokerFactory.ts:146,167,185`). 셰임도
    //    `--auth-broker`에는 `MCP_ENV_PATH` 세팅을 멈추지 않으므로
    //    (`interactive/server/launch.cjs:344` — 멈추는 것은 `--env-path`·`--mcp`
    //    뿐이다) 구에서도 활성 프로파일은 그대로 Variant 2를 탄다. 그래서 이
    //    갈래는 **앞의 통로를 가로채지 않는다** — 가로채면 그 자체가 회귀다.
    //
    //    통로가 열렸다고 접속이 생기는 것도 아니다. 이 스위치는 **이름을 고르지
    //    않고**, 구도 그 상태에서는 기본 브로커를 만들지 않는다
    //    (`brokerFactory.ts:283-293`) — destination이 지목될 때 저장소에서
    //    그때그때 만든다(`336-372`). 조립되는 것은 저장소 재료까지이고, 그
    //    다음(토큰)은 브라우저 OAuth2 로그인이라 실접속이다(차이 장부 D15).
    if (useAuthBroker) {
      const stores = resolveBrokerStores(lookup);
      destination = {
        channel: 'broker',
        name: '',
        source: null,
        serviceKey: null,
        broker: stores,
      };
      if (resolution.profile.connection !== null) {
        // 켜 두었는데 접속은 딴 통로가 소유했다 — 조용히 삼키지 않는다.
        diagnostics.push(
          `AUTH_BROKER_IGNORED: the auth broker channel is on (${switches.join(', ')}), but an env-file channel resolved the connection first and owns it (${resolution.profile.envPath}). The measured broker behaves the same way: --env/--env-path/MCP_ENV_PATH is Variant 2 and the broker switch only locks Variant 3 (engine/src/lib/auth/brokerFactory.ts:167,185).`,
        );
      } else {
        diagnostics.push(
          `AUTH_BROKER_NO_DESTINATION: the auth broker channel is on (${switches.join(', ')}) but no destination was named, so this channel produced no connection — the measured broker creates no default broker in that case either (engine/src/lib/auth/brokerFactory.ts:283-293) and resolves credentials only for a destination that is named. Service keys: ${stores.serviceKeysDir}${
            stores.destinations.length
              ? ` (available: ${stores.destinations.join(', ')})`
              : ' (no service keys found there)'
          }. Sessions: ${stores.sessionsDir}. Name one with --mcp=<name>, or use --env=<name>, --env-path=<file>, or an active profile for a Basic connection. The project-local .env fallback stays locked while this channel is on.`,
        );
      }
    }
  }

  diagnostics.push(...resolution.profile.diagnostics);

  const safetyEnv = resolveSafetyEnv(env, resolution.envVars);
  const profile = resolution.profile;
  diagnostics.push(profileSummaryLine(profile, exposition.sets));

  return {
    sets: exposition.sets,
    profile,
    envVars: resolution.envVars,
    env: safetyEnv,
    blocklist: readBlocklistConfig(safetyEnv),
    destination,
    authInteractive,
    unsafe: resolveUnsafeFlag({ argv: args, env }),
    diagnostics,
    input: {
      argv: [...argv],
      // env는 **참조로** 실어 나른다. 기본값이 `process.env`일 때 재적재가 그
      // 사이에 바뀐 값을 보아야 하기 때문이다. 이 계층은 env에 쓰지 않는다(구
      // 엔진의 `applyProfile`은 `process.env.SAP_*`를 덮어썼다 —
      // `engine/src/lib/profile.ts:271-280`).
      env,
      cwd,
      ...(input.homedir !== undefined ? { homedir: input.homedir } : {}),
    },
  };
}
