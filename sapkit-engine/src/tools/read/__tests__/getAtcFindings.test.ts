/**
 * `GetAtcFindings` — 발행 계약 · 네 발 왕복 · 변형 해석 · 소견 파싱.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 왕복 4단계·헤더·전문 → `engine/src/handlers/atc/readonly/handleGetAtcFindings.ts:80-203`
 *  - 인자 자리 → `engine/src/lib/utils.ts:902-920`
 *    (`makeAdtRequestWithTimeout(connection, url, method, timeoutType, data, params, headers)`)
 *  - 소견 파싱 → `engine/src/lib/atcWorklistParser.ts:44-90`
 *  - URI 해석 → `engine/src/lib/resolveAdtUri.ts:38-146`
 */

import { getAtcFindings } from '../getAtcFindings';
import {
  type RecordedRequest,
  type Reply,
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const CUSTOMIZING = '/sap/bc/adt/atc/customizing';
const WORKLISTS = '/sap/bc/adt/atc/worklists';
const RUNS = '/sap/bc/adt/atc/runs';

const WORKLIST_ID = 'WL0000000042';
const RUN_RESULT_ID = 'RR0000000099';

const CUSTOMIZING_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<atc:customizing xmlns:atc="http://www.sap.com/adt/atc"><properties>' +
  '<property name="systemCheckVariant" value="DEFAULT_VARIANT"/>' +
  '<property name="something" value="ignored"/>' +
  '</properties></atc:customizing>';

const RUN_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  `<atcworklist:worklistRun xmlns:atcworklist="http://www.sap.com/adt/atc"><atcworklist:worklistId>${RUN_RESULT_ID}</atcworklist:worklistId></atcworklist:worklistRun>`;

const WORKLIST_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<atcworklist:worklist xmlns:atcworklist="http://www.sap.com/adt/atc" ' +
  `atcworklist:id="${RUN_RESULT_ID}" atcworklist:timestamp="2026-08-14T00:00:00Z">` +
  '<atcworklist:objects>' +
  '<atcworklist:object adtcore:name="ZCL_FIXTURE" adtcore:type="CLAS/OC" ' +
  'atcworklist:packageName="ZPKG" adtcore:uri="/sap/bc/adt/oo/classes/zcl_fixture" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<atcworklist:findings>' +
  '<atcfinding:finding atcfinding:priority="1" atcfinding:checkId="CHK1" ' +
  'atcfinding:checkTitle="Syntax check" atcfinding:messageId="0001" ' +
  'atcfinding:messageTitle="Bad thing" atcfinding:location="/sap/bc/adt/oo/classes/zcl_fixture#start=12,1" ' +
  'atcfinding:exemptionKind="" xmlns:atcfinding="http://www.sap.com/adt/atc"/>' +
  '<atcfinding:finding atcfinding:priority="2" atcfinding:checkId="CHK2" ' +
  'atcfinding:checkTitle="Performance" atcfinding:messageId="0002" ' +
  'atcfinding:messageTitle="Slow thing" atcfinding:location="x#start=3,1" ' +
  'atcfinding:exemptionKind="approved" xmlns:atcfinding="http://www.sap.com/adt/atc"/>' +
  '<atcfinding:finding atcfinding:priority="3" atcfinding:checkId="CHK3" ' +
  'atcfinding:checkTitle="Style" atcfinding:messageId="0003" ' +
  'atcfinding:messageTitle="Nit" atcfinding:location="y#start=4,1" ' +
  'atcfinding:exemptionKind="" xmlns:atcfinding="http://www.sap.com/adt/atc"/>' +
  '</atcworklist:findings>' +
  '</atcworklist:object>' +
  '</atcworklist:objects></atcworklist:worklist>';

const EMPTY_WORKLIST =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<atcworklist:worklist xmlns:atcworklist="http://www.sap.com/adt/atc" ' +
  'atcworklist:id="WL1" atcworklist:timestamp="2026-08-14T00:00:00Z"><atcworklist:objects/>' +
  '</atcworklist:worklist>';

interface Scenario {
  readonly customizing?: string;
  readonly worklistId?: string;
  readonly run?: string;
  readonly worklist?: string;
  readonly customizingStatus?: number;
}

function replies(scenario: Scenario = {}) {
  return csrfAware((request: RecordedRequest): Reply => {
    const url = new URL(request.url);
    if (url.pathname === CUSTOMIZING) {
      return {
        status: scenario.customizingStatus ?? 200,
        body: scenario.customizing ?? CUSTOMIZING_XML,
      };
    }
    if (url.pathname === WORKLISTS) {
      return { status: 200, body: scenario.worklistId ?? `${WORKLIST_ID}\n` };
    }
    if (url.pathname === RUNS) return { status: 200, body: scenario.run ?? RUN_XML };
    if (url.pathname.startsWith(`${WORKLISTS}/`)) {
      return { status: 200, body: scenario.worklist ?? WORKLIST_XML };
    }
    return { status: 404, body: 'unexpected' };
  });
}

async function call(args: Record<string, unknown>, scenario: Scenario = {}) {
  const { outcome, requests } = await runTool(getAtcFindings, args, replies(scenario));
  const sent = toolRequests(requests);
  return { outcome, sent, paths: sent.map((entry) => new URL(entry.url).pathname) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getAtcFindings);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetAtcFindings'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    // 구 경로는 `handlers/atc/readonly/`이고, 채록본의 `exposures` 네 조건 전부에
    // 뜬다 — `readonly`가 그 표시다.
    expect(getAtcFindings.definition.sets).toEqual(['readonly']);
    expect(getAtcFindings.definition.available_in).toEqual(['onprem', 'cloud']);
  });

  it('kind는 read다 — ATC는 정적 검사이지 실행이 아니다', () => {
    expect(getAtcFindings.definition.kind).toBe('read');
  });
});

describe('와이어 — 네 발', () => {
  it('customizing → worklists → runs → worklists/{id} 순으로 나간다', async () => {
    const { sent, paths } = await call({ object_name: 'ZCL_FIXTURE', object_type: 'CLAS' });

    expect(paths).toEqual([CUSTOMIZING, WORKLISTS, RUNS, `${WORKLISTS}/${RUN_RESULT_ID}`]);

    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.headers['Accept']).toBe(
      'application/xml, application/vnd.sap.atc.customizing-v1+xml',
    );

    expect(sent[1]?.method).toBe('POST');
    expect(new URL(sent[1]?.url ?? '').searchParams.get('checkVariant')).toBe('DEFAULT_VARIANT');
    expect(sent[1]?.headers['Accept']).toBe('text/plain');
    expect(sent[1]?.body).toBeUndefined();

    expect(sent[2]?.method).toBe('POST');
    expect(new URL(sent[2]?.url ?? '').searchParams.get('worklistId')).toBe(WORKLIST_ID);
    expect(sent[2]?.headers['Accept']).toBe('application/xml');
    expect(sent[2]?.headers['Content-Type']).toBe('application/xml');

    expect(sent[3]?.method).toBe('GET');
    expect(new URL(sent[3]?.url ?? '').searchParams.get('includeExemptedFindings')).toBe('false');
    expect(sent[3]?.headers['Accept']).toBe('application/atc.worklist.v1+xml');
  });

  it('run 전문에 maximumVerdicts와 대상 URI가 실린다', async () => {
    const { sent } = await call({ object_name: 'ZCL_FIXTURE', object_type: 'CLAS' });

    expect(sent[2]?.body).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<atc:run maximumVerdicts="100" xmlns:atc="http://www.sap.com/adt/atc">
  <objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_fixture"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`,
    );
  });

  it('max_results가 maximumVerdicts로 내려간다', async () => {
    const { sent } = await call({
      object_uri: '/sap/bc/adt/packages/zpkg',
      max_results: 7,
    });

    expect(sent[2]?.body).toContain('maximumVerdicts="7"');
  });

  it('check_variant를 주면 customizing을 묻지 않는다', async () => {
    const { paths, sent } = await call({
      object_uri: '/sap/bc/adt/oo/classes/zcl_fixture',
      check_variant: '  MY VARIANT  ',
    });

    expect(paths).toEqual([WORKLISTS, RUNS, `${WORKLISTS}/${RUN_RESULT_ID}`]);
    // 공백을 다듬고 한 겹만 인코딩한다.
    expect(sent[0]?.url).toContain('checkVariant=MY%20VARIANT');
  });

  it('object_uri가 있으면 object_name/object_type을 무시한다', async () => {
    const { sent } = await call({
      object_uri: '/sap/bc/adt/programs/programs/zprog',
      object_name: 'ZCL_OTHER',
      object_type: 'CLAS',
    });

    expect(sent[2]?.body).toContain('adtcore:uri="/sap/bc/adt/programs/programs/zprog"');
  });

  it('runs 응답에 worklistId가 없으면 worklistId를 그대로 다시 쓴다', async () => {
    const { paths } = await call(
      { object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' },
      { run: '<atc:worklistRun xmlns:atc="http://www.sap.com/adt/atc"/>' },
    );

    expect(paths[paths.length - 1]).toBe(`${WORKLISTS}/${WORKLIST_ID}`);
  });
});

describe('URI 해석 — object_type 표', () => {
  it.each([
    ['CLAS', 'ZCL_X', '/sap/bc/adt/oo/classes/zcl_x'],
    ['INTF', 'ZIF_X', '/sap/bc/adt/oo/interfaces/zif_x'],
    ['PROG', 'ZPROG', '/sap/bc/adt/programs/programs/zprog'],
    ['FUGR', 'ZFG', '/sap/bc/adt/functions/groups/zfg'],
    ['TABL', 'ZTAB', '/sap/bc/adt/ddic/tables/ztab'],
    ['STRU', 'ZSTR', '/sap/bc/adt/ddic/structures/zstr'],
    ['VIEW', 'ZVIEW', '/sap/bc/adt/ddic/views/zview'],
    ['DTEL', 'ZDE', '/sap/bc/adt/ddic/dataelements/zde'],
    ['DOMA', 'ZDO', '/sap/bc/adt/ddic/domains/zdo'],
    ['DDLS', 'ZCDS', '/sap/bc/adt/ddic/ddl/sources/zcds'],
    ['BDEF', 'ZBD', '/sap/bc/adt/ddic/bdef/sources/zbd'],
    ['SRVD', 'ZSD', '/sap/bc/adt/ddic/srvd/sources/zsd'],
    ['SRVB', 'ZSB', '/sap/bc/adt/businessservices/bindings/zsb'],
    ['DEVC', 'ZPKG', '/sap/bc/adt/packages/zpkg'],
  ])('%s → %s', async (type, name, uri) => {
    const { sent } = await call({ object_name: name, object_type: type });

    expect(sent[2]?.body).toContain(`adtcore:uri="${uri}"`);
  });

  it('모르는 타입은 요청을 만들기 전에 던진다', async () => {
    const { outcome, paths } = await call({ object_name: 'ZX', object_type: 'ZZZZ' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'resolveAdtUri: no URI mapping for type="ZZZZ" (object="ZX"). ' +
        'Supply an explicit "uri" in the tool input, or add this type to resolveAdtUri.ts.',
    );
    // URI 해석이 변형 조회보다 **앞**이라 요청이 한 건도 나가지 않는다.
    expect(paths).toEqual([]);
  });
});

describe('소견 파싱', () => {
  it('우선순위별로 세고 소견을 평평하게 편다', async () => {
    const { outcome } = await call({ object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' });
    const body = JSON.parse(outcome.text) as Record<string, unknown>;

    expect(body['target']).toBe('/sap/bc/adt/oo/classes/zcl_fixture');
    expect(body['check_variant']).toBe('DEFAULT_VARIANT');
    expect(body['worklistId']).toBe(RUN_RESULT_ID);
    expect(body['timestamp']).toBe('2026-08-14T00:00:00Z');
    expect(body['total']).toBe(3);
    expect(body['errors']).toBe(1);
    expect(body['warnings']).toBe(1);
    expect(body['infos']).toBe(1);
    expect(body['findings']).toEqual([
      {
        objectName: 'ZCL_FIXTURE',
        objectType: 'CLAS/OC',
        packageName: 'ZPKG',
        objectUri: '/sap/bc/adt/oo/classes/zcl_fixture',
        priority: 1,
        checkId: 'CHK1',
        checkTitle: 'Syntax check',
        messageId: '0001',
        messageTitle: 'Bad thing',
        location: '/sap/bc/adt/oo/classes/zcl_fixture#start=12,1',
        exemptionKind: '',
      },
      {
        objectName: 'ZCL_FIXTURE',
        objectType: 'CLAS/OC',
        packageName: 'ZPKG',
        objectUri: '/sap/bc/adt/oo/classes/zcl_fixture',
        priority: 2,
        checkId: 'CHK2',
        checkTitle: 'Performance',
        messageId: '0002',
        messageTitle: 'Slow thing',
        location: 'x#start=3,1',
        exemptionKind: 'approved',
      },
      {
        objectName: 'ZCL_FIXTURE',
        objectType: 'CLAS/OC',
        packageName: 'ZPKG',
        objectUri: '/sap/bc/adt/oo/classes/zcl_fixture',
        priority: 3,
        checkId: 'CHK3',
        checkTitle: 'Style',
        messageId: '0003',
        messageTitle: 'Nit',
        location: 'y#start=4,1',
        exemptionKind: '',
      },
    ]);
  });

  it('messageId의 앞자리 0이 살아남는다 (구는 템플릿 문자열로 접었다)', async () => {
    const { outcome } = await call({ object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' });
    const body = JSON.parse(outcome.text) as { findings: Array<{ messageId: unknown }> };

    expect(body.findings[0]?.messageId).toBe('0001');
  });

  it('소견이 없으면 0으로 답한다 (오류가 아니다)', async () => {
    const { outcome } = await call(
      { object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' },
      { worklist: EMPTY_WORKLIST },
    );
    const body = JSON.parse(outcome.text) as Record<string, unknown>;

    expect(outcome.isError).toBe(false);
    expect(body['total']).toBe(0);
    expect(body['findings']).toEqual([]);
  });

  it('응답은 들여쓰기 없는 한 줄 JSON이다 (구 BaseHandlerGroup의 json→text 접기)', async () => {
    const { outcome } = await call({ object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' });

    expect(outcome.text).toBe(JSON.stringify(JSON.parse(outcome.text)));
  });
});

describe('갈래 — 인자·기본 변형', () => {
  it('object_uri도 object_name도 없으면 구의 InvalidParams 문구를 그대로 낸다', async () => {
    const { outcome, paths } = await call({});

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'MCP error -32602: Provide object_uri, or object_name + object_type.',
    );
    expect(paths).toEqual([]);
  });

  it('빈 문자열 object_uri는 없는 것으로 본다', async () => {
    const { outcome } = await call({ object_uri: '   ' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'MCP error -32602: Provide object_uri, or object_name + object_type.',
    );
  });

  it('기본 변형을 못 찾으면 그 사실을 말하고 멈춘다', async () => {
    const { outcome, paths } = await call(
      { object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' },
      {
        customizing:
          '<atc:customizing xmlns:atc="http://www.sap.com/adt/atc"><properties/></atc:customizing>',
      },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'MCP error -32602: No check_variant given and could not resolve the system default ' +
        'from /atc/customizing — pass check_variant explicitly.',
    );
    expect(paths).toEqual([CUSTOMIZING]);
  });

  it('customizing 조회가 실패하면 worklist를 만들지 않는다', async () => {
    const { outcome, paths } = await call(
      { object_uri: '/sap/bc/adt/oo/classes/zcl_fixture' },
      { customizingStatus: 500 },
    );

    expect(outcome.isError).toBe(true);
    expect(paths).toEqual([CUSTOMIZING]);
  });
});
