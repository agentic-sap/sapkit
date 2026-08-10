/**
 * UpdateProgram — 잠금→검사→쓰기→해제→(활성) 시퀀스.
 *
 * 구 핸들러(`engine/src/handlers/program/high/handleUpdateProgram.ts`)와 같은
 * 순서·엔드포인트로 나가는지, 실패 경로에서도 잠금이 풀리는지, 활성화가 조용히
 * 성공하지 않는지를 못박는다.
 */

import {
  activationBody,
  cleanCheckRun,
  failingCheckRun,
  invoke,
  jsonOf,
  lockBody,
  plainText,
  startWriteHarness,
  textOf,
  warningCheckRun,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import { updateProgram } from '../updateProgram';

const URI = '/sap/bc/adt/programs/programs/zprog';
const SOURCE = 'REPORT zprog.\nWRITE 1.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

interface Scenario {
  readonly check?: string;
  readonly postCheck?: string;
  readonly activation?: string;
  readonly putStatus?: number;
  readonly lockStatus?: number;
  readonly lockBody?: string;
}

function responder(scenario: Scenario = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === URI && request.query.get('_action') === 'LOCK') {
      if (scenario.lockStatus) return xml(response, scenario.lockBody ?? '<err/>', scenario.lockStatus);
      return xml(response, scenario.lockBody ?? lockBody());
    }
    if (request.path === URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      checkRuns += 1;
      const body = checkRuns === 1 ? (scenario.check ?? cleanCheckRun()) : (scenario.postCheck ?? cleanCheckRun());
      return xml(response, body);
    }
    if (request.path === `${URI}/source/main` && request.method === 'PUT') {
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

describe('UpdateProgram 시퀀스', () => {
  it('잠금 → 사전 구문검사 → PUT → 해제 → 사후검사 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateProgram, harness, {
      program_name: 'zprog',
      source_code: SOURCE,
      transport_request: 'E19K905635',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${URI}/source/main`,
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
    ]);

    expect(harness.nth(0).query.get('accessMode')).toBe('MODIFY');
    // 사전 검사는 제안 소스를 base64로 실어 보내는 inline artifact 검사다.
    const check = harness.nth(1);
    expect(check.body).toContain(`<chkrun:checkObject adtcore:uri="${URI}" chkrun:version="active">`);
    expect(check.body).toContain(`chkrun:uri="${URI}/source/main"`);
    expect(check.body).toContain(Buffer.from(SOURCE, 'utf-8').toString('base64'));
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');

    const put = harness.nth(2);
    expect(put.query.get('lockHandle')).toBe('LOCK-HANDLE-1');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.body).toBe(SOURCE);
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');

    expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
    expect(harness.nth(3).query.get('lockHandle')).toBe('LOCK-HANDLE-1');

    const payload = jsonOf(result);
    expect(payload.success).toBe(true);
    expect(payload.program_name).toBe('ZPROG');
    expect(payload.activated).toBe(false);
    expect(payload.steps_completed).toEqual([
      'lock',
      'check_new_code',
      'update',
      'unlock',
      'check_inactive',
    ]);
    expect(payload.source_size_bytes).toBe(SOURCE.length);
  });

  it('잠금은 stateful 세션으로 유지되고, 끝나면 남는 잠금이 없다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateProgram, harness, { program_name: 'ZPROG', source_code: SOURCE });
    // 잠금 구간(사전검사·PUT)은 stateful 헤더를 달고 나가야 한다.
    expect(harness.nth(1).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(harness.nth(2).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('activate=true면 활성화 요청이 붙는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(false);
    const activation = harness.calls().find((call) => call.path === '/sap/bc/adt/activation');
    expect(activation).toBeDefined();
    expect(activation!.query.get('method')).toBe('activate');
    expect(activation!.query.get('preauditRequested')).toBe('true');
    expect(activation!.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation!.body).toContain(`adtcore:uri="${URI}"`);
    expect(activation!.body).toContain('adtcore:name="ZPROG"');
    expect(jsonOf(result).activated).toBe(true);
  });

  it('사후검사 경고는 check_warnings로 실려 나온다', async () => {
    harness = await startWriteHarness(responder({ postCheck: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
    });
    const warnings = jsonOf(result).check_warnings as Array<Record<string, unknown>>;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.text).toBe('Obsolete statement');
  });
});

describe('UpdateProgram 오류 경로', () => {
  it('필수 인자가 없으면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateProgram, harness, { program_name: 'ZPROG' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });

  it('사전 구문검사가 실패하면 PUT을 보내지 않고 잠금을 푼다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Field ZZ is unknown', '9') }));
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Field ZZ is unknown');
    expect(textOf(result)).toContain('[L9]');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('PUT이 실패해도 잠금은 해제된다', async () => {
    harness = await startWriteHarness(responder({ putStatus: 423 }));
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
    });
    expect(result.isError).toBe(true);
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('다른 사용자의 잠금은 lock-conflict로 구별해 보고한다', async () => {
    harness = await startWriteHarness(
      responder({
        lockStatus: 403,
        lockBody:
          '<?xml version="1.0"?><exc:exception xmlns:exc="http://www.sap.com/abapxml">' +
          '<type id="ExceptionResourceNoAccess"/><message lang="EN">Object is locked by user SMITH</message></exc:exception>',
      }),
    );
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('Object is locked by user SMITH');
    expect(text).toContain('lock-conflict');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });

  it('활성화 응답의 E 메시지는 성공으로 보고되지 않는다 (거짓 성공 차단)', async () => {
    harness = await startWriteHarness(
      responder({
        activation: activationBody([{ type: 'E', text: 'Program ZPROG could not be activated' }]),
      }),
    );
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Program ZPROG could not be activated');
  });

  it('활성화 응답의 W 메시지는 activation_warnings로 남고 성공은 유지된다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Unused variable LV_X' }]) }),
    );
    const result = await invoke(updateProgram, harness, {
      program_name: 'ZPROG',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).activation_warnings).toEqual(['W: Unused variable LV_X']);
  });
});
