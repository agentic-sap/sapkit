/**
 * `UpdateTable` — 잠금 → 사전검사 → PUT → 해제 → 사후검사 → (활성) 시퀀스.
 *
 * 구 핸들러(`engine/src/handlers/table/high/handleUpdateTable.ts`)와 같은
 * 순서·엔드포인트로 나가는지, **잠금·PUT·검사의 URI 대소문자 규칙이 단계마다
 * 다른 것**이 보존되는지, 사전검사가 실패하면 PUT이 나가지 않는지, 활성화가
 * 조용히 성공하지 않는지를 못박는다.
 */

import {
  activationBody,
  cleanCheckRun,
  invoke,
  jsonOf,
  lockBody,
  plainText,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';
import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { updateTable } from '../updateTable';

/** 잠금·활성은 대문자 그대로, PUT·검사는 소문자 — 구 벤더의 단계별 규칙이다. */
const LOCK_URI = '/sap/bc/adt/ddic/tables/ZTST_TABLE';
const SOURCE_URI = '/sap/bc/adt/ddic/tables/ztst_table';
const DDL = "@EndUserText.label : 'x'\ndefine table ztst_table { key mandt : mandt not null; }";

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

interface Scenario {
  readonly check?: string;
  readonly postCheck?: string;
  readonly activation?: string;
  readonly putStatus?: number;
}

function responder(scenario: Scenario = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === LOCK_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('LOCK-1'));
    }
    if (request.path === LOCK_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      checkRuns += 1;
      const body = checkRuns === 1 ? (scenario.check ?? cleanCheckRun()) : (scenario.postCheck ?? cleanCheckRun());
      return xml(response, body);
    }
    if (request.path === `${SOURCE_URI}/source/main` && request.method === 'PUT') {
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

/** `status='notProcessed'`는 메시지가 없어도 오류다 (구 `checkRun.js:216`). */
function notProcessedCheckRun(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="notProcessed" chkrun:statusText="Sichtbar nicht"/>' +
    '</chkrun:checkRunReports>'
  );
}

/** DDIC가 정상적으로 내는 관용 문구 — 막으면 안 된다. */
function tolerableCheckRun(text: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    `<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="notProcessed" chkrun:statusText="${text}"/>` +
    '</chkrun:checkRunReports>'
  );
}

/** `status='processed'`인데 완료 통지를 `type="E"`로 되울린 응답. */
function echoedStatusCheckRun(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Objekt ZTST_TABLE wurde geprüft">' +
    '<chkrun:checkMessageList>' +
    '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="Objekt ZTST_TABLE wurde geprüft"/>' +
    '</chkrun:checkMessageList>' +
    '</chkrun:checkReport></chkrun:checkRunReports>'
  );
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(updateTable)).toEqual(publishedDeclaration('UpdateTable'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/cloud · mutation', () => {
    // 채록본 exposures가 `*_default`에만 뜬다 → readonly가 켜지 않는 집합이다.
    expect(updateTable.definition.sets).toEqual(['high']);
    expect(updateTable.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateTable.definition.kind).toBe('mutation');
    // mutating 도구는 대상-이름 선언이 필수다.
    expect(updateTable.definition.targetNames).toEqual(['table_name']);
  });
});

describe('UpdateTable 시퀀스', () => {
  it('잠금 → 사전검사 → PUT → 해제 → 사후검사 → 활성 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateTable, harness, {
      table_name: 'ztst_table',
      ddl_code: DDL,
      transport_request: 'E19K905635',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${LOCK_URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${SOURCE_URI}/source/main`,
      `POST ${LOCK_URI}`,
      'POST /sap/bc/adt/checkruns',
      'POST /sap/bc/adt/activation',
    ]);
    expect(harness.nth(0).query.get('accessMode')).toBe('MODIFY');
    expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
  });

  it('사전검사는 제안 DDL을 base64로 싣고 **inactive** 버전을 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });

    const check = harness.nth(1);
    // 프로그램·클래스 쪽은 바깥 version을 active로 박지만 DDIC은 호출자 버전을 쓴다.
    expect(check.body).toContain(`<chkrun:checkObject adtcore:uri="${SOURCE_URI}" chkrun:version="inactive">`);
    expect(check.body).toContain(`chkrun:uri="${SOURCE_URI}/source/main"`);
    expect(check.body).toContain(Buffer.from(DDL, 'utf-8').toString('base64'));
    expect(check.query.get('reporters')).toBe('abapCheckRun');
  });

  it('PUT은 잠금 핸들과 전송요청을 질의로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateTable, harness, {
      table_name: 'ZTST_TABLE',
      ddl_code: DDL,
      transport_request: 'E19K905635',
    });
    const put = harness.nth(2);
    expect(put.query.get('lockHandle')).toBe('LOCK-1');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.body).toBe(DDL);
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers['accept']).toBe('text/plain');
  });

  it('전송요청이 없으면 corrNr을 붙이지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(harness.nth(2).query.has('corrNr')).toBe(false);
  });

  it('사후검사는 소스를 싣지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(harness.nth(4).body).not.toContain('chkrun:artifacts');
  });

  it('activate:false면 활성화를 부르지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateTable, harness, {
      table_name: 'ZTST_TABLE',
      ddl_code: DDL,
      activate: false,
    });
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result)['activated']).toBe(false);
  });

  it('응답은 구와 같은 표다 (들여쓴 JSON)', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateTable, harness, {
      table_name: 'ztst_table',
      ddl_code: DDL,
      transport_request: 'E19K905635',
    });
    const payload = jsonOf(result);
    expect(payload).toMatchObject({
      success: true,
      table_name: 'ZTST_TABLE',
      transport_request: 'E19K905635',
      activated: true,
      uri: LOCK_URI,
      source_size_bytes: DDL.length,
    });
    expect(payload['steps_completed']).toEqual([
      'lock',
      'check_new_code',
      'update',
      'unlock',
      'check_inactive',
      'activate',
    ]);
    expect(textOf(result)).toBe(JSON.stringify(payload, null, 2));
  });

  it('전송요청이 없으면 응답의 transport_request는 local이다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(jsonOf(result)['transport_request']).toBe('local');
  });
});

describe('사전검사가 쓰기를 막는다', () => {
  it('오류가 있으면 PUT이 나가지 않는다', async () => {
    harness = await startWriteHarness(
      responder({
        check:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
          '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Fehler">' +
          '<chkrun:checkMessageList>' +
          '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="Feld MANDT ist unbekannt"/>' +
          '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>',
      }),
    );
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });

    expect(result.isError).toBe(true);
    // 구가 조립하던 문구 그대로 — `return_error`의 `Error: ` 접두사 + 바깥 래퍼 +
    // 사전검사 래퍼가 순서대로 붙는다.
    expect(textOf(result)).toBe(
      'Error: Failed to update table: New code check failed: Feld MANDT ist unbekannt',
    );
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    // 막혀도 잠금은 풀린다.
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('notProcessed는 메시지가 없어도 막는다', async () => {
    harness = await startWriteHarness(responder({ check: notProcessedCheckRun() }));
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('check status: notProcessed');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });

  it.each([
    'The inactive version does not exist',
    'Error importing from database',
  ])('DDIC의 관용 문구(%s)는 막지 않는다 (과수리 역검증)', async (text) => {
    harness = await startWriteHarness(responder({ check: tolerableCheckRun(text) }));
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(true);
  });

  it('완료 통지를 E로 되울린 응답은 오류가 아니다 (과수리 역검증)', async () => {
    harness = await startWriteHarness(responder({ check: echoedStatusCheckRun() }));
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(true);
  });

  it('사후검사가 실패해도 쓰기를 되돌리지 않는다', async () => {
    harness = await startWriteHarness(responder({ postCheck: notProcessedCheckRun() }));
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(true);
  });
});

describe('활성화는 조용히 성공하지 않는다', () => {
  it('활성화 응답의 E 메시지는 실패다 (구는 success:true를 돌려줬다)', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Tabelle ist inkonsistent' }]) }),
    );
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Tabelle ist inkonsistent');
  });

  it('경고만 있으면 성공이고 경고는 실려 나간다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Feld ohne Suchhilfe' }]) }),
    );
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(false);
    expect(jsonOf(result)['activation_warnings']).toEqual(['W: Feld ohne Suchhilfe']);
  });
});

describe('실패 경로', () => {
  it('PUT이 실패하면 오류이고 잠금은 풀린다', async () => {
    harness = await startWriteHarness(responder({ putStatus: 423 }));
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Error: Failed to update table:');
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('인자가 비면 SAP에 아무것도 보내지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateTable, harness, { table_name: 'ZTST_TABLE', ddl_code: '' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: table_name and ddl_code are required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('ECC에서는 CDS DDL을 보내지 않고 OData 통로를 안내한다', async () => {
    harness = await startWriteHarness(responder());
    const ecc = {
      ...harness.context,
      profile: { ...harness.context.profile, sapVersion: 'ecc' },
    };
    const result = await updateTable.handler(ecc, { table_name: 'ZTST_TABLE', ddl_code: DDL });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('UpdateTable is not supported on ECC');
    expect(result.content[0]?.text).toContain('ZMCP_ADT_SRV');
    expect(harness.calls()).toHaveLength(0);
  });
});
