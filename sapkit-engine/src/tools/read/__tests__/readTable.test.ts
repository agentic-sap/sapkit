/**
 * `ReadTable` — 발행 계약 · 와이어 · 두 조회의 독립성 · 인자 갈래.
 *
 * 구 핸들러(`engine/src/handlers/table/readonly/handleReadTable.ts`)는 소스와
 * 메타데이터를 **각각 따로** 물어보고, 둘 중 하나가 실패해도 그 자리를 `null`로
 * 두고 나머지를 실어 성공으로 답한다. 그 "실패해도 성공"이 이 도구의 계약이며
 * 이 파일이 붙잡는 핵심이다 — 한쪽이 없다고 전체를 오류로 만들면 구와 다르다.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { readTable } from '../readTable';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const ROOT = '/sap/bc/adt/ddic/tables';
const METADATA_ACCEPT = 'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml';

afterEach(() => {
  cleanupTempDirs();
});

/** 지어낸 DDL 한 줄. 실 테이블 내용이 아니다. */
const DDL = 'define table zdemo_docs { key mandt : mandt not null; }';
const METADATA_XML =
  '<?xml version="1.0" encoding="utf-8"?><blue:blueSource adtcore:name="ZDEMO_DOCS"/>';

async function call(
  args: Record<string, unknown>,
  reply: Parameters<typeof runTool>[2],
): Promise<{ payload: any; isError: boolean; urls: string[]; accepts: Array<string | undefined> }> {
  const { outcome, requests } = await runTool(readTable, args, reply);
  const sent = toolRequests(requests);
  return {
    payload: outcome.isError ? undefined : JSON.parse(outcome.text),
    isError: outcome.isError,
    urls: sent.map((request) => request.url),
    accepts: sent.map((request) => request.headers['Accept'] ?? request.headers['accept']),
  };
}

/** 소스 → DDL, 메타데이터 → XML로 답하는 정상 왕복. */
const happy: Parameters<typeof runTool>[2] = (request) =>
  request.url.includes('/source/main') ? { body: DDL } : { body: METADATA_XML };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readTable);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };
      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('ReadTable'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/cloud · read', () => {
    // `engine/src/handlers/table/readonly/` + 채록본 exposures 4조건 전부.
    expect(readTable.definition.sets).toEqual(['readonly']);
    expect(readTable.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readTable.definition.kind).toBe('read');
    expect(readTable.definition.targetNames).toEqual(['table_name']);
  });
});

describe('와이어', () => {
  it('소스와 메타데이터를 각각 다른 자리에서 묻는다', async () => {
    const run = await call({ table_name: 'zdemo_docs' }, happy);

    expect(run.urls).toHaveLength(2);
    // 이름은 대문자로 올려 보낸다 (`handleReadTable.ts:42`).
    expect(run.urls[0]).toContain(`${ROOT}/ZDEMO_DOCS/source/main`);
    expect(run.urls[0]).toContain('version=active');
    expect(run.urls[1]).toContain(`${ROOT}/ZDEMO_DOCS`);
    expect(run.urls[1]).not.toContain('/source/main');
    // 메타데이터 조회에는 version이 붙지 않는다 (`AdtUtils.js:269-280` — 구
    // 핸들러가 옵션 없이 readMetadata를 부른다).
    expect(run.urls[1]).not.toContain('version=');
  });

  it('Accept는 소스와 메타데이터가 서로 다르다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS' }, happy);
    // `AdtUtils.js:315` — 소스는 text/plain.
    expect(run.accepts[0]).toBe('text/plain');
    // `AdtUtils.js:709-711` → `contentTypes.js:78` — ACCEPT_TABLE.
    expect(run.accepts[1]).toBe(METADATA_ACCEPT);
  });

  it('version=inactive를 그대로 실어 보낸다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS', version: 'inactive' }, happy);
    expect(run.urls[0]).toContain('version=inactive');
    expect(run.payload.version).toBe('inactive');
  });

  it('이름에 슬래시가 들어가면 인코딩된다', async () => {
    const run = await call({ table_name: '/NS/ZTAB' }, happy);
    expect(run.urls[0]).toContain(`${ROOT}/%2FNS%2FZTAB/source/main`);
  });
});

describe('응답 형태', () => {
  it('구와 같은 다섯 키를 그 순서로 싣는다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS' }, happy);
    expect(run.isError).toBe(false);
    expect(Object.keys(run.payload)).toEqual([
      'success',
      'table_name',
      'version',
      'source_code',
      'metadata',
    ]);
    expect(run.payload).toEqual({
      success: true,
      table_name: 'ZDEMO_DOCS',
      version: 'active',
      source_code: DDL,
      metadata: METADATA_XML,
    });
  });
});

describe('두 조회는 서로 독립이다 (구의 "실패해도 성공")', () => {
  it('소스가 404여도 메타데이터를 싣고 성공한다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS' }, (request) =>
      request.url.includes('/source/main') ? { status: 404, body: 'not found' } : { body: METADATA_XML },
    );
    expect(run.isError).toBe(false);
    expect(run.payload.source_code).toBeNull();
    expect(run.payload.metadata).toBe(METADATA_XML);
  });

  it('메타데이터가 실패해도 소스를 싣고 성공한다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS' }, (request) =>
      request.url.includes('/source/main') ? { body: DDL } : { status: 500, body: 'boom' },
    );
    expect(run.isError).toBe(false);
    expect(run.payload.source_code).toBe(DDL);
    expect(run.payload.metadata).toBeNull();
  });

  it('둘 다 실패해도 오류가 아니라 빈 두 자리로 답한다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS' }, () => ({ status: 500, body: 'boom' }));
    expect(run.isError).toBe(false);
    expect(run.payload.source_code).toBeNull();
    expect(run.payload.metadata).toBeNull();
    expect(run.payload.success).toBe(true);
  });

  it('빈 본문은 내용이 아니라 없음으로 접힌다', async () => {
    const run = await call({ table_name: 'ZDEMO_DOCS' }, () => ({ body: '' }));
    expect(run.payload.source_code).toBeNull();
    expect(run.payload.metadata).toBeNull();
  });
});

describe('인자 갈래', () => {
  it('table_name이 비면 구와 같은 문구로 거부하고 접속하지 않는다', async () => {
    const { outcome, requests } = await runTool(readTable, { table_name: '' }, () => ({ body: '' }));
    expect(outcome.isError).toBe(true);
    // 구 `return_error`의 `Error: ` 접두사가 계약이다.
    expect(outcome.text).toBe('Error: table_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });
});
