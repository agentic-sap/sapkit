/**
 * CreateProgram — 요청 조립·오류 경로.
 *
 * 구 핸들러(`engine/src/handlers/program/high/handleCreateProgram.ts`)의 흐름은
 * validate → 로그온 언어 조회 → create → 생성 후 구문검사다. 여기서 못박는 것은
 * **와이어에 나가는 것**(엔드포인트·메서드·본문)과 **거짓 성공이 없다는 것**이다.
 */

import { invoke, jsonOf, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { createProgram } from '../createProgram';

const VALID = '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>';
const SYSINFO = '{"systemId":"E19","language":"CS"}';
const CLEAN_CHECK =
  '<?xml version="1.0" encoding="UTF-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:status="processed"/></chkrun:checkRunReports>';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

/** 행복 경로 응답기 — 4단계 전부 성공. */
function happy(): Parameters<typeof startWriteHarness>[0] {
  return (request, response) => {
    if (request.path === '/sap/bc/adt/programs/validation') return xml(response, VALID);
    if (request.path === '/sap/bc/adt/core/http/systeminformation') {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(SYSINFO);
    }
    if (request.path === '/sap/bc/adt/programs/programs') return xml(response, '<program/>', 201);
    if (request.path === '/sap/bc/adt/checkruns') return xml(response, CLEAN_CHECK);
    response.statusCode = 500;
    response.end('예상하지 못한 요청');
  };
}

describe('CreateProgram 요청 조립', () => {
  it('validate → systeminformation → create → checkruns 순으로 나간다', async () => {
    harness = await startWriteHarness(happy());
    const result = await invoke(createProgram, harness, {
      program_name: 'z_test_prog',
      package_name: 'ZOK_LAB',
      description: 'My program',
      transport_request: 'E19K905635',
    });

    expect(result.isError).toBe(false);
    const calls = harness.calls();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /sap/bc/adt/programs/validation',
      'GET /sap/bc/adt/core/http/systeminformation',
      'POST /sap/bc/adt/programs/programs',
      'POST /sap/bc/adt/checkruns',
    ]);

    const validation = harness.nth(0);
    expect(validation.query.get('objname')).toBe('Z_TEST_PROG');
    expect(validation.query.get('objtype')).toBe('PROG/P');
    expect(validation.query.get('packagename')).toBe('ZOK_LAB');
    expect(validation.query.get('description')).toBe('My program');

    const create = harness.nth(2);
    expect(create.query.get('corrNr')).toBe('E19K905635');
    expect(create.headers['content-type']).toBe(
      'application/vnd.sap.adt.programs.programs.v2+xml',
    );
    expect(create.body).toContain('adtcore:name="Z_TEST_PROG"');
    expect(create.body).toContain('adtcore:type="PROG/P"');
    expect(create.body).toContain('program:programType="1"');
    expect(create.body).toContain('program:application="*"');
    expect(create.body).toContain('<adtcore:packageRef adtcore:name="ZOK_LAB"/>');
    // 로그온 언어를 조회해 마스터 언어 자리에 박는다 (EN 하드코딩 아님).
    expect(create.body).toContain('adtcore:masterLanguage="CS"');

    const check = harness.nth(3);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.body).toContain(
      '<chkrun:checkObject adtcore:uri="/sap/bc/adt/programs/programs/z_test_prog" chkrun:version="inactive"/>',
    );

    const payload = jsonOf(result);
    expect(payload.success).toBe(true);
    expect(payload.program_name).toBe('Z_TEST_PROG');
    expect(payload.type).toBe('PROG/P');
    expect(payload.uri).toBe('/sap/bc/adt/programs/programs/z_test_prog');
    expect(payload.steps_completed).toEqual(['validate', 'create', 'check']);
  });

  it('module_pool은 programType=M으로 나간다', async () => {
    harness = await startWriteHarness(happy());
    await invoke(createProgram, harness, {
      program_name: 'ZMP',
      package_name: '$TMP',
      program_type: 'module_pool',
    });
    expect(harness.nth(2).body).toContain('program:programType="M"');
    // corrNr 없이 나간다 — 로컬 오브젝트.
    expect(harness.nth(2).url).toBe('/sap/bc/adt/programs/programs');
  });

  it('systeminformation이 없으면 EN으로 떨어지고 생성은 계속된다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/core/http/systeminformation') {
        response.statusCode = 404;
        return response.end('<none/>');
      }
      return happy()(request, response, 0);
    });
    const result = await invoke(createProgram, harness, {
      program_name: 'ZP',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(false);
    const create = harness.calls().find((call) => call.path === '/sap/bc/adt/programs/programs');
    expect(create?.body).toContain('adtcore:masterLanguage="EN"');
  });
});

describe('CreateProgram 오류 경로', () => {
  it('필수 인자가 없으면 SAP에 한 요청도 보내지 않는다', async () => {
    harness = await startWriteHarness(happy());
    const result = await invoke(createProgram, harness, { program_name: 'ZP' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });

  it('이 도구가 만들 수 없는 program_type은 전용 도구를 지목하며 거부한다', async () => {
    harness = await startWriteHarness(happy());
    const result = await invoke(createProgram, harness, {
      program_name: 'ZP',
      package_name: '$TMP',
      program_type: 'include',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('CreateInclude');
    expect(harness.calls()).toHaveLength(0);
  });

  it('이름 검증이 실패하면 create를 보내지 않는다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/programs/validation') {
        return xml(
          response,
          '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>' +
            '<SEVERITY>ERROR</SEVERITY><SHORT_TEXT>Program ZP already exists</SHORT_TEXT>' +
            '</DATA></asx:values></asx:abap>',
        );
      }
      response.statusCode = 500;
      response.end('보내면 안 되는 요청');
    });
    const result = await invoke(createProgram, harness, {
      program_name: 'ZP',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Program ZP already exists');
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/programs/programs')).toBe(
      false,
    );
  });

  it('생성 후 구문검사가 오류를 내면 조용히 성공하지 않는다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/checkruns') {
        return xml(
          response,
          '<?xml version="1.0" encoding="UTF-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
            '<chkrun:checkReport chkrun:status="processed"><chkrun:checkMessageList>' +
            '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="Statement is not accessible" line="3"/>' +
            '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>',
        );
      }
      return happy()(request, response, 0);
    });
    const result = await invoke(createProgram, harness, {
      program_name: 'ZP',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Statement is not accessible');
    expect(textOf(result)).toContain('[L3]');
  });

  it('권한 거부는 SAP 문구를 보존하며 forbidden으로 보고된다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/programs/programs') {
        response.statusCode = 403;
        return xml(
          response,
          '<?xml version="1.0"?><exc:exception xmlns:exc="http://www.sap.com/abapxml"><type id="ExceptionSecurity"/>' +
            '<message lang="EN">You are not authorized to create objects in package ZOK_LAB</message></exc:exception>',
          403,
        );
      }
      return happy()(request, response, 0);
    });
    const result = await invoke(createProgram, harness, {
      program_name: 'ZP',
      package_name: 'ZOK_LAB',
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('You are not authorized to create objects in package ZOK_LAB');
    expect(text).toContain('forbidden');
  });
});
