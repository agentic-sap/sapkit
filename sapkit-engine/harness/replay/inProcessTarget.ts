/**
 * 신 엔진을 **같은 프로세스 안에** 세우는 재생 대상.
 *
 * 채록기는 구 번들을 자식 프로세스로 띄운다 — 구 엔진은 완성된 산출물이라
 * 그 길밖에 없다. 신 엔진은 다르다. `createServerCore`가 `McpServer`를 돌려
 * 주므로 SDK의 `InMemoryTransport`로 클라이언트를 같은 프로세스에 이으면
 * **규약(JSON-RPC · initialize · tools/call)을 진짜로 태운 채** 프로세스를 하나도
 * 늘리지 않는다. 이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된
 * 실측 기록이 있으므로(`HANDOFF.md`) 이 차이가 중요하다.
 *
 * 응답 모양은 채록기의 자식 프로세스 전송과 **같게** 맞춘다: `tools/call`의
 * 결과 객체를 손대지 않고 그대로 `payload`에 담고, JSON-RPC 오류는 오류 객체를
 * 담아 `isError: true`로 돌려준다. 여기서 모양이 갈라지면 대조가 엔진이 아니라
 * 전송을 견주게 된다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { createServerCore } from '../../src/server/core';
import type { ServerCoreOptions } from '../../src/server/core';
import type { CapturedResponse, JsonValue, TransportHandshake } from '../recorder';
import type { ReplayTarget } from './types';

export interface InProcessTargetOptions extends ServerCoreOptions {
  /** 클라이언트 신원. 기본은 재생 러너 이름. */
  readonly clientInfo?: { readonly name: string; readonly version: string };
}

export class InProcessTarget implements ReplayTarget {
  /** 서버가 stderr로 내보낸 기동 진단. stdout은 프로토콜 채널이라 건드리지 않는다. */
  readonly diagnostics: string[] = [];

  private client: Client | null = null;
  private close_: (() => Promise<void>) | null = null;
  private exposedToolNames: readonly string[] = [];

  constructor(private readonly options: InProcessTargetOptions) {}

  /** `tools/list`에 실제로 오른 이름들. 열기 전에는 빈 목록이다. */
  get exposed(): readonly string[] {
    return this.exposedToolNames;
  }

  async open(): Promise<TransportHandshake> {
    if (this.client !== null) throw new Error('이미 열린 대상이다.');

    const { clientInfo, ...coreOptions } = this.options;
    const core = createServerCore({
      ...coreOptions,
      stderr: (line: string) => {
        this.diagnostics.push(line);
        this.options.stderr?.(line);
      },
    });
    this.exposedToolNames = core.exposedToolNames;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(clientInfo ?? { name: 'sapkit-replay', version: '0' });
    await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
    this.client = client;
    this.close_ = async () => {
      await client.close();
      await core.server.close();
    };

    const info = client.getServerVersion();
    return {
      serverName: info?.name ?? 'unknown',
      serverVersion: info?.version ?? 'unknown',
      // SDK 클라이언트는 합의된 프로토콜 판을 공개하지 않는다. 지어내지 않는다.
      protocolVersion: null,
      exposition: this.options.startup.sets.join(','),
    };
  }

  async callTool(tool: string, args: Record<string, JsonValue>): Promise<CapturedResponse> {
    const client = this.client;
    if (client === null) throw new Error('대상이 열려 있지 않다.');
    try {
      const result = (await client.callTool({ name: tool, arguments: args })) as unknown as JsonValue;
      const isError =
        result !== null && typeof result === 'object' && !Array.isArray(result) && result['isError'] === true;
      return { payload: result, isError };
    } catch (err) {
      // 채록기의 자식 프로세스 전송과 같은 처리 — 프로토콜 오류도 채록 대상이다.
      if (err instanceof McpError) {
        return { payload: { code: err.code, message: err.message }, isError: true };
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    const close = this.close_;
    this.client = null;
    this.close_ = null;
    if (close !== null) await close();
  }
}
