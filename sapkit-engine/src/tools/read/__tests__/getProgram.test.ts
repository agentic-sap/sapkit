/**
 * GetProgram 핸들러 계약.
 */

import { getProgram } from '../getProgram';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const PROGRAM_SOURCE = "REPORT zprog_test.\nWRITE 'hello'.";

describe('GetProgram', () => {
  it('활성 판을 구와 같은 경로·질의 인자로 읽는다', async () => {
    const { outcome, requests } = await runTool(
      getProgram,
      { program_name: 'zprog_test' },
      () => ({ body: PROGRAM_SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/programs/programs/ZPROG_TEST/source/main?version=active`,
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      program_name: 'ZPROG_TEST',
      version: 'active',
      program_data: PROGRAM_SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });

  it('with_context는 참조 클래스 계약을 덧붙인다', async () => {
    const source = "REPORT zprog_test.\nDATA lo TYPE REF TO zcl_helper.";
    const helper = 'CLASS zcl_helper DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.';

    const { outcome, requests } = await runTool(
      getProgram,
      { program_name: 'zprog_test', with_context: true },
      (request) => ({ body: request.url.includes('ZCL_HELPER') ? helper : source }),
    );

    expect(requests).toHaveLength(2);
    const payload = JSON.parse(outcome.text) as { dependency_context?: string };
    expect(payload.dependency_context).toContain('* ----- CLASS: ZCL_HELPER -----');
  });

  it('404는 구와 같은 문구로 보고된다', async () => {
    const { outcome } = await runTool(getProgram, { program_name: 'zprog_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Program ZPROG_TEST not found.');
  });
});
