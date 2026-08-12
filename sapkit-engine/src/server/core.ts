/**
 * 서버 코어 — 등록된 도구를 MCP 규약 위에 올린다.
 *
 * 규약 계층(JSON-RPC · initialize · tools/list · tools/call)은 공식
 * `@modelcontextprotocol/sdk`를 **그대로** 쓴다(결정 기록 D-079 ③의 명시 예외).
 * 손으로 다시 짜지 않는 대신, 그 위의 조립은 전부 자체 저작이다:
 *
 *  - 어떤 도구가 `tools/list`에 오르는가 → `selectExposedTools`
 *  - 호출이 핸들러에 닿기 전에 무엇을 지나는가 → `evaluateToolCall`
 *  - 접속은 언제 생기는가 → 핸들러가 `ctx.getConnection()`을 부를 때, 즉
 *    **게이트를 통과한 뒤에만**
 *
 * 노출 필터링을 "등록하지 않는 것"으로 구현하는 것은 구 엔진과 같다
 * (`BaseMcpServer.ts:478-494` — 배포 축이 맞지 않으면 `continue`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { AdtClient } from '../adt';
import type { ConnectionConfig } from '../contracts';
import { type ExposableTool, selectExposedTools } from '../safety';
import { TOOL_REGISTRY } from '../tools/registry';
import { type GateDenyCode, evaluateToolCall } from './gates';
import type { Startup } from './startup';
import {
  NOOP_LOGGER,
  type SapTool,
  type ToolContext,
  type ToolLogger,
  type ToolResult,
  toExposableTool,
} from './toolDefinition';

export const SERVER_NAME = 'sapkit-engine';

export interface ServerCoreOptions {
  readonly startup: Startup;
  /** 기본값은 `src/tools/registry.ts`의 등록 목록. */
  readonly tools?: readonly SapTool[];
  /** 접속 계층 교체점(시험·기록/재생용). */
  readonly connectionFactory?: (config: ConnectionConfig) => AdtClient;
  readonly logger?: ToolLogger;
  /** 감사·진단 출력 통로. 기본은 프로세스 stderr. */
  readonly stderr?: (line: string) => void;
  readonly name?: string;
  readonly version?: string;
}

export interface ServerCore {
  readonly server: McpServer;
  readonly startup: Startup;
  /** 실제로 `tools/list`에 오른 이름들. */
  readonly exposedToolNames: readonly string[];
}

/** 노출 판정에 도구 본체를 태워 나르기 위한 최소 포장. */
interface ExposureCandidate extends ExposableTool {
  readonly tool: SapTool;
}

/** 거부 코드를 구 엔진이 쓰던 JSON-RPC 오류 코드로 되돌린다. */
function errorCodeFor(code: GateDenyCode): ErrorCode {
  switch (code) {
    // 구 `readonlyGuard.ts:140-144`.
    case 'ERR_READONLY_TIER':
      return ErrorCode.MethodNotFound;
    // 구 `handleGetTableContents.ts:39` — 인자가 없으면 InvalidParams.
    case 'ERR_ROWDATA_ARGS':
      return ErrorCode.InvalidParams;
    // 구 `handleGetTableContents.ts:53,59` — blocklist 거부는 InvalidRequest.
    default:
      return ErrorCode.InvalidRequest;
  }
}

/**
 * 엔진 판을 찾는다. `dist/src/server/`에서도 `src/server/`에서도 같은
 * `package.json`에 닿도록 위로 훑는다. 못 찾으면 `0.0.0` — 판 번호를 지어내지
 * 않는다.
 */
function readEngineVersion(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
      const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
      if (parsed.name === SERVER_NAME && typeof parsed.version === 'string') return parsed.version;
    } catch {
      // 이 층에는 없다 — 위로 계속.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

function defaultStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

function textOf(result: ToolResult): string {
  return result.content.map((item) => item.text).join('\n') || 'Unknown error';
}

export function createServerCore(options: ServerCoreOptions): ServerCore {
  const { startup } = options;
  const stderr = options.stderr ?? defaultStderr;
  const logger = options.logger ?? NOOP_LOGGER;
  const tools = options.tools ?? TOOL_REGISTRY;

  for (const line of startup.diagnostics) stderr(line);

  // 접속은 게으르다. 게이트에 막힌 호출은 이 함수에 닿지 않으므로 접속도
  // 만들어지지 않는다 — 그것이 GAP-1 재발 방지의 실체다.
  let client: AdtClient | null = null;
  const getConnection = async (): Promise<AdtClient> => {
    if (client) return client;
    const config = startup.profile.connection;
    if (!config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured — the server is running inspection-only. ' +
          (startup.profile.diagnostics.join(' ') ||
            'Point MCP_ENV_PATH at a profile sap.env, pass --env-path=<file>, or set an active profile.'),
      );
    }
    const factory = options.connectionFactory ?? ((conf: ConnectionConfig) => new AdtClient(conf));
    client = factory(config);
    return client;
  };

  const context: ToolContext = {
    getConnection,
    profile: startup.profile,
    logger,
    env: startup.env,
  };

  const server = new McpServer({
    name: options.name ?? SERVER_NAME,
    version: options.version ?? readEngineVersion(),
  });

  const candidates: ExposureCandidate[] = tools.map((tool) => ({
    ...toExposableTool(tool.definition),
    tool,
  }));

  const exposed = selectExposedTools(candidates, {
    sets: startup.sets,
    systemType: startup.profile.systemType,
  });

  for (const candidate of exposed) {
    const { definition, handler } = candidate.tool;
    server.registerTool(
      definition.name,
      { description: definition.description, inputSchema: definition.inputSchema },
      async (rawArgs: unknown) => {
        const args = (rawArgs ?? {}) as Record<string, unknown>;

        const decision = evaluateToolCall(
          { name: definition.name, kind: definition.kind },
          args,
          { tier: startup.profile.tier, blocklist: startup.blocklist },
        );
        // 감사 문구는 판정과 무관하게 남는다. 거부와 함께 삼키면 우회가
        // 숨겨진다(`safety/rowData.ts`의 deny 갈래 주석 참조).
        for (const line of decision.audit) stderr(line);
        if (decision.kind === 'deny') {
          throw new McpError(errorCodeFor(decision.code), decision.message);
        }

        const result = await handler(context, args);
        // 구 `BaseMcpServer.ts:428-444`와 같은 처리 — isError는 프로토콜 오류로
        // 올린다.
        if (result.isError) throw new McpError(ErrorCode.InternalError, textOf(result));
        return { content: result.content.map((item) => ({ type: 'text' as const, text: item.text })) };
      },
    );
  }

  // SDK는 **첫 `registerTool` 호출에서 비로소** `tools/list`·`tools/call` 핸들러를
  // 단다(`server/mcp.js`의 `setToolRequestHandlers`). 노출 결과가 비면 그 자리가
  // 통째로 없어져 `tools/list`가 -32601로 답한다 — 무프로파일·좁은 표면·빈
  // 레지스트리 전부가 "서버가 고장 났다"로 보이게 된다. 하나 달았다 떼서
  // 핸들러만 남긴다. 이 동작은 core.test.ts의 "빈 레지스트리" 시험이 붙잡는다.
  if (exposed.length === 0) {
    server
      .registerTool(
        '__sapkit_bootstrap__',
        { description: 'internal placeholder; removed before the transport is connected.' },
        async () => ({ content: [] }),
      )
      .remove();
  }

  return {
    server,
    startup,
    exposedToolNames: exposed.map((candidate) => candidate.name),
  };
}
