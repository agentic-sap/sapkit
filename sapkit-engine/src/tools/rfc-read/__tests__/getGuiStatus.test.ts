/**
 * `GetGuiStatus` — `ReadGuiStatus`와 **같은 요청**, 다른 응답.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/gui_status/high/handleGetGuiStatus.ts:39-103`)의
 * 실측에서 뽑았다. 걸러 내기가 `STA` 하나에만 걸린다는 것이 요점이다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { getGuiStatus } from '../getGuiStatus';
import { readGuiStatus } from '../readGuiStatus';
import {
  type RfcHarness,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
} from './rfcToolSupport';

const CUA = {
  ADM: { PFKCODE: 'MAIN' },
  STA: [
    { CODE: 'MAIN_STATUS', MODAL: 'D' },
    { CODE: 'POPUP', MODAL: 'P' },
  ],
  FUN: [{ CODE: 'BACK', FUN_TEXT: 'Back' }],
  PFK: [{ CODE: 'MAIN', PFNO: '1', FUNCODE: 'BACK' }],
  TIT: [{ CODE: 'MAIN_STATUS', TEXT: 'Overview' }],
};

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(getGuiStatus)).toEqual(publishedDeclaration('GetGuiStatus'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · read', () => {
    expect(getGuiStatus.definition.sets).toEqual(['high']);
    expect(getGuiStatus.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getGuiStatus.definition.kind).toBe('read');
    expect(getGuiStatus.definition.targetNames).toEqual(['program_name']);
  });
});

describe('ReadGuiStatus와의 갈림 — 같은 요청, 다른 응답', () => {
  it('요청 바이트는 **글자까지 같다** — status_name은 나가지 않는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    await invoke(getGuiStatus, harness, { program_name: 'SAPMV45A', status_name: 'POPUP' });
    await invoke(readGuiStatus, harness, { program_name: 'SAPMV45A' });

    expect(harness.rfcCalls[0]!.inputs['IV_PARAMS']).toBe('{"program":"SAPMV45A"}');
    expect(harness.rfcCalls[0]!.url).toBe(harness.rfcCalls[1]!.url);
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('GetGuiStatus만 status_name·type·steps_completed를 싣는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    const got = jsonOf(await invoke(getGuiStatus, harness, { program_name: 'SAPMV45A' }));
    const read = jsonOf(await invoke(readGuiStatus, harness, { program_name: 'SAPMV45A' }));

    expect(Object.keys(got)).toEqual([
      'success',
      'program_name',
      'status_name',
      'type',
      'definition',
      'steps_completed',
    ]);
    expect(Object.keys(read)).toEqual(['success', 'program_name', 'definition']);
    expect(got['type']).toBe('CUAD');
    expect(got['steps_completed']).toEqual(['get_definition']);
    // 거르지 않으면 정의는 서로 같다.
    expect(got['definition']).toEqual(read['definition']);
  });

  it('실패 문구는 GetGuiStatus만 접두사를 붙인다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ subrc: 4, message: 'No CUA' }) });
    const inner = 'ZSAPKIT_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): No CUA';
    expect(textOf(await invoke(getGuiStatus, harness, { program_name: 'ZA' }))).toBe(
      `Error: Failed to get GUI status: ${inner}`,
    );
    expect(textOf(await invoke(readGuiStatus, harness, { program_name: 'ZA' }))).toBe(
      `Error: ${inner}`,
    );
  });

  it('인자 검증 문구가 다르다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(getGuiStatus, harness, {}))).toBe(
      'Error: Missing required parameter: program_name',
    );
    expect(textOf(await invoke(readGuiStatus, harness, {}))).toBe(
      'Error: program_name is required',
    );
  });
});

describe('status_name 걸러 내기', () => {
  it('`STA` **하나만** 좁힌다 — FUN·PFK·TIT는 그대로 남는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    const body = jsonOf(
      await invoke(getGuiStatus, harness, { program_name: 'SAPMV45A', status_name: 'popup' }),
    );

    expect(body['status_name']).toBe('POPUP');
    expect(body['definition']).toEqual({
      ADM: CUA.ADM,
      STA: [{ CODE: 'POPUP', MODAL: 'P' }],
      FUN: CUA.FUN,
      PFK: CUA.PFK,
      TIT: CUA.TIT,
    });
  });

  it('맞는 상태가 없으면 STA만 비고 나머지는 남는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    const body = jsonOf(
      await invoke(getGuiStatus, harness, { program_name: 'SAPMV45A', status_name: 'NOPE' }),
    );
    const definition = body['definition'] as Record<string, unknown>;
    expect(definition['STA']).toEqual([]);
    expect(definition['FUN']).toEqual(CUA.FUN);
  });

  it('소문자 정의를 좁히면 `sta`와 `STA`가 **둘 다** 실린다 (구의 실측)', async () => {
    harness = await startRfcHarness({
      rfc: () => ({ result: { sta: [{ code: 'A' }, { code: 'B' }], fun: [] } }),
    });
    const body = jsonOf(
      await invoke(getGuiStatus, harness, { program_name: 'ZA', status_name: 'A' }),
    );
    expect(body['definition']).toEqual({
      sta: [{ code: 'A' }, { code: 'B' }],
      fun: [],
      STA: [{ code: 'A' }],
    });
  });

  it('STA가 배열이 아니면 아무것도 거르지 않는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: { STA: 'nonsense' } }) });
    const body = jsonOf(
      await invoke(getGuiStatus, harness, { program_name: 'ZA', status_name: 'A' }),
    );
    expect(body['definition']).toEqual({ STA: 'nonsense' });
  });

  it('status_name이 없으면 손대지 않는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    const body = jsonOf(await invoke(getGuiStatus, harness, { program_name: 'SAPMV45A' }));
    expect(body['status_name']).toBeNull();
    expect(body['definition']).toEqual(CUA);
  });
});
