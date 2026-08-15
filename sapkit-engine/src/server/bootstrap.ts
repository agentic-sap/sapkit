/**
 * 기동 — argv·env를 읽어 코어를 세우고 전송에 붙인다.
 *
 * 부작용이 없는 함수다. `require()` 한 번으로 서버가 뜨는 자리는
 * `./entry`이고, 여기는 그 자리가 부르는 순수한 절차다. 전송을 주입할 수 있게
 * 열어 둔 것은 시험이 자식 프로세스를 띄우지 않기 위해서다.
 *
 * 전송은 셋이다. **기본은 stdio**이고, 네트워크 표면(HTTP·SSE)은
 * `--transport=http|sse`(또는 `MCP_TRANSPORT`)로 **명시할 때만** 열린다 —
 * 판정은 전부 `./transport/config`에 있다.
 *
 * 전송이 무엇이든 **노출 제어와 안전 게이트는 코어 안에 그대로 있다.** 이 파일은
 * 코어를 무엇에 붙일지만 정하고, 게이트를 우회하는 갈래를 만들지 않는다.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { AdtClient } from '../adt';
import type { ConnectionConfig } from '../contracts';
import { type ServerCore, createServerCore } from './core';
import { ProfileSession } from './session';
import { resolveStartup } from './startup';
import type { Startup } from './startup';
import type { SapTool, ToolLogger } from './toolDefinition';
import { openHttpTransport, openSseTransport, resolveTransport } from './transport';

export interface BootstrapOptions {
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly homedir?: string;
  readonly tools?: readonly SapTool[];
  /**
   * 주면 전송 해석을 건너뛰고 이것에 붙는다. 시험이 in-memory 전송을 준다.
   * 해석 자체는 그대로 돌아 진단으로 남는다.
   */
  readonly transport?: Transport;
  readonly stderr?: (line: string) => void;
  readonly logger?: ToolLogger;
  readonly connectionFactory?: (config: ConnectionConfig) => AdtClient;
}

export interface StartedServer {
  readonly core: ServerCore;
  /**
   * stdio·주입 전송일 때의 그 전송. HTTP는 요청마다, SSE는 스트림마다 새로
   * 만들므로 없다.
   */
  readonly transport?: Transport;
  /** 네트워크 전송이 실제로 붙은 주소. stdio면 없다. */
  readonly endpoint?: string;
  /** 열린 것을 전부 닫는다 — 코어와, 있으면 리스너까지. */
  close(): Promise<void>;
}

function defaultStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

/**
 * 기동 진단을 **한 번만** 내보내는 stderr.
 *
 * `createServerCore`는 만들어질 때 `startup.diagnostics`를 그대로 뱉는다. 요청마다
 * 코어를 새로 만드는 HTTP에서 그것을 그냥 흘리면 같은 진단이 요청 수만큼 쌓여
 * 감사 줄이 그 안에 묻힌다. 생성 시점에 동기적으로 나오는 그 줄들만 세어 버리고,
 * 그 뒤의 것(=게이트 감사 줄)은 전부 통과시킨다.
 */
function auditOnly(startup: Startup, stderr: (line: string) => void): (line: string) => void {
  let remaining = startup.diagnostics.length;
  return (line: string): void => {
    if (remaining > 0) {
      remaining -= 1;
      return;
    }
    stderr(line);
  };
}

export async function startFromProcess(
  options: BootstrapOptions = {},
): Promise<StartedServer> {
  const startup = resolveStartup({
    ...(options.argv !== undefined ? { argv: options.argv } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homedir !== undefined ? { homedir: options.homedir } : {}),
  });

  const stderr = options.stderr ?? defaultStderr;

  // **세션 하나를 모든 코어가 나눠 갖는다.**
  //
  // 이유가 둘이다. ⓐ 접속: HTTP는 요청마다 코어를 새로 만들고 코어는 저마다
  // 자기 접속을 게으르게 만든다 — 나누지 않으면 요청 수만큼 로그온이 쌓인다
  // (구도 브로커를 요청 사이에 공유했다:
  // `engine/src/server/StreamableHttpServer.ts:126-173`). ⓑ 프로파일 상태: 한
  // 요청에서 부른 `ReloadProfile`이 다른 요청의 게이트에 닿지 않으면, 도구는
  // 새 tier를 보고했는데 게이트는 낡은 tier로 통과시키는 과통과가 된다.
  const session = new ProfileSession(
    startup,
    options.connectionFactory ?? ((config: ConnectionConfig) => new AdtClient(config)),
  );

  const makeCore = (perRequest: boolean): ServerCore =>
    createServerCore({
      startup,
      ...(options.tools !== undefined ? { tools: options.tools } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
      session,
      stderr: perRequest ? auditOnly(startup, stderr) : stderr,
    });

  // 전송 해석은 **프로세스 env와 argv만** 본다. 프로파일 값을 얹은
  // `startup.env`가 아니다 — 프로파일 파일 한 줄이 포트를 열면 안 된다.
  const argv = options.argv ?? process.argv;
  const resolution = resolveTransport({
    args: argv.slice(2),
    env: options.env ?? process.env,
  });
  for (const line of resolution.diagnostics) stderr(line);

  const core = makeCore(false);

  if (options.transport !== undefined) {
    if (resolution.config.kind !== 'stdio') {
      stderr(
        'TRANSPORT_INJECTED: a transport was injected, so the resolved network transport was ' +
          'not opened. Nothing was bound to a port.',
      );
    }
    await core.server.connect(options.transport);
    return {
      core,
      transport: options.transport,
      close: () => core.server.close(),
    };
  }

  if (resolution.config.kind === 'http') {
    const binding = await openHttpTransport({
      config: resolution.config,
      createCore: () => makeCore(true),
      stderr,
    });
    return {
      core,
      endpoint: binding.endpoint,
      async close(): Promise<void> {
        await binding.close();
        await core.server.close();
      },
    };
  }

  if (resolution.config.kind === 'sse') {
    // HTTP와 같은 모양이다. 다른 것은 코어를 뽑는 단위뿐 — 저쪽은 요청마다,
    // 이쪽은 스트림(세션)마다다.
    const binding = await openSseTransport({
      config: resolution.config,
      createCore: () => makeCore(true),
      stderr,
    });
    return {
      core,
      endpoint: binding.endpoint,
      async close(): Promise<void> {
        await binding.close();
        await core.server.close();
      },
    };
  }

  const transport = new StdioServerTransport();
  await core.server.connect(transport);
  return { core, transport, close: () => core.server.close() };
}
