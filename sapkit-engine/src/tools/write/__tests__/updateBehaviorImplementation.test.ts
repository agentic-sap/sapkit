/**
 * `UpdateBehaviorImplementation` — 잠금 → 검사 → PUT 본체 → PUT 구현 →
 * 준비대기 → 해제 → 검사 → (활성화 → 준비대기).
 *
 * 붙잡는 것 여섯:
 *  1. 발행 계약이 채록본과 글자 그대로 같은가.
 *  2. 아홉 단계가 구와 같은 순서·주소로 나가는가.
 *  3. **URI 대소문자가 단계마다 다르다** — 잠금·PUT·활성화는 소문자, **읽기만
 *     대문자**다. 클래스 계열이라고 전부 소문자로 적으면 틀린다.
 *  4. 본체 소스는 호출자가 준 것이 아니라 벤더가 조립한 `FOR BEHAVIOR OF`
 *     껍데기이고, 호출자의 코드는 **구현 인클루드에만** 실린다.
 *  5. 검사 요청의 `Accept`가 BDEF 쪽과 **다르다**(여기는 `…checkmessages+xml`,
 *     BDEF는 Accept 없음).
 *  6. 활성화가 `E`를 담아 200으로 와도 성공으로 접지 않는가 (차이 장부 D100 —
 *     구는 `E`를 `activation_warnings`에 담고도 `success: true`로 답했다).
 */

import { updateBehaviorImplementation } from '../updateBehaviorImplementation';
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

/** 잠금·PUT·활성화가 쓰는 소문자 URI. */
const LOWER = '/sap/bc/adt/oo/classes/zbp_i_demo';
/** 준비대기 읽기가 쓰는 대문자 URI. */
const UPPER = '/sap/bc/adt/oo/classes/ZBP_I_DEMO';
const CHECK = '/sap/bc/adt/checkruns';
const ACTIVATION = '/sap/bc/adt/activation';
const CODE = 'CLASS lhc_demo DEFINITION INHERITING FROM cl_abap_behavior_handler.\nENDCLASS.\n';

const ARGS = {
  class_name: 'ZBP_I_DEMO',
  behavior_definition: 'ZI_DEMO',
  implementation_code: CODE,
};

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(
  scenario: { preCheck?: string; postCheck?: string; activation?: string } = {},
) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === LOWER && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('BIMP-LOCK'));
    }
    if (request.path === LOWER && request.query.get('_action') === 'UNLOCK') {
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
    if (request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === `${UPPER}/source/main` && request.method === 'GET') {
      return plainText(response, 'CLASS zbp_i_demo DEFINITION.\n');
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
    await expectPublishedDeclaration(
      updateBehaviorImplementation,
      'UpdateBehaviorImplementation',
    );
  });

  it('노출·정책 선언이 구 핸들러의 자리와 맞는다', () => {
    expect(updateBehaviorImplementation.definition.sets).toEqual(['high']);
    expect(updateBehaviorImplementation.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateBehaviorImplementation.definition.kind).toBe('mutation');
    expect(updateBehaviorImplementation.definition.targetNames).toEqual([
      'class_name',
      'behavior_definition',
    ]);
  });
});

describe('와이어 — 아홉 단계', () => {
  it('활성화까지 가는 순서가 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${LOWER}`,
      `POST ${CHECK}`,
      `PUT ${LOWER}/source/main`,
      `PUT ${LOWER}/includes/implementations`,
      `GET ${UPPER}/source/main`,
      `POST ${LOWER}`,
      `POST ${CHECK}`,
      `POST ${ACTIVATION}`,
      `GET ${UPPER}/source/main`,
    ]);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화하지 않으면 마지막 읽기가 **질의 인자 없는** 한 번뿐이다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorImplementation, harness, {
      ...ARGS,
      activate: false,
    });

    expect(result.isError).toBe(false);
    const calls = harness.calls();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${LOWER}`,
      `POST ${CHECK}`,
      `PUT ${LOWER}/source/main`,
      `PUT ${LOWER}/includes/implementations`,
      `GET ${UPPER}/source/main`,
      `POST ${LOWER}`,
      `POST ${CHECK}`,
      `GET ${UPPER}/source/main`,
    ]);
    // 마지막 읽기에는 version도 withLongPolling도 없다.
    expect(calls[7]?.query.toString()).toBe('');
  });

  it('준비대기 읽기는 **대문자 URI**에 `version=active&withLongPolling=true`다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    const wait = harness.nth(4);
    expect(wait.path).toBe(`${UPPER}/source/main`);
    expect(wait.query.get('version')).toBe('active');
    expect(wait.query.get('withLongPolling')).toBe('true');
    expect(wait.headers['accept']).toBe('text/plain');
  });

  it('본체 PUT은 **호출자 코드가 아니라** `FOR BEHAVIOR OF` 껍데기를 싣는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    const main = harness.nth(2);
    expect(main.path).toBe(`${LOWER}/source/main`);
    expect(main.query.get('lockHandle')).toBe('BIMP-LOCK');
    expect(main.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(main.body).toBe(
      'CLASS ZBP_I_DEMO DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ZI_DEMO.\n' +
        '\nENDCLASS.\n' +
        '\nCLASS ZBP_I_DEMO IMPLEMENTATION.\n' +
        '\nENDCLASS.',
    );
    expect(main.body).not.toContain(CODE);
  });

  it('구현 인클루드 PUT에만 호출자 코드가 실린다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorImplementation, harness, {
      ...ARGS,
      transport_request: 'E19K905635',
    });

    const impl = harness.nth(3);
    expect(impl.path).toBe(`${LOWER}/includes/implementations`);
    expect(impl.query.get('lockHandle')).toBe('BIMP-LOCK');
    expect(impl.query.get('corrNr')).toBe('E19K905635');
    expect(impl.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(impl.headers['accept']).toBe('text/plain');
    expect(impl.body).toBe(CODE);
  });

  it('검사 요청의 Accept는 `…checkmessages+xml`다 — BDEF 쪽과 다른 자리', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    const check = harness.nth(1);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.headers['accept']).toBe('application/vnd.sap.adt.checkmessages+xml');
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    // 검사 URI는 **소문자로 만든 뒤 인코딩**한다(벤더 `utils/checkRun.js:19-23`).
    expect(check.body).toContain(`adtcore:uri="${LOWER}"`);
    expect(check.body).toContain('chkrun:version="inactive"');
    // 구현 인클루드 코드는 싣지 않는다 — 전체 클래스 코드가 아니라서다.
    expect(check.body).not.toContain('chkrun:artifact');
  });

  it('활성화 본문의 uri는 소문자, name은 대문자다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateBehaviorImplementation, harness, { ...ARGS, class_name: 'zbp_i_demo' });

    const activate = harness.nth(7);
    expect(activate.query.get('method')).toBe('activate');
    expect(activate.query.get('preauditRequested')).toBe('true');
    expect(activate.body).toContain(`adtcore:uri="${LOWER}"`);
    expect(activate.body).toContain('adtcore:name="ZBP_I_DEMO"');
  });
});

describe('응답', () => {
  it('구와 같은 필드로 낸다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZBP_I_DEMO',
      behavior_definition: 'ZI_DEMO',
      transport_request: 'local',
      activated: true,
      message: 'Behavior Implementation ZBP_I_DEMO updated and activated successfully',
      uri: LOWER,
      steps_completed: [
        'lock',
        'update_main_source',
        'update_implementations',
        'check',
        'unlock',
        'activate',
      ],
    });
  });

  it('activate:false면 steps_completed에서 activate가 빠지고 문구도 다르다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorImplementation, harness, {
      ...ARGS,
      activate: false,
    });

    const payload = jsonOf(result);
    expect(payload.activated).toBe(false);
    expect(payload.steps_completed).toEqual([
      'lock',
      'update_main_source',
      'update_implementations',
      'check',
      'unlock',
    ]);
    expect(payload.message).toBe(
      'Behavior Implementation ZBP_I_DEMO updated successfully (not activated)',
    );
  });
});

describe('갈래', () => {
  it('사전 검사가 오류를 담으면 **PUT을 보내지 않고** 잠금을 푼다', async () => {
    harness = await startWriteHarness(responder({ preCheck: failingCheckRun('Field X unknown') }));
    const result = await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(true);
    // 벤더 `checkClass`가 던지던 문구 그대로다.
    expect(textOf(result)).toBe(
      'Error: Failed to update behavior implementation: Class check failed: Field X unknown',
    );
    expect(harness.calls().filter((call) => call.method === 'PUT')).toHaveLength(0);
    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(
      1,
    );
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화가 E를 담아 200으로 오면 실패로 보고한다 (D100)', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Handler class incomplete' }]) }),
    );
    const result = await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      'Activation failed: behavior implementation ZBP_I_DEMO was not activated',
    );
    expect(textOf(result)).toContain('Handler class incomplete');
    expect(textOf(result)).toContain('the active version is unchanged');
  });

  it('E가 아닌 활성화 메시지는 구대로 activation_warnings에 실린다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete statement' }]) }),
    );
    const result = await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(false);
    expect(jsonOf(result).activation_warnings).toEqual(['W: Obsolete statement']);
  });

  it('준비대기 읽기가 실패해도 사슬은 계속된다', async () => {
    harness = await startWriteHarness(((request, response) => {
      if (request.path === LOWER && request.query.get('_action') === 'LOCK') {
        return xml(response, lockBody('BIMP-LOCK'));
      }
      if (request.path === LOWER && request.query.get('_action') === 'UNLOCK') {
        return xml(response, '<ok/>');
      }
      if (request.path === CHECK) return xml(response, cleanCheckRun());
      if (request.method === 'PUT') return plainText(response, '');
      if (request.path === `${UPPER}/source/main`) {
        response.statusCode = 503;
        return response.end('not ready');
      }
      if (request.path === ACTIVATION) return xml(response, activationBody());
      response.statusCode = 500;
      response.end('unexpected');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => call.path)).toContain(ACTIVATION);
  });

  it.each([
    ['class_name', { ...ARGS, class_name: '' }],
    ['behavior_definition', { ...ARGS, behavior_definition: '' }],
    ['implementation_code', { ...ARGS, implementation_code: '' }],
  ])('%s가 비면 요청을 보내기 전에 거부된다', async (_label, args) => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateBehaviorImplementation, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: class_name, behavior_definition, and implementation_code are required',
    );
    expect(harness.calls()).toHaveLength(0);
  });
});
