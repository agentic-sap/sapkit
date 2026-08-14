/**
 * `UpdateBehaviorDefinition` — (잠금 →) PUT → 검사 → (해제 →) (활성화).
 *
 * 붙잡는 것 다섯:
 *  1. 발행 계약이 채록본과 글자 그대로 같은가.
 *  2. **쓰기 전 검사가 없다** — 인터페이스·클래스와 달리 구는 소스를 먼저 올리고
 *     저장된 inactive 판을 검사한다. 순서를 베끼면 틀리는 자리다.
 *  3. `lock_handle`을 주면 **잠그지도 풀지도 않는가.**
 *  4. 구문검사 요청에 `Accept`가 없는가 (구 `runRawCheckRun`).
 *  5. 활성화가 `E`를 담아 200으로 와도 성공으로 접지 않는가 (차이 장부 D100 —
 *     구는 활성화 응답을 아예 읽지 않았다).
 */

import { updateBehaviorDefinition } from '../updateBehaviorDefinition';
import { expectPublishedDeclaration } from './behaviorSupport';
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

const OBJECT = '/sap/bc/adt/bo/behaviordefinitions/z_i_demo';
const CHECK = '/sap/bc/adt/checkruns';
const ACTIVATION = '/sap/bc/adt/activation';
const SOURCE = 'managed implementation in class zbp_i_demo unique;\nstrict ( 2 );\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; activation?: string } = {}) {
  return ((request, response) => {
    if (request.path === OBJECT && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('BDEF-LOCK'));
    }
    if (request.path === OBJECT && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === `${OBJECT}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === CHECK) {
      return xml(response, scenario.check ?? cleanCheckRun());
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
    await expectPublishedDeclaration(updateBehaviorDefinition, 'UpdateBehaviorDefinition');
  });

  it('노출·정책 선언이 구 핸들러의 자리와 맞는다', () => {
    expect(updateBehaviorDefinition.definition.sets).toEqual(['high']);
    expect(updateBehaviorDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateBehaviorDefinition.definition.kind).toBe('mutation');
    expect(updateBehaviorDefinition.definition.targetNames).toEqual(['name']);
  });
});

describe('와이어', () => {
  it('잠금 → PUT → 검사 → 해제 → 활성화 순으로 나간다 (**쓰기 전 검사가 없다**)', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${OBJECT}`,
      `PUT ${OBJECT}/source/main`,
      `POST ${CHECK}`,
      `POST ${OBJECT}`,
      `POST ${ACTIVATION}`,
    ]);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('PUT의 주소·질의·헤더·본문이 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorDefinition, harness, {
      name: 'z_i_demo',
      source_code: SOURCE,
      transport_request: 'E19K905635',
    });

    const put = harness.nth(1);
    expect(put.path).toBe(`${OBJECT}/source/main`);
    expect(put.query.get('lockHandle')).toBe('BDEF-LOCK');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers['accept']).toBe('text/plain');
    expect(put.body).toBe(SOURCE);
  });

  it('전송요청이 없으면 `corrNr`가 붙지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorDefinition, harness, { name: 'Z_I_DEMO', source_code: SOURCE });

    expect(harness.nth(1).query.get('corrNr')).toBeNull();
  });

  it('구문검사 요청은 **Accept를 싣지 않고** 저장된 inactive 판을 본다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorDefinition, harness, { name: 'Z_I_DEMO', source_code: SOURCE });

    const check = harness.nth(2);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
    expect(check.body).toContain('chkrun:version="inactive"');
    // 제안 소스를 base64로 싣는 「쓰기 전」 모양이 아니다.
    expect(check.body).not.toContain('chkrun:artifact');
  });
});

describe('`lock_handle`을 주면 잠그지도 풀지도 않는다', () => {
  it('요청이 PUT → 검사 → 활성화 셋뿐이다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
      lock_handle: 'CALLER-LOCK',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `PUT ${OBJECT}/source/main`,
      `POST ${CHECK}`,
      `POST ${ACTIVATION}`,
    ]);
    expect(harness.nth(0).query.get('lockHandle')).toBe('CALLER-LOCK');
  });

  it('검사가 실패해도 해제 요청을 만들지 않는다 (남의 잠금이다)', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun() }));
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
      lock_handle: 'CALLER-LOCK',
    });

    expect(result.isError).toBe(true);
    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(
      0,
    );
  });
});

describe('갈래', () => {
  it('activate:false면 활성화가 나가지 않고 문구도 다르다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
      activate: false,
    });

    expect(harness.calls().map((call) => call.path)).not.toContain(ACTIVATION);
    expect(jsonOf(result)).toEqual({
      success: true,
      name: 'Z_I_DEMO',
      message: 'Behavior Definition Z_I_DEMO updated successfully',
    });
  });

  it('활성화하면 문구가 "updated and activated successfully"다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
    });

    expect(jsonOf(result).message).toBe(
      'Behavior Definition Z_I_DEMO updated and activated successfully',
    );
  });

  it('구문검사가 오류를 담으면 잠금을 풀고 활성화하지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Syntax error') }));
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Behavior Definition Z_I_DEMO preCheck syntax check failed');
    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(
      1,
    );
    expect(harness.calls().map((call) => call.path)).not.toContain(ACTIVATION);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화가 E를 담아 200으로 오면 실패로 보고한다 (D100)', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Entity not found' }]) }),
    );
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      'Activation failed: behavior definition Z_I_DEMO was not activated',
    );
    expect(textOf(result)).toContain('Entity not found');
    expect(textOf(result)).toContain('the active version is unchanged');
  });

  it('E가 아닌 활성화 메시지는 성공을 막지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Deprecated' }]) }),
    );
    const result = await invoke(updateBehaviorDefinition, harness, {
      name: 'Z_I_DEMO',
      source_code: SOURCE,
    });

    expect(result.isError).toBe(false);
  });

  it.each([
    ['name', { name: '', source_code: SOURCE }],
    ['source_code', { name: 'Z_I_DEMO', source_code: '' }],
  ])('%s가 비면 요청을 보내기 전에 거부된다', async (_label, args) => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorDefinition, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });
});
