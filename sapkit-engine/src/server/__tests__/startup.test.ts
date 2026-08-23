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
      grant: 'authorization_code',
      grantDeclared: false,
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
 * 그랜트가 진단을 가른다 (D-114 ⓑ).
 *
 * **이 계층은 여전히 토큰을 받지 않는다** — `resolveStartup`은 순수 해석이고,
 * 받는 것은 기동 경로의 다음 걸음(`connectDestination`)이다. 여기서 재는 것은
 * 「무엇을 할 참인지 사람에게 제대로 말하는가」다.
 */
describe('destination 통로 — 그랜트별 진단 (D-114)', () => {
  function keyBody(overrides: Record<string, unknown> = {}): unknown {
    return {
      uaa: {
        url: 'https://uaa.invalid/oauth',
        clientid: 'fixture-client',
        clientsecret: FAKE_SECRET,
        ...overrides,
      },
      abap: { url: 'http://127.0.0.1:1', client: '100', language: 'EN' },
    };
  }

  function startupFor(body: unknown) {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1', body);
    return resolveStartup({
      argv: argvOf('--mcp=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
  }

  it('client_credentials면 TOKEN_REQUIRED — 기동이 곧 받아 온다고 말한다', () => {
    const startup = startupFor(keyBody({ granttype: 'client_credentials' }));
    const joined = startup.diagnostics.join('\n');
    expect(joined).toContain('MCP_DESTINATION_TOKEN_REQUIRED');
    expect(joined).not.toContain('MCP_DESTINATION_TOKEN_PENDING');
    expect(joined).toContain('client_credentials');
    expect(joined).toContain('startup acquires the first token itself');
    // 재적재로는 토큰이 돌아오지 않는다는 사실을 그 자리에서 말한다.
    expect(joined).toContain('ReloadProfile');
    // 그래도 **이 계층에서는** 아직 접속이 아니다.
    expect(startup.profile.connection).toBeNull();
  });

  // TOKEN_PENDING의 뜻이 이 그랜트 전용으로 좁아졌다.
  it('authorization_code면 TOKEN_PENDING — 인가 종단점과 다음 걸음을 안내한다', () => {
    const startup = startupFor(keyBody());
    const joined = startup.diagnostics.join('\n');
    expect(joined).toContain('MCP_DESTINATION_TOKEN_PENDING');
    expect(joined).toContain('authorization_code');
    // 무엇이 멈춰 있는가 — 브라우저가 필요하고 엔진은 열지 않는다.
    expect(joined).toContain('this engine never opens one');
    // 어디로 가야 하는가.
    // fixture의 uaa url이 이미 `/oauth`로 끝나므로 종단점은 그 뒤에 붙는다.
    expect(joined).toContain('https://uaa.invalid/oauth/oauth/authorize');
    expect(joined).toContain('client_id fixture-client');
    // 다음에 무엇을 할 수 있는가 — 두 갈래를 다 준다.
    expect(joined).toContain('"granttype": "client_credentials"');
    expect(joined).toContain('--env-path=<file>');
    expect(startup.profile.connection).toBeNull();
  });

  it('선언이 없으면 기본값이라고 말한다 (넘겨짚지 않았다는 것을 사람이 안다)', () => {
    const declared = startupFor(keyBody({ granttype: 'authorization_code' }));
    const implied = startupFor(keyBody());
    expect(declared.diagnostics.join('\n')).toContain('declared by the key');
    expect(implied.diagnostics.join('\n')).toContain('declares no granttype');
  });

  // 토큰을 받아 봐야 붙을 데가 없다 — 그랜트보다 먼저 말해야 하는 사실이다.
  it('service URL이 없으면 그랜트와 무관하게 NO_SERVICE_URL로 끝난다', () => {
    for (const grant of ['client_credentials', 'authorization_code']) {
      const startup = startupFor({
        uaa: {
          url: 'https://uaa.invalid/oauth',
          clientid: 'fixture-client',
          clientsecret: FAKE_SECRET,
          granttype: grant,
        },
      });
      const joined = startup.diagnostics.join('\n');
      expect(joined).toContain('MCP_DESTINATION_NO_SERVICE_URL');
      expect(joined).toContain('no token is requested');
      expect(startup.profile.connection).toBeNull();
    }
  });

  it('알 수 없는 그랜트는 SERVICE_KEY_INVALID로 끝난다 (기동은 죽지 않는다)', () => {
    const startup = startupFor(keyBody({ granttype: 'password' }));
    const joined = startup.diagnostics.join('\n');
    expect(joined).toContain('SERVICE_KEY_INVALID');
    expect(startup.sets).toEqual(['readonly', 'high']);
    expect(startup.profile.connection).toBeNull();
    expect(joined).not.toContain(FAKE_SECRET);
  });

  it('어느 갈래든 진단에 clientsecret이 실리지 않는다', () => {
    for (const grant of ['client_credentials', 'authorization_code']) {
      const startup = startupFor(keyBody({ granttype: grant }));
      expect(startup.diagnostics.join('\n')).not.toContain(FAKE_SECRET);
    }
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

/**
 * `--auth-interactive`와 콜백 노브 — **정지선을 여는 유일한 열쇠**(D-117 ⓐ).
 *
 * 이 계층이 하는 일은 셋이다: 플래그를 읽고, 콜백 주소를 정하고, 그것을 사람에게
 * 말한다. 토큰은 여전히 다음 걸음(`connectDestination`)이 받는다.
 */
describe('인터랙티브 로그인 옵트인 — --auth-interactive · --callback-host · --callback-port', () => {
  function keyBody(overrides: Record<string, unknown> = {}): unknown {
    return {
      uaa: {
        url: 'https://uaa.invalid/oauth',
        clientid: 'fixture-client',
        clientsecret: FAKE_SECRET,
        ...overrides,
      },
      abap: { url: 'http://127.0.0.1:1', client: '100', language: 'EN' },
    };
  }

  function startupWith(args: string[], body: unknown = keyBody()) {
    const root = storeRoot();
    writeServiceKey(root, 'DEST1', body);
    return resolveStartup({
      argv: argvOf('--mcp=DEST1', ...args),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
  }

  // 실측으로 아는 유일한 성공 조합을 기본값에 둔다(D-117 ⓔ). 인증 계층의
  // `DEFAULT_CALLBACK_HOST`(`127.0.0.1`)와 **일부러 다르다** — 그것은 바인딩
  // 안전의 값이고 이것은 XSUAA에 등록된 redirect_uri 문자열이다.
  it('기본 콜백 주소는 localhost:8080이다', () => {
    expect(
      resolveStartup({ argv: argvOf(), env: {}, cwd: tempDir(), homedir: tempDir() })
        .authInteractive,
    ).toEqual({ enabled: false, callbackHost: 'localhost', callbackPort: 8080 });
  });

  it('플래그를 켜도 기본 주소는 그대로이고 enabled만 바뀐다', () => {
    expect(startupWith(['--auth-interactive']).authInteractive).toEqual({
      enabled: true,
      callbackHost: 'localhost',
      callbackPort: 8080,
    });
  });

  it('노브가 주소를 옮긴다 (--host/--port가 아니라 --callback-*)', () => {
    const startup = startupWith([
      '--auth-interactive',
      '--callback-host=127.0.0.1',
      '--callback-port=9443',
    ]);
    expect(startup.authInteractive).toEqual({
      enabled: true,
      callbackHost: '127.0.0.1',
      callbackPort: 9443,
    });
  });

  // 전송의 `--host`/`--port`는 웹 표면을 여는 인자다. 두 이름이 섞이면 한 글자
  // 차이로 다른 것이 열린다.
  it('전송의 --host/--port는 콜백 주소를 건드리지 않는다', () => {
    const startup = startupWith(['--auth-interactive', '--host=0.0.0.0', '--port=3000']);
    expect(startup.authInteractive.callbackHost).toBe('localhost');
    expect(startup.authInteractive.callbackPort).toBe(8080);
  });

  it('포트가 포트가 아니면 기본값으로 되돌리고 그 사실을 말한다', () => {
    const startup = startupWith(['--auth-interactive', '--callback-port=not-a-port']);
    expect(startup.authInteractive.callbackPort).toBe(8080);
    const joined = startup.diagnostics.join('\n');
    expect(joined).toContain('CALLBACK_PORT_INVALID');
    expect(joined).toContain('redirect_uri');
  });

  it('범위 밖의 포트도 마찬가지다', () => {
    for (const raw of ['0', '65536', '8080.5', '-1']) {
      const startup = startupWith(['--auth-interactive', `--callback-port=${raw}`]);
      expect(startup.authInteractive.callbackPort).toBe(8080);
      expect(startup.diagnostics.join('\n')).toContain('CALLBACK_PORT_INVALID');
    }
  });

  // ── 호스트는 loopback 리터럴만 (D-119 ⓐ) ─────────────────────────────────
  //
  // 이 노브가 `src/auth/callback.ts`의 「지키는 것 ①」(**loopback에만
  // 바인딩한다**)에 닿는 유일한 프로덕션 통로다. 그 값은 `connectDestination`
  // → `acquireByAuthorizationCode({host})` → `server.listen(port, host)`로
  // 그대로 내려가므로, 여기서 통과하는 값이 곧 실제 바인딩 주소다. 그래서
  // 「진단이 떴다」로 만족하지 않고 **실린 값**(`callbackHost`)을 잰다.

  it('비-loopback 호스트는 싣지 않고 기본값으로 되돌리며 그 사실을 말한다', () => {
    for (const raw of ['0.0.0.0', '192.168.1.50', 'callback.corp.example']) {
      const startup = startupWith(['--auth-interactive', `--callback-host=${raw}`]);
      // ⚠ 차단 사유의 핵심 — 되돌아간 것은 **진단이 아니라 값**이다.
      expect(startup.authInteractive).toEqual({
        enabled: true,
        callbackHost: 'localhost',
        callbackPort: 8080,
      });
      const joined = startup.diagnostics.join('\n');
      expect(joined).toContain('CALLBACK_HOST_INVALID');
      // 거절한 값을 그대로 되읽어 준다 — 사람이 무엇이 안 먹었는지 안다.
      expect(joined).toContain(raw);
      // 그리고 무엇을 쓰라고 말한다(기각 (a)의 이유).
      expect(joined).toContain('localhost, 127.0.0.1');
      // 뒤따르는 안내의 주소도 기본값이다 — 두 문면이 갈리면 사람이 헷갈린다.
      expect(joined).toContain('http://localhost:8080/callback');
    }
  });

  it('loopback 리터럴 2종은 그대로 실린다', () => {
    for (const raw of ['localhost', '127.0.0.1']) {
      const startup = startupWith(['--auth-interactive', `--callback-host=${raw}`]);
      expect(startup.authInteractive.callbackHost).toBe(raw);
      expect(startup.diagnostics.join('\n')).not.toContain('CALLBACK_HOST_INVALID');
    }
  });

  // ⚠ `::1`은 loopback이지만 **거부한다**(D-119 회수) — 콜백 계층의 URL 조립이
  // `http://${host}:${port}${path}`라 `http://::1:8080/callback`이라는 깨진 주소가
  // 되기 때문이다(IPv6는 대괄호를 요구한다). **받아 놓고 깨진 redirect_uri를
  // 보내느니 거부하고 이유를 말한다.**
  it('::1은 loopback이어도 거부한다 — 이 통로의 URL 조립이 IPv6를 못 싣는다', () => {
    const startup = startupWith(['--auth-interactive', '--callback-host=::1']);
    expect(startup.authInteractive.callbackHost).toBe('localhost');
    expect(startup.diagnostics.join('\n')).toContain('CALLBACK_HOST_INVALID');
  });

  // 호스트 이름은 대소문자를 가리지 않는다. 다만 실리는 것은 **정규형**이다 —
  // 그 문자열이 XSUAA의 redirect_uri와 글자로 대조되기 때문이다.
  it('허용 판정은 대소문자를 가리지 않고 정규형을 싣는다', () => {
    const startup = startupWith(['--auth-interactive', '--callback-host=LOCALHOST']);
    expect(startup.authInteractive.callbackHost).toBe('localhost');
    expect(startup.diagnostics.join('\n')).not.toContain('CALLBACK_HOST_INVALID');
  });

  // ── 진단이 조건에 맞게 갈린다 (D-117 ⓖ) ──────────────────────────────────

  // D-119 ⓒ — 플래그가 없으면 이 인자들이 가리키는 콜백은 애초에 열리지
  // 않는다. 그런데도 진단이 늘면 「플래그가 없으면 한 글자도 다르지 않다」에
  // 문자 그대로의 반례가 되고, 「stays on 8080」이라는 문면 자체가 거짓이 된다.
  // 재는 방법은 **진단 수 대조**다 — 문구를 찾는 단언은 문구가 바뀌면 조용히
  // 통과할 수 있다.
  it('플래그가 없으면 잘못된 호스트·포트가 진단을 늘리지 않는다', () => {
    const bad = ['--callback-host=0.0.0.0', '--callback-port=not-a-port'];
    const plain = startupWith([]);
    const withBadKnobs = startupWith(bad);

    expect(withBadKnobs.diagnostics).toHaveLength(plain.diagnostics.length);
    const joined = withBadKnobs.diagnostics.join('\n');
    expect(joined).not.toContain('CALLBACK_HOST_INVALID');
    expect(joined).not.toContain('CALLBACK_PORT_INVALID');
    // 값은 그래도 기본값이다 — 침묵이 곧 통과는 아니다.
    expect(withBadKnobs.authInteractive).toEqual({
      enabled: false,
      callbackHost: 'localhost',
      callbackPort: 8080,
    });
  });

  // ── `--auth-interactive=<값>`은 조용히 무시되지 않는다 (판Z 리뷰 R7) ──────
  //
  // 플래그 판정이 정확 일치라 `--auth-interactive=true`는 플래그를 켜지 않는다.
  // 그런데 켜지지 않았으므로 위 `say()`가 호스트·포트 진단까지 삼켜, 그 사람은
  // **자기가 이미 줬다고 믿는 채로** 아무 말도 듣지 못했다.
  it('--auth-interactive=<값>은 플래그를 켜지 않고, 그 사실을 말한다', () => {
    const startup = startupWith(['--auth-interactive=true']);
    expect(startup.authInteractive.enabled).toBe(false);
    const joined = startup.diagnostics.join('\n');
    expect(joined).toContain('AUTH_INTERACTIVE_INVALID');
    expect(joined).toContain('--auth-interactive=true');
    expect(joined).toContain('takes no value');
    // 대신 켜 주지 않았다는 것도 문면에 있다 — 사람이 무엇을 다시 할지 알아야 한다.
    expect(joined).toContain('interactive login is off for this launch');
    // 그리고 정지선은 그대로다 — 값 하나로 옵트인이 되지 않는다.
    expect(joined).toContain('MCP_DESTINATION_TOKEN_PENDING');
  });

  // D-119 ⓒ는 이 한 줄이 들어와도 깨지지 않는다. 재는 방법은 위 「플래그가
  // 없으면 …」과 같은 **진단 수 대조**다 — 아무것도 안 준 기동은 그대로이고,
  // 값을 붙여 준 기동만 정확히 한 줄 는다.
  it('그 계열 인자를 아예 안 준 기동의 진단 수는 그대로다 (D-119 ⓒ)', () => {
    const plain = startupWith([]);
    const withValue = startupWith(['--auth-interactive=true']);
    expect(plain.diagnostics.join('\n')).not.toContain('AUTH_INTERACTIVE_INVALID');
    expect(withValue.diagnostics).toHaveLength(plain.diagnostics.length + 1);
  });

  it('같은 인자에 플래그만 붙이면 두 진단이 함께 선다', () => {
    const bad = ['--callback-host=0.0.0.0', '--callback-port=not-a-port'];
    const flagOnly = startupWith(['--auth-interactive']);
    const withBadKnobs = startupWith(['--auth-interactive', ...bad]);

    // 늘어난 것은 정확히 둘 — 호스트 하나, 포트 하나.
    expect(withBadKnobs.diagnostics).toHaveLength(flagOnly.diagnostics.length + 2);
    const joined = withBadKnobs.diagnostics.join('\n');
    expect(joined).toContain('CALLBACK_HOST_INVALID');
    expect(joined).toContain('CALLBACK_PORT_INVALID');
  });

  it('플래그가 없으면 TOKEN_PENDING이 그대로 서고 다음 걸음으로 플래그를 안내한다', () => {
    const joined = startupWith([]).diagnostics.join('\n');
    expect(joined).toContain('MCP_DESTINATION_TOKEN_PENDING');
    // 옛 문면은 **여전히 참이다** — 플래그가 없을 때가 정확히 그 조건이다.
    expect(joined).toContain('Startup does not begin that flow');
    expect(joined).toContain('this engine never opens one');
    // 그리고 다음 걸음을 말한다 — 플래그·기본 주소·화이트리스트 셋 다.
    expect(joined).toContain('--auth-interactive');
    expect(joined).toContain('http://localhost:8080/callback');
    expect(joined).toContain('--callback-host');
    expect(joined).toContain('--callback-port');
    expect(joined).toContain('redirect_uri');
  });

  it('플래그가 있으면 TOKEN_PENDING이 아니라 TOKEN_REQUIRED가 선다', () => {
    const joined = startupWith(['--auth-interactive']).diagnostics.join('\n');
    expect(joined).not.toContain('MCP_DESTINATION_TOKEN_PENDING');
    expect(joined).toContain('MCP_DESTINATION_TOKEN_REQUIRED');
    expect(joined).toContain('--auth-interactive is on');
    expect(joined).toContain('http://localhost:8080/callback');
    // 브라우저를 여는 것은 여전히 사람이다.
    expect(joined).toContain('opens no browser itself');
    expect(joined).toContain('The next diagnostic says whether a token arrived');
  });

  it('안내에 적히는 주소는 노브를 따라간다', () => {
    const joined = startupWith([
      '--auth-interactive',
      '--callback-host=127.0.0.1',
      '--callback-port=9443',
    ]).diagnostics.join('\n');
    expect(joined).toContain('http://127.0.0.1:9443/callback');
  });

  it('플래그는 client_credentials 진단을 바꾸지 않는다', () => {
    const withFlag = startupWith(
      ['--auth-interactive'],
      keyBody({ granttype: 'client_credentials' }),
    );
    const without = startupWith([], keyBody({ granttype: 'client_credentials' }));
    const line = (startup: typeof withFlag): string =>
      startup.diagnostics.find((entry) => entry.startsWith('MCP_DESTINATION_TOKEN_REQUIRED')) ?? '';
    // destination 이름·키 경로만 다르므로 그 자리를 지우고 비교한다.
    const shape = (text: string): string => text.replace(/\(.*?, abap shape[^)]*\)/, '(key)');
    expect(shape(line(withFlag))).toBe(shape(line(without)));
    expect(line(without)).toContain('startup acquires the first token itself');
  });

  // 이 계층은 여전히 토큰을 받지 않는다 — 플래그가 켜져도 그렇다.
  it('플래그가 켜져도 resolveStartup은 접속을 만들지 않는다', () => {
    const startup = startupWith(['--auth-interactive']);
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).not.toContain(FAKE_SECRET);
  });
});
