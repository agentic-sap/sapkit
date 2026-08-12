/**
 * 기동 — argv·env를 읽어 코어를 세우고 전송에 붙인다.
 *
 * 부작용이 없는 함수다. `require()` 한 번으로 서버가 뜨는 자리는
 * `./entry`이고, 여기는 그 자리가 부르는 순수한 절차다. 전송을 주입할 수 있게
 * 열어 둔 것은 시험이 자식 프로세스를 띄우지 않기 위해서다.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { ConnectionConfig } from '../contracts';
import type { AdtClient } from '../adt';
import { type ServerCore, createServerCore } from './core';
import { resolveStartup } from './startup';
import type { SapTool, ToolLogger } from './toolDefinition';

export interface BootstrapOptions {
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly homedir?: string;
  readonly tools?: readonly SapTool[];
  /** 기본은 stdio. 시험은 in-memory 전송을 준다. */
  readonly transport?: Transport;
  readonly stderr?: (line: string) => void;
  readonly logger?: ToolLogger;
  readonly connectionFactory?: (config: ConnectionConfig) => AdtClient;
}

export interface StartedServer {
  readonly core: ServerCore;
  readonly transport: Transport;
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

  const core = createServerCore({
    startup,
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.stderr !== undefined ? { stderr: options.stderr } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.connectionFactory !== undefined
      ? { connectionFactory: options.connectionFactory }
      : {}),
  });

  const transport = options.transport ?? new StdioServerTransport();
  await core.server.connect(transport);
  return { core, transport };
}
