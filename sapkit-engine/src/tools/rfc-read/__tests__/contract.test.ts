/**
 * 발행 계약 대조 — 신 엔진의 `tools/list`가 구 번들의 채록본과 같은가.
 *
 * 정본은 `harness/old-surface/m1-tools.json`이다(구 번들이 실제로 발행한 선언
 * 그대로 채록한 것). 이름·설명·입력 스키마가 한 글자라도 다르면 대화형 트랙의
 * 프롬프트·절차가 가리키는 도구가 달라진다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';
import {
  argvOf,
  cleanupTempDirs,
  tempDir,
  writeEnvFile,
} from '../../../server/__tests__/fixtures';
import { getStructure } from '../getStructure';
import { getTable } from '../getTable';

interface CapturedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

const CAPTURE_PATH = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');

function captured(name: string): CapturedTool {
  const raw = JSON.parse(fs.readFileSync(CAPTURE_PATH, 'utf8')) as {
    m1: Record<string, CapturedTool>;
  };
  const entry = raw.m1[name];
  if (!entry) throw new Error(`채록본에 ${name}이 없다`);
  return entry;
}

async function publishedTools(tools: SapTool[]) {
  const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), { SAP_TIER: 'DEV' });
  const startup = resolveStartup({
    argv: argvOf('--exposition=readonly,high'),
    env: { MCP_ENV_PATH: envPath },
    cwd: tempDir(),
    homedir: tempDir(),
  });
  const core = createServerCore({ startup, tools, stderr: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'contract-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  await client.close();
  await core.server.close();
  return listed.tools;
}

afterEach(() => {
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it.each([
    ['GetTable', getTable],
    ['GetStructure', getStructure],
  ] as const)('%s의 선언이 채록본과 같다', async (name, tool) => {
    const listed = await publishedTools([tool as SapTool]);
    const published = listed.find((entry) => entry.name === name);
    const expected = captured(name);

    expect(published).toBeDefined();
    expect(published?.description).toBe(expected.description);
    expect(published?.inputSchema).toEqual(expected.inputSchema);
  });

  it('두 도구는 high 표면에만 오른다 (readonly만이면 목록에 없다)', async () => {
    const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--exposition=readonly'),
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    const core = createServerCore({
      startup,
      tools: [getTable, getStructure],
      stderr: () => {},
    });
    expect(core.exposedToolNames).toEqual([]);
  });

  it('legacy 배포 축에는 오르지 않는다 (available_in은 onprem·cloud뿐)', async () => {
    const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
      SAP_TIER: 'DEV',
      SAP_SYSTEM_TYPE: 'legacy',
    });
    const startup = resolveStartup({
      argv: argvOf('--exposition=readonly,high'),
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    const core = createServerCore({
      startup,
      tools: [getTable, getStructure],
      stderr: () => {},
    });
    expect(core.exposedToolNames).toEqual([]);
  });

  it('두 도구 모두 read 분류다 — 게이트가 write로 오분류하지 않는다', () => {
    expect(getTable.definition.kind).toBe('read');
    expect(getStructure.definition.kind).toBe('read');
    expect(getTable.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getStructure.definition.available_in).toEqual(['onprem', 'cloud']);
  });
});
