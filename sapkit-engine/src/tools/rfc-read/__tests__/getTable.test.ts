/**
 * `GetTable` — 두 경로 전부.
 *
 * 대조 원본은 `engine/src/handlers/table/high/handleGetTable.ts`다.
 * 갈림은 `SAP_VERSION`이 `ECC`인가 하나뿐이고(구 `:69`), 그때만 OData 브리지로
 * 돌아간다 — ECC 커널에는 `/sap/bc/adt/ddic/tables` 엔드포인트가 없기 때문이다.
 * 그 밖의 모든 값(미설정·`S4`…)은 ADT 직통이다.
 *
 * 여기서 못박는 것:
 * - 갈림 판정이 **대소문자를 가리지 않는다**
 * - ADT 경로의 와이어: `GET /sap/bc/adt/ddic/tables/{NAME}/source/main?version=…`
 * - ECC 경로가 ADT 접속을 **한 번도 만들지 않는다**(구도 그 앞에서 반환한다)
 * - 두 경로의 응답 JSON 필드 이름과 ECC의 `path: 'ecc-odata-rfc'`
 * - `ZMCP_ADT_DDIC_TABL_READ subrc=…` 문구 — 도구 응답에 실려 나가는 계약성 문자열
 */

import { getTable } from '../getTable';
import {
  type BridgeServer,
  call,
  fakeProfile,
  harness,
  jsonOf,
  startBridge,
  textOf,
} from './support';

const SOURCE = '@EndUserText.label: \'demo\'\ndefine table zfoo {\n  key mandt : mandt;\n}\n';

const bridges: BridgeServer[] = [];

afterEach(async () => {
  while (bridges.length > 0) {
    const bridge = bridges.pop();
    if (bridge) await bridge.close();
  }
});

async function bridgeFor(outputs: {
  EV_SUBRC: number;
  EV_MESSAGE: string;
  EV_RESULT: string;
}): Promise<BridgeServer> {
  const bridge = await startBridge(outputs);
  bridges.push(bridge);
  return bridge;
}

// ── ADT 직통 ────────────────────────────────────────────────────────────────

describe('GetTable — ADT 직통', () => {
  it('구와 같은 엔드포인트를 GET 한다', async () => {
    const h = harness({ adtSteps: [{ status: 200, body: SOURCE }] });
    await call(getTable, h.context, { table_name: 'ZFOO', version: 'active' });

    expect(h.adtCalls).toHaveLength(1);
    const request = h.adtCalls[0];
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe(
      'https://sap.example.test:44300/sap/bc/adt/ddic/tables/ZFOO/source/main?version=active',
    );
  });

  it('version=inactive를 그대로 싣는다', async () => {
    const h = harness({ adtSteps: [{ status: 200, body: SOURCE }] });
    await call(getTable, h.context, { table_name: 'ZFOO', version: 'inactive' });
    expect(h.adtCalls[0]?.url).toContain('?version=inactive');
  });

  it('version을 주지 않으면 active다', async () => {
    const h = harness({ adtSteps: [{ status: 200, body: SOURCE }] });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(h.adtCalls[0]?.url).toContain('?version=active');
    expect(jsonOf(result).version).toBe('active');
  });

  it('이름은 대문자로 정규화된다', async () => {
    const h = harness({ adtSteps: [{ status: 200, body: SOURCE }] });
    const result = await call(getTable, h.context, { table_name: 'zfoo' });
    expect(h.adtCalls[0]?.url).toContain('/ddic/tables/ZFOO/source/main');
    expect(jsonOf(result).table_name).toBe('ZFOO');
  });

  it('응답 JSON은 구와 같은 필드로 조립된다', async () => {
    const h = harness({ adtSteps: [{ status: 200, statusText: 'OK', body: SOURCE }] });
    const result = await call(getTable, h.context, { table_name: 'ZFOO', version: 'active' });

    expect(result.isError).toBe(false);
    expect(jsonOf(result)).toEqual({
      success: true,
      table_name: 'ZFOO',
      version: 'active',
      table_data: SOURCE,
      status: 200,
      status_text: 'OK',
    });
    // ADT 경로에는 `path` 표시가 없다 — ECC 경로만 갖는다.
    expect(Object.keys(jsonOf(result))).not.toContain('path');
    // 구는 JSON.stringify(…, null, 2)로 낸다.
    expect(textOf(result).split('\n')[1]).toBe('  "success": true,');
  });
});

// ── ADT 경로의 오류 ─────────────────────────────────────────────────────────

describe('GetTable — ADT 오류 정규화', () => {
  it('404는 "찾지 못했다"로 접힌다', async () => {
    const h = harness({ adtSteps: [{ status: 404, statusText: 'Not Found', body: '' }] });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Failed to read table: Table ZFOO not found');
  });

  it('423은 잠금 문구로 접힌다', async () => {
    const h = harness({ adtSteps: [{ status: 423, statusText: 'Locked', body: '' }] });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Table ZFOO is locked by another user.');
  });

  it('그 밖의 실패는 "Failed to read table:" 접두사를 단다', async () => {
    const h = harness({ adtSteps: [{ status: 500, statusText: 'Server Error', body: 'boom' }] });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Failed to read table: /);
  });

  it('빈 이름은 접속을 얻기 전에 거부된다', async () => {
    const h = harness();
    const result = await call(getTable, h.context, { table_name: '' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('table_name is required');
    expect(h.connectionCalls.count).toBe(0);
    expect(h.adtCalls).toHaveLength(0);
  });
});

// ── ECC 우회로 ──────────────────────────────────────────────────────────────

describe('GetTable — ECC 우회로', () => {
  it('SAP_VERSION=ECC면 브리지를 부르고 ADT 접속은 만들지 않는다', async () => {
    const bridge = await bridgeFor({
      EV_SUBRC: 0,
      EV_MESSAGE: 'TABL ZFOO: 1 field(s), tabclass=TRANSP',
      EV_RESULT: '{"name":"ZFOO","kind":"TABL"}',
    });
    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });

    const result = await call(getTable, h.context, { table_name: 'ZFOO', version: 'active' });

    expect(h.adtCalls).toHaveLength(0);
    expect(h.connectionCalls.count).toBe(0);
    expect(bridge.requests.map((entry) => entry.method)).toEqual(['GET', 'POST']);
    // 서버가 보는 것은 URL 정규화를 지난 형태다 — 작은따옴표는 `%27`이 된다.
    // 통로가 조립한 원문(`IV_NAME='ZFOO'`)은 `src/rfc/__tests__/ddic.test.ts`가 잡는다.
    expect(bridge.requests[1]?.url).toContain('DdicTablRead?IV_NAME=%27ZFOO%27&IV_VERSION=%27A%27');
  });

  it('응답은 구와 같은 모양이고 path를 단다', async () => {
    const bridge = await bridgeFor({
      EV_SUBRC: 0,
      EV_MESSAGE: 'ok',
      EV_RESULT: '{"name":"ZFOO","kind":"TABL"}',
    });
    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });

    const result = await call(getTable, h.context, { table_name: 'ZFOO', version: 'active' });

    expect(result.isError).toBe(false);
    expect(jsonOf(result)).toEqual({
      success: true,
      table_name: 'ZFOO',
      version: 'active',
      table_data: '{"name":"ZFOO","kind":"TABL"}',
      status: 200,
      status_text: 'OK',
      path: 'ecc-odata-rfc',
    });
  });

  it('version=inactive는 IV_VERSION=I로 나간다', async () => {
    const bridge = await bridgeFor({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{}' });
    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });

    const result = await call(getTable, h.context, { table_name: 'ZFOO', version: 'inactive' });

    expect(bridge.requests[1]?.url).toContain('IV_VERSION=%27I%27');
    expect(jsonOf(result).version).toBe('inactive');
  });

  it('subrc != 0은 구 문구 그대로 오류가 된다', async () => {
    const bridge = await bridgeFor({
      EV_SUBRC: 4,
      EV_MESSAGE: 'Table ZNOPE not found',
      EV_RESULT: '',
    });
    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });

    const result = await call(getTable, h.context, { table_name: 'ZNOPE' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('ZMCP_ADT_DDIC_TABL_READ subrc=4: Table ZNOPE not found');
  });

  it('subrc >= 8은 통로가 던진 문구가 그대로 나온다', async () => {
    const bridge = await bridgeFor({ EV_SUBRC: 8, EV_MESSAGE: 'DDIC read failed', EV_RESULT: '' });
    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });

    const result = await call(getTable, h.context, { table_name: 'ZFOO' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'ZMCP_ADT_DDIC_TABL_READ error (name=ZFOO, subrc=8): DDIC read failed',
    );
  });

  it('odata가 아닌 통로면 정직하게 실패한다', async () => {
    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: {
        SAP_RFC_ODATA_SERVICE_URL: 'http://127.0.0.1:1/sap/opu/odata/sap/ZMCP_ADT_SRV',
        SAP_RFC_BACKEND: 'soap',
      },
    });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('SAP_RFC_BACKEND=odata');
  });

  it('서비스 URL이 없으면 설정 오류로 알린다', async () => {
    const h = harness({ profile: fakeProfile({ sapVersion: 'ECC' }), env: {} });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('SAP_RFC_ODATA_SERVICE_URL');
  });

  it('접속 설정이 없으면 ERR_NO_CONNECTION으로 끝난다', async () => {
    const h = harness({ profile: fakeProfile({ sapVersion: 'ECC', connection: null }), env: {} });
    const result = await call(getTable, h.context, { table_name: 'ZFOO' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ERR_NO_CONNECTION');
  });
});

// ── 갈림 판정 ───────────────────────────────────────────────────────────────

describe('GetTable — 갈림 판정', () => {
  it.each(['ECC', 'ecc', 'Ecc'])('%s는 브리지로 간다', async (sapVersion) => {
    const bridge = await bridgeFor({ EV_SUBRC: 0, EV_MESSAGE: '', EV_RESULT: '{}' });
    const h = harness({
      profile: fakeProfile({ sapVersion }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });

    const result = await call(getTable, h.context, { table_name: 'ZFOO' });

    expect(h.adtCalls).toHaveLength(0);
    expect(jsonOf(result).path).toBe('ecc-odata-rfc');
  });

  // `' ECC '`가 여기 있는 것은 의도다 — 구 게이트는 `toUpperCase()`만 하고
  // **trim 하지 않는다**(`handleGetTable.ts:69`). 공백이 붙은 값은 갈리지 않는다.
  it.each([null, 'S4', 'S4_CLOUD_PUBLIC', 'ECC6', '', ' ECC '])(
    '%s는 ADT 직통이다',
    async (sapVersion) => {
      const h = harness({
        profile: fakeProfile({ sapVersion }),
        adtSteps: [{ status: 200, body: SOURCE }],
      });

      const result = await call(getTable, h.context, { table_name: 'ZFOO' });

      expect(h.adtCalls).toHaveLength(1);
      expect(Object.keys(jsonOf(result))).not.toContain('path');
    },
  );
});
