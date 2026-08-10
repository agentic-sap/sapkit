/**
 * 발행 계약 대조 — 쓰기·활성 7종.
 *
 * 정본은 `harness/old-surface/m1-tools.json`이다(구 번들이 `tools/list`로
 * 실제 내보내는 선언의 오프라인 채록). 여기서는 **실제 서버 코어를 띄워**
 * `tools/list`를 주고받고, 그 응답 객체를 채록본과 **통째로 대조**한다.
 * 이름·설명 문구·`inputSchema`(필수/선택·default·type·description)·`execution`
 * 전부가 대상이다.
 *
 * 자식 프로세스는 없다 — SDK의 `InMemoryTransport`로 같은 프로세스 안에서 잇는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';
import {
  activateObjects,
  createInclude,
  createProgram,
  updateClass,
  updateInclude,
  updateProgram,
  updateSourceByPatch,
} from '../index';

interface CapturedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly execution?: unknown;
}

interface CapturedSurface {
  readonly m1: Record<string, CapturedTool>;
  readonly connectedOnly: string[];
}

const OLD_SURFACE = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json'),
    'utf8',
  ),
) as CapturedSurface;

const CAPTURED = OLD_SURFACE.m1;

const TOOLS: ReadonlyArray<readonly [string, SapTool]> = [
  ['CreateProgram', createProgram],
  ['CreateInclude', createInclude],
  ['UpdateProgram', updateProgram],
  ['UpdateInclude', updateInclude],
  ['UpdateClass', updateClass],
  ['UpdateSourceByPatch', updateSourceByPatch],
  ['ActivateObjects', activateObjects],
];

async function publish(tool: SapTool): Promise<Record<string, unknown>> {
  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/entry.js', '--exposition=readonly,high'],
    env: {},
    cwd: process.cwd(),
    homedir: process.cwd(),
  });
  // 무프로파일 기동의 배포 축은 cloud다. onprem 전용 도구까지 한 번에 보려면
  // 노출 필터를 통과시켜야 하므로, 도구가 선언한 축 중 하나로 맞춘다.
  const systemType = tool.definition.available_in.includes('cloud') ? 'cloud' : 'onprem';
  const core = createServerCore({
    startup: { ...startup, profile: { ...startup.profile, systemType } },
    tools: [tool],
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'contract-test', version: '0.0.0' });
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

describe('발행 계약 (m1-tools.json 대조)', () => {
  it.each(TOOLS)('%s의 발행 선언이 채록본과 글자 그대로 같다', async (name, tool) => {
    const captured = CAPTURED[name];
    expect(captured).toBeDefined();

    const published = await publish(tool);
    const expected: Record<string, unknown> = {
      name: captured!.name,
      description: captured!.description,
      inputSchema: {
        ...(captured!.inputSchema as Record<string, unknown>),
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
      execution: captured!.execution,
    };
    expect(published).toEqual(expected);
  });

  it.each(TOOLS)('%s는 mutation으로 선언된다 (tier 게이트의 판단 축)', (_name, tool) => {
    expect(tool.definition.kind).toBe('mutation');
    expect(tool.definition.sets).toEqual(['high']);
  });

  it.each([
    ['CreateProgram', createProgram, ['onprem', 'legacy']],
    ['CreateInclude', createInclude, ['onprem', 'legacy']],
    ['UpdateProgram', updateProgram, ['onprem', 'legacy']],
    ['UpdateInclude', updateInclude, ['onprem', 'legacy']],
    ['UpdateClass', updateClass, ['onprem', 'cloud', 'legacy']],
    ['UpdateSourceByPatch', updateSourceByPatch, ['onprem', 'cloud', 'legacy']],
    ['ActivateObjects', activateObjects, ['onprem', 'cloud', 'legacy']],
  ] as const)('%s의 available_in은 구 선언 그대로다', (_name, tool, expected) => {
    expect(tool.definition.available_in).toEqual(expected);
  });

  it('연결 전용 4종은 cloud 축에 없다 (채록본 connectedOnly와 일치)', () => {
    for (const tool of [createProgram, createInclude, updateProgram, updateInclude]) {
      expect(OLD_SURFACE.connectedOnly).toContain(tool.definition.name);
      expect(tool.definition.available_in).not.toContain('cloud');
    }
  });
});
