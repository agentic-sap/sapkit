/**
 * `GetClassMethod` — 발행 계약 · 와이어 · 경계 탐지 · 갈래.
 *
 * 경계 탐지의 기대값은 **구 엔진 자신의 단위 시험**에서 뽑았다
 * (`engine/src/__tests__/unit/abapMethodBoundaries.test.ts`). 그 파일이 이
 * 로직의 사실상 계약 정본이므로, 내 구현의 독해가 아니라 거기 적힌 기대를
 * 옮긴다 — 자기확인을 피하는 자리가 여기다.
 */

import { getClassMethod } from '../getClassMethod';
import {
  extractMethodSource,
  findMethodBoundary,
  listMethodImplementations,
} from '../internal/abapMethods';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const SOURCE_URL = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/source/main?version=active`;

const CLASS_SOURCE = [
  'CLASS zcl_test IMPLEMENTATION.',
  '  METHOD get_data.',
  '    DATA(lv_x) = 1.',
  '  ENDMETHOD.',
  '  METHOD put_data.',
  '    RETURN.',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

interface Payload {
  class_name: string;
  method_name: string;
  start_line: number;
  end_line: number;
  total_class_lines: number;
  source: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getClassMethod);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetClassMethod'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 채록본의 4집합 소속에 맞춘다', () => {
    expect(getClassMethod.definition.sets).toEqual(['readonly']);
    expect(getClassMethod.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getClassMethod.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('클래스 소스 한 벌을 활성 판으로 한 번만 읽는다', async () => {
    const { requests } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: 'get_data' },
      () => ({ body: CLASS_SOURCE }),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(SOURCE_URL);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
  });

  it('version 인자가 없다 — 언제나 활성 판이다', async () => {
    // 구 핸들러는 read({className}, 'active')로 고정해 부른다.
    const { requests } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: 'get_data', version: 'inactive' },
      () => ({ body: CLASS_SOURCE }),
    );

    expect(toolRequests(requests)[0]?.url).toBe(SOURCE_URL);
  });
});

describe('응답', () => {
  it('메서드 한 덩이만 줄번호와 함께 돌려준다', async () => {
    const { outcome } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: 'GET_DATA' },
      () => ({ body: CLASS_SOURCE }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      class_name: 'ZCL_TEST',
      // 이름은 **소스에 선언된 대소문자 그대로** 돌아온다 (인자 대문자가 아니다).
      method_name: 'get_data',
      start_line: 2,
      end_line: 4,
      total_class_lines: 8,
      source: ['  METHOD get_data.', '    DATA(lv_x) = 1.', '  ENDMETHOD.'].join('\n'),
    });
  });
});

describe('갈래', () => {
  it('인자가 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: '' },
      () => ({ body: CLASS_SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: class_name and method_name are required');
    expect(toolRequests(requests)).toHaveLength(0);
  });

  it('클래스가 없으면(404) 구와 같은 문구다', async () => {
    const { outcome } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: 'get_data' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Class ZCL_TEST not found');
  });

  it('메서드가 없으면 있는 메서드 목록을 함께 알려 준다', async () => {
    const { outcome } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: 'nope' },
      () => ({ body: CLASS_SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Method "nope" not found in class ZCL_TEST. Available methods: get_data, put_data',
    );
  });

  it('구현이 하나도 없으면 목록 자리에 (none found)를 적는다', async () => {
    const { outcome } = await runTool(
      getClassMethod,
      { class_name: 'zcl_test', method_name: 'nope' },
      () => ({ body: 'CLASS zcl_test DEFINITION PUBLIC.\nENDCLASS.' }),
    );

    expect(outcome.text).toBe(
      'Error: Method "nope" not found in class ZCL_TEST. Available methods: (none found)',
    );
  });
});

/**
 * 경계 탐지 — 기대값의 출처는 구 엔진의 단위 시험
 * `engine/src/__tests__/unit/abapMethodBoundaries.test.ts`다.
 */
describe('METHOD…ENDMETHOD 경계 탐지 (구 단위 시험의 기대를 옮김)', () => {
  it('이름 대조는 대소문자를 가리지 않고, 이름은 선언된 대로 돌려준다', () => {
    const source = ['METHOD Get_Data.', '  RETURN.', 'ENDMETHOD.'].join('\n');
    expect(findMethodBoundary(source, 'GET_DATA')).toEqual({
      name: 'Get_Data',
      startLine: 1,
      endLine: 3,
    });
  });

  it('여러 구현의 범위를 각각 잡는다', () => {
    const source = [
      'CLASS zcl_foo IMPLEMENTATION.',
      '  METHOD first.',
      '    DATA(lv_a) = 1.',
      '  ENDMETHOD.',
      '  METHOD second.',
      '    DATA(lv_b) = 2.',
      '    DATA(lv_c) = 3.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');

    expect(listMethodImplementations(source)).toEqual([
      { name: 'first', startLine: 2, endLine: 4 },
      { name: 'second', startLine: 5, endLine: 8 },
    ]);
  });

  it('인터페이스 구현(틸데)과 네임스페이스 접두사를 이름으로 인정한다', () => {
    const tilde = [
      'CLASS zcl_foo IMPLEMENTATION.',
      '  METHOD zif_foo~bar.',
      '    RETURN.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(findMethodBoundary(tilde, 'zif_foo~bar')).toEqual({
      name: 'zif_foo~bar',
      startLine: 2,
      endLine: 4,
    });

    const namespaced = [
      'CLASS zcl_foo IMPLEMENTATION.',
      '  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.',
      '    RETURN.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(
      findMethodBoundary(namespaced, '/iwbep/if_mgw_appl_srv_runtime~get_entityset'),
    ).toEqual({
      name: '/iwbep/if_mgw_appl_srv_runtime~get_entityset',
      startLine: 2,
      endLine: 4,
    });

    const nsMethod = [
      'CLASS /ns1/cl_foo IMPLEMENTATION.',
      '  METHOD /ns1/get_data.',
      '    RETURN.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(findMethodBoundary(nsMethod, '/ns1/get_data')).toEqual({
      name: '/ns1/get_data',
      startLine: 2,
      endLine: 4,
    });
  });

  it('주석에만 나타나는 이름은 잡지 않는다', () => {
    const source = [
      '* METHOD fake_method.',
      '  " METHOD another_fake.',
      '  METHOD real_method. " METHOD trailing_comment_fake.',
      '    RETURN.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');

    expect(findMethodBoundary(source, 'fake_method')).toBeNull();
    expect(findMethodBoundary(source, 'another_fake')).toBeNull();
    expect(findMethodBoundary(source, 'trailing_comment_fake')).toBeNull();
    expect(findMethodBoundary(source, 'real_method')).toEqual({
      name: 'real_method',
      startLine: 3,
      endLine: 5,
    });
  });

  it('문자열 리터럴 안의 METHOD·ENDMETHOD는 경계가 아니다', () => {
    const source = [
      '  METHOD real_method.',
      "    lv_text = 'METHOD fake_in_string.'.",
      '  ENDMETHOD.',
      '  METHOD fake_in_string.',
      '    RETURN.',
      '  ENDMETHOD.',
    ].join('\n');

    expect(findMethodBoundary(source, 'real_method')).toEqual({
      name: 'real_method',
      startLine: 1,
      endLine: 3,
    });
    // 리터럴 쪽이 아니라 뒤에 실제로 선언된 구현이 잡혀야 한다.
    expect(findMethodBoundary(source, 'fake_in_string')).toEqual({
      name: 'fake_in_string',
      startLine: 4,
      endLine: 6,
    });

    const endInString = [
      '  METHOD real_method.',
      "    lv_text = 'not the real ENDMETHOD.'.",
      '    DATA(lv_y) = 1.',
      '  ENDMETHOD.',
    ].join('\n');
    expect(findMethodBoundary(endInString, 'real_method')).toEqual({
      name: 'real_method',
      startLine: 1,
      endLine: 4,
    });
  });

  it('AMDP의 BY DATABASE PROCEDURE 부가어는 한 줄이든 여러 줄이든 삼킨다', () => {
    const oneLine = [
      'CLASS zcl_foo IMPLEMENTATION.',
      '  METHOD get_data BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT USING t001.',
      '    lt_result = select * from t001;',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(findMethodBoundary(oneLine, 'get_data')).toEqual({
      name: 'get_data',
      startLine: 2,
      endLine: 4,
    });

    const multiLine = [
      'CLASS zcl_foo IMPLEMENTATION.',
      '  METHOD get_data',
      '    BY DATABASE PROCEDURE',
      '    FOR HDB LANGUAGE SQLSCRIPT',
      '    USING t001.',
      '    lt_result = select * from t001;',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(findMethodBoundary(multiLine, 'get_data')).toEqual({
      name: 'get_data',
      startLine: 2,
      endLine: 7,
    });
  });

  it('찾은 경계의 줄만 그대로 잘라 낸다', () => {
    const source = [
      'CLASS zcl_foo IMPLEMENTATION.',
      '  METHOD get_data.',
      '    DATA(lv_x) = 1.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    const boundary = findMethodBoundary(source, 'get_data');
    if (boundary === null) throw new Error('픽스처 오류: get_data를 못 찾았다');

    expect(extractMethodSource(source, boundary)).toBe(
      ['  METHOD get_data.', '    DATA(lv_x) = 1.', '  ENDMETHOD.'].join('\n'),
    );
  });

  it('CRLF·CR 줄바꿈도 같은 줄번호로 센다', () => {
    const source = ['METHOD get_data.', '  RETURN.', 'ENDMETHOD.'].join('\r\n');
    expect(findMethodBoundary(source, 'get_data')).toEqual({
      name: 'get_data',
      startLine: 1,
      endLine: 3,
    });
  });
});
