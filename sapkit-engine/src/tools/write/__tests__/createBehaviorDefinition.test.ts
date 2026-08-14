/**
 * `CreateBehaviorDefinition` — 생성 → 잠금 → 검사 → 해제 → (활성화).
 *
 * 붙잡는 것 여섯:
 *  1. 발행 계약이 채록본과 글자 그대로 같은가.
 *  2. 다섯 단계가 구와 같은 주소·전문·헤더로 나가는가 — **URI 표기까지**.
 *     BDEF는 잠금·해제·활성화가 **소문자 · 인코딩 없음**인데 구문검사만
 *     `encodeURIComponent(name).toLowerCase()`다(`./behaviorUri.ts` 표).
 *  3. 구문검사 요청에 **`Accept`가 없다** — 구 `runRawCheckRun`이 안 싣는다.
 *     `checkStored`가 싣는 `…checkmessages+xml`와 다른 자리다.
 *  4. `root_entity`가 **와이어에 나가지 않는다**(필수 가드일 뿐이다).
 *  5. 소유자 속성을 env에서 읽는가 (차이 장부 D98).
 *  6. 활성화가 `E`를 담아 200으로 와도 성공으로 접지 않는가 (차이 장부 D99 —
 *     구는 활성화 응답을 아예 읽지 않았다).
 */

import { createBehaviorDefinition } from '../createBehaviorDefinition';
import { expectPublishedDeclaration, withEnv } from './behaviorSupport';
import {
  activationBody,
  cleanCheckRun,
  failingCheckRun,
  jsonOf,
  lockBody,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import type { ToolResult } from '../../../server';

const COLLECTION = '/sap/bc/adt/bo/behaviordefinitions';
const OBJECT = '/sap/bc/adt/bo/behaviordefinitions/z_i_demo';
const CHECK = '/sap/bc/adt/checkruns';
const ACTIVATION = '/sap/bc/adt/activation';

const ARGS = {
  name: 'Z_I_DEMO',
  package_name: '$TMP',
  root_entity: 'Z_I_DEMO_ROOT',
  implementation_type: 'Managed' as const,
};

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; activation?: string } = {}) {
  return ((request, response) => {
    if (request.path === COLLECTION && request.method === 'POST') {
      response.statusCode = 201;
      return xml(response, '<blue:blueSource/>', 201);
    }
    if (request.path === OBJECT && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('BDEF-LOCK'));
    }
    if (request.path === OBJECT && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
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

function run(
  args: Record<string, unknown> = { ...ARGS },
  env: Record<string, string> = {},
): Promise<ToolResult> {
  return Promise.resolve(createBehaviorDefinition.handler(withEnv(harness, env), args));
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    await expectPublishedDeclaration(createBehaviorDefinition, 'CreateBehaviorDefinition');
  });

  it('노출·정책 선언이 구 핸들러의 자리와 맞는다', () => {
    // 구 `handlers/behavior_definition/high/` → 채록본의 `*_default` 두 조건.
    // `low/`의 같은 이름 파일은 `CreateBehaviorDefinitionLow`라 채록본에 없다.
    expect(createBehaviorDefinition.definition.sets).toEqual(['high']);
    expect(createBehaviorDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createBehaviorDefinition.definition.kind).toBe('mutation');
    expect(createBehaviorDefinition.definition.targetNames).toEqual(['name', 'root_entity']);
  });
});

describe('와이어 — 다섯 단계', () => {
  it('생성 → 잠금 → 검사 → 해제 → 활성화 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await run();

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${COLLECTION}`,
      `POST ${OBJECT}`,
      `POST ${CHECK}`,
      `POST ${OBJECT}`,
      `POST ${ACTIVATION}`,
    ]);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('생성 POST의 주소·헤더·본문이 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    await run();

    const create = harness.nth(0);
    // 컬렉션으로 POST한다 — 이름이 URL에 없다.
    expect(create.path).toBe(COLLECTION);
    expect(create.query.toString()).toBe('');
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.blues.v1+xml');
    expect(create.headers['accept']).toBe('application/vnd.sap.adt.blues.v1+xml');
    expect(create.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><blue:blueSource ' +
        'xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" ' +
        'adtcore:description="Z_I_DEMO" adtcore:language="EN" ' +
        'adtcore:name="Z_I_DEMO" adtcore:type="BDEF/BDO" ' +
        'adtcore:masterLanguage="EN">\n' +
        '    <adtcore:adtTemplate>\n' +
        '        <adtcore:adtProperty adtcore:key="implementation_type">Managed</adtcore:adtProperty>\n' +
        '    </adtcore:adtTemplate>\n' +
        '    <adtcore:packageRef adtcore:name="$TMP"/>\n' +
        '</blue:blueSource>',
    );
  });

  it('전송요청이 있으면 `?corrNr=`가 붙고, 없으면 질의 인자 자체가 없다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS, transport_request: 'E19K905635' });

    expect(harness.nth(0).query.get('corrNr')).toBe('E19K905635');
    await harness.close();

    harness = await startWriteHarness(responder());
    await run({ ...ARGS, transport_request: '' });
    expect(harness.nth(0).query.toString()).toBe('');
  });

  it('잠금·해제는 **소문자 · 인코딩 없는** URI다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS, name: 'z_i_demo' });

    const lock = harness.nth(1);
    expect(lock.path).toBe(OBJECT);
    expect(lock.query.get('_action')).toBe('LOCK');
    expect(lock.query.get('accessMode')).toBe('MODIFY');
    expect(lock.headers['accept']).toBe(
      'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
    );

    const unlock = harness.nth(3);
    expect(unlock.path).toBe(OBJECT);
    expect(unlock.query.get('_action')).toBe('UNLOCK');
    expect(unlock.query.get('lockHandle')).toBe('BDEF-LOCK');
  });

  it('구문검사 요청은 **Accept를 싣지 않는다** (구 `runRawCheckRun`)', async () => {
    harness = await startWriteHarness(responder());
    await run();

    const check = harness.nth(2);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    // 구가 안 실으므로 접속 계층의 기본값이 나간다 —
    // `checkStored`가 싣는 `…checkmessages+xml`가 **아니다.**
    expect(check.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
    expect(check.body).toContain(`adtcore:uri="${OBJECT}"`);
    expect(check.body).toContain('chkrun:version="inactive"');
  });

  it('활성화 본문의 uri는 소문자, name은 대문자다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS, name: 'z_i_demo' });

    const activate = harness.nth(4);
    expect(activate.query.get('method')).toBe('activate');
    expect(activate.query.get('preauditRequested')).toBe('true');
    expect(activate.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activate.body).toContain(`adtcore:uri="${OBJECT}"`);
    expect(activate.body).toContain('adtcore:name="Z_I_DEMO"');
  });

  it('`root_entity`는 어느 요청에도 실리지 않는다 (필수 가드일 뿐이다)', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS, root_entity: 'Z_ROOT_MARKER' });

    for (const call of harness.calls()) {
      expect(`${call.url} ${call.body}`).not.toContain('Z_ROOT_MARKER');
    }
  });
});

describe('생성 페이로드 — 소유자 속성 (차이 장부 D98)', () => {
  it('env가 비면 masterSystem·responsible 속성 자체가 빠진다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS }, {});

    expect(harness.nth(0).body).not.toContain('adtcore:responsible');
    expect(harness.nth(0).body).not.toContain('adtcore:masterSystem');
  });

  it('SAP_USERNAME·SAP_MASTER_SYSTEM이 있으면 실린다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS }, { SAP_USERNAME: 'TESTER', SAP_MASTER_SYSTEM: 'E19' });

    expect(harness.nth(0).body).toContain('adtcore:masterSystem="E19"');
    expect(harness.nth(0).body).toContain('adtcore:responsible="TESTER"');
  });

  it('SAP_RESPONSIBLE이 SAP_USERNAME을 이긴다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS }, { SAP_USERNAME: 'TESTER', SAP_RESPONSIBLE: 'OWNER' });

    expect(harness.nth(0).body).toContain('adtcore:responsible="OWNER"');
  });

  it('설명은 60자에서 잘린다', async () => {
    harness = await startWriteHarness(responder());
    await run({ ...ARGS, description: 'X'.repeat(80) });

    expect(harness.nth(0).body).toContain(`adtcore:description="${'X'.repeat(60)}"`);
  });
});

describe('갈래', () => {
  it('activate:false면 활성화 요청이 나가지 않고 문구도 다르다', async () => {
    harness = await startWriteHarness(responder());
    const result = await run({ ...ARGS, activate: false });

    expect(harness.calls().map((call) => call.path)).not.toContain(ACTIVATION);
    expect(jsonOf(result)).toEqual({
      success: true,
      name: 'Z_I_DEMO',
      package_name: '$TMP',
      type: 'BDEF',
      message: 'Behavior Definition Z_I_DEMO created successfully',
    });
  });

  it('활성화하면 문구가 "created and activated successfully"다', async () => {
    harness = await startWriteHarness(responder());
    const result = await run();

    expect(jsonOf(result).message).toBe(
      'Behavior Definition Z_I_DEMO created and activated successfully',
    );
  });

  it('구문검사가 오류를 담으면 **잠금을 풀고** 활성화하지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Field X unknown') }));
    const result = await run();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Behavior Definition Z_I_DEMO preCheck syntax check failed');
    expect(textOf(result)).toContain('Field X unknown');
    // 해제는 나갔고 활성화는 나가지 않았다.
    expect(harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK')).toHaveLength(1);
    expect(harness.calls().map((call) => call.path)).not.toContain(ACTIVATION);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('활성화가 E를 담아 200으로 오면 실패로 보고한다 (D99)', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'BDEF is inconsistent' }]) }),
    );
    const result = await run();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      'Activation failed: behavior definition Z_I_DEMO was not activated',
    );
    expect(textOf(result)).toContain('BDEF is inconsistent');
    expect(textOf(result)).toContain('inactive version');
  });

  it('E가 아닌 활성화 메시지는 성공을 막지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'Obsolete syntax' }]) }),
    );
    const result = await run();

    expect(result.isError).toBe(false);
  });

  it('생성 POST가 실패하면 구의 감싼 문구를 그대로 낸다', async () => {
    harness = await startWriteHarness(((request, response) => {
      if (request.path === COLLECTION) {
        response.statusCode = 403;
        return response.end('nope');
      }
      response.statusCode = 500;
      response.end('unexpected');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await run();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /^Error: Failed to create behavior definition Z_I_DEMO: /,
    );
    // 생성이 실패했으므로 잠금까지 가지 않는다.
    expect(harness.calls().filter((call) => call.query.get('_action') === 'LOCK')).toHaveLength(0);
  });

  it.each([
    ['name', { ...ARGS, name: '' }],
    ['package_name', { ...ARGS, package_name: '' }],
    ['root_entity', { ...ARGS, root_entity: '' }],
  ])('%s가 비면 요청을 보내기 전에 거부된다', async (_label, args) => {
    harness = await startWriteHarness(responder());
    const result = await run(args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });
});
