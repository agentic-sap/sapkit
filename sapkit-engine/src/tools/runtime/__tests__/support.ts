/**
 * 런타임 도구 시험의 공용 장치.
 *
 * **SAP에 붙지 않는다.** MCP 규약은 SDK의 `InMemoryTransport`로 같은 프로세스
 * 안에서 진짜로 오가고, SAP 쪽은 **전송 계층을 주입**해 끊는다 — 그래서 도구가
 * 실제로 조립한 URL·메서드·헤더·본문을 문자열로 붙잡을 수 있다. 이 묶음은
 * 「실행」 도구를 짓기 때문에 이 격리가 특히 중요하다: 시험이 실 시스템에
 * 프로그램 실행 요청을 보내는 일은 있어서는 안 된다.
 *
 * 자식 프로세스도 띄우지 않는다(이 머신에서 jest가 자식 프로세스 수거에서
 * 블록된 실측 기록이 있다).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtClient } from '../../../adt';
import type { HttpTransport } from '../../../adt';
import type { ConnectionConfig } from '../../../contracts';
import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';

const created: string[] = [];

export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-runtime-'));
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

export type Responder = (request: RecordedRequest, index: number) => Reply;

export interface Recorder {
  readonly transport: HttpTransport;
  readonly requests: RecordedRequest[];
}

/** 요청을 받아 적고 시험이 정한 응답을 돌려주는 전송. */
export function recordingTransport(reply: Responder): Recorder {
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
 * POST를 보내는 도구를 시험할 때 씌운다 — 접속 계층은 상태 변경 요청 **앞에**
 * CSRF 토큰을 긁어온다. 그 왕복은 도구의 계약이 아니므로 토큰을 내주고 넘긴다.
 */
export function csrfAware(reply: Responder): Responder {
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

export interface HarnessOptions {
  readonly transport?: HttpTransport;
  /** 기본 `DEV`. tier 게이트 음성시험이 이것을 바꾼다. */
  readonly tier?: string;
  /** 접속 공장 교체점 — 접속 시도 횟수를 세는 음성시험이 쓴다. */
  readonly connectionFactory?: (config: ConnectionConfig) => AdtClient;
}

function writeProfile(tier: string): string {
  const dir = tempDir();
  const envPath = path.join(dir, 'sap.env');
  fs.writeFileSync(
    envPath,
    [
      `SAP_URL=${TEST_ORIGIN}`,
      'SAP_USERNAME=FIXTURE',
      'SAP_PASSWORD=fixture-not-a-secret',
      'SAP_CLIENT=100',
      `SAP_TIER=${tier}`,
      // 이 묶음에는 onprem 축에만 있는 도구가 둘 있다 — 무프로파일 기본값 cloud로는
      // 목록에 뜨지 않는다.
      'SAP_SYSTEM_TYPE=onprem',
    ].join('\n'),
    'utf8',
  );
  return envPath;
}

/** 도구 하나만 실은 서버를 세운다. 노출 집합은 이 묶음이 쓰는 `readonly`. */
export async function harnessFor(tool: SapTool, options: HarnessOptions = {}): Promise<Harness> {
  const envPath = writeProfile(options.tier ?? 'DEV');
  const cwd = tempDir();

  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/sapkit-engine/entry.js', '--exposition=readonly'],
    env: { MCP_ENV_PATH: envPath },
    cwd,
    homedir: cwd,
  });

  const core = createServerCore({
    startup,
    tools: [tool],
    connectionFactory:
      options.connectionFactory ??
      ((config) =>
        new AdtClient(
          config,
          options.transport ? { transport: options.transport, sleep: async () => {} } : {},
        )),
    stderr: () => {},
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'runtime-tools-test', version: '0.0.0' });
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
 * 서버 코어는 `isError` 결과를 `McpError`로 올리고, SDK가 그것을 다시
 * `MCP error -32603: <문구>` 형태로 접어 돌려준다. 여기서 보고 싶은 것은
 * **핸들러가 만든 문구**이므로 그 껍질만 벗긴다.
 */
const MCP_ERROR_PREFIX = /^MCP error -\d+: /;

export async function callTool(
  harness: Harness,
  name: string,
  args: Record<string, unknown>,
): Promise<CallOutcome> {
  let text: string;
  let isError: boolean;
  try {
    const result = (await harness.client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ text?: unknown }>;
    };
    text = (result.content ?? []).map((item) => String(item.text ?? '')).join('\n');
    isError = result.isError === true;
  } catch (error) {
    // 게이트 거부는 프로토콜 오류로 올라온다 — 결과 객체가 아니라 예외다.
    text = String((error as { message?: unknown })?.message ?? error);
    isError = true;
  }
  return { isError, text: text.replace(MCP_ERROR_PREFIX, '') };
}

/** 도구 하나를 세우고 부른 뒤 정리까지 하는 한 벌. */
export async function runTool(
  tool: SapTool,
  args: Record<string, unknown>,
  reply: Responder,
): Promise<{ outcome: CallOutcome; requests: RecordedRequest[] }> {
  const recorder = recordingTransport(reply);
  const harness = await harnessFor(tool, { transport: recorder.transport });
  try {
    const outcome = await callTool(harness, tool.definition.name, args);
    return { outcome, requests: recorder.requests };
  } finally {
    await harness.close();
  }
}

/** 응답 본문을 객체로 되돌려 준다 — 이 묶음은 전부 JSON 한 덩이로 답한다. */
export function jsonOf(outcome: CallOutcome): Record<string, unknown> {
  return JSON.parse(outcome.text) as Record<string, unknown>;
}

export interface TierProbe {
  readonly outcome: CallOutcome;
  /** 접속 공장이 불린 횟수. 게이트가 앞에서 막았다면 0이어야 한다. */
  readonly connections: number;
}

/**
 * tier 게이트 음성시험용 — **부르면 안 되는 접속 공장**을 주입하고 호출한다.
 *
 * `isError`만 보면 헛돈다. 게이트를 통째로 들어내도 이 공장이 던져서 `isError`가
 * 참이 되기 때문이다(안전 게이트 `gates/safety.mjs:148-150`가 리뷰 사보타주로
 * 실증한 함정). 그래서 **접속 시도 횟수**를 함께 돌려준다 — 거부라면 0이다.
 */
export async function probeTier(
  tool: SapTool,
  tier: string,
  args: Record<string, unknown>,
): Promise<TierProbe> {
  const state = { calls: 0 };
  const harness = await harnessFor(tool, {
    tier,
    connectionFactory: () => {
      state.calls += 1;
      throw new Error('접속을 열려고 했다 — 게이트가 앞에서 막았어야 한다');
    },
  });
  try {
    const outcome = await callTool(harness, tool.definition.name, args);
    return { outcome, connections: state.calls };
  } finally {
    await harness.close();
  }
}

/**
 * 채록본(`harness/old-surface/m1-tools.json`)의 그 도구 항목.
 *
 * 읽는 키는 **`tools`(전량 선언 186종)**이지 `m1`(19종)이 아니다.
 */
export function publishedDeclaration(name: string): {
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
} {
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'harness',
    'old-surface',
    'm1-tools.json',
  );
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    tools: Record<
      string,
      { name: string; description: string; inputSchema: unknown; execution: unknown }
    >;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}

/** 도구 하나를 세우고 `tools/list`의 그 선언을 돌려준다. */
export async function publishedOf(tool: SapTool): Promise<{
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
}> {
  const harness = await harnessFor(tool);
  try {
    const listed = await harness.client.listTools();
    const found = listed.tools.find((entry) => entry.name === tool.definition.name) as
      | { name: string; description: string; inputSchema: unknown; execution: unknown }
      | undefined;
    if (!found) throw new Error(`${tool.definition.name}이 tools/list에 없다`);
    return {
      name: found.name,
      description: found.description,
      inputSchema: found.inputSchema,
      execution: found.execution,
    };
  } finally {
    await harness.close();
  }
}
