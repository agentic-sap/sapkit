/**
 * `CreateBehaviorImplementation` — 시스템 정보 조회 → 클래스 생성.
 *
 * 붙잡는 것 다섯:
 *  1. 발행 계약이 채록본과 글자 그대로 같은가.
 *  2. **BIMP는 클래스다** — `POST /sap/bc/adt/oo/classes`이고 `CLAS/OC`다.
 *     BDEF 쪽(`bo/behaviordefinitions` · `BDEF/BDO`)과 짝이지만 다른 오브젝트다.
 *  3. 소유자 속성을 **매 호출마다 SAP에 물어본다** — BDEF 쪽(env, D98)과 다르다.
 *     조회가 실패해도 생성은 계속된다.
 *  4. `behavior_definition`이 **와이어에 나가지 않는다**(짝인 BDEF의 `root_entity`와
 *     같은 모양의 필수 가드다).
 *  5. 활성화하지 않는다 — 인자 자체가 없다.
 */

import { createBehaviorImplementation } from '../createBehaviorImplementation';
import { expectPublishedDeclaration } from './behaviorSupport';
import { adtException, invoke, jsonOf, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';

const CLASSES = '/sap/bc/adt/oo/classes';
const SYSTEMINFO = '/sap/bc/adt/core/http/systeminformation';

const ARGS = {
  class_name: 'ZBP_I_DEMO',
  behavior_definition: 'ZI_DEMO',
  package_name: '$tmp',
};

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { systemInfo?: string | null } = {}) {
  return ((request, response) => {
    if (request.path === SYSTEMINFO) {
      if (scenario.systemInfo === null) {
        response.statusCode = 404;
        return response.end('');
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(
        scenario.systemInfo ?? JSON.stringify({ systemID: 'E19', userName: 'TESTER' }),
      );
    }
    if (request.path === CLASSES && request.method === 'POST') {
      return xml(response, '<class:abapClass/>', 201);
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    await expectPublishedDeclaration(
      createBehaviorImplementation,
      'CreateBehaviorImplementation',
    );
  });

  it('노출·정책 선언이 구 핸들러의 자리와 맞는다', () => {
    // 구 `handlers/behavior_implementation/high/`. `low/`의 같은 이름 파일은
    // `CreateBehaviorImplementationLow`라 채록본(186종)에 없다.
    expect(createBehaviorImplementation.definition.sets).toEqual(['high']);
    expect(createBehaviorImplementation.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createBehaviorImplementation.definition.kind).toBe('mutation');
    expect(createBehaviorImplementation.definition.targetNames).toEqual([
      'class_name',
      'behavior_definition',
    ]);
  });
});

describe('와이어 — 두 요청', () => {
  it('시스템 정보 조회 → 클래스 생성 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${SYSTEMINFO}`,
      `POST ${CLASSES}`,
    ]);
  });

  it('시스템 정보 요청에 Eclipse식 캐시 무력화 인자가 붙는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createBehaviorImplementation, harness, { ...ARGS });

    const info = harness.nth(0);
    expect(info.headers['accept']).toBe(
      'application/vnd.sap.adt.core.http.systeminformation.v1+json',
    );
    expect(info.query.get('_')).toMatch(/^\d+$/);
  });

  it('생성 POST의 주소·헤더·본문이 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createBehaviorImplementation, harness, { ...ARGS });

    const create = harness.nth(1);
    expect(create.path).toBe(CLASSES);
    expect(create.query.toString()).toBe('');
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.oo.classes.v4+xml');
    expect(create.headers['accept']).toBe('application/vnd.sap.adt.oo.classes.v4+xml');
    expect(create.body).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?><class:abapClass ' +
          'xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" ' +
          'adtcore:description="ZBP_I_DEMO" adtcore:language="EN" ' +
          'adtcore:name="ZBP_I_DEMO" adtcore:type="CLAS/OC" ' +
          'adtcore:masterLanguage="EN" adtcore:masterSystem="E19" adtcore:responsible="TESTER" ' +
          'class:final="false" class:visibility="public">',
        '  <adtcore:packageRef adtcore:name="$TMP"/>',
        '  \n\n',
        '  <class:include adtcore:name="CLAS/OC" adtcore:type="CLAS/OC" class:includeType="testclasses"/>',
        '  <class:superClassRef/>',
        '</class:abapClass>',
      ].join('\n\n\n\n'),
    );
  });

  it('전송요청이 있으면 `?corrNr=`가 붙는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createBehaviorImplementation, harness, {
      ...ARGS,
      transport_request: 'E19K905635',
    });

    expect(harness.nth(1).query.get('corrNr')).toBe('E19K905635');
  });

  it('`behavior_definition`은 어느 요청에도 실리지 않는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createBehaviorImplementation, harness, {
      ...ARGS,
      behavior_definition: 'ZI_MARKER',
    });

    for (const call of harness.calls()) {
      expect(`${call.url} ${call.body}`).not.toContain('ZI_MARKER');
    }
  });
});

describe('소유자 속성 — **SAP에 물어본다** (BDEF의 D98과 다른 자리)', () => {
  it('시스템 정보 조회가 실패해도 생성은 계속되고 속성만 빠진다', async () => {
    harness = await startWriteHarness(responder({ systemInfo: null }));
    const result = await invoke(createBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(false);
    expect(harness.nth(1).body).not.toContain('adtcore:masterSystem');
    expect(harness.nth(1).body).not.toContain('adtcore:responsible');
  });

  it('JSON이 아니면 조회를 없던 것으로 본다', async () => {
    harness = await startWriteHarness(responder({ systemInfo: '<xml/>' }));
    const result = await invoke(createBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(false);
    expect(harness.nth(1).body).not.toContain('adtcore:responsible');
  });
});

describe('응답', () => {
  it('구와 같은 필드로 낸다 — uri는 소문자, package_name은 대문자다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createBehaviorImplementation, harness, {
      ...ARGS,
      class_name: 'zbp_i_demo',
    });

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZBP_I_DEMO',
      behavior_definition: 'ZI_DEMO',
      package_name: '$TMP',
      transport_request: null,
      type: 'CLAS/OC',
      message:
        'Behavior Implementation ZBP_I_DEMO created successfully. Use UpdateBehaviorImplementation to set implementation code.',
      uri: '/sap/bc/adt/oo/classes/zbp_i_demo',
      steps_completed: ['create'],
    });
  });

  it('설명은 60자에서 잘린다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createBehaviorImplementation, harness, {
      ...ARGS,
      description: 'Y'.repeat(80),
    });

    expect(harness.nth(1).body).toContain(`adtcore:description="${'Y'.repeat(60)}"`);
  });
});

describe('갈래', () => {
  it('409는 "이미 있다" 문구로 접힌다', async () => {
    harness = await startWriteHarness(((request, response) => {
      if (request.path === SYSTEMINFO) {
        response.statusCode = 404;
        return response.end('');
      }
      response.statusCode = 409;
      response.end('');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(createBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Behavior Implementation ZBP_I_DEMO already exists. Please delete it first or use a different name.',
    );
  });

  it('그 밖의 실패는 "Failed to create behavior implementation:" 접두사를 단다', async () => {
    harness = await startWriteHarness(((request, response) => {
      if (request.path === SYSTEMINFO) {
        response.statusCode = 404;
        return response.end('');
      }
      response.statusCode = 403;
      response.setHeader('Content-Type', 'application/xml');
      response.end(adtException('ExceptionResourceNoAccess', 'No authorization'));
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(createBehaviorImplementation, harness, { ...ARGS });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Error: Failed to create behavior implementation: /);
    expect(textOf(result)).toContain('No authorization');
  });

  it.each([
    ['class_name', { ...ARGS, class_name: '' }, 'Error: class_name is required'],
    [
      'behavior_definition',
      { ...ARGS, behavior_definition: '' },
      'Error: behavior_definition is required',
    ],
    ['package_name', { ...ARGS, package_name: '' }, 'Error: package_name is required'],
  ])('%s가 비면 **인자마다 다른 문구로** 거부된다', async (_label, args, message) => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createBehaviorImplementation, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
    expect(harness.calls()).toHaveLength(0);
  });
});
