/**
 * `ReadView` — 발행 계약 · 두 왕복의 와이어 · 최선 노력 갈래.
 *
 * 기대값은 전부 구 엔진 실측에서 뽑았다:
 *  - 선언 = `harness/old-surface/m1-tools.json`의 `tools`(전량 186종)
 *  - 소스 왕복 = `AdtUtils.js`의 `getObjectSourceUri` case `'view'` + Accept `text/plain`
 *  - 메타데이터 왕복 = `getObjectMetadataUri` case `'view'`(`/source/main` 없음,
 *    질의 인자 없음) + `getMetadataAcceptHeader` case `'view'` = `CT_VIEW`
 *  - 최선 노력 = `engine/src/handlers/view/readonly/handleReadView.ts:45-72`
 *    (두 블록이 각자 try/catch이고 실패는 경고로만 남는다)
 */

import { readView } from '../readView';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const DDL = "define view Z_I_TEST as select from t000 { mandt }";
const META =
  '<?xml version="1.0" encoding="UTF-8"?><ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources" adtcore:name="Z_I_TEST" adtcore:responsible="DEV"/>';

const SOURCE_URL = `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST/source/main?version=active`;
const META_URL = `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST`;

/** 첫 요청은 소스, 둘째는 메타데이터. 순서가 계약이다. */
function reply(source: { status?: number; body?: string }, meta: { status?: number; body?: string }) {
  return (_request: unknown, index: number) => (index === 0 ? source : meta);
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readView);
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
      }).toEqual(publishedDeclaration('ReadView'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // 구 경로 `engine/src/handlers/view/readonly/handleReadView.ts` → readonly 집합.
    // 채록본 exposures의 네 조건 전부에 뜨는 뷰 도구는 이것뿐이다.
    expect(readView.definition.sets).toEqual(['readonly']);
    expect(readView.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(readView.definition.kind).toBe('read');
  });
});

describe('와이어 — 두 왕복', () => {
  it('소스 → 메타데이터 순으로 나가고, Accept가 서로 다르다', async () => {
    const { requests } = await runTool(
      readView,
      { view_name: 'Z_I_TEST' },
      reply({ body: DDL }, { body: META }),
    );

    const sent = toolRequests(requests);
    expect(sent.map((entry) => `${entry.method} ${entry.url}`)).toEqual([
      `GET ${SOURCE_URL}`,
      `GET ${META_URL}`,
    ]);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
    expect(sent[1]?.headers['Accept']).toBe('application/vnd.sap.adt.ddlSource+xml');
  });

  it('메타데이터 왕복에는 version이 실리지 않는다', async () => {
    const { requests } = await runTool(
      readView,
      { view_name: 'Z_I_TEST', version: 'inactive' },
      reply({ body: DDL }, { body: META }),
    );

    const sent = toolRequests(requests);
    expect(sent[0]?.url).toContain('?version=inactive');
    expect(sent[1]?.url).toBe(META_URL);
    expect(sent[1]?.url).not.toContain('version');
  });

  it('뷰 종류로 경로가 갈리지 않는다 — 둘 다 DDLS 하나로 간다', async () => {
    const { requests } = await runTool(
      readView,
      { view_name: 'ZVCLASSIC' },
      reply({ body: DDL }, { body: META }),
    );

    for (const entry of toolRequests(requests)) {
      expect(entry.url).toContain('/sap/bc/adt/ddic/ddl/sources/');
      expect(entry.url).not.toContain('/sap/bc/adt/ddic/views/');
    }
  });
});

describe('응답과 최선 노력 갈래', () => {
  it('구와 같은 키로 싣는다 — source_code · metadata', async () => {
    const { outcome } = await runTool(
      readView,
      { view_name: 'z_i_test' },
      reply({ body: DDL }, { body: META }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      view_name: 'Z_I_TEST',
      version: 'active',
      source_code: DDL,
      metadata: META,
    });
  });

  it('소스가 죽어도 메타데이터는 그대로 시도한다', async () => {
    const { outcome, requests } = await runTool(
      readView,
      { view_name: 'Z_I_TEST' },
      reply({ status: 500, body: '<html>boom</html>' }, { body: META }),
    );

    expect(toolRequests(requests)).toHaveLength(2);
    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text);
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(META);
  });

  it('메타데이터만 죽어도 성공이다', async () => {
    const { outcome } = await runTool(
      readView,
      { view_name: 'Z_I_TEST' },
      reply({ body: DDL }, { status: 404, body: '<exc:exception/>' }),
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text);
    expect(payload.source_code).toBe(DDL);
    expect(payload.metadata).toBeNull();
  });

  it('빈 본문은 200이어도 null로 남는다 (구는 truthy 검사다)', async () => {
    const { outcome } = await runTool(
      readView,
      { view_name: 'Z_I_TEST' },
      reply({ body: '' }, { body: '' }),
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text);
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });

  it('view_name이 비면 접속을 만들지 않고 거부한다', async () => {
    const { outcome, requests } = await runTool(readView, { view_name: '' }, () => ({ body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: view_name is required');
    expect(requests).toHaveLength(0);
  });
});
