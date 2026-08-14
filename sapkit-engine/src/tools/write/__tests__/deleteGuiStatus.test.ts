/**
 * `DeleteGuiStatus` — 발행 계약 · 「읽고 걸러서 전량 다시 쓰기」 시퀀스 ·
 * D113(잠금 손잡이 없이 진행하지 않는다) · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteGuiStatus`
 *  - 겉 핸들러: `engine/src/handlers/gui_status/high/handleDeleteGuiStatus.ts:22-181`
 *    (그 주석이 왜 CUA_DELETE가 아니라 FETCH→필터→WRITE인지 적어 둔다)
 *  - 잠금·해제 와이어: `src/tools/write/internal/programScoped.ts` 머리주석
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  type RfcResponder,
  invoke,
  jsonOf,
  lockBody,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { deleteGuiStatus } from '../deleteGuiStatus';
import { describeTierGate, exposureMemberships } from './deletionSupport';

const PROGRAM = 'ZSAPKIT_CUA';
const PROGRAM_URI = `/sap/bc/adt/programs/programs/${PROGRAM}`;
const STATUS = 'STATUS_A';

/** 두 상태를 가진 CUA. 하나를 지우면 다른 하나가 남아야 한다. */
const CUA = {
  ADM: { PROGRAM },
  STA: [{ CODE: 'STATUS_A' }, { CODE: 'STATUS_B' }],
  TIT: [{ CODE: 'STATUS_A' }, { CODE: 'STATUS_B' }],
  SET: [{ STATUS: 'STATUS_A', FUNCTION: 'BACK' }, { STATUS: 'STATUS_B', FUNCTION: 'BACK' }],
};

function adtResponder(lock?: string): AdtResponder {
  return (request, response) => {
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lock ?? lockBody('LOCK-CUA'));
    }
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

const fetchThenWrite: RfcResponder = (call) =>
  call.action === 'CUA_FETCH' ? { result: CUA } : { result: {} };

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteGuiStatus)).toEqual(
      publishedDeclaration('DeleteGuiStatus'),
    );
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteGuiStatus.definition.sets).toEqual(['high']);
    // D112 — 클라우드 축이 없다는 것이 JWT 거절 갈래를 대신하는 바닥선이다.
    expect(deleteGuiStatus.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(deleteGuiStatus.definition.kind).toBe('mutation');
    expect(deleteGuiStatus.definition.targetNames).toEqual(['program_name']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다 — 클라우드에는 없다', () => {
    expect(exposureMemberships('DeleteGuiStatus')).toEqual(['connected_default']);
  });
});

describe('시퀀스 — LOCK → CUA_FETCH → (필터) → CUA_WRITE → UNLOCK', () => {
  it('대리자에게 두 번 부르고 CUA_DELETE는 쓰지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: fetchThenWrite });
    const result = await invoke(deleteGuiStatus, harness, {
      program_name: PROGRAM.toLowerCase(),
      status_name: STATUS.toLowerCase(),
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['CUA_FETCH', 'CUA_WRITE']);
    expect(harness.rfcCalls.map((call) => call.action)).not.toContain('CUA_DELETE');
  });

  it('ADT 축은 잠금과 해제 둘뿐이다 — 삭제 서비스를 치지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: fetchThenWrite });
    await invoke(deleteGuiStatus, harness, { program_name: PROGRAM, status_name: STATUS });

    expect(harness.adtCalls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${PROGRAM_URI}`,
      `POST ${PROGRAM_URI}`,
    ]);
    expect(harness.nthAdt(0).query.get('_action')).toBe('LOCK');
    expect(harness.nthAdt(0).query.get('accessMode')).toBe('MODIFY');
    expect(harness.nthAdt(1).query.get('_action')).toBe('UNLOCK');
    expect(harness.nthAdt(1).query.get('lockHandle')).toBe('LOCK-CUA');
  });

  it('세 표에서 그 상태만 빠진 **전량**을 쓴다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: fetchThenWrite });
    await invoke(deleteGuiStatus, harness, { program_name: PROGRAM, status_name: STATUS });

    const write = harness.rfcCalls[1];
    const sent = JSON.parse(String(write?.params?.cua_data)) as typeof CUA;
    expect(sent.STA).toEqual([{ CODE: 'STATUS_B' }]);
    expect(sent.TIT).toEqual([{ CODE: 'STATUS_B' }]);
    expect(sent.SET).toEqual([{ STATUS: 'STATUS_B', FUNCTION: 'BACK' }]);
    // 손대지 않은 표는 그대로 실린다.
    expect(sent.ADM).toEqual({ PROGRAM });
  });

  it('성공 응답은 구의 다섯 칸 그대로다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: fetchThenWrite });
    expect(
      jsonOf(await invoke(deleteGuiStatus, harness, { program_name: PROGRAM, status_name: STATUS })),
    ).toEqual({
      success: true,
      program_name: PROGRAM,
      status_name: STATUS,
      message: `GUI Status ${PROGRAM}/${STATUS} deleted successfully.`,
      steps_completed: ['lock', 'delete', 'unlock'],
    });
  });
});

describe('갈래', () => {
  it('인자가 빠지면 요청을 하나도 보내지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: fetchThenWrite });
    const result = await invoke(deleteGuiStatus, harness, { program_name: PROGRAM });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Missing required parameters: program_name and status_name',
    );
    expect(harness.adtCalls()).toHaveLength(0);
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('STA에 없는 상태면 **쓰지 않고** 실패한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: fetchThenWrite });
    const result = await invoke(deleteGuiStatus, harness, {
      program_name: PROGRAM,
      status_name: 'STATUS_ZZ',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Error: Failed to delete GUI status: GUI Status STATUS_ZZ not found in program ${PROGRAM}.`,
    );
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['CUA_FETCH']);
  });

  it('CUA를 못 읽으면 쓰지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) => (call.action === 'CUA_FETCH' ? { result: null } : { result: {} }),
    });
    const result = await invoke(deleteGuiStatus, harness, {
      program_name: PROGRAM,
      status_name: STATUS,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Could not fetch CUA data');
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['CUA_FETCH']);
  });
});

describe('D113 — 잠금 손잡이가 없으면 진행하지 않는다', () => {
  it('LOCK 응답에 LOCK_HANDLE이 없으면 **RFC 호출이 0회**다 (구는 그대로 썼다)', async () => {
    harness = await startRfcHarness({
      adt: adtResponder('<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"/>'),
      rfc: fetchThenWrite,
    });
    const result = await invoke(deleteGuiStatus, harness, {
      program_name: PROGRAM,
      status_name: STATUS,
    });

    expect(result.isError).toBe(true);
    expect(harness.rfcCalls).toHaveLength(0);
  });
});

describeTierGate(deleteGuiStatus, { program_name: PROGRAM, status_name: STATUS });
