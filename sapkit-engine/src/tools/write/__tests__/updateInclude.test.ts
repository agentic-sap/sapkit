/**
 * UpdateInclude — 사전 프로그램트리 검사 → 잠금 → PUT → 해제 → (활성).
 *
 * 구 핸들러(`engine/src/handlers/include/high/handleUpdateInclude.ts`)의 URI는
 * 인클루드 이름을 **대문자 그대로** 쓴다(프로그램·클래스는 소문자). 그 차이까지
 * 그대로 옮겼는지 확인한다. 활성화는 이 도구에서 **검증 관문**이다.
 */

import {
  activationBody,
  failingCheckRun,
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
import { updateInclude } from '../updateInclude';

const BASE = '/sap/bc/adt/programs/includes/ZINC01';
const SOURCE = '* include body\nWRITE 1.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; activation?: string; putStatus?: number } = {}) {
  return ((request, response) => {
    if (request.path === BASE && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('INC-LOCK'));
    }
    if (request.path === BASE && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, scenario.check ?? cleanCheckRun());
    }
    if (request.path === `${BASE}/source/main` && request.method === 'PUT') {
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

describe('UpdateInclude', () => {
  it('main_program이 있으면 부모 프로그램 트리에 인라인 소스를 얹어 사전검사한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInclude, harness, {
      include_name: 'zinc01',
      source_code: SOURCE,
      main_program: 'zmain',
      transport_request: 'E19K7',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /sap/bc/adt/checkruns',
      `POST ${BASE}`,
      `PUT ${BASE}/source/main`,
      `POST ${BASE}`,
    ]);

    const check = harness.nth(0);
    // 바깥은 부모 프로그램(소문자), 안쪽 artifact는 인클루드(대문자) URI다.
    expect(check.body).toContain(
      '<chkrun:checkObject adtcore:uri="/sap/bc/adt/programs/programs/zmain" chkrun:version="active">',
    );
    expect(check.body).toContain(`chkrun:uri="${BASE}/source/main"`);
    expect(check.body).toContain(Buffer.from(SOURCE, 'utf-8').toString('base64'));

    const put = harness.nth(2);
    expect(put.query.get('lockHandle')).toBe('INC-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K7');
    expect(put.body).toBe(SOURCE);

    const payload = jsonOf(result);
    expect(payload.include_name).toBe('ZINC01');
    expect(payload.type).toBe('PROG/I');
    expect(payload.uri).toBe('/sap/bc/adt/programs/includes/zinc01');
    expect(payload.steps_completed).toEqual(['lock', 'update', 'unlock']);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('main_program이 없으면 사전검사를 건너뛴다 (구 동작)', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateInclude, harness, { include_name: 'ZINC01', source_code: SOURCE });
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/checkruns')).toBe(false);
  });

  it('사전검사가 실패하면 잠금조차 잡지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('FORM XYZ is unknown', '11') }));
    const result = await invoke(updateInclude, harness, {
      include_name: 'ZINC01',
      source_code: SOURCE,
      main_program: 'ZMAIN',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('FORM XYZ is unknown');
    expect(harness.calls().some((call) => call.query.get('_action') === 'LOCK')).toBe(false);
  });

  it('PUT이 실패해도 잠금은 해제된다', async () => {
    harness = await startWriteHarness(responder({ putStatus: 500 }));
    const result = await invoke(updateInclude, harness, {
      include_name: 'ZINC01',
      source_code: SOURCE,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('step=update');
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화는 해제 뒤에 나가고, 활성화 요청 본문은 인클루드를 가리킨다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInclude, harness, {
      include_name: 'ZINC01',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(false);
    const calls = harness.calls();
    const unlockAt = calls.findIndex((call) => call.query.get('_action') === 'UNLOCK');
    const activateAt = calls.findIndex((call) => call.path === '/sap/bc/adt/activation');
    expect(unlockAt).toBeGreaterThanOrEqual(0);
    expect(activateAt).toBeGreaterThan(unlockAt);
    const activation = calls[activateAt]!;
    expect(activation.headers['content-type']).toBe(
      'application/vnd.sap.adt.activation.request+xml; charset=utf-8',
    );
    expect(activation.body).toContain(`adtcore:uri="${BASE}"`);
    expect(jsonOf(result).steps_completed).toEqual(['lock', 'update', 'unlock', 'activate']);
  });

  it('활성화 응답의 E 메시지는 실패로 보고하고 원문 줄번호를 보존한다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Statement PERFORM is not allowed' }]) }),
    );
    const result = await invoke(updateInclude, harness, {
      include_name: 'ZINC01',
      source_code: SOURCE,
      activate: true,
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('Statement PERFORM is not allowed');
    // href 조각(#start=12,1)에서 실제 줄번호를 뽑아낸다.
    expect(text).toContain('[L12]');
    expect(text).toContain('Active version on SAP is unchanged');
  });

  it('필수 인자가 없으면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInclude, harness, { include_name: 'ZINC01' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });
});
