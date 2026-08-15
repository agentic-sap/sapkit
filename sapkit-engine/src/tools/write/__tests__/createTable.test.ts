/**
 * `CreateTable` — 검증 → 언어 조회 → 생성 → (MANDT 스켈레톤 적용).
 *
 * 구 핸들러(`engine/src/handlers/table/high/handleCreateTable.ts`)의 요점 셋을
 * 못박는다:
 *
 *  1. **생성 페이로드의 `adtcore:description`은 사용자 설명이 아니라 테이블
 *     이름이다.** 벤더 `createTable`이 `limitDescription(params.table_name)`을
 *     쓰고, 사용자 설명은 **검증 요청에만** 실린다
 *     (`core/table/create.js:26` · `core/table/AdtTable.js:70-79`).
 *  2. **스켈레톤 적용은 최선 노력이다.** 실패해도 테이블은 이미 만들어졌으므로
 *     오류가 아니라 `skeleton: 'client-fallback'`으로 답한다.
 *  3. 응답 JSON에 **들여쓰기가 없다** — `Update*` 둘과 다른 자리다.
 */

import { invoke, jsonOf, lockBody, plainText, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';
import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { createTable } from '../createTable';

const VALIDATION = '/sap/bc/adt/ddic/tables/validation';
const COLLECTION = '/sap/bc/adt/ddic/tables';
const SYSTEMINFO = '/sap/bc/adt/core/http/systeminformation';
const LOCK_URI = '/sap/bc/adt/ddic/tables/ZTST_TABLE';
const SOURCE_URI = '/sap/bc/adt/ddic/tables/ztst_table';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

interface Scenario {
  readonly language?: string;
  readonly systemInfoStatus?: number;
  readonly createStatus?: number;
  readonly createBody?: string;
  readonly lockStatus?: number;
  readonly putStatus?: number;
}

function responder(scenario: Scenario = {}) {
  return ((request, response) => {
    if (request.path === VALIDATION) {
      return xml(response, '<asx:abap><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>');
    }
    if (request.path === SYSTEMINFO) {
      if (scenario.systemInfoStatus) return xml(response, '<err/>', scenario.systemInfoStatus);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: scenario.language ?? 'CS' }));
    }
    if (request.path === COLLECTION && request.method === 'POST') {
      if (scenario.createStatus) return xml(response, scenario.createBody ?? '<err/>', scenario.createStatus);
      return xml(response, '<created/>');
    }
    if (request.path === LOCK_URI && request.query.get('_action') === 'LOCK') {
      if (scenario.lockStatus) return xml(response, '<err/>', scenario.lockStatus);
      return xml(response, lockBody('LOCK-1'));
    }
    if (request.path === LOCK_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === `${SOURCE_URI}/source/main` && request.method === 'PUT') {
      if (scenario.putStatus) return xml(response, '<err/>', scenario.putStatus);
      return plainText(response, '');
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(createTable)).toEqual(publishedDeclaration('CreateTable'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/cloud · mutation', () => {
    expect(createTable.definition.sets).toEqual(['high']);
    expect(createTable.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createTable.definition.kind).toBe('mutation');
    expect(createTable.definition.targetNames).toEqual(['table_name']);
  });
});

describe('CreateTable 시퀀스', () => {
  it('검증 → 언어 조회 → 생성 → 잠금 → PUT → 해제 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createTable, harness, {
      table_name: 'ztst_table',
      package_name: '$TMP',
      description: 'My Table',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${VALIDATION}`,
      `GET ${SYSTEMINFO}`,
      `POST ${COLLECTION}`,
      `POST ${LOCK_URI}`,
      `PUT ${SOURCE_URI}/source/main`,
      `POST ${LOCK_URI}`,
    ]);
  });

  it('검증 요청에는 **사용자 설명**이 실린다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
      description: 'My Table',
    });
    const validation = harness.nth(0);
    expect(validation.query.get('objtype')).toBe('tabldt');
    expect(validation.query.get('objname')).toBe('ZTST_TABLE');
    expect(validation.query.get('description')).toBe('My Table');
  });

  it('설명이 없으면 검증에도 테이블 이름이 실린다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createTable, harness, { table_name: 'ZTST_TABLE', package_name: '$TMP' });
    expect(harness.nth(0).query.get('description')).toBe('ZTST_TABLE');
  });

  it('생성 페이로드의 description은 사용자 설명이 **아니라 테이블 이름**이다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$tmp',
      description: 'My Table',
    });
    const create = harness.nth(2);
    // 벤더 `createTable`이 params.description을 아예 받지 않는다.
    expect(create.body).toContain('adtcore:description="ZTST_TABLE"');
    expect(create.body).not.toContain('My Table');
    expect(create.body).toContain('adtcore:type="TABL/DT"');
    expect(create.body).toContain('adtcore:name="ZTST_TABLE"');
    // 패키지 이름은 대문자로 올려 보낸다.
    expect(create.body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.tables.v2+xml');
    expect(create.headers['accept']).toBe(
      'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml',
    );
  });

  it('로그온 언어를 조회해 페이로드에 박는다 (EN 고정이 아니다)', async () => {
    harness = await startWriteHarness(responder({ language: 'CS' }));
    await invoke(createTable, harness, { table_name: 'ZTST_TABLE', package_name: '$TMP' });
    expect(harness.nth(2).body).toContain('adtcore:language="CS"');
    expect(harness.nth(2).body).toContain('adtcore:masterLanguage="CS"');
  });

  it('언어 조회가 실패하면 EN으로 떨어진다 — 생성은 계속된다', async () => {
    harness = await startWriteHarness(responder({ systemInfoStatus: 500 }));
    const result = await invoke(createTable, harness, { table_name: 'ZTST_TABLE', package_name: '$TMP' });
    expect(result.isError).toBe(false);
    expect(harness.nth(2).body).toContain('adtcore:masterLanguage="EN"');
  });

  it('전송요청은 생성 POST의 corrNr로 나간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: 'ZPKG',
      transport_request: 'E19K905635',
    });
    expect(harness.nth(2).query.get('corrNr')).toBe('E19K905635');
    expect(harness.nth(4).query.get('corrNr')).toBe('E19K905635');
  });

  it('전송요청이 없으면 corrNr을 붙이지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createTable, harness, { table_name: 'ZTST_TABLE', package_name: '$TMP' });
    expect(harness.nth(2).query.has('corrNr')).toBe(false);
  });
});

describe('MANDT 스켈레톤', () => {
  it('SAP 기본 abap.clnt 대신 MANDT 데이터 엘리먼트를 밀어 넣는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
      description: "Bob's Table",
    });
    const put = harness.nth(4);
    expect(put.body).toContain('key mandt : mandt not null;');
    expect(put.body).not.toContain('abap.clnt');
    expect(put.body).toContain('@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE');
    expect(put.body).toContain('@AbapCatalog.tableCategory : #TRANSPARENT');
    expect(put.body).toContain('@AbapCatalog.deliveryClass : #A');
    expect(put.body).toContain('@AbapCatalog.dataMaintenance : #RESTRICTED');
    expect(put.body).toContain('define table ztst_table {');
    // 작은따옴표는 DDL 규칙대로 두 번 찍어 이스케이프한다.
    expect(put.body).toContain("@EndUserText.label : 'Bob''s Table'");
    expect(put.query.get('lockHandle')).toBe('LOCK-1');
  });

  it('스켈레톤이 성공하면 skeleton=mandt로 답한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
    });
    const payload = jsonOf(result);
    expect(payload['skeleton']).toBe('mandt');
    expect(payload['message']).toContain('created with MANDT skeleton');
  });

  it('스켈레톤 PUT이 실패해도 생성 자체는 성공이다 (최선 노력)', async () => {
    harness = await startWriteHarness(responder({ putStatus: 423 }));
    const result = await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(false);
    const payload = jsonOf(result);
    expect(payload['success']).toBe(true);
    expect(payload['skeleton']).toBe('client-fallback');
    expect(payload['message']).toContain('MANDT skeleton apply FAILED');
  });

  it('잠금이 실패해도 생성 자체는 성공이다', async () => {
    harness = await startWriteHarness(responder({ lockStatus: 423 }));
    const result = await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result)['skeleton']).toBe('client-fallback');
    expect(harness.client.activeLocks()).toHaveLength(0);
  });
});

describe('응답 형태', () => {
  it('구와 같은 여섯 키를 **들여쓰기 없이** 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createTable, harness, {
      table_name: 'ztst_table',
      package_name: '$TMP',
      transport_request: 'E19K905635',
    });
    const payload = jsonOf(result);
    expect(Object.keys(payload)).toEqual([
      'success',
      'table_name',
      'package_name',
      'transport_request',
      'skeleton',
      'message',
    ]);
    expect(payload['table_name']).toBe('ZTST_TABLE');
    expect(payload['package_name']).toBe('$TMP');
    // `Update*` 둘과 달리 들여쓰기가 없다(`handleCreateTable.ts:200`).
    expect(textOf(result)).toBe(JSON.stringify(payload));
  });

  it('전송요청이 없으면 local이다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createTable, harness, { table_name: 'ZTST_TABLE', package_name: '$TMP' });
    expect(jsonOf(result)['transport_request']).toBe('local');
  });
});

describe('실패 경로', () => {
  it('이미 있는 테이블은 전용 문구로 답한다', async () => {
    harness = await startWriteHarness(responder({ createStatus: 409, createBody: '<err/>' }));
    const result = await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Table ZTST_TABLE already exists. Please delete it first or use a different name.',
    );
  });

  it('그 밖의 생성 실패는 구와 같은 문구로 접힌다', async () => {
    harness = await startWriteHarness(responder({ createStatus: 500 }));
    const result = await invoke(createTable, harness, {
      table_name: 'ZTST_TABLE',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Failed to create table ZTST_TABLE:');
  });

  it('인자가 비면 SAP에 아무것도 보내지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const noName = await invoke(createTable, harness, { table_name: '', package_name: '$TMP' });
    expect(noName.isError).toBe(true);
    expect(textOf(noName)).toBe('Table name is required');

    const noPackage = await invoke(createTable, harness, { table_name: 'ZTST_TABLE', package_name: '' });
    expect(noPackage.isError).toBe(true);
    expect(textOf(noPackage)).toBe('Package name is required');

    expect(harness.calls()).toHaveLength(0);
  });

  it('ECC에서는 CDS 스켈레톤을 보내지 않고 OData 통로를 안내한다', async () => {
    harness = await startWriteHarness(responder());
    const ecc = { ...harness.context, profile: { ...harness.context.profile, sapVersion: 'ECC' } };
    const result = await createTable.handler(ecc, { table_name: 'ZTST_TABLE', package_name: '$TMP' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('CreateTable is not supported on ECC');
    expect(result.content[0]?.text).toContain('DD02V + DD03P');
    expect(harness.calls()).toHaveLength(0);
  });
});
