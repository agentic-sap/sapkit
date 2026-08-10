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

  it('--mcp=<destination>은 M1이 짓지 않은 통로임을 밝히고 무접속으로 간다', () => {
    const startup = resolveStartup({
      argv: argvOf('--mcp=TRIAL'),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.profile.connection).toBeNull();
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_UNSUPPORTED');
    expect(startup.diagnostics.join('\n')).toContain('TRIAL');
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

  it('충돌하면 프로파일의 값이 이긴다', () => {
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
    expect(startup.blocklist.profile).toBe('minimal');
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
