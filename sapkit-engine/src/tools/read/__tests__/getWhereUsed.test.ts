/**
 * `GetWhereUsed` — 발행 계약 · 두 단계 POST · 범위 끼우기 · 파싱 · 오류 갈래.
 *
 * ## 기대값을 어디서 뽑았나 (자기확인 회피)
 *
 * 아래 요청 두 건(주소·헤더·본문)과 파싱 결과는 **구 패키지의 `getWhereUsedList`를
 * 가짜 접속에 물려 실제로 돌려서** 받은 것이다
 * (`@babamba2/mcp-abap-adt-clients/dist/core/shared/whereUsed.js:159-330`). 신
 * 구현을 돌려 얻은 값이 아니라 **구 코드의 실행 출력**이므로, 신 엔진이 같은
 * 문자열을 만들어야만 통과한다.
 *
 * 그 실행이 드러낸 구의 실측 셋을 시험이 고정한다.
 *  - `total_references`는 SAP이 준 `numberOfResults`이고 **배열 길이와 다르다** —
 *    `DEVC/K` 항목이 목록에서는 빠지지만 총계에는 남기 때문이다.
 *  - `enable_all_types`는 범위 XML의 `isSelected="false"`를 전부 뒤집는다.
 *  - 뿌리 요소가 없는 응답은 **오류가 아니라** 0건 결과다.
 *
 * POST 두 건이라 접속 계층이 CSRF 토큰을 먼저 긁는다. 그 왕복은 도구의 계약이
 * 아니므로 `csrfAware`로 토큰을 내주고 `toolRequests`로 걸러 낸다.
 */

import { buildObjectUri, getWhereUsed } from '../getWhereUsed';
import {
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';
import type { RecordedRequest, Reply } from './support';

const SCOPE_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences/scope';
const SEARCH_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences';

/** 구 코드에 물렸던 범위 응답 그대로. */
const SCOPE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
  '<usagereferences:type name="CLAS" isSelected="false"/>' +
  '<usagereferences:type name="PROG" isSelected="true"/>' +
  '</usagereferences:usageScopeResult>';

/** 구 코드에 물렸던 검색 응답 그대로 — 가운데 항목이 DEVC/K다. */
const RESULT_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<usagereferences:usageReferenceResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core" numberOfResults="3" resultDescription="3 references found">',
  '  <usagereferences:referencedObjects>',
  '    <usagereferences:referencedObject uri="/sap/bc/adt/oo/classes/zcl_caller" isResult="true" usageInformation="gradeDirect,includeProductive">',
  '      <usagereferences:adtObject adtcore:name="ZCL_CALLER" adtcore:type="CLAS/OC" adtcore:responsible="DEVELOPER">',
  '        <adtcore:packageRef adtcore:name="ZPKG"/>',
  '      </usagereferences:adtObject>',
  '    </usagereferences:referencedObject>',
  '    <usagereferences:referencedObject uri="/sap/bc/adt/packages/zpkg">',
  '      <usagereferences:adtObject adtcore:name="ZPKG" adtcore:type="DEVC/K"/>',
  '    </usagereferences:referencedObject>',
  '    <usagereferences:referencedObject uri="/sap/bc/adt/programs/programs/zprog">',
  '      <usagereferences:adtObject adtcore:name="ZPROG" adtcore:type="PROG/P"/>',
  '    </usagereferences:referencedObject>',
  '  </usagereferences:referencedObjects>',
  '</usagereferences:usageReferenceResult>',
].join('\n');

/** 구 코드가 실제로 보낸 검색 본문(기본 범위). */
const OLD_ENGINE_SEARCH_BODY =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
  '<usagereferences:affectedObjects/>' +
  '<usagereferences:scope>' +
  '<usagereferences:type name="CLAS" isSelected="false"/>' +
  '<usagereferences:type name="PROG" isSelected="true"/>' +
  '</usagereferences:scope>' +
  '</usagereferences:usageReferenceRequest>';

/** 같은 것, `enableAllTypes: true`일 때 — CLAS가 true로 뒤집혔다. */
const OLD_ENGINE_SEARCH_BODY_ALL = OLD_ENGINE_SEARCH_BODY.replace(
  'name="CLAS" isSelected="false"',
  'name="CLAS" isSelected="true"',
);

const OLD_ENGINE_SCOPE_BODY =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<usagereferences:usageScopeRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
  '<usagereferences:affectedObjects/>' +
  '</usagereferences:usageScopeRequest>';

afterEach(() => {
  cleanupTempDirs();
});

function respond(request: RecordedRequest): Reply {
  return { status: 200, body: request.url.includes('/scope?') ? SCOPE_XML : RESULT_XML };
}

async function call(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest) => Reply = respond,
) {
  const { outcome, requests } = await runTool(getWhereUsed, args, csrfAware(reply));
  const sent = toolRequests(requests);
  return {
    outcome,
    sent,
    payload: outcome.isError ? null : JSON.parse(outcome.text),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getWhereUsed);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetWhereUsed'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getWhereUsed.definition.sets).toEqual(['readonly']);
    expect(getWhereUsed.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getWhereUsed.definition.kind).toBe('read');
  });
});

describe('와이어 — 구 코드를 실행해 받은 요청과 글자까지 같다', () => {
  it('범위 POST가 먼저, 검색 POST가 나중이다', async () => {
    const { sent } = await call({ object_name: 'ZCL_TARGET', object_type: 'class' });

    expect(sent).toHaveLength(2);
    expect(sent.map((request) => new URL(request.url).pathname)).toEqual([
      SCOPE_PATH,
      SEARCH_PATH,
    ]);
    expect(sent.map((request) => request.method)).toEqual(['POST', 'POST']);
  });

  it('범위 POST의 주소·헤더·본문', async () => {
    const { sent } = await call({ object_name: 'ZCL_TARGET', object_type: 'class' });
    const scope = sent[0];

    expect(new URL(scope?.url ?? '').search).toBe(
      '?uri=%2Fsap%2Fbc%2Fadt%2Foo%2Fclasses%2FZCL_TARGET',
    );
    expect(scope?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml',
    );
    expect(scope?.headers['Accept']).toBe(
      'application/vnd.sap.adt.repository.usagereferences.scope.response.v1+xml',
    );
    expect(scope?.body).toBe(OLD_ENGINE_SCOPE_BODY);
  });

  it('검색 POST의 주소·헤더·본문 — 범위 응답이 scope로 갈아 끼워져 들어간다', async () => {
    const { sent } = await call({ object_name: 'ZCL_TARGET', object_type: 'class' });
    const search = sent[1];

    expect(new URL(search?.url ?? '').search).toBe(
      '?uri=%2Fsap%2Fbc%2Fadt%2Foo%2Fclasses%2FZCL_TARGET',
    );
    expect(search?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
    );
    expect(search?.headers['Accept']).toBe(
      'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
    );
    // XML 선언이 지워지고 바깥 요소 이름만 갈렸다. 속성·이름공간 선언은 함께 사라진다.
    expect(search?.body).toBe(OLD_ENGINE_SEARCH_BODY);
  });

  it('enable_all_types는 범위의 isSelected를 전부 켠 뒤 보낸다', async () => {
    const { sent, payload } = await call({
      object_name: 'ZCL_TARGET',
      object_type: 'class',
      enable_all_types: true,
    });

    // 왕복 수는 그대로 둘이다.
    expect(sent).toHaveLength(2);
    expect(sent[1]?.body).toBe(OLD_ENGINE_SEARCH_BODY_ALL);
    expect(payload.enable_all_types).toBe(true);
  });
});

describe('타입별 오브젝트 주소 (buildObjectUri)', () => {
  it('구 switch의 별칭까지 그대로 옮겼다', () => {
    expect(buildObjectUri('ZCL_A', 'class')).toBe('/sap/bc/adt/oo/classes/ZCL_A');
    expect(buildObjectUri('ZCL_A', 'CLAS/OC')).toBe('/sap/bc/adt/oo/classes/ZCL_A');
    expect(buildObjectUri('ZPROG', 'program')).toBe('/sap/bc/adt/programs/programs/ZPROG');
    expect(buildObjectUri('ZINC', 'include')).toBe('/sap/bc/adt/programs/includes/ZINC');
    expect(buildObjectUri('ZFG', 'fugr')).toBe('/sap/bc/adt/functions/groups/ZFG');
    expect(buildObjectUri('ZIF', 'intf/if')).toBe('/sap/bc/adt/oo/interfaces/ZIF');
    expect(buildObjectUri('ZPKG', 'devc/k')).toBe('/sap/bc/adt/packages/ZPKG');
    expect(buildObjectUri('MARA', 'table')).toBe('/sap/bc/adt/ddic/tables/MARA');
    expect(buildObjectUri('ZST', 'structure')).toBe('/sap/bc/adt/ddic/structures/ZST');
    expect(buildObjectUri('ZDO', 'domain')).toBe('/sap/bc/adt/ddic/domains/ZDO');
    expect(buildObjectUri('ZDE', 'dtel')).toBe('/sap/bc/adt/ddic/dataelements/ZDE');
    expect(buildObjectUri('ZI_V', 'ddls/df')).toBe('/sap/bc/adt/ddic/ddl/sources/ZI_V');
  });

  it('함수모듈은 GROUP|FM 두 토막을 각각 인코딩해 잇는다', () => {
    expect(buildObjectUri('ZFG|Z_FM', 'functionmodule')).toBe(
      '/sap/bc/adt/functions/groups/ZFG/fmodules/Z_FM',
    );
  });

  it('함수모듈에 구분자가 없으면 던진다', () => {
    expect(() => buildObjectUri('Z_FM', 'fugr/ff')).toThrow(
      'Function module name must be in format GROUP|FM_NAME',
    );
  });

  it('이름공간 이름은 한 겹만 인코딩된다', () => {
    expect(buildObjectUri('/CBY/ZCL_A', 'class')).toBe('/sap/bc/adt/oo/classes/%2FCBY%2FZCL_A');
  });

  it('모르는 타입은 던진다', () => {
    expect(() => buildObjectUri('X', 'nope')).toThrow(
      'Unsupported object type for where-used: nope',
    );
  });
});

describe('응답 파싱 — 구 코드의 출력과 같다', () => {
  it('DEVC/K는 목록에서 빠지지만 총계에는 남는다', async () => {
    const { payload } = await call({ object_name: 'ZCL_TARGET', object_type: 'class' });

    expect(payload).toEqual({
      object_name: 'ZCL_TARGET',
      object_type: 'class',
      enable_all_types: false,
      // SAP이 준 numberOfResults 그대로 — 배열 길이(2)로 다시 세지 않는다.
      total_references: 3,
      result_description: '3 references found',
      references: [
        {
          name: 'ZCL_CALLER',
          type: 'CLAS/OC',
          uri: '/sap/bc/adt/oo/classes/zcl_caller',
          package_name: 'ZPKG',
          responsible: 'DEVELOPER',
          usage_information: 'gradeDirect,includeProductive',
        },
        {
          name: 'ZPROG',
          type: 'PROG/P',
          uri: '/sap/bc/adt/programs/programs/zprog',
        },
      ],
    });
  });

  it('뿌리 요소가 없으면 오류가 아니라 0건이다', async () => {
    const { outcome, payload } = await call(
      { object_name: 'ZCL_TARGET', object_type: 'class' },
      (request) => ({
        status: 200,
        body: request.url.includes('/scope?') ? SCOPE_XML : '<nothing/>',
      }),
    );

    expect(outcome.isError).toBe(false);
    expect(payload.total_references).toBe(0);
    expect(payload.result_description).toBe('');
    expect(payload.references).toEqual([]);
  });
});

describe('오류 갈래', () => {
  it('빈 이름은 접속을 꺼내기 전에 구의 McpError 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ object_name: '', object_type: 'class' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('ADT error: McpError: MCP error -32602: Object name is required');
    expect(sent).toHaveLength(0);
  });

  it('빈 타입도 마찬가지다', async () => {
    const { outcome } = await call({ object_name: 'ZCL_A', object_type: '' });

    expect(outcome.text).toBe('ADT error: McpError: MCP error -32602: Object type is required');
  });

  it('모르는 타입은 ADT error로 접힌다', async () => {
    const { outcome, sent } = await call({ object_name: 'ZCL_A', object_type: 'nope' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'ADT error: Error: Unsupported object type for where-used: nope',
    );
    // 주소를 못 만들었으므로 요청도 없다.
    expect(sent).toHaveLength(0);
  });

  it('범위 POST가 실패하면 검색으로 넘어가지 않는다', async () => {
    const { outcome, sent } = await call({ object_name: 'ZCL_A', object_type: 'class' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(sent).toHaveLength(1);
    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('ADT error: ')).toBe(true);
  });
});
