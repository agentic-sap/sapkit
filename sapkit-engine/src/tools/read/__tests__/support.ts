/**
 * 읽기 도구 시험의 공용 장치.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다. MCP 규약은 SDK의 `InMemoryTransport`로
 * 같은 프로세스 안에서 진짜로 오가고, SAP 쪽은 **전송 계층을 주입**해 끊는다 —
 * 그래서 도구가 실제로 조립한 URL·메서드·본문을 문자열로 붙잡을 수 있다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtClient } from '../../../adt';
import type { HttpTransport } from '../../../adt';
import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';

const created: string[] = [];

export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-read-'));
  created.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  while (created.length > 0) {
    const dir = created.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패는 시험 결과가 아니다.
    }
  }
}

/** 시험이 쓰는 SAP 오리진. 죽은 루프백이며 전송은 어차피 주입된다. */
export const TEST_ORIGIN = 'http://127.0.0.1:1';

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface Reply {
  readonly status?: number;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Recorder {
  readonly transport: HttpTransport;
  readonly requests: RecordedRequest[];
}

/** 요청을 받아 적고 시험이 정한 응답을 돌려주는 전송. */
export function recordingTransport(
  reply: (request: RecordedRequest, index: number) => Reply,
): Recorder {
  const requests: RecordedRequest[] = [];
  const transport: HttpTransport = async (request) => {
    const recorded: RecordedRequest = {
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
      body: request.body,
    };
    requests.push(recorded);
    const outcome = reply(recorded, requests.length - 1);
    const status = outcome.status ?? 200;
    return {
      status,
      statusText: status >= 400 ? 'Error' : 'OK',
      headers: outcome.headers ?? {},
      setCookie: [],
      body: outcome.body ?? '',
    };
  };
  return { transport, requests };
}

/** CSRF 토큰을 긁어오는 discovery 왕복인가. 도구가 보낸 요청이 아니다. */
export function isCsrfFetch(request: RecordedRequest): boolean {
  return (
    request.url.includes('/sap/bc/adt/core/discovery') ||
    request.url.includes('/sap/bc/adt/discovery')
  );
}

/**
 * POST를 보내는 도구를 시험할 때 씌운다.
 *
 * 접속 계층은 상태 변경 요청 **앞에** CSRF 토큰을 긁어온다. 그 왕복은 도구의
 * 계약이 아니므로 여기서 토큰을 내주고 넘긴다.
 */
export function csrfAware(
  reply: (request: RecordedRequest, index: number) => Reply,
): (request: RecordedRequest, index: number) => Reply {
  return (request, index) =>
    isCsrfFetch(request) ? { headers: { 'x-csrf-token': 'TEST-TOKEN' } } : reply(request, index);
}

/** 도구가 실제로 보낸 요청만 남긴다(토큰 왕복 제외). */
export function toolRequests(requests: readonly RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => !isCsrfFetch(request));
}

export interface Harness {
  readonly client: Client;
  close(): Promise<void>;
}

/**
 * 도구 하나만 실은 서버를 세운다.
 *
 * 배포 축은 `onprem`이다 — `GetProgram`의 `available_in`이 `['onprem','legacy']`
 * 라서 기본 `cloud`에서는 목록에 뜨지 않는다.
 */
export async function harnessFor(tool: SapTool, transport?: HttpTransport): Promise<Harness> {
  const dir = tempDir();
  const envPath = path.join(dir, 'sap.env');
  fs.writeFileSync(
    envPath,
    [
      `SAP_URL=${TEST_ORIGIN}`,
      'SAP_USERNAME=FIXTURE',
      'SAP_PASSWORD=fixture-not-a-secret',
      'SAP_CLIENT=100',
      'SAP_TIER=DEV',
      'SAP_SYSTEM_TYPE=onprem',
    ].join('\n'),
    'utf8',
  );

  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/sapkit-engine/entry.js', '--exposition=readonly,high'],
    env: { MCP_ENV_PATH: envPath },
    cwd: dir,
    homedir: dir,
  });

  const core = createServerCore({
    startup,
    tools: [tool],
    connectionFactory: (config) =>
      new AdtClient(config, transport ? { transport, sleep: async () => {} } : {}),
    stderr: () => {},
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'read-tools-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

export interface CallOutcome {
  readonly isError: boolean;
  readonly text: string;
}

/**
 * 서버 코어는 `isError` 결과를 `McpError(InternalError, …)`로 올리고, SDK가
 * 그것을 다시 `MCP error -32603: <문구>` 형태의 도구 오류로 접어 돌려준다
 * (`src/server/__tests__/core.test.ts`의 같은 처리 참조). 여기서 보고 싶은 것은
 * **핸들러가 만든 문구**이므로 그 껍질만 벗긴다.
 */
const MCP_ERROR_PREFIX = /^MCP error -\d+: /;

export async function callTool(
  harness: Harness,
  name: string,
  args: Record<string, unknown>,
): Promise<CallOutcome> {
  const result = (await harness.client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ text?: unknown }>;
  };
  const text = (result.content ?? []).map((item) => String(item.text ?? '')).join('\n');
  return {
    isError: result.isError === true,
    text: text.replace(MCP_ERROR_PREFIX, ''),
  };
}

/** 도구 하나를 세우고 부른 뒤 정리까지 하는 한 벌. */
export async function runTool(
  tool: SapTool,
  args: Record<string, unknown>,
  reply: (request: RecordedRequest, index: number) => Reply,
): Promise<{ outcome: CallOutcome; requests: RecordedRequest[] }> {
  const recorder = recordingTransport(reply);
  const harness = await harnessFor(tool, recorder.transport);
  try {
    const outcome = await callTool(harness, tool.definition.name, args);
    return { outcome, requests: recorder.requests };
  } finally {
    await harness.close();
  }
}

/**
 * 채록본(`harness/old-surface/m1-tools.json`)의 그 도구 항목.
 *
 * 읽는 키는 **`tools`(전량 선언 186종)**이지 `m1`(19종)이 아니다. `m1`을 읽으면
 * M1 밖 도구를 지을 때 그 도구의 계약 시험이 채록본에서 자기 선언을 못 찾아
 * **지을 수가 없다.** `m1` 키는 다른 소비자를 위해 파일에 그대로 남아 있다.
 */
export function publishedDeclaration(name: string): {
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
} {
  const file = path.join(__dirname, '..', '..', '..', '..', 'harness', 'old-surface', 'm1-tools.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    tools: Record<string, { name: string; description: string; inputSchema: unknown; execution: unknown }>;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}
