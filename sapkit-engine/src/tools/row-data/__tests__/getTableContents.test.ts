/**
 * `GetTableContents` — 발행 계약 · **상시 게이트** · 와이어 · 응답 형태 · 오류 갈래.
 *
 * 이 도구는 `GetSqlQuery`와 함께 **실 업무 데이터를 꺼내는 2종** 중 하나다
 * (`src/safety/rowData.ts`의 `ROW_DATA_TOOLS`). 노출로는 막히지 않으므로
 * (`--exposition=readonly` 표면에 그대로 뜬다) 안전은 전적으로 서버 코어의
 * 상시 게이트가 진다. 그래서 이 파일의 무게는 **음성시험**에 있다:
 *
 *  1. 차단 테이블·승인 없는 ask 등급이 거부되는가 — 그리고 **접속을 얻기
 *     전에** 거부되는가(`context.getConnection()` 호출 0회).
 *  2. 허용 목록(`MCP_ALLOW_TABLE`) 우회가 **딱 그 이름만** 열고 다른 차단
 *     테이블은 열지 못하는가.
 *  3. 프로파일(`--exposition`)과 **무관하게** 게이트가 서는가.
 *  4. 감사 줄이 남는가.
 *  5. (과수리 역검증) 허용된 호출은 실제로 지나가는가.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다. MCP 규약은 `InMemoryTransport`로 같은
 * 프로세스에서 진짜로 오가고, SAP 쪽만 주입된 가짜다. 표에 실리는 값은 전부
 * 지어낸 것이다 — 실 테이블 이름을 쓰더라도 내용은 가짜다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtError } from '../../../adt';
import type { AdtRequestOptions } from '../../../adt';
import { createServerCore, resolveStartup } from '../../../server';
import type { Startup } from '../../../server';
import {
  argvOf,
  cleanupTempDirs,
  fakeConnectionFactory,
  tempDir,
  writeEnvFile,
} from '../../../server/__tests__/fixtures';
import { getTableContents } from '../getTableContents';
import { dataPreviewXml, fakeAdt, okResponse } from './support';

afterEach(() => {
  cleanupTempDirs();
});

// ── 채록본 (구 번들 발행 선언이 정본) ───────────────────────────────────────

const M1_TOOLS = path.join(__dirname, '..', '..', '..', '..', 'harness', 'old-surface', 'm1-tools.json');

interface CapturedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** 읽는 키는 `tools`(전량 선언 186종)다 — `m1`(19종)이 아니다. */
function capturedGetTableContents(): CapturedTool {
  const parsed = JSON.parse(fs.readFileSync(M1_TOOLS, 'utf8')) as {
    tools: Record<string, CapturedTool>;
  };
  const tool = parsed.tools['GetTableContents'];
  if (!tool) throw new Error('채록본의 전량 선언에 GetTableContents가 없다');
  return tool;
}

/** `$schema`는 SDK 판이 붙이는 장식이다 — 양쪽 모두 떼고 본다. */
function withoutSchemaKeyword(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema, ...rest } = schema as { $schema?: unknown } & Record<string, unknown>;
  void $schema;
  return rest;
}

// ── 서버 코어 하네스 (게이트가 실제로 서는 자리) ────────────────────────────

interface Harness {
  readonly client: Client;
  readonly stderr: string[];
  readonly connections: { calls: unknown[] };
  close(): Promise<void>;
}

function startupWith(
  options: {
    readonly tier?: string;
    readonly allowTable?: string;
    readonly exposition?: string;
  } = {},
): Startup {
  const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
    SAP_TIER: options.tier ?? 'DEV',
    ...(options.allowTable ? { MCP_ALLOW_TABLE: options.allowTable } : {}),
  });
  return resolveStartup({
    argv: argvOf(`--exposition=${options.exposition ?? 'readonly'}`),
    env: { MCP_ENV_PATH: envPath },
    cwd: tempDir(),
    homedir: tempDir(),
  });
}

async function harnessFor(startup: Startup): Promise<Harness> {
  const stderr: string[] = [];
  const connection = fakeConnectionFactory();
  const core = createServerCore({
    startup,
    tools: [getTableContents],
    connectionFactory: connection.factory,
    stderr: (line) => stderr.push(line),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    stderr,
    connections: connection,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

async function callText(
  harness: Harness,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string }> {
  const result = (await harness.client.callTool({
    name: 'GetTableContents',
    arguments: args,
  })) as { isError?: boolean; content?: Array<{ text?: unknown }> };
  return {
    isError: result.isError === true,
    text: (result.content ?? []).map((item) => String(item.text ?? '')).join('\n'),
  };
}

// ── 도구를 직접 부르는 짧은 길 (게이트는 코어에 있으므로 여기선 서지 않는다) ─

/** DDIC 메타데이터 응답 — 열 이름만 뽑아 쓰는 문서다. 값은 싣지 않는다. */
function ddicMetadataXml(fields: readonly string[]): string {
  const columns = fields
    .map((name) => `<dataPreview:metadata dataPreview:name="${name}" dataPreview:type="C"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/datapreview">${columns}</dataPreview:tableData>`
  );
}

interface DirectRun {
  readonly isError: boolean;
  readonly text: string;
  readonly requests: AdtRequestOptions[];
  readonly connections: { count: number };
}

/** 메타데이터 GET → 미리보기 POST 두 왕복에 차례로 답한다. */
async function runTool(
  args: Record<string, unknown>,
  respond: (options: AdtRequestOptions, attempt: number) => ReturnType<typeof okResponse>,
): Promise<DirectRun> {
  const adt = fakeAdt(respond);
  const result = await getTableContents.handler(adt.context, args);
  return {
    isError: result.isError,
    text: result.content.map((item) => item.text).join('\n'),
    requests: adt.requests,
    connections: adt.connections,
  };
}

/** 열 셋을 가진 정상 응답 한 벌. */
function happyPath(fields: readonly string[], xml: string) {
  return (options: AdtRequestOptions) =>
    options.method === 'GET' ? okResponse(ddicMetadataXml(fields)) : okResponse(xml);
}

function payloadOf(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

// ── 1. 발행 계약 ────────────────────────────────────────────────────────────

describe('발행 계약', () => {
  it('tools/list가 채록본의 GetTableContents와 글자 그대로 일치한다', async () => {
    const captured = capturedGetTableContents();
    const harness = await harnessFor(startupWith());
    try {
      const listed = await harness.client.listTools();
      const published = listed.tools.find((entry) => entry.name === 'GetTableContents');
      expect(published).toBeDefined();
      expect(published?.description).toBe(captured.description);
      expect(withoutSchemaKeyword(published?.inputSchema as Record<string, unknown>)).toEqual(
        withoutSchemaKeyword(captured.inputSchema),
      );
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/cloud · row-data', () => {
    // 구 `engine/src/handlers/table/readonly/handleGetTableContents.ts:14`.
    expect(getTableContents.definition.available_in).toEqual(['onprem', 'cloud']);
    // 채록본 exposures 4조건 전부에 뜬다 → readonly 집합이다.
    expect(getTableContents.definition.sets).toEqual(['readonly']);
    // **이 한 줄이 상시 게이트를 켠다** (`src/safety/rowData.ts`).
    expect(getTableContents.definition.kind).toBe('row-data');
    expect(getTableContents.definition.targetNames).toEqual(['table_name']);
  });

  it('게이트가 읽는 인자 이름을 그대로 발행한다 (개명 금지)', () => {
    // `src/server/gates.ts`의 ROW_DATA_ARGS가 이 이름으로 인자를 읽는다.
    const keys = Object.keys(getTableContents.definition.inputSchema);
    expect(keys).toContain('table_name');
    expect(keys).toContain('acknowledge_risk');
  });
});

// ── 2. 상시 게이트 음성시험 — 이 도구의 주 증거 ─────────────────────────────

describe('상시 게이트 음성시험 — 거부는 접속보다 먼저다', () => {
  it('deny 계층 테이블은 거부되고 접속을 얻지 않는다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { table_name: 'KNA1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('승인 없는 ask 계층 테이블은 거부되고 접속을 얻지 않는다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { table_name: 'BKPF' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/user confirmation required/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('소문자로 적어도 같은 판정을 받는다 — 대소문자로 게이트를 우회할 수 없다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { table_name: 'kna1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('테이블 이름이 비면 판정할 것이 없으므로 fail-closed로 거부된다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { table_name: '   ' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/fail-closed/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('허용 목록 우회가 **다른** 차단 테이블을 열지 못한다', async () => {
    const harness = await harnessFor(startupWith({ allowTable: 'BNKA' }));
    try {
      const outcome = await callText(harness, { table_name: 'KNA1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
      // 우회 대상이 아니었으므로 우회 감사 줄도 없어야 한다.
      expect(harness.stderr.some((line) => /MCP_ALLOW_TABLE bypass/.test(line))).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('허용 목록에 적힌 이름은 지나가고 그 우회가 감사 줄로 남는다', async () => {
    const harness = await harnessFor(startupWith({ allowTable: 'BNKA' }));
    try {
      await callText(harness, { table_name: 'BNKA' });
      expect(harness.stderr).toContain('AUDIT: MCP_ALLOW_TABLE bypass for BNKA');
      // 게이트를 지났으므로 접속까지는 간다(가짜 접속이라 그 뒤가 실패할 뿐).
      expect(harness.connections.calls).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('승인된 ask 계층 호출은 게이트를 지나 감사 줄을 남긴다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      await callText(harness, { table_name: 'BKPF', acknowledge_risk: true });
      expect(harness.stderr).toContain('AUDIT: user-acknowledged GetTableContents on BKPF');
      expect(harness.connections.calls).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('프로파일과 무관하게 게이트가 선다 — 넓은 표면에서도 같은 거부', async () => {
    // 노출은 이 도구를 숨기지 않는다. `readonly,high`로 넓혀도 판정은 같다.
    const harness = await harnessFor(startupWith({ exposition: 'readonly,high' }));
    try {
      const outcome = await callText(harness, { table_name: 'KNA1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('QA tier에서도 차단 테이블은 블록리스트가 막는다 — tier가 아니라 이쪽이 게이트다', async () => {
    // `src/safety/tier.ts:108-111` — `row-data`는 tier 게이트를 지난다(읽기와
    // 같은 칸이다). 그래서 이 도구의 유일한 방벽은 블록리스트이고, QA에서도
    // 같은 힘으로 서야 한다.
    const harness = await harnessFor(startupWith({ tier: 'QA' }));
    try {
      const outcome = await callText(harness, { table_name: 'KNA1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('보호되지 않은 테이블은 실제로 지나간다 (과수리 역검증)', async () => {
    const harness = await harnessFor(startupWith());
    try {
      await callText(harness, { table_name: 'ZDEMO_DOCS' });
      expect(harness.connections.calls).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('도구는 블록리스트 판정을 다시 하지 않는다 — 게이트를 지나면 그대로 발송한다', async () => {
    const run = await runTool(
      { table_name: 'KNA1' },
      happyPath(['KUNNR'], dataPreviewXml({ totalRows: 1, columns: [{ name: 'KUNNR', cells: ['Z000000001'] }] })),
    );
    expect(run.isError).toBe(false);
    expect(run.requests).toHaveLength(2);
  });
});

// ── 3. 발송 형태 (구 와이어 복원) ───────────────────────────────────────────

describe('발송 형태 — DDIC Data Preview 두 왕복', () => {
  it('메타데이터를 먼저 묻고 그 열 목록으로 SELECT를 짓는다', async () => {
    const xml = dataPreviewXml({
      totalRows: 1,
      columns: [
        { name: 'MANDT', cells: ['100'] },
        { name: 'ID', cells: ['A1'] },
      ],
    });
    const run = await runTool({ table_name: 'zdemo_docs', max_rows: 25 }, happyPath(['MANDT', 'ID'], xml));

    const metadata = run.requests[0];
    expect(metadata?.method).toBe('GET');
    expect(metadata?.path).toBe('/sap/bc/adt/datapreview/ddic/ZDEMO_DOCS/metadata');
    expect(metadata?.accept).toBe(
      'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
    );
    expect(metadata?.timeout).toBe('default');

    const preview = run.requests[1];
    expect(preview?.method).toBe('POST');
    expect(preview?.path).toBe('/sap/bc/adt/datapreview/ddic');
    expect(preview?.params).toEqual({ rowNumber: 25, ddicEntityName: 'ZDEMO_DOCS' });
    // TABLE~FIELD 문법 — Eclipse ADT와 같은 모양이다.
    expect(preview?.body).toBe('SELECT ZDEMO_DOCS~MANDT, ZDEMO_DOCS~ID FROM ZDEMO_DOCS');
    expect(preview?.contentType).toBe('text/plain');
    expect(preview?.accept).toBe(
      'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
    );
    expect(preview?.timeout).toBe('long');
  });

  it('max_rows 미지정은 100이다', async () => {
    const xml = dataPreviewXml({ totalRows: 1, columns: [{ name: 'ID', cells: ['A1'] }] });
    const run = await runTool({ table_name: 'ZDEMO_DOCS' }, happyPath(['ID'], xml));
    expect(run.requests[1]?.params).toEqual({ rowNumber: 100, ddicEntityName: 'ZDEMO_DOCS' });
    expect(payloadOf(run.text)['row_number']).toBe(100);
  });

  it('이름에 슬래시가 들어가도 경로가 인코딩된다', async () => {
    const xml = dataPreviewXml({ totalRows: 1, columns: [{ name: 'ID', cells: ['A1'] }] });
    const run = await runTool({ table_name: '/NS/ZTAB' }, happyPath(['ID'], xml));
    expect(run.requests[0]?.path).toBe('/sap/bc/adt/datapreview/ddic/%2FNS%2FZTAB/metadata');
    expect(run.requests[1]?.params).toEqual({ rowNumber: 100, ddicEntityName: '/NS/ZTAB' });
  });
});

// ── 4. 응답 형태 (구와 같은 pretty JSON) ────────────────────────────────────

describe('응답 형태', () => {
  it('구와 같은 자리표시 질의(`SELECT * FROM …`)를 실어 돌려준다', async () => {
    const xml = dataPreviewXml({
      totalRows: 2,
      executionTime: 1.25,
      columns: [
        { name: 'ID', type: 'C', length: 10, cells: ['A1', 'A2'] },
        { name: 'NAME', type: 'C', length: 20, cells: ['first', 'second'] },
      ],
    });
    const run = await runTool({ table_name: 'zdemo_docs' }, happyPath(['ID', 'NAME'], xml));

    expect(run.isError).toBe(false);
    const payload = payloadOf(run.text);
    // 구 핸들러는 인자 그대로(대문자화 없이) 자리표시 질의를 만든다
    // (`handleGetTableContents.ts:80-85` — `args.table_name`을 그대로 쓴다).
    expect(payload['sql_query']).toBe('SELECT * FROM zdemo_docs');
    expect(payload['rows']).toEqual([
      { ID: 'A1', NAME: 'first' },
      { ID: 'A2', NAME: 'second' },
    ]);
    expect(run.text).toBe(JSON.stringify(JSON.parse(run.text), null, 2));
  });
});

// ── 5. 오류 갈래 ────────────────────────────────────────────────────────────

describe('오류 갈래', () => {
  it('테이블 이름이 없으면 구와 같은 인자 오류다', async () => {
    const run = await runTool({}, () => okResponse('<x/>'));
    expect(run.isError).toBe(true);
    expect(run.text).toContain('Table name is required');
    expect(run.requests).toHaveLength(0);
    // 인자 검사가 접속보다 먼저다.
    expect(run.connections.count).toBe(0);
  });

  it('메타데이터에 열이 하나도 없으면 미리보기를 보내지 않는다', async () => {
    const run = await runTool({ table_name: 'ZDEMO_DOCS' }, () => okResponse(ddicMetadataXml([])));
    expect(run.isError).toBe(true);
    expect(run.text).toContain('Could not retrieve column names from table metadata');
    expect(run.requests).toHaveLength(1);
  });

  it('200이 아닌 미리보기 응답은 상태를 그대로 말한다', async () => {
    const run = await runTool({ table_name: 'ZDEMO_DOCS' }, (options) =>
      options.method === 'GET' ? okResponse(ddicMetadataXml(['ID'])) : okResponse('', 204),
    );
    expect(run.isError).toBe(true);
    expect(run.text).toContain('Failed to read table contents. Status: 204');
  });

  it('전송 실패는 구와 같은 `ADT error:` 문구로 접힌다', async () => {
    const run = await runTool({ table_name: 'ZDEMO_DOCS' }, () => {
      throw new AdtError({ kind: 'server', status: 500, method: 'GET', url: 'http://127.0.0.1:1/x' });
    });
    expect(run.isError).toBe(true);
    expect(run.text).toMatch(/^ADT error: /);
  });

  it('산발 400을 되밀지 않는다 — 되미는 것은 GetSqlQuery의 계약이다', async () => {
    const run = await runTool({ table_name: 'ZDEMO_DOCS' }, () => {
      throw new AdtError({ kind: 'http', status: 400, method: 'GET', url: 'http://127.0.0.1:1/x' });
    });
    expect(run.isError).toBe(true);
    expect(run.requests).toHaveLength(1);
  });
});
