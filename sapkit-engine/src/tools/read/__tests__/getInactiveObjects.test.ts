/**
 * GetInactiveObjects 핸들러 계약.
 */

import { getInactiveObjects } from '../getInactiveObjects';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const INACTIVE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ioc:inactiveObjects xmlns:ioc="http://www.sap.com/adt/ioc" xmlns:adtcore="http://www.sap.com/adt/core">
  <ioc:entry>
    <ioc:object>
      <ioc:ref adtcore:name="ZCL_PENDING" adtcore:type="CLAS/OC"/>
    </ioc:object>
  </ioc:entry>
  <ioc:entry>
    <ioc:object>
      <ioc:ref adtcore:name="ZTAB_PENDING" adtcore:type="TABL/DT"/>
    </ioc:object>
  </ioc:entry>
</ioc:inactiveObjects>`;

describe('GetInactiveObjects', () => {
  it('활성화 대기 목록 엔드포인트를 GET으로 읽고 표로 접는다', async () => {
    const { outcome, requests } = await runTool(getInactiveObjects, {}, () => ({
      body: INACTIVE_XML,
    }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/activation/inactiveobjects`);

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      count: 2,
      objects: [
        { type: 'CLAS/OC', name: 'ZCL_PENDING' },
        { type: 'TABL/DT', name: 'ZTAB_PENDING' },
      ],
    });
  });

  it('대기 중인 것이 없으면 빈 목록이다', async () => {
    const { outcome } = await runTool(getInactiveObjects, {}, () => ({
      body: '<?xml version="1.0"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/adt/ioc"/>',
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({ success: true, count: 0, objects: [] });
  });

  it('ADT 실패는 오류로 보고된다', async () => {
    const { outcome } = await runTool(getInactiveObjects, {}, () => ({ status: 500, body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: /);
    expect(outcome.text).toContain('HTTP 500');
  });
});
