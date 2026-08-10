/**
 * 쓰기 도구 시험용 하네스.
 *
 * 자식 프로세스를 띄우지 않는다 — `src/adt/__tests__/testServer.ts`의
 * in-process HTTP 서버 위에 진짜 `AdtClient`를 얹고, 도구 핸들러를 그
 * 접속으로 직접 부른다. 실 SAP에는 한 바이트도 나가지 않는다.
 *
 * CSRF discovery는 여기서 가로채 자동 응답한다. 도구마다 그 잡음을 다시
 * 쓰지 않게 하려는 것이고, 그래서 시험이 보는 요청 목록(`calls()`)에서도
 * discovery는 빠진다.
 */

import * as http from 'node:http';

import { AdtClient } from '../../../adt';
import {
  type RecordedRequest,
  type Responder,
  type TestServer,
  startTestServer,
  testConfig,
} from '../../../adt/__tests__/testServer';
import type { ResolvedProfile } from '../../../contracts';
import { NOOP_LOGGER, type SapTool, type ToolContext, type ToolResult } from '../../../server';

const DISCOVERY_PATHS = ['/sap/bc/adt/core/discovery', '/sap/bc/adt/discovery'];

export interface WriteHarness {
  readonly server: TestServer;
  readonly client: AdtClient;
  readonly context: ToolContext;
  /** discovery를 뺀 요청들 — 도구가 실제로 조립한 것만 남는다. */
  calls(): readonly RecordedRequest[];
  nth(index: number): RecordedRequest;
  close(): Promise<void>;
}

const FAKE_PROFILE: ResolvedProfile = {
  connection: null,
  tier: 'DEV',
  systemType: 'onprem',
  sapVersion: null,
  envPath: null,
  alias: null,
  diagnostics: [],
};

/** 시험 서버 + 접속 + 도구 컨텍스트 한 벌. */
export async function startWriteHarness(responder: Responder): Promise<WriteHarness> {
  let index = 0;
  const server = await startTestServer((request, response) => {
    if (DISCOVERY_PATHS.includes(request.path)) {
      response.setHeader('x-csrf-token', 'test-csrf-token');
      response.statusCode = 200;
      response.end('<discovery/>');
      return;
    }
    responder(request, response, index++);
  });

  const client = new AdtClient(testConfig(server.baseUrl), {
    connectionId: 'test-connection',
    sleep: async () => {},
    newRequestId: () => 'test-request-id',
  });

  const context: ToolContext = {
    getConnection: async () => client,
    profile: FAKE_PROFILE,
    logger: NOOP_LOGGER,
    env: {},
  };

  const calls = (): readonly RecordedRequest[] =>
    server.requests.filter((entry) => !DISCOVERY_PATHS.includes(entry.path));

  return {
    server,
    client,
    context,
    calls,
    nth(position: number): RecordedRequest {
      const found = calls()[position];
      if (!found) {
        throw new Error(`요청 #${position}가 없다 (기록 ${calls().length}건): ${describe(calls())}`);
      }
      return found;
    },
    close: () => server.close(),
  };
}

function describe(requests: readonly RecordedRequest[]): string {
  return requests.map((entry) => `${entry.method} ${entry.url}`).join(', ') || '(없음)';
}

/** 도구 하나를 이 하네스의 컨텍스트로 부른다. */
export function invoke(
  tool: SapTool,
  harness: WriteHarness,
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

/** `?_action=LOCK`에 답하는 표준 잠금 응답. */
export function lockBody(handle = 'LOCK-HANDLE-1', transport?: string): string {
  const corr = transport === undefined ? '' : `<CORRNR>${transport}</CORRNR>`;
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
    `<LOCK_HANDLE>${handle}</LOCK_HANDLE>${corr}` +
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

/** 경고 하나를 실은 `chkrun` 보고. */
export function warningCheckRun(text = 'Obsolete statement'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">' +
    '<chkrun:checkMessageList>' +
    `<chkrun:checkMessage chkrun:type="W" chkrun:shortText="${text}" line="7"/>` +
    '</chkrun:checkMessageList>' +
    '</chkrun:checkReport></chkrun:checkRunReports>'
  );
}

/** 활성화 응답. `type`이 'E'면 SAP이 200으로 돌려주는 **실패**다. */
export function activationBody(messages: ReadonlyArray<{ type: string; text: string }> = []): string {
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

/** ADT 예외 XML — 오류 분류 시험의 입력. */
export function adtException(type: string, message: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
    `<namespace id="com.sap.adt"/><type id="${type}"/><message lang="EN">${message}</message>` +
    '<properties/></exc:exception>'
  );
}

export function plainText(response: http.ServerResponse, body: string, status = 200): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(body);
}

export function xml(response: http.ServerResponse, body: string, status = 200): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/xml');
  response.end(body);
}
