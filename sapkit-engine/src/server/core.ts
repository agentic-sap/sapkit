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
import { SERVER_CONTROL_TOOLS, type ExposableTool, selectExposedTools } from '../safety';
import { TOOL_REGISTRY } from '../tools/registry';
import { type GateDenyCode, evaluateToolCall } from './gates';
import { ProfileSession } from './session';
import type { Startup } from './startup';
import {
  NOOP_LOGGER,
  type SapTool,
  type SapToolDefinition,
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
  /** 접속 계층 교체점(시험·기록/재생용). `session`을 주면 그쪽이 이미 갖는다. */
  readonly connectionFactory?: (config: ConnectionConfig) => AdtClient;
  /**
   * 여러 코어가 **상태를 나눠 가질 때** 주입한다.
   *
   * HTTP·SSE 전송은 요청·스트림마다 코어를 새로 만든다(`./transport/http.ts:112`
   * · `sse.ts:117`). 세션을 주지 않으면 코어마다 자기 접속과 자기 프로파일
   * 상태를 갖게 되어, 한 요청에서 부른 `ReloadProfile`이 다른 요청의 게이트에
   * 닿지 않는다 — 그것이 곧 "도구는 PRD라 답했는데 게이트는 DEV로 통과시키는"
   * 과통과다. `./bootstrap`이 세션 하나를 지어 모든 코어에 물린다.
   *
   * 주면 `startup`은 노출 판정과 기동 진단에만 쓰이고, 게이트·도구 컨텍스트는
   * 세션의 **지금** 상태를 본다. 둘은 같은 `Startup`에서 시작해야 한다.
   */
  readonly session?: ProfileSession;
  readonly logger?: ToolLogger;
  /** 감사·진단 출력 통로. 기본은 프로세스 stderr. */
  readonly stderr?: (line: string) => void;
  readonly name?: string;
  readonly version?: string;
}

export interface ServerCore {
  readonly server: McpServer;
  /** **지금** 유효한 기동 상태. 재적재가 이것을 갈아 끼운다. */
  readonly startup: Startup;
  /** 가변 상태의 주인. 재적재와 접속 캐시가 여기 있다. */
  readonly session: ProfileSession;
  /**
   * 실제로 `tools/list`에 오른 이름들.
   *
   * **재적재로 바뀌지 않는다** — 등록은 전송에 붙기 전에 끝난다. 재적재가 배포
   * 축이 다른 프로파일을 물어 오면 `ReloadProfile`이 `restartRequired`로 그
   * 사실을 보고한다.
   */
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

/**
 * 재적재 훅을 받을 자격이 있는 도구인가.
 *
 * 판정을 `src/safety/tier.ts`의 `SERVER_CONTROL_TOOLS`에 맡긴다 — **tier 게이트를
 * 면제받는 이름 목록과 같은 목록**이다. 등급을 건너뛰는 이름과 등급을 바꿀 수
 * 있는 이름이 갈라져서는 안 되고, 그 모듈이 이미 적어 둔 이유(선언한 분류만으로는
 * 새 우회를 만들 수 없다)가 여기에도 그대로 적용된다. `kind`를 함께 보는 것은
 * 같은 이름을 다른 분류로 등록해 두 판정을 어긋나게 만들지 못하게 하려는 것이다.
 */
function mayReload(definition: SapToolDefinition): boolean {
  return definition.kind === 'server-control' && SERVER_CONTROL_TOOLS.has(definition.name);
}

/**
 * 도구가 받는 컨텍스트 한 벌.
 *
 * `profile`·`env`가 **게터**인 것이 요점이다. 재적재가 세션의 상태를 갈아 끼우면
 * 도구가 다음에 읽을 때 새 값이 나온다 — 값으로 복사해 두면 그 순간 기동 시점에
 * 고정된다. 같은 이유로 이 객체를 스프레드(`{...context}`)로 베끼면 안 된다.
 */
function contextFor(
  session: ProfileSession,
  logger: ToolLogger,
  allowReload: boolean,
  stderr: (line: string) => void,
): ToolContext {
  return {
    getConnection: () => session.getConnection(),
    get profile() {
      return session.startup.profile;
    },
    logger,
    get env() {
      return session.startup.env;
    },
    reloadProfile: () => {
      if (!allowReload) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `ERR_RELOAD_FORBIDDEN: profile reload is reserved for ${[...SERVER_CONTROL_TOOLS].join(
            ', ',
          )}; this tool is not one of them.`,
        );
      }

      // 재적재는 **런타임에 tier를 바꿀 수 있는 유일한 통로**다. 도구 로거는
      // 운영 경로에서 기본이 NOOP이라 그쪽에만 남기면 아무 데도 안 남는다.
      // 거부 판정이 감사 줄을 남기는 것과 같은 이유로(`decision.audit`) 여기도
      // stderr에 남긴다 — 가장 안전 민감한 상태 변화가 서버 감사 채널에서
      // 사라지지 않게.
      const before = session.startup.profile;
      const result = session.reload();
      const after = session.startup.profile;
      if (
        before.tier !== after.tier ||
        before.connection?.baseUrl !== after.connection?.baseUrl ||
        result.sealed !== null
      ) {
        stderr(
          `AUDIT: profile reload — tier ${before.tier} → ${after.tier} · ` +
            `connection ${before.connection?.baseUrl ?? 'none'} → ${after.connection?.baseUrl ?? 'none'}` +
            `${result.sealed === null ? '' : ` · sealed: ${result.sealed}`}`,
        );
      }
      return result;
    },
  };
}

export function createServerCore(options: ServerCoreOptions): ServerCore {
  const { startup } = options;
  const stderr = options.stderr ?? defaultStderr;
  const logger = options.logger ?? NOOP_LOGGER;
  const tools = options.tools ?? TOOL_REGISTRY;

  for (const line of startup.diagnostics) stderr(line);

  // 접속과 프로파일 상태의 주인. 접속은 여전히 게으르므로 게이트에 막힌 호출은
  // 접속을 얻지 않는다 — GAP-1 재발 방지의 실체는 그대로다.
  const session =
    options.session ??
    new ProfileSession(
      startup,
      options.connectionFactory ?? ((conf: ConnectionConfig) => new AdtClient(conf)),
    );

  const context = contextFor(session, logger, false, stderr);
  const reloadingContext = contextFor(session, logger, true, stderr);

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
    const toolContext = mayReload(definition) ? reloadingContext : context;
    server.registerTool(
      definition.name,
      { description: definition.description, inputSchema: definition.inputSchema },
      async (rawArgs: unknown) => {
        const args = (rawArgs ?? {}) as Record<string, unknown>;

        // 게이트가 보는 tier·blocklist는 **호출마다 세션에서 다시 읽는다.**
        // `startup`을 여기서 읽으면 재적재가 무슨 값을 물어 오든 게이트는 기동
        // 시점의 값으로 계속 판정한다 — 그것이 이 판이 막으려는 과통과다.
        const live = session.startup;
        const decision = evaluateToolCall(
          { name: definition.name, kind: definition.kind },
          args,
          { tier: live.profile.tier, blocklist: live.blocklist },
        );
        // 감사 문구는 판정과 무관하게 남는다. 거부와 함께 삼키면 우회가
        // 숨겨진다(`safety/rowData.ts`의 deny 갈래 주석 참조).
        for (const line of decision.audit) stderr(line);
        if (decision.kind === 'deny') {
          throw new McpError(errorCodeFor(decision.code), decision.message);
        }

        const result = await handler(toolContext, args);
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

  const exposedToolNames = exposed.map((candidate) => candidate.name);
  return {
    server,
    // 게터다 — 재적재 뒤에는 **새 상태**가 나와야 한다.
    get startup() {
      return session.startup;
    },
    session,
    exposedToolNames,
  };
}
