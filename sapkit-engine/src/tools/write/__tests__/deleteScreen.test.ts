/**
 * `DeleteScreen` — 발행 계약 · LOCK → DYNPRO_DELETE → UNLOCK ·
 * D113(잠금 손잡이 없이 진행하지 않는다) · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteScreen`
 *  - 겉 핸들러: `engine/src/handlers/screen/high/handleDeleteScreen.ts:22-150`
 *  - 잠금·해제 와이어: `src/tools/write/internal/programScoped.ts` 머리주석
 *
 * 형제 `DeleteGuiStatus`와 달리 **읽기 걸음이 없다** — 대리자에 `DYNPRO_DELETE`가
 * 실제로 있기 때문이다. 짐작으로 FETCH를 넣으면 시험이 깨진다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  invoke,
  jsonOf,
  lockBody,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { deleteScreen } from '../deleteScreen';
import { describeTierGate, exposureMemberships } from './deletionSupport';

const PROGRAM = 'ZSAPKIT_SCR';
const PROGRAM_URI = `/sap/bc/adt/programs/programs/${PROGRAM}`;
const SCREEN = '0100';

function adtResponder(lock?: string): AdtResponder {
  return (request, response) => {
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lock ?? lockBody('LOCK-SCR'));
    }
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteScreen)).toEqual(publishedDeclaration('DeleteScreen'));
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteScreen.definition.sets).toEqual(['high']);
    expect(deleteScreen.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(deleteScreen.definition.kind).toBe('mutation');
    expect(deleteScreen.definition.targetNames).toEqual(['program_name']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다 — 클라우드에는 없다', () => {
    expect(exposureMemberships('DeleteScreen')).toEqual(['connected_default']);
  });
});

describe('시퀀스 — LOCK → DYNPRO_DELETE → UNLOCK', () => {
  it('대리자 호출은 하나뿐이고 **읽기 걸음이 없다**', async () => {
    harness = await startRfcHarness({ adt: adtResponder() });
    const result = await invoke(deleteScreen, harness, {
      program_name: PROGRAM.toLowerCase(),
      screen_number: SCREEN,
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['DYNPRO_DELETE']);
    expect(harness.rfcCalls[0]?.params).toEqual({ program: PROGRAM, dynpro: SCREEN });
  });

  it('ADT 축은 잠금과 해제 둘뿐이다 — 삭제 서비스를 치지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder() });
    await invoke(deleteScreen, harness, { program_name: PROGRAM, screen_number: SCREEN });

    expect(harness.adtCalls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${PROGRAM_URI}`,
      `POST ${PROGRAM_URI}`,
    ]);
    expect(harness.nthAdt(0).query.get('_action')).toBe('LOCK');
    expect(harness.nthAdt(1).query.get('_action')).toBe('UNLOCK');
    expect(harness.nthAdt(1).query.get('lockHandle')).toBe('LOCK-SCR');
  });

  it('화면 번호는 문자열 그대로 실린다 — 앞자리 0이 살아 있어야 한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder() });
    await invoke(deleteScreen, harness, { program_name: PROGRAM, screen_number: '0009' });
    expect(harness.rfcCalls[0]?.params?.dynpro).toBe('0009');
  });

  it('성공 응답은 구의 다섯 칸 그대로다', async () => {
    harness = await startRfcHarness({ adt: adtResponder() });
    expect(
      jsonOf(await invoke(deleteScreen, harness, { program_name: PROGRAM, screen_number: SCREEN })),
    ).toEqual({
      success: true,
      program_name: PROGRAM,
      screen_number: SCREEN,
      message: `Screen ${PROGRAM}/${SCREEN} deleted successfully.`,
      steps_completed: ['lock', 'delete', 'unlock'],
    });
  });
});

describe('갈래', () => {
  it('인자가 빠지면 요청을 하나도 보내지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder() });
    const result = await invoke(deleteScreen, harness, { program_name: PROGRAM });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Missing required parameters: program_name and screen_number',
    );
    expect(harness.adtCalls()).toHaveLength(0);
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('대리자가 실패하면 접두사가 붙은 문구로 올라온다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: () => ({ subrc: 4, message: 'Dynpro 0100 does not exist' }),
    });
    const result = await invoke(deleteScreen, harness, {
      program_name: PROGRAM,
      screen_number: SCREEN,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Error: Failed to delete screen: ');
    expect(textOf(result)).toContain('Dynpro 0100 does not exist');
  });
});

describe('D113 — 잠금 손잡이가 없으면 진행하지 않는다', () => {
  it('LOCK 응답에 LOCK_HANDLE이 없으면 **RFC 호출이 0회**다 (구는 그대로 지웠다)', async () => {
    harness = await startRfcHarness({
      adt: adtResponder('<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"/>'),
    });
    const result = await invoke(deleteScreen, harness, {
      program_name: PROGRAM,
      screen_number: SCREEN,
    });

    expect(result.isError).toBe(true);
    expect(harness.rfcCalls).toHaveLength(0);
  });
});

describeTierGate(deleteScreen, { program_name: PROGRAM, screen_number: SCREEN });
