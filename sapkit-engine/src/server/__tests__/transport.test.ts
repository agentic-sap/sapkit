/**
 * 전송 — 전송이 바뀌어도 **노출 제어와 안전 게이트는 그대로여야 한다.**
 *
 * 이 파일이 붙잡는 것은 두 가지다.
 *
 *  ① 전송 선택이 **fail-closed**인가 — 기본은 stdio이고, 네트워크 표면은 명시로만
 *    열리며, 오타·미구현 값이 포트를 열지 않는다. 프로파일 파일(`sap.env`)은
 *    전송을 고르지 못한다.
 *  ② 전송이 달라져도 `tools/list` 이름 집합과 게이트 판정이 **같은가** — 같은
 *    기동 조건에서 stdio(주입 전송)와 HTTP의 결과를 실제로 대조한다.
 *
 * SAP에 접속하지 않는다. 프로파일은 죽은 루프백 주소를 가리키는 fixture이고,
 * 접속 계층은 주입된 가짜다. HTTP는 루프백의 임시 포트에 실제로 바인딩하지만
 * 자식 프로세스는 띄우지 않는다(이 머신의 수거 함정).
 */

import * as nodeHttp from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { type StartedServer, startFromProcess } from '../bootstrap';
import { resolveTransport } from '../transport';
import {
  type FakeConnection,
  argvOf,
  cleanupTempDirs,
  fakeConnectionFactory,
  tempDir,
  writeEnvFile,
} from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

// ── 도구 ────────────────────────────────────────────────────────────────────

/** 커널에게 비어 있는 포트 하나를 받아 곧바로 돌려준다. */
async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function resolvedWith(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {},
): ReturnType<typeof resolveTransport> {
  return resolveTransport({ args, env });
}

interface Fixture {
  readonly started: StartedServer;
  readonly stderr: string[];
  readonly connections: FakeConnection;
}

/** 같은 기동 조건을 두 전송에 똑같이 먹이기 위한 argv·env 한 벌. */
function startupArgs(options: {
  readonly exposition?: string;
  readonly tier?: string;
}): { argv: string[]; env: Record<string, string> } {
  const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
    SAP_TIER: options.tier ?? 'DEV',
  });
  return {
    argv: [`--exposition=${options.exposition ?? 'readonly'}`],
    env: { MCP_ENV_PATH: envPath },
  };
}

async function startHttp(options: {
  readonly exposition?: string;
  readonly tier?: string;
  readonly extraArgs?: readonly string[];
  readonly extraEnv?: Readonly<Record<string, string>>;
}): Promise<Fixture> {
  const port = await freePort();
  const base = startupArgs(options);
  const stderr: string[] = [];
  const connections = fakeConnectionFactory();
  const started = await startFromProcess({
    argv: argvOf(
      ...base.argv,
      '--transport=http',
      `--http-port=${port}`,
      ...(options.extraArgs ?? []),
    ),
    env: { ...base.env, ...(options.extraEnv ?? {}) },
    cwd: tempDir(),
    homedir: tempDir(),
    connectionFactory: connections.factory,
    stderr: (line) => stderr.push(line),
  });
  return { started, stderr, connections };
}

async function withClient<T>(
  endpoint: string,
  body: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: 'transport-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  try {
    return await body(client);
  } finally {
    await client.close();
  }
}

async function listNames(client: Client): Promise<string[]> {
  const listed = await client.listTools();
  return listed.tools.map((tool) => tool.name).sort();
}

// ── ① 전송 선택 ─────────────────────────────────────────────────────────────

describe('전송 선택', () => {
  it('아무 것도 주지 않으면 stdio다', () => {
    expect(resolvedWith([]).config.kind).toBe('stdio');
  });

  it('--transport=http가 HTTP를 고르고, 바인딩 기본값은 구 엔진과 같다', () => {
    const resolution = resolvedWith(['--transport=http']);
    expect(resolution.config).toMatchObject({
      kind: 'http',
      host: '127.0.0.1',
      port: 3000,
      path: '/mcp/stream/http',
    });
  });

  it('MCP_TRANSPORT=http도 HTTP를 고른다', () => {
    expect(resolvedWith([], { MCP_TRANSPORT: 'http' }).config.kind).toBe('http');
  });

  it('인자가 환경변수를 이긴다 (구 우선순위 승계)', () => {
    expect(resolvedWith(['--transport=stdio'], { MCP_TRANSPORT: 'http' }).config.kind).toBe(
      'stdio',
    );
  });

  it('streamable-http 별칭도 HTTP다 (구 승계)', () => {
    expect(resolvedWith(['--transport=streamable-http']).config.kind).toBe('http');
  });

  it('알 수 없는 값은 포트를 열지 않는다 — stdio로 닫히고 이유를 말한다', () => {
    const resolution = resolvedWith(['--transport=htpp']);
    expect(resolution.config.kind).toBe('stdio');
    expect(resolution.diagnostics.join('\n')).toMatch(/TRANSPORT_UNSUPPORTED/);
  });

  it('sse는 아직 없다 — 조용히 stdio로 떨어지지 않고 이유를 말한다', () => {
    const resolution = resolvedWith(['--transport=sse']);
    expect(resolution.config.kind).toBe('stdio');
    expect(resolution.diagnostics.join('\n')).toMatch(/TRANSPORT_SSE_UNSUPPORTED/);
  });

  it('비루프백 바인딩은 옵트인 없이는 거부한다', () => {
    expect(() => resolvedWith(['--transport=http', '--http-host=0.0.0.0'])).toThrow(
      /ERR_HTTP_NON_LOOPBACK/,
    );
  });

  it('명시 옵트인이 있으면 비루프백도 열리되 경고가 남는다', () => {
    const resolution = resolvedWith(
      ['--transport=http', '--http-host=0.0.0.0'],
      { MCP_HTTP_ALLOW_REMOTE: 'true' },
    );
    expect(resolution.config).toMatchObject({ kind: 'http', host: '0.0.0.0' });
    expect(resolution.diagnostics.join('\n')).toMatch(/HTTP_REMOTE_BIND/);
  });

  it('쓸 수 없는 포트 값은 거부한다 (구 승계)', () => {
    expect(() => resolvedWith(['--transport=http', '--http-port=0'])).toThrow(/port/i);
    expect(() => resolvedWith(['--transport=http', '--http-port=99999'])).toThrow(/port/i);
    expect(() => resolvedWith(['--transport=http', '--http-port=eighty'])).toThrow(/port/i);
  });

  it('DNS 리바인딩 보호가 기본으로 켜지고 허용 Host가 바인딩에서 유도된다', () => {
    const resolution = resolvedWith(['--transport=http', '--http-port=4123']);
    expect(resolution.config).toMatchObject({
      kind: 'http',
      dnsRebindingProtection: true,
    });
    const config = resolution.config as Extract<
      typeof resolution.config,
      { kind: 'http' }
    >;
    expect(config.allowedHosts).toEqual(
      expect.arrayContaining(['127.0.0.1:4123', 'localhost:4123']),
    );
  });
});

// ── ② 전송이 달라져도 같은 것 ───────────────────────────────────────────────

describe('HTTP 왕복', () => {
  it('HTTP로 기동해 tools/list 왕복이 성사된다', async () => {
    const fixture = await startHttp({ exposition: 'readonly' });
    try {
      expect(fixture.started.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/stream\/http$/);
      const names = await withClient(fixture.started.endpoint ?? '', listNames);
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('GetSqlQuery');
    } finally {
      await fixture.started.close();
    }
  });

  it('같은 조건에서 stdio와 HTTP의 노출 이름 집합이 같다', async () => {
    const base = startupArgs({ exposition: 'readonly,high' });
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const stdio = await startFromProcess({
      argv: argvOf(...base.argv),
      env: base.env,
      cwd: tempDir(),
      homedir: tempDir(),
      transport: serverTransport,
      stderr: () => {},
    });
    const port = await freePort();
    const http = await startFromProcess({
      argv: argvOf(...base.argv, '--transport=http', `--http-port=${port}`),
      env: base.env,
      cwd: tempDir(),
      homedir: tempDir(),
      stderr: () => {},
    });
    try {
      const overHttp = await withClient(http.endpoint ?? '', listNames);
      expect(overHttp).toEqual([...stdio.core.exposedToolNames].sort());
      expect(overHttp.length).toBeGreaterThan(0);
    } finally {
      await stdio.close();
      await http.close();
    }
  });

  it('실데이터 2종은 HTTP에서도 접속 전에 거부된다', async () => {
    const fixture = await startHttp({ exposition: 'readonly', tier: 'DEV' });
    try {
      const outcome = await withClient(fixture.started.endpoint ?? '', async (client) => {
        const result = (await client.callTool({
          name: 'GetSqlQuery',
          arguments: { sql_query: 'SELECT * FROM KNA1' },
        })) as { isError?: boolean; content?: Array<{ text?: unknown }> };
        return {
          isError: result.isError === true,
          text: (result.content ?? []).map((item) => String(item.text ?? '')).join('\n'),
        };
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(fixture.connections.calls).toHaveLength(0);
    } finally {
      await fixture.started.close();
    }
  });

  it('tier 게이트도 HTTP에서 똑같이 막는다', async () => {
    const fixture = await startHttp({ exposition: 'readonly,high', tier: 'QA' });
    try {
      const outcome = await withClient(fixture.started.endpoint ?? '', async (client) => {
        const result = (await client.callTool({
          name: 'ActivateObjects',
          arguments: { objects: [{ name: 'ZSAPKIT_PROBE', type: 'PROG/P' }] },
        })) as { isError?: boolean; content?: Array<{ text?: unknown }> };
        return {
          isError: result.isError === true,
          text: (result.content ?? []).map((item) => String(item.text ?? '')).join('\n'),
        };
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/ERR_READONLY_TIER/);
      expect(fixture.connections.calls).toHaveLength(0);
    } finally {
      await fixture.started.close();
    }
  });

  it('감사 줄은 남고 기동 진단은 요청마다 되풀이되지 않는다', async () => {
    const fixture = await startHttp({ exposition: 'readonly', tier: 'DEV' });
    try {
      await withClient(fixture.started.endpoint ?? '', async (client) => {
        // ① 거부되는 호출 ② 사람이 위험을 인지해 통과하는 호출 — 감사 줄은
        //    후자에서 나온다(`src/safety/rowData.ts:132`).
        await client.callTool({
          name: 'GetSqlQuery',
          arguments: { sql_query: 'SELECT * FROM KNA1' },
        });
        await client.callTool({
          name: 'GetSqlQuery',
          arguments: { sql_query: 'SELECT * FROM VBRK', acknowledge_risk: true },
        });
      });
      const profileLines = fixture.stderr.filter((line) => line.includes('[sapkit] profile:'));
      expect(profileLines).toHaveLength(1);
      expect(fixture.stderr).toContain('AUDIT: user-acknowledged GetSqlQuery on VBRK');
    } finally {
      await fixture.started.close();
    }
  });

  it('POST 외의 요청은 표면을 넓히지 않는다 — GET 405 · 모르는 경로 404', async () => {
    const fixture = await startHttp({ exposition: 'readonly' });
    const endpoint = fixture.started.endpoint ?? '';
    try {
      expect((await fetch(endpoint)).status).toBe(405);
      const base = new URL(endpoint);
      expect((await fetch(new URL('/nope', base))).status).toBe(404);
      const health = await fetch(new URL('/mcp/health', base));
      expect(health.status).toBe(200);
      expect(((await health.json()) as { transport?: string }).transport).toBe('http');
    } finally {
      await fixture.started.close();
    }
  });

  it('허용 목록 밖의 Host 헤더는 거부된다 (DNS 리바인딩 보호)', async () => {
    const fixture = await startHttp({ exposition: 'readonly' });
    const endpoint = fixture.started.endpoint ?? '';
    try {
      // `fetch`는 Host를 금지 헤더로 보고 갈아치운다 — 날것의 클라이언트로 보낸다.
      const url = new URL(endpoint);
      const status = await new Promise<number>((resolve, reject) => {
        const request = nodeHttp.request(
          {
            host: url.hostname,
            port: Number(url.port),
            path: url.pathname,
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              host: 'evil.example',
            },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        );
        request.once('error', reject);
        request.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
      });
      expect(status).toBe(403);
    } finally {
      await fixture.started.close();
    }
  });
});

// ── ③ 프로파일 파일은 전송을 고르지 못한다 ──────────────────────────────────

describe('전송 설정의 출처', () => {
  it('프로파일 sap.env의 MCP_TRANSPORT는 포트를 열지 못한다', async () => {
    const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
      SAP_TIER: 'DEV',
      MCP_TRANSPORT: 'http',
    });
    const lines: string[] = [];
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const started = await startFromProcess({
      argv: argvOf('--exposition=readonly'),
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
      transport: serverTransport,
      stderr: (line) => lines.push(line),
    });
    try {
      expect(lines.join('\n')).toContain('transport(resolved): stdio');
      expect(started.endpoint).toBeUndefined();
    } finally {
      await started.close();
    }
  });
});
