/**
 * `UpdateDomain` — 발행 계약 · 와이어 사슬(**검증 없음 · 검사가 해제 앞**) ·
 * 읽기-수정-쓰기 패치(**주지 않은 값은 안 건드린다**) · **D125 대체 기대 시험** · 갈래.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 사슬·검사 위치·응답 키 → `engine/src/handlers/domain/high/handleUpdateDomain.ts:138-309`
 *  - 저수준 갱신 모드(GET → 패치 → PUT) → 벤더 `.../core/domain/AdtDomain.js:190-221`
 *  - 패치 규칙(`patchIf` 의미) → `.../core/domain/update.js:18-106` ·
 *    `.../utils/xmlPatch.js:93-97`
 *  - 검사에 **무시 목록이 없다** → `.../core/domain/check.js:56-70`
 *  - D125의 근거 → `.../core/domain/activation.js:15-17`(응답을 그대로 돌려준다) ·
 *    `.../core/domain/AdtDomain.js:390-406`(판정하지 않는다)
 */

import { patchDomainUpdateXml, updateDomain } from '../updateDomain';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  harnessFor,
  publishedDeclaration,
  runTool,
} from '../../read/__tests__/support';
import type { RecordedRequest, Reply } from '../../read/__tests__/support';

afterEach(() => {
  cleanupTempDirs();
});

const CSRF_PATH = '/sap/bc/adt/core/discovery';
const OBJECT_PATH = '/sap/bc/adt/ddic/domains/zz_test_0001';

const ARGS = { domain_name: 'zz_test_0001', package_name: '$TMP' };

const CURRENT_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" ' +
  'adtcore:description="old text" adtcore:name="ZZ_TEST_0001">' +
  '<doma:content><doma:typeInformation>' +
  '<doma:datatype>CHAR</doma:datatype>' +
  '<doma:length>10</doma:length>' +
  '<doma:decimals>0</doma:decimals>' +
  '</doma:typeInformation>' +
  '<doma:outputInformation>' +
  '<doma:conversionExit/>' +
  '<doma:signExists>false</doma:signExists>' +
  '<doma:lowercase>false</doma:lowercase>' +
  '</doma:outputInformation>' +
  '<doma:valueTableRef/>' +
  '<doma:fixValues/>' +
  '</doma:content></doma:domain>';

const LOCK_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
  '<LOCK_HANDLE>DOMA-LOCK</LOCK_HANDLE></DATA></asx:values></asx:abap>';

const CLEAN_CHECK =
  '<?xml version="1.0" encoding="UTF-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
  '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="OK"/>' +
  '</chkrun:checkRunReports>';

function failingCheck(text: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">' +
    '<chkrun:checkMessageList>' +
    `<chkrun:checkMessage chkrun:type="E" chkrun:shortText="${text}" line="1"/>` +
    '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>'
  );
}

/** 활성화 응답. `type`이 'E'면 SAP이 200으로 돌려주는 **실패**다. */
function activationBody(messages: ReadonlyArray<{ type: string; text: string }> = []): string {
  if (messages.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"/>';
  }
  const msgs = messages
    .map(
      (message) =>
        `<msg type="${message.type}" href="/sap/bc/adt/x#start=7,1"><shortText><txt>${message.text}</txt></shortText></msg>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">${msgs}</chkl:messages>`;
}

interface Scenario {
  readonly current?: string;
  readonly check?: string;
  readonly activation?: string;
  readonly putStatus?: number;
  readonly lockStatus?: number;
}

function serve(scenario: Scenario = {}): (request: RecordedRequest, index: number) => Reply {
  return (request) => {
    const url = request.url;
    if (url.includes(CSRF_PATH)) return { headers: { 'x-csrf-token': 'TEST-TOKEN' } };
    if (url.includes('_action=LOCK')) {
      return { status: scenario.lockStatus ?? 200, body: LOCK_XML };
    }
    if (url.includes('_action=UNLOCK')) return { body: '<ok/>' };
    if (url.includes('/sap/bc/adt/checkruns')) return { body: scenario.check ?? CLEAN_CHECK };
    if (url.includes('/sap/bc/adt/activation')) {
      return { body: scenario.activation ?? activationBody() };
    }
    if (request.method === 'PUT') return { status: scenario.putStatus ?? 200, body: '' };
    return { body: scenario.current ?? CURRENT_XML };
  };
}

function sent(requests: readonly RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => !request.url.includes(CSRF_PATH));
}

async function call(args: Record<string, unknown> = ARGS, scenario: Scenario = {}) {
  const { outcome, requests } = await runTool(updateDomain, args, serve(scenario));
  const list = sent(requests);
  return {
    isError: outcome.isError,
    text: outcome.text,
    payload: outcome.isError ? {} : (JSON.parse(outcome.text) as Record<string, unknown>),
    calls: list.map((request) => `${request.method} ${new URL(request.url).pathname}`),
    requests: list,
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const listing = await harnessFor(updateDomain);
    try {
      const listed = await listing.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('UpdateDomain'));
    } finally {
      await listing.close();
    }
  });

  it('노출·정책 선언 — high, mutation, legacy 축에는 없다', () => {
    expect(updateDomain.definition.sets).toEqual(['high']);
    expect(updateDomain.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateDomain.definition.kind).toBe('mutation');
    expect(updateDomain.definition.targetNames).toEqual(['domain_name']);
  });

  it('갱신 스키마에는 **default가 하나도 없다** — 짝인 CreateDomain에는 셋이 있다', () => {
    const mine = publishedDeclaration('UpdateDomain').inputSchema as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    const create = publishedDeclaration('CreateDomain').inputSchema as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect([...mine.required].sort()).toEqual(['domain_name', 'package_name']);
    for (const key of ['datatype', 'length', 'decimals']) {
      expect(mine.properties[key]).not.toHaveProperty('default');
      expect(create.properties[key]).toHaveProperty('default');
    }
  });
});

describe('와이어 — 검증이 없고 검사가 해제 앞이다', () => {
  it('잠금 → 읽기 → PUT → 검사 → 해제 → 활성화 순서로 나간다', async () => {
    const { isError, calls } = await call();

    expect(isError).toBe(false);
    expect(calls).toEqual([
      `POST ${OBJECT_PATH}`,
      `GET ${OBJECT_PATH}`,
      `PUT ${OBJECT_PATH}`,
      'POST /sap/bc/adt/checkruns',
      `POST ${OBJECT_PATH}`,
      'POST /sap/bc/adt/activation',
    ]);
  });

  it('이름 검증 요청이 **없다** — 짝인 UpdateDataElement에는 있다', async () => {
    const { calls } = await call();

    expect(calls.join(' ')).not.toContain('/validation');
  });

  it('검사는 해제보다 앞이다', async () => {
    const { requests } = await call();

    const checkAt = requests.findIndex((entry) => entry.url.includes('/checkruns'));
    const unlockAt = requests.findIndex((entry) => entry.url.includes('_action=UNLOCK'));

    expect(checkAt).toBeGreaterThanOrEqual(0);
    expect(unlockAt).toBeGreaterThan(checkAt);
  });

  it('주소는 **소문자**다 — 대문자로 줘도 같다', async () => {
    const { calls } = await call({ ...ARGS, domain_name: 'ZZ_TEST_0001' });

    expect(calls.filter((entry) => entry.includes('/ddic/domains/'))).toHaveLength(4);
    expect(
      calls.filter((entry) => entry.includes('/ddic/domains/')).every((entry) => entry.endsWith(OBJECT_PATH)),
    ).toBe(true);
  });

  it('읽기와 PUT의 헤더·질의 인자', async () => {
    const { requests } = await call({ ...ARGS, transport_request: 'E19K905635' });
    const get = requests.find((entry) => entry.method === 'GET')!;
    const put = requests.find((entry) => entry.method === 'PUT')!;
    const params = new URL(put.url).searchParams;

    expect(get.headers['Accept']).toBe(
      'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
    );
    expect(params.get('lockHandle')).toBe('DOMA-LOCK');
    expect(params.get('corrNr')).toBe('E19K905635');
    expect(put.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.domains.v2+xml; charset=utf-8',
    );
  });

  it('이송번호를 안 주면 corrNr가 붙지 않는다', async () => {
    const { requests } = await call();
    const put = requests.find((entry) => entry.method === 'PUT')!;

    expect(put.url).not.toContain('corrNr');
  });
});

describe('읽기-수정-쓰기 — 주지 않은 값은 안 건드린다', () => {
  it('설명만 주면 타입 정보와 값 범위가 그대로 남는다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, { description: 'New text' });

    expect(patched).toContain('adtcore:description="New text"');
    expect(patched).toContain('<doma:datatype>CHAR</doma:datatype>');
    expect(patched).toContain('<doma:length>10</doma:length>');
    expect(patched).toContain('<doma:signExists>false</doma:signExists>');
    expect(patched).toContain('<doma:fixValues/>');
  });

  it('길이·소수점은 0채움이 **없다** — 데이터 엘리먼트와 다르다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, { length: 12, decimals: 2 });

    expect(patched).toContain('<doma:length>12</doma:length>');
    expect(patched).toContain('<doma:decimals>2</doma:decimals>');
  });

  it('conversion_exit에 빈 문자열을 주면 자기 닫음 태그로 접힌다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, { conversionExit: '' });

    expect(patched).toContain('<doma:conversionExit/>');
  });

  it('value_table을 주면 참조 블록이 통째로 바뀐다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, { valueTable: 'ZZ_TAB' });

    expect(patched).toContain(
      '<doma:valueTableRef adtcore:uri="/sap/bc/adt/ddic/tables/zz_tab" adtcore:type="TABL/DT" adtcore:name="ZZ_TAB"/>',
    );
  });

  it('value_table에 빈 문자열을 주면 빈 참조로 지운다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, { valueTable: '' });

    expect(patched).toContain('<doma:valueTableRef/>');
  });

  it('fixed_values는 블록 통째로 갈아 끼운다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, {
      fixedValues: [
        { low: '001', text: 'One' },
        { low: '002', text: 'Two' },
      ],
    });

    expect(patched).toContain('<doma:low>001</doma:low>');
    expect(patched).toContain('<doma:text>Two</doma:text>');
    expect(patched).toContain('<doma:fixValues>');
  });

  it('빈 fixed_values 배열은 값 범위를 지운다', () => {
    const withValues = patchDomainUpdateXml(CURRENT_XML, {
      fixedValues: [{ low: '001', text: 'One' }],
    });
    const cleared = patchDomainUpdateXml(withValues, { fixedValues: [] });

    expect(cleared).toContain('<doma:fixValues/>');
    expect(cleared).not.toContain('<doma:low>001</doma:low>');
  });

  it('아무것도 안 주면 XML이 한 글자도 안 바뀐다', () => {
    expect(patchDomainUpdateXml(CURRENT_XML, {})).toBe(CURRENT_XML);
  });

  it('설명은 60자에서 잘린다', () => {
    const patched = patchDomainUpdateXml(CURRENT_XML, { description: 'z'.repeat(70) });

    expect(patched).toContain(`adtcore:description="${'z'.repeat(60)}"`);
  });

  it('설명을 안 주면 도메인 이름이 실린다 — 구 핸들러의 갈래', async () => {
    const { requests } = await call();
    const put = requests.find((entry) => entry.method === 'PUT')!;

    expect(put.body).toContain('adtcore:description="ZZ_TEST_0001"');
  });

  it('PUT 본문이 그 패치 결과와 같다', async () => {
    const { requests } = await call({ ...ARGS, description: 'New text', length: 20 });
    const put = requests.find((entry) => entry.method === 'PUT')!;

    expect(put.body).toBe(
      patchDomainUpdateXml(CURRENT_XML, { description: 'New text', length: 20 }),
    );
  });
});

describe('검사 갈래 — 무시 목록이 없다', () => {
  it('검사 오류는 그대로 실패다 — 활성화가 나가지 않고 잠금은 풀린다', async () => {
    const { isError, text, calls } = await call(ARGS, {
      check: failingCheck('Field ZZ is unknown'),
    });

    expect(isError).toBe(true);
    expect(text).toContain('Domain check failed: Field ZZ is unknown');
    expect(calls.join(' ')).not.toContain('/sap/bc/adt/activation');
    expect(calls.filter((entry) => entry === `POST ${OBJECT_PATH}`)).toHaveLength(2);
  });

  it('데이터 엘리먼트가 무시하던 잡음도 여기서는 실패다', async () => {
    const { isError, text } = await call(ARGS, {
      check: failingCheck('Error importing from database'),
    });

    expect(isError).toBe(true);
    expect(text).toContain('Domain check failed: Error importing from database');
  });
});

/**
 * **D125 대체 기대 시험** — 장부 등재 규칙 ②.
 *
 * 구 동작(실측): 벤더 `activateDomain`은 `activateObjectInSession`의 응답을 **그대로
 * 돌려주고**(`.../core/domain/activation.js:15-17`), `AdtDomain.activate()`도 판정하지
 * 않으며(`AdtDomain.js:390-406`), 겉 핸들러는 반환값을 버린다
 * (`handleUpdateDomain.ts:243-245`). SAP은 활성화 실패도 **HTTP 200 +
 * `<chkl:msg type="E">`** 로 답하므로 활성화되지 않은 도메인이
 * `status: "active"`로 보고된다. 짝인 데이터 엘리먼트는 구가 이미 판정한다.
 */
describe('D125 — 활성화 거짓 성공을 성공으로 접지 않는다', () => {
  it('활성화 요청의 바이트는 구 그대로다', async () => {
    const { requests } = await call();
    const activation = requests.find((entry) => entry.url.includes('/sap/bc/adt/activation'))!;
    const params = new URL(activation.url).searchParams;

    expect(activation.method).toBe('POST');
    expect(params.get('method')).toBe('activate');
    expect(params.get('preauditRequested')).toBe('true');
    expect(activation.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.activation+xml',
    );
    expect(activation.headers['Accept']).toBe('application/xml');
    expect(activation.body).toContain(`adtcore:uri="${OBJECT_PATH}"`);
    expect(activation.body).toContain('adtcore:name="ZZ_TEST_0001"');
  });

  it('**200에 실려 온 활성화 오류를 성공으로 접지 않는다** — 구는 접었다', async () => {
    const { isError, text } = await call(ARGS, {
      activation: activationBody([{ type: 'E', text: 'Value table ZZ_TAB does not exist' }]),
    });

    expect(isError).toBe(true);
    expect(text).toContain('Activation failed: domain ZZ_TEST_0001 was not activated');
    expect(text).toContain('Value table ZZ_TAB does not exist');
    expect(text).toContain('the active version is unchanged');
  });

  it('A·X 등급도 실패로 본다', async () => {
    const { isError, text } = await call(ARGS, {
      activation: activationBody([{ type: 'X', text: 'Short dump' }]),
    });

    expect(isError).toBe(true);
    expect(text).toContain('Activation failed');
  });

  it('경고(W)만 실려 오면 활성화 성공이다 — 과잉 거부하지 않는다', async () => {
    const { isError, payload } = await call(ARGS, {
      activation: activationBody([{ type: 'W', text: 'Obsolete setting' }]),
    });

    expect(isError).toBe(false);
    expect(payload.status).toBe('active');
  });

  it('activate:false면 활성화 요청 자체가 없다 — 판정할 것도 없다', async () => {
    const { isError, calls, payload } = await call({ ...ARGS, activate: false });

    expect(isError).toBe(false);
    expect(calls.join(' ')).not.toContain('/sap/bc/adt/activation');
    expect(payload.status).toBe('inactive');
  });

  it('활성화가 실패해도 PUT은 이미 나갔다 — 문구가 그 사실을 말한다', async () => {
    const { text, calls } = await call(ARGS, {
      activation: activationBody([{ type: 'E', text: 'broken' }]),
    });

    expect(calls.filter((entry) => entry.startsWith('PUT'))).toHaveLength(1);
    expect(text).toContain('is on SAP as an inactive version');
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다 — **들여쓰기가 없다**', async () => {
    const { text, payload } = await call({ ...ARGS, transport_request: 'E19K905635' });

    expect(payload).toEqual({
      success: true,
      domain_name: 'ZZ_TEST_0001',
      package: '$TMP',
      transport_request: 'E19K905635',
      status: 'active',
      message: 'Domain ZZ_TEST_0001 updated and activated successfully',
      domain_details: null,
    });
    expect(text).toBe(JSON.stringify(payload));
    expect(text).not.toContain('\n');
  });

  it('activate:false면 문구에서 "and activated"가 빠진다', async () => {
    const { payload } = await call({ ...ARGS, activate: false });

    expect(payload.message).toBe('Domain ZZ_TEST_0001 updated successfully');
  });
});

describe('갈래', () => {
  it('domain_name이 비면 요청이 나가지 않는다 — 구의 문장, 접두사 없음(D34)', async () => {
    const { isError, text, requests } = await call({ ...ARGS, domain_name: '' });

    expect(isError).toBe(true);
    expect(text).toBe('Domain name is required');
    expect(requests).toHaveLength(0);
  });

  it('package_name이 비면 요청이 나가지 않는다', async () => {
    const { isError, text, requests } = await call({ ...ARGS, package_name: '' });

    expect(isError).toBe(true);
    expect(text).toBe('Package name is required');
    expect(requests).toHaveLength(0);
  });

  it('404는 not found 문구다 — 잠금이 없는 도메인에서 실패한다', async () => {
    const { isError, text } = await call(ARGS, { lockStatus: 404 });

    expect(isError).toBe(true);
    expect(text).toBe('Domain ZZ_TEST_0001 not found.');
  });

  it('403은 잠금 문구다', async () => {
    const { isError, text } = await call(ARGS, { lockStatus: 403 });

    expect(isError).toBe(true);
    expect(text).toBe(
      'Domain ZZ_TEST_0001 is locked by another user or session. Please try again later.',
    );
  });

  it('PUT이 실패하면 잠금은 풀리고 구의 문구로 올라온다', async () => {
    const { isError, text, calls } = await call(ARGS, { putStatus: 500 });

    expect(isError).toBe(true);
    expect(text).toContain('Failed to update domain ZZ_TEST_0001:');
    expect(calls.filter((entry) => entry === `POST ${OBJECT_PATH}`)).toHaveLength(2);
  });

  it('시험 서버 오리진이 그대로 쓰인다 — 실 SAP에 나가지 않는다', async () => {
    const { requests } = await call();

    for (const request of requests) {
      expect(request.url.startsWith(TEST_ORIGIN)).toBe(true);
    }
  });
});
