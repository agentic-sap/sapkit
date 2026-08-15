/**
 * `UpdateLocalDefinitions` — 발행 계약 · 와이어 사슬 · 응답 · 갈래 ·
 * **D121 대체 기대 시험**.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 사슬 → 벤더 `.../core/class/AdtLocalDefinitions.js:157-229`
 *    (잠금 → 검사 → PUT → 해제. **활성화 단계가 없다**)
 *  - 주소·인클루드 이름 → `.../core/class/includes.js:42-44, 73-97`
 *  - 검사 본문과 주어 `Definitions` → `.../core/class/check.js:111-126, 143-196`
 *  - 응답 키·오류 문구 → `engine/src/handlers/class/high/handleUpdateLocalDefinitions.ts:55-174`
 */

import { updateLocalDefinitions } from '../updateLocalDefinitions';
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
const INCLUDE = `${URI}/includes/definitions`;
const CODE = 'TYPES: BEGIN OF ty_x,\n         f TYPE i,\n       END OF ty_x.';

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

const ARGS = { class_name: 'zcl_test', definitions_code: CODE };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(updateLocalDefinitions)).toEqual(
      publishedDeclaration('UpdateLocalDefinitions'),
    );
  });

  it('노출·정책 선언 — high, mutation, 대상 이름 선언 필수', () => {
    expect(updateLocalDefinitions.definition.sets).toEqual(['high']);
    expect(updateLocalDefinitions.definition.available_in).toEqual([
      'onprem',
      'cloud',
      'legacy',
    ]);
    expect(updateLocalDefinitions.definition.kind).toBe('mutation');
    expect(updateLocalDefinitions.definition.targetNames).toEqual(['class_name']);
  });

  it('activate_on_update에는 default가 없다 — 구 소스에는 false가 적혀 있었다', async () => {
    const published = (await publish(updateLocalDefinitions)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };

    expect(published.properties['activate_on_update']).toEqual({
      type: 'boolean',
      description: 'Activate parent class after updating. Default: false',
    });
    expect(published.required.sort()).toEqual(['class_name', 'definitions_code']);
  });
});

describe('와이어', () => {
  it('잠금 → 검사 → PUT → 해제 → 사후검사 순서로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${INCLUDE}`,
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
    ]);
  });

  it('**definitions** 인클루드에 쓴다 — 형제들과 갈리는 유일한 자리', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalDefinitions, harness, { ...ARGS, transport_request: 'E19K1' });

    const put = harness.nth(2);
    expect(put.path).toBe(INCLUDE);
    expect(put.path).not.toContain('/includes/implementations');
    expect(put.path).not.toContain('/includes/testclasses');
    expect(put.query.get('lockHandle')).toBe('CLASS-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K1');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.body).toBe(CODE);
  });

  it('이송번호를 안 주면 corrNr가 붙지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalDefinitions, harness, ARGS);

    expect(harness.nth(2).query.has('corrNr')).toBe(false);
  });

  it('쓰기 전 검사는 제안 소스를 base64로 실어 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalDefinitions, harness, ARGS);

    const check = harness.nth(1);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.body).toContain(`adtcore:uri="${URI}"`);
    expect(check.body).toContain('chkrun:version="inactive"');
    expect(check.body).toContain(`chkrun:uri="${INCLUDE}"`);
    expect(check.body).toContain(Buffer.from(CODE, 'utf-8').toString('base64'));
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      transport_request: null,
      activated: false,
      message: 'Local definitions updated successfully in ZCL_TEST.',
    });
  });

  it('이송번호를 주면 그대로 실린다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalDefinitions, harness, {
      ...ARGS,
      transport_request: 'E19K905635',
    });

    expect((jsonOf(result) as { transport_request: string }).transport_request).toBe(
      'E19K905635',
    );
  });

  it('사후검사 경고는 check_warnings로 올라온다', async () => {
    harness = await startWriteHarness(responder({ post: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateLocalDefinitions, harness, ARGS);
    const payload = jsonOf(result) as { check_warnings?: Array<{ text: string }> };

    expect(payload.check_warnings?.[0]?.text).toBe('Obsolete statement');
  });
});

describe('갈래', () => {
  it.each([
    ['class_name', { ...ARGS, class_name: '' }],
    ['definitions_code', { ...ARGS, definitions_code: '' }],
  ])('%s가 비면 아무것도 잠그지 않는다 — 구는 둘을 한 문구로 말했다', async (_name, args) => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalDefinitions, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: class_name and definitions_code are required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('쓰기 전 검사가 걸리면 PUT이 나가지 않는다 — 주어는 Definitions다', async () => {
    harness = await startWriteHarness(
      responder({ check: failingCheckRun('Type TY_X is unknown') }),
    );
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Definitions check failed: Type TY_X is unknown');
    expect(textOf(result)).toContain('Failed to update local definitions:');
    expect(harness.calls().map((call) => call.method)).not.toContain('PUT');
  });

  it('검사가 걸려도 잠금은 풀린다', async () => {
    harness = await startWriteHarness(
      responder({ check: failingCheckRun('Type TY_X is unknown') }),
    );
    await invoke(updateLocalDefinitions, harness, ARGS);

    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(
      1,
    );
  });

  it('423은 잠금 문구다', async () => {
    harness = await startWriteHarness(((request, response) => {
      response.statusCode = 423;
      response.end('locked');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(textOf(result)).toBe('Error: Class ZCL_TEST is locked by another user.');
  });

  it('404는 not found 문구다 — 형제와 주어가 다르다', async () => {
    harness = await startWriteHarness(((request, response) => {
      response.statusCode = 404;
      response.end('missing');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(textOf(result)).toBe('Error: Local definitions for ZCL_TEST not found.');
  });

  it('사후검사가 오류를 내도 갱신 성공은 성공이다 — 구의 갈래', async () => {
    harness = await startWriteHarness(responder({ post: failingCheckRun('Something is wrong') }));
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { success: boolean }).success).toBe(true);
  });
});

/**
 * **D121 대체 기대 시험** — 장부 등재 규칙 ②.
 *
 * 구 동작(실측): `AdtLocalDefinitions.update()`
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalDefinitions.js:157-229`)
 * 는 부모 `AdtClass.update()`를 재정의하면서 `options.activateOnUpdate`를 **한 번도
 * 읽지 않는다** — 잠금·검사·PUT·해제로 끝난다. 그런데 겉 핸들러는
 * `activated: activate_on_update`를 그대로 실어 보냈다
 * (`handleUpdateLocalDefinitions.ts:87`·`:139`). 형제
 * `AdtLocalTestClass.update()`(`AdtLocalTestClass.js:227-235`)에는 그 단계가 있다 —
 * 같은 패키지 안의 두 재정의를 나란히 놓고 본 것이 이 판정의 근거다.
 */
describe('D121 — activate_on_update의 거짓 성공을 고쳤다', () => {
  it('activate_on_update=false면 활성화 요청이 없고 activated=false다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalDefinitions, harness, ARGS);

    expect(harness.calls().map((call) => call.path)).not.toContain('/sap/bc/adt/activation');
    expect((jsonOf(result) as { activated: boolean }).activated).toBe(false);
  });

  it('인자를 생략해도 활성화하지 않는다 — 기본값이 false다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateLocalDefinitions, harness, { ...ARGS });

    expect(harness.calls().map((call) => call.path)).not.toContain('/sap/bc/adt/activation');
  });

  it('**activate_on_update=true면 활성화 요청이 실제로 나간다** — 구는 한 건도 안 보냈다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateLocalDefinitions, harness, {
      ...ARGS,
      activate_on_update: true,
    });

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
    await invoke(updateLocalDefinitions, harness, { ...ARGS, activate_on_update: true });

    const calls = harness.calls();
    const unlockAt = calls.findIndex((call) => call.query.get('_action') === 'UNLOCK');
    const activateAt = calls.findIndex((call) => call.path === '/sap/bc/adt/activation');

    expect(unlockAt).toBeGreaterThanOrEqual(0);
    expect(activateAt).toBeGreaterThan(unlockAt);
  });

  it('활성화가 200에 오류를 실어 오면 activated:true로 접지 않는다', async () => {
    harness = await startWriteHarness(
      responder({
        activation: activationBody([{ type: 'E', text: 'Type TY_X is syntactically wrong' }]),
      }),
    );
    const result = await invoke(updateLocalDefinitions, harness, {
      ...ARGS,
      activate_on_update: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Type TY_X is syntactically wrong');
    expect(textOf(result)).toContain('The local definitions update is on SAP as an inactive version');
  });

  it('경고(W)만 실려 오면 활성화 성공이다 — 과잉 거부하지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete statement' }]) }),
    );
    const result = await invoke(updateLocalDefinitions, harness, {
      ...ARGS,
      activate_on_update: true,
    });

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { activated: boolean }).activated).toBe(true);
  });
});
