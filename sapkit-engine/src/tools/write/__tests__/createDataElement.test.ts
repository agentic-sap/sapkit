/**
 * `CreateDataElement` — 발행 계약 · 사슬의 와이어 · 잠금 세션 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.CreateDataElement`
 *  - 사슬: `engine/src/handlers/data_element/high/handleCreateDataElement.ts:155-339`
 *  - 각 단계의 주소·헤더·본문:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/`의
 *    `validation.js` · `create.js` · `lock.js` · `update.js` · `unlock.js` ·
 *    `check.js` · `activation.js`
 *  - **잠금부터 해제까지 stateful**: 구 엔진 자신의 시험
 *    `engine/src/__tests__/unit/createHandlersStatefulSessionFamily.test.ts`
 *  - **생성 페이로드의 로그온 언어**: 구 엔진 자신의 시험
 *    `engine/src/__tests__/unit/createLogonLanguageConsistency.test.ts`
 *
 * 실 SAP에는 한 바이트도 나가지 않는다 — 하네스의 in-process 시험 서버가 받는다.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool, ToolContext, ToolResult } from '../../../server';
import { createDataElement } from '../createDataElement';
import {
  type WriteHarness,
  cleanCheckRun,
  jsonOf,
  lockBody,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const OBJECT = '/sap/bc/adt/ddic/dataelements/ze_foo';

/** 갓 만들어져 **설명이 빠진** 껍데기 — 실측된 병리(11-⑧)의 모양이다. */
const SKELETON =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" ' +
  'xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" adtcore:masterLanguage="CS" adtcore:name="ZE_FOO" adtcore:type="DTEL/DE">' +
  '<dtel:dataElement><dtel:typeKind>domain</dtel:typeKind><dtel:typeName/>' +
  '<dtel:dataType/><dtel:dataTypeLength>000000</dtel:dataTypeLength><dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>' +
  '<dtel:shortFieldLabel/><dtel:shortFieldLength>10</dtel:shortFieldLength>' +
  '</dtel:dataElement></blue:wbobj>';

function activationOk(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    '<chkl:properties activationExecuted="true" checkExecuted="true"/>' +
    '</chkl:messages>'
  );
}

function activationRefused(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    '<chkl:properties activationExecuted="false" checkExecuted="true"/>' +
    '</chkl:messages>'
  );
}

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

/** 사슬 전체가 흐르는 표준 응답기. `overrides`로 한 단계만 바꿔 갈래를 시험한다. */
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
    if (request.path === '/sap/bc/adt/ddic/dataelements' && request.method === 'POST') {
      return xml(response, overrides.createBody ?? '<created/>', overrides.createStatus ?? 201);
    }
    if (request.path === OBJECT && request.method === 'GET') return xml(response, SKELETON);
    if (request.path === OBJECT && request.method === 'PUT') return xml(response, '');
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, overrides.check ?? cleanCheckRun());
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, overrides.activation ?? activationOk());
    }
    return xml(response, '<unexpected/>', 500);
  });
}

/** 표준 인자 — zod 기본값에 기대지 않도록 전부 명시한다. */
const ARGS = {
  data_element_name: 'ZE_FOO',
  description: 'demo element',
  package_name: '$TMP',
  data_type: 'CHAR',
  length: 10,
  decimals: 0,
  type_kind: 'domain',
  type_name: 'ZD_FOO',
} as const;

function withEnv(harness: WriteHarness, env: Record<string, string>): ToolContext {
  return { ...harness.context, env };
}

function run(
  harness: WriteHarness,
  args: Record<string, unknown> = { ...ARGS },
  env: Record<string, string> = { SAP_USERNAME: 'TESTER' },
): Promise<ToolResult> {
  return Promise.resolve(createDataElement.handler(withEnv(harness, env), args));
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
  const client = new Client({ name: 'create-dtel-test', version: '0.0.0' });
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
    const published = await publish(createDataElement);
    expect(published).toEqual(CAPTURED.tools.CreateDataElement);
  });

  it('노출·정책 선언은 구 핸들러의 자리와 선언을 그대로 옮겼다', () => {
    // `engine/src/handlers/data_element/high/` → 채록본의 `*_default` 두 조건에만 뜬다.
    expect(createDataElement.definition.sets).toEqual(['high']);
    expect(createDataElement.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createDataElement.definition.kind).toBe('mutation');
    // mutation이면 대상-이름 선언이 필수다 (녹화 사전 검사가 읽는다).
    expect(createDataElement.definition.targetNames).toEqual(['data_element_name']);
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
      'POST /sap/bc/adt/ddic/dataelements/validation?objtype=dtel&objname=ZE_FOO&packagename=%24TMP&description=demo%20element',
      'GET /sap/bc/adt/core/http/systeminformation',
      'POST /sap/bc/adt/ddic/dataelements',
      `POST ${OBJECT}?_action=LOCK&accessMode=MODIFY`,
      `GET ${OBJECT}`,
      `PUT ${OBJECT}?lockHandle=LOCK-1`,
      `POST ${OBJECT}?_action=UNLOCK&lockHandle=LOCK-1`,
      'POST /sap/bc/adt/checkruns?reporters=abapCheckRun',
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
  });

  it('검사는 **해제 뒤**다 — 도메인과 순서가 반대다', async () => {
    harness = await harnessFor();
    await run(harness);

    const paths = harness.calls().map((call) => call.url);
    const unlock = paths.findIndex((url) => url.includes('_action=UNLOCK'));
    const check = paths.findIndex((url) => url.includes('/checkruns'));
    expect(unlock).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(unlock);
  });

  it('잠금부터 해제까지 모든 요청이 stateful이다 (구 엔진 가족 회귀시험의 계약)', async () => {
    harness = await harnessFor();
    await run(harness);

    const calls = harness.calls();
    const lockAt = calls.findIndex((call) => call.url.includes('_action=LOCK'));
    const unlockAt = calls.findIndex((call) => call.url.includes('_action=UNLOCK'));
    expect(lockAt).toBeGreaterThan(-1);
    expect(unlockAt).toBeGreaterThan(lockAt + 1);

    for (const call of calls.slice(lockAt, unlockAt + 1)) {
      expect(`${call.method} ${call.path} -> ${call.headers['x-sap-adt-sessiontype']}`).toBe(
        `${call.method} ${call.path} -> stateful`,
      );
    }
    // 창 밖은 stateless다 — 잠금이 끝나면 되돌려 놓는다.
    expect(calls[0]?.headers['x-sap-adt-sessiontype']).toBeUndefined();
  });

  it('각 단계가 구가 싣던 콘텐츠 타입을 그대로 싣는다', async () => {
    harness = await harnessFor();
    await run(harness);
    const calls = harness.calls();

    expect(calls[0]?.headers.accept).toBe('application/vnd.sap.as+xml');
    expect(calls[2]?.headers['content-type']).toBe('application/vnd.sap.adt.dataelements.v2+xml');
    expect(calls[2]?.headers.accept).toBe(
      'application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml',
    );
    expect(calls[5]?.headers['content-type']).toBe(
      'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8',
    );
    expect(calls[7]?.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    // 데이터 엘리먼트 활성화만 `application/xml`이다 — 도메인은 활성화 전용 타입이다.
    expect(calls[8]?.headers['content-type']).toBe('application/xml');
  });

  it('전송요청은 생성 POST와 PUT 양쪽에 corrNr로 붙는다', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS, transport_request: 'E19K905635' });

    const calls = harness.calls();
    expect(calls[2]?.url).toBe('/sap/bc/adt/ddic/dataelements?corrNr=E19K905635');
    expect(calls[5]?.url).toBe(`${OBJECT}?lockHandle=LOCK-1&corrNr=E19K905635`);
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

  it('systeminformation이 없으면 EN으로 떨어진다 (조회 실패는 생성 실패가 아니다)', async () => {
    harness = await harnessFor({ language: null });
    const result = await run(harness);

    expect(result.isError).toBe(false);
    expect(harness.nth(2).body).toContain('adtcore:masterLanguage="EN"');
  });

  it('구가 조립하던 XML의 뼈대를 그대로 싣는다', async () => {
    harness = await harnessFor();
    await run(harness);
    const body = harness.nth(2).body;

    expect(body).toContain('adtcore:type="DTEL/DE"');
    expect(body).toContain('adtcore:name="ZE_FOO"');
    expect(body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
    expect(body).toContain('<dtel:typeKind>domain</dtel:typeKind>');
    expect(body).toContain('<dtel:typeName>ZD_FOO</dtel:typeName>');
    // 길이·소수는 여섯 자리 0패딩이다.
    expect(body).toContain('<dtel:dataTypeLength>000010</dtel:dataTypeLength>');
    expect(body).toContain('<dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>');
    // 값 없는 자리는 **자기 닫음 태그로 남는다** — 없는 태그와 다르다.
    expect(body).toContain('<dtel:searchHelp/>');
  });

  it('`adtcore:responsible`은 값이 없어도 빈 속성으로 실린다 (도메인과 다르다)', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS }, {});

    expect(harness.nth(2).body).toContain('adtcore:responsible=""');
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

  it('GET 한 XML을 손봐 PUT 한다 — 처음부터 다시 짓지 않는다', async () => {
    harness = await harnessFor();
    await run(harness);
    const put = harness.nth(5).body;

    // 껍데기가 갖고 있던 SAP 관리 속성이 살아남는다.
    expect(put).toContain('adtcore:masterLanguage="CS"');
    expect(put).toContain('adtcore:type="DTEL/DE"');
    // 값이 갈아 끼워진다.
    expect(put).toContain('<dtel:dataType>CHAR</dtel:dataType>');
    expect(put).toContain('<dtel:dataTypeLength>000010</dtel:dataTypeLength>');
    expect(put).toContain('<dtel:typeName>ZD_FOO</dtel:typeName>');
  });

  it('설명이 빠진 껍데기에 `adtcore:description`을 **새로 넣는다**', async () => {
    harness = await harnessFor();
    await run(harness);

    expect(SKELETON).not.toContain('adtcore:description');
    expect(harness.nth(5).body).toContain('adtcore:description="demo element"');
  });

  it('주지 않은 라벨은 건드리지 않는다', async () => {
    harness = await harnessFor();
    await run(harness);

    // `short_label`을 주지 않았으므로 껍데기의 빈 태그가 그대로다.
    expect(harness.nth(5).body).toContain('<dtel:shortFieldLabel/>');
  });

  it('라벨을 주면 라벨과 길이가 한 벌로 따라간다', async () => {
    harness = await harnessFor();
    await run(harness, { ...ARGS, short_label: 'ABC' });
    const put = harness.nth(5).body;

    expect(put).toContain('<dtel:shortFieldLabel>ABC</dtel:shortFieldLabel>');
    expect(put).toContain('<dtel:shortFieldLength>3</dtel:shortFieldLength>');
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    await harness?.close();
  });

  it('검사 오류는 실패다', async () => {
    harness = await harnessFor({ check: failingCheck('Field is unknown') });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Failed to create data element ZE_FOO: Data element check failed: Field is unknown',
    );
  });

  it.each([
    'Error importing from database',
    'There is no domain and no data type was defined',
    'A datatype is expected here',
  ])('갓 만든 껍데기의 알려진 잡음(%s)은 삼킨다', async (text) => {
    harness = await harnessFor({ check: failingCheck(text) });
    const result = await run(harness);

    expect(result.isError).toBe(false);
  });

  it('활성화가 200이어도 속성이 아니라고 하면 실패로 뒤집는다', async () => {
    harness = await harnessFor({ activation: activationRefused() });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Failed to create data element ZE_FOO: Data element activation failed: Activation failed',
    );
  });

  it('활성화 응답에 속성 블록이 없으면 "알 수 없음"으로 실패한다', async () => {
    harness = await harnessFor({ activation: '<chkl:messages/>' });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Unknown activation status');
  });

  it('이미 있으면 전용 문구로 답한다 (구의 거친 판정 그대로)', async () => {
    harness = await harnessFor({
      createStatus: 403,
      createBody:
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<type id="ExceptionResourceAlreadyExists"/><message lang="EN">exists</message></exc:exception>',
    });
    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Data element ZE_FOO already exists. Please delete it first or use a different name.',
    );
  });

  it('실패해도 잠금은 풀린다', async () => {
    harness = await startWriteHarness((request, response) => {
      const query = request.query;
      if (request.path.endsWith('/validation')) return xml(response, '<ok/>');
      if (request.path === '/sap/bc/adt/core/http/systeminformation') {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        return response.end(JSON.stringify({ language: 'EN' }));
      }
      if (query.get('_action') === 'LOCK') return xml(response, lockBody('LOCK-1'));
      if (query.get('_action') === 'UNLOCK') return xml(response, '');
      if (request.path === '/sap/bc/adt/ddic/dataelements' && request.method === 'POST') {
        return xml(response, '<created/>', 201);
      }
      if (request.path === OBJECT && request.method === 'GET') return xml(response, SKELETON);
      // PUT이 잠금 핸들 무효로 죽는다.
      if (request.path === OBJECT && request.method === 'PUT') {
        return xml(response, '<exc:exception/>', 423);
      }
      return xml(response, '<unexpected/>', 500);
    });

    const result = await run(harness);

    expect(result.isError).toBe(true);
    expect(harness.calls().some((call) => call.url.includes('_action=UNLOCK'))).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it.each([
    [{ ...ARGS, data_element_name: '' }, 'Data element name is required'],
    [{ ...ARGS, package_name: '' }, 'Package name is required'],
  ])('필수 인자가 없으면 접속을 얻기 전에 거부한다', async (args, message) => {
    harness = await harnessFor();
    const result = await run(harness, args as Record<string, unknown>);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
    expect(harness.calls()).toHaveLength(0);
  });

  it('참조형인데 type_name이 없으면 SAP에 닿기 전에 거부한다', async () => {
    harness = await harnessFor();
    const result = await run(harness, {
      ...ARGS,
      type_kind: 'refToClifType',
      type_name: undefined,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "Failed to create data element ZE_FOO: type_name is required when type_kind is 'refToClifType'. Provide class name.",
    );
    expect(harness.calls()).toHaveLength(0);
  });

  it('SAP_VERSION=ECC면 브리지 미구현을 알리고 아무것도 보내지 않는다 (차이 장부 D61)', async () => {
    harness = await harnessFor();
    const context: ToolContext = {
      ...harness.context,
      profile: { ...harness.context.profile, sapVersion: 'ECC' },
      env: {},
    };
    const result = await Promise.resolve(createDataElement.handler(context, { ...ARGS }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ZMCP_ADT_DDIC_DTEL');
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

  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    harness = await harnessFor();
    const result = await run(harness, { ...ARGS, transport_request: 'E19K905635' });

    expect(jsonOf(result)).toEqual({
      success: true,
      data_element_name: 'ZE_FOO',
      package: '$TMP',
      transport_request: 'E19K905635',
      data_type: 'CHAR',
      status: 'active',
      message: 'Data element ZE_FOO created and activated successfully',
    });
    expect(textOf(result).split('\n')[1]).toBe('  "success": true,');
  });

  it('전송요청이 없으면 그 키가 통째로 빠진다 (구의 JSON.stringify 동작)', async () => {
    harness = await harnessFor();
    const result = await run(harness);

    expect(Object.keys(jsonOf(result))).not.toContain('transport_request');
  });
});
