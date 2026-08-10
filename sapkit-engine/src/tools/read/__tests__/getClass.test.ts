/**
 * GetClass 핸들러 계약 — 소스 읽기와 의존 문맥.
 */

import { getClass } from '../getClass';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const CLASS_SOURCE = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo_helper TYPE REF TO zcl_helper.
  PRIVATE SECTION.
    DATA mv_x TYPE i.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
ENDCLASS.`;

interface Payload {
  success: boolean;
  class_name: string;
  version: string;
  source_code: string;
  status: number;
  status_text: string;
  dependency_context?: string;
}

describe('GetClass', () => {
  it('활성 판을 구와 같은 경로·질의 인자로 읽는다', async () => {
    const { outcome, requests } = await runTool(getClass, { class_name: 'zcl_test' }, () => ({
      body: CLASS_SOURCE,
    }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/source/main?version=active`,
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      source_code: CLASS_SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });

  it('version=inactive는 질의 인자로 그대로 나간다', async () => {
    const { requests } = await runTool(
      getClass,
      { class_name: 'zcl_test', version: 'inactive' },
      () => ({ body: CLASS_SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/source/main?version=inactive`,
    );
  });

  it('with_context는 참조 클래스의 공개 계약만 접어 덧붙인다', async () => {
    const helperSource = `CLASS zcl_helper DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
  PRIVATE SECTION.
    DATA mv_secret TYPE i.
ENDCLASS.
CLASS zcl_helper IMPLEMENTATION.
  METHOD run.
    WRITE 'body that must not leak into the contract'.
  ENDMETHOD.
ENDCLASS.`;

    const { outcome, requests } = await runTool(
      getClass,
      { class_name: 'zcl_test', with_context: true },
      (request) => ({ body: request.url.includes('ZCL_HELPER') ? helperSource : CLASS_SOURCE }),
    );

    expect(requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/source/main?version=active`,
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_HELPER/source/main?version=active`,
    ]);

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.dependency_context).toContain('* ----- CLASS: ZCL_HELPER -----');
    expect(payload.dependency_context).toContain('METHODS run.');
    expect(payload.dependency_context).not.toContain('must not leak');
  });

  it('의존을 못 읽어도 본 읽기는 성공한다', async () => {
    const { outcome } = await runTool(
      getClass,
      { class_name: 'zcl_test', with_context: true },
      (request) =>
        request.url.includes('ZCL_HELPER') ? { status: 404, body: '' } : { body: CLASS_SOURCE },
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.success).toBe(true);
    expect(payload.dependency_context).toContain('* ZCL_HELPER (class): not found');
  });

  it('404는 구와 같은 문구로 보고된다', async () => {
    const { outcome } = await runTool(getClass, { class_name: 'zcl_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Class ZCL_TEST not found.');
  });

  it('423(다른 사용자 잠금)도 구와 같은 문구다', async () => {
    const { outcome } = await runTool(getClass, { class_name: 'zcl_test' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.text).toBe('Error: Class ZCL_TEST is locked by another user.');
  });
});
