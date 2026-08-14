/**
 * behavior-definition · behavior-implementation 두 묶음의 쓰기 도구 네 종이
 * 함께 쓰는 시험 조각.
 *
 * `harness.ts`는 SAP 쪽만 끊은 실 접속 왕복을 다루고, 여기에는 **발행 계약**을
 * 보는 조각과 env 주입만 둔다. 묶음 안에 두는 이유는 `contract.test.ts`가 여러
 * 묶음이 동시에 고치는 공유 파일이기 때문이다(interface 묶음의 같은 판단).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool, ToolContext } from '../../../server';
import type { WriteHarness } from './harness';

interface CapturedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly execution?: unknown;
}

/**
 * 채록본의 **전량 선언 186종**(`tools`)에서 그 도구 항목을 꺼낸다.
 * `m1`(19종)이 아니다 — 그쪽을 읽으면 M1 밖 도구를 지을 수 없다.
 */
export function capturedTool(name: string): CapturedTool {
  const file = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    tools: Record<string, CapturedTool>;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}

/** 도구 하나만 실은 서버를 세워 실제 `tools/list` 항목을 받아 온다. */
export async function publish(tool: SapTool): Promise<Record<string, unknown>> {
  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/entry.js', '--exposition=readonly,high'],
    env: {},
    cwd: process.cwd(),
    homedir: process.cwd(),
  });
  const systemType = tool.definition.available_in.includes('cloud') ? 'cloud' : 'onprem';
  const core = createServerCore({
    startup: { ...startup, profile: { ...startup.profile, systemType } },
    tools: [tool],
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'behavior-contract-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    const found = listed.tools.find((entry) => entry.name === tool.definition.name);
    if (!found) throw new Error(`${tool.definition.name}이 tools/list에 없다`);
    return found as unknown as Record<string, unknown>;
  } finally {
    await client.close();
    await core.server.close();
  }
}

/** 발행 선언이 채록본과 글자 그대로 같은지 견준다. */
export async function expectPublishedDeclaration(tool: SapTool, name: string): Promise<void> {
  const captured = capturedTool(name);
  const published = await publish(tool);
  expect(published).toEqual({
    name: captured.name,
    description: captured.description,
    inputSchema: { ...captured.inputSchema, $schema: 'http://json-schema.org/draft-07/schema#' },
    execution: captured.execution,
  });
}

/** 생성 페이로드의 소유자 속성(D98)을 보려면 env가 있는 컨텍스트가 필요하다. */
export function withEnv(harness: WriteHarness, env: Record<string, string>): ToolContext {
  return { ...harness.context, env };
}
