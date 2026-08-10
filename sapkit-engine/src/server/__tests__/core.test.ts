/**
 * 서버 코어 — 실제 MCP 규약을 태워서 확인한다.
 *
 * 자식 프로세스를 띄우지 않는다. SDK의 `InMemoryTransport`로 클라이언트와
 * 서버를 같은 프로세스 안에서 잇고 `tools/list`·`tools/call`을 진짜로 주고받는다.
 *
 * 여기서 못박는 회귀 하나가 이 파일의 존재 이유다 — **구 엔진 GAP-1**:
 * tier 게이트가 등록 래퍼에 배선되지 않아 QA·PRD에서도 write 호출이 SAP까지
 * 도달했다(`interactive/scripts/conformance-server-gates.mjs` 43-51행). 그래서
 * 접속 계층을 모의해 "막힌 호출은 접속을 **한 번도** 얻지 않는다"를 단언한다.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';

import { createServerCore } from '../core';
import { defineTool } from '../toolDefinition';
import type { SapTool, ToolContext } from '../toolDefinition';
import { resolveStartup } from '../startup';
import type { Startup } from '../startup';
import * as path from 'node:path';
import {
  argvOf,
  cleanupTempDirs,
  fakeConnectionFactory,
  tempDir,
  writeEnvFile,
} from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

// ── 가짜 도구들 ─────────────────────────────────────────────────────────────
// 물결 2가 짓기 전이므로 레지스트리는 비어 있다. 프레임이 도는 것을 확인하려면
// 프레임에 실을 것이 필요하고, 그 최소치가 이 넷이다.

let touched: string[] = [];

function fakeRead(): SapTool {
  return defineTool(
    {
      name: 'GetFixture',
      description: '[read-only] fixture read tool.',
      inputSchema: { name: z.string().describe('anything') },
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'read',
    },
    async (context: ToolContext, args) => {
      touched.push('GetFixture');
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: `read:${args.name}` }] };
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
    },
    async (context: ToolContext) => {
      touched.push('CreateFixture');
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: 'written' }] };
    },
  );
}

function fakeLegacyOnly(): SapTool {
  return defineTool(
    {
      name: 'GetLegacyFixture',
      description: '[read-only] only exists on legacy systems.',
      inputSchema: {},
      available_in: ['legacy'],
      sets: ['readonly'],
      kind: 'read',
    },
    async () => ({ isError: false, content: [{ type: 'text', text: 'legacy' }] }),
  );
}

/** 실데이터 2종은 노출로 막히지 않는다 — readonly 표면에 그대로 있다. */
function fakeTableContents(): SapTool {
  return defineTool(
    {
      name: 'GetTableContents',
      description: '[read-only] fixture row reader.',
      inputSchema: {
        table_name: z.string(),
        acknowledge_risk: z.boolean().optional(),
      },
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'row-data',
    },
    async (context: ToolContext, args) => {
      touched.push('GetTableContents');
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: `rows:${args.table_name}` }] };
    },
  );
}

function fakeSqlQuery(): SapTool {
  return defineTool(
    {
      name: 'GetSqlQuery',
      description: '[read-only] fixture SQL reader.',
      inputSchema: {
        sql_query: z.string(),
        acknowledge_risk: z.boolean().optional(),
      },
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'row-data',
    },
    async (context: ToolContext) => {
      touched.push('GetSqlQuery');
      await context.getConnection();
      return { isError: false, content: [{ type: 'text', text: 'rows' }] };
    },
  );
}

function failingTool(): SapTool {
  return defineTool(
    {
      name: 'GetFailure',
      description: '[read-only] always fails.',
      inputSchema: {},
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'read',
    },
    async () => ({ isError: true, content: [{ type: 'text', text: 'handler said no' }] }),
  );
}

const ALL_TOOLS = (): SapTool[] => [
  fakeRead(),
  fakeWrite(),
  fakeLegacyOnly(),
  fakeTableContents(),
  fakeSqlQuery(),
  failingTool(),
];

// ── 하네스 ──────────────────────────────────────────────────────────────────

interface Harness {
  readonly client: Client;
  readonly stderr: string[];
  readonly connections: { calls: unknown[] };
  close(): Promise<void>;
}

async function harnessFor(startup: Startup, tools: SapTool[] = ALL_TOOLS()): Promise<Harness> {
  const stderr: string[] = [];
  const connection = fakeConnectionFactory();
  const core = createServerCore({
    startup,
    tools,
    connectionFactory: connection.factory,
    stderr: (line) => stderr.push(line),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    stderr,
    connections: connection,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

function startupWith(options: {
  readonly exposition?: string;
  readonly tier?: string;
  readonly systemType?: string;
  readonly connected?: boolean;
}): Startup {
  const args = options.exposition === undefined ? [] : [`--exposition=${options.exposition}`];
  if (options.connected === false) {
    return resolveStartup({ argv: argvOf(...args), env: {}, cwd: tempDir(), homedir: tempDir() });
  }
  const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
    SAP_TIER: options.tier ?? 'DEV',
    ...(options.systemType ? { SAP_SYSTEM_TYPE: options.systemType } : {}),
  });
  return resolveStartup({
    argv: argvOf(...args),
    env: { MCP_ENV_PATH: envPath },
    cwd: tempDir(),
    homedir: tempDir(),
  });
}

async function listNames(harness: Harness): Promise<string[]> {
  const listed = await harness.client.listTools();
  return listed.tools.map((tool) => tool.name).sort();
}

/**
 * 도구 호출 결과의 오류 본문.
 *
 * SDK는 콜백이 던진 `McpError`를 JSON-RPC 오류로 올리지 않고 **도구 오류
 * 결과**(`isError: true` + 텍스트)로 접어 돌려준다. 적합성 러너의 판정도 두
 * 모양을 모두 읽으므로(`conformance-server-gates.mjs:291-297`) 거부 어휘만
 * 그대로면 된다 — 여기서 고정하는 것이 그 어휘다.
 */
async function callText(
  harness: Harness,
  name: string,
  args: Record<string, unknown>,
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

beforeEach(() => {
  touched = [];
});

// ── tools/list ──────────────────────────────────────────────────────────────

describe('tools/list', () => {
  it('무프로파일 기동에서도 노출 규칙대로 응답한다', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly', connected: false }));
    try {
      expect(await listNames(harness)).toEqual([
        'GetFailure',
        'GetFixture',
        'GetSqlQuery',
        'GetTableContents',
      ]);
    } finally {
      await harness.close();
    }
  });

  it('--exposition=readonly와 readonly,high가 목록을 실제로 가른다', async () => {
    const readonly = await harnessFor(startupWith({ exposition: 'readonly' }));
    const full = await harnessFor(startupWith({ exposition: 'readonly,high' }));
    try {
      expect(await listNames(readonly)).not.toContain('CreateFixture');
      expect(await listNames(full)).toContain('CreateFixture');
    } finally {
      await readonly.close();
      await full.close();
    }
  });

  it('배포 축이 목록을 가른다 — 미설정(cloud)에는 legacy 전용 도구가 없다', async () => {
    const cloud = await harnessFor(startupWith({ exposition: 'readonly' }));
    const legacy = await harnessFor(startupWith({ exposition: 'readonly', systemType: 'legacy' }));
    try {
      expect(await listNames(cloud)).not.toContain('GetLegacyFixture');
      expect(await listNames(legacy)).toContain('GetLegacyFixture');
    } finally {
      await cloud.close();
      await legacy.close();
    }
  });

  it('빈 레지스트리라도 tools/list는 정상 응답한다', async () => {
    const harness = await harnessFor(startupWith({ connected: false }), []);
    try {
      expect(await listNames(harness)).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('선언한 zod shape이 그대로 JSON Schema로 발행된다', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly' }));
    try {
      const listed = await harness.client.listTools();
      const tool = listed.tools.find((entry) => entry.name === 'GetFixture');
      expect(tool?.inputSchema).toMatchObject({
        type: 'object',
        properties: { name: { type: 'string', description: 'anything' } },
        required: ['name'],
      });
    } finally {
      await harness.close();
    }
  });
});

// ── tier 게이트가 접속 **앞에** 있다 (GAP-1 회귀 방지) ────────────────────────

describe('tier 게이트 배선', () => {
  it.each(['QA', 'PRD', 'UNKNOWN'] as const)(
    '%s에서 mutation 호출은 접속을 얻기 전에 거부된다',
    async (tier) => {
      const startup = startupWith({ exposition: 'readonly,high', tier });
      const harness = await harnessFor(startup);
      try {
        const outcome = await callText(harness, 'CreateFixture', { name: 'X' });
        expect(outcome.isError).toBe(true);
        expect(outcome.text).toMatch(/ERR_READONLY_TIER/);
        expect(harness.connections.calls).toHaveLength(0);
        expect(touched).not.toContain('CreateFixture');
      } finally {
        await harness.close();
      }
    },
  );

  it('DEV에서는 같은 호출이 핸들러까지 도달한다 (과수리 역검증)', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly,high', tier: 'DEV' }));
    try {
      const result = await harness.client.callTool({
        name: 'CreateFixture',
        arguments: { name: 'X' },
      });
      expect(result.isError).toBeFalsy();
      expect(harness.connections.calls).toHaveLength(1);
      expect(touched).toContain('CreateFixture');
    } finally {
      await harness.close();
    }
  });
});

// ── 실데이터 2종 상시 게이트 ────────────────────────────────────────────────

describe('실데이터 게이트 배선', () => {
  it('readonly 표면에서도 보호 테이블은 접속 전에 막힌다', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly', tier: 'DEV' }));
    try {
      const outcome = await callText(harness, 'GetTableContents', { table_name: 'KNA1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
      expect(touched).not.toContain('GetTableContents');
    } finally {
      await harness.close();
    }
  });

  it('비보호 테이블은 게이트를 통과해 핸들러로 간다', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly', tier: 'DEV' }));
    try {
      const result = await harness.client.callTool({
        name: 'GetTableContents',
        arguments: { table_name: 'ZSAPKIT_FREE' },
      });
      expect(result.isError).toBeFalsy();
      expect(touched).toContain('GetTableContents');
    } finally {
      await harness.close();
    }
  });
});

// ── 감사 줄 ─────────────────────────────────────────────────────────────────

describe('감사 줄', () => {
  it('통과 판정의 감사 문구가 stderr로 그대로 나간다', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly', tier: 'DEV' }));
    try {
      await harness.client.callTool({
        name: 'GetTableContents',
        arguments: { table_name: 'VBRK', acknowledge_risk: true },
      });
      expect(harness.stderr).toContain('AUDIT: user-acknowledged GetTableContents on VBRK');
    } finally {
      await harness.close();
    }
  });

  it('거부 판정에서도 감사 문구가 stderr로 나간다', async () => {
    // BNKA는 MCP_ALLOW_TABLE로 열려 있고 KNA1은 아니다. 판정은 거부지만 우회는
    // 이미 일어났으므로, 거부와 함께 감사 줄이 남지 않으면 우회가 숨겨진다.
    const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
      SAP_TIER: 'DEV',
      MCP_ALLOW_TABLE: 'BNKA',
    });
    const startup = resolveStartup({
      argv: argvOf('--exposition=readonly'),
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    const harness = await harnessFor(startup);
    try {
      const outcome = await callText(harness, 'GetSqlQuery', {
        sql_query: 'SELECT * FROM BNKA INNER JOIN KNA1 ON BNKA.BANKL = KNA1.KUNNR',
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.stderr).toContain('AUDIT: MCP_ALLOW_TABLE bypass for BNKA');
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('기동 진단도 stderr로 나간다', async () => {
    const harness = await harnessFor(startupWith({ connected: false }));
    try {
      expect(harness.stderr.join('\n')).toContain('tier=UNKNOWN');
    } finally {
      await harness.close();
    }
  });
});

// ── 무프로파일에서의 정직한 실패 ────────────────────────────────────────────

describe('무프로파일 폴백', () => {
  it('접속이 필요한 도구는 조용히 성공하지 않고 정직하게 실패한다', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly', connected: false }));
    try {
      const outcome = await callText(harness, 'GetFixture', { name: 'X' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/ERR_NO_CONNECTION/);
    } finally {
      await harness.close();
    }
  });

  it('핸들러의 isError는 오류로 올라간다 (구 BaseMcpServer 계약)', async () => {
    const harness = await harnessFor(startupWith({ exposition: 'readonly', connected: false }));
    try {
      const outcome = await callText(harness, 'GetFailure', {});
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/handler said no/);
    } finally {
      await harness.close();
    }
  });
});
