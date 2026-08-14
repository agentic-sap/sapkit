/**
 * `ReadStructure` — 발행 계약 · 와이어 · 두 조회의 독립성 · 인자 갈래.
 *
 * 구 핸들러(`engine/src/handlers/structure/readonly/handleReadStructure.ts`)는
 * `ReadTable`과 **같은 모양**이다. 다른 것은 뿌리 경로와 메타데이터 Accept, 그리고
 * 인자·응답 키 이름뿐이므로, 그 셋이 실제로 구조체 쪽 값인지를 여기서 붙잡는다.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { readStructure } from '../readStructure';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const ROOT = '/sap/bc/adt/ddic/structures';
const METADATA_ACCEPT =
  'application/vnd.sap.adt.structures.v2+xml, application/vnd.sap.adt.structures.v1+xml';

afterEach(() => {
  cleanupTempDirs();
});

/** 지어낸 DDL 한 줄. 실 구조체 내용이 아니다. */
const DDL = 'define structure zs_demo { id : abap.char(10); }';
const METADATA_XML =
  '<?xml version="1.0" encoding="utf-8"?><blue:blueSource adtcore:name="ZS_DEMO"/>';

async function call(
  args: Record<string, unknown>,
  reply: Parameters<typeof runTool>[2],
): Promise<{ payload: any; isError: boolean; urls: string[]; accepts: Array<string | undefined> }> {
  const { outcome, requests } = await runTool(readStructure, args, reply);
  const sent = toolRequests(requests);
  return {
    payload: outcome.isError ? undefined : JSON.parse(outcome.text),
    isError: outcome.isError,
    urls: sent.map((request) => request.url),
    accepts: sent.map((request) => request.headers['Accept'] ?? request.headers['accept']),
  };
}

const happy: Parameters<typeof runTool>[2] = (request) =>
  request.url.includes('/source/main') ? { body: DDL } : { body: METADATA_XML };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readStructure);
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
      }).toEqual(publishedDeclaration('ReadStructure'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/cloud · read', () => {
    expect(readStructure.definition.sets).toEqual(['readonly']);
    expect(readStructure.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readStructure.definition.kind).toBe('read');
    expect(readStructure.definition.targetNames).toEqual(['structure_name']);
  });
});

describe('와이어', () => {
  it('테이블이 아니라 **구조체** 뿌리로 나간다', async () => {
    const run = await call({ structure_name: 'zs_demo' }, happy);
    expect(run.urls).toHaveLength(2);
    expect(run.urls[0]).toContain(`${ROOT}/ZS_DEMO/source/main`);
    expect(run.urls[0]).toContain('version=active');
    expect(run.urls[1]).toContain(`${ROOT}/ZS_DEMO`);
    expect(run.urls[1]).not.toContain('/source/main');
    expect(run.urls[1]).not.toContain('version=');
    // 테이블 뿌리로 새지 않는다.
    expect(run.urls.some((url) => url.includes('/ddic/tables/'))).toBe(false);
  });

  it('메타데이터 Accept는 구조체 쪽 값이다', async () => {
    const run = await call({ structure_name: 'ZS_DEMO' }, happy);
    expect(run.accepts[0]).toBe('text/plain');
    // `AdtUtils.js:721-723` → `contentTypes.js:90` — ACCEPT_STRUCTURE.
    expect(run.accepts[1]).toBe(METADATA_ACCEPT);
  });

  it('version=inactive를 그대로 실어 보낸다', async () => {
    const run = await call({ structure_name: 'ZS_DEMO', version: 'inactive' }, happy);
    expect(run.urls[0]).toContain('version=inactive');
    expect(run.payload.version).toBe('inactive');
  });
});

describe('응답 형태', () => {
  it('구와 같은 다섯 키를 그 순서로 싣는다', async () => {
    const run = await call({ structure_name: 'ZS_DEMO' }, happy);
    expect(run.isError).toBe(false);
    expect(Object.keys(run.payload)).toEqual([
      'success',
      'structure_name',
      'version',
      'source_code',
      'metadata',
    ]);
    expect(run.payload).toEqual({
      success: true,
      structure_name: 'ZS_DEMO',
      version: 'active',
      source_code: DDL,
      metadata: METADATA_XML,
    });
  });
});

describe('두 조회는 서로 독립이다', () => {
  it('소스가 404여도 메타데이터를 싣고 성공한다', async () => {
    const run = await call({ structure_name: 'ZS_DEMO' }, (request) =>
      request.url.includes('/source/main') ? { status: 404, body: '' } : { body: METADATA_XML },
    );
    expect(run.isError).toBe(false);
    expect(run.payload.source_code).toBeNull();
    expect(run.payload.metadata).toBe(METADATA_XML);
  });

  it('둘 다 실패해도 오류가 아니다', async () => {
    const run = await call({ structure_name: 'ZS_DEMO' }, () => ({ status: 500, body: 'boom' }));
    expect(run.isError).toBe(false);
    expect(run.payload.success).toBe(true);
    expect(run.payload.source_code).toBeNull();
    expect(run.payload.metadata).toBeNull();
  });
});

describe('인자 갈래', () => {
  it('structure_name이 비면 구와 같은 문구로 거부하고 접속하지 않는다', async () => {
    const { outcome, requests } = await runTool(readStructure, { structure_name: '' }, () => ({
      body: '',
    }));
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: structure_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });
});
