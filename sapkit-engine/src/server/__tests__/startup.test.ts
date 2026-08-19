/**
 * 기동 계약 — 셰임(`interactive/server/launch.cjs`)이 넘겨주는 것만으로
 * 서버가 자기 상태를 정한다.
 *
 * 여기서 고정하는 것은 세 통로다:
 *   ① `--exposition=<하나>` — 셰임이 정확히 하나만 붙여 넘긴다.
 *   ② `MCP_ENV_PATH` — 셰임이 활성 프로파일을 찾아 넣는 자리.
 *   ③ `--env-path` / `--mcp` — **셰임이 일부러 ①②를 세팅하지 않는 경우**
 *      (launch.cjs 344-347행). 이 통로를 신 엔진이 스스로 읽지 않으면 그 두
 *      인자로 기동한 사용자는 조용히 무접속이 된다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveStartup } from '../startup';
import { argvOf, cleanupTempDirs, tempDir, writeEnvFile, writeProfile } from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

// ── destination 통로용 fixture ──────────────────────────────────────────────
// `--auth-broker-path`가 가리키는 저장소 뿌리 하나 아래에 `service-keys/`와
// `sessions/`를 둔다. 실제 destination 이름·호스트·키는 쓰지 않는다.

const FAKE_SECRET = 'fixture-not-a-real-secret';

function storeRoot(): string {
  const root = tempDir('sapkit-store-');
  fs.mkdirSync(path.join(root, 'service-keys'), { recursive: true });
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });
  return root;
}

function writeServiceKey(root: string, name: string, body?: unknown): string {
  const file = path.join(root, 'service-keys', `${name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      body ?? {
        uaa: {
          url: 'https://uaa.invalid/oauth',
          clientid: 'fixture-client',
          clientsecret: FAKE_SECRET,
        },
        abap: { url: 'http://127.0.0.1:1', client: '100', language: 'EN' },
      },
      null,
      2,
    ),
    'utf8',
  );
  return file;
}

function writeSessionEnv(
  root: string,
  name: string,
  overrides: Readonly<Record<string, string>> = {},
): string {
  return writeEnvFile(path.join(root, 'sessions', `${name}.env`), overrides);
}

describe('노출 제어 (--exposition)', () => {
  it('인자가 없으면 기본값 readonly,high로 기동한다', () => {
    const cwd = tempDir();
    const startup = resolveStartup({ argv: argvOf(), env: {}, cwd, homedir: tempDir() });
    expect(startup.sets).toEqual(['readonly', 'high']);
  });

  it('셰임이 넘기는 두 값을 각각 그대로 소비한다', () => {
    const home = tempDir();
    const cwd = tempDir();
    const readonly = resolveStartup({
      argv: argvOf('--exposition=readonly'),
      env: {},
      cwd,
      homedir: home,
    });
    const development = resolveStartup({
      argv: argvOf('--exposition=readonly,high'),
      env: {},
      cwd,
      homedir: home,
    });
    expect(readonly.sets).toEqual(['readonly']);
    expect(development.sets).toEqual(['readonly', 'high']);
  });

  it('알 수 없는 값은 표면을 열지 않고 진단을 남긴다 (D5)', () => {
    const startup = resolveStartup({
      argv: argvOf('--exposition=bogus'),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.sets).toEqual([]);
    expect(startup.diagnostics.join('\n')).toContain('EXPOSITION_UNKNOWN');
  });
});

describe('프로파일 해석', () => {
  it('무프로파일이면 죽지 않고 inspection-only로 기동한다', () => {
    const startup = resolveStartup({
      argv: argvOf('--exposition=readonly'),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
    expect(startup.diagnostics.join('\n')).toContain('NO_PROFILE');
  });

  it('MCP_ENV_PATH를 수용한다 (셰임의 기본 통로)', () => {
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'sap.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--exposition=readonly,high'),
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(envPath);
    expect(startup.profile.tier).toBe('DEV');
    expect(startup.profile.connection?.baseUrl).toBe('http://127.0.0.1:1');
  });

  it('활성 프로파일 포인터를 스스로 해석한다', () => {
    const home = tempDir();
    const cwd = tempDir();
    writeProfile({ home, cwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });
    const startup = resolveStartup({
      argv: argvOf('--exposition=readonly'),
      env: { SAPKIT_HOME_DIR: home },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.alias).toBe('dev1');
    expect(startup.profile.tier).toBe('DEV');
  });

  it('배포 축을 읽는다 — 미설정은 cloud, legacy는 독자 값 (D7)', () => {
    const dir = tempDir();
    const unset = writeEnvFile(path.join(dir, 'a.env'));
    const legacy = writeEnvFile(path.join(dir, 'b.env'), { SAP_SYSTEM_TYPE: 'legacy' });
    const onprem = writeEnvFile(path.join(dir, 'c.env'), { SAP_SYSTEM_TYPE: 'onprem' });
    const read = (envPath: string) =>
      resolveStartup({ argv: argvOf(), env: { MCP_ENV_PATH: envPath }, cwd: tempDir(), homedir: tempDir() })
        .profile.systemType;
    expect(read(unset)).toBe('cloud');
    expect(read(legacy)).toBe('legacy');
    expect(read(onprem)).toBe('onprem');
  });
});

describe('argv 접속 통로 — 셰임이 MCP_ENV_PATH를 세팅하지 않는 경우', () => {
  it('--env-path=<절대경로>가 프로파일 해석에 닿는다', () => {
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'explicit.env'), { SAP_TIER: 'QA' });
    const startup = resolveStartup({
      argv: argvOf(`--env-path=${envPath}`, '--exposition=readonly'),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(envPath);
    expect(startup.profile.tier).toBe('QA');
  });

  it('--env-path <값> 분리 형태도 받는다', () => {
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'explicit.env'));
    const startup = resolveStartup({
      argv: argvOf('--env-path', envPath),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(envPath);
  });

  it('상대 경로는 cwd 기준으로 푼다 (구 envResolver 계약)', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, 'local.env'));
    const startup = resolveStartup({
      argv: argvOf('--env-path=local.env'),
      env: {},
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(path.join(cwd, 'local.env'));
  });

  it('--env-path가 MCP_ENV_PATH를 이긴다 (구 ArgumentsParser 우선순위)', () => {
    const dir = tempDir();
    const fromArg = writeEnvFile(path.join(dir, 'arg.env'), { SAP_TIER: 'DEV' });
    const fromEnv = writeEnvFile(path.join(dir, 'env.env'), { SAP_TIER: 'PRD' });
    const startup = resolveStartup({
      argv: argvOf(`--env-path=${fromArg}`),
      env: { MCP_ENV_PATH: fromEnv },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(fromArg);
    expect(startup.profile.tier).toBe('DEV');
  });

  // D17 잠금. 통로가 구현된 뒤에도 **없는 destination이 cwd `.env`로 흘러내리지
  // 않는다** — "접속 없이 시작한다"고 말해 놓고 딴 시스템에 붙는 것이 사고 자리다.
  it('--mcp=<destination>이 있으면 cwd에 .env가 있어도 접속을 만들지 않는다', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'), { SAP_TIER: 'PRD' });
    const startup = resolveStartup({
      argv: argvOf('--mcp=NOSUCHDEST'),
      env: { AUTH_BROKER_PATH: storeRoot() },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.envPath).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_NOT_FOUND');
  });

  it('--env=<name>이 있으면 cwd에 .env가 있어도 접속을 만들지 않는다', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'), { SAP_TIER: 'PRD' });
    const startup = resolveStartup({
      argv: argvOf('--env=NOSUCHDEST'),
      env: { AUTH_BROKER_PATH: storeRoot() },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.envPath).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
    expect(startup.diagnostics.join('\n')).toContain('ENV_DESTINATION_NOT_FOUND');
  });

  it('--env-path는 --env로 잘못 잡히지 않는다 (접두사 오탐 · 두 형태 모두)', () => {
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'explicit.env'), { SAP_TIER: 'QA' });
    const joined = resolveStartup({
      argv: argvOf(`--env-path=${envPath}`),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    const split = resolveStartup({
      argv: argvOf('--env-path', envPath),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    for (const startup of [joined, split]) {
      expect(startup.profile.envPath).toBe(envPath);
      expect(startup.profile.tier).toBe('QA');
      expect(startup.destination).toBeNull();
      expect(startup.diagnostics.join('\n')).not.toContain('ENV_DESTINATION');
    }
  });

  it('cwd의 .env는 아무것도 해석되지 않았을 때만 쓰인다 (구 brokerFactory Variant 3)', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf(),
      env: {},
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(path.join(cwd, '.env'));
    expect(startup.profile.tier).toBe('DEV');
  });

  it('--auth-broker가 있으면 cwd의 .env를 채택하지 않는다', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'));
    const startup = resolveStartup({
      argv: argvOf('--auth-broker'),
      env: {},
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
  });

  // 브로커 선택은 인자와 환경변수 두 통로다 — 구 파서가 둘을 합치고
  // (`ArgumentsParser.ts:182-183`) Variant 3이 그 합에 대해 잠근다
  // (`brokerFactory.ts:185`). 인자만 보면 환경변수로 켠 기동이 운영자가
  // 고르지 않은 cwd `.env`에 붙는다.
  it('MCP_USE_AUTH_BROKER=true도 cwd의 .env를 잠근다 (인자 아닌 통로)', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'));
    const startup = resolveStartup({
      argv: argvOf(),
      env: { MCP_USE_AUTH_BROKER: 'true' },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.envPath).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
  });

  it('MCP_USE_AUTH_BROKER가 true가 아니면 폴백은 그대로 산다', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'));
    const startup = resolveStartup({
      argv: argvOf(),
      env: { MCP_USE_AUTH_BROKER: 'false' },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(path.join(cwd, '.env'));
  });

  it('SAPKIT_HOME_DIR 고정이 깨졌으면 cwd의 .env로 흘러내리지 않는다', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'));
    const startup = resolveStartup({
      argv: argvOf(),
      env: { SAPKIT_HOME_DIR: path.join(tempDir(), 'gone') },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('ENV_INVALID');
  });

  it('포인터가 가리킨 프로파일이 없으면 cwd의 .env로 흘러내리지 않는다', () => {
    const cwd = tempDir();
    const home = tempDir();
    fs.mkdirSync(path.join(cwd, '.sapkit'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.sapkit', 'active-profile.txt'), 'ghost', 'utf8');
    writeEnvFile(path.join(cwd, '.env'));
    const startup = resolveStartup({
      argv: argvOf(),
      env: { SAPKIT_HOME_DIR: home },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('PROFILE_NOT_FOUND');
  });
});

/**
 * destination 통로 — `--env=<name>`.
 *
 * 구는 이름을 플랫폼 세션 디렉터리의 `<name>.env`로 풀어 그 파일로 접속을
 * 만든다(`engine/src/lib/config/envResolver.ts:30-53` ·
 * `engine/src/lib/auth/brokerFactory.ts:165-183` Variant 2). 신도 같은 자리에서
 * 같은 파일을 찾아 **기존 Basic 해석기에 그대로 태운다** — 자격증명·키체인·
 * tier·안전 노브가 전부 한 경로를 지난다.
 */
describe('destination 통로 — --env=<name> (세션 env 파일)', () => {
  it('세션 디렉터리의 <name>.env로 접속을 조립한다', () => {
    const root = storeRoot();
    const file = writeSessionEnv(root, 'DEST1', { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1', '--exposition=readonly,high'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(file);
    expect(startup.profile.connection?.baseUrl).toBe('http://127.0.0.1:1');
    expect(startup.profile.tier).toBe('DEV');
    expect(startup.destination).toEqual({
      channel: 'env',
      name: 'DEST1',
      source: file,
      serviceKey: null,
    });
  });

  it('--auth-broker-path 인자로도 세션 디렉터리를 고를 수 있다', () => {
    const root = storeRoot();
    const file = writeSessionEnv(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1', `--auth-broker-path=${root}`),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(file);
  });

  it('이름에 .env가 이미 붙어 있으면 두 번 붙이지 않는다', () => {
    const root = storeRoot();
    const file = writeSessionEnv(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1.env'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(file);
  });

  it('세션 파일이 없으면 이름 있는 진단을 남기고 무접속으로 간다', () => {
    const root = storeRoot();
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
    expect(startup.diagnostics.join('\n')).toContain('ENV_DESTINATION_NOT_FOUND');
    expect(startup.diagnostics.join('\n')).toContain('DEST1');
  });

  // D17 조항 유지 — 구는 `--env=./foo.env`를 하위 호환으로 경로처럼 다뤘다.
  // 신은 이름만 이름으로 받는다. 되돌리지 않는다.
  it('경로처럼 생긴 --env 값은 경로로 다루지 않고 거부한다 (D17)', () => {
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, 'foo.env'), { SAP_TIER: 'PRD' });
    const startup = resolveStartup({
      argv: argvOf('--env=./foo.env'),
      env: { AUTH_BROKER_PATH: storeRoot() },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.envPath).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('ENV_DESTINATION_INVALID');
  });

  it('세션 파일이 없어도 활성 프로파일로 흘러내리지 않는다', () => {
    const root = storeRoot();
    const home = tempDir();
    const cwd = tempDir();
    writeProfile({ home, cwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1'),
      env: { AUTH_BROKER_PATH: root, SAPKIT_HOME_DIR: home },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.alias).toBeNull();
  });

  it('--env-path가 --env를 이긴다 (구 resolveEnvFilePath 우선순위)', () => {
    const root = storeRoot();
    writeSessionEnv(root, 'DEST1', { SAP_TIER: 'PRD' });
    const dir = tempDir();
    const explicit = writeEnvFile(path.join(dir, 'explicit.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1', `--env-path=${explicit}`),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(explicit);
    expect(startup.profile.tier).toBe('DEV');
    expect(startup.destination).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('ENV_DESTINATION_IGNORED');
  });

  it('MCP_ENV_PATH가 --env를 이긴다', () => {
    const root = storeRoot();
    writeSessionEnv(root, 'DEST1', { SAP_TIER: 'PRD' });
    const dir = tempDir();
    const injected = writeEnvFile(path.join(dir, 'injected.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1'),
      env: { AUTH_BROKER_PATH: root, MCP_ENV_PATH: injected },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(injected);
    expect(startup.profile.tier).toBe('DEV');
  });

  // 구 Variant 2는 브로커 스위치보다 앞에 있다 — `useAuthBroker`는 Variant 3만
  // 잠근다(`brokerFactory.ts:167,185`). 뒤 과제(브로커 통로)가 이 자리를
  // 좁히지 않도록 못 박는다.
  it('MCP_USE_AUTH_BROKER=true여도 --env 통로는 산다', () => {
    const root = storeRoot();
    const file = writeSessionEnv(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1'),
      env: { AUTH_BROKER_PATH: root, MCP_USE_AUTH_BROKER: 'true' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.envPath).toBe(file);
  });

  it('세션 파일의 안전 노브도 프로파일 값으로 읽힌다 — 푸는 쪽은 그 파일만이 정한다', () => {
    const root = storeRoot();
    writeSessionEnv(root, 'DEST1', { MCP_BLOCKLIST_PROFILE: 'minimal', MCP_ALLOW_TABLE: 'BNKA' });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1'),
      // 프로세스 env가 다른 테이블을 열려고 한다 — 통하지 않아야 한다.
      env: { AUTH_BROKER_PATH: root, MCP_ALLOW_TABLE: 'KNA1' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.blocklist.profile).toBe('minimal');
    expect(startup.blocklist.allow.has('BNKA')).toBe(true);
    expect(startup.blocklist.allow.has('KNA1')).toBe(false);
  });
});

/**
 * destination 통로 — `--mcp=<destination>` (service key).
 *
 * 구는 service key로 OAuth2 토큰을 받아 접속한다
 * (`engine/src/lib/auth/brokerFactory.ts:146-164` Variant 1). 이 판은 **설정
 * 조립까지만** 짓는다 — 토큰 취득은 실접속이라 범위 밖이고, 그래서 D15는
 * 장부에 남는다. 조립된 설정이 있다는 사실과 아직 접속이 아니라는 사실을
 * 둘 다 말해야 한다.
 */
describe('destination 통로 — --mcp=<destination> (service key)', () => {
  it('service key를 읽어 설정을 조립하고, 접속은 아직 아니라고 말한다', () => {
    const root = storeRoot();
    const file = writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.channel).toBe('mcp');
    expect(startup.destination?.source).toBe(file);
    expect(startup.destination?.serviceKey).toEqual({
      destination: 'DEST1',
      source: file,
      storeType: 'abap',
      serviceUrl: 'http://127.0.0.1:1',
      client: '100',
      language: 'EN',
      auth: {
        uaaUrl: 'https://uaa.invalid/oauth',
        clientId: 'fixture-client',
        clientSecret: FAKE_SECRET,
      },
    });
    // 접속된 척하지 않는다.
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_TOKEN_PENDING');
  });

  it('진단에 clientsecret 값이 실리지 않는다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.diagnostics.join('\n')).not.toContain(FAKE_SECRET);
    expect(startup.profile.diagnostics.join('\n')).not.toContain(FAKE_SECRET);
  });

  it('service key가 없으면 이름 있는 진단을 남기고 무접속으로 간다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'OTHER');
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.serviceKey).toBeNull();
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_NOT_FOUND');
    expect(startup.diagnostics.join('\n')).toContain('OTHER');
  });

  it('service key가 깨졌어도 기동은 죽지 않는다 (D20)', () => {
    const root = storeRoot();
    fs.writeFileSync(path.join(root, 'service-keys', 'DEST1.json'), 'not json', 'utf8');
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.sets).toEqual(['readonly', 'high']);
    expect(startup.diagnostics.join('\n')).toContain('SERVICE_KEY_INVALID');
  });

  it('경로처럼 생긴 destination은 파일을 찾지 않고 거부한다', () => {
    const root = storeRoot();
    const startup = resolveStartup({
      argv: argvOf('--mcp=../DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_INVALID');
  });

  // 구 Variant 1은 Variant 2·3보다 앞이다 — service key가 접속을 소유한다.
  // 신은 아직 그 접속을 완성하지 못하므로, **딴 통로로 대신 붙지 않는다.**
  it('--mcp이 있으면 MCP_ENV_PATH로 대신 붙지 않는다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const dir = tempDir();
    const injected = writeEnvFile(path.join(dir, 'injected.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root, MCP_ENV_PATH: injected },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.envPath).toBeNull();
  });

  it('--mcp이 있으면 활성 프로파일로도 대신 붙지 않는다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const home = tempDir();
    const cwd = tempDir();
    writeProfile({ home, cwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root, SAPKIT_HOME_DIR: home },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.alias).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
  });

  it('--mcp이 --env를 이기고, 무시했다고 말한다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    writeSessionEnv(root, 'DEST2', { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1', '--env=DEST2'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.channel).toBe('mcp');
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('ENV_DESTINATION_IGNORED');
  });
});

/**
 * 브로커 통로 — `--auth-broker` · `MCP_USE_AUTH_BROKER=true`.
 *
 * 구에서 이 스위치의 효과는 **딱 두 가지**다(실측):
 *   ⓐ 인자와 환경변수를 하나로 합쳐(`engine/src/lib/config/ArgumentsParser.ts:182-183`)
 *      Variant 3(cwd `.env`)을 잠근다(`engine/src/lib/auth/brokerFactory.ts:185`).
 *   ⓑ **기본 브로커를 만들지 않는다** — Variant 1(`--mcp`)·2(`--env`)가 아니면
 *      어떤 갈래에도 걸리지 않아 `DEFAULT_BROKER_NOT_CREATED`로 끝나고
 *      (`brokerFactory.ts:283-293`), 접속 맥락은 destination이 **지목될 때**
 *      저장소에서 그때그때 만들어진다(`brokerFactory.ts:336-372`).
 *
 * 그러므로 이 스위치는 **이름을 고르지 않는다.** 신이 조립할 수 있는 재료는
 * 저장소 위치와 그 안의 이름들까지이고, 그 이상은 destination이 지목되는
 * 통로(`--mcp`, 또는 아직 없는 HTTP 헤더 통로 — 장부 D30)의 몫이다.
 */
describe('브로커 통로 — --auth-broker / MCP_USE_AUTH_BROKER', () => {
  it('인자로 켜면 통로를 인식하고 저장소 재료를 조립한다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--auth-broker', '--exposition=readonly,high'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination).toEqual({
      channel: 'broker',
      name: '',
      source: null,
      serviceKey: null,
      broker: {
        serviceKeysDir: path.join(root, 'service-keys'),
        sessionsDir: path.join(root, 'sessions'),
        destinations: ['DEST1'],
      },
    });
  });

  it('환경변수로 켜도 똑같이 인식한다 (구가 인자와 환경변수를 합친다)', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf(),
      env: { AUTH_BROKER_PATH: root, MCP_USE_AUTH_BROKER: 'true' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.channel).toBe('broker');
    expect(startup.destination?.broker?.destinations).toEqual(['DEST1']);
  });

  it('스위치가 없으면 브로커 통로를 열지 않는다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf(),
      env: { AUTH_BROKER_PATH: root, MCP_USE_AUTH_BROKER: 'false' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination).toBeNull();
  });

  // 통로가 열렸다고 접속이 생긴 것이 아니다 — 이 스위치는 이름을 고르지 않는다.
  it('destination을 고르지 않으므로 접속을 만들지 않고 이유를 말한다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--auth-broker'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.profile.envPath).toBeNull();
    expect(startup.profile.tier).toBe('UNKNOWN');
    expect(startup.diagnostics.join('\n')).toContain('AUTH_BROKER_NO_DESTINATION');
    expect(startup.diagnostics.join('\n')).toContain('DEST1');
  });

  // D17 보강분. 인자 통로에도 재료 조립이 붙은 뒤에 잠금이 살아 있는지 본다.
  it('통로가 켜지면 cwd에 .env가 있어도 접속이 생기지 않는다 (D17 보강분)', () => {
    const root = storeRoot();
    const cwd = tempDir();
    writeEnvFile(path.join(cwd, '.env'), { SAP_TIER: 'PRD' });
    for (const startup of [
      resolveStartup({
        argv: argvOf('--auth-broker'),
        env: { AUTH_BROKER_PATH: root },
        cwd,
        homedir: tempDir(),
      }),
      resolveStartup({
        argv: argvOf(),
        env: { AUTH_BROKER_PATH: root, MCP_USE_AUTH_BROKER: 'true' },
        cwd,
        homedir: tempDir(),
      }),
    ]) {
      expect(startup.profile.connection).toBeNull();
      expect(startup.profile.envPath).toBeNull();
      expect(startup.profile.tier).toBe('UNKNOWN');
      expect(startup.destination?.channel).toBe('broker');
    }
  });

  it('저장소가 통째로 없어도 기동이 죽지 않고 inspection-only로 간다 (D20)', () => {
    const missing = path.join(tempDir(), 'nowhere');
    const startup = resolveStartup({
      argv: argvOf('--auth-broker'),
      env: { AUTH_BROKER_PATH: missing },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.sets).toEqual(['readonly', 'high']);
    expect(startup.profile.connection).toBeNull();
    expect(startup.destination?.broker?.destinations).toEqual([]);
    expect(startup.diagnostics.join('\n')).toContain('AUTH_BROKER_NO_DESTINATION');
  });

  it('진단에 service key의 clientsecret 값이 실리지 않는다', () => {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--auth-broker'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.diagnostics.join('\n')).not.toContain(FAKE_SECRET);
    expect(JSON.stringify(startup.destination)).not.toContain(FAKE_SECRET);
  });

  // 구 Variant 1은 브로커 스위치와 무관하게 먼저 잡힌다.
  it('--mcp이 브로커 스위치보다 앞이다', () => {
    const root = storeRoot();
    const file = writeServiceKey(root, 'DEST1');
    const startup = resolveStartup({
      argv: argvOf('--mcp=DEST1', '--auth-broker'),
      env: { AUTH_BROKER_PATH: root, MCP_USE_AUTH_BROKER: 'true' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.channel).toBe('mcp');
    expect(startup.destination?.source).toBe(file);
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_TOKEN_PENDING');
  });

  // 구 Variant 2도 브로커 스위치보다 앞이다(`brokerFactory.ts:167,185`).
  it('--env이 브로커 스위치보다 앞이다 (인자 통로로도)', () => {
    const root = storeRoot();
    const file = writeSessionEnv(root, 'DEST1', { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1', '--auth-broker'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.channel).toBe('env');
    expect(startup.profile.envPath).toBe(file);
    expect(startup.profile.tier).toBe('DEV');
  });

  /**
   * 셰임은 `--env-path`·`--mcp`에만 `MCP_ENV_PATH` 세팅을 멈춘다
   * (`interactive/server/launch.cjs:344-347`) — `--auth-broker`에는 멈추지
   * 않으므로 구에서도 활성 프로파일이 그대로 Variant 2를 탄다. 브로커 스위치가
   * 그 세 통로를 잠그면 **회귀**다.
   */
  it('브로커를 켜도 MCP_ENV_PATH · --env-path · 활성 프로파일은 그대로 붙는다', () => {
    const root = storeRoot();
    const dir = tempDir();
    const injected = writeEnvFile(path.join(dir, 'injected.env'), { SAP_TIER: 'DEV' });
    const explicit = writeEnvFile(path.join(dir, 'explicit.env'), { SAP_TIER: 'QA' });
    const home = tempDir();
    const profileCwd = tempDir();
    const profileEnv = writeProfile({ home, cwd: profileCwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });

    const cases: Array<[string, ReturnType<typeof resolveStartup>, string]> = [
      [
        'MCP_ENV_PATH',
        resolveStartup({
          argv: argvOf('--auth-broker'),
          env: { AUTH_BROKER_PATH: root, MCP_ENV_PATH: injected },
          cwd: tempDir(),
          homedir: tempDir(),
        }),
        injected,
      ],
      [
        '--env-path',
        resolveStartup({
          argv: argvOf('--auth-broker', `--env-path=${explicit}`),
          env: { AUTH_BROKER_PATH: root },
          cwd: tempDir(),
          homedir: tempDir(),
        }),
        explicit,
      ],
      [
        '활성 프로파일',
        resolveStartup({
          argv: argvOf(),
          env: { AUTH_BROKER_PATH: root, MCP_USE_AUTH_BROKER: 'true', SAPKIT_HOME_DIR: home },
          cwd: profileCwd,
          homedir: tempDir(),
        }),
        profileEnv,
      ],
    ];

    for (const [label, startup, expected] of cases) {
      expect([label, startup.profile.envPath]).toEqual([label, expected]);
      expect([label, startup.profile.connection?.baseUrl]).toEqual([label, 'http://127.0.0.1:1']);
      // 접속을 딴 통로가 소유했다는 사실을 말한다 — 조용히 삼키지 않는다.
      expect([label, startup.diagnostics.join('\n').includes('AUTH_BROKER_IGNORED')]).toEqual([
        label,
        true,
      ]);
    }
  });
});

/**
 * 기존 Basic 경로 회귀 0 — spec이 이 판 안에서 기계로 확인하라고 못 박은 것.
 *
 * 네 통로 전부가 destination 인자 없이 예전 그대로 접속을 만들고,
 * `startup.destination`은 null이다(새 구조가 옛 경로에 새지 않는다).
 */
describe('기존 Basic 경로 회귀 0 — destination 통로를 지은 뒤에도', () => {
  it('MCP_ENV_PATH · --env-path · 활성 프로파일 · cwd .env가 모두 그대로 붙는다', () => {
    const dir = tempDir();
    const injected = writeEnvFile(path.join(dir, 'injected.env'), { SAP_TIER: 'DEV' });
    const explicit = writeEnvFile(path.join(dir, 'explicit.env'), { SAP_TIER: 'QA' });
    const home = tempDir();
    const profileCwd = tempDir();
    const profileEnv = writeProfile({ home, cwd: profileCwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });
    const fallbackCwd = tempDir();
    const fallback = writeEnvFile(path.join(fallbackCwd, '.env'), { SAP_TIER: 'DEV' });

    const cases: Array<[string, ReturnType<typeof resolveStartup>, string]> = [
      [
        'MCP_ENV_PATH',
        resolveStartup({
          argv: argvOf(),
          env: { MCP_ENV_PATH: injected },
          cwd: tempDir(),
          homedir: tempDir(),
        }),
        injected,
      ],
      [
        '--env-path',
        resolveStartup({
          argv: argvOf(`--env-path=${explicit}`),
          env: {},
          cwd: tempDir(),
          homedir: tempDir(),
        }),
        explicit,
      ],
      [
        '활성 프로파일',
        resolveStartup({
          argv: argvOf(),
          env: { SAPKIT_HOME_DIR: home },
          cwd: profileCwd,
          homedir: tempDir(),
        }),
        profileEnv,
      ],
      [
        'cwd .env 폴백',
        resolveStartup({ argv: argvOf(), env: {}, cwd: fallbackCwd, homedir: tempDir() }),
        fallback,
      ],
    ];

    for (const [label, startup, expected] of cases) {
      expect([label, startup.profile.envPath]).toEqual([label, expected]);
      expect([label, startup.profile.connection?.baseUrl]).toEqual([label, 'http://127.0.0.1:1']);
      expect([label, startup.destination]).toEqual([label, null]);
    }
  });
});

describe('안전 노브', () => {
  it('blocklist 노브를 프로세스 env로도 받는다 (D6 / GAP-2 수리)', () => {
    const startup = resolveStartup({
      argv: argvOf(),
      env: { MCP_BLOCKLIST_PROFILE: 'strict' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.blocklist.profile).toBe('strict');
  });

  it('프로세스 env는 층을 **올릴** 수는 있다 (조이는 방향)', () => {
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'sap.env'), {
      MCP_BLOCKLIST_PROFILE: 'minimal',
    });
    const startup = resolveStartup({
      argv: argvOf(),
      env: { MCP_ENV_PATH: envPath, MCP_BLOCKLIST_PROFILE: 'strict' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.blocklist.profile).toBe('strict');
  });

  it('프로세스 env는 층을 **내리지** 못한다 — 프로파일이 바닥을 정한다', () => {
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'sap.env'), {
      MCP_BLOCKLIST_PROFILE: 'strict',
    });
    const startup = resolveStartup({
      argv: argvOf(),
      env: { MCP_ENV_PATH: envPath, MCP_BLOCKLIST_PROFILE: 'off' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.blocklist.profile).toBe('strict');
  });

  it('프로파일이 그 키에 침묵해도 프로세스 env가 가드를 끄지 못한다', () => {
    // 제품 마법사(`interactive/scripts/setup-state.mjs` ENV_KEYS)가 만든 프로파일은
    // MCP_ALLOW_TABLE을 아예 쓰지 않는다. 「프로파일이 이긴다」가 그 키에 대해서는
    // 성립하지 않던 자리이고, 실측으로 보호 테이블이 새 나갔다.
    const dir = tempDir();
    const envPath = writeEnvFile(path.join(dir, 'sap.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf(),
      env: { MCP_ENV_PATH: envPath, MCP_BLOCKLIST_PROFILE: 'off', MCP_ALLOW_TABLE: 'BNKA' },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.blocklist.profile).toBe('standard');
    expect(startup.blocklist.allow.size).toBe(0);
  });

  it('노브가 하나도 없으면 배포 기본값은 잠긴 채다', () => {
    const startup = resolveStartup({
      argv: argvOf(),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.blocklist.profile).toBe('standard');
    expect(startup.blocklist.allow.size).toBe(0);
  });

  it('--unsafe / MCP_UNSAFE를 해석하되 게이트에는 손대지 않는다', () => {
    const base = { cwd: tempDir(), homedir: tempDir() } as const;
    expect(resolveStartup({ argv: argvOf('--unsafe'), env: {}, ...base }).unsafe).toBe(true);
    expect(resolveStartup({ argv: argvOf(), env: { MCP_UNSAFE: 'true' }, ...base }).unsafe).toBe(true);
    expect(resolveStartup({ argv: argvOf(), env: { MCP_UNSAFE: 'TRUE' }, ...base }).unsafe).toBe(false);
  });
});

describe('진단', () => {
  it('tier를 사람이 읽을 수 있는 한 줄로 요약한다', () => {
    const startup = resolveStartup({
      argv: argvOf(),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.diagnostics.join('\n')).toContain('tier=UNKNOWN');
  });
});
