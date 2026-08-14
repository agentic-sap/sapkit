/**
 * `UpdateDataElement` — 발행 계약 · 와이어 사슬(**검사가 해제 앞**) ·
 * 읽기-수정-쓰기 패치(**주지 않은 값은 안 건드린다**) · 활성화 판정 · 갈래.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 사슬·검사 위치·응답 키 →
 *    `engine/src/handlers/data_element/high/handleUpdateDataElement.ts:162-379`
 *  - 저수준 갱신 모드(GET → 패치 → PUT) → 벤더 `.../core/dataElement/AdtDataElement.js:200-241`
 *  - 패치 규칙(`patchIf` 의미) → `.../core/dataElement/update.js:85-156` ·
 *    `.../utils/xmlPatch.js:93-97`
 *  - 검사 무시 목록 → `.../core/dataElement/check.js:59-77`
 *  - **활성화 판정은 구가 이미 한다** → `.../core/dataElement/activation.js:22-73`
 */

import {
  isAlreadyExistsError,
  isIgnorableCheckNoise,
  patchDataElementUpdateXml,
  updateDataElement,
} from '../updateDataElement';
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
const OBJECT_PATH = '/sap/bc/adt/ddic/dataelements/zz_test_dtel_01';
const VALIDATION_PATH = '/sap/bc/adt/ddic/dataelements/validation';

const ARGS = { data_element_name: 'zz_test_dtel_01', package_name: '$TMP' };

const CURRENT_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" ' +
  'xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" ' +
  'adtcore:description="old text" adtcore:name="ZZ_TEST_DTEL_01">' +
  '<dtel:dataElement>' +
  '<dtel:typeKind>domain</dtel:typeKind>' +
  '<dtel:typeName>ZZ_DOM</dtel:typeName>' +
  '<dtel:dataType>CHAR</dtel:dataType>' +
  '<dtel:dataTypeLength>000010</dtel:dataTypeLength>' +
  '<dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>' +
  '<dtel:shortFieldLabel>old</dtel:shortFieldLabel>' +
  '<dtel:shortFieldLength>10</dtel:shortFieldLength>' +
  '<dtel:searchHelp/>' +
  '</dtel:dataElement></blue:wbobj>';

const LOCK_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
  '<LOCK_HANDLE>DTEL-LOCK</LOCK_HANDLE></DATA></asx:values></asx:abap>';

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

/** 활성화 성공 응답 — 구 벤더가 두 속성을 모두 참으로 볼 때만 성공이다. */
const ACTIVATION_OK =
  '<?xml version="1.0" encoding="UTF-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
  '<chkl:properties activationExecuted="true" checkExecuted="true"/></chkl:messages>';

interface Scenario {
  readonly validationStatus?: number;
  readonly validationBody?: string;
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
    if (url.includes(VALIDATION_PATH)) {
      return {
        status: scenario.validationStatus ?? 200,
        body: scenario.validationBody ?? '<asx:abap/>',
      };
    }
    if (url.includes('_action=LOCK')) {
      return { status: scenario.lockStatus ?? 200, body: LOCK_XML };
    }
    if (url.includes('_action=UNLOCK')) return { body: '<ok/>' };
    if (url.includes('/sap/bc/adt/checkruns')) return { body: scenario.check ?? CLEAN_CHECK };
    if (url.includes('/sap/bc/adt/activation')) {
      return { body: scenario.activation ?? ACTIVATION_OK };
    }
    if (request.method === 'PUT') return { status: scenario.putStatus ?? 200, body: '' };
    return { body: scenario.current ?? CURRENT_XML };
  };
}

function sent(requests: readonly RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => !request.url.includes(CSRF_PATH));
}

async function call(args: Record<string, unknown> = ARGS, scenario: Scenario = {}) {
  const { outcome, requests } = await runTool(updateDataElement, args, serve(scenario));
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
    const listing = await harnessFor(updateDataElement);
    try {
      const listed = await listing.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('UpdateDataElement'));
    } finally {
      await listing.close();
    }
  });

  it('노출·정책 선언 — high, mutation, cloud 축에는 있고 legacy에는 없다', () => {
    expect(updateDataElement.definition.sets).toEqual(['high']);
    expect(updateDataElement.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateDataElement.definition.kind).toBe('mutation');
    expect(updateDataElement.definition.targetNames).toEqual(['data_element_name']);
  });

  it('package_name이 **필수**다 — 짝인 CreateDataElement와 같은 자리', () => {
    const mine = publishedDeclaration('UpdateDataElement').inputSchema as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };

    expect([...mine.required].sort()).toEqual(['data_element_name', 'package_name']);
    expect(mine.properties['type_kind']?.default).toBe('domain');
    // 짝인 생성 쪽에는 없는 인자가 여기에는 있다.
    expect(Object.keys(mine.properties)).toContain('activate');
    expect(Object.keys(mine.properties)).toContain('field_label_short');
  });
});

describe('와이어 — 검사가 해제 **앞**이다', () => {
  it('검증 → 잠금 → 읽기 → PUT → 검사 → 해제 → 활성화 순서로 나간다', async () => {
    const { isError, calls } = await call();

    expect(isError).toBe(false);
    expect(calls).toEqual([
      `POST ${VALIDATION_PATH}`,
      `POST ${OBJECT_PATH}`,
      `GET ${OBJECT_PATH}`,
      `PUT ${OBJECT_PATH}`,
      'POST /sap/bc/adt/checkruns',
      `POST ${OBJECT_PATH}`,
      'POST /sap/bc/adt/activation',
    ]);
  });

  it('검사는 해제보다 앞이다 — 짝인 CreateDataElement는 반대 순서다', async () => {
    const { requests } = await call();

    const checkAt = requests.findIndex((entry) => entry.url.includes('/checkruns'));
    const unlockAt = requests.findIndex((entry) => entry.url.includes('_action=UNLOCK'));

    expect(checkAt).toBeGreaterThanOrEqual(0);
    expect(unlockAt).toBeGreaterThan(checkAt);
  });

  it('검증 요청의 질의 인자는 구 그대로다', async () => {
    const { requests } = await call({ ...ARGS, description: 'New text' });
    const params = new URL(requests[0]!.url).searchParams;

    expect(params.get('objtype')).toBe('dtel');
    expect(params.get('objname')).toBe('ZZ_TEST_DTEL_01');
    expect(params.get('packagename')).toBe('$TMP');
    expect(params.get('description')).toBe('New text');
    expect(requests[0]?.headers['Accept']).toBe('application/vnd.sap.as+xml');
  });

  it('설명을 안 주면 검증의 description이 이름으로 채워진다', async () => {
    const { requests } = await call();

    expect(new URL(requests[0]!.url).searchParams.get('description')).toBe('ZZ_TEST_DTEL_01');
  });

  it('오브젝트 주소는 **소문자**다 — 대문자로 줘도 같다', async () => {
    const { calls } = await call({ ...ARGS, data_element_name: 'ZZ_TEST_DTEL_01' });
    const objectCalls = calls.filter(
      (entry) => entry.includes('/ddic/dataelements/') && !entry.endsWith('/validation'),
    );

    expect(objectCalls).toHaveLength(4);
    expect(objectCalls.every((entry) => entry.endsWith(OBJECT_PATH))).toBe(true);
  });

  it('PUT의 헤더와 질의 인자', async () => {
    const { requests } = await call({ ...ARGS, transport_request: 'E19K905635' });
    const put = requests.find((entry) => entry.method === 'PUT')!;
    const params = new URL(put.url).searchParams;

    expect(params.get('lockHandle')).toBe('DTEL-LOCK');
    expect(params.get('corrNr')).toBe('E19K905635');
    expect(put.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8',
    );
    expect(put.headers['Accept']).toBe(
      'application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml',
    );
  });

  it('activate:false면 활성화 요청이 나가지 않는다', async () => {
    const { calls, payload } = await call({ ...ARGS, activate: false });

    expect(calls.join(' ')).not.toContain('/sap/bc/adt/activation');
    expect(payload.status).toBe('inactive');
  });
});

describe('읽기-수정-쓰기 — 주지 않은 값은 안 건드린다', () => {
  it('설명만 주면 타입 정보가 그대로 남는다 — 짝인 생성 쪽 패치와 다르다', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, {
      description: 'New text',
      typeKind: 'domain',
    });

    expect(patched).toContain('adtcore:description="New text"');
    expect(patched).toContain('<dtel:dataType>CHAR</dtel:dataType>');
    expect(patched).toContain('<dtel:dataTypeLength>000010</dtel:dataTypeLength>');
    expect(patched).toContain('<dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>');
  });

  it('길이·소수점은 6자리 0채움이다', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, { length: 12, decimals: 2 });

    expect(patched).toContain('<dtel:dataTypeLength>000012</dtel:dataTypeLength>');
    expect(patched).toContain('<dtel:dataTypeDecimals>000002</dtel:dataTypeDecimals>');
  });

  it('type_kind가 domain이면 type_name이 없을 때 data_type을 도메인 이름으로 쓴다', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, {
      typeKind: 'domain',
      dataType: 'zz_other_dom',
    });

    expect(patched).toContain('<dtel:typeName>ZZ_OTHER_DOM</dtel:typeName>');
  });

  it('domain이 아니면 type_name만 쓴다', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, {
      typeKind: 'refToClifType',
      typeName: 'zcl_x',
      dataType: 'CHAR',
    });

    expect(patched).toContain('<dtel:typeName>ZCL_X</dtel:typeName>');
    expect(patched).toContain('<dtel:typeKind>refToClifType</dtel:typeKind>');
  });

  it('라벨을 주면 길이 요소가 한 벌로 따라간다', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, { shortLabel: 'ABCD' });

    expect(patched).toContain('<dtel:shortFieldLabel>ABCD</dtel:shortFieldLabel>');
    expect(patched).toContain('<dtel:shortFieldLength>4</dtel:shortFieldLength>');
  });

  it('빈 라벨은 최대 길이로 떨어진다 — 구의 `|| 10` 갈래', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, { shortLabel: '' });

    expect(patched).toContain('<dtel:shortFieldLabel/>');
    expect(patched).toContain('<dtel:shortFieldLength>10</dtel:shortFieldLength>');
  });

  it('빈 문자열 검색도움말은 자기 닫음 태그로 접힌다', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, { searchHelp: '' });

    expect(patched).toContain('<dtel:searchHelp/>');
  });

  it('아무것도 안 주면 XML이 한 글자도 안 바뀐다', () => {
    expect(patchDataElementUpdateXml(CURRENT_XML, {})).toBe(CURRENT_XML);
  });

  it('설명은 60자에서 잘린다 — 공용 limitDescription', () => {
    const patched = patchDataElementUpdateXml(CURRENT_XML, { description: 'z'.repeat(70) });

    expect(patched).toContain(`adtcore:description="${'z'.repeat(60)}"`);
  });

  it('PUT 본문이 그 패치 결과와 같다', async () => {
    const { requests } = await call({ ...ARGS, description: 'New text' });
    const put = requests.find((entry) => entry.method === 'PUT')!;

    expect(put.body).toBe(
      patchDataElementUpdateXml(CURRENT_XML, { description: 'New text', typeKind: 'domain' }),
    );
  });
});

describe('검사 갈래', () => {
  it('구가 무시하던 세 갈래는 여기서도 무시한다', () => {
    expect(isIgnorableCheckNoise('Error importing from database')).toBe(true);
    expect(isIgnorableCheckNoise('no domain or data type was defined')).toBe(true);
    expect(isIgnorableCheckNoise('A datatype is expected here')).toBe(true);
    expect(isIgnorableCheckNoise('Field ZZ is unknown')).toBe(false);
  });

  it('진짜 검사 오류는 실패다 — 활성화가 나가지 않고 잠금은 풀린다', async () => {
    const { isError, text, calls } = await call(ARGS, {
      check: failingCheck('Field ZZ is unknown'),
    });

    expect(isError).toBe(true);
    expect(text).toContain('Data element check failed: Field ZZ is unknown');
    expect(calls.join(' ')).not.toContain('/sap/bc/adt/activation');
    expect(calls.filter((entry) => entry === `POST ${OBJECT_PATH}`)).toHaveLength(2);
  });

  it('무시 목록에 걸리는 오류는 사슬을 멈추지 않는다', async () => {
    const { isError, calls } = await call(ARGS, {
      check: failingCheck('Error importing from database'),
    });

    expect(isError).toBe(false);
    expect(calls.join(' ')).toContain('/sap/bc/adt/activation');
  });
});

describe('검증 단계 — "이미 있다"는 통과시킨다', () => {
  it('T100 열쇠 SWB_TOOL/016을 이미 있음으로 읽는다', () => {
    const body =
      '<entry key="T100KEY-ID">SWB_TOOL</entry><entry key="T100KEY-NO">016</entry>';

    expect(isAlreadyExistsError(new Error(body))).toBe(true);
  });

  it('예외 타입 id의 AlreadyExists도 읽는다', () => {
    expect(isAlreadyExistsError(new Error('<type id="ExceptionResourceAlreadyExists"/>'))).toBe(
      true,
    );
  });

  it('독일어 문구도 읽는다 — 구의 다국어 폴백', () => {
    expect(isAlreadyExistsError(new Error('Objekt existiert bereits'))).toBe(true);
    expect(isAlreadyExistsError(new Error('ist bereits vorhanden'))).toBe(true);
  });

  it('상관없는 오류는 통과시키지 않는다', () => {
    expect(isAlreadyExistsError(new Error('Not authorized'))).toBe(false);
  });

  it('검증이 "이미 있다"로 400을 내도 사슬이 계속된다', async () => {
    const { isError, calls } = await call(ARGS, {
      validationStatus: 400,
      validationBody:
        '<?xml version="1.0"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<type id="ExceptionResourceAlreadyExists"/><message lang="EN">already exists</message></exc:exception>',
    });

    expect(isError).toBe(false);
    expect(calls).toHaveLength(7);
  });

  it('검증이 다른 이유로 실패하면 사슬이 멈춘다 — 잠그지 않는다', async () => {
    const { isError, text, calls } = await call(ARGS, {
      validationStatus: 500,
      validationBody: 'Internal error',
    });

    expect(isError).toBe(true);
    expect(text).toContain('Failed to update data element ZZ_TEST_DTEL_01:');
    expect(calls.join(' ')).not.toContain('_action=LOCK');
    expect(calls).toHaveLength(1);
  });

  it('검증이 403이면 **구의 잠금 문구**로 접힌다 — 상태 코드로 판정하기 때문', async () => {
    // 구 `:355-360`은 403을 그 자리에서 "locked by another user or session"으로
    // 접는다. 검증 단계의 403도 같은 갈래로 떨어지며, 여기서 고치지 않는다.
    const { isError, text } = await call(ARGS, {
      validationStatus: 403,
      validationBody: 'Not authorized',
    });

    expect(isError).toBe(true);
    expect(text).toBe(
      'Data element ZZ_TEST_DTEL_01 is locked by another user or session. Please try again later.',
    );
  });
});

describe('활성화 — 구가 이미 판정한다', () => {
  it('두 속성이 참이면 성공이다', async () => {
    const { isError, payload } = await call();

    expect(isError).toBe(false);
    expect(payload.status).toBe('active');
  });

  it('속성 블록이 없으면 실패다 — 200이어도 접지 않는다', async () => {
    const { isError, text } = await call(ARGS, { activation: '<chkl:messages/>' });

    expect(isError).toBe(true);
    expect(text).toContain('Data element activation failed: Unknown activation status');
  });

  it('activationExecuted가 거짓이면 실패다', async () => {
    const { isError, text } = await call(ARGS, {
      activation:
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
        '<chkl:properties activationExecuted="false" checkExecuted="true"/></chkl:messages>',
    });

    expect(isError).toBe(true);
    expect(text).toContain('Activation failed');
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다 — **들여쓰기가 없다**', async () => {
    const { text, payload } = await call({ ...ARGS, transport_request: 'E19K905635' });

    expect(payload).toEqual({
      success: true,
      data_element_name: 'ZZ_TEST_DTEL_01',
      package: '$TMP',
      transport_request: 'E19K905635',
      data_type: null,
      status: 'active',
      message: 'Data element ZZ_TEST_DTEL_01 updated and activated successfully',
      data_element_details: null,
    });
    // 짝인 생성 쪽은 두 칸 들여쓰기다. 여기는 한 줄이다.
    expect(text).toBe(JSON.stringify(payload));
    expect(text).not.toContain('\n');
  });

  it('data_type을 주면 그대로 실린다', async () => {
    const { payload } = await call({ ...ARGS, data_type: 'NUMC' });

    expect(payload.data_type).toBe('NUMC');
  });

  it('activate:false면 문구에서 "and activated"가 빠진다', async () => {
    const { payload } = await call({ ...ARGS, activate: false });

    expect(payload.message).toBe('Data element ZZ_TEST_DTEL_01 updated successfully');
  });
});

describe('갈래', () => {
  it('data_element_name이 비면 요청이 나가지 않는다 — 구의 문장, 접두사 없음(D34)', async () => {
    const { isError, text, requests } = await call({ ...ARGS, data_element_name: '' });

    expect(isError).toBe(true);
    expect(text).toBe('Data element name is required');
    expect(requests).toHaveLength(0);
  });

  it('package_name이 비면 요청이 나가지 않는다', async () => {
    const { isError, text, requests } = await call({ ...ARGS, package_name: '' });

    expect(isError).toBe(true);
    expect(text).toBe('Package name is required');
    expect(requests).toHaveLength(0);
  });

  it('404는 not found 문구다', async () => {
    const { isError, text } = await call(ARGS, { lockStatus: 404 });

    expect(isError).toBe(true);
    expect(text).toBe('Data element ZZ_TEST_DTEL_01 not found.');
  });

  it('403은 잠금 문구다', async () => {
    const { isError, text } = await call(ARGS, { lockStatus: 403 });

    expect(isError).toBe(true);
    expect(text).toBe(
      'Data element ZZ_TEST_DTEL_01 is locked by another user or session. Please try again later.',
    );
  });

  it('PUT이 실패하면 잠금은 풀리고 구의 문구로 올라온다', async () => {
    const { isError, text, calls } = await call(ARGS, { putStatus: 500 });

    expect(isError).toBe(true);
    expect(text).toContain('Failed to update data element ZZ_TEST_DTEL_01:');
    expect(calls.filter((entry) => entry === `POST ${OBJECT_PATH}`)).toHaveLength(2);
  });

  it('시험 서버 오리진이 그대로 쓰인다 — 실 SAP에 나가지 않는다', async () => {
    const { requests } = await call();

    for (const request of requests) {
      expect(request.url.startsWith(TEST_ORIGIN)).toBe(true);
    }
  });
});
