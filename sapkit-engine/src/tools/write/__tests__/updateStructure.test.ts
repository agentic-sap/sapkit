/**
 * `UpdateStructure` — 잠금 → 사전검사 → PUT → 해제 → 사후검사 → (활성) 시퀀스.
 *
 * `UpdateTable`과 같은 흐름이지만 **URI 대소문자 규칙이 정확히 반대**다:
 * 구조체는 잠금·검사가 소문자이고 PUT·활성화가 대문자다
 * (`@babamba2/mcp-abap-adt-clients/dist/core/structure/{lock,update}.js`).
 * 그 뒤집힘이 실제로 보존되는지가 이 파일의 핵심이며, 테이블 뿌리로 새지
 * 않는지도 함께 본다. 구 핸들러는
 * `engine/src/handlers/structure/high/handleUpdateStructure.ts`.
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
import { updateStructure } from '../updateStructure';

/** 테이블과 반대다 — 잠금·검사는 소문자, PUT·활성화는 대문자. */
const LOCK_URI = '/sap/bc/adt/ddic/structures/zs_demo';
const SOURCE_URI = '/sap/bc/adt/ddic/structures/ZS_DEMO';
const DDL = 'define structure zs_demo { id : abap.char(10); }';

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

function failingCheck(text: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
    '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Fehler">' +
    '<chkrun:checkMessageList>' +
    `<chkrun:checkMessage chkrun:type="E" chkrun:shortText="${text}"/>` +
    '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>'
  );
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(updateStructure)).toEqual(publishedDeclaration('UpdateStructure'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/cloud · mutation', () => {
    expect(updateStructure.definition.sets).toEqual(['high']);
    expect(updateStructure.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateStructure.definition.kind).toBe('mutation');
    expect(updateStructure.definition.targetNames).toEqual(['structure_name']);
  });
});

describe('UpdateStructure 시퀀스', () => {
  it('잠금 → 사전검사 → PUT → 해제 → 사후검사 → 활성 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateStructure, harness, {
      structure_name: 'zs_demo',
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
    // 테이블 뿌리로 새지 않는다.
    expect(harness.calls().some((call) => call.path.includes('/ddic/tables/'))).toBe(false);
  });

  it('잠금은 소문자, PUT은 대문자 — 테이블과 반대인 규칙이 보존된다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    expect(harness.nth(0).path).toBe(LOCK_URI);
    expect(harness.nth(2).path).toBe(`${SOURCE_URI}/source/main`);
  });

  it('PUT의 Accept는 테이블 쪽(text/plain)과 다르다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    const put = harness.nth(2);
    // `core/structure/update.js:19`의 그 자리 문자열.
    expect(put.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('사전검사는 소문자 objectUri에 제안 DDL을 실어 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    const check = harness.nth(1);
    expect(check.body).toContain(`<chkrun:checkObject adtcore:uri="${LOCK_URI}" chkrun:version="inactive">`);
    expect(check.body).toContain(Buffer.from(DDL, 'utf-8').toString('base64'));
  });

  it('응답은 구와 같은 표다 (들여쓴 JSON, uri는 대문자)', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateStructure, harness, {
      structure_name: 'zs_demo',
      ddl_code: DDL,
      transport_request: 'E19K905635',
    });
    const payload = jsonOf(result);
    expect(payload).toMatchObject({
      success: true,
      structure_name: 'ZS_DEMO',
      transport_request: 'E19K905635',
      activated: true,
      uri: SOURCE_URI,
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

  it('activate:false면 활성화를 부르지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateStructure, harness, {
      structure_name: 'ZS_DEMO',
      ddl_code: DDL,
      activate: false,
    });
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result)['activated']).toBe(false);
  });
});

describe('사전검사가 쓰기를 막는다', () => {
  it('오류가 있으면 PUT이 나가지 않고 구와 같은 문구로 답한다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheck('Typ ist unbekannt') }));
    const result = await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });

    expect(result.isError).toBe(true);
    // 구는 래퍼를 세 겹 쌓는다: return_error → 'Failed to update structure' →
    // 'New code check failed' → 벤더의 'Structure check failed'.
    expect(textOf(result)).toBe(
      'Error: Failed to update structure: New code check failed: Structure check failed: Typ ist unbekannt',
    );
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('DDIC의 관용 문구는 막지 않는다 (과수리 역검증)', async () => {
    harness = await startWriteHarness(
      responder({
        check:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
          '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="notProcessed" chkrun:statusText="The inactive version does not exist"/>' +
          '</chkrun:checkRunReports>',
      }),
    );
    const result = await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(true);
  });
});

describe('활성화는 조용히 성공하지 않는다', () => {
  it('활성화 응답의 E 메시지는 실패다 (구는 success:true를 돌려줬다)', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Struktur ist inkonsistent' }]) }),
    );
    const result = await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Struktur ist inkonsistent');
  });

  it('경고만 있으면 성공이고 경고는 실려 나간다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Feld ohne Suchhilfe' }]) }),
    );
    const result = await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    expect(result.isError).toBe(false);
    expect(jsonOf(result)['activation_warnings']).toEqual(['W: Feld ohne Suchhilfe']);
  });
});

describe('실패 경로', () => {
  it('PUT이 실패하면 오류이고 잠금은 풀린다', async () => {
    harness = await startWriteHarness(responder({ putStatus: 423 }));
    const result = await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: DDL });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Error: Failed to update structure:');
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('인자가 비면 SAP에 아무것도 보내지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateStructure, harness, { structure_name: 'ZS_DEMO', ddl_code: '' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: structure_name and ddl_code are required');
    expect(harness.calls()).toHaveLength(0);
  });
});
