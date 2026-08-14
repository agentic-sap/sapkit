/**
 * `UpdateClassMethod` — 발행 계약 · 와이어 · 이어붙이기 · 갈래.
 *
 * 이 도구의 안전 바닥선은 **깨진 메서드가 착지하지 않는 것**이다. 대체 블록을
 * 현재 소스에 끼운 **전체 클래스**를 쓰기 전에 구문검사하므로, 검사가 걸리면
 * PUT 자체가 나가지 않는다. 그 사실을 요청 목록으로 붙잡는다.
 */

import { updateClassMethod } from '../updateClassMethod';
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
  xml,
} from './harness';
import type { WriteHarness } from './harness';

const URI = '/sap/bc/adt/oo/classes/zcl_test';
const READ_URI = '/sap/bc/adt/oo/classes/ZCL_TEST/source/main';

const CLASS_SOURCE = [
  'CLASS zcl_test DEFINITION PUBLIC.',
  '  PUBLIC SECTION.',
  '    METHODS get_data.',
  'ENDCLASS.',
  'CLASS zcl_test IMPLEMENTATION.',
  '  METHOD get_data.',
  '    DATA(lv_x) = 1.',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const REPLACEMENT = ['METHOD get_data.', '  DATA(lv_x) = 42.', 'ENDMETHOD.'].join('\n');

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(scenario: { source?: string; check?: string; activation?: string } = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === READ_URI && request.method === 'GET') {
      return plainText(response, scenario.source ?? CLASS_SOURCE);
    }
    if (request.path === URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('CLASS-LOCK'));
    }
    if (request.path === URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      checkRuns += 1;
      return xml(response, checkRuns === 1 ? (scenario.check ?? cleanCheckRun()) : cleanCheckRun());
    }
    if (request.path === `${URI}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, scenario.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

const ARGS = { class_name: 'zcl_test', method_name: 'get_data', source: REPLACEMENT };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(updateClassMethod)).toEqual(publishedDeclaration('UpdateClassMethod'));
  });

  it('노출·정책 선언 — default 두 집합, mutation, 대상 이름 선언 필수', () => {
    expect(updateClassMethod.definition.sets).toEqual(['high']);
    expect(updateClassMethod.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateClassMethod.definition.kind).toBe('mutation');
    expect(updateClassMethod.definition.targetNames).toEqual(['class_name']);
  });
});

describe('와이어', () => {
  it('현재 소스를 대문자 경로로 먼저 읽고, 그 뒤는 UpdateClass의 사슬이다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${READ_URI}`,
      `POST ${URI}`, // LOCK
      'POST /sap/bc/adt/checkruns', // 쓰기 전 검사
      `PUT ${URI}/source/main`,
      `POST ${URI}`, // UNLOCK
      'POST /sap/bc/adt/checkruns', // 쓰기 뒤 검사
    ]);
    expect(harness.nth(0).query.get('version')).toBe('active');
  });

  it('PUT에 실리는 것은 메서드가 아니라 **이어붙인 전체 클래스**다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateClassMethod, harness, ARGS);

    const put = harness.nth(3);
    expect(put.body).toBe(
      [
        'CLASS zcl_test DEFINITION PUBLIC.',
        '  PUBLIC SECTION.',
        '    METHODS get_data.',
        'ENDCLASS.',
        'CLASS zcl_test IMPLEMENTATION.',
        'METHOD get_data.',
        '  DATA(lv_x) = 42.',
        'ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
    );
  });

  it('activate=true면 활성화까지 간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateClassMethod, harness, { ...ARGS, activate: true });

    expect(harness.calls().map((call) => call.path)).toContain('/sap/bc/adt/activation');
  });

  it('이송요청은 PUT의 corrNr로 내려간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateClassMethod, harness, { ...ARGS, transport_request: 'E19K1' });

    expect(harness.nth(3).query.get('corrNr')).toBe('E19K1');
  });
});

describe('응답', () => {
  it('바꾼 자리의 줄번호와 새 줄 수를 알려 준다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, ARGS);

    expect(jsonOf(result)).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      method_name: 'get_data',
      replaced_start_line: 6,
      replaced_end_line: 8,
      new_class_line_count: 9,
      activated: false,
      message: 'Method get_data of class ZCL_TEST updated successfully',
    });
  });

  it('활성화하면 message와 activated가 함께 바뀐다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, { ...ARGS, activate: true });
    const payload = jsonOf(result) as { activated: boolean; message: string };

    expect(payload.activated).toBe(true);
    expect(payload.message).toBe(
      'Method get_data of class ZCL_TEST updated and activated successfully',
    );
  });
});

describe('갈래', () => {
  it('인자가 비면 아무것도 읽지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, { ...ARGS, source: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('class_name, method_name, and source are required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('클래스가 없으면 읽기에서 멈춘다', async () => {
    harness = await startWriteHarness(((request, response) => {
      response.statusCode = 404;
      response.end('');
    }) as Parameters<typeof startWriteHarness>[0]);
    const result = await invoke(updateClassMethod, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Class ZCL_TEST not found');
  });

  it('메서드가 없으면 있는 이름을 알려 주고 쓰지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, { ...ARGS, method_name: 'nope' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Method "nope" not found in class ZCL_TEST. Available methods: get_data',
    );
    expect(harness.calls()).toHaveLength(1);
  });

  it('대체 블록의 이름이 어긋나면 거부한다 — 엉뚱한 메서드를 갈아 끼우지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, {
      ...ARGS,
      source: ['METHOD other_one.', 'ENDMETHOD.'].join('\n'),
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid replacement source: method name mismatch');
    expect(harness.calls()).toHaveLength(1);
  });

  it('METHOD/ENDMETHOD로 감싸지 않은 블록도 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateClassMethod, harness, {
      ...ARGS,
      source: 'DATA(lv_x) = 1.',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid replacement source:');
    expect(harness.calls()).toHaveLength(1);
  });

  it('쓰기 전 구문검사가 걸리면 PUT이 나가지 않는다 — 깨진 메서드는 착지하지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Type ZIF_X is unknown') }));
    const result = await invoke(updateClassMethod, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Type ZIF_X is unknown');
    expect(harness.calls().map((call) => call.method)).not.toContain('PUT');
  });

  it('활성화가 200에 오류를 실어 오면 성공으로 접지 않는다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Class is syntactically wrong' }]) }),
    );
    const result = await invoke(updateClassMethod, harness, { ...ARGS, activate: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Class is syntactically wrong');
  });
});
