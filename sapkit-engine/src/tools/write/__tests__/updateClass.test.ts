/**
 * UpdateClass — 잠금→검사→쓰기→해제→(활성).
 *
 * 구 핸들러(`engine/src/handlers/class/high/handleUpdateClass.ts`)와 같은
 * 엔드포인트로 나가는지, 그리고 **활성화가 조용히 성공하지 않는지**를 본다.
 * CLAS 거짓 성공은 이 레포에 실증 이력이 있다.
 */

import {
  activationBody,
  adtException,
  cleanCheckRun,
  failingCheckRun,
  invoke,
  jsonOf,
  lockBody,
  plainText,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import { CTS_LOCK_HINT } from '../shared';
import { updateClass } from '../updateClass';

const URI = '/sap/bc/adt/oo/classes/zcl_test';
const SOURCE = 'CLASS zcl_test DEFINITION PUBLIC.\nENDCLASS.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; activation?: string } = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('CLASS-LOCK'));
    }
    if (request.path === URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      checkRuns += 1;
      return xml(response, checkRuns === 1 ? (scenario.check ?? cleanCheckRun()) : cleanCheckRun());
    }
    if (request.path === `${URI}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, scenario.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

/**
 * 장부 D144 — CTS 잠금 문구는 대개 `transport_request` 누락·태스크 번호다.
 *
 * 실측: 이송 대상 CLAS에 `transport_request`를 안 넘기면 「…요청 DEVK…에서 이미 잠겨
 * 있습니다」로 실패하고(ZUNIWTH L-011 · 2026-08-05 — SM12에 잠금은 없었다), 태스크
 * 번호를 넘기면 같은 문구로 HTTP 500(ZUNIVAT-MODI 도메인노트 · 2026-08-10). 원문은
 * 그대로 두고 힌트를 뒤에 붙인다 — 문구 하나로 사람이 SM12 해제를 요청하던 자리다.
 */
describe('UpdateClass — 장부 D144: CTS 잠금 문구에 transport_request 힌트', () => {
  const CTS_MESSAGE =
    '오브젝트 LIMU CLSD ZCL_TEST은(는) 사용자 DEVUSER의 요청 DEVK900001에서 이미 잠겨 있습니다';

  function lockRejected(status: number, message: string) {
    return ((request, response) => {
      if (request.path === URI && request.query.get('_action') === 'LOCK') {
        return xml(response, adtException('ExceptionCtsLock', message), status);
      }
      response.statusCode = 500;
      response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
    }) as Parameters<typeof startWriteHarness>[0];
  }

  it('한국어 문구(HTTP 500)에 원문을 보존한 채 힌트를 덧붙인다', async () => {
    harness = await startWriteHarness(lockRejected(500, CTS_MESSAGE));
    const result = await invoke(updateClass, harness, { class_name: 'zcl_test', source_code: SOURCE });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain(CTS_MESSAGE);
    expect(text).toContain(CTS_LOCK_HINT);
    expect(text).toContain('E070.STRKORR');
  });

  it('영어 문구에도 같은 힌트가 붙는다', async () => {
    harness = await startWriteHarness(
      lockRejected(500, 'Object LIMU CLSD ZCL_TEST is already locked in request DEVK900001 of user DEVUSER'),
    );
    const result = await invoke(updateClass, harness, { class_name: 'zcl_test', source_code: SOURCE });
    expect(textOf(result)).toContain(CTS_LOCK_HINT);
  });

  it('잠금 충돌이 CTS 문구가 아니면 힌트를 붙이지 않는다 — 진짜 잠금을 가리지 않는다', async () => {
    harness = await startWriteHarness(
      lockRejected(423, 'Object ZCL_TEST is currently edited by user OTHER'),
    );
    const result = await invoke(updateClass, harness, { class_name: 'zcl_test', source_code: SOURCE });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain(CTS_LOCK_HINT);
  });
});

describe('UpdateClass', () => {
  it('잠금 → 사전 검사 → PUT → 해제 → 사후 검사로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClass, harness, {
      class_name: 'zcl_test',
      source_code: SOURCE,
      transport_request: 'E19K1',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${URI}/source/main`,
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
    ]);
    expect(harness.nth(1).body).toContain(`adtcore:uri="${URI}" chkrun:version="active"`);
    expect(harness.nth(2).query.get('lockHandle')).toBe('CLASS-LOCK');
    expect(harness.nth(2).query.get('corrNr')).toBe('E19K1');
    expect(harness.client.activeLocks()).toHaveLength(0);

    const payload = jsonOf(result);
    expect(payload.success).toBe(true);
    expect(payload.class_name).toBe('ZCL_TEST');
    expect(payload.activated).toBe(false);
    expect(payload.message).toBe('Class ZCL_TEST updated successfully');
  });

  it('사전 검사가 실패하면 PUT을 보내지 않고 잠금을 푼다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Type ZIF_X is unknown', '4') }));
    const result = await invoke(updateClass, harness, {
      class_name: 'ZCL_TEST',
      source_code: SOURCE,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Type ZIF_X is unknown');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
  });

  it('활성화가 E 메시지를 담아 200으로 오면 실패로 보고한다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Class ZCL_TEST is syntactically wrong' }]) }),
    );
    const result = await invoke(updateClass, harness, {
      class_name: 'ZCL_TEST',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Class ZCL_TEST is syntactically wrong');
  });

  it('활성화가 깨끗하면 activated=true로 보고한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClass, harness, {
      class_name: 'ZCL_TEST',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(false);
    const payload = jsonOf(result);
    expect(payload.activated).toBe(true);
    expect(payload.message).toBe('Class ZCL_TEST updated and activated successfully');
  });

  it('필수 인자가 없으면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClass, harness, { class_name: 'ZCL_TEST' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });
});
