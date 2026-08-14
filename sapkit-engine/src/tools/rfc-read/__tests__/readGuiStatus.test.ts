/**
 * `ReadGuiStatus` — `CUA_FETCH` 한 번, 정의를 손대지 않고 싣는다.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/gui_status/readonly/handleReadGuiStatus.ts:33-76`)의
 * 실측에서 뽑았다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
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
  STA: [{ CODE: 'MAIN_STATUS', MODAL: 'D' }, { CODE: 'POPUP', MODAL: 'P' }],
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
    expect(await publishedSurfaceOf(readGuiStatus)).toEqual(publishedDeclaration('ReadGuiStatus'));
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/legacy · read', () => {
    expect(readGuiStatus.definition.sets).toEqual(['readonly']);
    expect(readGuiStatus.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(readGuiStatus.definition.kind).toBe('read');
    expect(readGuiStatus.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('Dispatch CUA_FETCH 한 번이고 인자는 program 하나다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    await invoke(readGuiStatus, harness, { program_name: 'sapmv45a' });

    const call = harness.rfcCalls[0]!;
    expect(call.functionImport).toBe('Dispatch');
    expect(call.action).toBe('CUA_FETCH');
    expect(call.inputs['IV_PARAMS']).toBe('{"program":"SAPMV45A"}');
    expect(harness.adtCalls()).toHaveLength(0);
  });
});

describe('응답 조립', () => {
  it('정의를 **손대지 않고** 싣는다 — 걸러 내기는 GetGuiStatus의 몫이다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: CUA }) });
    const body = jsonOf(await invoke(readGuiStatus, harness, { program_name: 'SAPMV45A' }));

    expect(body).toEqual({
      success: true,
      program_name: 'SAPMV45A',
      definition: CUA,
    });
    expect((body['definition'] as Record<string, unknown>)['STA']).toHaveLength(2);
  });

  it('CUA가 비어 있어도 오류가 아니다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: {} }) });
    const body = jsonOf(await invoke(readGuiStatus, harness, { program_name: 'ZA' }));
    expect(body).toEqual({ success: true, program_name: 'ZA', definition: {} });
  });
});

describe('갈래', () => {
  it('program_name이 없으면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(readGuiStatus, harness, {}))).toBe(
      'Error: program_name is required',
    );
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('대리자 실패 문구에 접두사를 붙이지 않는다 — GetGuiStatus와 갈리는 자리', async () => {
    harness = await startRfcHarness({ rfc: () => ({ subrc: 4, message: 'No CUA for program' }) });
    const result = await invoke(readGuiStatus, harness, { program_name: 'ZA' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): No CUA for program',
    );
  });
});
