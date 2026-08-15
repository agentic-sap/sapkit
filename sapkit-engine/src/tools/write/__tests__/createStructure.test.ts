/**
 * `CreateStructure` — DDL 생성 → 검증 → 껍데기 → 사전검사 → 잠금 PUT → 사후검사
 * → (활성).
 *
 * 이 도구의 성격은 **거짓 성공을 못 내게 하는 것**이다. 그 전 세대는 필수 인자인
 * `fields`를 버리고 빈 껍데기만 만든 뒤 성공으로 보고했다. 그래서 붙잡는 것도
 * 거기에 몰려 있다:
 *
 *  - 명세가 불완전하면 **SAP에 아무것도 보내지 않고** 거부한다.
 *  - 필드 PUT은 최선 노력이 **아니다** — 실패하면 실패다(`CreateTable`의 MANDT
 *    스켈레톤과 갈리는 자리).
 *  - 활성화가 오류로 끝나면 `activated: true`로 답하지 않는다(D56).
 *
 * 구 핸들러는 `engine/src/handlers/structure/high/handleCreateStructure.ts`.
 */

import { activationBody, cleanCheckRun, invoke, jsonOf, lockBody, plainText, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';
import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { createStructure } from '../createStructure';

const VALIDATION = '/sap/bc/adt/ddic/structures/validation';
const COLLECTION = '/sap/bc/adt/ddic/structures';
const SYSTEMINFO = '/sap/bc/adt/core/http/systeminformation';
const LOCK_URI = '/sap/bc/adt/ddic/structures/zs_demo';
const SOURCE_URI = '/sap/bc/adt/ddic/structures/ZS_DEMO';

const FIELDS = [
  { name: 'ID', data_type: 'CHAR', length: 10 },
  { name: 'AMOUNT', data_type: 'CURR', length: 15, decimals: 2, currency_reference: 'WAERS' },
];

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

interface Scenario {
  readonly check?: string;
  readonly activation?: string;
  readonly createStatus?: number;
  readonly putStatus?: number;
}

function responder(scenario: Scenario = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === VALIDATION) {
      return xml(response, '<asx:abap><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>');
    }
    if (request.path === SYSTEMINFO) {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: 'EN' }));
    }
    if (request.path === COLLECTION && request.method === 'POST') {
      if (scenario.createStatus) return xml(response, '<err/>', scenario.createStatus);
      return xml(response, '<created/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      checkRuns += 1;
      return xml(response, checkRuns === 1 ? (scenario.check ?? cleanCheckRun()) : cleanCheckRun());
    }
    if (request.path === LOCK_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('LOCK-1'));
    }
    if (request.path === LOCK_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === `${SOURCE_URI}/source/main` && request.method === 'PUT') {
      if (scenario.putStatus) return xml(response, '<err/>', scenario.putStatus);
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, scenario.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(createStructure)).toEqual(publishedDeclaration('CreateStructure'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/cloud · mutation', () => {
    expect(createStructure.definition.sets).toEqual(['high']);
    expect(createStructure.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createStructure.definition.kind).toBe('mutation');
    expect(createStructure.definition.targetNames).toEqual(['structure_name']);
  });
});

describe('CreateStructure 시퀀스', () => {
  it('검증 → 언어 → 생성 → 사전검사 → 잠금 → PUT → 해제 → 사후검사 → 활성', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'zs_demo',
      package_name: '$TMP',
      fields: FIELDS,
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${VALIDATION}`,
      `GET ${SYSTEMINFO}`,
      `POST ${COLLECTION}`,
      'POST /sap/bc/adt/checkruns',
      `POST ${LOCK_URI}`,
      `PUT ${SOURCE_URI}/source/main`,
      `POST ${LOCK_URI}`,
      'POST /sap/bc/adt/checkruns',
      'POST /sap/bc/adt/activation',
    ]);
  });

  it('생성 페이로드의 description은 **실제 설명**이다 (테이블 쪽과 다르다)', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      description: 'Demo Structure',
      fields: FIELDS,
    });
    const create = harness.nth(2);
    expect(create.body).toContain('adtcore:description="Demo Structure"');
    expect(create.body).toContain('adtcore:type="TABL/DS"');
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.structures.v2+xml');
  });

  it('설명이 없으면 구조체 이름을 쓴다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
    });
    expect(harness.nth(0).query.get('description')).toBe('ZS_DEMO');
    expect(harness.nth(2).body).toContain('adtcore:description="ZS_DEMO"');
  });
});

describe('생성되는 DDL', () => {
  it('필드 명세를 define structure로 옮긴다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      description: 'Demo',
      fields: FIELDS,
    });
    const ddl = harness.nth(5).body;
    expect(ddl).toBe(
      [
        "@EndUserText.label : 'Demo'",
        '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
        'define structure zs_demo {',
        '  id : abap.char(10);',
        "  @Semantics.amount.currencyCode : 'zs_demo.waers'",
        '  amount : abap.curr(15,2);',
        '}',
      ].join('\n'),
    );
  });

  it('data_element가 있으면 그것이 이긴다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: [{ name: 'MATNR', data_element: 'MATNR', data_type: 'CHAR', length: 18 }],
    });
    expect(harness.nth(5).body).toContain('  matnr : matnr;');
  });

  it('include는 include 줄로 나가고 fields_applied에 함께 센다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: [{ name: 'ID', data_type: 'CHAR', length: 10 }],
      includes: [{ name: 'ZS_BASE' }],
    });
    expect(harness.nth(5).body).toContain('  include zs_base;');
    // 필드 1 + include 1 = 2.
    expect(jsonOf(result)['fields_applied']).toBe(2);
  });

  it('사전검사는 생성한 DDL을 base64로 실어 보낸다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
    });
    const check = harness.nth(3);
    expect(check.body).toContain(`<chkrun:checkObject adtcore:uri="${LOCK_URI}" chkrun:version="inactive">`);
    expect(check.body).toContain(Buffer.from(harness.nth(5).body, 'utf-8').toString('base64'));
  });
});

describe('불완전한 명세는 SAP에 닿기 전에 거부된다', () => {
  it.each([
    [
      '길이 없는 CHAR',
      [{ name: 'ID', data_type: 'CHAR' }],
      'requires a positive "length"',
    ],
    [
      '타입도 데이터 엘리먼트도 없는 필드',
      [{ name: 'ID', domain: 'ZDOM' }],
      'cannot be expressed as DDL',
    ],
    [
      '모르는 data_type',
      [{ name: 'ID', data_type: 'BOGUS', length: 3 }],
      'unsupported data_type',
    ],
  ])('%s은 거부되고 요청이 하나도 나가지 않는다', async (_label, fields, expected) => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Cannot generate structure DDL:');
    expect(textOf(result)).toContain(expected);
    // 반쪽 오브젝트가 남지 않는다 — 아무것도 만들지 않았다.
    expect(harness.calls()).toHaveLength(0);
  });

  it('표현할 수 없는 include suffix도 같은 자리에서 막힌다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: [{ name: 'ID', data_type: 'CHAR', length: 10 }],
      includes: [{ name: 'ZS_BASE', suffix: 'X' }],
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('cannot be expressed in generated DDL');
    expect(harness.calls()).toHaveLength(0);
  });

  it('fields가 비면 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: [],
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('At least one field is required');
    expect(harness.calls()).toHaveLength(0);
  });
});

describe('필드 적용은 최선 노력이 아니다', () => {
  it('PUT이 실패하면 성공으로 답하지 않는다', async () => {
    harness = await startWriteHarness(responder({ putStatus: 423 }));
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Failed to create structure ZS_DEMO:');
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('사전검사가 막으면 PUT이 나가지 않는다', async () => {
    harness = await startWriteHarness(
      responder({
        check:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
          '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Fehler">' +
          '<chkrun:checkMessageList>' +
          '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="Typ ist unbekannt"/>' +
          '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>',
      }),
    );
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Generated DDL check failed: Structure check failed: Typ ist unbekannt');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });
});

describe('활성화는 조용히 성공하지 않는다 (D56)', () => {
  it('활성화 응답의 E 메시지는 실패다 — 구는 응답을 읽지도 않았다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Struktur ist inkonsistent' }]) }),
    );
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Struktur ist inkonsistent');
  });

  it('activate:false면 활성화를 부르지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
      activate: false,
    });
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result)['activated']).toBe(false);
  });
});

describe('응답 형태', () => {
  it('구와 같은 일곱 키를 들여쓰기 없이 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createStructure, harness, {
      structure_name: 'zs_demo',
      package_name: '$TMP',
      fields: FIELDS,
    });
    const payload = jsonOf(result);
    expect(Object.keys(payload)).toEqual([
      'success',
      'structure_name',
      'package_name',
      'transport_request',
      'activated',
      'fields_applied',
      'message',
    ]);
    expect(payload['structure_name']).toBe('ZS_DEMO');
    expect(payload['fields_applied']).toBe(2);
    expect(payload['transport_request']).toBe('local');
    expect(payload['message']).toBe(
      'Structure ZS_DEMO created with 2 field(s)/include(s) applied and activated',
    );
    expect(textOf(result)).toBe(JSON.stringify(payload));
  });

  it('이미 있는 구조체는 전용 문구로 답한다', async () => {
    harness = await startWriteHarness(responder({ createStatus: 409 }));
    const result = await invoke(createStructure, harness, {
      structure_name: 'ZS_DEMO',
      package_name: '$TMP',
      fields: FIELDS,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Structure ZS_DEMO already exists. Please delete it first or use a different name.',
    );
  });
});
