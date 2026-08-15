/**
 * `GetSqlQuery` — 발행 계약 · 상시 게이트 · 응답 형태 · 오류 경로 · 13-9 수리.
 *
 * 이 도구는 **실 업무 데이터를 꺼내는** 유일한 M1 도구다. 그래서 시험이 붙잡는
 * 것도 셋이다:
 *  1. 구 번들이 실제로 발행하던 선언과 **글자 그대로** 같은가
 *     (`harness/old-surface/m1-tools.json`).
 *  2. 무허가 실데이터 호출이 **접속을 얻기 전에** 거부되는가 — 게이트는 서버
 *     코어가 걸고, 도구는 그것을 다시 하지 않는다.
 *  3. 돌아온 표가 **자기 질의의 WHERE를 지키는가**(13-9의 대체 기대 시험).
 *
 * 자식 프로세스를 띄우지 않는다. 접속 계층은 주입된 가짜다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtError } from '../../../adt';
import { createServerCore, resolveStartup } from '../../../server';
import type { Startup } from '../../../server';
import {
  argvOf,
  cleanupTempDirs,
  fakeConnectionFactory,
  tempDir,
  writeEnvFile,
} from '../../../server/__tests__/fixtures';
import { getSqlQuery } from '../getSqlQuery';
import {
  dataPreviewXml,
  fakeAdt,
  fakeDocumentNumbers,
  okResponse,
  wideSelect,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

// ── 발행 계약 (구 번들 채록본이 정본) ───────────────────────────────────────

const M1_TOOLS = path.join(__dirname, '..', '..', '..', '..', 'harness', 'old-surface', 'm1-tools.json');

interface CapturedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** 읽는 키는 `tools`(전량 선언 186종)다 — `m1`(19종)이면 M1 밖 도구를 못 짓는다. */
function capturedGetSqlQuery(): CapturedTool {
  const parsed = JSON.parse(fs.readFileSync(M1_TOOLS, 'utf8')) as {
    tools: Record<string, CapturedTool>;
  };
  const tool = parsed.tools['GetSqlQuery'];
  if (!tool) throw new Error('채록본의 전량 선언에 GetSqlQuery가 없다');
  return tool;
}

/** `$schema`는 SDK 판이 붙이는 장식이다 — 계약 비교에서 양쪽 모두 떼고 본다. */
function withoutSchemaKeyword(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema, ...rest } = schema as { $schema?: unknown } & Record<string, unknown>;
  void $schema;
  return rest;
}

// ── 서버 코어 하네스 ────────────────────────────────────────────────────────

interface Harness {
  readonly client: Client;
  readonly stderr: string[];
  readonly connections: { calls: unknown[] };
  close(): Promise<void>;
}

function startupWith(
  options: { readonly tier?: string; readonly allowTable?: string } = {},
): Startup {
  const envPath = writeEnvFile(path.join(tempDir(), 'sap.env'), {
    SAP_TIER: options.tier ?? 'DEV',
    ...(options.allowTable ? { MCP_ALLOW_TABLE: options.allowTable } : {}),
  });
  return resolveStartup({
    argv: argvOf('--exposition=readonly'),
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
    tools: [getSqlQuery],
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
  const result = (await harness.client.callTool({ name: 'GetSqlQuery', arguments: args })) as {
    isError?: boolean;
    content?: Array<{ text?: unknown }>;
  };
  return {
    isError: result.isError === true,
    text: (result.content ?? []).map((item) => String(item.text ?? '')).join('\n'),
  };
}

// ── 도구를 직접 부르는 짧은 길 ──────────────────────────────────────────────

async function runTool(
  args: Record<string, unknown>,
  xmlOrResponder: string | Parameters<typeof fakeAdt>[0],
): Promise<{
  isError: boolean;
  text: string;
  adt: ReturnType<typeof fakeAdt>;
}> {
  const adt =
    typeof xmlOrResponder === 'string'
      ? fakeAdt(() => okResponse(xmlOrResponder))
      : fakeAdt(xmlOrResponder);
  const result = await getSqlQuery.handler(adt.context, args);
  return {
    isError: result.isError,
    text: result.content.map((item) => item.text).join('\n'),
    adt,
  };
}

function payloadOf(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

// ── 1. 발행 계약 대조 ───────────────────────────────────────────────────────

describe('발행 계약', () => {
  it('tools/list가 채록본의 GetSqlQuery와 일치한다', async () => {
    const captured = capturedGetSqlQuery();
    const harness = await harnessFor(startupWith());
    try {
      const listed = await harness.client.listTools();
      const published = listed.tools.find((entry) => entry.name === 'GetSqlQuery');
      expect(published).toBeDefined();
      expect(published?.description).toBe(captured.description);
      expect(withoutSchemaKeyword(published?.inputSchema as Record<string, unknown>)).toEqual(
        withoutSchemaKeyword(captured.inputSchema),
      );
    } finally {
      await harness.close();
    }
  });

  it('배포 축은 구 선언 그대로 onprem·cloud다 (legacy 없음)', () => {
    expect(getSqlQuery.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getSqlQuery.definition.sets).toEqual(['readonly']);
    expect(getSqlQuery.definition.kind).toBe('row-data');
  });
});

// ── 2. 상시 게이트 음성시험 (거부 시 접속 0) ────────────────────────────────

describe('상시 게이트 음성시험 — 거부는 접속보다 먼저다', () => {
  it('deny 계층 테이블은 거부되고 접속을 얻지 않는다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { sql_query: 'SELECT kunnr FROM KNA1' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/row extraction refused/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('ask 계층 테이블은 승인 없이는 거부된다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { sql_query: 'SELECT belnr FROM BKPF' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/user confirmation required/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('테이블을 뽑아낼 수 없는 질의는 fail-closed로 거부된다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { sql_query: 'SELECT belnr FROM' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/fail-closed/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('빈 질의는 판정할 것이 없으므로 거부된다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      const outcome = await callText(harness, { sql_query: '   ' });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).toMatch(/without a statement/);
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('승인된 ask 계층 호출은 게이트를 지나 감사 줄을 남긴다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      await callText(harness, {
        sql_query: 'SELECT belnr FROM BKPF',
        acknowledge_risk: true,
      });
      expect(harness.stderr).toContain('AUDIT: user-acknowledged GetSqlQuery on BKPF');
    } finally {
      await harness.close();
    }
  });

  it('거부되더라도 MCP_ALLOW_TABLE 우회는 감사 줄에 남는다', async () => {
    const harness = await harnessFor(startupWith({ allowTable: 'BNKA' }));
    try {
      const outcome = await callText(harness, {
        sql_query: 'SELECT b~bankl FROM BNKA AS b INNER JOIN KNA1 AS k ON b~bankl = k~kunnr',
      });
      expect(outcome.isError).toBe(true);
      expect(harness.stderr).toContain('AUDIT: MCP_ALLOW_TABLE bypass for BNKA');
      expect(harness.connections.calls).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('도구는 블록리스트 판정을 다시 하지 않는다 — 게이트를 지나면 그대로 발송한다', async () => {
    const run = await runTool(
      { sql_query: 'SELECT kunnr FROM KNA1', row_number: 5 },
      dataPreviewXml({ totalRows: 1, columns: [{ name: 'KUNNR', cells: ['Z000000001'] }] }),
    );
    expect(run.isError).toBe(false);
    expect(run.adt.requests).toHaveLength(1);
  });
});

// ── 3. 발송 형태 ────────────────────────────────────────────────────────────

describe('발송 형태', () => {
  it('구와 같은 엔드포인트·본문·헤더로 나간다', async () => {
    const sql = "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001'";
    const run = await runTool(
      { sql_query: sql, row_number: 25 },
      dataPreviewXml({ totalRows: 1, columns: [{ name: 'BELNR', cells: ['9000000001'] }] }),
    );
    const sent = run.adt.requests[0];
    expect(sent?.method).toBe('POST');
    expect(sent?.path).toBe('/sap/bc/adt/datapreview/freestyle');
    expect(sent?.params).toEqual({ rowNumber: 25 });
    expect(sent?.body).toBe(sql);
    expect(sent?.contentType).toBe('text/plain; charset=utf-8');
    expect(sent?.accept).toBe(
      'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
    );
    expect(sent?.timeout).toBe('long');
  });

  it('row_number 미지정은 100이다', async () => {
    const run = await runTool(
      { sql_query: 'SELECT belnr FROM zdemo_docs' },
      dataPreviewXml({ totalRows: 1, columns: [{ name: 'BELNR', cells: ['9000000001'] }] }),
    );
    expect(run.adt.requests[0]?.params).toEqual({ rowNumber: 100 });
    expect(payloadOf(run.text)['row_number']).toBe(100);
  });
});

// ── 4. 응답 형태 (구와 같은 pretty JSON) ────────────────────────────────────

describe('응답 형태', () => {
  it('행 데이터는 text 콘텐츠 안의 pretty-print JSON이다', async () => {
    const xml = dataPreviewXml({
      totalRows: 2,
      executionTime: 1.25,
      columns: [
        { name: 'BELNR', type: 'C', length: 10, cells: ['9000000001', '9000000002'] },
        { name: 'BUKRS', type: 'C', length: 4, cells: ['1000', '2000'] },
      ],
    });
    const run = await runTool({ sql_query: 'SELECT belnr, bukrs FROM zdemo_docs' }, xml);

    expect(run.isError).toBe(false);
    expect(run.text).toBe(JSON.stringify(JSON.parse(run.text), null, 2));

    const payload = payloadOf(run.text);
    expect(payload).toEqual({
      sql_query: 'SELECT belnr, bukrs FROM zdemo_docs',
      row_number: 100,
      execution_time: 1.25,
      total_rows: 2,
      returned_row_count: 2,
      truncated: false,
      server_total_rows: 2,
      columns: [
        { name: 'BELNR', type: 'C', description: 'BELNR description', length: 10 },
        { name: 'BUKRS', type: 'C', description: 'BUKRS description', length: 4 },
      ],
      rows: [
        { BELNR: '9000000001', BUKRS: '1000' },
        { BELNR: '9000000002', BUKRS: '2000' },
      ],
    });
    // 키 순서까지 구 응답 그대로.
    expect(Object.keys(payload)).toEqual([
      'sql_query',
      'row_number',
      'execution_time',
      'total_rows',
      'returned_row_count',
      'truncated',
      'server_total_rows',
      'columns',
      'rows',
    ]);
  });

  it('self-closing 셀은 그 자리의 null이고 행이 밀리지 않는다', async () => {
    const xml = dataPreviewXml({
      totalRows: 3,
      columns: [
        { name: 'K', cells: ['a', 'b', 'c'] },
        { name: 'V', cells: [null, 'x', null] },
      ],
    });
    const run = await runTool({ sql_query: 'SELECT k, v FROM zdemo_docs' }, xml);
    expect(payloadOf(run.text)['rows']).toEqual([
      { K: 'a', V: null },
      { K: 'b', V: 'x' },
      { K: 'c', V: null },
    ]);
  });

  it('공백 한 칸짜리 값은 nil과 구별해 보존한다', async () => {
    const xml = dataPreviewXml({
      totalRows: 2,
      columns: [
        { name: 'K', cells: ['a', 'b'] },
        { name: 'V', cells: [null, ' '] },
      ],
    });
    const run = await runTool({ sql_query: 'SELECT k, v FROM zdemo_docs' }, xml);
    expect(payloadOf(run.text)['rows']).toEqual([
      { K: 'a', V: null },
      { K: 'b', V: ' ' },
    ]);
  });

  it('행 상한에 닿으면 truncated가 참이다', async () => {
    const numbers = fakeDocumentNumbers(3);
    const xml = dataPreviewXml({
      totalRows: 4213,
      columns: [{ name: 'BELNR', cells: numbers }],
    });
    const run = await runTool(
      { sql_query: 'SELECT belnr FROM zdemo_docs', row_number: 3 },
      xml,
    );
    const payload = payloadOf(run.text);
    expect(payload['returned_row_count']).toBe(3);
    expect(payload['truncated']).toBe(true);
    expect(payload['server_total_rows']).toBe(4213);
  });

  it('서버 총계가 반환 행보다 크면 상한에 안 닿아도 truncated다', async () => {
    const xml = dataPreviewXml({
      totalRows: 50,
      columns: [{ name: 'BELNR', cells: fakeDocumentNumbers(2) }],
    });
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, xml);
    expect(payloadOf(run.text)['truncated']).toBe(true);
  });

  it('총계 노드가 없으면 server_total_rows는 실리지 않는다', async () => {
    const xml = dataPreviewXml({
      totalRows: null,
      columns: [{ name: 'BELNR', cells: ['9000000001'] }],
    });
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, xml);
    const payload = payloadOf(run.text);
    expect('server_total_rows' in payload).toBe(false);
    expect(payload['total_rows']).toBe(0);
  });

  it('길이가 어긋난 열은 ragged_columns로 드러낸다', async () => {
    const xml = dataPreviewXml({
      totalRows: 2,
      columns: [
        { name: 'K', cells: ['a', 'b'] },
        { name: 'V', cells: ['x'] },
      ],
    });
    const run = await runTool({ sql_query: 'SELECT k, v FROM zdemo_docs' }, xml);
    expect(payloadOf(run.text)['ragged_columns']).toBe('K:2 V:1');
  });

  it('XML이 표가 아니면 파싱 실패를 정직하게 싣는다', async () => {
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, '<not-a-table/>');
    const payload = payloadOf(run.text);
    expect(payload['rows']).toEqual([]);
    expect(payload['columns']).toEqual([]);
  });
});

// ── 5. 오류 경로 ────────────────────────────────────────────────────────────

describe('오류 경로', () => {
  const http400 = (): AdtError =>
    new AdtError({ kind: 'http', status: 400, method: 'POST', url: 'http://127.0.0.1:1/x' });

  it('산발 400은 정확히 한 번만 되민다', async () => {
    const xml = dataPreviewXml({ totalRows: 1, columns: [{ name: 'BELNR', cells: ['9000000001'] }] });
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, (_options, attempt) => {
      if (attempt === 1) throw http400();
      return okResponse(xml);
    });
    expect(run.isError).toBe(false);
    expect(run.adt.requests).toHaveLength(2);
  });

  it('두 번째도 400이면 구와 같은 문구로 실패한다', async () => {
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, () => {
      throw http400();
    });
    expect(run.isError).toBe(true);
    expect(run.text).toMatch(/^ADT error: /);
    expect(run.adt.requests).toHaveLength(2);
  });

  it('400이 아닌 실패는 되밀지 않는다', async () => {
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, () => {
      throw new AdtError({ kind: 'server', status: 500, method: 'POST', url: 'http://127.0.0.1:1/x' });
    });
    expect(run.isError).toBe(true);
    expect(run.text).toMatch(/^ADT error: /);
    expect(run.adt.requests).toHaveLength(1);
  });

  it('200이 아닌 응답은 상태를 그대로 말한다', async () => {
    const run = await runTool({ sql_query: 'SELECT belnr FROM zdemo_docs' }, () =>
      okResponse('', 204),
    );
    expect(run.isError).toBe(true);
    expect(run.text).toContain('Failed to execute SQL query. Status: 204');
  });

  it('질의가 비면 구와 같이 인자 오류로 답한다', async () => {
    const run = await runTool({ sql_query: '' }, '<x/>');
    expect(run.isError).toBe(true);
    expect(run.text).toContain('SQL query is required');
    expect(run.adt.requests).toHaveLength(0);
  });
});

// ── 6. 13-9 대체 기대 시험 (상) — WHERE가 결과에 실제로 반영된다 ────────────

describe('13-9 — WHERE가 결과에 실제로 반영되는가', () => {
  const belnr = '9000000001';

  /** 구 결함 그대로: 술어와 무관한 앞 N행이 정상 응답으로 돌아온 상황. */
  const ignoredWhereXml = (rowNumber: number): string =>
    dataPreviewXml({
      totalRows: 4213,
      executionTime: 0.8,
      columns: [{ name: 'BELNR', cells: fakeDocumentNumbers(rowNumber, 500) }],
    });

  it('넓은 SELECT 목록이어도 WHERE는 발송 본문에 그대로 실린다', async () => {
    const sql = wideSelect(28, `belnr = '${belnr}'`);
    const run = await runTool({ sql_query: sql, row_number: 10 }, (_options) =>
      okResponse(
        dataPreviewXml({
          totalRows: 1,
          columns: [{ name: 'BELNR', cells: [belnr] }],
        }),
      ),
    );
    expect(run.adt.requests[0]?.body).toBe(sql);
    expect(run.adt.requests[0]?.body).toContain(`WHERE belnr = '${belnr}'`);
    expect(run.isError).toBe(false);
  });

  it('WHERE를 무시한 표는 성공으로 돌려주지 않는다 (구 엔진과의 의도적 차이)', async () => {
    const sql = wideSelect(28, `belnr = '${belnr}'`);
    const run = await runTool({ sql_query: sql, row_number: 10 }, () =>
      okResponse(ignoredWhereXml(10)),
    );
    expect(run.isError).toBe(true);
    expect(run.text).toContain('ERR_SQLQUERY_PREDICATE_IGNORED');
    expect(run.text).toContain('13-9');
  });

  it('거부된 표의 행 값은 응답에 실리지 않는다', async () => {
    const sql = wideSelect(28, `belnr = '${belnr}'`);
    const run = await runTool({ sql_query: sql, row_number: 10 }, () =>
      okResponse(ignoredWhereXml(10)),
    );
    for (const number of fakeDocumentNumbers(10, 500)) {
      expect(run.text).not.toContain(number);
    }
  });

  it('거부 문구는 응답 안의 징후를 함께 보여 준다', async () => {
    const sql = wideSelect(28, `belnr = '${belnr}'`);
    const run = await runTool({ sql_query: sql, row_number: 10 }, () =>
      okResponse(ignoredWhereXml(10)),
    );
    expect(run.text).toContain('returned_row_count=10');
    expect(run.text).toContain('truncated=true');
    expect(run.text).toContain('execution_time=0.8');
  });

  it('같은 넓은 질의라도 서버가 WHERE를 지키면 그대로 통과한다 (과수리 역검증)', async () => {
    const sql = wideSelect(28, `belnr = '${belnr}'`);
    const run = await runTool({ sql_query: sql, row_number: 10 }, () =>
      okResponse(
        dataPreviewXml({
          totalRows: 2,
          columns: [{ name: 'BELNR', cells: [belnr, belnr] }],
        }),
      ),
    );
    expect(run.isError).toBe(false);
    expect(payloadOf(run.text)['returned_row_count']).toBe(2);
  });

  it('IN 목록을 벗어난 행도 같은 판정을 받는다', async () => {
    const sql = `SELECT belnr FROM zdemo_docs WHERE belnr IN ('${belnr}', '9000000002')`;
    const run = await runTool({ sql_query: sql, row_number: 10 }, () =>
      okResponse(
        dataPreviewXml({
          totalRows: 3,
          columns: [{ name: 'BELNR', cells: [belnr, '9000000777'] }],
        }),
      ),
    );
    expect(run.isError).toBe(true);
    expect(run.text).toContain('ERR_SQLQUERY_PREDICATE_IGNORED');
  });

  it('판정할 수 없는 술어에는 아무 말도 하지 않는다 — 거짓 경보 금지', async () => {
    const sql = "SELECT bukrs FROM zdemo_docs WHERE belnr LIKE '90%'";
    const run = await runTool({ sql_query: sql, row_number: 10 }, () =>
      okResponse(dataPreviewXml({ totalRows: 1, columns: [{ name: 'BUKRS', cells: ['1000'] }] })),
    );
    expect(run.isError).toBe(false);
  });

  it('서버 코어를 지나서도 같은 판정이 나온다', async () => {
    const harness = await harnessFor(startupWith());
    try {
      // 게이트를 지나는 비보호 테이블. 접속 계층은 가짜라 요청이 나가지 않으므로
      // 여기서는 게이트 통과만 확인하고, 판정 자체는 위 직접 호출들이 붙잡는다.
      const outcome = await callText(harness, {
        sql_query: "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001'",
      });
      expect(harness.connections.calls).toHaveLength(1);
      expect(outcome.isError).toBe(true);
    } finally {
      await harness.close();
    }
  });
});
