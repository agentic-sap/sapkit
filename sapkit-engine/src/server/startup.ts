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

import type { HandlerSet, ResolvedProfile } from '../contracts';
import { type ProfileResolution, resolveProfileDetailed } from '../profile';
import {
  type BlocklistConfig,
  expositionFromArgvDetailed,
  readBlocklistConfig,
  resolveSafetyEnv,
  resolveUnsafeFlag,
} from '../safety';

export interface StartupInput {
  /** **전체** `process.argv` (`[node, script, ...]`). 앞 둘은 내부에서 버린다. */
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  /** 사용자 홈. 시험이 주입한다. */
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
  /** `MCP_UNSAFE` / `--unsafe`. 게이트에는 아무 영향이 없다. */
  readonly unsafe: boolean;
  /** 사람이 읽을 기동 진단. 서버가 그대로 stderr에 쓴다. */
  readonly diagnostics: string[];
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
  const explicitEnvPath = argValue(args, '--env-path');

  // `--mcp=<destination>`과 `--env=<name>`은 **destination 인자**다 — 운영자가
  // 어느 시스템에 붙을지 이름으로 고른 것이고, M1은 그 두 통로를 짓지 않았다.
  // (`--env`는 플랫폼 세션 디렉터리 조회, `--mcp`는 service key 브로커.)
  // 인식해서 이름 있는 진단을 남기되, cwd의 `.env` 폴백에서는 **제외한다**
  // — 고르지 않은 시스템에 조용히 붙는 것이 진단 문구와 정면으로 어긋난다.
  // `argValue`의 접두사는 `--env=`이므로 `--env-path`는 여기 걸리지 않는다.
  const mcpDestination = (argValue(args, '--mcp') ?? '').trim();
  const envDestination = (argValue(args, '--env') ?? '').trim();
  if (mcpDestination !== '') {
    diagnostics.push(
      `MCP_DESTINATION_UNSUPPORTED: --mcp=${mcpDestination} names an auth-broker destination (service keys), which M1 does not implement — M1 authenticates with Basic credentials from an env file only. The server starts with no connection; use --env-path=<file> or an active profile instead.`,
    );
  }
  if (envDestination !== '') {
    diagnostics.push(
      `ENV_DESTINATION_UNSUPPORTED: --env=${envDestination} names a session stored in the platform session directory, which M1 does not implement — M1 reads an env file by path only. The server starts with no connection; use --env-path=<file> or an active profile instead.`,
    );
  }
  const envPathOption =
    explicitEnvPath !== undefined && explicitEnvPath.trim() !== ''
      ? resolveEnvPathLike(explicitEnvPath.trim(), cwd)
      : undefined;

  let resolution: ProfileResolution = resolveProfileDetailed({
    cwd,
    env,
    ...(input.homedir !== undefined ? { homedir: input.homedir } : {}),
    ...(envPathOption !== undefined ? { envPath: envPathOption } : {}),
  });

  // ③ cwd의 `.env` — 구 브로커의 마지막 폴백(`brokerFactory.ts:184-200`,
  //    Variant 3: stdio + cwd에 `.env`가 있고 `--auth-broker`가 아닐 때).
  //    아무것도 해석되지 않았을 때에만 본다. destination 인자(`--mcp`·`--env`)가
  //    있으면 보지 않는다 — 구 파서도 `--mcp`가 있으면 이 폴백을 잠갔고
  //    (`ArgumentsParser.ts:170`, `else if (!result.mcp)`), `--env`는 세션
  //    디렉터리 경로를 만들어 폴백 자체가 닿지 않았다(같은 파일 158-176행).
  //
  //    브로커 선택은 **인자와 환경변수 두 통로**를 갖는다 — 구 파서가
  //    `hasFlag('--auth-broker') || process.env.MCP_USE_AUTH_BROKER === 'true'`로
  //    합치고(`ArgumentsParser.ts:182-183`) Variant 3이 그 합에 대해 `!useAuthBroker`를
  //    요구한다(`brokerFactory.ts:185`). 인자만 보면 환경변수로 브로커를 켠 기동이
  //    운영자가 고르지 않은 cwd `.env`에 붙는다.
  const useAuthBroker =
    args.includes('--auth-broker') || (env.MCP_USE_AUTH_BROKER ?? '').trim() === 'true';
  if (
    resolution.profile.connection === null &&
    nothingResolved(resolution.profile) &&
    envPathOption === undefined &&
    mcpDestination === '' &&
    envDestination === '' &&
    !(env.MCP_ENV_PATH ?? '').trim() &&
    !useAuthBroker
  ) {
    const cwdEnv = path.resolve(cwd, '.env');
    if (fs.existsSync(cwdEnv)) {
      resolution = resolveProfileDetailed({
        cwd,
        env,
        ...(input.homedir !== undefined ? { homedir: input.homedir } : {}),
        envPath: cwdEnv,
      });
    }
  }

  diagnostics.push(...resolution.profile.diagnostics);

  const safetyEnv = resolveSafetyEnv(env, resolution.envVars);
  const profile = resolution.profile;
  diagnostics.push(
    `[sapkit] profile: ${profile.alias ?? '(none)'} · tier=${profile.tier} · ` +
      `systemType=${profile.systemType} · connection=${profile.connection ? 'yes' : 'none'} · ` +
      `exposition=${exposition.sets.join(',') || '(empty)'}`,
  );

  return {
    sets: exposition.sets,
    profile,
    envVars: resolution.envVars,
    env: safetyEnv,
    blocklist: readBlocklistConfig(safetyEnv),
    unsafe: resolveUnsafeFlag({ argv: args, env }),
    diagnostics,
  };
}
