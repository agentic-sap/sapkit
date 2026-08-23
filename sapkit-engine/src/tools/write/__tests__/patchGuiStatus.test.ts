/**
 * `PatchGuiStatus` — 이 표면의 유일한 `Patch*`.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/gui_status/high/handlePatchGuiStatus.ts:100-305`)와
 * 병합 규칙(`engine/src/lib/cuaSchema.ts:236-297`)의 실측에서 뽑았다.
 *
 * **`Update*`와 무엇이 다른가**가 이 묶음의 핵심 실측이라, 같은 하네스에서 두
 * 도구를 나란히 불러 대조하는 절을 따로 두었다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  type RfcResponder,
  activationBody,
  invoke,
  jsonOf,
  lockBody,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { patchGuiStatus } from '../patchGuiStatus';
import { updateGuiStatus } from '../updateGuiStatus';

const PROGRAM_URI = '/sap/bc/adt/programs/programs/ZSAPKIT_CUA';
const ACTIVATION = '/sap/bc/adt/activation';

/** SAP에 이미 있는 CUA. 병합의 바탕이다. */
const CURRENT = {
  ADM: { PFKCODE: 'MAIN', MOD_LANGU: 'E' },
  STA: [
    { CODE: 'MAIN_STATUS', MODAL: 'D', PFKCODE: 'MAIN', INT_NOTE: 'keep me' },
    { CODE: 'POPUP', MODAL: 'P' },
  ],
  FUN: [
    { CODE: 'BACK', FUN_TEXT: 'Back', ICON_ID: '@02@' },
    { CODE: 'SAVE', FUN_TEXT: 'Save' },
  ],
  PFK: [{ CODE: 'MAIN', PFNO: '1', FUNCODE: 'BACK' }],
  TIT: [{ CODE: 'MAIN_STATUS', TEXT: 'Overview' }],
};

function adtResponder(options: { activation?: string } = {}): AdtResponder {
  return (request, response) => {
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody());
    }
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === ACTIVATION) return xml(response, options.activation ?? activationBody());
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

function cuaResponder(current: unknown = CURRENT): RfcResponder {
  return (call) => (call.action === 'CUA_FETCH' ? { result: current } : { result: {} });
}

function writtenCua(harness: RfcHarness, index = 0): Record<string, unknown> {
  const writes = harness.rfcCalls.filter((call) => call.action === 'CUA_WRITE');
  const write = writes[index];
  if (!write) throw new Error(`CUA_WRITE #${index}가 나가지 않았다`);
  return JSON.parse((write.params as Record<string, string>)['cua_data']!) as Record<string, unknown>;
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(patchGuiStatus)).toEqual(publishedDeclaration('PatchGuiStatus'));
  });

  it('발행 설명이 표별 자연키를 적어 두므로 그 값이 곧 계약이다', () => {
    const description = publishedDeclaration('PatchGuiStatus').description;
    expect(description).toContain('STA=CODE, FUN=CODE, PFK=CODE+PFNO, BUT=PFK_CODE+CODE+NO, TIT=CODE');
    expect(description).toContain('SET=STATUS+FUNCTION');
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(patchGuiStatus.definition.sets).toEqual(['high']);
    expect(patchGuiStatus.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(patchGuiStatus.definition.kind).toBe('mutation');
    expect(patchGuiStatus.definition.targetNames).toEqual(['program_name']);
  });
});

describe('Update*와의 갈림 — 같은 쓰기, 다른 만들기', () => {
  it('Patch만 CUA_FETCH를 앞세운다 — SAP 쪽 쓰기 동작은 둘 다 CUA_WRITE다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });

    await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] },
    });
    const afterPatch = harness.rfcCalls.map((call) => call.action);

    await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] },
    });
    const afterBoth = harness.rfcCalls.map((call) => call.action);

    expect(afterPatch).toEqual(['CUA_FETCH', 'CUA_WRITE']);
    expect(afterBoth).toEqual(['CUA_FETCH', 'CUA_WRITE', 'CUA_WRITE']);
  });

  it('**같은 인자**를 주면 Patch는 보존하고 Update는 지운다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    const edit = { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] };

    await invoke(patchGuiStatus, harness, { program_name: 'ZSAPKIT_CUA', changes: edit });
    await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: edit,
      skip_validation: true,
    });

    const patched = writtenCua(harness, 0);
    const replaced = writtenCua(harness, 1);

    // Patch: 손대지 않은 표(STA·PFK·TIT)와 행(SAVE)이 살아남고, 손댄 행은 칸만 갈린다.
    expect(patched['STA']).toEqual(CURRENT.STA);
    expect(patched['PFK']).toEqual(CURRENT.PFK);
    expect(patched['TIT']).toEqual(CURRENT.TIT);
    expect(patched['FUN']).toEqual([
      { CODE: 'BACK', FUN_TEXT: 'Back', ICON_ID: '@03@' },
      { CODE: 'SAVE', FUN_TEXT: 'Save' },
    ]);

    // Update: 준 것이 전부다 — 나머지는 통째로 사라진다.
    expect(replaced).toEqual({ FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] });
  });

  it('검증 대상이 다르다 — Patch는 **병합 결과**를, Update는 입력을 본다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    // PFK 행을 CODE만 넣어 보낸다: 입력만 보면 PFNO·FUNCODE가 없어 오류지만,
    // 병합하면 기존 PFK 행의 칸이 채워져 통과한다.
    const changes = { PFK: [{ CODE: 'MAIN', PFNO: '1' }] };

    const patched = await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes,
    });
    const updated = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: changes,
    });

    expect(patched.isError).toBe(false);
    expect(updated.isError).toBe(true);
    expect(textOf(updated)).toContain('PFK[0] is missing required field "FUNCODE"');
  });

  it('검증 실패 문구가 다르다 — Patch만 접두사가 붙고 낱말도 다르다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder({}) });
    const broken = { STA: [{ MODAL: 'D' }] };

    const patched = await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: broken,
    });
    const updated = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: broken,
    });

    expect(textOf(patched)).toBe(
      'Error: Failed to patch GUI status: PatchGuiStatus rejected — merged cua has 1 validation problem(s). ' +
        'Fix changes (or pass skip_validation=true):\n- STA[0] is missing required field "CODE"',
    );
    expect(textOf(updated)).toBe(
      'Error: UpdateGuiStatus rejected — cua_data has 1 validation problem(s). ' +
        'Fix these (or pass skip_validation=true to bypass):\n- STA[0] is missing required field "CODE"',
    );
  });

  it('Patch만 표별 행 수 summary를 싣는다 (BIV는 세지 않는다)', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    const patched = jsonOf(
      await invoke(patchGuiStatus, harness, {
        program_name: 'ZSAPKIT_CUA',
        changes: { FUN: [{ CODE: 'NEW', FUN_TEXT: 'New' }] },
      }),
    );
    const updated = jsonOf(
      await invoke(updateGuiStatus, harness, {
        program_name: 'ZSAPKIT_CUA',
        cua_data: { FUN: [{ CODE: 'NEW' }] },
      }),
    );

    expect(patched['summary']).toEqual({
      sta: 2,
      fun: 3,
      pfk: 1,
      but: 0,
      tit: 1,
      men: 0,
      mtx: 0,
      act: 0,
      set: 0,
      doc: 0,
    });
    expect(updated).not.toHaveProperty('summary');
  });
});

describe('병합 규칙 — 자연키', () => {
  it('맞는 행은 **칸 단위로** 갈리고 나머지 칸은 살아남는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { STA: [{ CODE: 'MAIN_STATUS', MODAL: 'P' }] },
    });

    expect((writtenCua(harness)['STA'] as unknown[])[0]).toEqual({
      CODE: 'MAIN_STATUS',
      MODAL: 'P',
      PFKCODE: 'MAIN',
      INT_NOTE: 'keep me',
    });
  });

  it('맞는 행이 없으면 **뒤에 붙는다**', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { STA: [{ CODE: 'NEW_STATUS', MODAL: 'D' }] },
    });

    expect(writtenCua(harness)['STA']).toEqual([
      ...CURRENT.STA,
      { CODE: 'NEW_STATUS', MODAL: 'D' },
    ]);
  });

  it('PFK는 CODE+PFNO 두 칸이 키다 — PFNO가 다르면 다른 행이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { PFK: [{ CODE: 'MAIN', PFNO: '2', FUNCODE: 'SAVE' }] },
    });

    expect(writtenCua(harness)['PFK']).toEqual([
      { CODE: 'MAIN', PFNO: '1', FUNCODE: 'BACK' },
      { CODE: 'MAIN', PFNO: '2', FUNCODE: 'SAVE' },
    ]);
  });

  it('`ADM`은 칸 단위로 겹쳐지고 언제나 결과에 있다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { ADM: { PFKCODE: 'OTHER' } },
    });
    expect(writtenCua(harness)['ADM']).toEqual({ PFKCODE: 'OTHER', MOD_LANGU: 'E' });
  });

  it('양쪽 다 없는 표는 키를 만들지 않는다 — 빈 배열이 "비워라"로 읽히면 안 된다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] },
    });

    const cua = writtenCua(harness);
    expect(Object.keys(cua)).toEqual(['ADM', 'STA', 'FUN', 'PFK', 'TIT']);
    expect(cua).not.toHaveProperty('BUT');
    expect(cua).not.toHaveProperty('BIV');
  });
});

describe('시퀀스', () => {
  it('FETCH → 병합 → 검증 → LOCK → WRITE → UNLOCK → 활성화 순이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder() });
    const body = jsonOf(
      await invoke(patchGuiStatus, harness, {
        program_name: 'zsapkit_cua',
        changes: { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] },
        activate: true,
      }),
    );

    expect(body['steps_completed']).toEqual([
      'fetch_current',
      'merge',
      'lock',
      'write',
      'unlock',
      'activate',
    ]);
    expect(harness.adtCalls().map((call) => call.query.get('_action') ?? call.query.get('method'))).toEqual([
      'LOCK',
      'UNLOCK',
      'activate',
    ]);
  });

  it('읽기가 잠금보다 앞이다 — 병합할 것이 없으면 잠그지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) =>
        call.action === 'CUA_FETCH' ? { subrc: 4, message: 'No CUA for program' } : { result: {} },
    });
    const result = await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { FUN: [{ CODE: 'BACK' }] },
    });

    // CreateGuiStatus는 같은 실패를 삼키지만 Patch는 삼키지 않는다.
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to patch GUI status: ZSAPKIT_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): No CUA for program',
    );
    expect(harness.adtCalls()).toHaveLength(0);
  });
});

describe('갈래', () => {
  it('인자가 빠지면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    const expected = 'Error: Missing required parameters: program_name and changes';
    expect(textOf(await invoke(patchGuiStatus, harness, { program_name: 'ZA' }))).toBe(expected);
    expect(
      textOf(await invoke(patchGuiStatus, harness, { program_name: 'ZA', changes: null })),
    ).toBe(expected);
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('changes가 JSON이 아니면 정규화 단계에서 거절한다 — 문구가 Update와 다르다', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(await invoke(patchGuiStatus, harness, { program_name: 'ZA', changes: 'nope' })),
    ).toContain('Error: Invalid changes: cua_data is a string but is not valid JSON:');
  });

  it('skip_validation=true면 병합 결과 검증을 건너뛴다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: cuaResponder({}) });
    const result = await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { STA: [{ MODAL: 'D' }] },
      skip_validation: true,
    });
    expect(result.isError).toBe(false);
    expect(writtenCua(harness)['STA']).toEqual([{ MODAL: 'D' }]);
  });

  it('CUA_WRITE가 실패하면 잠금은 풀리고 실패로 답한다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) =>
        call.action === 'CUA_FETCH'
          ? { result: CURRENT }
          : { subrc: 8, message: 'CUA is locked by another user' },
    });
    const result = await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Failed to patch GUI status:');
    expect(harness.adtCalls().map((call) => call.query.get('_action'))).toEqual(['LOCK', 'UNLOCK']);
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ activation: activationBody([{ type: 'E', text: 'CUA inconsistent' }]) }),
      rfc: cuaResponder(),
    });
    const result = await invoke(patchGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      changes: { FUN: [{ CODE: 'BACK', ICON_ID: '@03@' }] },
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZSAPKIT_CUA was not activated');
  });
});
