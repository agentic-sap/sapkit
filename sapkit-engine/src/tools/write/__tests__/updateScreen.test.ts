/**
 * `UpdateScreen` — LOCK → DELETE → INSERT → 구문검사 → UNLOCK → (활성화).
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/screen/high/handleUpdateScreen.ts:66-228`)의 실측에서
 * 뽑았다. 장부 D92(잠금 없이 진행하지 않는다)의 대체 기대 시험이 여기 있다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  type RfcResponder,
  activationBody,
  cleanCheckRun,
  failingCheckRun,
  invoke,
  jsonOf,
  lockBody,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { createScreen } from '../createScreen';
import { updateScreen } from '../updateScreen';

const PROGRAM_URI = '/sap/bc/adt/programs/programs/ZSAPKIT_SCR';
const CHECKRUNS = '/sap/bc/adt/checkruns';
const ACTIVATION = '/sap/bc/adt/activation';

const DYNPRO_JSON = JSON.stringify({
  HEADER: { PROGRAM: 'ZSAPKIT_SCR', SCREEN: '0100', DESCRIPT: 'Overview' },
  FLOW_LOGIC: 'PROCESS BEFORE OUTPUT.\nPROCESS AFTER INPUT.',
});

function adtResponder(
  options: { check?: string; activation?: string; lock?: string } = {},
): AdtResponder {
  return (request, response) => {
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, options.lock ?? lockBody());
    }
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === CHECKRUNS) return xml(response, options.check ?? cleanCheckRun());
    if (request.path === ACTIVATION) return xml(response, options.activation ?? activationBody());
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

const dispatchOk: RfcResponder = () => ({ result: {} });

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(updateScreen)).toEqual(publishedDeclaration('UpdateScreen'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(updateScreen.definition.sets).toEqual(['high']);
    expect(updateScreen.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(updateScreen.definition.kind).toBe('mutation');
    expect(updateScreen.definition.targetNames).toEqual(['program_name']);
  });
});

describe('시퀀스', () => {
  it('LOCK → DELETE → INSERT → 검사 → UNLOCK → 활성화 순이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const result = await invoke(updateScreen, harness, {
      program_name: 'zsapkit_scr',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual([
      'DYNPRO_DELETE',
      'DYNPRO_INSERT',
    ]);
    expect(harness.adtCalls().map((call) => `${call.path}:${call.query.get('_action') ?? call.query.get('method') ?? call.query.get('reporters')}`)).toEqual([
      `${PROGRAM_URI}:LOCK`,
      `${CHECKRUNS}:abapCheckRun`,
      `${PROGRAM_URI}:UNLOCK`,
      `${ACTIVATION}:activate`,
    ]);
  });

  it('구문검사는 **잠금 안에서** 돈다 — 해제보다 앞이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
    });
    const paths = harness.adtCalls().map((call) => call.path);
    expect(paths.indexOf(CHECKRUNS)).toBeLessThan(paths.lastIndexOf(PROGRAM_URI));
  });

  it('삭제가 실패해도 삽입은 나간다 — 화면이 아직 없을 수 있다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) =>
        call.action === 'DYNPRO_DELETE'
          ? { subrc: 2, message: 'Dynpro does not exist' }
          : { result: {} },
    });
    const result = await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual([
      'DYNPRO_DELETE',
      'DYNPRO_INSERT',
    ]);
  });

  it('삽입에는 손질된 dynpro_data가 실린다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: JSON.stringify({ metadata: { descript: 'X' }, flow_logic: 'A.\nB.' }),
    });

    const insert = harness.rfcCalls[1]!.params as Record<string, string>;
    expect(JSON.parse(insert['dynpro_data']!)).toEqual({
      HEADER: { DESCRIPT: 'X', PROGRAM: 'ZSAPKIT_SCR', SCREEN: '0100' },
      FLOW_LOGIC: [{ LINE: 'A.' }, { LINE: 'B.' }],
    });
  });
});

describe('CreateScreen과의 갈림', () => {
  it('Update만 잠근다 — Create는 잠금 요청을 한 번도 보내지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });

    await invoke(createScreen, harness, { program_name: 'ZSAPKIT_SCR', screen_number: '0100' });
    const afterCreate = harness.adtCalls().filter((call) => call.query.get('_action') === 'LOCK');

    await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
    });
    const afterUpdate = harness.adtCalls().filter((call) => call.query.get('_action') === 'LOCK');

    expect(afterCreate).toHaveLength(0);
    expect(afterUpdate).toHaveLength(1);
  });

  it('Update만 DYNPRO_DELETE를 앞세운다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    await invoke(createScreen, harness, { program_name: 'ZSAPKIT_SCR', screen_number: '0100' });
    await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
    });
    expect(harness.rfcCalls.map((call) => call.action)).toEqual([
      'DYNPRO_INSERT',
      'DYNPRO_DELETE',
      'DYNPRO_INSERT',
    ]);
  });
});

describe('갈래', () => {
  it('인자가 빠지면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(
        await invoke(updateScreen, harness, { program_name: 'ZSCR', screen_number: '0100' }),
      ),
    ).toBe('Error: Missing required parameters: program_name, screen_number, and dynpro_data');
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('장부 D92 — 잠금 응답에 LOCK_HANDLE이 없으면 화면을 건드리지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ lock: '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA/></asx:values></asx:abap>' }),
      rfc: dispatchOk,
    });
    const result = await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Failed to update screen:');
    // 구는 여기서 그대로 진행해 지웠다 다시 넣었다. 이제는 한 번도 나가지 않는다.
    expect(harness.rfcCalls).toHaveLength(0);
    expect(harness.adtCalls().map((call) => call.query.get('_action'))).toEqual(['LOCK']);
  });

  it('구문검사가 오류를 내면 접두사 없이 실패하고 잠금은 풀린다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ check: failingCheckRun('Field VBELN is unknown', '7') }),
      rfc: dispatchOk,
    });
    const result = await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
    });

    expect(textOf(result)).toBe(
      'Error: Screen ZSAPKIT_SCR/0100 preCheck syntax check failed (1 error): [L7] Field VBELN is unknown',
    );
    expect(harness.adtCalls().map((call) => call.query.get('_action'))).toEqual([
      'LOCK',
      null,
      'UNLOCK',
    ]);
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ activation: activationBody([{ type: 'E', text: 'Dynpro inconsistent' }]) }),
      rfc: dispatchOk,
    });
    const result = await invoke(updateScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      dynpro_data: DYNPRO_JSON,
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZSAPKIT_SCR was not activated');
  });
});

describe('응답', () => {
  it('steps_completed는 lock/update/unlock(+activate)다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: dispatchOk });
    const body = jsonOf(
      await invoke(updateScreen, harness, {
        program_name: 'ZSAPKIT_SCR',
        screen_number: '0100',
        dynpro_data: DYNPRO_JSON,
      }),
    );
    expect(body).toEqual({
      success: true,
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      type: 'DYNP',
      activated: false,
      message: 'Screen ZSAPKIT_SCR/0100 updated (not activated).',
      steps_completed: ['lock', 'update', 'unlock'],
    });
  });
});
