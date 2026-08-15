/**
 * `GetTypeInfo` — 발행 계약 · 후보 다섯의 순서와 경로 · 「쓸 만한 결과」 판정 · 오류 갈래.
 *
 * ## 기대값을 어디서 뽑았나 (자기확인 회피)
 *
 * 아래 파싱 기대값은 **구 엔진의 `parseTypeInfoXml`·`parseStructureInfoXml`·
 * `hasUsableResult`를 그대로 떼어 내 실행한 출력**이다
 * (`engine/src/handlers/system/readonly/handleGetTypeInfo.ts:44-129`). 신 구현을
 * 돌려 얻은 값이 아니다.
 *
 * 그 실행에서 드러난 구의 실측 둘을 시험이 고정한다.
 *  - `parseAttributeValue: true`라 `"15"`가 **숫자 15**로 온다. 문자열이 아니다.
 *  - XML이 아닌 본문은 `{ raw: {} }`가 되고 `hasUsableResult`가 **거짓**이라
 *    다음 후보로 넘어간다. 도메인 `/source/main`이 평문 DDL을 주는 실제 상황이
 *    바로 이 갈래이며, 그래서 첫 후보에서 멈추지 않는다.
 */

import { getTypeInfo, hasUsableResult, parseTypeInfoXml } from '../getTypeInfo';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';
import type { RecordedRequest, Reply } from './support';

const DOMAIN_SOURCE = '/sap/bc/adt/ddic/domains/ZDE_AMOUNT/source/main';
const DATA_ELEMENT = '/sap/bc/adt/ddic/dataelements/ZDE_AMOUNT';
const TABLE_TYPE = '/sap/bc/adt/ddic/tabletypes/ZDE_AMOUNT';
const OBJECT_PROPERTIES = '/sap/bc/adt/repository/informationsystem/objectproperties/values';
const STRUCTURE = '/sap/bc/adt/ddic/structures/ZDE_AMOUNT';

/** 구 파서를 실행해 만든 입력들. */
const DTEL_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" xmlns:dtel="http://www.sap.com/wbobj/blue/dtel"',
  '  adtcore:name="ZDE_AMOUNT" adtcore:description="Amount field">',
  '  <adtcore:packageRef adtcore:name="ZPKG"/>',
  '  <dtel:dataElement dtel:dataType="CURR" dtel:dataTypeLength="15" dtel:dataTypeDecimals="2" dtel:typeName="ZDO_AMOUNT"',
  '    dtel:shortFieldLabel="Amt" dtel:mediumFieldLabel="Amount" dtel:longFieldLabel="Amount value" dtel:headingFieldLabel="Amount"/>',
  '</blue:wbobj>',
].join('\n');

const OPR_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<opr:objectProperties xmlns:opr="http://www.sap.com/adt/ris/objectproperties">',
  '  <opr:object name="ZDO_AMOUNT" text="Amount domain" package="ZPKG" type="DOMA/DD"/>',
  '</opr:objectProperties>',
].join('\n');

const STRU_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core"',
  '  adtcore:name="ZST_ITEM" adtcore:description="Item structure">',
  '  <adtcore:packageRef adtcore:name="ZPKG"/>',
  '</blue:wbobj>',
].join('\n');

/** 도메인 `/source/main`이 실제로 주는 평문 DDL. XML이 아니다. */
const PLAIN_DDL = '@EndUserText.label: 1\ndefine domain ZDO_AMOUNT {}';

/** 구 코드를 실행해 받은 출력 그대로. 손으로 고치지 말 것. */
const OLD_ENGINE_DTEL = {
  name: 'ZDE_AMOUNT',
  objectType: 'data_element',
  description: 'Amount field',
  dataType: 'CURR',
  length: 15,
  decimals: 2,
  domain: 'ZDO_AMOUNT',
  package: 'ZPKG',
  labels: { short: 'Amt', medium: 'Amount', long: 'Amount value', heading: 'Amount' },
};

const OLD_ENGINE_OPR = {
  name: 'ZDO_AMOUNT',
  objectType: 'domain',
  description: 'Amount domain',
  package: 'ZPKG',
  type: 'DOMA/DD',
};

const OLD_ENGINE_STRU = {
  name: 'ZST_ITEM',
  objectType: 'structure',
  description: 'Item structure',
  package: 'ZPKG',
  resolved_as: 'structure_fallback',
  raw: {
    '?xml': { version: 1, encoding: 'UTF-8' },
    'blue:wbobj': {
      'adtcore:packageRef': { 'adtcore:name': 'ZPKG' },
      'xmlns:blue': 'http://www.sap.com/wbobj/blue',
      'xmlns:adtcore': 'http://www.sap.com/adt/core',
      'adtcore:name': 'ZST_ITEM',
      'adtcore:description': 'Item structure',
    },
  },
};

afterEach(() => {
  cleanupTempDirs();
});

function router(routes: Record<string, Reply>): (request: RecordedRequest) => Reply {
  return (request) => {
    const { pathname } = new URL(request.url);
    for (const [path, reply] of Object.entries(routes)) {
      if (pathname === path) return reply;
    }
    return { status: 404, body: 'not found' };
  };
}

async function call(args: Record<string, unknown>, reply: (request: RecordedRequest) => Reply) {
  const { outcome, requests } = await runTool(getTypeInfo, args, reply);
  const sent = toolRequests(requests);
  return {
    outcome,
    sent,
    paths: sent.map((request) => new URL(request.url).pathname),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getTypeInfo);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetTypeInfo'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getTypeInfo.definition.sets).toEqual(['readonly']);
    expect(getTypeInfo.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getTypeInfo.definition.kind).toBe('read');
  });
});

describe('와이어 — 후보 순서와 경로', () => {
  it('첫 후보가 답하면 거기서 멈춘다', async () => {
    const { outcome, paths } = await call(
      { type_name: 'ZDE_AMOUNT' },
      router({ [DOMAIN_SOURCE]: { status: 200, body: DTEL_XML } }),
    );

    expect(paths).toEqual([DOMAIN_SOURCE]);
    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_DTEL);
  });

  it('Accept를 주지 않아 접속 계층 기본값이 나간다 (구와 같은 문자열)', async () => {
    const { sent } = await call(
      { type_name: 'ZDE_AMOUNT' },
      router({ [DOMAIN_SOURCE]: { status: 200, body: DTEL_XML } }),
    );

    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.headers['Accept']).toBe('application/xml, application/json, text/plain, */*');
    expect(sent[0]?.body).toBeUndefined();
  });

  it('404가 이어지면 네 후보를 순서대로 물어보고 구조 폴백까지 간다', async () => {
    const { paths } = await call({ type_name: 'ZDE_AMOUNT' }, () => ({
      status: 404,
      body: 'not found',
    }));

    expect(paths).toEqual([
      DOMAIN_SOURCE,
      DATA_ELEMENT,
      TABLE_TYPE,
      OBJECT_PROPERTIES,
      STRUCTURE,
    ]);
  });

  it('네 번째 후보의 uri 인자만 소문자로 만든 경로를 인코딩해 싣는다', async () => {
    const { sent } = await call({ type_name: 'ZDE_AMOUNT' }, () => ({
      status: 404,
      body: 'not found',
    }));
    const properties = sent.find(
      (request) => new URL(request.url).pathname === OBJECT_PROPERTIES,
    );

    // 이름은 소문자, 경로 구분자는 %2F로 인코딩된다.
    expect(new URL(properties?.url ?? '').search).toBe(
      '?uri=%2Fsap%2Fbc%2Fadt%2Fddic%2Fdomains%2Fzde_amount',
    );
  });
});

describe('「쓸 만한 결과」가 아니면 다음 후보로 넘어간다', () => {
  it('평문(비 XML)은 { raw: {} }가 되어 넘어간다 — 도메인 source/main의 실제 모습', async () => {
    const { outcome, paths } = await call(
      { type_name: 'ZDE_AMOUNT' },
      router({
        [DOMAIN_SOURCE]: { status: 200, body: PLAIN_DDL },
        [DATA_ELEMENT]: { status: 200, body: DTEL_XML },
      }),
    );

    expect(paths).toEqual([DOMAIN_SOURCE, DATA_ELEMENT]);
    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_DTEL);
  });

  it('빈 본문도 넘어간다', async () => {
    const { paths } = await call(
      { type_name: 'ZDE_AMOUNT' },
      router({
        [DOMAIN_SOURCE]: { status: 200, body: '   ' },
        [DATA_ELEMENT]: { status: 200, body: DTEL_XML },
      }),
    );

    expect(paths).toEqual([DOMAIN_SOURCE, DATA_ELEMENT]);
  });

  it('repository informationsystem 응답은 domain 모양으로 접힌다', async () => {
    const { outcome, paths } = await call(
      { type_name: 'ZDE_AMOUNT' },
      router({ [OBJECT_PROPERTIES]: { status: 200, body: OPR_XML } }),
    );

    expect(paths).toEqual([DOMAIN_SOURCE, DATA_ELEMENT, TABLE_TYPE, OBJECT_PROPERTIES]);
    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_OPR);
  });
});

describe('구조 폴백', () => {
  it('넷이 다 없으면 structures를 묻고 structure_fallback으로 답한다', async () => {
    const { outcome, paths } = await call(
      { type_name: 'ZDE_AMOUNT' },
      router({ [STRUCTURE]: { status: 200, body: STRU_XML } }),
    );

    expect(paths[4]).toBe(STRUCTURE);
    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_STRU);
  });

  it('include_structure_fallback:false면 다섯째를 묻지 않는다', async () => {
    const { outcome, paths } = await call(
      { type_name: 'ZDE_AMOUNT', include_structure_fallback: false },
      () => ({ status: 404, body: 'not found' }),
    );

    expect(paths).toEqual([DOMAIN_SOURCE, DATA_ELEMENT, TABLE_TYPE, OBJECT_PROPERTIES]);
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Type ZDE_AMOUNT was not found as domain, data element, table type, or structure.',
    );
  });

  it('아무 데도 없으면 구와 같은 문구로 실패한다', async () => {
    const { outcome } = await call({ type_name: 'ZDE_AMOUNT' }, () => ({
      status: 404,
      body: 'not found',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Type ZDE_AMOUNT was not found as domain, data element, table type, or structure.',
    );
  });
});

describe('오류 갈래', () => {
  it('404가 아닌 오류는 다음 후보로 넘어가지 않고 즉시 실패한다', async () => {
    // 구의 tryLookup은 404만 「없음」으로 접고 나머지는 던진다(:161-166).
    const { outcome, paths } = await call({ type_name: 'ZDE_AMOUNT' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(paths).toEqual([DOMAIN_SOURCE]);
    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('ADT error: ')).toBe(true);
  });

  it('빈 type_name은 구와 같은 문구로 거절한다', async () => {
    const { outcome, paths } = await call({ type_name: '' }, () => ({ status: 200, body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('ADT error: McpError: MCP error -32602: Type name is required');
    // 접속을 꺼내기 전에 걸린다.
    expect(paths).toHaveLength(0);
  });
});

describe('구 판정 함수를 그대로 옮겼다', () => {
  it('hasUsableResult — raw가 빈 객체면 없는 것이다', () => {
    expect(hasUsableResult({ raw: {} })).toBe(false);
    expect(hasUsableResult({ raw: { a: 1 } })).toBe(true);
    expect(hasUsableResult({})).toBe(false);
    expect(hasUsableResult({ a: 1 })).toBe(true);
    expect(hasUsableResult('  ')).toBe(false);
    expect(hasUsableResult([])).toBe(false);
    expect(hasUsableResult(null)).toBe(false);
  });

  it('parseTypeInfoXml — 숫자 속성은 숫자로 온다 (parseAttributeValue:true)', () => {
    const parsed = parseTypeInfoXml(DTEL_XML) as { length: number; decimals: number };

    expect(parsed.length).toBe(15);
    expect(parsed.decimals).toBe(2);
  });
});
