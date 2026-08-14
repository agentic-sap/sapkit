/**
 * `CreateClass` — 발행 계약 · 와이어 3왕복 · 페이로드 · 갈래.
 *
 * 이 도구가 만드는 것은 **껍데기뿐**이다(소스는 `UpdateClass`의 몫). 그래서
 * 붙잡을 것은 "무엇이 나갔나"이고, 그중에서도 생성 페이로드의 속성 한 줄까지가
 * 계약이다 — 마스터 언어·final·visibility·담당자.
 */

import { createClass } from '../createClass';
import { publish, publishedDeclaration } from './classPublication';
import {
  cleanCheckRun,
  failingCheckRun,
  invoke,
  jsonOf,
  startWriteHarness,
  textOf,
  warningCheckRun,
  xml,
} from './harness';
import type { WriteHarness } from './harness';

const SYSTEMINFO = '/sap/bc/adt/core/http/systeminformation';
const CLASSES = '/sap/bc/adt/oo/classes';
const CHECKRUNS = '/sap/bc/adt/checkruns';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { language?: string | null; check?: string } = {}) {
  return ((request, response) => {
    if (request.path === SYSTEMINFO) {
      if (scenario.language === null) {
        response.statusCode = 404;
        return response.end('');
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: scenario.language ?? 'EN' }));
    }
    if (request.path === CLASSES && request.method === 'POST') {
      response.statusCode = 201;
      return response.end('');
    }
    if (request.path === CHECKRUNS) {
      return xml(response, scenario.check ?? cleanCheckRun());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(createClass)).toEqual(publishedDeclaration('CreateClass'));
  });

  it('노출·정책 선언 — 채록본의 default 두 집합, mutation, 대상 이름 선언 필수', () => {
    expect(createClass.definition.sets).toEqual(['high']);
    expect(createClass.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createClass.definition.kind).toBe('mutation');
    expect(createClass.definition.targetNames).toEqual(['class_name']);
  });
});

describe('와이어', () => {
  it('로그온 언어 조회 → 생성 POST → 생성 후 구문검사 순서로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${SYSTEMINFO}`,
      `POST ${CLASSES}`,
      `POST ${CHECKRUNS}`,
    ]);
  });

  it('생성 POST의 Accept·Content-Type이 둘 다 v4 클래스 타입이다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createClass, harness, { class_name: 'zcl_test', package_name: '$TMP' });

    const create = harness.nth(1);
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.oo.classes.v4+xml');
    expect(create.headers['accept']).toBe('application/vnd.sap.adt.oo.classes.v4+xml');
  });

  it('이송요청은 corrNr 질의 인자로 붙는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: 'ZPKG',
      transport_request: 'E19K905635',
    });

    expect(harness.nth(1).query.get('corrNr')).toBe('E19K905635');
  });

  it('이송요청이 없으면 질의 인자 자체가 없다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createClass, harness, { class_name: 'zcl_test', package_name: '$TMP' });

    expect(harness.nth(1).query.get('corrNr')).toBeNull();
  });

  it('생성 후 구문검사는 소문자 클래스 URI를 inactive로 묻는다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createClass, harness, { class_name: 'zcl_test', package_name: '$TMP' });

    const check = harness.nth(2);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.body).toContain('adtcore:uri="/sap/bc/adt/oo/classes/zcl_test"');
    expect(check.body).toContain('chkrun:version="inactive"');
  });
});

describe('생성 페이로드', () => {
  async function bodyOf(args: Record<string, unknown>, scenario = {}): Promise<string> {
    harness = await startWriteHarness(responder(scenario));
    await invoke(createClass, harness, { class_name: 'zcl_test', package_name: '$TMP', ...args });
    return harness.nth(1).body ?? '';
  }

  it('기본값 — 이름은 대문자, 설명은 이름으로, final/visibility는 구의 기본', async () => {
    const body = await bodyOf({});

    expect(body).toContain('adtcore:name="ZCL_TEST"');
    expect(body).toContain('adtcore:description="ZCL_TEST"');
    expect(body).toContain('adtcore:type="CLAS/OC"');
    expect(body).toContain('class:final="false"');
    expect(body).toContain('class:visibility="public"');
    expect(body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
    expect(body).toContain(
      '<class:include adtcore:name="CLAS/OC" adtcore:type="CLAS/OC" class:includeType="testclasses"/>',
    );
  });

  it('상위클래스가 없으면 빈 참조를, 있으면 이름을 실은 참조를 넣는다', async () => {
    expect(await bodyOf({})).toContain('<class:superClassRef/>');
    await harness.close();
    expect(await bodyOf({ superclass: 'ZCL_BASE' })).toContain(
      '<class:superClassRef adtcore:name="ZCL_BASE"/>',
    );
  });

  it('final·create_protected가 속성으로 나간다', async () => {
    const body = await bodyOf({ final: true, create_protected: true });

    expect(body).toContain('class:final="true"');
    expect(body).toContain('class:visibility="protected"');
  });

  it('로그온 언어를 조회해 language·masterLanguage 두 자리에 박는다', async () => {
    const body = await bodyOf({}, { language: 'CS' });

    expect(body).toContain('adtcore:language="CS"');
    expect(body).toContain('adtcore:masterLanguage="CS"');
  });

  it('언어 조회가 막히면 EN으로 떨어지되 생성은 계속한다', async () => {
    const body = await bodyOf({}, { language: null });

    expect(body).toContain('adtcore:language="EN"');
    expect(body).toContain('adtcore:masterLanguage="EN"');
  });

  it('설명은 60자에서 잘린다 — 구 limitDescription', async () => {
    const long = 'X'.repeat(80);
    const body = await bodyOf({ description: long });

    expect(body).toContain(`adtcore:description="${'X'.repeat(60)}"`);
    expect(body).not.toContain('X'.repeat(61));
  });

  it('페이로드가 벤더 문자열과 빈 줄까지 글자로 같다', async () => {
    // 기대값은 내 구현이 아니라 `dist/core/class/create.js:44-64`의 템플릿
    // 리터럴을 줄 단위로 옮겨 조립한 것이다 — 사이의 빈 줄 수까지 거기서 왔다.
    const header =
      '<?xml version="1.0" encoding="UTF-8"?><class:abapClass ' +
      'xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" ' +
      'adtcore:description="ZCL_TEST" adtcore:language="EN" adtcore:name="ZCL_TEST" ' +
      'adtcore:type="CLAS/OC" adtcore:masterLanguage="EN" ' +
      'class:final="false" class:visibility="public">';
    const expected =
      header +
      '\n\n\n\n' +
      '  <adtcore:packageRef adtcore:name="$TMP"/>' +
      '\n\n\n\n' +
      // `  ${templateSection}` — templateSection의 기본값이 '\n\n'이다.
      '  \n\n' +
      '\n\n\n\n' +
      '  <class:include adtcore:name="CLAS/OC" adtcore:type="CLAS/OC" class:includeType="testclasses"/>' +
      '\n\n\n\n' +
      '  <class:superClassRef/>' +
      '\n\n\n\n' +
      '</class:abapClass>';

    expect(await bodyOf({})).toBe(expected);
  });

  it('담당자·마스터시스템은 환경에서 와 속성으로 붙는다', async () => {
    // 구는 `getSystemContext()`가 채운 값을 넣었고, 그 값의 출처는
    // SAP_MASTER_SYSTEM / (SAP_RESPONSIBLE || SAP_USERNAME)다
    // (engine/src/lib/systemContext.ts:63-65).
    harness = await startWriteHarness(responder());
    await createClass.handler(
      { ...harness.context, env: { SAP_USERNAME: 'DEVUSER', SAP_MASTER_SYSTEM: 'E19' } },
      { class_name: 'zcl_test', package_name: '$TMP' },
    );
    const body = harness.nth(1).body;

    expect(body).toContain(' adtcore:masterSystem="E19" adtcore:responsible="DEVUSER" ');
  });

  it('SAP_RESPONSIBLE이 SAP_USERNAME을 이긴다', async () => {
    harness = await startWriteHarness(responder());
    await createClass.handler(
      { ...harness.context, env: { SAP_USERNAME: 'DEVUSER', SAP_RESPONSIBLE: 'OWNER' } },
      { class_name: 'zcl_test', package_name: '$TMP' },
    );

    expect(harness.nth(1).body).toContain('adtcore:responsible="OWNER"');
  });

  it('abstract는 받기만 하고 페이로드에 나가지 않는다 — 구의 실측 그대로', async () => {
    // 벤더 create()가 abstract 속성을 아예 조립하지 않는다
    // (dist/core/class/create.js:44-64에 final·visibility뿐이다).
    // 고치려면 올바른 ADT 속성 이름을 실측해야 하므로 이 판에서는 재현한다.
    const body = await bodyOf({ abstract: true });

    expect(body).not.toContain('abstract');
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다 — data 중첩과 평면 키가 함께 있다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: '$TMP',
    });

    expect(jsonOf(result)).toEqual({
      success: true,
      data: {
        class_name: 'ZCL_TEST',
        package_name: '$TMP',
        transport_request: null,
        activated: false,
        errors: [],
      },
      class_name: 'ZCL_TEST',
      package_name: '$TMP',
      transport_request: null,
      activated: false,
      errors: [],
      message: 'Class ZCL_TEST created successfully. Use UpdateClass to set source code.',
    });
  });

  it('이송요청을 주면 응답 두 자리에 모두 실린다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: 'ZPKG',
      transport_request: 'E19K905635',
    });
    const payload = jsonOf(result) as { transport_request: string; data: { transport_request: string } };

    expect(payload.transport_request).toBe('E19K905635');
    expect(payload.data.transport_request).toBe('E19K905635');
  });

  it('경고는 check_warnings로 올라온다', async () => {
    harness = await startWriteHarness(responder({ check: warningCheckRun('Obsolete statement') }));
    const result = await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: '$TMP',
    });
    const payload = jsonOf(result) as { check_warnings?: Array<{ text: string }> };

    expect(payload.check_warnings?.[0]?.text).toBe('Obsolete statement');
  });
});

describe('갈래', () => {
  it('필수 인자가 비면 만들지 않는다 — 요청이 한 건도 안 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createClass, harness, { class_name: '', package_name: '$TMP' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });

  it('생성이 막히면 실패로 보고한다', async () => {
    harness = await startWriteHarness(((request, response) => {
      if (request.path === SYSTEMINFO) {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        return response.end('{"language":"EN"}');
      }
      response.statusCode = 403;
      response.end('forbidden');
    }) as Parameters<typeof startWriteHarness>[0]);

    const result = await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('403');
  });

  it('생성 뒤 구문검사가 오류를 내도 생성 성공은 성공이다 — 구의 갈래', async () => {
    // 구 흐름: 벤더 checkClass가 오류에서 던지고(check.js:73-76), 핸들러는
    // isPreCheckFailure가 아니므로 경고만 남기고 계속한다
    // (handleCreateClass.ts:240-252). 오브젝트는 실제로 만들어졌다.
    harness = await startWriteHarness(responder({ check: failingCheckRun('Something is wrong') }));
    const result = await invoke(createClass, harness, {
      class_name: 'zcl_test',
      package_name: '$TMP',
    });
    const payload = jsonOf(result) as { success: boolean; check_warnings?: unknown };

    expect(result.isError).toBe(false);
    expect(payload.success).toBe(true);
    expect(payload.check_warnings).toBeUndefined();
  });
});
