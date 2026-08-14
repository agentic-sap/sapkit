/**
 * `UpdateInterface` — 잠금 → 사전검사 → PUT → 해제 → 사후검사 → (활성화).
 *
 * 붙잡는 것 넷:
 *  1. 발행 계약이 채록본과 글자 그대로 같은가.
 *  2. 여섯 단계가 구와 같은 주소·전문·헤더로 나가는가 — **URI 대소문자까지**.
 *     인터페이스 계열은 PUT만 대문자다(`core/interface/update.js:16` vs
 *     `core/interface/lock.js:16`). 클래스 계열은 전부 소문자라 베끼면 틀린다.
 *  3. 사전검사가 실패하면 **PUT을 보내지 않고** 잠금을 푸는가.
 *  4. 활성화가 `E`를 담아 200으로 와도 성공으로 접지 않는가(차이 장부 D73 —
 *     구는 그것을 `activation_warnings`에 담고도 `success: true`로 답했다).
 */

import { updateInterface } from '../updateInterface';
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
import { expectPublishedDeclaration } from './interfaceSupport';

/** 잠금·사전검사·활성화가 쓰는 소문자 URI. */
const LOWER = '/sap/bc/adt/oo/interfaces/zif_test';
/** PUT·UNLOCK이 쓰는, 소문자화되지 않은 URI. */
const UPPER = '/sap/bc/adt/oo/interfaces/ZIF_TEST';
const CHECK = '/sap/bc/adt/checkruns';
const ACTIVATION = '/sap/bc/adt/activation';
const SOURCE = 'INTERFACE zif_test PUBLIC.\n  METHODS run.\nENDINTERFACE.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { preCheck?: string; postCheck?: string; activation?: string } = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === LOWER && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('INTF-LOCK'));
    }
    if (request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === CHECK) {
      checkRuns += 1;
      return xml(
        response,
        checkRuns === 1
          ? (scenario.preCheck ?? cleanCheckRun())
          : (scenario.postCheck ?? cleanCheckRun()),
      );
    }
    if (request.path === `${UPPER}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === ACTIVATION) {
      return xml(response, scenario.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    await expectPublishedDeclaration(updateInterface, 'UpdateInterface');
  });

  it('노출·정책 선언이 구 핸들러의 자리와 맞는다', () => {
    expect(updateInterface.definition.sets).toEqual(['high']);
    expect(updateInterface.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateInterface.definition.kind).toBe('mutation');
    expect(updateInterface.definition.targetNames).toEqual(['interface_name']);
  });
});

describe('와이어 — 여섯 단계', () => {
  it('잠금 → 사전검사 → PUT → 해제 → 사후검사 순으로 나간다 (활성화 없음)', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInterface, harness, {
      interface_name: 'zif_test',
      source_code: SOURCE,
      transport_request: 'E19K1',
      activate: false,
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${LOWER}`,
      `POST ${CHECK}`,
      `PUT ${UPPER}/source/main`,
      `POST ${LOWER}`,
      `POST ${CHECK}`,
    ]);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('잠금 요청의 질의 인자와 Accept가 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
      activate: false,
    });

    const lock = harness.nth(0);
    expect(lock.query.get('_action')).toBe('LOCK');
    expect(lock.query.get('accessMode')).toBe('MODIFY');
    expect(lock.headers['accept']).toBe(
      'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
    );
  });

  it('사전검사는 제안 소스를 base64 artifact로 실어 보낸다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
      activate: false,
    });

    const check = harness.nth(1);
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.headers['accept']).toBe('application/vnd.sap.adt.checkmessages+xml');
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.body).toContain(`adtcore:uri="${LOWER}" chkrun:version="active"`);
    expect(check.body).toContain(`chkrun:uri="${LOWER}/source/main"`);
    expect(check.body).toContain(Buffer.from(SOURCE, 'utf-8').toString('base64'));
  });

  it('PUT은 **대문자 URI**로 나가고 잠금 핸들·전송요청을 질의 인자로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateInterface, harness, {
      interface_name: 'zif_test',
      source_code: SOURCE,
      transport_request: 'E19K1',
      activate: false,
    });

    const put = harness.nth(2);
    // 구 `core/interface/update.js:16` — 여기만 `.toLowerCase()`가 없다.
    expect(put.path).toBe(`${UPPER}/source/main`);
    expect(put.query.get('lockHandle')).toBe('INTF-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K1');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers['accept']).toBe('text/plain');
    expect(put.body).toBe(SOURCE);
  });

  it('사후검사는 저장본 URI를 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
      activate: false,
    });

    expect(harness.nth(4).body).toContain(`adtcore:uri="${LOWER}" chkrun:version="inactive"`);
  });

  it('활성화는 인자를 주지 않아도 켜지고 구와 같은 전문으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(false);
    const activation = harness.calls().find((call) => call.path === ACTIVATION);
    expect(activation).toBeDefined();
    expect(activation?.query.get('method')).toBe('activate');
    expect(activation?.query.get('preauditRequested')).toBe('true');
    expect(activation?.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation?.headers['accept']).toBe('application/xml');
    expect(activation?.body).toContain(
      `<adtcore:objectReference adtcore:uri="${LOWER}" adtcore:name="ZIF_TEST"/>`,
    );
    expect((jsonOf(result) as { steps_completed: string[] }).steps_completed).toEqual([
      'lock',
      'check_new_code',
      'update',
      'unlock',
      'check_inactive',
      'activate',
    ]);
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로, **들여쓰기 없이** 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInterface, harness, {
      interface_name: 'zif_test',
      source_code: SOURCE,
      activate: false,
    });

    // 구 `handleUpdateInterface.ts:271-283`은 이 도구의 응답에만 `null, 2`를
    // 넘기지 않는다.
    expect(textOf(result)).not.toContain('\n');
    expect(jsonOf(result)).toEqual({
      success: true,
      interface_name: 'ZIF_TEST',
      transport_request: 'local',
      activated: false,
      message: 'Interface ZIF_TEST updated successfully',
      steps_completed: ['lock', 'check_new_code', 'update', 'unlock', 'check_inactive'],
    });
  });

  it('사전검사 경고는 check_warnings로 실린다', async () => {
    harness = await startWriteHarness(responder({ preCheck: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
      activate: false,
    });

    const payload = jsonOf(result) as { check_warnings?: Array<{ text: string }> };
    expect(payload.check_warnings?.map((entry) => entry.text)).toEqual(['Obsolete statement']);
  });

  it('사후검사가 오류를 내면 그 경고는 실리지 않는다 (구는 던지고 삼켰다)', async () => {
    harness = await startWriteHarness(
      responder({ postCheck: failingCheckRun('Interface ZIF_TEST is inconsistent', '9') }),
    );
    const result = await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
      activate: false,
    });

    expect(result.isError).toBe(false);
    expect(jsonOf(result)).not.toHaveProperty('check_warnings');
  });

  it('활성화 경고(E가 아닌 것)는 activation_warnings로 실린다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete interface method' }]) }),
    );
    const result = await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { activation_warnings: string[] }).activation_warnings).toEqual([
      'W: Obsolete interface method',
    ]);
  });
});

describe('안전 갈래', () => {
  it('필수 인자가 없으면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateInterface, harness, { interface_name: 'ZIF_TEST' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: interface_name and source_code are required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('사전검사가 실패하면 PUT을 보내지 않고 잠금을 푼다', async () => {
    harness = await startWriteHarness(responder({ preCheck: failingCheckRun('Type ZIF_X is unknown', '4') }));
    const result = await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Type ZIF_X is unknown');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화가 E를 담아 200으로 오면 실패로 보고한다 (D73)', async () => {
    harness = await startWriteHarness(
      responder({
        activation: activationBody([{ type: 'E', text: 'Interface ZIF_TEST is syntactically wrong' }]),
      }),
    );
    const result = await invoke(updateInterface, harness, {
      interface_name: 'ZIF_TEST',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Interface ZIF_TEST is syntactically wrong');
    expect(textOf(result)).toContain('the active version is unchanged');
  });
});
