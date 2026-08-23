/**
 * `CreateGuiStatus` — CUA_FETCH → 상태 행 추가 → CUA_WRITE → (활성화).
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/gui_status/high/handleCreateGuiStatus.ts:67-196`)의
 * 실측에서 뽑았다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  type RfcResponder,
  activationBody,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { createGuiStatus } from '../createGuiStatus';

const ACTIVATION = '/sap/bc/adt/activation';

const EXISTING = {
  ADM: { PFKCODE: 'MAIN' },
  STA: [{ CODE: 'OLD_STATUS', MODAL: 'D' }],
  FUN: [{ CODE: 'BACK', FUN_TEXT: 'Back' }],
};

function adtResponder(options: { activation?: string } = {}): AdtResponder {
  return (request, response) => {
    if (request.path === ACTIVATION) return xml(response, options.activation ?? activationBody());
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

function cuaResponder(existing: unknown = EXISTING): RfcResponder {
  return (call) => (call.action === 'CUA_FETCH' ? { result: existing } : { result: {} });
}

/** CUA_WRITE에 실린 정의. */
function writtenCua(harness: RfcHarness): Record<string, unknown> {
  const write = harness.rfcCalls.find((call) => call.action === 'CUA_WRITE');
  if (!write) throw new Error('CUA_WRITE가 나가지 않았다');
  return JSON.parse((write.params as Record<string, string>)['cua_data']!) as Record<string, unknown>;
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(createGuiStatus)).toEqual(
      publishedDeclaration('CreateGuiStatus'),
    );
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(createGuiStatus.definition.sets).toEqual(['high']);
    expect(createGuiStatus.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(createGuiStatus.definition.kind).toBe('mutation');
    expect(createGuiStatus.definition.targetNames).toEqual(['program_name']);
  });
});

describe('시퀀스와 와이어', () => {
  it('CUA_FETCH → CUA_WRITE → 활성화 순이고 **잠그지 않는다**', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    const result = await invoke(createGuiStatus, harness, {
      program_name: 'zsapkit_cua',
      status_name: 'main_status',
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['CUA_FETCH', 'CUA_WRITE']);
    expect(harness.adtCalls().map((call) => call.path)).toEqual([ACTIVATION]);
    expect(harness.adtCalls().some((call) => call.query.get('_action') === 'LOCK')).toBe(false);
  });

  it('CUA_WRITE의 인자 키 순서는 program → cua_data다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(createGuiStatus, harness, { program_name: 'ZSAPKIT_CUA', status_name: 'S1' });
    const write = harness.rfcCalls[1]!;
    expect(Object.keys(write.params as Record<string, unknown>)).toEqual(['program', 'cua_data']);
  });

  it('읽은 정의 위에 12개 표 뼈대를 깔고 상태 행을 붙인다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(createGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      status_name: 'MAIN_STATUS',
    });

    const cua = writtenCua(harness);
    expect(Object.keys(cua)).toEqual([
      'ADM',
      'STA',
      'FUN',
      'MEN',
      'MTX',
      'ACT',
      'BUT',
      'PFK',
      'SET',
      'DOC',
      'TIT',
      'BIV',
    ]);
    // 읽어 온 표는 살아 있고, 새 상태만 STA 끝에 붙는다.
    expect(cua['ADM']).toEqual({ PFKCODE: 'MAIN' });
    expect(cua['FUN']).toEqual(EXISTING.FUN);
    expect(cua['STA']).toEqual([
      { CODE: 'OLD_STATUS', MODAL: 'D' },
      { CODE: 'MAIN_STATUS', MODAL: 'D' },
    ]);
    // description을 주지 않았으므로 TIT는 비어 있다.
    expect(cua['TIT']).toEqual([]);
  });

  it('description을 주면 TIT에 별도 행이 붙는다 — rsmpe_stat에는 TXT 칸이 없다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(createGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      status_name: 'MAIN_STATUS',
      description: 'Overview status',
    });

    const cua = writtenCua(harness);
    expect(cua['TIT']).toEqual([{ CODE: 'MAIN_STATUS', TEXT: 'Overview status' }]);
    expect((cua['STA'] as Array<Record<string, unknown>>).at(-1)).toEqual({
      CODE: 'MAIN_STATUS',
      MODAL: 'D',
    });
  });

  it('CUA_FETCH가 실패해도 빈 뼈대로 계속 간다 — 첫 상태를 만들 수 있는 이유', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) =>
        call.action === 'CUA_FETCH' ? { subrc: 4, message: 'No CUA' } : { result: {} },
    });
    const result = await invoke(createGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      status_name: 'FIRST',
    });

    expect(result.isError).toBe(false);
    const cua = writtenCua(harness);
    expect(cua['STA']).toEqual([{ CODE: 'FIRST', MODAL: 'D' }]);
    expect(cua['ADM']).toEqual({});
  });
});

describe('status_type — 쓰는 값과 보고하는 값의 기본값이 다르다 (구의 실측)', () => {
  it('주지 않으면 SAP에는 "D"가 들어가고 응답은 "N"이라고 말한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder({}) });
    const body = jsonOf(
      await invoke(createGuiStatus, harness, { program_name: 'ZA', status_name: 'S1' }),
    );

    expect((writtenCua(harness)['STA'] as Array<Record<string, unknown>>)[0]!['MODAL']).toBe('D');
    expect(body['status_type']).toBe('N');
  });

  it('주면 그 값이 양쪽에 그대로 실린다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder({}) });
    const body = jsonOf(
      await invoke(createGuiStatus, harness, {
        program_name: 'ZA',
        status_name: 'S1',
        status_type: 'P',
      }),
    );
    expect((writtenCua(harness)['STA'] as Array<Record<string, unknown>>)[0]!['MODAL']).toBe('P');
    expect(body['status_type']).toBe('P');
  });
});

describe('갈래', () => {
  it('인자가 빠지면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(createGuiStatus, harness, { program_name: 'ZA' }))).toBe(
      'Error: Missing required parameters: program_name and status_name',
    );
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('CUA_WRITE가 실패하면 실패다 — FETCH와 달리 삼키지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) =>
        call.action === 'CUA_FETCH' ? { result: {} } : { subrc: 8, message: 'CUA locked' },
    });
    const result = await invoke(createGuiStatus, harness, {
      program_name: 'ZA',
      status_name: 'S1',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to create GUI status: ZSAPKIT_ADT_DISPATCH error (action=CUA_WRITE, subrc=8): CUA locked',
    );
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ activation: activationBody([{ type: 'E', text: 'CUA inconsistent' }]) }),
      rfc: cuaResponder({}),
    });
    const result = await invoke(createGuiStatus, harness, {
      program_name: 'ZA',
      status_name: 'S1',
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZA was not activated');
  });
});

describe('응답', () => {
  it('활성화하지 않으면 그렇게 답한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder({}) });
    const body = jsonOf(
      await invoke(createGuiStatus, harness, { program_name: 'ZA', status_name: 'S1' }),
    );
    expect(body).toEqual({
      success: true,
      program_name: 'ZA',
      status_name: 'S1',
      status_type: 'N',
      type: 'CUAD',
      activated: false,
      message: 'GUI Status ZA/S1 created (not activated).',
      steps_completed: ['create'],
    });
  });
});
