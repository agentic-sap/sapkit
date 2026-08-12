/**
 * GetSourceDiff 핸들러 계약.
 */

import { getSourceDiff } from '../getSourceDiff';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

describe('GetSourceDiff', () => {
  it('두 오브젝트의 활성 소스를 읽어 통합 diff를 만든다', async () => {
    const { outcome, requests } = await runTool(
      getSourceDiff,
      {
        object_type_a: 'CLAS',
        object_name_a: 'zcl_a',
        object_type_b: 'CLAS',
        object_name_b: 'zcl_b',
      },
      (request) => ({
        body: request.url.includes('ZCL_A') ? 'line1\nline2\nline3' : 'line1\nCHANGED\nline3',
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`).sort()).toEqual([
      `GET ${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_A/source/main?version=active`,
      `GET ${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_B/source/main?version=active`,
    ]);

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as {
      identical: boolean;
      diff: string;
      stats: { added: number; removed: number; hunks: number };
    };
    expect(payload.identical).toBe(false);
    expect(payload.stats).toEqual({ added: 1, removed: 1, hunks: 1 });
    expect(payload.diff).toContain('--- ZCL_A (CLAS)');
    expect(payload.diff).toContain('+++ ZCL_B (CLAS)');
    expect(payload.diff).toContain('-line2');
    expect(payload.diff).toContain('+CHANGED');
  });

  it('같은 소스면 identical이고 diff는 비어 있다', async () => {
    const { outcome } = await runTool(
      getSourceDiff,
      {
        object_type_a: 'PROG',
        object_name_a: 'zprog_a',
        object_type_b: 'INCL',
        object_name_b: 'zincl_b',
      },
      () => ({ body: 'same\nsame' }),
    );

    expect(JSON.parse(outcome.text)).toEqual({
      identical: true,
      diff: '',
      stats: { added: 0, removed: 0, hunks: 0 },
    });
  });

  it('INCL은 인클루드 경로로, PROG는 프로그램 경로로 읽는다', async () => {
    const { requests } = await runTool(
      getSourceDiff,
      {
        object_type_a: 'PROG',
        object_name_a: 'zprog_a',
        object_type_b: 'INCL',
        object_name_b: 'zincl_b',
      },
      () => ({ body: 'x' }),
    );

    expect(requests.map((request) => request.url).sort()).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/programs/includes/ZINCL_B/source/main`,
      `${TEST_ORIGIN}/sap/bc/adt/programs/programs/ZPROG_A/source/main?version=active`,
    ]);
  });

  it('한쪽을 못 읽으면 오류로 보고된다', async () => {
    const { outcome } = await runTool(
      getSourceDiff,
      {
        object_type_a: 'CLAS',
        object_name_a: 'zcl_missing',
        object_type_b: 'CLAS',
        object_name_b: 'zcl_b',
      },
      (request) => (request.url.includes('ZCL_MISSING') ? { status: 404, body: '' } : { body: 'x' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: /);
    expect(outcome.text).toContain('HTTP 404');
  });
});
