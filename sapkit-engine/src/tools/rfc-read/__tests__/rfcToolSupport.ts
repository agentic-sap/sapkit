/**
 * `text-element` · `screen` · `gui-status` 묶음의 공용 시험 장치.
 *
 * 이 묶음의 도구 14종은 RFC 대리자(`ZSAPKIT_ADT_DISPATCH`·`ZSAPKIT_ADT_TEXTPOOL`)를
 * 타고, 그중 쓰기 8종은 **같은 호출 안에서** ADT(잠금·구문검사·활성화)도 탄다.
 * 그래서 한 서버가 두 축을 모두 받아야 요청 순서가 증거로 남는다.
 *
 * **자식 프로세스도 실 SAP도 쓰지 않는다.** ADT 축은 전송 주입으로 끊을 수도
 * 있지만 RFC 통로는 자기 전송을 스스로 만들기 때문에(`src/rfc/odata.ts`) 여기서는
 * 양쪽 다 `node:http`(포트 0) in-process 서버로 본다 —
 * `src/tools/rfc-read/__tests__/support.ts`의 `startBridge`가 같은 이유로 같은
 * 모양이다. 오가는 호스트·계정·비밀번호는 전부 명백한 가짜다.
 *
 * 발행 계약 대조(`publishedSurfaceOf`)는 서버를 세우되 접속하지 않는다.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtClient } from '../../../adt';
import {
  type RecordedRequest,
  type TestServer,
  startTestServer,
  testConfig,
} from '../../../adt/__tests__/testServer';
import type { ConnectionConfig, ResolvedProfile } from '../../../contracts';
import { NOOP_LOGGER, createServerCore, resolveStartup } from '../../../server';
import type { SapTool, ToolContext, ToolResult } from '../../../server';
import { argvOf, tempDir, writeEnvFile } from '../../../server/__tests__/fixtures';

// ── 발행 계약 ───────────────────────────────────────────────────────────────

const M1_TOOLS = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');

export interface PublishedDeclaration {
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
}

/** 채록본의 **전량 선언 186종**에서 한 항목. `m1`(19종)이 아니다. */
export function publishedDeclaration(name: string): PublishedDeclaration {
  const parsed = JSON.parse(fs.readFileSync(M1_TOOLS, 'utf8')) as {
    tools: Record<string, PublishedDeclaration>;
  };
  const entry = parsed.tools[name];
  if (!entry) throw new Error(`m1-tools.json의 tools(전량 선언)에 ${name} 항목이 없다`);
  return entry;
}

/** 도구 하나만 실은 서버를 세워 그 도구의 발행 선언을 돌려준다. */
export async function publishedSurfaceOf(tool: SapTool): Promise<PublishedDeclaration> {
  const dir = tempDir();
  const envPath = writeEnvFile(path.join(dir, 'sap.env'), {
    SAP_TIER: 'DEV',
    SAP_SYSTEM_TYPE: 'onprem',
  });
  const startup = resolveStartup({
    argv: argvOf('--exposition=readonly,high'),
    env: { MCP_ENV_PATH: envPath },
    cwd: dir,
    homedir: dir,
  });
  const core = createServerCore({
    startup,
    tools: [tool],
    connectionFactory: () => {
      throw new Error('발행 계약 대조는 접속하지 않는다');
    },
    stderr: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'rfc-bundle-publication', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    if (listed.tools.length !== 1) {
      throw new Error(`도구 하나만 떠야 한다 — 실제 ${listed.tools.length}종`);
    }
    const published = listed.tools[0] as unknown as PublishedDeclaration;
    return {
      name: published.name,
      description: published.description,
      inputSchema: published.inputSchema,
      execution: published.execution,
    };
  } finally {
    await client.close();
    await core.server.close();
  }
}

// ── ADT + RFC 겸용 하네스 ───────────────────────────────────────────────────

/** 이 묶음이 쓰는 OData 서비스 경로. 구 엔진과 같은 이름이다. */
export const ODATA_SERVICE_PATH = '/sap/opu/odata/sap/ZSAPKIT_ADT_SRV';

const DISCOVERY_PATHS = ['/sap/bc/adt/core/discovery', '/sap/bc/adt/discovery'];

/** 도구가 대리자에게 보낸 호출 하나 — 이름과 인자를 풀어 둔 것. */
export interface RfcCall {
  /** FunctionImport 이름 — `Dispatch` | `Textpool`. */
  readonly functionImport: string;
  /** `IV_ACTION` — `CUA_FETCH`·`DYNPRO_READ`·`READ`·`WRITE` … */
  readonly action: string;
  /** 나머지 `IV_*` 인자. OData 문자열 리터럴을 벗겨 둔 값이다. */
  readonly inputs: Record<string, string>;
  /** `Dispatch`의 `IV_PARAMS`를 JSON으로 푼 것. 아니면 `null`. */
  readonly params: Record<string, unknown> | null;
  /** 원문 request-target. 인코딩까지 보고 싶을 때 쓴다. */
  readonly url: string;
}

/** 대리자가 돌려줄 세 출력. `result`가 문자열이 아니면 JSON으로 접는다. */
export interface RfcReply {
  readonly subrc?: number;
  readonly message?: string;
  readonly result?: unknown;
  /** HTTP 자체를 실패시키고 싶을 때. */
  readonly status?: number;
}

export type RfcResponder = (call: RfcCall, index: number) => RfcReply;

export type AdtResponder = (
  request: RecordedRequest,
  response: http.ServerResponse,
  index: number,
) => void;

export interface RfcHarness {
  readonly server: TestServer;
  readonly context: ToolContext;
  readonly connection: ConnectionConfig;
  /** 도구가 실제로 조립한 ADT 요청 — discovery와 OData 왕복은 뺀다. */
  adtCalls(): readonly RecordedRequest[];
  /** 도구가 대리자에게 보낸 호출들. */
  readonly rfcCalls: readonly RfcCall[];
  nthAdt(index: number): RecordedRequest;
  close(): Promise<void>;
}

/**
 * OData v2 문자열 리터럴을 벗긴다 — `'a''b'` → `a'b`.
 * `URLSearchParams`가 퍼센트 인코딩은 이미 풀어 준다.
 */
function unquoteODataLiteral(raw: string): string {
  const trimmed = raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw;
  return trimmed.replace(/''/g, "'");
}

function parseRfcCall(request: RecordedRequest): RfcCall {
  const functionImport = request.path.slice(`${ODATA_SERVICE_PATH}/`.length);
  const inputs: Record<string, string> = {};
  for (const [key, value] of request.query) {
    if (key.startsWith('IV_')) inputs[key] = unquoteODataLiteral(value);
  }
  let params: Record<string, unknown> | null = null;
  const raw = inputs['IV_PARAMS'];
  if (raw !== undefined) {
    try {
      params = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      params = null;
    }
  }
  return {
    functionImport,
    action: inputs['IV_ACTION'] ?? '',
    inputs,
    params,
    url: request.url,
  };
}

const FAKE_PROFILE_BASE = {
  tier: 'DEV',
  systemType: 'onprem',
  sapVersion: null,
  envPath: null,
  alias: null,
  diagnostics: [],
} as const;

export interface RfcHarnessOptions {
  /** ADT 축의 응답기. 없으면 어떤 ADT 요청도 예상하지 않는다는 뜻이다. */
  readonly adt?: AdtResponder;
  /** RFC 축의 응답기. 없으면 빈 결과(`subrc 0`)로 답한다. */
  readonly rfc?: RfcResponder;
  /** 프로파일 덮어쓰기 — `sapVersion` 같은 축을 흔들 때. */
  readonly profile?: Partial<ResolvedProfile>;
  /** 컨텍스트 env 덮어쓰기. 서비스 URL은 기본으로 이 서버를 가리킨다. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** ADT와 RFC를 한 서버에서 받는 시험 장치 한 벌. */
export async function startRfcHarness(options: RfcHarnessOptions = {}): Promise<RfcHarness> {
  const rfcCalls: RfcCall[] = [];
  let adtIndex = 0;

  const server = await startTestServer((request, response) => {
    if (DISCOVERY_PATHS.includes(request.path)) {
      response.setHeader('x-csrf-token', 'test-csrf-token');
      response.statusCode = 200;
      response.end('<discovery/>');
      return;
    }

    if (request.path.startsWith(ODATA_SERVICE_PATH)) {
      if (request.path.endsWith('$metadata')) {
        response.writeHead(200, {
          'content-type': 'application/xml',
          'x-csrf-token': 'tok-rfc',
          'set-cookie': 'SAP_SESSIONID_X01_100=sess-1; path=/',
        });
        response.end('<edmx:Edmx/>');
        return;
      }
      const call = parseRfcCall(request);
      const index = rfcCalls.length;
      rfcCalls.push(call);
      const reply = options.rfc ? options.rfc(call, index) : {};
      if (reply.status !== undefined && reply.status >= 400) {
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: reply.message ?? 'rfc failure' } }));
        return;
      }
      const result = reply.result;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          d: {
            [call.functionImport]: {
              EV_SUBRC: reply.subrc ?? 0,
              EV_MESSAGE: reply.message ?? '',
              EV_RESULT: typeof result === 'string' ? result : JSON.stringify(result ?? null),
            },
          },
        }),
      );
      return;
    }

    if (!options.adt) {
      response.statusCode = 500;
      response.end(`ADT 응답기가 없는데 요청이 왔다: ${request.method} ${request.url}`);
      return;
    }
    options.adt(request, response, adtIndex++);
  });

  const connection = testConfig(server.baseUrl);
  const profile: ResolvedProfile = {
    ...FAKE_PROFILE_BASE,
    connection,
    ...options.profile,
  } as ResolvedProfile;

  const context: ToolContext = {
    getConnection: async () =>
      new AdtClient(connection, { connectionId: 'test-connection', sleep: async () => {} }),
    profile,
    logger: NOOP_LOGGER,
    env: {
      SAP_RFC_ODATA_SERVICE_URL: `${server.baseUrl}${ODATA_SERVICE_PATH}`,
      ...options.env,
    },
    // 이 장치는 서버 코어를 세우지 않으므로 재적재할 세션이 없다. 조용한 no-op을
    // 두면 재적재를 부르는 도구가 여기서 통과해 버린다 — 크게 터뜨린다.
    reloadProfile: () => {
      throw new Error('이 시험 장치는 프로파일 재적재를 지원하지 않는다');
    },
  };

  const adtCalls = (): readonly RecordedRequest[] =>
    server.requests.filter(
      (entry) => !DISCOVERY_PATHS.includes(entry.path) && !entry.path.startsWith(ODATA_SERVICE_PATH),
    );

  return {
    server,
    context,
    connection,
    adtCalls,
    rfcCalls,
    nthAdt(index: number): RecordedRequest {
      const found = adtCalls()[index];
      if (!found) {
        throw new Error(
          `ADT 요청 #${index}가 없다 (기록 ${adtCalls().length}건): ${adtCalls()
            .map((entry) => `${entry.method} ${entry.url}`)
            .join(', ')}`,
        );
      }
      return found;
    },
    close: () => server.close(),
  };
}

// ── 호출과 응답 ─────────────────────────────────────────────────────────────

/** 도구 하나를 이 하네스의 컨텍스트로 부른다. */
export function invoke(
  tool: SapTool,
  harness: RfcHarness,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return Promise.resolve(tool.handler(harness.context, args));
}

export function textOf(result: ToolResult): string {
  return result.content.map((item) => item.text).join('\n');
}

export function jsonOf(result: ToolResult): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

// ── ADT 응답 조각 ───────────────────────────────────────────────────────────

export function xml(response: http.ServerResponse, body: string, status = 200): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/xml');
  response.end(body);
}

/** `?_action=LOCK`에 답하는 표준 잠금 응답. */
export function lockBody(handle = 'LOCK-HANDLE-1'): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
    `<LOCK_HANDLE>${handle}</LOCK_HANDLE>` +
    '</DATA></asx:values></asx:abap>'
  );
}

/** 메시지 없는 `chkrun` 보고 — 깨끗한 구문검사. */
export function cleanCheckRun(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="OK"/>' +
    '</chkrun:checkRunReports>'
  );
}

/** 오류 하나를 실은 `chkrun` 보고. */
export function failingCheckRun(text = 'Field "X" is unknown', line = '42'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">' +
    '<chkrun:checkMessageList>' +
    `<chkrun:checkMessage chkrun:type="E" chkrun:shortText="${text}" line="${line}"/>` +
    '</chkrun:checkMessageList>' +
    '</chkrun:checkReport></chkrun:checkRunReports>'
  );
}

/** 활성화 응답. `type`이 'E'면 SAP이 200으로 돌려주는 **실패**다. */
export function activationBody(
  messages: ReadonlyArray<{ type: string; text: string }> = [],
): string {
  if (messages.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"/>';
  }
  const msgs = messages
    .map(
      (message) =>
        `<msg type="${message.type}" href="/sap/bc/adt/x#start=12,1"><shortText><txt>${message.text}</txt></shortText></msg>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">${msgs}</chkl:messages>`;
}

/** ADT 프로젝트 탐색기 응답 한 장 — 화면·GUI 상태 목록 도구가 읽는 모양. */
export function objectStructureXml(
  nodes: ReadonlyArray<{ objecttype: string; description?: string; isfolder?: string }>,
): string {
  const body = nodes
    .map(
      (node) =>
        `<projectexplorer:node objecttype="${node.objecttype}"` +
        `${node.description === undefined ? '' : ` description="${node.description}"`}` +
        `${node.isfolder === undefined ? '' : ` isfolder="${node.isfolder}"`}/>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">' +
    `${body}</projectexplorer:objectstructure>`
  );
}
