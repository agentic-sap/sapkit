/**
 * `UpdateGuiStatus` — 정규화 → 검증 → LOCK → CUA_WRITE → UNLOCK → (활성화).
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/gui_status/high/handleUpdateGuiStatus.ts:71-248`)와
 * 검증 규칙(`engine/src/lib/cuaSchema.ts:162-234`)의 실측에서 뽑았다.
 *
 * 이 도구가 `PatchGuiStatus`와 갈리는 핵심은 **읽지 않는다**는 것이고, 그
 * 대조는 `patchGuiStatus.test.ts`가 두 도구를 나란히 불러 못 박는다.
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
import { updateGuiStatus } from '../updateGuiStatus';

const PROGRAM_URI = '/sap/bc/adt/programs/programs/ZSAPKIT_CUA';
const ACTIVATION = '/sap/bc/adt/activation';

/** 검증을 통과하는 최소 CUA 한 벌. */
const VALID_CUA = {
  ADM: { PFKCODE: 'MAIN' },
  STA: [{ CODE: 'MAIN_STATUS', MODAL: 'D', PFKCODE: 'MAIN' }],
  FUN: [{ CODE: 'BACK', FUN_TEXT: 'Back' }],
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

const dispatchOk: RfcResponder = () => ({ result: {} });

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
    expect(await publishedSurfaceOf(updateGuiStatus)).toEqual(
      publishedDeclaration('UpdateGuiStatus'),
    );
  });

  it('`cua_data`의 발행 스키마에는 `type`도 `oneOf`도 없다 — 채록본을 따른다', () => {
    const schema = publishedDeclaration('UpdateGuiStatus').inputSchema as {
      properties: { cua_data: Record<string, unknown> };
      required: string[];
    };
    expect(Object.keys(schema.properties.cua_data)).toEqual(['description']);
    expect(schema.required).toEqual(['program_name', 'cua_data']);
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(updateGuiStatus.definition.sets).toEqual(['high']);
    expect(updateGuiStatus.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(updateGuiStatus.definition.kind).toBe('mutation');
    expect(updateGuiStatus.definition.targetNames).toEqual(['program_name']);
  });
});

describe('시퀀스 — 읽지 않는다', () => {
  it('LOCK → CUA_WRITE → UNLOCK → 활성화 순이고 CUA_FETCH가 없다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const result = await invoke(updateGuiStatus, harness, {
      program_name: 'zsapkit_cua',
      cua_data: VALID_CUA,
      activate: true,
    });

    expect(result.isError).toBe(false);
    // 전량 교체다 — 읽는 걸음이 아예 없다.
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['CUA_WRITE']);
    expect(harness.adtCalls().map((call) => call.query.get('_action') ?? call.query.get('method'))).toEqual([
      'LOCK',
      'UNLOCK',
      'activate',
    ]);
  });

  it('글로 준 cua_data와 객체로 준 것이 **같은 바이트**로 나간다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    await invoke(updateGuiStatus, harness, { program_name: 'ZSAPKIT_CUA', cua_data: VALID_CUA });
    await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: JSON.stringify(VALID_CUA),
    });

    const first = harness.rfcCalls[0]!.params as Record<string, string>;
    const second = harness.rfcCalls[1]!.params as Record<string, string>;
    expect(first['cua_data']).toBe(second['cua_data']);
    expect(Object.keys(first)).toEqual(['program', 'cua_data']);
  });

  it('최상위 키만 대문자로 옮기고 행 안의 칸은 손대지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: { sta: [{ CODE: 'S1', int_note: 'kept as-is' }], adm: { pfkcode: 'M' } },
    });

    expect(writtenCua(harness)).toEqual({
      STA: [{ CODE: 'S1', int_note: 'kept as-is' }],
      ADM: { pfkcode: 'M' },
    });
  });
});

describe('검증 — 잠금보다 앞이다', () => {
  it('필수 칸이 빠지면 SAP 왕복이 **한 번도** 없다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const result = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: { STA: [{ MODAL: 'D' }], PFK: [{ CODE: 'MAIN' }] },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: UpdateGuiStatus rejected — cua_data has 3 validation problem(s). ' +
        'Fix these (or pass skip_validation=true to bypass):\n' +
        '- STA[0] is missing required field "CODE"\n' +
        '- PFK[0] is missing required field "PFNO"\n' +
        '- PFK[0] is missing required field "FUNCODE"',
    );
    expect(harness.rfcCalls).toHaveLength(0);
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('상호참조는 **경고만**이다 — 통과시킨다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const result = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: {
        STA: [{ CODE: 'S1', PFKCODE: 'NOPE' }],
        PFK: [{ CODE: 'MAIN', PFNO: '1', FUNCODE: 'BACK' }],
        BUT: [{ PFK_CODE: 'NOPE', CODE: 'B1', NO: '1', PFNO: '1' }],
      },
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['CUA_WRITE']);
  });

  it('skip_validation=true면 필수 칸 누락도 그대로 나간다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const result = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: { STA: [{ MODAL: 'D' }] },
      skip_validation: true,
    });

    expect(result.isError).toBe(false);
    expect(writtenCua(harness)).toEqual({ STA: [{ MODAL: 'D' }] });
  });

  it('표가 배열이 아니면 정규화 단계에서 거절한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    expect(
      textOf(
        await invoke(updateGuiStatus, harness, {
          program_name: 'ZSAPKIT_CUA',
          cua_data: { STA: { CODE: 'S1' } },
        }),
      ),
    ).toBe('Error: Invalid cua_data: cua_data.STA must be an array, got object');
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('JSON이 아닌 글은 정규화 단계에서 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(
        await invoke(updateGuiStatus, harness, { program_name: 'ZA', cua_data: 'not json' }),
      ),
    ).toContain('Error: Invalid cua_data: cua_data is a string but is not valid JSON:');
  });
});

describe('갈래', () => {
  it('인자가 빠지면 거절한다 — null도 없는 것으로 친다', async () => {
    harness = await startRfcHarness({});
    const expected = 'Error: Missing required parameters: program_name and cua_data';
    expect(textOf(await invoke(updateGuiStatus, harness, { program_name: 'ZA' }))).toBe(expected);
    expect(
      textOf(await invoke(updateGuiStatus, harness, { program_name: 'ZA', cua_data: null })),
    ).toBe(expected);
  });

  it('CUA_WRITE가 실패하면 잠금은 풀리고 실패로 답한다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: () => ({ subrc: 8, message: 'CUA is locked by another user' }),
    });
    const result = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: VALID_CUA,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to update GUI status: ZMCP_ADT_DISPATCH error (action=CUA_WRITE, subrc=8): CUA is locked by another user',
    );
    expect(harness.adtCalls().map((call) => call.query.get('_action'))).toEqual(['LOCK', 'UNLOCK']);
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ activation: activationBody([{ type: 'E', text: 'CUA inconsistent' }]) }),
      rfc: dispatchOk,
    });
    const result = await invoke(updateGuiStatus, harness, {
      program_name: 'ZSAPKIT_CUA',
      cua_data: VALID_CUA,
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZSAPKIT_CUA was not activated');
  });
});

describe('응답', () => {
  it('steps_completed는 lock/update/unlock(+activate)다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const body = jsonOf(
      await invoke(updateGuiStatus, harness, {
        program_name: 'ZSAPKIT_CUA',
        cua_data: VALID_CUA,
      }),
    );
    expect(body).toEqual({
      success: true,
      program_name: 'ZSAPKIT_CUA',
      type: 'CUAD',
      activated: false,
      message: 'GUI Status data for ZSAPKIT_CUA updated (not activated).',
      steps_completed: ['lock', 'update', 'unlock'],
    });
  });
});
