/**
 * ReloadProfile — 활성 프로파일 재적재.
 *
 * **SAP에 붙지 않는다.** 이 도구는 파일만 읽으므로 전송을 주입할 것도 없다.
 * 대신 붙잡아야 하는 것이 하나 더 있다: 이 도구는 기동 후에 tier를 바꿀 수 있는
 * **유일한 통로**이므로, 도구가 답한 tier와 게이트가 판정하는 tier가 어긋나면
 * 안전 바닥선이 내려간다. 그래서 여기서 재적재를 **도구 호출로** 시키고, 같은
 * 서버의 write 도구가 그 뒤에 어떻게 판정되는지까지 본다.
 *
 * 훅 자체의 계약(접속 폐기·봉인·표면의 크기)은 `src/server/__tests__/session.test.ts`가
 * 소유한다. 여기는 도구가 그 훅을 제대로 타는지와 응답 계약을 본다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';

import type { AdtClient } from '../../../adt';
import type { ConnectionConfig } from '../../../contracts';
import { createServerCore, defineTool, resolveStartup } from '../../../server';
import type { SapTool, ToolContext } from '../../../server';
import { reloadProfile } from '../reloadProfile';
import { cleanupTempDirs, probeTier, publishedDeclaration, publishedOf, tempDir } from './support';

afterEach(() => {
  cleanupTempDirs();
});

// ── 프로파일 배치 ───────────────────────────────────────────────────────────

function profileAt(home: string, alias: string, values: Record<string, string>): string {
  const file = path.join(home, 'profiles', alias, 'sap.env');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const merged: Record<string, string> = {
    SAP_URL: 'http://127.0.0.1:1',
    SAP_USERNAME: 'FIXTURE',
    SAP_PASSWORD: 'fixture-not-a-secret',
    SAP_CLIENT: '100',
    ...values,
  };
  fs.writeFileSync(
    file,
    Object.entries(merged)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    'utf8',
  );
  return file;
}

function pointAt(cwd: string, alias: string): void {
  const dir = path.join(cwd, '.sapkit');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'active-profile.txt'), alias, 'utf8');
}

/** 재적재 뒤 게이트를 물어볼 상대. 실제 write 도구를 쓰지 않는다. */
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

interface Harness {
  readonly client: Client;
  readonly configs: ConnectionConfig[];
  close(): Promise<void>;
}

/** 포인터로 프로파일을 고르는 서버 하나. `ReloadProfile` + 가짜 write. */
async function harnessAt(cwd: string, home: string): Promise<Harness> {
  const configs: ConnectionConfig[] = [];
  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/sapkit-engine/entry.js', '--exposition=readonly,high'],
    env: { SAPKIT_HOME_DIR: home },
    cwd,
    homedir: tempDir(),
  });
  const core = createServerCore({
    startup,
    tools: [reloadProfile, fakeWrite()],
    connectionFactory: (config: ConnectionConfig): AdtClient => {
      configs.push(config);
      return { fake: true } as unknown as AdtClient;
    },
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'reload-profile-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    configs,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

async function call(
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

async function reload(harness: Harness): Promise<Record<string, unknown>> {
  const outcome = await call(harness, 'ReloadProfile');
  expect(outcome.isError).toBe(false);
  return JSON.parse(outcome.text) as Record<string, unknown>;
}

// ── 발행 계약 ───────────────────────────────────────────────────────────────

describe('발행 계약', () => {
  it('구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedOf(reloadProfile)).toEqual(publishedDeclaration('ReloadProfile'));
  });

  it('노출·정책 선언이 구 핸들러의 자리와 같다', () => {
    // 구 경로 `engine/src/handlers/system/readonly/handleReloadProfile.ts` →
    // `readonly` 집합. `available_in`은 같은 파일 26행 그대로.
    expect(reloadProfile.definition.sets).toEqual(['readonly']);
    expect(reloadProfile.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    // 서버를 제어하는 도구다. tier 게이트가 이름으로 면제하는 유일한 분류이며,
    // 그 면제 목록(`src/safety/tier.ts`의 SERVER_CONTROL_TOOLS)이 재적재 훅을
    // 받을 자격도 함께 정한다.
    expect(reloadProfile.definition.kind).toBe('server-control');
    // 겨누는 SAP 오브젝트가 없다 — 빈 배열은 명시 선언이다.
    expect(reloadProfile.definition.targetNames).toEqual([]);
  });
});

// ── 응답 계약 ───────────────────────────────────────────────────────────────

describe('응답 본문', () => {
  it('구가 싣던 키를 그대로 싣는다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    const source = profileAt(home, 'dev1', {
      SAP_TIER: 'DEV',
      SAP_DESCRIPTION: 'fixture dev system',
    });
    pointAt(cwd, 'dev1');

    const harness = await harnessAt(cwd, home);
    try {
      expect(await reload(harness)).toEqual({
        ok: true,
        alias: 'dev1',
        legacy: false,
        tier: 'DEV',
        readonly: false,
        host: 'http://127.0.0.1:1',
        client: '100',
        description: 'fixture dev system',
        sourcePath: source,
        restartRequired: false,
        diagnostics: [],
      });
    } finally {
      await harness.close();
    }
  });

  it('읽기 좋은 두 칸 들여쓰기 JSON 한 덩이다 (구 return_response 그대로)', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'dev1');

    const harness = await harnessAt(cwd, home);
    try {
      const outcome = await call(harness, 'ReloadProfile');
      expect(outcome.text).toContain('\n  "ok": true');
    } finally {
      await harness.close();
    }
  });

  it('QA·PRD는 readonly=true로 보고된다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'qa1', { SAP_TIER: 'QA' });
    pointAt(cwd, 'qa1');

    const harness = await harnessAt(cwd, home);
    try {
      const body = await reload(harness);
      expect(body.tier).toBe('QA');
      expect(body.readonly).toBe(true);
    } finally {
      await harness.close();
    }
  });
});

// ── tier 면제 ───────────────────────────────────────────────────────────────

describe('tier 게이트 면제', () => {
  it.each(['QA', 'PRD', 'UNKNOWN'] as const)(
    '%s tier에서도 부를 수 있고 SAP 접속을 만들지 않는다',
    async (tier) => {
      const probe = await probeTier(reloadProfile, tier === 'UNKNOWN' ? '' : tier, {});
      expect(probe.outcome.isError).toBe(false);
      expect(probe.connections).toBe(0);
      const body = JSON.parse(probe.outcome.text) as Record<string, unknown>;
      expect(body.tier).toBe(tier);
    },
  );
});

// ── 재적재 뒤 게이트가 새 값을 본다 ──────────────────────────────────────────

describe('도구를 통한 재적재가 게이트에 실제로 반영된다', () => {
  it('DEV → PRD: 도구가 PRD를 보고한 뒤 같은 write가 거부되고 접속 시도가 0회', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    profileAt(home, 'prd1', { SAP_TIER: 'PRD' });
    pointAt(cwd, 'dev1');

    const harness = await harnessAt(cwd, home);
    try {
      expect((await call(harness, 'CreateFixture', { name: 'ZFIXTURE' })).isError).toBe(false);
      expect(harness.configs).toHaveLength(1);

      pointAt(cwd, 'prd1');
      const body = await reload(harness);
      expect(body.tier).toBe('PRD');
      expect(body.readonly).toBe(true);
      expect(body.alias).toBe('prd1');

      const after = await call(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(after.isError).toBe(true);
      expect(after.text).toMatch(/ERR_READONLY_TIER/);
      expect(harness.configs).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('PRD → DEV: 도구가 DEV를 보고한 뒤 같은 write가 열린다 (과차단 역검증)', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    profileAt(home, 'prd1', { SAP_TIER: 'PRD' });
    pointAt(cwd, 'prd1');

    const harness = await harnessAt(cwd, home);
    try {
      expect((await call(harness, 'CreateFixture', { name: 'ZFIXTURE' })).isError).toBe(true);

      pointAt(cwd, 'dev1');
      expect((await reload(harness)).tier).toBe('DEV');

      const after = await call(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(after.isError).toBe(false);
      expect(harness.configs).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  it('가리킨 프로파일이 없으면 무접속·UNKNOWN을 **이유와 함께** 보고한다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'dev1', { SAP_TIER: 'DEV' });
    pointAt(cwd, 'dev1');

    const harness = await harnessAt(cwd, home);
    try {
      expect((await reload(harness)).tier).toBe('DEV');

      pointAt(cwd, 'gone');
      const body = await reload(harness);
      expect(body.ok).toBe(true); // 재적재 자체는 수행됐다
      expect(body.tier).toBe('UNKNOWN');
      expect(body.readonly).toBe(true);
      expect(body.alias).toBe('gone');
      expect(body.host).toBe('');
      expect(body.sourcePath).toBeNull();
      expect((body.diagnostics as string[]).join('\n')).toMatch(/PROFILE_NOT_FOUND/);

      // 그리고 게이트도 그 상태를 본다.
      const write = await call(harness, 'CreateFixture', { name: 'ZFIXTURE' });
      expect(write.isError).toBe(true);
      expect(write.text).toMatch(/ERR_READONLY_TIER/);
    } finally {
      await harness.close();
    }
  });

  it('배포 축이 바뀌면 restartRequired=true와 그 이유를 싣는다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    profileAt(home, 'cloud1', { SAP_TIER: 'DEV', SAP_SYSTEM_TYPE: 'cloud' });
    profileAt(home, 'onprem1', { SAP_TIER: 'DEV', SAP_SYSTEM_TYPE: 'onprem' });
    pointAt(cwd, 'cloud1');

    const harness = await harnessAt(cwd, home);
    try {
      const same = await reload(harness);
      expect(same.restartRequired).toBe(false);
      expect('note' in same).toBe(false); // undefined는 JSON.stringify가 떨군다

      pointAt(cwd, 'onprem1');
      const changed = await reload(harness);
      expect(changed.restartRequired).toBe(true);
      expect(String(changed.note)).toMatch(/tool list/i);
      // 나머지는 이미 발효돼 있다 — 재시동은 목록 때문이지 tier 때문이 아니다.
      expect(changed.tier).toBe('DEV');
    } finally {
      await harness.close();
    }
  });

  it('포인터가 없으면 legacy=true로 보고한다', async () => {
    const home = tempDir();
    const cwd = tempDir();
    const runtimeDir = path.join(cwd, '.sapkit');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'sap.env'),
      ['SAP_URL=http://127.0.0.1:1', 'SAP_USERNAME=FIXTURE', 'SAP_PASSWORD=x', 'SAP_TIER=DEV'].join(
        '\n',
      ),
      'utf8',
    );

    const harness = await harnessAt(cwd, home);
    try {
      const body = await reload(harness);
      expect(body.legacy).toBe(true);
      expect(body.alias).toBeNull();
      expect(body.tier).toBe('DEV');
    } finally {
      await harness.close();
    }
  });
});
