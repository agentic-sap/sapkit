/**
 * SearchObject 핸들러 계약.
 *
 * 구 핸들러가 보내던 quickSearch 요청과 **같은 URL·같은 메서드**로 나가는지,
 * 그리고 "찾은 것이 없다"를 오류가 아니라 빈 결과로 답하는지를 못박는다.
 */

import { searchObject } from '../searchObject';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const SEARCH_ROOT = `${TEST_ORIGIN}/sap/bc/adt/repository/informationsystem/search`;

const TWO_HITS = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:name="ZCL_TEST_A" adtcore:type="CLAS/OC" adtcore:description="first" adtcore:packageName="ZPKG"/>
  <adtcore:objectReference adtcore:name="ZCL_TEST_B" adtcore:type="CLAS/OC" adtcore:description="second"/>
</adtcore:objectReferences>`;

describe('SearchObject', () => {
  it('구와 같은 quickSearch 요청을 보내고 참조 목록을 표로 접는다', async () => {
    const { outcome, requests } = await runTool(
      searchObject,
      { object_name: 'ZCL_TEST*' },
      () => ({ body: TWO_HITS }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${SEARCH_ROOT}?operation=quickSearch&query=ZCL_TEST*&maxResults=100`,
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as {
      results: Array<{ name: string; type: string; description: string; packageName: string }>;
      rawXML: string;
    };
    expect(payload.results).toEqual([
      { name: 'ZCL_TEST_A', type: 'CLAS/OC', description: 'first', packageName: 'ZPKG' },
      { name: 'ZCL_TEST_B', type: 'CLAS/OC', description: 'second', packageName: '' },
    ]);
    expect(payload.rawXML).toBe(TWO_HITS);
  });

  it('object_type과 maxResults가 질의 인자로 실린다', async () => {
    const { requests } = await runTool(
      searchObject,
      { object_name: 'MARA*', object_type: 'CLAS/OC', maxResults: 5 },
      () => ({ body: TWO_HITS }),
    );

    expect(requests[0]?.url).toBe(
      `${SEARCH_ROOT}?operation=quickSearch&query=MARA*&maxResults=5&objectType=CLAS%2FOC`,
    );
  });

  it('결과가 없으면 오류가 아니라 빈 결과다', async () => {
    const { outcome } = await runTool(searchObject, { object_name: 'ZNOPE*' }, () => ({
      body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences/>',
    }));

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('');
  });

  it('ADT 실패는 구와 같은 접두사로 보고된다', async () => {
    const { outcome } = await runTool(searchObject, { object_name: 'ZCL_TEST*' }, () => ({
      status: 500,
      body: '<error/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^ADT error: /);
    expect(outcome.text).toContain('HTTP 500');
  });
});
