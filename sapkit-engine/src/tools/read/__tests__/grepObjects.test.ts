/**
 * GrepObjects 핸들러 계약.
 *
 * 타입마다 다른 소스 경로로 나가는지, 한 벌의 실패가 나머지의 훑기를 멈추지
 * 않는지, 그리고 나쁜 정규식이 **SAP에 한 바이트도 나가기 전에** 걸리는지.
 */

import { grepObjects } from '../grepObjects';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

interface Aggregate {
  total_matches: number;
  truncated: boolean;
  results: Array<{
    object_type: string;
    object_name: string;
    matches: Array<{ line: number; text: string; context_before: string[]; context_after: string[] }>;
  }>;
  skipped: Array<{ object: string; reason: string }>;
}

describe('GrepObjects', () => {
  it('타입별 소스 경로로 GET을 보내고 일치 줄을 모아 준다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      {
        objects: [
          { object_type: 'CLAS', object_name: 'zcl_a' },
          { object_type: 'INCL', object_name: 'zincl_b' },
        ],
        pattern: 'SELECT',
      },
      (request) =>
        request.url.includes('/oo/classes/')
          ? { body: 'CLASS zcl_a DEFINITION.\n  SELECT * FROM mara.\nENDCLASS.' }
          : { body: 'no hits here' },
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_A/source/main?version=active`,
      `GET ${TEST_ORIGIN}/sap/bc/adt/programs/includes/ZINCL_B/source/main`,
    ]);

    expect(outcome.isError).toBe(false);
    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.results).toEqual([
      {
        object_type: 'CLAS',
        object_name: 'zcl_a',
        matches: [
          { line: 2, text: '  SELECT * FROM mara.', context_before: [], context_after: [] },
        ],
      },
    ]);
    expect(aggregate.skipped).toEqual([]);
  });

  it('FUGR는 함수그룹 경로로, FUNC는 훑지 않고 이유를 남긴다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      {
        objects: [
          { object_type: 'FUGR', object_name: 'zfg_a' },
          { object_type: 'FUNC', object_name: 'z_fm_a' },
        ],
        pattern: 'anything',
      },
      () => ({ body: '' }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/functions/groups/ZFG_A`);

    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.skipped).toEqual([
      {
        object: 'FUNC z_fm_a',
        reason:
          'Function module source requires both function_module_name and function_group_name; not resolvable from object_name alone. Use object_type "FUGR" with the function group name to search the whole group instead.',
      },
    ]);
  });

  it('한 벌을 못 읽어도 나머지는 계속 훑는다', async () => {
    const { outcome } = await runTool(
      grepObjects,
      {
        objects: [
          { object_type: 'CLAS', object_name: 'zcl_missing' },
          { object_type: 'PROG', object_name: 'zprog_ok' },
        ],
        pattern: 'WRITE',
      },
      (request) =>
        request.url.includes('zcl_missing') || request.url.includes('ZCL_MISSING')
          ? { status: 404, body: '' }
          : { body: "REPORT zprog_ok.\nWRITE 'x'." },
    );

    const aggregate = JSON.parse(outcome.text) as Aggregate;
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.results[0]?.object_name).toBe('zprog_ok');
    expect(aggregate.skipped[0]?.object).toBe('CLAS zcl_missing');
    expect(aggregate.skipped[0]?.reason).toMatch(/^Failed to fetch source: /);
  });

  it('나쁜 정규식은 접속을 얻기 전에 거절된다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      { objects: [{ object_type: 'CLAS', object_name: 'zcl_a' }], pattern: '([unclosed' },
      () => ({ body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Invalid regex pattern "\(\[unclosed": /);
    expect(requests).toHaveLength(0);
  });

  it('빈 objects 배열은 인자 오류다', async () => {
    const { outcome, requests } = await runTool(
      grepObjects,
      { objects: [], pattern: 'x' },
      () => ({ body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('objects must be a non-empty array (1-50 entries)');
    expect(requests).toHaveLength(0);
  });
});
