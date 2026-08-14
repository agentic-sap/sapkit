/**
 * `GetScreen` — `ReadScreen`과 **같은 요청**, 다른 응답.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/screen/high/handleGetScreen.ts:37-102`)의 실측에서
 * 뽑았고, `ReadScreen`과의 갈림 넷을 한 절에서 나란히 못 박는다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { getScreen } from '../getScreen';
import { readScreen } from '../readScreen';
import {
  type RfcHarness,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
} from './rfcToolSupport';

const DYNPRO = {
  HEADER: { PROGRAM: 'SAPMV45A', SCREEN: '0100' },
  CONTAINERS: [{ NAME: 'MAIN' }],
  FIELDS_TO_CONTAINERS: [{ FIELD: 'VBAK-VBELN' }],
  FLOW_LOGIC: [{ LINE: 'PROCESS BEFORE OUTPUT.' }, { LINE: 'PROCESS AFTER INPUT.' }],
};

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(getScreen)).toEqual(publishedDeclaration('GetScreen'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · read', () => {
    expect(getScreen.definition.sets).toEqual(['high']);
    expect(getScreen.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getScreen.definition.kind).toBe('read');
    expect(getScreen.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('Dispatch DYNPRO_READ 한 번이다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    await invoke(getScreen, harness, { program_name: 'sapmv45a', screen_number: '0100' });

    const call = harness.rfcCalls[0]!;
    expect(call.action).toBe('DYNPRO_READ');
    expect(call.inputs['IV_PARAMS']).toBe('{"program":"SAPMV45A","dynpro":"0100"}');
    expect(harness.adtCalls()).toHaveLength(0);
  });
});

describe('ReadScreen과의 갈림 — 같은 요청, 다른 응답', () => {
  it('요청 바이트는 **글자까지 같다**', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    await invoke(getScreen, harness, { program_name: 'SAPMV45A', screen_number: '0100' });
    await invoke(readScreen, harness, { program_name: 'SAPMV45A', screen_number: '0100' });

    expect(harness.rfcCalls[0]!.url).toBe(harness.rfcCalls[1]!.url);
  });

  it('GetScreen만 `type`과 `steps_completed`를 싣는다 — `type`은 screen_number 바로 뒤다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    const got = await invoke(getScreen, harness, {
      program_name: 'SAPMV45A',
      screen_number: '0100',
    });
    const read = await invoke(readScreen, harness, {
      program_name: 'SAPMV45A',
      screen_number: '0100',
    });

    expect(Object.keys(jsonOf(got))).toEqual([
      'success',
      'program_name',
      'screen_number',
      'type',
      'flow_logic',
      'metadata',
      'containers',
      'fields_to_containers',
      'steps_completed',
    ]);
    expect(Object.keys(jsonOf(read))).toEqual([
      'success',
      'program_name',
      'screen_number',
      'flow_logic',
      'metadata',
      'containers',
      'fields_to_containers',
    ]);
    expect(jsonOf(got)['type']).toBe('DYNP');
    expect(jsonOf(got)['steps_completed']).toEqual(['get_metadata', 'get_flow_logic']);
  });

  it('겹치는 필드의 값은 서로 같다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    const got = jsonOf(
      await invoke(getScreen, harness, { program_name: 'SAPMV45A', screen_number: '0100' }),
    );
    const read = jsonOf(
      await invoke(readScreen, harness, { program_name: 'SAPMV45A', screen_number: '0100' }),
    );

    for (const key of ['success', 'program_name', 'screen_number', 'flow_logic', 'metadata', 'containers', 'fields_to_containers']) {
      expect(got[key]).toEqual(read[key]);
    }
  });

  it('인자 검증 문구가 다르다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(getScreen, harness, { program_name: 'ZA' }))).toBe(
      'Error: Missing required parameters: program_name and screen_number',
    );
    expect(textOf(await invoke(readScreen, harness, { program_name: 'ZA' }))).toBe(
      'Error: program_name and screen_number are required',
    );
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('실패 문구는 GetScreen만 접두사를 붙인다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ subrc: 3, message: 'Dynpro not found' }) });
    const inner = 'ZMCP_ADT_DISPATCH error (action=DYNPRO_READ, subrc=3): Dynpro not found';

    expect(
      textOf(await invoke(getScreen, harness, { program_name: 'ZA', screen_number: '9999' })),
    ).toBe(`Error: Failed to get screen: ${inner}`);
    expect(
      textOf(await invoke(readScreen, harness, { program_name: 'ZA', screen_number: '9999' })),
    ).toBe(`Error: ${inner}`);
  });
});
