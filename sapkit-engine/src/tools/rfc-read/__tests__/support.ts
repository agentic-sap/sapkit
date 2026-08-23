/**
 * `GetTable`·`GetStructure` 시험 보조물.
 *
 * 자식 프로세스를 띄우지 않는다. ADT 경로는 **전송 주입**으로 보고, ECC 우회로는
 * 통로가 자기 전송을 스스로 만들기 때문에 `node:http`(포트 0) in-process 서버로
 * 본다 — 그래야 도구가 실제로 브리지를 부르는지가 증거로 남는다.
 *
 * 여기 쓰이는 호스트·계정·비밀번호는 전부 명백한 가짜다.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { AdtClient } from '../../../adt';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../../adt/http';
import type { ConnectionConfig, ResolvedProfile } from '../../../contracts';
import { NOOP_LOGGER } from '../../../server';
import type { SapTool, ToolContext, ToolResult } from '../../../server';

export function fakeConnection(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    baseUrl: 'https://sap.example.test:44300',
    username: 'TESTUSER',
    password: 'not-a-real-secret',
    client: '100',
    language: 'EN',
    rejectUnauthorized: false,
    timeouts: { default: 3000, csrf: 3000, long: 6000 },
    ...overrides,
  };
}

export function fakeProfile(overrides: Partial<ResolvedProfile> = {}): ResolvedProfile {
  return {
    connection: fakeConnection(),
    tier: 'DEV',
    systemType: 'onprem',
    sapVersion: null,
    envPath: '/fake/profiles/test/sap.env',
    alias: 'test',
    diagnostics: [],
    ...overrides,
  };
}

export interface ScriptedTransport {
  readonly calls: HttpRequest[];
  readonly transport: HttpTransport;
}

/** 대본의 다음 항목을 돌려준다. 바닥나면 마지막 항목을 계속 쓴다. */
export function scripted(steps: ReadonlyArray<Partial<HttpResponse> | Error>): ScriptedTransport {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = async (request) => {
    const step = steps[calls.length] ?? steps[steps.length - 1];
    calls.push(request);
    if (step instanceof Error) throw step;
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      setCookie: [],
      body: '',
      ...(step ?? {}),
    };
  };
  return { calls, transport };
}

export interface ToolHarness {
  readonly context: ToolContext;
  /** ADT 전송에 도달한 요청들. ECC 경로에서는 비어 있어야 한다. */
  readonly adtCalls: HttpRequest[];
  /** `getConnection()`이 몇 번 불렸는지. */
  readonly connectionCalls: { count: number };
}

export function harness(options: {
  readonly profile?: ResolvedProfile;
  readonly adtSteps?: ReadonlyArray<Partial<HttpResponse> | Error>;
  readonly env?: Readonly<Record<string, string | undefined>>;
} = {}): ToolHarness {
  const profile = options.profile ?? fakeProfile();
  const spy = scripted(options.adtSteps ?? [{ status: 200, body: '' }]);
  const connectionCalls = { count: 0 };
  const context: ToolContext = {
    async getConnection() {
      connectionCalls.count += 1;
      const config = profile.connection;
      if (!config) throw new Error('ERR_NO_CONNECTION: fixture profile has no connection');
      return new AdtClient(config, { transport: spy.transport });
    },
    profile,
    logger: NOOP_LOGGER,
    env: options.env ?? {},
    // 이 장치는 서버 코어를 세우지 않으므로 재적재할 세션이 없다. 조용한 no-op을
    // 두면 재적재를 부르는 도구가 여기서 통과해 버린다 — 크게 터뜨린다.
    reloadProfile: () => {
      throw new Error('이 시험 장치는 프로파일 재적재를 지원하지 않는다');
    },
  };
  return { context, adtCalls: spy.calls, connectionCalls };
}

/** 도구 응답의 텍스트 한 덩어리. */
export function textOf(result: ToolResult): string {
  return result.content.map((item) => item.text).join('\n');
}

/** 성공 응답의 JSON 본문. */
export function jsonOf(result: ToolResult): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

export async function call(
  tool: SapTool,
  context: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return tool.handler(context, args);
}

// ── ECC 브리지용 in-process OData 서버 ──────────────────────────────────────

export interface BridgeServer {
  /** `SAP_RFC_ODATA_SERVICE_URL`에 넣을 값. */
  readonly serviceUrl: string;
  /** 서버가 받은 요청들 — `{method, url}`. */
  readonly requests: Array<{ method: string; url: string }>;
  close(): Promise<void>;
}

/**
 * `$metadata`로 토큰을 발급하고 `DdicTablRead`에 준비된 봉투로 답하는 최소 서버.
 * 포트 0으로 띄운다 — 고정 포트를 잡지 않는다.
 */
export async function startBridge(outputs: {
  readonly EV_SUBRC: number;
  readonly EV_MESSAGE: string;
  readonly EV_RESULT: string;
}): Promise<BridgeServer> {
  const requests: Array<{ method: string; url: string }> = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method ?? '', url: req.url ?? '' });
    if ((req.url ?? '').includes('$metadata')) {
      res.writeHead(200, {
        'content-type': 'application/xml',
        'x-csrf-token': 'tok-bridge',
        'set-cookie': 'SAP_SESSIONID_X01_100=sess-1; path=/',
      });
      res.end('<edmx:Edmx/>');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ d: { DdicTablRead: outputs } }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;

  return {
    serviceUrl: `http://127.0.0.1:${port}/sap/opu/odata/sap/ZSAPKIT_ADT_SRV`,
    requests,
    async close() {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}
