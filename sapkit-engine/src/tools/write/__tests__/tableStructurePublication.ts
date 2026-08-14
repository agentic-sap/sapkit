/**
 * 표·구조체 쓰기 4종의 **발행 계약 대조** 장치.
 *
 * 이 묶음의 도구는 `contract.test.ts`(M1 쓰기 7종의 고정 목록)에 얹지 않는다 —
 * 그 파일은 여러 묶음이 동시에 손대면 충돌하는 자리이고, 절차서가 요구하는 것은
 * **도구 이름의 시험 파일**이 자기 계약을 붙잡는 것이다. 그래서 서버를 세워
 * `tools/list`를 받아 채록본과 견주는 일을 여기 한 자리에 둔다.
 *
 * 자식 프로세스는 없다 — SDK의 `InMemoryTransport`로 같은 프로세스 안에서 잇는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';
import { argvOf, tempDir, writeEnvFile } from '../../../server/__tests__/fixtures';

const M1_TOOLS = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');

/** 채록본의 **전량 선언 186종**에서 한 항목. `m1`(19종)이 아니다. */
export function publishedDeclaration(name: string): {
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
} {
  const parsed = JSON.parse(fs.readFileSync(M1_TOOLS, 'utf8')) as {
    tools: Record<string, { name: string; description: string; inputSchema: unknown; execution: unknown }>;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}

/** 도구 하나만 실은 서버를 세워 그 도구의 발행 선언을 돌려준다. */
export async function publishedSurfaceOf(tool: SapTool): Promise<{
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
}> {
  const dir = tempDir();
  const envPath = writeEnvFile(path.join(dir, 'sap.env'), {
    SAP_TIER: 'DEV',
    SAP_SYSTEM_TYPE: 'onprem',
  });
  const startup = resolveStartup({
    argv: argvOf('--exposition=readonly,high'),
    env: { MCP_ENV_PATH: envPath },
    cwd: dir,
    homedir: dir,
  });
  const core = createServerCore({
    startup,
    tools: [tool],
    connectionFactory: () => {
      throw new Error('발행 계약 대조는 접속하지 않는다');
    },
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'ddic-publication', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    if (listed.tools.length !== 1) {
      throw new Error(`도구 하나만 떠야 한다 — 실제 ${listed.tools.length}종`);
    }
    const published = listed.tools[0] as unknown as {
      name: string;
      description: string;
      inputSchema: unknown;
      execution: unknown;
    };
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
