/**
 * `CreateInterface` — 발행 계약 · 생성 POST의 와이어 · 생성 후 검사 갈래.
 *
 * 기대값은 구 엔진의 실측에서 뽑았다: 페이로드 한 장은
 * `@babamba2/mcp-abap-adt-clients/dist/core/interface/create.js:48-56`,
 * 헤더는 같은 파일 `:58-61`, 로그온 언어 조회는
 * `engine/src/lib/adtLogonLanguage.ts:52-80`, 생성 후 검사가 치명적이지 않다는
 * 것은 `engine/src/handlers/interface/high/handleCreateInterface.ts:127-139`다.
 */

import { createInterface } from '../createInterface';
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
import { expectPublishedDeclaration } from './interfaceSupport';

const CREATE_PATH = '/sap/bc/adt/oo/interfaces';
const CHECK_PATH = '/sap/bc/adt/checkruns';
const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(
  scenario: { language?: string | null; check?: string; createStatus?: number } = {},
) {
  return ((request, response) => {
    if (request.path === SYSTEMINFO_PATH) {
      if (scenario.language === null) {
        response.statusCode = 404;
        return response.end('no systeminformation');
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: scenario.language ?? 'EN' }));
    }
    if (request.path === CREATE_PATH && request.method === 'POST') {
      response.statusCode = scenario.createStatus ?? 201;
      response.setHeader('Content-Type', 'application/vnd.sap.adt.oo.interfaces.v5+xml');
      return response.end('<intf:abapInterface/>');
    }
    if (request.path === CHECK_PATH) {
      return xml(response, scenario.check ?? cleanCheckRun());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    await expectPublishedDeclaration(createInterface, 'CreateInterface');
  });

  it('노출·정책 선언이 구 핸들러의 자리와 맞는다', () => {
    // `engine/src/handlers/interface/high/` · 채록본의 `*_default` 두 조건에만 뜬다.
    expect(createInterface.definition.sets).toEqual(['high']);
    expect(createInterface.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createInterface.definition.kind).toBe('mutation');
    // mutation은 대상-이름 선언이 필수다 — 녹화 사전 검사가 이것을 읽는다.
    expect(createInterface.definition.targetNames).toEqual(['interface_name']);
  });
});

describe('와이어', () => {
  it('로그온 언어를 물어본 뒤 생성 POST를 보내고 껍데기를 검사한다', async () => {
    harness = await startWriteHarness(responder({ language: 'CS' }));
    const result = await invoke(createInterface, harness, {
      interface_name: 'zif_test',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${SYSTEMINFO_PATH}`,
      `POST ${CREATE_PATH}`,
      `POST ${CHECK_PATH}`,
    ]);

    const create = harness.nth(1);
    // 전송요청이 없으면 질의 인자 자체가 붙지 않는다.
    expect(create.url).toBe(CREATE_PATH);
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.oo.interfaces.v5+xml');
    expect(create.headers['accept']).toBe('application/vnd.sap.adt.oo.interfaces.v5+xml');
    expect(create.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><intf:abapInterface ' +
        'xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:adtcore="http://www.sap.com/adt/core" ' +
        'adtcore:description="ZIF_TEST" adtcore:language="CS" ' +
        'adtcore:name="ZIF_TEST" adtcore:type="INTF/OI" ' +
        'adtcore:masterLanguage="CS">\n\n\n\n' +
        '  <adtcore:packageRef adtcore:name="$TMP"/>\n\n\n\n' +
        '</intf:abapInterface>',
    );

    // 생성 후 검사는 **소문자로 만든 뒤 인코딩한** URI다(`utils/checkRun.js:20`).
    expect(harness.nth(2).body).toContain(
      `adtcore:uri="${CREATE_PATH}/zif_test" chkrun:version="inactive"`,
    );
  });

  it('전송요청은 corrNr 질의 인자로 나간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: 'ZOK_LAB',
      transport_request: 'E19K905635',
    });

    expect(harness.nth(1).url).toBe(`${CREATE_PATH}?corrNr=E19K905635`);
  });

  it('로그온 언어를 못 읽으면 EN으로 떨어지되 생성은 계속한다', async () => {
    harness = await startWriteHarness(responder({ language: null }));
    const result = await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.nth(1).body).toContain('adtcore:language="EN"');
    expect(harness.nth(1).body).toContain('adtcore:masterLanguage="EN"');
  });

  it('설명은 60자에서 잘린다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
      description: 'x'.repeat(80),
    });

    expect(harness.nth(1).body).toContain(`adtcore:description="${'x'.repeat(60)}"`);
  });
});

describe('응답', () => {
  it('구가 싣던 키를 그대로 싣는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createInterface, harness, {
      interface_name: 'zif_test',
      package_name: '$TMP',
    });

    expect(jsonOf(result)).toEqual({
      success: true,
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
      transport_request: null,
      type: 'INTF/OI',
      message: 'Interface ZIF_TEST created successfully. Use UpdateInterface to set source code.',
      uri: `${CREATE_PATH}/zif_test`,
      steps_completed: ['create', 'check'],
    });
  });

  it('검사 경고는 check_warnings로 실린다', async () => {
    harness = await startWriteHarness(responder({ check: warningCheckRun('Obsolete statement') }));
    const result = await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
    });

    const payload = jsonOf(result) as { check_warnings?: Array<{ text: string }> };
    expect(payload.check_warnings?.[0]?.text).toBe('Obsolete statement');
  });
});

describe('생성 후 검사는 치명적이지 않다 (구 실측)', () => {
  it('검사가 오류를 내도 성공으로 답하고 steps_completed에 check를 적지 않는다', async () => {
    // 구에서는 벤더 `checkInterface`가 먼저 던지고 핸들러가 warn으로 삼킨다
    // (`core/interface/check.js:11-18` · `handleCreateInterface.ts:133-138`).
    // 오브젝트는 이미 만들어졌으므로 되돌릴 대상도 없다.
    harness = await startWriteHarness(responder({ check: failingCheckRun('Type ZIF_X is unknown', '4') }));
    const result = await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect((jsonOf(result) as { steps_completed: string[] }).steps_completed).toEqual(['create']);
  });
});

describe('거부 갈래', () => {
  it('필수 인자가 없으면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());

    const noName = await invoke(createInterface, harness, { package_name: '$TMP' });
    expect(noName.isError).toBe(true);
    expect(textOf(noName)).toBe('Error: interface_name is required');

    const noPackage = await invoke(createInterface, harness, { interface_name: 'ZIF_TEST' });
    expect(noPackage.isError).toBe(true);
    expect(textOf(noPackage)).toBe('Error: package_name is required');

    expect(harness.calls()).toHaveLength(0);
  });

  it('생성이 201/200이 아니면 성공으로 접지 않는다', async () => {
    harness = await startWriteHarness(responder({ createStatus: 204 }));
    const result = await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Interface creation returned status 204 instead of 201',
    );
  });

  it('생성이 4xx면 오류를 그대로 올린다', async () => {
    harness = await startWriteHarness(((request, response) => {
      if (request.path === SYSTEMINFO_PATH) {
        response.statusCode = 200;
        return response.end(JSON.stringify({ language: 'EN' }));
      }
      response.statusCode = 403;
      response.end('forbidden');
    }) as Parameters<typeof startWriteHarness>[0]);

    const result = await invoke(createInterface, harness, {
      interface_name: 'ZIF_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Error: ');
    expect(textOf(result)).toContain('403');
  });
});
