/**
 * `CreateFunctionGroup` — 발행 계약 · 노출 선언 · 와이어 8단계 · 관용 · 갈래.
 *
 * **전송 주입 하네스를 쓴다.** 이 도구는 `/sap/bc/adt/discovery`를 콘텐츠 타입
 * 협상에 쓰는데, `write/__tests__/harness.ts`는 그 경로를 CSRF 왕복으로 보고
 * 가로채 `calls()`에서 지운다 — 그러면 협상이 시험에 보이지 않는다. 읽기 쪽
 * 지원 모듈의 `runTool`은 전송을 통째로 주입하므로 CSRF(`/core/discovery`)와
 * 협상(`/discovery`)을 따로 답하고 둘 다 관찰할 수 있다.
 *
 * 기대값의 출처는 구 엔진이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 8단계 순서 → `engine/src/handlers/function/high/handleCreateFunctionGroup.ts:93-262`
 *    와 `@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/AdtFunctionGroup.js:63-210`
 *  - 협상 규칙과 그 실측 근거 → `engine/src/lib/adtFunctionGroupContentTypes.ts`
 *  - 저수준 요청 → 같은 패키지 `core/functionGroup/{validation,create,read,activation}.js`
 */

import {
  createFunctionGroup,
  extractCollectionAccepts,
  pickFunctionGroupContentType,
} from '../createFunctionGroup';
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
const FG_UPPER = `${TEST_ORIGIN}/sap/bc/adt/functions/groups/ZFG_TEST`;
const FG_LOWER = '/sap/bc/adt/functions/groups/zfg_test';

const ARGS = { function_group_name: 'zfg_test', package_name: '$TMP' };

const CLEAN_CHECK =
  '<?xml version="1.0" encoding="UTF-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:status="processed"/></chkrun:checkRunReports>';
const VALIDATION_OK =
  '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>';

/**
 * discovery 문서. 인자를 안 주면 **v2까지만** 광고하는 S/4HANA 2021 온프렘의
 * 실측 형태다 — 그 시스템에 벤더 기본값 v3로 POST하면 HTTP 400이 난다.
 */
function discoveryAdvertising(
  ...types: string[]
): string {
  if (types.length === 0) types = ['application/vnd.sap.adt.functions.groups.v2+xml'];
  const accepts = types.map((type) => `<app:accept>${type}</app:accept>`).join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app">' +
    '<app:workspace>' +
    `<app:collection href="/sap/bc/adt/functions/groups">${accepts}</app:collection>` +
    '<app:collection href="/sap/bc/adt/oo/classes"><app:accept>application/vnd.sap.adt.oo.classes.v2+xml</app:accept></app:collection>' +
    '</app:workspace></app:service>'
  );
}

interface Scenario {
  readonly discovery?: string;
  readonly validation?: string | ((index: number) => Reply);
  readonly createStatus?: number;
  readonly createBody?: string;
  readonly check?: string;
  readonly activation?: string;
}

/** 8단계 전부에 답하는 응답기. */
function serve(scenario: Scenario = {}): (request: RecordedRequest, index: number) => Reply {
  let validationCalls = 0;
  return (request) => {
    const url = request.url;
    if (url.includes(CSRF_PATH)) return { headers: { 'x-csrf-token': 'TEST-TOKEN' } };
    if (url.includes('/sap/bc/adt/discovery')) {
      return { body: scenario.discovery ?? discoveryAdvertising() };
    }
    if (url.includes('/sap/bc/adt/functions/validation')) {
      const index = validationCalls++;
      if (typeof scenario.validation === 'function') return scenario.validation(index);
      return { body: scenario.validation ?? VALIDATION_OK };
    }
    if (url.includes('/sap/bc/adt/checkruns')) return { body: scenario.check ?? CLEAN_CHECK };
    if (url.includes('/sap/bc/adt/activation')) {
      return { body: scenario.activation ?? '<chkl:messages/>' };
    }
    if (request.method === 'POST' && url.endsWith('/sap/bc/adt/functions/groups')) {
      const status = scenario.createStatus ?? 201;
      return { status, body: scenario.createBody ?? '<group/>' };
    }
    // 남은 것은 함수그룹 GET(준비 대기 · 마무리) 둘이다.
    return { body: '<group:abapFunctionGroup/>' };
  };
}

/** CSRF 왕복만 걷어낸다 — 협상 GET은 이 도구가 보낸 것이므로 남긴다. */
function sent(requests: readonly RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => !request.url.includes(CSRF_PATH));
}

async function call(
  args: Record<string, unknown> = ARGS,
  scenario: Scenario = {},
): Promise<{
  isError: boolean;
  text: string;
  payload: Record<string, unknown>;
  calls: string[];
  requests: RecordedRequest[];
}> {
  const { outcome, requests } = await runTool(createFunctionGroup, args, serve(scenario));
  const list = sent(requests);
  return {
    isError: outcome.isError,
    text: outcome.text,
    payload: outcome.isError ? {} : (JSON.parse(outcome.text) as Record<string, unknown>),
    calls: list.map((request) => `${request.method} ${request.url.replace(TEST_ORIGIN, '')}`),
    requests: list,
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const listing = await harnessFor(createFunctionGroup);
    try {
      const listed = await listing.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('CreateFunctionGroup'));
    } finally {
      await listing.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/function/high/` → high 집합.
    expect(createFunctionGroup.definition.sets).toEqual(['high']);
    expect(createFunctionGroup.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createFunctionGroup.definition.kind).toBe('mutation');
    expect(createFunctionGroup.definition.targetNames).toEqual(['function_group_name']);
  });
});

describe('와이어 — 8단계', () => {
  it('협상 → 검증 → 검증 → 생성 → 대기읽기 → 검사 → 마무리읽기 → 활성화', async () => {
    const { isError, calls } = await call();

    expect(isError).toBe(false);
    expect(calls).toEqual([
      'GET /sap/bc/adt/discovery',
      'POST /sap/bc/adt/functions/validation?objtype=FUGR%2FF&objname=ZFG_TEST&packagename=%24TMP&description=ZFG_TEST',
      'POST /sap/bc/adt/functions/validation?objtype=FUGR%2FF&objname=ZFG_TEST&packagename=%24TMP&description=ZFG_TEST',
      'POST /sap/bc/adt/functions/groups',
      'GET /sap/bc/adt/functions/groups/ZFG_TEST?withLongPolling=true',
      'POST /sap/bc/adt/checkruns?reporters=abapCheckRun',
      'GET /sap/bc/adt/functions/groups/ZFG_TEST',
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
  });

  it('같은 검증이 두 번 나간다 — 하나로 접지 않는다', async () => {
    const { calls } = await call();

    const validations = calls.filter((entry) => entry.includes('/functions/validation'));
    expect(validations).toHaveLength(2);
    expect(validations[0]).toBe(validations[1]);
  });

  it('읽기는 대문자 이름, 검사·활성화는 소문자 이름을 쓴다', async () => {
    const { requests } = await call();

    expect(requests[4]?.url).toBe(`${FG_UPPER}?withLongPolling=true`);
    expect(requests[6]?.url).toBe(FG_UPPER);
    expect(requests[5]?.body).toContain(`adtcore:uri="${FG_LOWER}"`);
    expect(requests[7]?.body).toContain(`adtcore:uri="${FG_LOWER}"`);
  });

  it('생성 페이로드와 헤더가 구 그대로다 (Accept는 싣지 않는다)', async () => {
    const { requests } = await call({ ...ARGS, description: 'Lab group' });
    const create = requests[3];

    expect(create?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.functions.groups.v2+xml',
    );
    // 구 `create.js:66-74`는 Content-Type만 넘기므로 접속 계층 기본 Accept가 나간다.
    expect(create?.headers['Accept']).toBe('application/xml, application/json, text/plain, */*');
    expect(create?.body).toContain('adtcore:name="ZFG_TEST"');
    expect(create?.body).toContain('adtcore:type="FUGR/F"');
    expect(create?.body).toContain('adtcore:language="EN"');
    expect(create?.body).toContain('adtcore:masterLanguage="EN"');
    expect(create?.body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
  });

  it('전송요청은 corrNr로 붙고, 없으면 아예 붙지 않는다', async () => {
    const withTransport = await call({ ...ARGS, transport_request: 'E19K905635' });
    const without = await call();

    expect(withTransport.requests[3]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/functions/groups?corrNr=E19K905635`,
    );
    expect(without.requests[3]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/functions/groups`);
    expect(without.payload.transport_request).toBe('local');
  });

  it('activate=false면 활성화가 빠지고 응답도 그렇게 말한다', async () => {
    const { calls, payload } = await call({ ...ARGS, activate: false });

    expect(calls.some((entry) => entry.includes('/activation'))).toBe(false);
    expect(payload.activated).toBe(false);
    expect(payload.message).toBe('Function group ZFG_TEST created successfully');
  });

  it('설명이 없으면 그룹 이름을 설명으로 쓰고, 60자를 넘으면 자른다', async () => {
    const long = 'D'.repeat(75);
    const { requests } = await call({ ...ARGS, description: long });

    expect(requests[1]?.url).toContain(`description=${'D'.repeat(60)}`);
    expect(requests[3]?.body).toContain(`adtcore:description="${'D'.repeat(60)}"`);
  });
});

describe('콘텐츠 타입 협상 — v3 기본값이 v2만 광고하는 시스템에서 400을 낸다', () => {
  it('광고된 것 중 가장 높은 판을 고른다', async () => {
    const { requests } = await call(ARGS, {
      discovery: discoveryAdvertising(
        'application/vnd.sap.adt.functions.groups+xml',
        'application/vnd.sap.adt.functions.groups.v2+xml',
      ),
    });

    expect(requests[3]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.functions.groups.v2+xml',
    );
  });

  it('discovery가 없으면 벤더 기본값 v3로 떨어진다', async () => {
    const { requests, isError } = await call(ARGS, { discovery: '' });

    expect(isError).toBe(false);
    expect(requests[3]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.functions.groups.v3+xml',
    );
  });

  it('함수그룹 미디어 타입이 하나도 없으면 기본값으로 떨어진다', async () => {
    const { requests } = await call(ARGS, {
      discovery: discoveryAdvertising('application/vnd.sap.adt.something.else+xml'),
    });

    expect(requests[3]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.functions.groups.v3+xml',
    );
  });

  it('추출기는 다른 컬렉션의 accept를 섞지 않는다', () => {
    const xml = discoveryAdvertising('application/vnd.sap.adt.functions.groups.v2+xml');

    expect(extractCollectionAccepts(xml, '/sap/bc/adt/functions/groups')).toEqual([
      'application/vnd.sap.adt.functions.groups.v2+xml',
    ]);
    expect(extractCollectionAccepts(xml, '/sap/bc/adt/oo/classes')).toEqual([
      'application/vnd.sap.adt.oo.classes.v2+xml',
    ]);
    expect(extractCollectionAccepts(xml, '/sap/bc/adt/nope')).toEqual([]);
  });

  it('판 없는 이름은 v1로 세어 판 있는 쪽에 진다', () => {
    expect(
      pickFunctionGroupContentType([
        'application/vnd.sap.adt.functions.groups.v2+xml',
        'application/vnd.sap.adt.functions.groups+xml',
      ]),
    ).toBe('application/vnd.sap.adt.functions.groups.v2+xml');
    expect(pickFunctionGroupContentType(['application/vnd.sap.adt.functions.groups+xml'])).toBe(
      'application/vnd.sap.adt.functions.groups+xml',
    );
    expect(pickFunctionGroupContentType(['text/plain'])).toBeUndefined();
  });
});

describe('Kerberos 관용 — 세 자리 전부에서 실패로 보지 않는다', () => {
  const KERBEROS = 'Kerberos library not loaded';

  it('검증이 SEVERITY=ERROR로 그 문구를 담아도 생성으로 넘어간다', async () => {
    const body = `<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>${KERBEROS}</SHORT_TEXT></DATA></asx:values></asx:abap>`;
    const { isError, calls } = await call(ARGS, { validation: body });

    expect(isError).toBe(false);
    expect(calls).toHaveLength(8);
  });

  it('생성이 400으로 그 문구를 담아도 체인이 이어진다', async () => {
    const { isError, calls, payload } = await call(ARGS, {
      createStatus: 400,
      createBody: `<error>${KERBEROS}</error>`,
    });

    expect(isError).toBe(false);
    expect(calls).toHaveLength(8);
    expect(payload.success).toBe(true);
  });

  it('생성 후 검사가 그 문구를 오류로 담아도 실패가 아니다', async () => {
    const { isError } = await call(ARGS, { check: failingCheck(KERBEROS) });

    expect(isError).toBe(false);
  });

  it('빈 함수그룹이 내는 검사 잡음도 실패가 아니다', async () => {
    const { isError } = await call(ARGS, {
      check: failingCheck('REPORT/PROGRAM statement is missing'),
    });

    expect(isError).toBe(false);
  });

  it('진짜 검사 오류는 실패다', async () => {
    const { isError, text } = await call(ARGS, { check: failingCheck('Field IV_X is unknown') });

    expect(isError).toBe(true);
    expect(text).toBe(
      'Error: Failed to create function group ZFG_TEST: Function group check failed: Field IV_X is unknown',
    );
  });
});

describe('갈래', () => {
  it('첫 검증이 SEVERITY=ERROR면 거기서 멈춘다', async () => {
    const body =
      '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>Function group ZFG_TEST already exists</SHORT_TEXT></DATA></asx:values></asx:abap>';
    const { isError, text, calls } = await call(ARGS, {
      validation: (index) => (index === 0 ? { body } : { body: VALIDATION_OK }),
    });

    expect(isError).toBe(true);
    expect(text).toBe(
      'Error: Function group validation failed: Function group ZFG_TEST already exists',
    );
    // 협상 + 검증 하나에서 끝난다.
    expect(calls).toHaveLength(2);
  });

  it('둘째 검증이 SEVERITY=ERROR면 SHORT_TEXT를 달고 실패한다', async () => {
    const body =
      '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>package is locked</SHORT_TEXT></DATA></asx:values></asx:abap>';
    const { isError, text, calls } = await call(ARGS, {
      validation: (index) => (index === 1 ? { body } : { body: VALIDATION_OK }),
    });

    expect(isError).toBe(true);
    expect(text).toBe('Error: Failed to create function group ZFG_TEST: package is locked');
    expect(calls).toHaveLength(3);
  });

  it('생성 409는 이미 있다는 문구다', async () => {
    const { isError, text } = await call(ARGS, { createStatus: 409, createBody: '<error/>' });

    expect(isError).toBe(true);
    expect(text).toBe(
      'Error: Function group ZFG_TEST already exists. Please delete it first or use a different name.',
    );
  });

  it('생성 400은 exc:exception의 문구를 꺼내 온다', async () => {
    const { text } = await call(ARGS, {
      createStatus: 400,
      createBody:
        '<?xml version="1.0"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionBadRequest"/><message lang="EN">Daten sind ungueltig</message><properties/></exc:exception>',
    });

    expect(text).toBe('Error: Bad request: Daten sind ungueltig');
  });

  it('읽을 수 없는 400은 고정 문구다', async () => {
    const { text } = await call(ARGS, { createStatus: 400, createBody: 'plain text failure' });

    expect(text).toBe(
      'Error: Bad request. Check if function group name is valid and package exists.',
    );
  });

  it('Business partner 400은 성공으로 답한다 (구와 같다 — 오브젝트는 생겼다)', async () => {
    const { isError, payload } = await call(ARGS, {
      createStatus: 400,
      createBody: '<error>Business partner does not exist</error>',
    });

    expect(isError).toBe(false);
    expect(payload.success).toBe(true);
    expect(payload.message).toBe(
      'Function group ZFG_TEST may have been created successfully (SAP returned error but object exists)',
    );
  });

  it('준비 대기·마무리 읽기가 404여도 성공을 막지 않는다', async () => {
    const { isError, calls } = await call(ARGS, {});
    expect(isError).toBe(false);
    expect(calls).toHaveLength(8);

    const withFailingReads = await runTool(createFunctionGroup, ARGS, (request, index) => {
      const base = serve()(request, index);
      if (request.method === 'GET' && request.url.includes('/functions/groups/ZFG_TEST')) {
        return { status: 404, body: '' };
      }
      return base;
    });
    expect(withFailingReads.outcome.isError).toBe(false);
  });

  it('빈 인자는 접속을 만들기 전에 거절한다', async () => {
    const noName = await call({ function_group_name: '', package_name: '$TMP' });
    const noPackage = await call({ function_group_name: 'ZFG', package_name: '' });

    expect(noName.text).toBe('Error: function_group_name is required');
    expect(noName.calls).toEqual([]);
    expect(noPackage.text).toBe('Error: package_name is required');
    expect(noPackage.calls).toEqual([]);
  });
});

/** 오류 하나를 실은 `chkrun` 보고. */
function failingCheck(text: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">' +
    '<chkrun:checkMessageList>' +
    `<chkrun:checkMessage chkrun:type="E" chkrun:shortText="${text}" line="1"/>` +
    '</chkrun:checkMessageList>' +
    '</chkrun:checkReport></chkrun:checkRunReports>'
  );
}
