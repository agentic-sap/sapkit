/**
 * 프로파일 세션 — **재적재 뒤에 안전 게이트가 새 값을 보는가**.
 *
 * 이 파일이 붙잡는 것은 하나다: `ReloadProfile`은 기동 후에 tier를 바꿀 수 있는
 * 유일한 통로가 되므로, 도구가 답한 tier와 게이트가 판정하는 tier가 어긋나면
 * 안전 바닥선이 내려간다. 두 방향 모두 결함이지만 **과통과가 치명적**이다 —
 * 도구는 `PRD`를 보고했는데 게이트가 아직 `DEV`로 통과시키는 쪽.
 *
 * 그래서 `isError`만 보지 않는다. 구 엔진 GAP-1의 교훈대로 **접속 시도 횟수**를
 * 함께 센다(`gates/safety.mjs:148-150`이 리뷰 사보타주로 실증한 함정 — 게이트를
 * 통째로 들어내도 접속 공장이 던져서 `isError`는 참이 된다).
 *
 * SAP에 붙지 않는다. 프로파일은 임시 디렉터리의 파일이고 접속 계층은 세지기만
 * 하는 가짜다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';

import type { AdtClient } from '../../adt';
import type { ConnectionConfig } from '../../contracts';
import { type ServerCore, createServerCore } from '../core';
import { ProfileSession } from '../session';
import * as startupModule from '../startup';
import type { Startup } from '../startup';
import { defineTool } from '../toolDefinition';
import type { SapTool, ToolContext } from '../toolDefinition';
import { argvOf, cleanupTempDirs, tempDir, writeEnvFile } from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

// ── 프로파일 배치 ───────────────────────────────────────────────────────────
// 포인터(`<cwd>/.sapkit/active-profile.txt`)와 프로파일 본체를 **따로** 놓는다 —
// 재적재가 실제로 갈아타는 통로가 포인터이기 때문이다.

function profileAt(home: string, alias: string, env: Record<string, string>): void {
  writeEnvFile(path.join(home, 'profiles', alias, 'sap.env'), env);
}

function pointAt(cwd: string, alias: string): void {
  const dir = path.join(cwd, '.sapkit');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'active-profile.txt'), alias, 'utf8');
}

function bootAt(cwd: string, home: string, exposition = 'readonly,high'): Startup {
  return startupModule.resolveStartup({
    argv: argvOf(`--exposition=${exposition}`),
    env: { SAPKIT_HOME_DIR: home },
    cwd,
    homedir: tempDir(),
  });
}

// ── 가짜 도구 ───────────────────────────────────────────────────────────────

function fakeRead(): SapTool {
  return defineTool(
    {
      name: 'GetFixture',
      description: '[read-only] fixture read tool.',
      inputSchema: {},
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'read',
    },
    async (context: ToolContext) => {
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: 'read' }] };
    },
  );
}

function fakeWrite(): SapTool {
  return defineTool(
    {
      name: 'CreateFixture',
      description: 'fixture write tool.',
      inputSchema: { name: z.string() },
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['high'],
      kind: 'mutation',
      targetNames: ['name'],
    },
    async (context: ToolContext) => {
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: 'written' }] };
    },
  );
}

/** 실데이터 2종은 노출로 막히지 않는다 — blocklist가 매 호출 판정한다. */
function fakeRows(): SapTool {
  return defineTool(
    {
      name: 'GetTableContents',
      description: '[read-only] fixture row reader.',
      inputSchema: { table_name: z.string() },
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'row-data',
    },
    async (context: ToolContext) => {
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: 'rows' }] };
    },
  );
}

/** 재적재 훅을 **부를 자격이 없는** 도구. 표면의 크기를 붙잡는다. */
function fakeReloader(): SapTool {
  return defineTool(
    {
      name: 'GetFixtureReloader',
      description: '[read-only] tries to reload the profile.',
      inputSchema: {},
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'read',
    },
    async (context: ToolContext) => {
      context.reloadProfile();
      return { isError: false, content: [{ type: 'text', text: 'reloaded' }] };
    },
  );
}

// ── 하네스 ──────────────────────────────────────────────────────────────────

interface Harness {
  readonly client: Client;
  readonly core: ServerCore;
  /** 접속 공장에 넘어온 설정들. 길이가 곧 접속 시도 횟수다. */
  readonly configs: ConnectionConfig[];
  close(): Promise<void>;
}

function countingFactory(configs: ConnectionConfig[]): (config: ConnectionConfig) => AdtClient {
  return (config: ConnectionConfig): AdtClient => {
    configs.push(config);
    return { fake: true } as unknown as AdtClient;
  };
}

async function harnessFor(
  startup: Startup,
  options: { readonly tools?: SapTool[]; readonly session?: ProfileSession } = {},
): Promise<Harness> {
  const configs: ConnectionConfig[] = [];
  const core = createServerCore({
    startup,
    tools: options.tools ?? [fakeRead(), fakeWrite(), fakeRows()],
    ...(options.session ? { session: options.session } : { connectionFactory: countingFactory(configs) }),
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'session-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    core,
    configs,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

async function callText(
  harness: Harness,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string }> {
  const result = (await harness.client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ text?: unknown }>;
  };
  return {
    isError: result.isError === true,
    text: (result.content ?? []).map((item) => String(item.text ?? '')).join('\n'),
  };
}

// ── 재적재 뒤 tier 게이트 ───────────────────────────────────────────────────

describe('재적재 뒤 tier 게이트가 새 값을 본다', () => {
  it('DEV → PRD: 같은 write 도구가 거부되고 접속 시도가 늘지 않는다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    profileAt(home, 'prd1', { SAP_TIER: 'PRD' });
    pointAt(cwd, 'dev1');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      const before = await callText(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(before.isError).toBe(false);
      expect(harness.configs).toHaveLength(1);

      pointAt(cwd, 'prd1');
      const reload = harness.core.session.reload();
      expect(reload.after.tier).toBe('PRD');
      expect(reload.after.alias).toBe('prd1');

      const after = await callText(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(after.isError).toBe(true);
      expect(after.text).toMatch(/ERR_READONLY_TIER/);
      // 과통과 방지의 핵심 계측 — 거부라면 접속 시도가 한 번도 늘지 않는다.
      expect(harness.configs).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('PRD → DEV: 막혀 있던 write가 열린다 (과차단 역검증)', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    profileAt(home, 'prd1', { SAP_TIER: 'PRD' });
    pointAt(cwd, 'prd1');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      const before = await callText(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(before.isError).toBe(true);
      expect(before.text).toMatch(/ERR_READONLY_TIER/);
      expect(harness.configs).toHaveLength(0);

      pointAt(cwd, 'dev1');
      expect(harness.core.session.reload().after.tier).toBe('DEV');

      const after = await callText(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(after.isError).toBe(false);
      expect(harness.configs).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('`core.startup`이 재적재 뒤의 상태를 가리킨다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    profileAt(home, 'qa1', { SAP_TIER: 'QA' });
    pointAt(cwd, 'dev1');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      expect(harness.core.startup.profile.tier).toBe('DEV');
      pointAt(cwd, 'qa1');
      harness.core.session.reload();
      expect(harness.core.startup.profile.tier).toBe('QA');
      expect(harness.core.startup.profile.alias).toBe('qa1');
    } finally {
      await harness.close();
    }
  });
});

// ── 캐시된 접속을 실제로 버린다 ──────────────────────────────────────────────

describe('재적재는 캐시된 접속을 버린다', () => {
  it('재적재 뒤 첫 호출이 **새 접속을 만든다** — 새 프로파일의 호스트로', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'one', { SAP_TIER: 'DEV', SAP_URL: 'http://127.0.0.1:1' });
    profileAt(home, 'two', { SAP_TIER: 'DEV', SAP_URL: 'http://127.0.0.2:1' });
    pointAt(cwd, 'one');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      await callText(harness, 'GetFixture');
      await callText(harness, 'GetFixture');
      // 두 번 불러도 접속은 하나 — 게으른 캐시가 살아 있다.
      expect(harness.configs).toHaveLength(1);
      expect(harness.configs[0]?.baseUrl).toBe('http://127.0.0.1:1');

      pointAt(cwd, 'two');
      const reload = harness.core.session.reload();
      expect(reload.connectionDropped).toBe(true);

      await callText(harness, 'GetFixture');
      expect(harness.configs).toHaveLength(2);
      expect(harness.configs[1]?.baseUrl).toBe('http://127.0.0.2:1');
    } finally {
      await harness.close();
    }
  });
});

// ── blocklist·실데이터 게이트도 새 값을 본다 ─────────────────────────────────

describe('재적재 뒤 실데이터 게이트가 새 프로파일 값을 본다', () => {
  it('`MCP_ALLOW_TABLE`을 가진 프로파일에서 잠긴 프로파일로 갈아타면 다시 막힌다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'open', { SAP_TIER: 'DEV', MCP_ALLOW_TABLE: 'KNA1' });
    profileAt(home, 'locked', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'open');

    const harness = await harnessFor(bootAt(cwd, home, 'readonly'));
    try {
      const before = await callText(harness, 'GetTableContents', { table_name: 'KNA1' });
      expect(before.isError).toBe(false);
      expect(harness.configs).toHaveLength(1);

      pointAt(cwd, 'locked');
      harness.core.session.reload();

      const after = await callText(harness, 'GetTableContents', { table_name: 'KNA1' });
      expect(after.isError).toBe(true);
      expect(after.text).toMatch(/row extraction refused/);
      expect(harness.configs).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('반대 방향도 실제로 갈린다 — 잠긴 프로파일에서 허용 프로파일로', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'open', { SAP_TIER: 'DEV', MCP_ALLOW_TABLE: 'KNA1' });
    profileAt(home, 'locked', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'locked');

    const harness = await harnessFor(bootAt(cwd, home, 'readonly'));
    try {
      expect((await callText(harness, 'GetTableContents', { table_name: 'KNA1' })).isError).toBe(true);
      pointAt(cwd, 'open');
      harness.core.session.reload();
      expect((await callText(harness, 'GetTableContents', { table_name: 'KNA1' })).isError).toBe(false);
    } finally {
      await harness.close();
    }
  });
});

// ── 재적재 실패 ─────────────────────────────────────────────────────────────

describe('재적재 실패는 옛 상태로 조용히 되돌아가지 않는다', () => {
  it('포인터가 없는 프로파일을 가리키면 무접속·UNKNOWN으로 내려앉는다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'dev1');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      expect((await callText(harness, 'GetFixture')).isError).toBe(false);
      expect(harness.configs).toHaveLength(1);

      pointAt(cwd, 'gone');
      const reload = harness.core.session.reload();
      expect(reload.after.tier).toBe('UNKNOWN');
      expect(reload.startup.profile.connection).toBeNull();
      expect(reload.startup.profile.diagnostics.join('\n')).toMatch(/PROFILE_NOT_FOUND/);

      // 옛 접속을 계속 쓰지 않는다 — 조용한 성공이 아니라 정직한 실패다.
      const after = await callText(harness, 'GetFixture');
      expect(after.isError).toBe(true);
      expect(after.text).toMatch(/ERR_NO_CONNECTION/);
      expect(harness.configs).toHaveLength(1);

      // 그리고 write는 UNKNOWN tier에서 fail-closed로 막힌다.
      const write = await callText(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(write.isError).toBe(true);
      expect(write.text).toMatch(/ERR_READONLY_TIER/);
    } finally {
      await harness.close();
    }
  });

  it('해석 자체가 예외로 끝나면 inspection-only로 **봉인**된다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV', MCP_ALLOW_TABLE: 'KNA1' });
    pointAt(cwd, 'dev1');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      expect(harness.core.startup.blocklist.allow.has('KNA1')).toBe(true);

      const spy = jest
        .spyOn(startupModule, 'resolveStartup')
        .mockImplementation(() => {
          throw new Error('프로파일 저장소를 읽을 수 없다');
        });
      let reload: ReturnType<ProfileSession['reload']>;
      try {
        reload = harness.core.session.reload();
      } finally {
        spy.mockRestore();
      }

      expect(reload.sealed).toMatch(/프로파일 저장소를 읽을 수 없다/);
      expect(reload.after.tier).toBe('UNKNOWN');
      expect(reload.startup.profile.connection).toBeNull();
      // 봉인은 **더 잠그는 쪽**이다 — 느슨했던 노브가 살아남지 않는다.
      expect(reload.startup.blocklist.allow.size).toBe(0);
      expect(reload.startup.blocklist.profile).toBe('standard');
      expect(reload.startup.diagnostics.join('\n')).toMatch(/RELOAD_SEALED/);

      const write = await callText(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(write.isError).toBe(true);
      expect(write.text).toMatch(/ERR_READONLY_TIER/);
    } finally {
      await harness.close();
    }
  });
});

// ── 훅이 연 표면의 크기 ─────────────────────────────────────────────────────

describe('재적재 훅은 지목된 이름에게만 열린다', () => {
  it('`server-control` 면제 목록 밖의 도구가 부르면 거부된다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'dev1');

    const harness = await harnessFor(bootAt(cwd, home, 'readonly'), { tools: [fakeReloader()] });
    try {
      const outcome = await callText(harness, 'GetFixtureReloader');
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/ERR_RELOAD_FORBIDDEN/);
      // 거부됐다면 상태는 그대로다.
      expect(harness.core.startup.profile.alias).toBe('dev1');
    } finally {
      await harness.close();
    }
  });

  it('재적재는 인자를 받지 않는다 — 새 상태는 argv·env·디스크만의 함수다', () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'dev1');
    const session = new ProfileSession(bootAt(cwd, home));
    expect(session.reload.length).toBe(0);
  });
});

// ── 노출 목록은 재적재로 바뀌지 않는다 ──────────────────────────────────────

describe('재적재가 바꾸지 못하는 것', () => {
  it('배포 축이 바뀌어도 `tools/list`는 기동 시점 그대로다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'cloud1', { SAP_TIER: 'DEV', SAP_SYSTEM_TYPE: 'cloud' });
    profileAt(home, 'onprem1', { SAP_TIER: 'DEV', SAP_SYSTEM_TYPE: 'onprem' });
    pointAt(cwd, 'cloud1');

    const harness = await harnessFor(bootAt(cwd, home));
    try {
      const before = [...harness.core.exposedToolNames].sort();
      pointAt(cwd, 'onprem1');
      const reload = harness.core.session.reload();
      expect(reload.after.systemType).toBe('onprem');
      expect(harness.core.session.bootSystemType).toBe('cloud');
      expect([...harness.core.exposedToolNames].sort()).toEqual(before);
    } finally {
      await harness.close();
    }
  });
});

// ── 세션을 나눠 가지는 코어들 (HTTP·SSE 갈래) ───────────────────────────────

describe('세션을 공유한 코어들은 같은 상태를 본다', () => {
  it('한쪽에서 재적재하면 다른 쪽 게이트도 새 tier로 판정한다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    profileAt(home, 'prd1', { SAP_TIER: 'PRD' });
    pointAt(cwd, 'dev1');

    const startup = bootAt(cwd, home);
    const configs: ConnectionConfig[] = [];
    const session = new ProfileSession(startup, countingFactory(configs));

    const first = await harnessFor(startup, { session });
    const second = await harnessFor(startup, { session });
    try {
      expect((await callText(second, 'CreateFixture', { name: 'ZFIXTURE' })).isError).toBe(false);
      expect(configs).toHaveLength(1);

      pointAt(cwd, 'prd1');
      first.core.session.reload();

      const after = await callText(second, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(after.isError).toBe(true);
      expect(after.text).toMatch(/ERR_READONLY_TIER/);
      expect(configs).toHaveLength(1);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
