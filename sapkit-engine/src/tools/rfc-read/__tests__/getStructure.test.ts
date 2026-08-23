/**
 * `GetStructure` — 두 경로 전부.
 *
 * 대조 원본은 `engine/src/handlers/structure/high/handleGetStructure.ts`다.
 * `GetTable`과 같은 몸통을 쓰지만 세 가지가 다르다: 인자 이름(`structure_name`),
 * 응답 필드 이름(`structure_name`·`structure_data`), ADT 경로 조각(`structures`).
 * **ECC 우회로는 같은 FM 하나**를 부른다 — `ZSAPKIT_ADT_DDIC_TABL_READ`가 투명
 * 테이블과 구조를 TABCLASS로 갈라 처리한다(구 `:57-59` 주석).
 */

import { getStructure } from '../getStructure';
import {
  type BridgeServer,
  call,
  fakeProfile,
  harness,
  jsonOf,
  startBridge,
  textOf,
} from './support';

const SOURCE = 'define structure zst_demo {\n  field1 : abap.char(10);\n}\n';

const bridges: BridgeServer[] = [];

afterEach(async () => {
  while (bridges.length > 0) {
    const bridge = bridges.pop();
    if (bridge) await bridge.close();
  }
});

describe('GetStructure — ADT 직통', () => {
  it('structures 엔드포인트를 GET 한다', async () => {
    const h = harness({ adtSteps: [{ status: 200, body: SOURCE }] });
    await call(getStructure, h.context, { structure_name: 'zst_demo', version: 'active' });

    expect(h.adtCalls).toHaveLength(1);
    expect(h.adtCalls[0]?.url).toBe(
      'https://sap.example.test:44300/sap/bc/adt/ddic/structures/ZST_DEMO/source/main?version=active',
    );
  });

  it('응답 JSON은 structure_* 이름을 쓴다', async () => {
    const h = harness({ adtSteps: [{ status: 200, statusText: 'OK', body: SOURCE }] });
    const result = await call(getStructure, h.context, { structure_name: 'ZST_DEMO' });

    expect(result.isError).toBe(false);
    expect(jsonOf(result)).toEqual({
      success: true,
      structure_name: 'ZST_DEMO',
      version: 'active',
      structure_data: SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });

  it('오류 문구도 structure 어휘를 쓴다', async () => {
    const missing = harness({ adtSteps: [{ status: 404, statusText: 'Not Found', body: '' }] });
    expect(textOf(await call(getStructure, missing.context, { structure_name: 'ZST' }))).toBe(
      'Failed to read structure: Structure ZST not found',
    );

    const locked = harness({ adtSteps: [{ status: 423, statusText: 'Locked', body: '' }] });
    expect(textOf(await call(getStructure, locked.context, { structure_name: 'ZST' }))).toBe(
      'Structure ZST is locked by another user.',
    );

    const broken = harness({ adtSteps: [{ status: 500, statusText: 'Oops', body: 'boom' }] });
    expect(textOf(await call(getStructure, broken.context, { structure_name: 'ZST' }))).toMatch(
      /^Failed to read structure: /,
    );
  });

  it('빈 이름은 접속을 얻기 전에 거부된다', async () => {
    const h = harness();
    const result = await call(getStructure, h.context, { structure_name: '' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('structure_name is required');
    expect(h.connectionCalls.count).toBe(0);
  });
});

describe('GetStructure — ECC 우회로', () => {
  it('테이블과 같은 FM 하나를 부르고 structure_* 이름으로 답한다', async () => {
    const bridge = await startBridge({
      EV_SUBRC: 0,
      EV_MESSAGE: 'STRU ZST_DEMO: 1 field(s), tabclass=INTTAB',
      EV_RESULT: '{"name":"ZST_DEMO","kind":"STRU","tabclass":"INTTAB"}',
    });
    bridges.push(bridge);

    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });
    const result = await call(getStructure, h.context, { structure_name: 'ZST_DEMO' });

    expect(h.adtCalls).toHaveLength(0);
    expect(bridge.requests[1]?.url).toContain(
      'DdicTablRead?IV_NAME=%27ZST_DEMO%27&IV_VERSION=%27A%27',
    );
    expect(jsonOf(result)).toEqual({
      success: true,
      structure_name: 'ZST_DEMO',
      version: 'active',
      structure_data: '{"name":"ZST_DEMO","kind":"STRU","tabclass":"INTTAB"}',
      status: 200,
      status_text: 'OK',
      path: 'ecc-odata-rfc',
    });
  });

  it('subrc != 0의 문구는 테이블과 같은 계약 문자열이다', async () => {
    const bridge = await startBridge({
      EV_SUBRC: 4,
      EV_MESSAGE: 'Structure ZNOPE not found',
      EV_RESULT: '',
    });
    bridges.push(bridge);

    const h = harness({
      profile: fakeProfile({ sapVersion: 'ECC' }),
      env: { SAP_RFC_ODATA_SERVICE_URL: bridge.serviceUrl },
    });
    const result = await call(getStructure, h.context, { structure_name: 'ZNOPE' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('ZSAPKIT_ADT_DDIC_TABL_READ subrc=4: Structure ZNOPE not found');
  });
});
