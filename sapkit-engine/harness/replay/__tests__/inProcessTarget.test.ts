/**
 * 신 엔진을 **자식 프로세스 없이** 세우는 재생 대상.
 *
 * 이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된 실측 기록이
 * 있다(`HANDOFF.md`). 그래서 재생 쪽 신 엔진은 SDK의 `InMemoryTransport`로
 * 같은 프로세스 안에 세운다 — 번들 채록(C1)만이 프로세스를 띄운다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as z from 'zod';

import { resolveStartup } from '../../../src/server/startup';
import { defineTool } from '../../../src/server/toolDefinition';
import type { SapTool } from '../../../src/server/toolDefinition';
import type { Startup } from '../../../src/server/startup';
import { InProcessTarget } from '../inProcessTarget';
import { replaySequence } from '../replay';
import { envelope, recorded, step } from './helpers';

const created: string[] = [];

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-replay-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 접속을 요구하지 않는 가짜 도구 — 프레임이 도는 것만 본다. */
function echoTool(): SapTool {
  return defineTool(
    {
      name: 'GetFixture',
      description: '[read-only] fixture read tool.',
      inputSchema: { name: z.string() },
      available_in: ['onprem', 'cloud', 'legacy'],
      sets: ['readonly'],
      kind: 'read',
    },
    async (_context, args) => ({ isError: false, content: [{ type: 'text', text: `read:${args.name}` }] }),
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
    async () => ({ isError: true, content: [{ type: 'text', text: 'ERR_X: handler said no' }] }),
  );
}

function inspectionOnlyStartup(): Startup {
  const dir = scratch();
  return resolveStartup({ argv: ['node', 'server', '--exposition=readonly'], env: {}, cwd: dir, homedir: dir });
}

describe('in-process 재생 대상', () => {
  it('자식 프로세스 없이 신 엔진을 세우고 도구를 부른다', async () => {
    const engine = new InProcessTarget({ startup: inspectionOnlyStartup(), tools: [echoTool()] });
    try {
      const handshake = await engine.open();
      expect(handshake.serverName).toBe('sapkit-engine');
      expect(handshake.exposition).toBe('readonly');

      const captured = await engine.callTool('GetFixture', { name: 'ZCL_DEMO' });
      expect(captured.isError).toBe(false);
      expect(JSON.stringify(captured.payload)).toContain('read:ZCL_DEMO');
    } finally {
      await engine.close();
    }
  });

  it('도구 오류를 채록기와 같은 모양으로 돌려준다 — 던지지 않는다', async () => {
    const engine = new InProcessTarget({ startup: inspectionOnlyStartup(), tools: [failingTool()] });
    try {
      await engine.open();
      const captured = await engine.callTool('GetFailure', {});
      expect(captured.isError).toBe(true);
      expect(JSON.stringify(captured.payload)).toContain('ERR_X: handler said no');
    } finally {
      await engine.close();
    }
  });

  it('기동 진단은 stdout이 아니라 결과로 모인다', async () => {
    const engine = new InProcessTarget({ startup: inspectionOnlyStartup(), tools: [echoTool()] });
    try {
      await engine.open();
      expect(engine.diagnostics.join('\n')).toContain('tier=UNKNOWN');
    } finally {
      await engine.close();
    }
  });

  it('닫으면 다시 부를 수 없다', async () => {
    const engine = new InProcessTarget({ startup: inspectionOnlyStartup(), tools: [echoTool()] });
    await engine.open();
    await engine.close();

    await expect(engine.callTool('GetFixture', { name: 'X' })).rejects.toThrow();
  });

  it('재생 러너에 그대로 물린다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'GetFixture', args: { name: 'ZCL_DEMO' }, response: envelope('read:ZCL_DEMO') }),
    ]);
    const engine = new InProcessTarget({ startup: inspectionOnlyStartup(), tools: [echoTool()] });
    const result = await replaySequence(fixture, engine);

    expect(result.verdict).toBe('pass');
    expect(result.actualEngine.name).toBe('sapkit-engine');
  });
});
