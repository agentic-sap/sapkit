/**
 * `UpdateLocalTypes` — 발행 계약 · 와이어 사슬 · 갈래 · **D2 대체 기대 시험**.
 *
 * D2는 이 판의 사전 등재 3건 중 하나이고(`harness/DIVERGENCES.md` M1 사전 등재 표 ·
 * `harness/replay/divergences.ts`), 이 도구를 짓는 마일스톤에서 **휴면을 활성으로
 * 바꾸며 대체 기대 시험을 저작한다**는 조건이 붙어 있었다. 아래 「D2」 절이 그
 * 시험이다.
 *
 * 구 동작의 실측: `AdtLocalTypes`는 부모 `AdtClass.update()`를 **재정의**하면서
 * 활성화 단계를 빠뜨렸다. 형제 `AdtLocalTestClass.update()`에는 그 단계가 있다 —
 * 같은 패키지 안에서 두 재정의를 나란히 놓고 본 것이 근거다.
 */

import { updateLocalTypes } from '../updateLocalTypes';
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
const INCLUDE = `${URI}/includes/implementations`;
const CODE = 'CLASS lcl_helper DEFINITION.\nENDCLASS.';

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

const ARGS = { class_name: 'zcl_test', local_types_code: CODE };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(updateLocalTypes)).toEqual(publishedDeclaration('UpdateLocalTypes'));
  });

  it('노출·정책 선언 — default 두 집합, mutation, 대상 이름 선언 필수', () => {
    expect(updateLocalTypes.definition.sets).toEqual(['high']);
    expect(updateLocalTypes.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateLocalTypes.definition.kind).toBe('mutation');
    expect(updateLocalTypes.definition.targetNames).toEqual(['class_name']);
  });
});

describe('와이어', () => {
  it('잠금 → 검사 → PUT → 해제 → 사후검사 순서로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTypes, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${INCLUDE}`,
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
    ]);
  });

  it('local types는 implementations 인클루드에 쓴다 — 이름과 자원이 어긋난다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalTypes, harness, { ...ARGS, transport_request: 'E19K1' });

    const put = harness.nth(2);
    expect(put.path).toBe(INCLUDE);
    expect(put.query.get('lockHandle')).toBe('CLASS-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K1');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.body).toBe(CODE);
  });

  it('쓰기 전 검사는 제안 소스를 base64로 실어 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalTypes, harness, ARGS);

    const check = harness.nth(1);
    expect(check.body).toContain(`adtcore:uri="${URI}"`);
    expect(check.body).toContain('chkrun:version="inactive"');
    expect(check.body).toContain(`chkrun:uri="${INCLUDE}"`);
    expect(check.body).toContain(Buffer.from(CODE, 'utf-8').toString('base64'));
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTypes, harness, ARGS);

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      transport_request: null,
      activated: false,
      message: 'Local types updated successfully in ZCL_TEST.',
    });
  });

  it('사후검사 경고는 check_warnings로 올라온다', async () => {
    harness = await startWriteHarness(responder({ post: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateLocalTypes, harness, ARGS);
    const payload = jsonOf(result) as { check_warnings?: Array<{ text: string }> };

    expect(payload.check_warnings?.[0]?.text).toBe('Obsolete statement');
  });
});

describe('갈래', () => {
  it('필수 인자가 비면 아무것도 잠그지 않는다 — 구는 둘을 한 문구로 말했다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTypes, harness, { ...ARGS, local_types_code: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('class_name and local_types_code are required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('쓰기 전 검사가 걸리면 PUT이 나가지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Type LCL_X is unknown') }));
    const result = await invoke(updateLocalTypes, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Local types check failed: Type LCL_X is unknown');
    expect(harness.calls().map((call) => call.method)).not.toContain('PUT');
  });

  it('검사가 걸려도 잠금은 풀린다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Type LCL_X is unknown') }));
    await invoke(updateLocalTypes, harness, ARGS);

    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(1);
  });

  it('423은 잠금 문구다', async () => {
    harness = await startWriteHarness(((request, response) => {
      response.statusCode = 423;
      response.end('locked');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateLocalTypes, harness, ARGS);

    expect(textOf(result)).toBe('Class ZCL_TEST is locked by another user.');
  });

  it('사후검사가 오류를 내도 갱신 성공은 성공이다 — 구의 갈래', async () => {
    harness = await startWriteHarness(responder({ post: failingCheckRun('Something is wrong') }));
    const result = await invoke(updateLocalTypes, harness, ARGS);

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { success: boolean }).success).toBe(true);
  });
});

/**
 * **D2 대체 기대 시험** — 장부 등재 규칙 ②.
 *
 * 구 동작(실측): `AdtLocalTypes.update()`
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalTypes.js:156-227`)
 * 는 부모 `AdtClass.update()`를 재정의하면서 `options.activateOnUpdate`를
 * **한 번도 읽지 않는다** — 잠금·검사·PUT·해제로 끝난다. 그런데 겉 핸들러는
 * `activated: activate_on_update`를 그대로 실어 보냈다
 * (`engine/src/handlers/class/high/handleUpdateLocalTypes.ts:87`·`:132`).
 * 즉 `activate_on_update:true`를 주면 **활성화 요청이 한 건도 나가지 않은 채
 * "활성화됨"이라고 답했다.** 형제 `AdtLocalTestClass.update()`
 * (`AdtLocalTestClass.js:227-235`)에는 그 단계가 있다 — 같은 패키지 안의 두
 * 재정의를 나란히 놓고 본 것이 이 판정의 근거다.
 *
 * 아래 시험이 증명하는 것: 신 엔진은 ⑴ 실제로 활성화 요청을 보내고,
 * ⑵ 그 응답을 판정하며, ⑶ 요청하지 않았을 때는 보내지 않는다.
 */
describe('D2 — activate_on_update의 거짓 성공을 고쳤다', () => {
  it('activate_on_update=false면 활성화 요청이 없고 activated=false다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTypes, harness, ARGS);

    expect(harness.calls().map((call) => call.path)).not.toContain('/sap/bc/adt/activation');
    expect((jsonOf(result) as { activated: boolean }).activated).toBe(false);
  });

  it('**activate_on_update=true면 활성화 요청이 실제로 나간다** — 구는 한 건도 안 보냈다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalTypes, harness, { ...ARGS, activate_on_update: true });

    const activation = harness.calls().find((call) => call.path === '/sap/bc/adt/activation');
    expect(activation).toBeDefined();
    expect(activation?.method).toBe('POST');
    expect(activation?.query.get('method')).toBe('activate');
    expect(activation?.query.get('preauditRequested')).toBe('true');
    expect(activation?.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation?.body).toContain(`adtcore:uri="${URI}"`);
    expect(activation?.body).toContain('adtcore:name="ZCL_TEST"');

    expect((jsonOf(result) as { activated: boolean }).activated).toBe(true);
  });

  it('활성화는 해제 뒤다 — 잠긴 채로 활성화하면 SAP이 거부한다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalTypes, harness, { ...ARGS, activate_on_update: true });

    const calls = harness.calls();
    const unlockAt = calls.findIndex((call) => call.query.get('_action') === 'UNLOCK');
    const activateAt = calls.findIndex((call) => call.path === '/sap/bc/adt/activation');

    expect(unlockAt).toBeGreaterThanOrEqual(0);
    expect(activateAt).toBeGreaterThan(unlockAt);
  });

  it('활성화가 200에 오류를 실어 오면 activated:true로 접지 않는다', async () => {
    harness = await startWriteHarness(
      responder({
        activation: activationBody([{ type: 'E', text: 'Local type LCL_X is syntactically wrong' }]),
      }),
    );
    const result = await invoke(updateLocalTypes, harness, { ...ARGS, activate_on_update: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Local type LCL_X is syntactically wrong');
  });

  it('경고(W)만 실려 오면 활성화 성공이다 — 과잉 거부하지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete statement' }]) }),
    );
    const result = await invoke(updateLocalTypes, harness, { ...ARGS, activate_on_update: true });

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { activated: boolean }).activated).toBe(true);
  });
});
