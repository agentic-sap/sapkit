/**
 * 가짜 전송 — 미리 적어 둔 응답을 순서대로 돌려준다.
 *
 * 단위 시험이 프로세스를 하나도 띄우지 않고 채록기 코어 전체를 돌리기 위한
 * 구현이다. 이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된
 * 실측 기록이 있어(`HANDOFF.md`) 시험 경로에는 실제 기동을 두지 않는다.
 *
 * 재생 러너를 짓는 쪽에서도 그대로 쓸 수 있게 채록기 본체에 둔다.
 */
import type { CapturedResponse, RecorderTransport, TransportHandshake } from './record';
import type { JsonValue } from './types';

export interface ScriptedResponse {
  readonly payload?: JsonValue;
  readonly isError?: boolean;
  /** 전송 자체가 끊기는 상황을 흉내 낸다. */
  readonly throws?: Error;
}

export interface ScriptedTransportOptions {
  readonly script: readonly ScriptedResponse[];
  readonly handshake?: Partial<TransportHandshake>;
}

const DEFAULT_HANDSHAKE: TransportHandshake = {
  serverName: 'scripted',
  serverVersion: '0.0.0',
  protocolVersion: null,
  exposition: 'readonly',
};

export class ScriptedTransport implements RecorderTransport {
  readonly calls: { tool: string; args: Record<string, JsonValue> }[] = [];
  opened = 0;
  closed = 0;

  private readonly script: readonly ScriptedResponse[];
  private readonly handshake: TransportHandshake;

  constructor(opts: ScriptedTransportOptions) {
    this.script = opts.script;
    this.handshake = { ...DEFAULT_HANDSHAKE, ...opts.handshake };
  }

  async open(): Promise<TransportHandshake> {
    this.opened += 1;
    return this.handshake;
  }

  async callTool(tool: string, args: Record<string, JsonValue>): Promise<CapturedResponse> {
    const scripted = this.script[this.calls.length];
    this.calls.push({ tool, args });
    if (scripted === undefined) throw new Error(`가짜 전송에 ${this.calls.length}번째 응답이 적혀 있지 않다 (도구 ${tool}).`);
    if (scripted.throws !== undefined) throw scripted.throws;
    return { payload: scripted.payload ?? null, isError: scripted.isError ?? false };
  }

  async close(): Promise<void> {
    this.closed += 1;
  }
}
