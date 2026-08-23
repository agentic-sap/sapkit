/**
 * `CreateDomain` — 발행 계약 · 사슬의 와이어 · 잠금 세션 · 갈래 · **짝 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.CreateDomain`
 *  - 사슬: `engine/src/handlers/domain/high/handleCreateDomain.ts:139-344`
 *  - 각 단계의 주소·헤더·본문:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/domain/`의 `validation.js` ·
 *    `create.js` · `lock.js` · `update.js` · `check.js` · `unlock.js` ·
 *    `activation.js` → `utils/activationUtils.js:116-133`
 *  - 껍데기 XML의 모양: 구 엔진 시험의 IDES 실측 사본
 *    (`engine/src/__tests__/unit/createLogonLanguageConsistency.test.ts:58-65`)
 *  - **잠금부터 해제까지 stateful** · **생성 페이로드의 로그온 언어**: 같은 폴더의
 *    구 엔진 가족 회귀시험 둘.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool, ToolContext, ToolResult } from '../../../server';
import { createDataElement } from '../createDataElement';
import { createDomain } from '../createDomain';
import {
  type WriteHarness,
  cleanCheckRun,
  jsonOf,
  lockBody,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const OBJECT = '/sap/bc/adt/ddic/domains/zd_foo';

/** IDES에서 실측된 껍데기 — 설명이 없고, 길이 요소가 **두 곳**에 있다. */
const SKELETON =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<doma:domain adtcore:masterLanguage="CS" adtcore:name="ZD_FOO" adtcore:type="DOMA/DD" ' +
  'xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<adtcore:packageRef adtcore:name="$TMP"/>' +
  '<doma:content>' +
  '<doma:typeInformation><doma:datatype/><doma:length>000000</doma:length><doma:decimals>000000</doma:decimals></doma:typeInformation>' +
  '<doma:outputInformation><doma:length>000000</doma:length><doma:style>00</doma:style>' +
  '<doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase></doma:outputInformation>' +
  '<doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues/></doma:valueInformation>' +
  '</doma:content></doma:domain>';

function failingCheck(text: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">' +
    '<chkrun:checkMessageList>' +
    `<chkrun:checkMessage chkrun:type="E" chkrun:shortText="${text}" line="1"/>` +
    '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>'
  );
}

interface Overrides {
  readonly language?: string | null;
  readonly check?: string;
  readonly activation?: string;
  readonly createStatus?: number;
  readonly createBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    const query = request.query;
    if (request.path.endsWith('/validation')) {
      return xml(response, '<asx:abap><asx:values><DATA><SEVERITY>OK</SEVERITY></DATA></asx:values></asx:abap>');
    }
    if (request.path === '/sap/bc/adt/core/http/systeminformation') {
      if (overrides.language === null) return xml(response, 'nope', 404);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: overrides.language ?? 'CS' }));
    }
    if (query.get('_action') === 'LOCK') return xml(response, lockBody('LOCK-1'));
    if (query.get('_action') === 'UNLOCK') return xml(response, '');
    if (request.path === '/sap/bc/adt/ddic/domains' && request.method === 'POST') {
      return xml(response, overrides.createBody ?? '<created/>', overrides.createStatus ?? 201);
    }
    if (request.path === OBJECT && request.method === 'GET') return xml(response, SKELETON);
    if (request.path === OBJECT && request.method === 'PUT') return xml(response, '');
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, overrides.check ?? cleanCheckRun());
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, overrides.activation ?? '<chkl:messages/>');
    }
    return xml(response, '<unexpected/>', 500);
  });
}

const ARGS = {
  domain_name: 'ZD_FOO',
  description: 'demo domain',
  package_name: '$TMP',
  datatype: 'CHAR',
  length: 10,
  decimals: 0,
} as const;

function run(
  harness: WriteHarness,
  args: Record<string, unknown> = { ...ARGS },
  env: Record<string, string> = { SAP_USERNAME: 'TESTER' },
): Promise<ToolResult> {
  return Promise.resolve(createDomain.handler({ ...harness.context, env }, args));
}

// ── 발행 계약 ───────────────────────────────────────────────────────────────

const CAPTURED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json'), 'utf8'),
) as { tools: Record<string, unknown> };

async function publish(tool: SapTool): Promise<Record<string, unknown>> {
  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/entry.js', '--exposition=readonly,high'],
    env: {},
    cwd: process.cwd(),
    homedir: process.cwd(),
  });
  const core = createServerCore({ startup, tools: [tool], stderr: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'create-doma-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    const found = listed.tools.find((entry) => entry.name === tool.definition.name);
    if (!found) throw new Error(`${tool.definition.name}이 tools/list에 없다`);
    return found as unknown as Record<string, unknown>;
  } finally {
    await client.close();
    await core.server.close();
  }
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    const published = await publish(createDomain);
    expect(published).toEqual(CAPTURED.tools.CreateDomain);
  });

  it('노출·정책 선언은 구 핸들러의 자리와 선언을 그대로 옮겼다', () => {
    expect(createDomain.definition.sets).toEqual(['high']);
    expect(createDomain.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createDomain.definition.kind).toBe('mutation');
    expect(createDomain.definition.targetNames).toEqual(['domain_name']);
  });

  it('`package_name`은 발행 스키마의 required에 없지만 핸들러는 요구한다 (구의 어긋남 그대로)', () => {
    const schema = CAPTURED.tools.CreateDomain as { inputSchema: { required: string[] } };
    expect(schema.inputSchema.required).toEqual(['domain_name']);
  });
});

// ── 사슬의 와이어 ───────────────────────────────────────────────────────────

describe('사슬', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    await harness?.close();
  });

  it('구와 같은 순서로 아홉 요청을 보낸다', async () => {
    harness = await harnessFor();
    const result = await run(harness);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /sap/bc/adt/ddic/domains/validation?objtype=doma&objname=ZD_FOO&packagename=%24TMP&description=demo%20domain',
      'GET /sap/bc/adt/core/http/systeminformation',
      'POST /sap/bc/adt/ddic/domains',
      `POST ${OBJECT}?_action=LOCK&accessMode=MODIFY`,
      `GET ${OBJECT}`,
      `PUT ${OBJECT}?lockHandle=LOCK-1`,
      'POST /sap/bc/adt/checkruns?reporters=abapCheckRun',
      `POST ${OBJECT}?_action=UNLOCK&lockHandle=LOCK-1`,
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
  });

  it('검사는 **해제 앞**이다 — 데이터 엘리먼트와 순서가 반대다', async () => {
    harness = await harnessFor();
    await run(harness);

    const urls = harness.calls().map((call) => call.url);
    const check = urls.findIndex((url) => url.includes('/checkruns'));
    const unlock = urls.findIndex((url) => url.includes('_action=UNLOCK'));
    expect(check).toBeGreaterThan(-1);
    expect(unlock).toBeGreaterThan(check);
  });

  it('잠금부터 해제까지 모든 요청이 stateful이다 — 검사도 그 창 안이다', async () => {
    harness = await harnessFor();
    await run(harness);

    const calls = harness.calls();
    const lockAt = calls.findIndex((call) => call.url.includes('_action=LOCK'));
    const unlockAt = calls.findIndex((call) => call.url.includes('_action=UNLOCK'));

    for (const call of calls.slice(lockAt, unlockAt + 1)) {
      expect(`${call.method} ${call.path} -> ${call.headers['x-sap-adt-sessiontype']}`).toBe(
        `${call.method} ${call.path} -> stateful`,
      );
    }
    expect(calls.slice(lockAt, unlockAt + 1).some((call) => call.path === '/sap/bc/adt/checkruns')).toBe(
      true,
    );
  });

  it('각 단계가 구가 싣던 콘텐츠 타입을 그대로 싣는다', async () => {
    harness = await harnessFor();
    await run(harness);
    const calls = harness.calls();

    expect(calls[0]?.headers.accept).toBe('application/vnd.sap.as+xml');
    expect(calls[2]?.headers['content-type']).toBe('application/vnd.sap.adt.domains.v2+xml');
    expect(calls[2]?.headers.accept).toBe(
      'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
    );
    expect(calls[5]?.headers['content-type']).toBe(
      'application/vnd.sap.adt.domains.v2+xml; charset=utf-8',
    );
    // 도메인 활성화는 활성화 전용 타입이다 — 데이터 엘리먼트는 `application/xml`이다.
    expect(calls[8]?.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
  });

  it('전송요청은 생성 POST와 PUT 양쪽에 corrNr로 붙는다', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS, transport_request: 'E19K905635' });

    const calls = harness.calls();
    expect(calls[2]?.url).toBe('/sap/bc/adt/ddic/domains?corrNr=E19K905635');
    expect(calls[5]?.url).toBe(`${OBJECT}?lockHandle=LOCK-1&corrNr=E19K905635`);
  });

  it('activate:false면 활성화를 보내지 않는다', async () => {
    harness = await harnessFor();
    const result = await run(harness, { ...ARGS, activate: false });

    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result).status).toBe('inactive');
    expect(jsonOf(result).message).toBe('Domain ZD_FOO created successfully');
  });
});

// ── 생성 페이로드 ───────────────────────────────────────────────────────────

describe('생성 페이로드', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    await harness?.close();
  });

  it('시스템 로그온 언어를 싣는다 (EN을 박지 않는다)', async () => {
    harness = await harnessFor({ language: 'CS' });
    await run(harness);

    const body = harness.nth(2).body;
    expect(body).toContain('adtcore:language="CS"');
    expect(body).toContain('adtcore:masterLanguage="CS"');
    expect(body).not.toContain('adtcore:language="EN"');
  });

  it('systeminformation이 없으면 EN으로 떨어진다', async () => {
    harness = await harnessFor({ language: null });
    const result = await run(harness);

    expect(result.isError).toBe(false);
    expect(harness.nth(2).body).toContain('adtcore:masterLanguage="EN"');
  });

  it('구가 조립하던 XML의 뼈대를 그대로 싣는다 — 타입 정보는 담지 않는다', async () => {
    harness = await harnessFor();
    await run(harness);
    const body = harness.nth(2).body;

    expect(body).toContain('adtcore:type="DOMA/DD"');
    expect(body).toContain('adtcore:name="ZD_FOO"');
    expect(body).toContain('adtcore:description="demo domain"');
    expect(body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
    // 껍데기 생성은 datatype/length를 싣지 않는다 — 그것은 뒤의 PUT 몫이다.
    expect(body).not.toContain('doma:datatype');
  });

  it('`adtcore:responsible`은 값이 없으면 **속성 자체가 빠진다** (데이터 엘리먼트와 다르다)', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS }, {});

    expect(harness.nth(2).body).not.toContain('adtcore:responsible');
  });

  it('SAP_USERNAME이 있으면 responsible에 실린다', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS }, { SAP_USERNAME: 'TESTER' });

    expect(harness.nth(2).body).toContain('adtcore:responsible="TESTER"');
  });
});

// ── 읽기-수정-쓰기 ──────────────────────────────────────────────────────────

describe('읽기-수정-쓰기', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    await harness?.close();
  });

  it('설명이 빠진 껍데기에 `adtcore:description`을 새로 넣고 타입 정보를 채운다', async () => {
    harness = await harnessFor();
    await run(harness);
    const put = harness.nth(5).body;

    expect(SKELETON).not.toContain('adtcore:description');
    expect(put).toContain('adtcore:description="demo domain"');
    expect(put).toContain('<doma:datatype>CHAR</doma:datatype>');
    expect(put).toContain('<doma:decimals>0</doma:decimals>');
    expect(put).toContain('<doma:signExists>false</doma:signExists>');
    expect(put).toContain('<doma:lowercase>false</doma:lowercase>');
  });

  it('`doma:length`는 **첫 번째만** 갈아 끼운다 (구의 비전역 치환 그대로)', async () => {
    harness = await harnessFor();
    await run(harness);
    const put = harness.nth(5).body;

    // typeInformation 쪽만 바뀌고 outputInformation 쪽은 껍데기 값 그대로다.
    expect(put).toContain('<doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>10</doma:length>');
    expect(put).toContain('<doma:outputInformation><doma:length>000000</doma:length>');
  });

  it('주지 않은 conversion_exit·value_table·fixed_values는 건드리지 않는다', async () => {
    harness = await harnessFor();
    await run(harness);
    const put = harness.nth(5).body;

    expect(put).toContain('<doma:conversionExit/>');
    expect(put).toContain('<doma:valueTableRef/>');
    expect(put).toContain('<doma:fixValues/>');
  });

  it('고정값을 주면 블록을 통째로 갈아 끼운다', async () => {
    harness = await harnessFor();
    await run(harness, {
      ...ARGS,
      fixed_values: [
        { low: '001', text: 'first' },
        { low: '002', text: 'second' },
      ],
    });
    const put = harness.nth(5).body;

    expect(put).toContain('<doma:low>001</doma:low>');
    expect(put).toContain('<doma:text>second</doma:text>');
    expect(put).not.toContain('<doma:fixValues/>');
  });

  it('값 테이블을 주면 참조 블록을 짓는다 (URI는 소문자)', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS, value_table: 'ZTAB_FOO' });

    expect(harness.nth(5).body).toContain(
      '<doma:valueTableRef adtcore:uri="/sap/bc/adt/ddic/tables/ztab_foo" adtcore:type="TABL/DT" adtcore:name="ZTAB_FOO"/>',
    );
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    await harness?.close();
  });

  it('검사 오류는 실패다 — **무시 목록이 없다**', async () => {
    harness = await harnessFor({ check: failingCheck('Field is unknown') });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Failed to create domain ZD_FOO: Domain check failed: Field is unknown',
    );
  });

  it('데이터 엘리먼트가 삼키던 잡음도 도메인에서는 실패다 (짝 대조)', async () => {
    harness = await harnessFor({ check: failingCheck('Error importing from database') });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Domain check failed: Error importing from database');
  });

  it('검사가 실패하면 잠금이 풀린다 (검사가 창 안이므로)', async () => {
    harness = await harnessFor({ check: failingCheck('boom') });
    await run(harness);

    expect(harness.calls().some((call) => call.url.includes('_action=UNLOCK'))).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화 응답은 판정하지 않는다 — 200이면 성공으로 보고한다 (구 그대로)', async () => {
    // 데이터 엘리먼트였다면 이 응답은 실패로 뒤집힌다. 도메인은 보지 않는다.
    harness = await harnessFor({
      activation:
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
        '<chkl:properties activationExecuted="false" checkExecuted="false"/></chkl:messages>',
    });
    const result = await run(harness);

    expect(result.isError).toBe(false);
    expect(jsonOf(result).status).toBe('active');
  });

  it('이미 있으면 전용 문구로 답한다', async () => {
    harness = await harnessFor({
      createStatus: 403,
      createBody:
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<type id="ExceptionResourceAlreadyExists"/><message lang="EN">exists</message></exc:exception>',
    });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Domain ZD_FOO already exists. Please delete it first or use a different name.',
    );
  });

  it.each([
    [{ ...ARGS, domain_name: '' }, 'Domain name is required'],
    [{ ...ARGS, package_name: '' }, 'Package name is required'],
  ])('필수 인자가 없으면 접속을 얻기 전에 거부한다', async (args, message) => {
    harness = await harnessFor();
    const result = await run(harness, args as Record<string, unknown>);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
    expect(harness.calls()).toHaveLength(0);
  });

  it('SAP_VERSION=ECC면 브리지 미구현을 알리고 아무것도 보내지 않는다 (차이 장부 D61)', async () => {
    harness = await harnessFor();
    const context: ToolContext = {
      ...harness.context,
      profile: { ...harness.context.profile, sapVersion: 'ECC' },
      env: {},
    };
    const result = await Promise.resolve(createDomain.handler(context, { ...ARGS }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ZSAPKIT_ADT_DDIC_DOMA');
    expect(textOf(result)).toContain('D61');
    expect(harness.calls()).toHaveLength(0);
  });
});

// ── 응답 ────────────────────────────────────────────────────────────────────

describe('응답', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    await harness?.close();
  });

  it('구와 같은 필드로, **한 줄로** 낸다 (데이터 엘리먼트는 두 칸 들여쓴다)', async () => {
    harness = await harnessFor();
    const result = await run(harness, { ...ARGS, transport_request: 'E19K905635' });

    expect(jsonOf(result)).toEqual({
      success: true,
      domain_name: 'ZD_FOO',
      package: '$TMP',
      transport_request: 'E19K905635',
      status: 'active',
      message: 'Domain ZD_FOO created and activated successfully',
      domain_details: null,
    });
    expect(textOf(result)).not.toContain('\n');
  });

  it('전송요청이 없으면 그 키가 통째로 빠진다', async () => {
    harness = await harnessFor();
    const result = await run(harness);

    expect(Object.keys(jsonOf(result))).not.toContain('transport_request');
    expect(jsonOf(result).domain_details).toBeNull();
  });
});

// ── 짝 대조 ─────────────────────────────────────────────────────────────────

describe('짝 대조 — `CreateDataElement` ↔ `CreateDomain`', () => {
  it('`activate` 인자는 도메인에만 있다', () => {
    const dtel = CAPTURED.tools.CreateDataElement as { inputSchema: { properties: object } };
    const doma = CAPTURED.tools.CreateDomain as { inputSchema: { properties: object } };

    expect(Object.keys(dtel.inputSchema.properties)).not.toContain('activate');
    expect(Object.keys(doma.inputSchema.properties)).toContain('activate');
  });

  it('두 도구 모두 mutation이고 대상-이름을 선언한다', () => {
    expect(createDataElement.definition.kind).toBe('mutation');
    expect(createDomain.definition.kind).toBe('mutation');
    expect(createDataElement.definition.targetNames).toEqual(['data_element_name']);
    expect(createDomain.definition.targetNames).toEqual(['domain_name']);
  });
});
