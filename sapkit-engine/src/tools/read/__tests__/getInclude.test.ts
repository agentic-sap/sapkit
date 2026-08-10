/**
 * GetInclude 핸들러 계약 — 소스를 감싸지 않고 그대로 돌려준다.
 */

import { getInclude } from '../getInclude';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const SOURCE = "REPORT zincl_test.\nWRITE 'hi'.";

describe('GetInclude', () => {
  it('구와 같은 인클루드 소스 경로로 GET을 보내고 본문을 그대로 싣는다', async () => {
    const { outcome, requests } = await runTool(
      getInclude,
      { include_name: 'ZINCL_TEST' },
      () => ({ body: SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/programs/includes/ZINCL_TEST/source/main`,
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe(SOURCE);
  });

  it('이름에 든 슬래시는 경로에서 인코딩된다', async () => {
    const { requests } = await runTool(getInclude, { include_name: '/NS/ZINCL' }, () => ({
      body: SOURCE,
    }));

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/programs/includes/%2FNS%2FZINCL/source/main`,
    );
  });

  it('없는 인클루드는 오류로 보고된다', async () => {
    const { outcome } = await runTool(getInclude, { include_name: 'ZNOPE' }, () => ({
      status: 404,
      body: '<exc:exception xmlns:exc="http://www.sap.com/adt/core"><message>not found</message></exc:exception>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('HTTP 404');
    // 구는 이 갈래에서 `Error: ` 접두사를 붙이지 않았다.
    expect(outcome.text).not.toMatch(/^Error: /);
  });
});
