/**
 * CreateInclude — 생성 → (메인 프로그램에 INCLUDE 문 삽입) → (인라인 소스) →
 * 프로그램 트리 검사.
 *
 * 구 핸들러(`engine/src/handlers/include/high/handleCreateInclude.ts`)의 URI
 * 대소문자 규칙(contextUri·containerRef는 소문자, 메인 프로그램 조작은 대문자)을
 * 그대로 옮겼는지 본다.
 */

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
import { createInclude } from '../createInclude';

const MAIN_BASE = '/sap/bc/adt/programs/programs/ZMAIN';
const INC_BASE = '/sap/bc/adt/programs/includes/ZINC01';
const MAIN_SOURCE = 'REPORT zmain.\n\nINCLUDE zold.\n\nSTART-OF-SELECTION.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { check?: string; createStatus?: number; mainSource?: string } = {}) {
  return ((request, response) => {
    if (request.path === '/sap/bc/adt/programs/includes' && request.method === 'POST') {
      if (scenario.createStatus) return xml(response, '<err/>', scenario.createStatus);
      return xml(response, '<include/>', 201);
    }
    if (request.path === `${MAIN_BASE}/source/main` && request.method === 'GET') {
      return plainText(response, scenario.mainSource ?? MAIN_SOURCE);
    }
    if (request.path === `${MAIN_BASE}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === MAIN_BASE || request.path === INC_BASE) {
      if (request.query.get('_action') === 'LOCK') return xml(response, lockBody('L1'));
      if (request.query.get('_action') === 'UNLOCK') return xml(response, '<ok/>');
    }
    if (request.path === `${INC_BASE}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, activationBody());
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, scenario.check ?? cleanCheckRun());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('CreateInclude', () => {
  it('생성 POST의 질의와 본문이 구와 같다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createInclude, harness, {
      include_name: 'zinc01',
      main_program: 'zmain',
      package_name: 'ZOK_LAB',
      transport_request: 'E19K9',
      insert_into_main: false,
    });

    expect(result.isError).toBe(false);
    const create = harness.nth(0);
    expect(create.method).toBe('POST');
    expect(create.path).toBe('/sap/bc/adt/programs/includes');
    expect(create.query.get('corrNr')).toBe('E19K9');
    expect(create.query.get('contextUri')).toBe('/sap/bc/adt/programs/programs/zmain');
    expect(create.headers['content-type']).toBe('application/vnd.sap.adt.programs.includes+xml');
    expect(create.body).toContain('adtcore:name="ZINC01"');
    expect(create.body).toContain('adtcore:type="PROG/I"');
    expect(create.body).toContain('<adtcore:packageRef adtcore:name="ZOK_LAB"/>');
    expect(create.body).toContain(
      '<adtcore:containerRef adtcore:uri="/sap/bc/adt/programs/programs/zmain" adtcore:type="PROG/P" adtcore:name="ZMAIN"/>',
    );

    const payload = jsonOf(result);
    expect(payload.include_name).toBe('ZINC01');
    expect(payload.type).toBe('PROG/I');
    expect(payload.activated).toBe(false);
    expect(payload.uri).toBe('/sap/bc/adt/programs/includes/zinc01');
    expect(payload.steps_completed).toEqual(['create', 'check_new_code']);
  });

  it('기본값으로 메인 프로그램에 INCLUDE 문을 넣고 활성화까지 한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createInclude, harness, {
      include_name: 'ZINC01',
      main_program: 'ZMAIN',
      package_name: '$TMP',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /sap/bc/adt/programs/includes',
      `GET ${MAIN_BASE}/source/main`,
      `POST ${MAIN_BASE}`,
      `PUT ${MAIN_BASE}/source/main`,
      `POST ${MAIN_BASE}`,
      'POST /sap/bc/adt/activation',
      'POST /sap/bc/adt/checkruns',
    ]);

    const put = harness.nth(3);
    // 마지막 INCLUDE 문 바로 뒤에 소문자로 삽입된다.
    expect(put.body).toBe('REPORT zmain.\n\nINCLUDE zold.\nINCLUDE zinc01.\n\nSTART-OF-SELECTION.\n');
    expect(jsonOf(result).steps_completed).toEqual([
      'create',
      'insert_into_main',
      'activate_main',
      'check_new_code',
    ]);
  });

  it('activate_main_program=false면 메인 활성화를 미룬다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createInclude, harness, {
      include_name: 'ZINC01',
      main_program: 'ZMAIN',
      package_name: '$TMP',
      activate_main_program: false,
      skip_program_tree_check: true,
    });
    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result).steps_completed).toEqual([
      'create',
      'insert_into_main',
      'skip_activate_main',
      'skip_program_tree_check',
    ]);
  });

  it('이미 INCLUDE 문이 있으면 메인을 건드리지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ mainSource: 'REPORT zmain.\nINCLUDE zinc01.\n' }),
    );
    const result = await invoke(createInclude, harness, {
      include_name: 'ZINC01',
      main_program: 'ZMAIN',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    expect(jsonOf(result).steps_completed).toContain('skip_insert_already_present');
  });

  it('source_code를 주면 새 인클루드를 잠그고 써 넣지만 활성화하지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createInclude, harness, {
      include_name: 'ZINC01',
      main_program: 'ZMAIN',
      package_name: '$TMP',
      insert_into_main: false,
      source_code: '* body\n',
      skip_program_tree_check: true,
    });
    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /sap/bc/adt/programs/includes',
      `POST ${INC_BASE}`,
      `PUT ${INC_BASE}/source/main`,
      `POST ${INC_BASE}`,
    ]);
    expect(harness.nth(2).body).toBe('* body\n');
    const payload = jsonOf(result);
    expect(payload.source_written).toBe(true);
    expect(payload.activated).toBe(false);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('생성 자체가 409면 이미 존재한다고 알린다', async () => {
    harness = await startWriteHarness(responder({ createStatus: 409 }));
    const result = await invoke(createInclude, harness, {
      include_name: 'ZINC01',
      main_program: 'ZMAIN',
      package_name: '$TMP',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('already exists');
  });

  it('프로그램 트리 검사가 실패하면 되돌릴 수 없다는 사실과 함께 실패를 보고한다', async () => {
    harness = await startWriteHarness(
      responder({ check: failingCheckRun('Type ZTY is unknown', '5') }),
    );
    const result = await invoke(createInclude, harness, {
      include_name: 'ZINC01',
      main_program: 'ZMAIN',
      package_name: '$TMP',
      insert_into_main: false,
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('Type ZTY is unknown');
    expect(text).toContain('DeleteInclude');
  });

  it('필수 인자가 없으면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(createInclude, harness, { include_name: 'ZINC01' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Missing required parameters');
    expect(harness.calls()).toHaveLength(0);
  });
});
