/**
 * 뷰 묶음 쓰기 시험의 **발행 계약** 장치.
 *
 * `harness.ts`는 와이어를 붙잡는 장치이고, 여기는 `tools/list` 응답을 채록본과
 * 견주는 자리다. 묶음 공용 `contract.test.ts`에 한 줄 얹는 것으로는 안 된다 —
 * 그 파일 이름은 도구 이름이 아니라서 진척 대장이 증거로 잡지 못하고
 * (`harness/contract-evidence.mjs`의 `findContractTestFiles`), 여러 묶음이 같은
 * 파일에서 충돌한다.
 *
 * 자식 프로세스는 없다 — SDK의 `InMemoryTransport`로 같은 프로세스 안에서 잇는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';

export interface PublishedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly execution: unknown;
}

/**
 * 채록본(`harness/old-surface/m1-tools.json`)의 그 도구 항목.
 *
 * 읽는 키는 **`tools`(전량 선언 186종)**이지 `m1`(19종)이 아니다 — `m1`을 읽으면
 * M1 밖 도구가 자기 선언을 못 찾는다(`ADDING-A-TOOL.md` 부록 B).
 */
export function publishedDeclaration(name: string): PublishedTool {
  const file = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    tools: Record<string, PublishedTool>;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}

/** 도구 하나만 실은 서버를 세워 `tools/list`에서 그 선언을 받아 온다. */
export async function publish(tool: SapTool): Promise<PublishedTool> {
  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/entry.js', '--exposition=readonly,high'],
    env: {},
    cwd: process.cwd(),
    homedir: process.cwd(),
  });
  // 무프로파일 기동의 배포 축은 cloud다. onprem 전용 도구까지 보려면 도구가
  // 선언한 축 중 하나로 맞춘다.
  const systemType = tool.definition.available_in.includes('cloud') ? 'cloud' : 'onprem';
  const core = createServerCore({
    startup: { ...startup, profile: { ...startup.profile, systemType } },
    tools: [tool],
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'view-contract-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    if (listed.tools.length !== 1) {
      throw new Error(`도구 하나만 떠야 한다 (실제 ${listed.tools.length}종)`);
    }
    const published = listed.tools[0] as unknown as PublishedTool;
    return {
      name: published.name,
      description: published.description,
      inputSchema: published.inputSchema,
      execution: published.execution,
    };
  } finally {
    await client.close();
    await core.server.close();
  }
}
