/**
 * GetInclude 핸들러 계약 — 소스를 감싸지 않고 그대로 돌려준다.
 */

import { classIncludeRefusal, getInclude } from '../getInclude';
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

// ── D148 — 클래스 인클루드는 요청 전에 거절하고 읽는 도구를 이름으로 말한다 ──

describe('D148 — 클래스 인클루드(CCIMP 등)는 이 경로가 아니다', () => {
  const CCIMP = 'ZCL_UNIVAT_BSET_EDIT==========CCIMP';

  it('=로 채운 CCIMP 이름은 접속 전에 거절되고 GetLocalTypes를 가리킨다 (구는 HTTP 500을 그대로 올렸다)', async () => {
    const { outcome, requests } = await runTool(getInclude, { include_name: CCIMP }, () => ({
      status: 500,
      body: '<exc:exception xmlns:exc="http://www.sap.com/adt/core"><message>boom</message></exc:exception>',
    }));

    expect(requests).toHaveLength(0);
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('class include of ZCL_UNIVAT_BSET_EDIT (CCIMP)');
    expect(outcome.text).toContain('GetLocalTypes');
    expect(outcome.text).not.toContain('HTTP 500 [');
  });

  it('접미사마다 읽는 도구가 다르다', () => {
    expect(classIncludeRefusal('ZCL_X====CCDEF')).toContain('GetLocalDefinitions');
    expect(classIncludeRefusal('ZCL_X====CCMAC')).toContain('GetLocalMacros');
    expect(classIncludeRefusal('zcl_x====ccau')).toContain('GetLocalTestClass');
    // 섹션·메서드 인클루드는 클래스 본체로 안내한다.
    expect(classIncludeRefusal('ZCL_X====CU')).toContain('ReadClass or GetClass');
    expect(classIncludeRefusal('ZCL_X====CM001')).toContain('ReadClass or GetClass');
  });

  it('독립 인클루드 이름은 거절 대상이 아니다 (과수리 역검증)', () => {
    expect(classIncludeRefusal('ZUNIVR5140_F02')).toBeNull();
    expect(classIncludeRefusal('LZFGTOP')).toBeNull();
    expect(classIncludeRefusal('/NS/ZINCL')).toBeNull();
    // `=` 없이 CCIMP로 끝나기만 하는 이름은 클래스 인클루드가 아니다.
    expect(classIncludeRefusal('ZINCL_CCIMP')).toBeNull();
  });
});
