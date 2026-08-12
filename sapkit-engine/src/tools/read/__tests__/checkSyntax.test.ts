/**
 * CheckSyntax 핸들러 계약.
 *
 * 다섯 종류가 전부 같은 엔드포인트로 가되 **본문이 갈린다** — 그 갈림이 이
 * 도구의 실체이므로 본문을 문자열로 확인한다. 아울러 "SAP에 아무것도 쓰지
 * 않는다"는 약속이 지켜지는지(메서드가 POST 하나뿐이고 잠금·PUT이 없는지)를
 * 함께 못박는다.
 */

import { checkSyntax } from '../checkSyntax';
import { TEST_ORIGIN, cleanupTempDirs, csrfAware, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const CHECKRUN_URL = `${TEST_ORIGIN}/sap/bc/adt/checkruns?reporters=abapCheckRun`;

const CLEAN_REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Object has been checked"/>
</chkrun:checkRunReports>`;

const ERROR_REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Object has been checked">
    <chkrun:checkMessageList>
      <chkrun:checkMessage chkrun:uri="/sap/bc/adt/oo/classes/zcl_test/source/main#start=4,2" chkrun:type="E" chkrun:shortText="Field &quot;LV_X&quot; is unknown."/>
    </chkrun:checkMessageList>
  </chkrun:checkReport>
</chkrun:checkRunReports>`;

interface Payload {
  success: boolean;
  object_type: string;
  object_name: string;
  errors: Array<{ type: string; text: string }>;
  warnings: unknown[];
  note?: string;
}

describe('CheckSyntax', () => {
  it('source_code가 있으면 인라인 아티팩트 본문으로 POST 한 번만 보낸다', async () => {
    const source = "CLASS zcl_test DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_test IMPLEMENTATION.\nENDCLASS.";
    const { outcome, requests } = await runTool(
      checkSyntax,
      { object_type: 'class', object_name: 'zcl_test', source_code: source },
      csrfAware(() => ({ body: CLEAN_REPORT })),
    );

    const sent = toolRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toBe(CHECKRUN_URL);

    const body = sent[0]?.body ?? '';
    expect(body).toContain('<chkrun:checkObject adtcore:uri="/sap/bc/adt/oo/classes/zcl_test"');
    expect(body).toContain('chkrun:uri="/sap/bc/adt/oo/classes/zcl_test/source/main"');
    // 제안 소스는 base64로 실린다 — 서버에 쓰이지 않는다.
    expect(body).toContain(Buffer.from(source, 'utf-8').toString('base64'));

    const payload = JSON.parse(outcome.text) as Payload;
    expect(outcome.isError).toBe(false);
    expect(payload.success).toBe(true);
    expect(payload.object_name).toBe('ZCL_TEST');
    expect(payload.note).toBeUndefined();
  });

  it('source_code로 준 소스의 구문 오류는 정상 결과로 돌아온다', async () => {
    const { outcome } = await runTool(
      checkSyntax,
      { object_type: 'class', object_name: 'zcl_test', source_code: 'CLASS broken' },
      csrfAware(() => ({ body: ERROR_REPORT })),
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.success).toBe(false);
    expect(payload.errors).toEqual([
      {
        type: 'E',
        text: 'Field "LV_X" is unknown.',
        line: undefined,
        href: '/sap/bc/adt/oo/classes/zcl_test/source/main#start=4,2',
      },
    ]);
  });

  it('include는 서버의 비활성 판을 검사하는 본문을 보낸다', async () => {
    const { outcome, requests } = await runTool(
      checkSyntax,
      { object_type: 'include', object_name: 'zincl_test' },
      csrfAware(() => ({ body: CLEAN_REPORT })),
    );

    const sent = toolRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain(
      '<chkrun:checkObject adtcore:uri="/sap/bc/adt/programs/includes/zincl_test" chkrun:version="inactive"/>',
    );
    expect(sent[0]?.body).not.toContain('chkrun:artifact');
    expect(outcome.isError).toBe(false);
  });

  it('include에 준 source_code는 무시되고 note로 그 사실이 남는다', async () => {
    const { outcome, requests } = await runTool(
      checkSyntax,
      { object_type: 'include', object_name: 'zincl_test', source_code: 'WRITE 1.' },
      csrfAware(() => ({ body: CLEAN_REPORT })),
    );

    expect(toolRequests(requests)[0]?.body).not.toContain('chkrun:artifact');
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.note).toContain('the supplied source_code was ignored');
  });

  it('function_module은 그룹이 낀 URI로 검사한다', async () => {
    const { requests } = await runTool(
      checkSyntax,
      {
        object_type: 'function_module',
        object_name: 'z_fm_test',
        function_group_name: 'zfg_test',
      },
      csrfAware(() => ({ body: CLEAN_REPORT })),
    );

    expect(toolRequests(requests)[0]?.body).toContain(
      'adtcore:uri="/sap/bc/adt/functions/groups/zfg_test/fmodules/z_fm_test"',
    );
  });

  it('function_group_name 없는 function_module은 접속 전에 거절된다', async () => {
    const { outcome, requests } = await runTool(
      checkSyntax,
      { object_type: 'function_module', object_name: 'z_fm_test' },
      csrfAware(() => ({ body: CLEAN_REPORT })),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: function_group_name is required when object_type is function_module',
    );
    expect(requests).toHaveLength(0);
  });

  it('전송·기반 실패는 오류로 보고된다', async () => {
    const { outcome } = await runTool(
      checkSyntax,
      { object_type: 'include', object_name: 'zincl_test' },
      csrfAware(() => ({ status: 500, body: '' })),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: /);
    expect(outcome.text).toContain('HTTP 500');
  });

  it('source_code 없는 class에서 실오류는 구 래퍼처럼 도구 오류가 된다', async () => {
    // 구 엔진의 벤더 래퍼가 이 갈래에서만 던졌다. 의도적 차이는 별도 등재
    // 사안이므로 승계한 동작이며, 이 시험이 그 승계를 붙잡는다.
    const { outcome, requests } = await runTool(
      checkSyntax,
      { object_type: 'class', object_name: 'zcl_test' },
      csrfAware(() => ({ body: ERROR_REPORT })),
    );

    expect(toolRequests(requests)[0]?.body).toContain(
      '<chkrun:checkObject adtcore:uri="/sap/bc/adt/oo/classes/zcl_test" chkrun:version="inactive"/>',
    );
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Class check failed: Field "LV_X" is unknown.');
  });

  it('statusText를 되읊는 E 메시지만 있으면 래퍼는 던지지 않는다', async () => {
    const echoReport = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkReport chkrun:status="processed" chkrun:statusText="Object ZCL_TEST has been checked">
    <chkrun:checkMessageList>
      <chkrun:checkMessage chkrun:type="E" chkrun:shortText="Object ZCL_TEST has been checked"/>
    </chkrun:checkMessageList>
  </chkrun:checkReport>
</chkrun:checkRunReports>`;

    const { outcome } = await runTool(
      checkSyntax,
      { object_type: 'class', object_name: 'zcl_test' },
      csrfAware(() => ({ body: echoReport })),
    );

    expect(outcome.isError).toBe(false);
  });

  it('비활성 판이 없는 프로그램은 활성 소스를 읽어 다시 검사한다', async () => {
    const noiseReport = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkReport chkrun:status="processed" chkrun:statusText="checked">
    <chkrun:checkMessageList>
      <chkrun:checkMessage chkrun:type="E" chkrun:shortText="REPORT/PROGRAM statement is missing, or the program type is INCLUDE"/>
    </chkrun:checkMessageList>
  </chkrun:checkReport>
</chkrun:checkRunReports>`;
    const activeSource = "REPORT zprog_test.\nWRITE 'ok'.";

    let checkRuns = 0;
    const { outcome, requests } = await runTool(
      checkSyntax,
      { object_type: 'program', object_name: 'zprog_test' },
      csrfAware((request) => {
        if (request.method === 'GET') return { body: activeSource };
        checkRuns += 1;
        return { body: checkRuns === 1 ? noiseReport : CLEAN_REPORT };
      }),
    );

    const sent = toolRequests(requests);
    expect(sent.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${CHECKRUN_URL}`,
      `GET ${TEST_ORIGIN}/sap/bc/adt/programs/programs/ZPROG_TEST/source/main?version=active`,
      `POST ${CHECKRUN_URL}`,
    ]);
    // 두 번째 검사에는 읽어 온 활성 소스가 인라인으로 실린다.
    expect(sent[2]?.body).toContain(Buffer.from(activeSource, 'utf-8').toString('base64'));

    expect(outcome.isError).toBe(false);
    expect((JSON.parse(outcome.text) as Payload).success).toBe(true);
  });
});
