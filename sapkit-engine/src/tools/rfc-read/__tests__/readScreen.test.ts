/**
 * `ReadScreen` — `DYNPRO_READ` 한 번.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/screen/readonly/handleReadScreen.ts:37-97`)의 실측에서
 * 뽑았다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
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
  HEADER: { PROGRAM: 'SAPMV45A', SCREEN: '0100', DESCRIPT: 'Overview' },
  CONTAINERS: [{ NAME: 'MAIN' }],
  FIELDS_TO_CONTAINERS: [{ FIELD: 'VBAK-VBELN', CONTAINER: 'MAIN' }],
  FLOW_LOGIC: [
    { LINE: 'PROCESS BEFORE OUTPUT.' },
    { LINE: '  MODULE STATUS_0100.' },
    { LINE: 'PROCESS AFTER INPUT.' },
  ],
};

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(readScreen)).toEqual(publishedDeclaration('ReadScreen'));
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/legacy · read', () => {
    expect(readScreen.definition.sets).toEqual(['readonly']);
    expect(readScreen.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(readScreen.definition.kind).toBe('read');
    expect(readScreen.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('Dispatch DYNPRO_READ 한 번이고 인자 키 순서는 program → dynpro다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    await invoke(readScreen, harness, { program_name: 'sapmv45a', screen_number: '0100' });

    const call = harness.rfcCalls[0]!;
    expect(call.functionImport).toBe('Dispatch');
    expect(call.action).toBe('DYNPRO_READ');
    expect(call.inputs['IV_PARAMS']).toBe('{"program":"SAPMV45A","dynpro":"0100"}');
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('화면 번호는 대문자로 올리지 않는다 — 프로그램 이름만 올린다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    await invoke(readScreen, harness, { program_name: 'zscr', screen_number: 'x0100' });
    expect(harness.rfcCalls[0]!.params).toEqual({ program: 'ZSCR', dynpro: 'x0100' });
  });
});

describe('응답 조립', () => {
  it('흐름 로직 줄들을 줄바꿈으로 이어 붙인다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: DYNPRO }) });
    const body = jsonOf(
      await invoke(readScreen, harness, { program_name: 'SAPMV45A', screen_number: '0100' }),
    );

    expect(body).toEqual({
      success: true,
      program_name: 'SAPMV45A',
      screen_number: '0100',
      flow_logic: 'PROCESS BEFORE OUTPUT.\n  MODULE STATUS_0100.\nPROCESS AFTER INPUT.',
      metadata: DYNPRO.HEADER,
      containers: DYNPRO.CONTAINERS,
      fields_to_containers: DYNPRO.FIELDS_TO_CONTAINERS,
    });
  });

  it('FLOW_LOGIC이 배열이 아니면 null이다 — 빈 문자열이 아니다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: { HEADER: null } }) });
    const body = jsonOf(
      await invoke(readScreen, harness, { program_name: 'ZA', screen_number: '0100' }),
    );
    expect(body['flow_logic']).toBeNull();
    expect(body['metadata']).toBeNull();
    expect(body['containers']).toEqual([]);
    expect(body['fields_to_containers']).toEqual([]);
  });

  it('소문자 필드 이름도 받는다 (구의 방어 갈래)', async () => {
    harness = await startRfcHarness({
      rfc: () => ({
        result: {
          header: { program: 'ZA' },
          containers: [{ name: 'C' }],
          fields_to_containers: [{ field: 'F' }],
          flow_logic: [{ line: 'A.' }, { line: 'B.' }],
        },
      }),
    });
    const body = jsonOf(
      await invoke(readScreen, harness, { program_name: 'ZA', screen_number: '0100' }),
    );
    expect(body['flow_logic']).toBe('A.\nB.');
    expect(body['metadata']).toEqual({ program: 'ZA' });
  });
});

describe('갈래', () => {
  it('인자가 빠지면 SAP에 나가기 전에 거절한다 — 문구가 GetScreen과 다르다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(readScreen, harness, { program_name: 'ZA' }))).toBe(
      'Error: program_name and screen_number are required',
    );
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('대리자 실패 문구에 **접두사를 붙이지 않는다** — GetScreen과 갈리는 자리', async () => {
    harness = await startRfcHarness({ rfc: () => ({ subrc: 3, message: 'Dynpro not found' }) });
    const result = await invoke(readScreen, harness, {
      program_name: 'ZA',
      screen_number: '9999',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: ZSAPKIT_ADT_DISPATCH error (action=DYNPRO_READ, subrc=3): Dynpro not found',
    );
  });
});
