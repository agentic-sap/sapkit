/**
 * 기동 엔트리 — 셰임(`interactive/server/launch.cjs`)이 하는 일을 그대로 재현해
 * 서버가 물리는지 확인한다.
 *
 * 셰임은 번들을 **같은 프로세스에서 `require()`** 한다. 자식 프로세스를 띄우지
 * 않는 것이 계약이고, 이 시험도 띄우지 않는다(이 머신에서 jest가 자식 프로세스
 * 수거에서 블록된 실측 기록이 있다). stdio 전송은 주입으로 대체한다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { startFromProcess } from '../bootstrap';
import { argvOf, cleanupTempDirs, tempDir, writeEnvFile, writeProfile } from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

describe('셰임 계약', () => {
  it('MCP_ENV_PATH + --exposition 하나만으로 기동해 도구를 노출한다', async () => {
    const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), { SAP_TIER: 'DEV' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const started = await startFromProcess({
      argv: argvOf('--exposition=readonly'),
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
      transport: serverTransport,
      stderr: () => {},
    });
    const client = new Client({ name: 'shim-test', version: '0.0.0' });
    await client.connect(clientTransport);
    try {
      expect(started.core.startup.sets).toEqual(['readonly']);
      expect(started.core.startup.profile.tier).toBe('DEV');
      // 셰임이 넘기는 `readonly` 한 값이 표면을 실제로 가른다.
      // 배포 축은 프로파일에 SAP_SYSTEM_TYPE이 없으므로 기본 `cloud`이고,
      // 등록점의 도구 중 `sets`에 readonly가 있고 cloud에 존재하는 것만 남는다.
      // **도구를 하나 지어 등록하면 이 목록도 함께 늘어난다** — 목록을 계산으로
      // 바꾸면 노출 규칙을 시험이 다시 짜는 자기확인이 되므로 손으로 적어 둔다
      // (`ADDING-A-TOOL.md` 6단계).
      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name).sort()).toEqual([
        'CheckSyntax',
        'DescribeByList',
        'GetAbapAST',
        'GetAbapSemanticAnalysis',
        'GetAbapSystemSymbols',
        'GetInactiveObjects',
        'GetInclude',
        'GetInstalledComponents',
        'GetObjectInfo',
        'GetObjectStructure',
        'GetObjectsByType',
        'GetPackageTree',
        'GetSession',
        'GetSourceDiff',
        'GetSqlQuery',
        'GetSystemInfo',
        'GetTransaction',
        'GetTypeInfo',
        'GetWhereUsed',
        'GrepObjects',
        'GrepPackages',
        'ReadDataElement',
        'ReloadProfile',
        'RuntimeAnalyzeDump',
        'RuntimeAnalyzeProfilerTrace',
        'RuntimeCreateProfilerTraceParameters',
        'RuntimeGetDumpById',
        'RuntimeGetProfilerTraceData',
        'RuntimeListDumps',
        'RuntimeListProfilerTraceFiles',
        'RuntimeRunClassWithProfiling',
        'SearchObject',
      ]);
    } finally {
      await client.close();
      await started.core.server.close();
    }
  });

  it('활성 프로파일 포인터만으로도 기동한다 (셰임 없이 직접 실행)', async () => {
    const home = tempDir();
    const cwd = tempDir();
    writeProfile({ home, cwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const started = await startFromProcess({
      argv: argvOf('--exposition=readonly'),
      env: { SAPKIT_HOME_DIR: home },
      cwd,
      homedir: tempDir(),
      transport: serverTransport,
      stderr: () => {},
    });
    try {
      expect(started.core.startup.profile.alias).toBe('dev1');
    } finally {
      await started.core.server.close();
    }
  });

  it('프로파일이 없어도 죽지 않고 inspection-only로 기동한다', async () => {
    const lines: string[] = [];
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const started = await startFromProcess({
      argv: argvOf('--exposition=readonly'),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
      transport: serverTransport,
      stderr: (line) => lines.push(line),
    });
    try {
      expect(started.core.startup.profile.connection).toBeNull();
      expect(lines.join('\n')).toContain('tier=UNKNOWN');
    } finally {
      await started.core.server.close();
    }
  });
});

describe('CJS 엔트리', () => {
  // 셰임은 `require('./server.bundle.cjs')` 하나로 기동한다. 즉 엔트리는
  // require 만으로 물려야 하고, process.argv·process.env에서 모든 것을 읽어야
  // 한다. 시험 중에는 실제 stdio를 잡으면 안 되므로 구 엔진이 문서화만 해 두고
  // 구현하지 않은 `MCP_SKIP_AUTO_START`를 실제로 구현해 사용한다.
  const built = path.resolve(__dirname, '../../../dist/src/server/entry.js');
  const hasBuild = fs.existsSync(built);

  (hasBuild ? it : it.skip)('빌드 산출물이 require()로 물리고 stdio를 잡지 않는다', async () => {
    const previous = process.env.MCP_SKIP_AUTO_START;
    const stdinListenersBefore = process.stdin.listenerCount('data');
    process.env.MCP_SKIP_AUTO_START = 'true';
    type BuiltStart = {
      core: { server: { close(): Promise<void> }; startup: { profile: { tier: string } } };
    };
    let started: BuiltStart | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require(built) as {
        startFromProcess?: (options: Record<string, unknown>) => Promise<BuiltStart>;
      };
      expect(typeof loaded.startFromProcess).toBe('function');
      // require 자체는 전송을 잡지 않았다.
      expect(process.stdin.listenerCount('data')).toBe(stdinListenersBefore);

      // 산출물 전체(모듈 그래프)가 실제로 도는지 — 주입한 전송으로 한 번 띄운다.
      const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), { SAP_TIER: 'DEV' });
      const [, serverTransport] = InMemoryTransport.createLinkedPair();
      started = await loaded.startFromProcess!({
        argv: argvOf('--exposition=readonly'),
        env: { MCP_ENV_PATH: envPath },
        cwd: tempDir(),
        homedir: tempDir(),
        transport: serverTransport,
        stderr: () => {},
      });
      expect(started.core.startup.profile.tier).toBe('DEV');
    } finally {
      if (started) await started.core.server.close();
      if (previous === undefined) delete process.env.MCP_SKIP_AUTO_START;
      else process.env.MCP_SKIP_AUTO_START = previous;
    }
  });

  if (!hasBuild) {
    it('빌드 산출물이 아직 없다 — npm run build 뒤에 다시 돌려라', () => {
      // eslint-disable-next-line no-console
      console.warn(`[entry.test] ${built} 이 없어 dist require 시험을 건너뛴다.`);
      expect(hasBuild).toBe(false);
    });
  }

  it('소스 엔트리는 require 만으로 서버를 띄우지 않는다 (MCP_SKIP_AUTO_START)', () => {
    const previous = process.env.MCP_SKIP_AUTO_START;
    process.env.MCP_SKIP_AUTO_START = 'true';
    jest.resetModules();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require('../entry') as { startFromProcess?: unknown };
      expect(typeof loaded.startFromProcess).toBe('function');
    } finally {
      if (previous === undefined) delete process.env.MCP_SKIP_AUTO_START;
      else process.env.MCP_SKIP_AUTO_START = previous;
      jest.resetModules();
    }
  });
});
