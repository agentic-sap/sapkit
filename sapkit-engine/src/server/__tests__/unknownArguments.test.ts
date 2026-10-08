/**
 * 모르는 인자 거절 (D-152 · 장부 D155) — `../unknownArguments.ts`.
 *
 * 실사용 관측 둘(2026-09-18)이 이 파일의 출발점이다. SDK가 스키마에 없는 인자를
 * 조용히 지워서 ① `GetTableContents`의 `where_clause`가 사라진 채 필터 없는 행이
 * 정상 응답으로 왔고 ② `CreateBehaviorDefinition`의 `source`가 사라진 채 템플릿이
 * 생성·활성화됐다.
 *
 * 여기서 못박는 것:
 *  - **등록된 도구 전부**가 모르는 인자를 거절하고, 거절된 호출은 접속을 **한 번도**
 *    얻지 않는다(실 규약 — `InMemoryTransport` + SDK `Client`).
 *  - 거절 응답의 모양이 SDK의 검증 오류와 같다(`createToolError` 경로).
 *  - 발행되는 `tools/list`에 `additionalProperties`가 실리지 않는다.
 *  - 덧인자(`harness/old-surface/amendments.json`의 `inputSchema` 칸 · D-147)는 거절되지 않는다.
 *  - **SDK 내부에 기대는 자리**(`McpServer.validateToolInput`)가 바뀌면 이 파일이 빨개진다 —
 *    메서드가 사라지면 설치가 던지고, 인자 순서가 바뀌면 거절(fail-closed)하고, SDK가 그
 *    메서드를 더 이상 부르지 않으면 아래 실 규약 시험이 모르는 인자가 통과하는 것을 본다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import type { DeploymentType } from '../../contracts';
import { TOOL_REGISTRY } from '../../tools/registry';
import { createServerCore } from '../core';
import { resolveStartup } from '../startup';
import {
  UNKNOWN_ARGUMENT_REJECTION,
  installUnknownArgumentGuard,
  unknownArgumentMessage,
  unknownArgumentNames,
} from '../unknownArguments';
import { argvOf, cleanupTempDirs, fakeConnectionFactory, tempDir, writeEnvFile } from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

// ── 하네스 — 실제 등록점(TOOL_REGISTRY) 그대로 ─────────────────────────────────

/** 모든 핸들러 집합. 배포 축 셋을 돌면 등록점 전부가 한 번 이상 목록에 오른다. */
const ALL_SETS = '--exposition=readonly,high,compact,low,system,search';
const AXES: readonly DeploymentType[] = ['onprem', 'cloud', 'legacy'];

interface Harness {
  readonly client: Client;
  readonly connections: { calls: unknown[] };
  readonly stderr: string[];
  close(): Promise<void>;
}

async function harnessFor(options: {
  readonly systemType?: DeploymentType;
  readonly tier?: string;
}): Promise<Harness> {
  const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
    SAP_TIER: options.tier ?? 'DEV',
    SAP_SYSTEM_TYPE: options.systemType ?? 'onprem',
  });
  const startup = resolveStartup({
    argv: argvOf(ALL_SETS),
    env: { MCP_ENV_PATH: envPath },
    cwd: tempDir(),
    homedir: tempDir(),
  });
  const stderr: string[] = [];
  const connection = fakeConnectionFactory();
  const core = createServerCore({
    startup,
    connectionFactory: connection.factory,
    stderr: (line) => stderr.push(line),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'unknown-args-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    connections: connection,
    stderr,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

interface CallOutcome {
  readonly raw: Record<string, unknown>;
  readonly isError: boolean;
  readonly text: string;
}

async function call(harness: Harness, name: string, args: Record<string, unknown>): Promise<CallOutcome> {
  const raw = (await harness.client.callTool({ name, arguments: args })) as Record<string, unknown>;
  const content = (raw.content ?? []) as Array<{ text?: unknown }>;
  return {
    raw,
    isError: raw.isError === true,
    text: content.map((item) => String(item.text ?? '')).join('\n'),
  };
}

function acceptedOf(toolName: string): string[] {
  const tool = TOOL_REGISTRY.find((entry) => entry.definition.name === toolName);
  if (tool === undefined) throw new Error(`등록점에 ${toolName}이 없다`);
  return Object.keys(tool.definition.inputSchema);
}

const PROBE = '__sapkit_unknown_probe__';

// ── 순수 판정 ────────────────────────────────────────────────────────────────

describe('unknownArgumentNames', () => {
  it('받는 목록에 없는 키만, 보낸 순서대로 낸다', () => {
    expect(unknownArgumentNames(['a', 'b'], { b: 1, z: 2, a: 3, y: 4 })).toEqual(['z', 'y']);
  });

  it('모두 아는 키면 비어 있다 — 선택 인자를 빼먹은 것은 이 판정의 일이 아니다', () => {
    expect(unknownArgumentNames(['a', 'b'], { a: 1 })).toEqual([]);
    expect(unknownArgumentNames(['a'], {})).toEqual([]);
  });

  it('프로토타입 이름(constructor·toString·__proto__)이 아는 인자로 새지 않는다', () => {
    const args = JSON.parse('{"constructor":1,"toString":2,"__proto__":3}') as unknown;
    expect(unknownArgumentNames(['a'], args)).toEqual(['constructor', 'toString', '__proto__']);
  });

  it('객체가 아닌 인자는 판정하지 않는다 — SDK 스키마 검증이 그대로 받는다', () => {
    expect(unknownArgumentNames(['a'], undefined)).toEqual([]);
    expect(unknownArgumentNames(['a'], null)).toEqual([]);
    expect(unknownArgumentNames(['a'], ['x'])).toEqual([]);
    expect(unknownArgumentNames(['a'], 'x')).toEqual([]);
  });
});

describe('unknownArgumentMessage', () => {
  it('모르는 인자 · 받는 인자 목록 · 「무시하지 않고 거절」을 모두 말한다', () => {
    const text = unknownArgumentMessage('GetTableContents', ['where_clause'], [
      'table_name',
      'max_rows',
      'acknowledge_risk',
    ]);
    expect(text).toBe(
      "Input validation error: Invalid arguments for tool GetTableContents: unknown argument 'where_clause'. " +
        'GetTableContents accepts only: table_name, max_rows, acknowledge_risk. ' +
        'Unknown arguments are rejected, not ignored — the call was not executed and nothing was sent to SAP. ' +
        'Retry without it, or use a tool whose schema declares the parameter you need.',
    );
  });

  it('여럿이면 복수로, 인자 없는 도구면 그렇다고 말한다', () => {
    const text = unknownArgumentMessage('GetSession', ['a', 'b'], []);
    expect(text).toContain("unknown arguments 'a', 'b'");
    expect(text).toContain('GetSession takes no arguments');
    expect(text).toContain('Retry without them');
    expect(text).toContain(UNKNOWN_ARGUMENT_REJECTION);
  });
});

// ── SDK 이음매 — 바뀌면 빨개져야 한다 ─────────────────────────────────────────

describe('SDK 이음매 (McpServer.validateToolInput)', () => {
  it('설치된 SDK의 McpServer에 그 메서드가 있다 — 없으면 경비가 설 자리가 없다', () => {
    const proto = McpServer.prototype as unknown as { validateToolInput?: unknown };
    expect(typeof proto.validateToolInput).toBe('function');
  });

  it('메서드가 없는 서버에는 설치가 던진다 — 경비 없이 뜨지 않는다', () => {
    expect(() =>
      installUnknownArgumentGuard({} as unknown as McpServer, () => []),
    ).toThrow(/ERR_ARGUMENT_GUARD_SEAM/);
  });

  it('도구 이름으로 인자 목록을 못 찾으면 원 검증으로 넘기지 않고 거절한다 (fail-closed)', async () => {
    const original = jest.fn(async (_tool: unknown, args: unknown) => args);
    const fake = { validateToolInput: original };
    installUnknownArgumentGuard(fake as unknown as McpServer, () => undefined);
    const guarded = fake.validateToolInput as unknown as (
      tool: unknown,
      args: unknown,
      toolName: unknown,
    ) => Promise<unknown>;

    // 인자 순서가 바뀌어 도구 이름 자리에 다른 것이 오는 경우도 같다.
    for (const toolName of ['NoSuchTool', undefined, { name: 'X' }]) {
      const error = await guarded({}, { a: 1 }, toolName).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(ErrorCode.InternalError);
      expect((error as McpError).message).toMatch(/ERR_ARGUMENT_GUARD:/);
    }
    expect(original).not.toHaveBeenCalled();
  });

  it('아는 인자뿐이면 원 검증에 그대로 넘기고 그 결과를 돌려준다', async () => {
    const original = jest.fn(async function (this: unknown, _tool: unknown, args: unknown) {
      return { self: this, args };
    });
    const fake = { validateToolInput: original };
    installUnknownArgumentGuard(fake as unknown as McpServer, () => ['a']);
    const result = (await (fake.validateToolInput as unknown as (
      tool: unknown,
      args: unknown,
      toolName: unknown,
    ) => Promise<unknown>).call(fake, 'TOOL', { a: 1 }, 'T')) as { self: unknown; args: unknown };
    expect(original).toHaveBeenCalledWith('TOOL', { a: 1 }, 'T');
    expect(result.self).toBe(fake);
    expect(result.args).toEqual({ a: 1 });
  });
});

// ── 실 규약 — 등록점 전부 ────────────────────────────────────────────────────

describe('등록된 도구 전부가 모르는 인자를 거절한다 (실 규약)', () => {
  it('배포 축 셋을 돌아 등록점의 모든 도구를 부르고, 전부 접속 0회로 거절된다', async () => {
    const exercised = new Set<string>();
    for (const systemType of AXES) {
      const harness = await harnessFor({ systemType });
      try {
        const listed = await harness.client.listTools();
        for (const tool of listed.tools) {
          if (exercised.has(tool.name)) continue;
          const outcome = await call(harness, tool.name, { [PROBE]: 'x' });
          const accepted = acceptedOf(tool.name);
          expect({ tool: tool.name, isError: outcome.isError }).toEqual({ tool: tool.name, isError: true });
          expect(outcome.text).toBe(
            `MCP error ${ErrorCode.InvalidParams}: ${unknownArgumentMessage(tool.name, [PROBE], accepted)}`,
          );
          exercised.add(tool.name);
        }
        // 거절은 핸들러 앞이다 — 접속 공장은 한 번도 불리지 않는다.
        expect(harness.connections.calls).toHaveLength(0);
      } finally {
        await harness.close();
      }
    }
    // 「모든 도구」를 세지 않고 등록점과 견준다 — 축 셋이 덮지 못한 도구가 생기면 빨개진다.
    expect([...exercised].sort()).toEqual(TOOL_REGISTRY.map((tool) => tool.definition.name).sort());
  });

  it('발행되는 tools/list에는 additionalProperties가 한 곳도 없다 (발행 스키마 무변경)', async () => {
    for (const systemType of AXES) {
      const harness = await harnessFor({ systemType });
      try {
        const listed = await harness.client.listTools();
        expect(listed.tools.length).toBeGreaterThan(0);
        for (const tool of listed.tools) {
          expect({ tool: tool.name, has: JSON.stringify(tool.inputSchema).includes('additionalProperties') }).toEqual({
            tool: tool.name,
            has: false,
          });
        }
      } finally {
        await harness.close();
      }
    }
  });
});

// ── 실사용 관측 둘 ───────────────────────────────────────────────────────────

describe('실사용 관측 (2026-09-18)', () => {
  it('GetTableContents의 where_clause는 버려지지 않고 거절된다 — 행을 읽으러 가지 않는다', async () => {
    const harness = await harnessFor({});
    try {
      const outcome = await call(harness, 'GetTableContents', {
        table_name: 'ZUNIEFIT0030',
        max_rows: 60,
        where_clause: "BUKRS = '1000'",
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toContain("unknown argument 'where_clause'");
      expect(outcome.text).toContain('GetTableContents accepts only: table_name, max_rows, acknowledge_risk');
      expect(outcome.text).toContain(UNKNOWN_ARGUMENT_REJECTION);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('같은 호출에서 where_clause만 빼면 게이트를 지나 핸들러까지 간다 (과수리 역검증)', async () => {
    const harness = await harnessFor({});
    try {
      const outcome = await call(harness, 'GetTableContents', { table_name: 'ZUNIEFIT0030', max_rows: 60 });
      expect(outcome.text).not.toContain(UNKNOWN_ARGUMENT_REJECTION);
      expect(harness.connections.calls).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('CreateBehaviorDefinition의 source는 버려지지 않고 거절된다 — 템플릿을 만들러 가지 않는다', async () => {
    const harness = await harnessFor({});
    try {
      const outcome = await call(harness, 'CreateBehaviorDefinition', {
        name: 'ZR_SAPKIT_PROBE',
        package_name: '$TMP',
        root_entity: 'ZR_SAPKIT_PROBE',
        implementation_type: 'managed',
        source: 'managed implementation in class zbp_r_sapkit_probe unique;',
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toContain("unknown argument 'source'");
      expect(outcome.text).toContain(`CreateBehaviorDefinition accepts only: ${acceptedOf('CreateBehaviorDefinition').join(', ')}`);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });
});

// ── 응답 모양 · 게이트와의 순서 ───────────────────────────────────────────────

describe('응답 모양과 순서', () => {
  it('거절 응답의 모양이 SDK 자신의 검증 오류와 같다 (createToolError 경로)', async () => {
    const harness = await harnessFor({});
    try {
      const ours = await call(harness, 'GetTableContents', { table_name: 'ZFREE', [PROBE]: 1 });
      const sdks = await call(harness, 'GetTableContents', { table_name: 42 });
      expect(sdks.isError).toBe(true);
      expect(sdks.text).toMatch(/^MCP error -32602: Input validation error: Invalid arguments for tool GetTableContents:/);
      expect(ours.text).toMatch(/^MCP error -32602: Input validation error: Invalid arguments for tool GetTableContents:/);
      expect(Object.keys(ours.raw).sort()).toEqual(Object.keys(sdks.raw).sort());
      expect(ours.raw.content).toEqual([{ type: 'text', text: ours.text }]);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('모르는 인자 거절은 tier 게이트 앞이고, 빼고 부르면 tier 게이트가 그대로 막는다', async () => {
    const harness = await harnessFor({ tier: 'PRD' });
    try {
      const args = { class_name: 'ZCL_SAPKIT_PROBE', source_code: 'CLASS zcl_sapkit_probe DEFINITION.' };
      const withUnknown = await call(harness, 'UpdateClass', { ...args, [PROBE]: true });
      expect(withUnknown.text).toContain(UNKNOWN_ARGUMENT_REJECTION);
      const withoutUnknown = await call(harness, 'UpdateClass', args);
      expect(withoutUnknown.isError).toBe(true);
      expect(withoutUnknown.text).toMatch(/ERR_READONLY_TIER/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });
});

// ── 덧인자(D-147)는 아는 인자다 ────────────────────────────────────────────────

describe('덧인자(amendments.json의 inputSchema 칸)는 거절되지 않는다', () => {
  const amendmentsFile = path.join(__dirname, '..', '..', '..', 'harness', 'old-surface', 'amendments.json');
  const { inputSchema: amended = {} } = JSON.parse(fs.readFileSync(amendmentsFile, 'utf8')) as {
    inputSchema?: Record<string, { properties: Record<string, { type?: string; enum?: unknown[] }> }>;
  };
  const rows = Object.entries(amended).flatMap(([tool, entry]) =>
    Object.entries(entry.properties).map(([arg, schema]) => ({ tool, arg, schema })),
  );

  it('덧인자표가 비어 있지 않다 — 비면 아래 시험이 공허하게 초록이다', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map((row) => [row.tool, row.arg, row] as const))(
    '%s.%s는 도구 정의의 inputSchema에 있다',
    (_tool, _arg, row) => {
      expect(acceptedOf(row.tool)).toContain(row.arg);
    },
  );

  it('실 규약으로 덧인자를 보내도 모르는 인자 거절이 나지 않는다', async () => {
    const sample = (schema: { type?: string; enum?: unknown[] }): unknown =>
      Array.isArray(schema.enum) && schema.enum.length > 0
        ? schema.enum[0]
        : schema.type === 'boolean'
          ? true
          : schema.type === 'number' || schema.type === 'integer'
            ? 1
            : 'ZSAPKIT_PROBE';
    const remaining = new Map(rows.map((row) => [`${row.tool}.${row.arg}`, row]));
    for (const systemType of AXES) {
      const harness = await harnessFor({ systemType });
      try {
        const listed = new Set((await harness.client.listTools()).tools.map((tool) => tool.name));
        for (const [key, row] of remaining) {
          if (!listed.has(row.tool)) continue;
          const outcome = await call(harness, row.tool, { [row.arg]: sample(row.schema) });
          expect({ key, rejected: /unknown argument/.test(outcome.text) }).toEqual({ key, rejected: false });
          remaining.delete(key);
        }
      } finally {
        await harness.close();
      }
    }
    // 어느 축에도 안 뜬 덧인자 도구가 있으면 그 행은 시험되지 않은 것이다.
    expect([...remaining.keys()]).toEqual([]);
  });
});
