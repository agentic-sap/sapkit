/**
 * `UpdateLocalTestClass` — 발행 계약 · 와이어 사슬 · 갈래 · **D41 대체 기대 시험**.
 *
 * D41(장부 `harness/DIVERGENCES.md`)은 "활성화 응답이 200에 `<chkl:msg type="E">`를
 * 실어 와도 구는 `activated:true`를 답했다"를 고친 것이다. 아래 「D41」 절이 그
 * 차이가 *옳다*는 것을 증명하는 자리다.
 */

import { updateLocalTestClass } from '../updateLocalTestClass';
import { publish, publishedDeclaration } from './classPublication';
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

const URI = '/sap/bc/adt/oo/classes/zcl_test';
const INCLUDE = `${URI}/includes/testclasses`;
const CODE = 'CLASS ltcl_test DEFINITION FOR TESTING.\nENDCLASS.';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; post?: string; activation?: string } = {}) {
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
      return xml(
        response,
        checkRuns === 1 ? (scenario.check ?? cleanCheckRun()) : (scenario.post ?? cleanCheckRun()),
      );
    }
    if (request.path === INCLUDE && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, scenario.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

const ARGS = { class_name: 'zcl_test', test_class_code: CODE };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(updateLocalTestClass)).toEqual(publishedDeclaration('UpdateLocalTestClass'));
  });

  it('노출·정책 선언 — default 두 집합, mutation, 대상 이름 선언 필수', () => {
    expect(updateLocalTestClass.definition.sets).toEqual(['high']);
    expect(updateLocalTestClass.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateLocalTestClass.definition.kind).toBe('mutation');
    expect(updateLocalTestClass.definition.targetNames).toEqual(['class_name']);
  });
});

describe('와이어', () => {
  it('잠금 → 검사 → PUT → 해제 → 사후검사 순서로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTestClass, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${INCLUDE}`,
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
    ]);
    expect(harness.nth(0).query.get('_action')).toBe('LOCK');
    expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
  });

  it('PUT은 잠금 손잡이를 달고 소스를 그대로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalTestClass, harness, { ...ARGS, transport_request: 'E19K1' });

    const put = harness.nth(2);
    expect(put.query.get('lockHandle')).toBe('CLASS-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K1');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers['accept']).toBe('text/plain');
    expect(put.body).toBe(CODE);
  });

  it('쓰기 전 검사는 제안 소스를 base64로 실어 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalTestClass, harness, ARGS);

    const check = harness.nth(1);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.body).toContain(`adtcore:uri="${URI}"`);
    expect(check.body).toContain('chkrun:version="inactive"');
    expect(check.body).toContain(`chkrun:uri="${INCLUDE}"`);
    expect(check.body).toContain(Buffer.from(CODE, 'utf-8').toString('base64'));
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTestClass, harness, ARGS);

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      transport_request: null,
      activated: false,
      message: 'Local test class updated successfully in ZCL_TEST.',
    });
  });

  it('사후검사 경고는 check_warnings로 올라온다', async () => {
    harness = await startWriteHarness(responder({ post: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateLocalTestClass, harness, ARGS);
    const payload = jsonOf(result) as { check_warnings?: Array<{ text: string }> };

    expect(payload.check_warnings?.[0]?.text).toBe('Obsolete statement');
  });
});

describe('갈래', () => {
  it('class_name이 비면 아무것도 잠그지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTestClass, harness, { ...ARGS, class_name: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('class_name is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('test_class_code가 비면 따로 말한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTestClass, harness, { ...ARGS, test_class_code: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('test_class_code is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('쓰기 전 검사가 걸리면 PUT이 나가지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Syntax error') }));
    const result = await invoke(updateLocalTestClass, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Test class check failed: Syntax error');
    expect(harness.calls().map((call) => call.method)).not.toContain('PUT');
  });

  it('검사가 걸려도 잠금은 풀린다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Syntax error') }));
    await invoke(updateLocalTestClass, harness, ARGS);

    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(1);
  });

  it('423은 잠금 문구다', async () => {
    harness = await startWriteHarness(((request, response) => {
      response.statusCode = 423;
      response.end('locked');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateLocalTestClass, harness, ARGS);

    expect(textOf(result)).toBe('Class ZCL_TEST is locked by another user.');
  });

  it('사후검사가 오류를 내도 갱신 성공은 성공이다 — 구의 갈래', async () => {
    harness = await startWriteHarness(responder({ post: failingCheckRun('Something is wrong') }));
    const result = await invoke(updateLocalTestClass, harness, ARGS);

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { success: boolean }).success).toBe(true);
  });
});

/**
 * D41 대체 기대 시험 — 활성화 응답을 실제로 판정한다.
 *
 * 구는 `AdtLocalTestClass.update()`가 활성화 요청을 보내기는 했지만
 * (`…/dist/core/class/AdtLocalTestClass.js:227-235`) 그 **응답 본문을 읽지
 * 않았다**. SAP은 활성화 실패도 HTTP 200으로 답하며 `<chkl:msg type="E">`를
 * 담으므로, 깨진 테스트 클래스가 `activated:true`로 보고됐다. 신 엔진은 본문을
 * 읽고 실패로 되돌린다.
 */
describe('D41 — 활성화 실패를 성공으로 접지 않는다', () => {
  it('activate_on_update=false면 활성화 요청 자체가 없다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalTestClass, harness, ARGS);

    expect(harness.calls().map((call) => call.path)).not.toContain('/sap/bc/adt/activation');
  });

  it('activate_on_update=true면 해제 뒤에 부모 클래스를 활성화한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTestClass, harness, {
      ...ARGS,
      activate_on_update: true,
    });

    const activation = harness.calls().find((call) => call.path === '/sap/bc/adt/activation');
    expect(activation).toBeDefined();
    expect(activation?.query.get('method')).toBe('activate');
    expect(activation?.query.get('preauditRequested')).toBe('true');
    expect(activation?.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation?.body).toContain(`adtcore:uri="${URI}"`);
    expect(activation?.body).toContain('adtcore:name="ZCL_TEST"');
    // 해제 뒤여야 한다 — 잠긴 채로 활성화하면 SAP이 거부한다.
    const paths = harness.calls().map((call) => `${call.method} ${call.path}?${call.url.split('?')[1] ?? ''}`);
    const unlockAt = paths.findIndex((entry) => entry.includes('_action=UNLOCK'));
    const activateAt = harness.calls().findIndex((call) => call.path === '/sap/bc/adt/activation');
    expect(activateAt).toBeGreaterThan(unlockAt);

    expect((jsonOf(result) as { activated: boolean }).activated).toBe(true);
  });

  it('**활성화가 200에 오류를 실어 오면 실패다** — 구는 여기서 activated:true를 답했다', async () => {
    harness = await startWriteHarness(
      responder({
        activation: activationBody([{ type: 'E', text: 'Test class is syntactically wrong' }]),
      }),
    );
    const result = await invoke(updateLocalTestClass, harness, {
      ...ARGS,
      activate_on_update: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Test class is syntactically wrong');
    expect(textOf(result)).toContain('Activation failed');
  });

  it('A·X 등급도 실패로 센다 — E만 보지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'A', text: 'Abort during activation' }]) }),
    );
    const result = await invoke(updateLocalTestClass, harness, {
      ...ARGS,
      activate_on_update: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Abort during activation');
  });

  it('경고(W)만 실려 오면 활성화 성공이다 — 과잉 거부하지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete statement' }]) }),
    );
    const result = await invoke(updateLocalTestClass, harness, {
      ...ARGS,
      activate_on_update: true,
    });

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { activated: boolean }).activated).toBe(true);
  });
});
