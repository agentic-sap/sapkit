/**
 * class 묶음 쓰기 도구의 **발행 계약** 대조 장치.
 *
 * `harness.ts`는 와이어를 붙잡는 장치라 서버 코어를 세우지 않는다. 발행 선언을
 * 견주려면 실제로 `tools/list`를 주고받아야 하므로, 그 한 가지만 하는 작은
 * 장치를 따로 둔다. 자식 프로세스는 없다 — SDK의 `InMemoryTransport`로 같은
 * 프로세스 안에서 잇는다.
 *
 * 읽는 채록본 키는 **`tools`(전량 선언 186종)**이지 `m1`(19종)이 아니다.
 * `m1`을 읽으면 M1 밖 도구가 자기 선언을 못 찾아 지을 수가 없다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';

export interface PublishedDeclaration {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly execution: unknown;
}

export function publishedDeclaration(name: string): PublishedDeclaration {
  const file = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    tools: Record<string, PublishedDeclaration>;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}

/** 도구 하나만 실은 서버를 세워 그 발행 선언을 받아 온다. */
export async function publish(tool: SapTool): Promise<PublishedDeclaration> {
  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/entry.js', '--exposition=readonly,high'],
    env: {},
    cwd: process.cwd(),
    homedir: process.cwd(),
  });
  // 무프로파일 기동의 배포 축은 cloud다. onprem 전용 도구까지 보려면 노출
  // 필터를 통과시켜야 하므로 도구가 선언한 축 중 하나로 맞춘다.
  const systemType = tool.definition.available_in.includes('cloud') ? 'cloud' : 'onprem';
  const core = createServerCore({
    startup: { ...startup, profile: { ...startup.profile, systemType } },
    tools: [tool],
    stderr: () => {},
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'class-publication-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const listed = await client.listTools();
    if (listed.tools.length !== 1) {
      throw new Error(`도구 하나만 실었는데 ${listed.tools.length}종이 발행됐다`);
    }
    const published = listed.tools[0] as unknown as Record<string, unknown>;
    return {
      name: published.name as string,
      description: published.description as string,
      inputSchema: published.inputSchema,
      execution: published.execution,
    };
  } finally {
    await client.close();
    await core.server.close();
  }
}
