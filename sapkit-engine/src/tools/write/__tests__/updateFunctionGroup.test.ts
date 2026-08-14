/**
 * `UpdateFunctionGroup` — 발행 계약 · 와이어 사슬(**주소 대소문자가 자리마다 다르다**) ·
 * 콘텐츠 타입 협상 · 설명 40자 자르기 · 응답 · 갈래.
 *
 * **전송 주입 하네스를 쓴다.** 이 도구는 `/sap/bc/adt/discovery`를 콘텐츠 타입
 * 협상에 쓰는데, `write/__tests__/harness.ts`는 그 경로를 CSRF 왕복으로 보고
 * 가로채 `calls()`에서 지운다 — 그러면 협상이 시험에 보이지 않는다. 짝인
 * `createFunctionGroup.test.ts`가 같은 이유로 같은 선택을 했다.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 사슬·헤더·40자 자르기·응답 키 →
 *    `engine/src/handlers/function/high/handleUpdateFunctionGroup.ts:63-234`
 *  - 잠금/해제 주소(소문자, 인코딩 없음) → 벤더 `.../core/functionGroup/lock.js:19, 60`
 *  - 읽기 주소(대문자 + 인코딩)와 Accept 와일드카드 → `.../core/functionGroup/read.js:14-24`
 *  - 협상 헤더 두 줄 → `engine/src/lib/adtFunctionGroupContentTypes.ts:48-57`
 *
 * **활성화가 없다는 것도 실측이다** — 이 계열에는 활성화 단계 자체가 없으므로
 * 옆 계열(D2·D41·D121·D122)의 「활성화 거짓 성공」이 존재하지 않는다.
 */

import {
  limitFunctionGroupDescription,
  patchFunctionGroupDescription,
  updateFunctionGroup,
} from '../updateFunctionGroup';
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
const DISCOVERY_PATH = '/sap/bc/adt/discovery';
const LOCK_PATH = '/sap/bc/adt/functions/groups/ztest_fg_001';
const OBJECT_PATH = '/sap/bc/adt/functions/groups/ZTEST_FG_001';

const ARGS = { function_group_name: 'ztest_fg_001', description: 'New description' };

const CURRENT_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<group:abapFunctionGroup xmlns:group="http://www.sap.com/adt/functions/groups" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="old text" ' +
  'adtcore:name="ZTEST_FG_001" adtcore:type="FUGR/F">' +
  '<adtcore:packageRef adtcore:name="$TMP"/></group:abapFunctionGroup>';

const LOCK_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
  '<LOCK_HANDLE>FG-LOCK</LOCK_HANDLE></DATA></asx:values></asx:abap>';

/** 인자를 안 주면 **v2까지만** 광고하는 S/4HANA 2021 온프렘의 실측 형태다. */
function discoveryAdvertising(...types: string[]): string {
  if (types.length === 0) types = ['application/vnd.sap.adt.functions.groups.v2+xml'];
  const accepts = types.map((type) => `<app:accept>${type}</app:accept>`).join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app">' +
    '<app:workspace>' +
    `<app:collection href="/sap/bc/adt/functions/groups">${accepts}</app:collection>` +
    '</app:workspace></app:service>'
  );
}

interface Scenario {
  readonly discovery?: string;
  readonly discoveryStatus?: number;
  readonly lockStatus?: number;
  readonly current?: string;
  readonly currentStatus?: number;
  readonly putStatus?: number;
}

function serve(scenario: Scenario = {}): (request: RecordedRequest, index: number) => Reply {
  return (request) => {
    const url = request.url;
    if (url.includes(CSRF_PATH)) return { headers: { 'x-csrf-token': 'TEST-TOKEN' } };
    if (url.includes(DISCOVERY_PATH)) {
      return {
        status: scenario.discoveryStatus ?? 200,
        body: scenario.discovery ?? discoveryAdvertising(),
      };
    }
    if (url.includes('_action=LOCK')) {
      return { status: scenario.lockStatus ?? 200, body: LOCK_XML };
    }
    if (url.includes('_action=UNLOCK')) return { body: '<ok/>' };
    if (request.method === 'PUT') return { status: scenario.putStatus ?? 200, body: '' };
    // 남은 것은 현재 XML 읽기 GET 하나다.
    return { status: scenario.currentStatus ?? 200, body: scenario.current ?? CURRENT_XML };
  };
}

/** CSRF 왕복만 걷어낸다 — 협상 GET은 이 도구가 보낸 것이므로 남긴다. */
function sent(requests: readonly RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => !request.url.includes(CSRF_PATH));
}

async function call(args: Record<string, unknown> = ARGS, scenario: Scenario = {}) {
  const { outcome, requests } = await runTool(updateFunctionGroup, args, serve(scenario));
  const list = sent(requests);
  return {
    isError: outcome.isError,
    text: outcome.text,
    payload: outcome.isError ? {} : (JSON.parse(outcome.text) as Record<string, unknown>),
    calls: list.map(
      (request) => `${request.method} ${new URL(request.url).pathname}`,
    ),
    requests: list,
  };
}

function queryOf(request: RecordedRequest, name: string): string | null {
  return new URL(request.url).searchParams.get(name);
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const listing = await harnessFor(updateFunctionGroup);
    try {
      const listed = await listing.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('UpdateFunctionGroup'));
    } finally {
      await listing.close();
    }
  });

  it('노출·정책 선언 — high, mutation, 대상 이름 선언 필수', () => {
    expect(updateFunctionGroup.definition.sets).toEqual(['high']);
    expect(updateFunctionGroup.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateFunctionGroup.definition.kind).toBe('mutation');
    expect(updateFunctionGroup.definition.targetNames).toEqual(['function_group_name']);
  });

  it('description은 **필수**다 — 짝인 CreateFunctionGroup에서는 선택이다', () => {
    const mine = publishedDeclaration('UpdateFunctionGroup').inputSchema as {
      required: string[];
    };
    const create = publishedDeclaration('CreateFunctionGroup').inputSchema as {
      required: string[];
    };

    expect([...mine.required].sort()).toEqual(['description', 'function_group_name']);
    expect(create.required).not.toContain('description');
  });
});

describe('와이어 — 주소의 대소문자가 자리마다 다르다', () => {
  it('협상 → 잠금 → 읽기 → PUT → 해제 순서로 나간다', async () => {
    const { isError, calls } = await call();

    expect(isError).toBe(false);
    expect(calls).toEqual([
      `GET ${DISCOVERY_PATH}`,
      `POST ${LOCK_PATH}`,
      `GET ${OBJECT_PATH}`,
      `PUT ${OBJECT_PATH}`,
      `POST ${LOCK_PATH}`,
    ]);
  });

  it('잠금·해제는 **소문자**, 읽기·PUT은 **대문자**다 — 접어 합치지 않았다', async () => {
    const { requests } = await call();

    expect(new URL(requests[1]!.url).pathname).toBe(LOCK_PATH);
    expect(queryOf(requests[1]!, 'accessMode')).toBe('MODIFY');
    expect(new URL(requests[4]!.url).pathname).toBe(LOCK_PATH);
    expect(queryOf(requests[4]!, 'lockHandle')).toBe('FG-LOCK');
    expect(new URL(requests[2]!.url).pathname).toBe(OBJECT_PATH);
    expect(new URL(requests[3]!.url).pathname).toBe(OBJECT_PATH);
    expect(LOCK_PATH).not.toBe(OBJECT_PATH);
  });

  it('대문자로 줘도 같은 두 주소로 간다 — 이름을 먼저 대문자로 만든다', async () => {
    const { calls } = await call({ ...ARGS, function_group_name: 'ZTEST_FG_001' });

    expect(calls).toEqual([
      `GET ${DISCOVERY_PATH}`,
      `POST ${LOCK_PATH}`,
      `GET ${OBJECT_PATH}`,
      `PUT ${OBJECT_PATH}`,
      `POST ${LOCK_PATH}`,
    ]);
  });

  it('현재 XML 읽기의 Accept는 와일드카드다 — 벤더 기본값', async () => {
    const { requests } = await call();

    expect(requests[2]?.headers['Accept']).toBe('*/*');
  });

  it('PUT은 잠금 손잡이와 이송번호를 질의 인자로 싣는다', async () => {
    const { requests } = await call({ ...ARGS, transport_request: 'E19K905635' });

    expect(queryOf(requests[3]!, 'lockHandle')).toBe('FG-LOCK');
    expect(queryOf(requests[3]!, 'corrNr')).toBe('E19K905635');
  });

  it('이송번호를 안 주면 corrNr가 붙지 않는다', async () => {
    const { requests } = await call();

    expect(requests[3]?.url).not.toContain('corrNr');
  });

  it('활성화 요청이 **없다** — 이 계열에는 활성화 단계 자체가 없다', async () => {
    const { calls } = await call();

    expect(calls.join(' ')).not.toContain('/sap/bc/adt/activation');
  });

  it('구문검사(checkruns)도 없다 — 메타데이터만 바꾼다', async () => {
    const { calls } = await call();

    expect(calls.join(' ')).not.toContain('/sap/bc/adt/checkruns');
  });
});

describe('콘텐츠 타입 협상', () => {
  it('discovery가 v2까지만 광고하면 PUT은 v2로 나간다 — Content-Type에만 charset이 붙는다', async () => {
    const { requests } = await call();

    expect(requests[3]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.functions.groups.v2+xml; charset=utf-8',
    );
    expect(requests[3]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.functions.groups.v2+xml',
    );
  });

  it('여러 판이 광고되면 가장 높은 판을 고른다', async () => {
    const { requests } = await call(ARGS, {
      discovery: discoveryAdvertising(
        'application/vnd.sap.adt.functions.groups+xml',
        'application/vnd.sap.adt.functions.groups.v3+xml',
        'application/vnd.sap.adt.functions.groups.v2+xml',
      ),
    });

    expect(requests[3]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.functions.groups.v3+xml',
    );
  });

  it('discovery가 안 되면 v3 기본값으로 떨어진다 — 사슬은 계속된다', async () => {
    const { isError, requests } = await call(ARGS, { discoveryStatus: 500, discovery: 'boom' });

    expect(isError).toBe(false);
    expect(requests[3]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.functions.groups.v3+xml; charset=utf-8',
    );
    expect(requests[3]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.functions.groups.v3+xml',
    );
  });

  it('알아볼 미디어 타입이 없으면 v3 기본값이다', async () => {
    const { requests } = await call(ARGS, {
      discovery: discoveryAdvertising('application/vnd.sap.adt.something.else+xml'),
    });

    expect(requests[3]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.functions.groups.v3+xml',
    );
  });

  it('협상 GET의 Accept는 atomsvc다', async () => {
    const { requests } = await call();

    expect(requests[0]?.headers['Accept']).toBe('application/atomsvc+xml');
  });

  it('협상은 **잠그기 전**이다 — 세션이 stateless일 때 물어본다', async () => {
    const { calls } = await call();

    expect(calls[0]).toBe(`GET ${DISCOVERY_PATH}`);
    expect(calls[1]).toBe(`POST ${LOCK_PATH}`);
  });
});

describe('설명 갈아 끼우기 — 40자에서 자른다', () => {
  it('40자 자르기는 공용 60자와 다른 함수다', () => {
    expect(limitFunctionGroupDescription('x'.repeat(50))).toHaveLength(40);
    expect(limitFunctionGroupDescription('short')).toBe('short');
    expect(limitFunctionGroupDescription('y'.repeat(40))).toHaveLength(40);
  });

  it('큰따옴표는 &quot;로 바뀐다 — 속성이 깨지지 않게', () => {
    expect(patchFunctionGroupDescription(CURRENT_XML, 'a "b" c')).toContain(
      'adtcore:description="a &quot;b&quot; c"',
    );
  });

  it('속성이 없는 XML은 손대지 않는다 — 구의 정규식 한 방 그대로', () => {
    const noDescription = '<group:abapFunctionGroup adtcore:name="ZTEST_FG_001"/>';

    expect(patchFunctionGroupDescription(noDescription, 'New')).toBe(noDescription);
  });

  it('PUT 본문은 읽어 온 XML에서 설명 한 속성만 바뀐 것이다', async () => {
    const { requests } = await call();

    expect(requests[3]?.body).toBe(
      CURRENT_XML.replace(
        'adtcore:description="old text"',
        'adtcore:description="New description"',
      ),
    );
  });

  it('40자를 넘는 설명은 전문에서만 잘린다 — 응답에는 원본이 실린다', async () => {
    const long = 'D'.repeat(50);
    const { requests, payload } = await call({ ...ARGS, description: long });

    expect(requests[3]?.body).toContain(`adtcore:description="${'D'.repeat(40)}"`);
    expect(payload.description).toBe(long);
  });

  it('설명 속성이 없는 XML이면 원본 그대로 PUT 된다 — 구도 그렇다', async () => {
    const bare = '<group:abapFunctionGroup adtcore:name="ZTEST_FG_001"/>';
    const { requests } = await call(ARGS, { current: bare });

    expect(requests[3]?.body).toBe(bare);
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다 — uri는 대문자다', async () => {
    const { payload } = await call();

    expect(payload).toEqual({
      success: true,
      function_group_name: 'ZTEST_FG_001',
      description: 'New description',
      transport_request: 'local',
      message: 'Function group ZTEST_FG_001 metadata updated successfully',
      uri: OBJECT_PATH,
      steps_completed: ['lock', 'get_current', 'update_metadata', 'unlock'],
    });
  });

  it('이송번호가 없으면 transport_request는 문자열 "local"이다 — null이 아니다', async () => {
    const { payload } = await call();

    expect(payload.transport_request).toBe('local');
  });

  it('이송번호를 주면 그대로 실린다', async () => {
    const { payload } = await call({ ...ARGS, transport_request: 'E19K905635' });

    expect(payload.transport_request).toBe('E19K905635');
  });

  it('본문은 JSON 두 칸 들여쓰기다', async () => {
    const { text, payload } = await call();

    expect(text).toBe(JSON.stringify(payload, null, 2));
  });
});

describe('갈래', () => {
  it.each([
    ['function_group_name', { ...ARGS, function_group_name: '' }],
    ['description', { ...ARGS, description: '' }],
  ])('%s가 비면 요청이 한 건도 나가지 않는다 — 구는 둘을 한 문구로 말했다', async (_name, args) => {
    const { isError, text, requests } = await call(args);

    expect(isError).toBe(true);
    expect(text).toBe('Error: function_group_name and description are required');
    expect(requests).toHaveLength(0);
  });

  it('잠금이 404면 not found 문구다', async () => {
    const { isError, text } = await call(ARGS, { lockStatus: 404 });

    expect(isError).toBe(true);
    expect(text).toBe('Error: Function group ZTEST_FG_001 not found.');
  });

  it('현재 XML이 비면 구의 문구로 실패하고 잠금은 풀린다', async () => {
    const { isError, text, calls } = await call(ARGS, { current: '' });

    expect(isError).toBe(true);
    expect(text).toContain('Failed to get current function group data');
    expect(calls.filter((entry) => entry.startsWith('PUT'))).toHaveLength(0);
    expect(calls.filter((entry) => entry === `POST ${LOCK_PATH}`)).toHaveLength(2);
  });

  it('PUT이 415로 거절당하면 잠금은 풀리고 구의 문구로 올라온다', async () => {
    const { isError, text, calls } = await call(ARGS, { putStatus: 415 });

    expect(isError).toBe(true);
    expect(text).toContain('Failed to update function group:');
    expect(calls.filter((entry) => entry === `POST ${LOCK_PATH}`)).toHaveLength(2);
  });

  it('시험 서버 오리진이 그대로 쓰인다 — 실 SAP에 나가지 않는다', async () => {
    const { requests } = await call();

    for (const request of requests) {
      expect(request.url.startsWith(TEST_ORIGIN)).toBe(true);
    }
  });
});
