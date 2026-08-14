/**
 * `GetInterface` — 발행 계약 · 와이어 · 의존 문맥 · 오류 갈래.
 *
 * 기대값은 전부 **구 엔진의 실측**에서 뽑았다. 특히 404 문구는 겉 핸들러가 적어
 * 둔 문장이 아니라, 안쪽 `AdtInterface.read()`가 404를 삼킨 뒤 핸들러가 자기
 * 문구를 던져 한 겹 더 감싸지는 실제 결과다(모듈 머리주석 참조).
 *
 * **`GetInterface` ↔ `ReadInterface`의 차이**는 나중에 지어진 쪽의 시험이
 * 붙잡는다 — `readInterface.test.ts`의 마지막 절.
 */

import { getInterface } from '../getInterface';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const INTERFACE_SOURCE = `INTERFACE zif_test PUBLIC.
  DATA mo_helper TYPE REF TO zcl_helper.
  METHODS run.
ENDINTERFACE.`;

interface Payload {
  success: boolean;
  interface_name: string;
  version: string;
  interface_data: string;
  status: number;
  status_text: string;
  dependency_context?: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getInterface);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetInterface'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/interface/high/` → 채록본의 `*_default` 두 조건에만
    // 뜬다(readonly 조건에는 없다) → high 집합.
    expect(getInterface.definition.sets).toEqual(['high']);
    expect(getInterface.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getInterface.definition.kind).toBe('read');
    expect(getInterface.definition.targetNames).toEqual(['interface_name']);
  });
});

describe('와이어', () => {
  it('활성 판을 구와 같은 경로·질의 인자·Accept로 읽는다', async () => {
    const { outcome, requests } = await runTool(
      getInterface,
      { interface_name: 'zif_test' },
      () => ({ body: INTERFACE_SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/interfaces/ZIF_TEST/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');
    expect(requests[0]?.body).toBeUndefined();

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      interface_name: 'ZIF_TEST',
      version: 'active',
      interface_data: INTERFACE_SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });

  it('version=inactive는 질의 인자로 그대로 나간다', async () => {
    const { requests } = await runTool(
      getInterface,
      { interface_name: 'zif_test', version: 'inactive' },
      () => ({ body: INTERFACE_SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/interfaces/ZIF_TEST/source/main?version=inactive`,
    );
  });
});

describe('의존 문맥', () => {
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
      getInterface,
      { interface_name: 'zif_test', with_context: true },
      (request) => ({
        body: request.url.includes('ZCL_HELPER') ? helperSource : INTERFACE_SOURCE,
      }),
    );

    expect(requests.map((request) => request.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/oo/interfaces/ZIF_TEST/source/main?version=active`,
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_HELPER/source/main?version=active`,
    ]);

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.dependency_context).toContain('* ----- CLASS: ZCL_HELPER -----');
    expect(payload.dependency_context).toContain('METHODS run.');
    expect(payload.dependency_context).not.toContain('must not leak');
  });

  it('의존을 못 읽어도 본 읽기는 성공한다', async () => {
    const { outcome } = await runTool(
      getInterface,
      { interface_name: 'zif_test', with_context: true },
      (request) =>
        request.url.includes('ZCL_HELPER') ? { status: 404, body: '' } : { body: INTERFACE_SOURCE },
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.success).toBe(true);
    expect(payload.dependency_context).toContain('* ZCL_HELPER (class): not found');
  });
});

describe('오류 갈래 — 구의 실제 문구', () => {
  it('404는 안쪽 패키지가 삼켜 한 겹 더 감싸진 문구로 나간다', async () => {
    // `AdtInterface.js:129-131`이 404를 undefined로 접고, 핸들러가 자기
    // `Interface … not found`를 던져 `:134`의 `Failed to read interface:`에
    // 감싸진다. **마침표가 없는 것도 구 그대로다.**
    const { outcome } = await runTool(getInterface, { interface_name: 'zif_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Failed to read interface: Interface ZIF_TEST not found');
  });

  it('423(다른 사용자 잠금)은 겉 핸들러의 문구 그대로다 — 이쪽은 삼켜지지 않는다', async () => {
    const { outcome } = await runTool(getInterface, { interface_name: 'zif_test' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Interface ZIF_TEST is locked by another user.');
  });
});
