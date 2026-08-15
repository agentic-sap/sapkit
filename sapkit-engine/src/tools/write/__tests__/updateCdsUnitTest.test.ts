/**
 * `UpdateCdsUnitTest` — 발행 계약 · 와이어 사슬 · 응답 · 갈래 · **D120 대체 기대 시험**.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 사슬 → 벤더 `.../core/unitTest/AdtCdsUnitTest.js:146-171` →
 *    `.../core/class/AdtLocalTestClass.js:168-252` (잠금→검사→PUT→해제→**활성화**)
 *  - 주소·대소문자·검사 본문 → `.../core/class/{lock,includes,check,unlock,testclasses}.js`
 *  - 응답 키 → `engine/src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts:61-108`
 *  - D120의 근거 → `.../core/class/AdtClass.js:436-468`(4xx에서만 던진다) ·
 *    `.../utils/activationUtils.js:116-133`(응답을 그대로 돌려준다)
 */

import { updateCdsUnitTest } from '../updateCdsUnitTest';
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
  xml,
} from './harness';
import type { WriteHarness } from './harness';

const URI = '/sap/bc/adt/oo/classes/zcl_cds_test';
const INCLUDE = `${URI}/includes/testclasses`;
const CODE = 'CLASS ltcl_cds DEFINITION FOR TESTING.\nENDCLASS.';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; activation?: string } = {}) {
  return ((request, response) => {
    if (request.path === URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('CDS-CLASS-LOCK'));
    }
    if (request.path === URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, scenario.check ?? cleanCheckRun());
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

const ARGS = { class_name: 'zcl_cds_test', test_class_source: CODE };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(updateCdsUnitTest)).toEqual(publishedDeclaration('UpdateCdsUnitTest'));
  });

  it('노출·정책 선언 — high, mutation, 대상 이름 선언 필수', () => {
    expect(updateCdsUnitTest.definition.sets).toEqual(['high']);
    expect(updateCdsUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateCdsUnitTest.definition.kind).toBe('mutation');
    expect(updateCdsUnitTest.definition.targetNames).toEqual(['class_name']);
  });

  it('활성화를 끄는 인자가 **없다** — 형제 UpdateLocalTestClass와 갈리는 자리', async () => {
    const published = (await publish(updateCdsUnitTest)).inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(Object.keys(published.properties).sort()).toEqual([
      'class_name',
      'test_class_source',
      'transport_request',
    ]);
    expect(published.required.sort()).toEqual(['class_name', 'test_class_source']);
  });
});

describe('와이어', () => {
  it('잠금 → 검사 → PUT → 해제 → 활성화 순서로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${INCLUDE}`,
      `POST ${URI}`,
      'POST /sap/bc/adt/activation',
    ]);
  });

  it('testclasses 인클루드에 쓴다 — 잠금 손잡이와 이송번호가 질의 인자다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateCdsUnitTest, harness, { ...ARGS, transport_request: 'E19K905635' });

    const put = harness.nth(2);
    expect(put.path).toBe(INCLUDE);
    expect(put.query.get('lockHandle')).toBe('CDS-CLASS-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.body).toBe(CODE);
  });

  it('이송번호를 안 주면 corrNr가 붙지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateCdsUnitTest, harness, ARGS);

    expect(harness.nth(2).query.has('corrNr')).toBe(false);
  });

  it('쓰기 전 검사는 제안 소스를 base64로 실어 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateCdsUnitTest, harness, ARGS);

    const check = harness.nth(1);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.body).toContain(`adtcore:uri="${URI}"`);
    expect(check.body).toContain('chkrun:version="inactive"');
    expect(check.body).toContain(`chkrun:uri="${INCLUDE}"`);
    expect(check.body).toContain(Buffer.from(CODE, 'utf-8').toString('base64'));
  });

  it('클래스 이름은 주소에서 소문자다 — 대문자로 줘도 같은 자리로 간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateCdsUnitTest, harness, { ...ARGS, class_name: 'ZCL_CDS_TEST' });

    expect(harness.nth(0).path).toBe(URI);
    expect(harness.nth(2).path).toBe(INCLUDE);
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다 — test_class_state는 손잡이와 빈 오류 배열뿐', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZCL_CDS_TEST',
      test_class_state: { lockHandle: 'CDS-CLASS-LOCK', errors: [] },
      message: 'CDS unit test class ZCL_CDS_TEST updated successfully.',
    });
  });

  it('testClassCode 키는 실리지 않는다 — 구에서도 언제나 undefined였다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateCdsUnitTest, harness, ARGS);
    const state = (jsonOf(result) as { test_class_state: Record<string, unknown> })
      .test_class_state;

    expect(state).not.toHaveProperty('testClassCode');
  });

  it('본문은 JSON 두 칸 들여쓰기다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(textOf(result)).toBe(JSON.stringify(jsonOf(result), null, 2));
  });
});

describe('갈래', () => {
  it.each([
    ['class_name', { ...ARGS, class_name: '' }],
    ['test_class_source', { ...ARGS, test_class_source: '' }],
  ])('%s가 비면 아무것도 잠그지 않는다 — 구는 둘을 한 문구로 말했다', async (_name, args) => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateCdsUnitTest, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Missing required parameters: class_name, test_class_source',
    );
    expect(harness.calls()).toHaveLength(0);
  });

  it('쓰기 전 검사가 걸리면 PUT도 활성화도 나가지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ check: failingCheckRun('Type LTCL_X is unknown') }),
    );
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Test class check failed: Type LTCL_X is unknown');
    expect(harness.calls().map((call) => call.method)).not.toContain('PUT');
    expect(harness.calls().map((call) => call.path)).not.toContain('/sap/bc/adt/activation');
  });

  it('검사가 걸려도 잠금은 풀린다', async () => {
    harness = await startWriteHarness(
      responder({ check: failingCheckRun('Type LTCL_X is unknown') }),
    );
    await invoke(updateCdsUnitTest, harness, ARGS);

    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(
      1,
    );
  });

  it('423은 SAP이 돌려준 벽을 문구에 남긴다', async () => {
    harness = await startWriteHarness(((request, response) => {
      response.statusCode = 423;
      response.end('locked');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('423');
  });
});

/**
 * **D120 대체 기대 시험** — 장부 등재 규칙 ②.
 *
 * 구 동작(실측): 벤더는 활성화 요청을 **보내기는 한다**
 * (`.../core/class/AdtLocalTestClass.js:227-235`). 그런데 응답 **본문을 읽지 않는다**
 * — `activateObjectInSession`이 응답을 그대로 돌려주고
 * (`.../utils/activationUtils.js:116-133`), `AdtClass.activate()`는 HTTP 4xx에서만
 * 던진다(`AdtClass.js:436-468`). SAP은 활성화 실패도 **HTTP 200 + `<chkl:msg type="E">`**
 * 로 답하므로 깨진 시험 클래스가 "updated successfully"로 보고됐다.
 *
 * 아래 시험이 증명하는 것: 신 엔진은 ⑴ 활성화를 **언제나** 보내고, ⑵ 해제 뒤에
 * 보내며, ⑶ 200에 실려 온 오류를 성공으로 접지 않고, ⑷ 경고만 있으면 과잉 거부하지
 * 않는다.
 */
describe('D120 — 활성화 거짓 성공을 성공으로 접지 않는다', () => {
  it('활성화 요청은 **언제나** 나간다 — 끄는 인자가 없다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateCdsUnitTest, harness, ARGS);

    const activation = harness.calls().find((call) => call.path === '/sap/bc/adt/activation');
    expect(activation).toBeDefined();
    expect(activation?.method).toBe('POST');
    expect(activation?.query.get('method')).toBe('activate');
    expect(activation?.query.get('preauditRequested')).toBe('true');
    expect(activation?.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation?.body).toContain(`adtcore:uri="${URI}"`);
    expect(activation?.body).toContain('adtcore:name="ZCL_CDS_TEST"');
  });

  it('활성화는 해제 **뒤**다 — 잠긴 채로 활성화하면 SAP이 거부한다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateCdsUnitTest, harness, ARGS);

    const calls = harness.calls();
    const unlockAt = calls.findIndex((call) => call.query.get('_action') === 'UNLOCK');
    const activateAt = calls.findIndex((call) => call.path === '/sap/bc/adt/activation');

    expect(unlockAt).toBeGreaterThanOrEqual(0);
    expect(activateAt).toBeGreaterThan(unlockAt);
  });

  it('**활성화가 200에 오류를 실어 오면 성공으로 접지 않는다** — 구는 접었다', async () => {
    harness = await startWriteHarness(
      responder({
        activation: activationBody([
          { type: 'E', text: 'Test class LTCL_CDS is syntactically wrong' },
        ]),
      }),
    );
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Test class LTCL_CDS is syntactically wrong');
    expect(textOf(result)).toContain('the active version is unchanged');
  });

  it('A·X 등급도 실패로 본다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'A', text: 'Abort' }]) }),
    );
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
  });

  it('경고(W)만 실려 오면 활성화 성공이다 — 과잉 거부하지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete statement' }]) }),
    );
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { success: boolean }).success).toBe(true);
  });

  it('활성화가 실패해도 PUT은 이미 나갔다 — 문구가 그 사실을 말한다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'broken' }]) }),
    );
    const result = await invoke(updateCdsUnitTest, harness, ARGS);

    expect(harness.calls().map((call) => call.method)).toContain('PUT');
    expect(textOf(result)).toContain('is on SAP as an inactive version');
  });
});
