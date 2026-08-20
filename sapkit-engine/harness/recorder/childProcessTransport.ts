/**
 * **제품 번들**(판7-b · D-095 뒤로는 자체 저작 엔진)을 **자식 프로세스로** 띄우는 전송.
 *
 * 기동 계약은 `interactive/server/launch.cjs`가 정본이다: 번들은 `process.argv`의
 * `--exposition=...` **하나**로 도구 표면을 정하고, 접속은 `MCP_ENV_PATH`가 가리키는
 * env 파일로만 실체화된다. 자식 프로세스로 띄울 때도 같은 계약(argv + env)을 따른다.
 * 번들은 **실행만** 하고 수정하지 않는다.
 *
 * 프레이밍은 MCP stdio 규약 그대로 — 줄바꿈으로 끊은 JSON-RPC다. 클라이언트
 * 라이브러리를 끼우지 않는 이유는 하나: 채록기는 채록 대상 엔진이 **실제로 뱉은 것**을
 * 그대로 남겨야 한다. 라이브러리가 스키마로 다듬은 값을 저장하면 그건 엔진이
 * 아니라 라이브러리를 기록한 것이 된다.
 *
 * 이 파일은 단위 시험 경로에 있지 않다. 실기동 확인은
 * `__tests__/child-process.live.test.ts`가 `SAPKIT_RECORDER_LIVE=1`일 때만 돈다.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CapturedResponse, RecorderTransport, TransportHandshake } from './record';
import type { JsonValue } from './types';

export interface ChildProcessTransportOptions {
  /** `interactive/server/server.bundle.cjs` 절대 경로. */
  readonly bundlePath: string;
  /** 번들에 넘길 `--exposition` 값 (예: `readonly`, `readonly,high`). 정확히 하나. */
  readonly exposition: string;
  /** 접속을 실체화할 env 파일. 없으면 inspection-only로 뜬다(SAP 무접속). */
  readonly envPath?: string;
  /** 자식의 작업 디렉터리. 번들이 `<cwd>/.sapkit`를 본다. */
  readonly cwd?: string;
  /** 번들의 런타임 의존성 경로(keyring 등). `NODE_PATH`로 넘어간다. */
  readonly nodePath?: string;
  readonly nodeExecutable?: string;
  /** 요청 하나의 상한. 기본 60초. */
  readonly requestTimeoutMs?: number;
  readonly clientInfo?: { readonly name: string; readonly version: string };
  /** 자식의 stderr(진단 문구)를 흘려보낼 곳. */
  readonly onStderr?: (chunk: string) => void;
}

interface Pending {
  readonly resolve: (value: JsonValue) => void;
  readonly reject: (err: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const PROTOCOL_VERSION = '2024-11-05';

export class ChildProcessTransport implements RecorderTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private exitReason: string | null = null;

  constructor(private readonly opts: ChildProcessTransportOptions) {}

  async open(): Promise<TransportHandshake> {
    if (this.child !== null) throw new Error('이미 열린 전송이다.');

    // 주변 셸의 SAP_*/MCP_* 가 조용히 다른 시스템을 고르지 못하게 걷어낸 뒤,
    // 이 전송이 명시한 것만 다시 넣는다. 채록의 재현성은 여기서 시작한다.
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('SAP_') || key.startsWith('MCP_')) delete env[key];
    }
    if (this.opts.envPath !== undefined) env['MCP_ENV_PATH'] = this.opts.envPath;
    if (this.opts.nodePath !== undefined) env['NODE_PATH'] = this.opts.nodePath;

    const child = spawn(this.opts.nodeExecutable ?? process.execPath, [this.opts.bundlePath, `--exposition=${this.opts.exposition}`], {
      cwd: this.opts.cwd ?? process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consume(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => this.opts.onStderr?.(chunk));
    child.on('exit', (code, signal) => {
      this.exitReason = `자식 프로세스 종료 (code=${String(code)}, signal=${String(signal)})`;
      this.failAllPending(new Error(this.exitReason));
    });
    child.on('error', (err) => this.failAllPending(err));

    const result = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: this.opts.clientInfo ?? { name: 'sapkit-recorder', version: '0' },
    });
    this.notify('notifications/initialized');

    const info = isRecord(result) ? result : {};
    const serverInfo = isRecord(info['serverInfo']) ? info['serverInfo'] : {};
    return {
      serverName: typeof serverInfo['name'] === 'string' ? serverInfo['name'] : 'unknown',
      serverVersion: typeof serverInfo['version'] === 'string' ? serverInfo['version'] : 'unknown',
      protocolVersion: typeof info['protocolVersion'] === 'string' ? info['protocolVersion'] : null,
      exposition: this.opts.exposition,
    };
  }

  async callTool(tool: string, args: Record<string, JsonValue>): Promise<CapturedResponse> {
    try {
      const payload = await this.request('tools/call', { name: tool, arguments: args });
      const isError = isRecord(payload) && payload['isError'] === true;
      return { payload, isError };
    } catch (err) {
      if (err instanceof JsonRpcError) return { payload: err.payload, isError: true };
      throw err;
    }
  }

  /** 임의 JSON-RPC 요청. `tools/list` 같은 프로토콜 호출에 쓴다. */
  request(method: string, params: JsonValue = {}): Promise<JsonValue> {
    const child = this.child;
    if (child === null) throw new Error('전송이 열려 있지 않다.');
    const id = this.nextId++;
    return new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 응답 시한 초과 (${this.opts.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS}ms)`));
      }, this.opts.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  private notify(method: string, params: JsonValue = {}): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let nl = this.buffer.indexOf('\n');
    while (nl >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line !== '') this.dispatch(line);
      nl = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return; // JSON-RPC가 아닌 줄(진단 출력 등)은 무시한다.
    }
    if (!isRecord(message) || typeof message['id'] !== 'number') return;
    const waiting = this.pending.get(message['id']);
    if (waiting === undefined) return;
    this.pending.delete(message['id']);
    clearTimeout(waiting.timer);
    if ('error' in message) {
      waiting.reject(new JsonRpcError((message['error'] ?? null) as JsonValue));
      return;
    }
    waiting.resolve((message['result'] ?? null) as JsonValue);
  }

  private failAllPending(err: Error): void {
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(err);
    }
    this.pending.clear();
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (child === null) return;
    this.failAllPending(new Error('전송을 닫는 중이다.'));
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.stdin.end();
      child.kill();
      // 자식이 끝내 죽지 않아도 채록 세션이 매달리지 않게 상한을 둔다.
      setTimeout(() => resolve(), 5_000).unref();
    });
  }
}

/** JSON-RPC 오류 응답. 도구 오류는 채록 대상이므로 던지지 않고 여기 담아 되돌린다. */
export class JsonRpcError extends Error {
  readonly payload: JsonValue;
  constructor(payload: JsonValue) {
    super('JSON-RPC 오류 응답');
    this.name = 'JsonRpcError';
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
