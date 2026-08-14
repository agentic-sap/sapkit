/**
 * `CreateView` — 발행 계약 · 검증→언어→생성 시퀀스 · 페이로드 · 오류 갈래.
 *
 * 기대값은 전부 구 엔진 실측에서 뽑았다:
 *  - 선언 = `harness/old-surface/m1-tools.json`의 `tools`(전량 186종)
 *  - 검증 왕복 = `@babamba2/mcp-abap-adt-clients/dist/core/view/validation.js:20-38`
 *  - 언어 조회 = `engine/src/lib/adtLogonLanguage.ts:47-73`
 *  - 생성 왕복·XML = `dist/core/view/create.js:13-51`
 *  - 응답 모양 = `engine/src/handlers/view/high/handleCreateView.ts:114-123`
 *
 * 실 SAP에는 한 바이트도 나가지 않는다 — 같은 프로세스 안의 시험 서버다.
 */

import { createView } from '../createView';
import {
  invoke,
  jsonOf,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import { publish, publishedDeclaration } from './viewSupport';

const VALIDATION_PATH = '/sap/bc/adt/ddic/ddl/validation';
const SOURCES_PATH = '/sap/bc/adt/ddic/ddl/sources';
const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

interface Scenario {
  readonly language?: string;
  /** systeminformation 왕복을 실패시킨다 (언어 폴백 갈래). */
  readonly systemInfoStatus?: number;
  readonly validationStatus?: number;
  readonly createStatus?: number;
  readonly createBody?: string;
}

function responder(scenario: Scenario = {}) {
  return ((request, response) => {
    if (request.path === SYSTEMINFO_PATH) {
      if (scenario.systemInfoStatus) {
        return xml(response, '<err/>', scenario.systemInfoStatus);
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: scenario.language ?? 'CS' }));
    }
    if (request.path === VALIDATION_PATH) {
      if (scenario.validationStatus) return xml(response, '<err/>', scenario.validationStatus);
      return xml(
        response,
        '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>',
      );
    }
    if (request.path === SOURCES_PATH && request.method === 'POST') {
      if (scenario.createStatus) {
        return xml(response, scenario.createBody ?? '<err/>', scenario.createStatus);
      }
      return xml(response, '<ok/>', 201);
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(createView)).toEqual(publishedDeclaration('CreateView'));
  });

  it('노출·정책 선언이 구 핸들러의 디렉터리와 맞는다', () => {
    // 구 경로 `engine/src/handlers/view/high/handleCreateView.ts` → high 집합.
    expect(createView.definition.sets).toEqual(['high']);
    expect(createView.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createView.definition.kind).toBe('mutation');
    // mutation이므로 대상-이름 선언이 필수다(녹화 사전 검사가 읽는다).
    expect(createView.definition.targetNames).toEqual(['view_name']);
  });
});

describe('시퀀스', () => {
  it('검증 → 로그온 언어 조회 → 생성 순으로 세 번 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createView, harness, {
      view_name: 'z_i_test',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${VALIDATION_PATH}`,
      `GET ${SYSTEMINFO_PATH}`,
      `POST ${SOURCES_PATH}`,
    ]);
  });

  it('생성 뒤 구문검사를 돌리지 않는다 (빈 DDL 껍데기는 언제나 무효다)', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createView, harness, { view_name: 'Z_I_TEST', package_name: '$TMP' });

    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/checkruns')).toBe(false);
  });

  it('검증 왕복의 질의 인자와 Accept가 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: 'ZOK_LAB',
      description: 'my view',
    });

    const validation = harness.nth(0);
    expect(validation.query.get('objtype')).toBe('ddls');
    expect(validation.query.get('objname')).toBe('Z_I_TEST');
    expect(validation.query.get('packagename')).toBe('ZOK_LAB');
    expect(validation.query.get('description')).toBe('my view');
    expect(validation.headers['accept']).toBe('application/vnd.sap.as+xml');
  });

  it('검증 응답 본문은 판정에 쓰이지 않는다 (구 실측 — HTTP 오류일 때만 막힌다)', async () => {
    // CHECK_RESULT가 없고 SEVERITY=ERROR인 응답을 200으로 돌려줘도 생성은 계속된다.
    // CreateProgram과 갈리는 자리이므로, 여기에 파싱을 더하면 구와 달라진다.
    harness = await startWriteHarness(((request, response) => {
      if (request.path === VALIDATION_PATH) {
        return xml(
          response,
          '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>Object already exists</SHORT_TEXT></DATA></asx:values></asx:abap>',
        );
      }
      if (request.path === SYSTEMINFO_PATH) {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        return response.end(JSON.stringify({ language: 'EN' }));
      }
      return xml(response, '<ok/>', 201);
    }) as Parameters<typeof startWriteHarness>[0]);

    const result = await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.path === SOURCES_PATH)).toBe(true);
  });
});

describe('생성 페이로드', () => {
  it('DDLS/DF 타입과 조회된 마스터 언어를 싣는다', async () => {
    harness = await startWriteHarness(responder({ language: 'CS' }));
    await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
      description: 'my view',
    });

    const create = harness.nth(2);
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.ddlSource+xml');
    expect(create.headers['accept']).toBe(
      'application/vnd.sap.adt.ddlSource.v2+xml, application/vnd.sap.adt.ddlSource+xml',
    );
    expect(create.body).toContain('adtcore:type="DDLS/DF"');
    expect(create.body).toContain('adtcore:name="Z_I_TEST"');
    expect(create.body).toContain('adtcore:language="CS"');
    expect(create.body).toContain('adtcore:masterLanguage="CS"');
    expect(create.body).toContain('adtcore:description="my view"');
    expect(create.body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
  });

  it('뷰 종류와 무관하게 언제나 같은 컬렉션·같은 타입으로 만든다', async () => {
    // "CDS View or Classic View"는 DDL 안에서 무엇을 정의하느냐의 이야기다.
    // 구는 두 경우 모두 DDLS 하나로 보낸다 — 클래식 전용
    // `/sap/bc/adt/ddic/views/`는 이 도구가 타지 않는 갈래다.
    harness = await startWriteHarness(responder());
    await invoke(createView, harness, { view_name: 'ZVCLASSIC', package_name: '$TMP' });

    const create = harness.nth(2);
    expect(create.path).toBe(SOURCES_PATH);
    expect(create.body).toContain('adtcore:type="DDLS/DF"');
    expect(harness.calls().some((call) => call.path.startsWith('/sap/bc/adt/ddic/views'))).toBe(
      false,
    );
  });

  it('언어 조회가 실패하면 EN으로 떨어지되 생성은 계속된다', async () => {
    harness = await startWriteHarness(responder({ systemInfoStatus: 404 }));
    const result = await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.nth(2).body).toContain('adtcore:masterLanguage="EN"');
  });

  it('설명은 생성 페이로드에서만 60자로 잘린다', async () => {
    const long = 'x'.repeat(80);
    harness = await startWriteHarness(responder());
    await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
      description: long,
    });

    // 검증 왕복은 원문, 생성 페이로드는 60자.
    expect(harness.nth(0).query.get('description')).toBe(long);
    expect(harness.nth(2).body).toContain(`adtcore:description="${'x'.repeat(60)}"`);
    expect(harness.nth(2).body).not.toContain('x'.repeat(61));
  });

  it('설명이 없으면 뷰 이름이 설명이 된다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createView, harness, { view_name: 'Z_I_TEST', package_name: '$TMP' });

    expect(harness.nth(0).query.get('description')).toBe('Z_I_TEST');
    expect(harness.nth(2).body).toContain('adtcore:description="Z_I_TEST"');
  });
});

describe('전송요청', () => {
  it('값이 있으면 corrNr로 실리고 응답에도 그대로 남는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: 'ZOK_LAB',
      transport_request: 'E19K905635',
    });

    expect(harness.nth(2).query.get('corrNr')).toBe('E19K905635');
    expect(jsonOf(result).transport_request).toBe('E19K905635');
  });

  it('공백만 든 값은 corrNr을 만들지 않는다 (구는 trim 뒤 판정한다)', async () => {
    harness = await startWriteHarness(responder());
    await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
      transport_request: '   ',
    });

    expect(harness.nth(2).query.get('corrNr')).toBeNull();
  });
});

describe('응답과 오류 갈래', () => {
  it('구와 같은 키로 싣는다 — uri는 소문자다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createView, harness, {
      view_name: 'z_i_test',
      package_name: '$TMP',
    });

    expect(jsonOf(result)).toEqual({
      success: true,
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
      transport_request: null,
      type: 'DDLS',
      message: 'View Z_I_TEST created successfully. Use UpdateView to set DDL source code.',
      uri: '/sap/bc/adt/ddic/ddl/sources/z_i_test',
      steps_completed: ['validate', 'create'],
    });
  });

  it('필수 인자가 없으면 접속을 만들지 않고 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createView, harness, { view_name: '', package_name: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Missing required parameters: view_name and package_name');
    expect(harness.calls()).toHaveLength(0);
  });

  it('검증이 HTTP 오류면 생성 요청이 나가지 않는다', async () => {
    harness = await startWriteHarness(responder({ validationStatus: 400 }));
    const result = await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(true);
    expect(harness.calls().some((call) => call.path === SOURCES_PATH)).toBe(false);
  });

  it('SAP이 돌려준 문장은 글자 그대로 보존된다', async () => {
    harness = await startWriteHarness(
      responder({
        createStatus: 400,
        createBody:
          '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceCreationFailure"/><message lang="EN">Sprache EN zum Anlegen der Beschreibung entspricht nicht Mastersprache CS</message><properties/></exc:exception>',
      }),
    );
    const result = await invoke(createView, harness, {
      view_name: 'Z_I_TEST',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      'Sprache EN zum Anlegen der Beschreibung entspricht nicht Mastersprache CS',
    );
    expect(textOf(result)).toContain('400');
  });
});
