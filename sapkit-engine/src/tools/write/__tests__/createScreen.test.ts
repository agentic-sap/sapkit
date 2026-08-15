/**
 * `CreateScreen` — DYNPRO_INSERT → 부모 프로그램 트리 구문검사 → (활성화).
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/screen/high/handleCreateScreen.ts:64-182`)와 그 검사
 * 경로(`engine/src/lib/preCheckBeforeActivation.ts:375-387`·`:649-671`)의
 * 실측에서 뽑았다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  activationBody,
  cleanCheckRun,
  failingCheckRun,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { createScreen } from '../createScreen';

const CHECKRUNS = '/sap/bc/adt/checkruns';
const ACTIVATION = '/sap/bc/adt/activation';

function adtResponder(options: { check?: string; activation?: string } = {}): AdtResponder {
  return (request, response) => {
    if (request.path === CHECKRUNS) return xml(response, options.check ?? cleanCheckRun());
    if (request.path === ACTIVATION) return xml(response, options.activation ?? activationBody());
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
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(createScreen)).toEqual(publishedDeclaration('CreateScreen'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(createScreen.definition.sets).toEqual(['high']);
    expect(createScreen.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(createScreen.definition.kind).toBe('mutation');
    expect(createScreen.definition.targetNames).toEqual(['program_name']);
  });
});

describe('시퀀스와 와이어', () => {
  it('DYNPRO_INSERT → 구문검사 → 활성화 순이고 **잠그지 않는다**', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    const result = await invoke(createScreen, harness, {
      program_name: 'zsapkit_scr',
      screen_number: '0100',
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['DYNPRO_INSERT']);
    expect(harness.adtCalls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${CHECKRUNS}`,
      `POST ${ACTIVATION}`,
    ]);
    // 잠금 요청은 한 번도 없다 — 형제 UpdateScreen과 갈리는 자리다.
    expect(harness.adtCalls().some((call) => call.query.get('_action') === 'LOCK')).toBe(false);
  });

  it('구문검사 URI만 프로그램 이름을 **소문자**로 쓴다 (활성화 URI는 대문자)', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    await invoke(createScreen, harness, {
      program_name: 'ZSAPKIT_SCR',
      screen_number: '0100',
      activate: true,
    });

    const check = harness.nthAdt(0);
    expect(check.url).toBe(`${CHECKRUNS}?reporters=abapCheckRun`);
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.body).toContain(
      'adtcore:uri="/sap/bc/adt/programs/programs/zsapkit_scr" chkrun:version="inactive"',
    );
    expect(harness.nthAdt(1).body).toContain(
      'adtcore:uri="/sap/bc/adt/programs/programs/ZSAPKIT_SCR"',
    );
  });

  it('dynpro_data를 주지 않으면 구가 적어 두던 최소 뼈대를 보낸다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    await invoke(createScreen, harness, { program_name: 'ZSCR', screen_number: '0100' });

    const params = harness.rfcCalls[0]!.params as Record<string, string>;
    expect(Object.keys(params)).toEqual(['program', 'dynpro', 'dynpro_data']);
    expect(JSON.parse(params['dynpro_data']!)).toEqual({
      HEADER: {
        PROGRAM: 'ZSCR',
        SCREEN: '0100',
        LANGUAGE: 'E',
        DESCRIPT: 'Screen 0100',
        TYPE: 'N',
        LINES: 20,
        COLUMNS: 83,
      },
      CONTAINERS: [],
      FIELDS_TO_CONTAINERS: [],
      FLOW_LOGIC: [
        { LINE: 'PROCESS BEFORE OUTPUT.' },
        { LINE: '* MODULE STATUS_0100.' },
        { LINE: '' },
        { LINE: 'PROCESS AFTER INPUT.' },
        { LINE: '* MODULE USER_COMMAND_0100.' },
      ],
    });
  });

  it('description을 주면 뼈대의 DESCRIPT가 그것이 된다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0100',
      description: 'Overview',
    });
    const params = harness.rfcCalls[0]!.params as Record<string, string>;
    expect(JSON.parse(params['dynpro_data']!).HEADER.DESCRIPT).toBe('Overview');
  });
});

describe('dynpro_data 손질', () => {
  it('소문자 키를 정본 대문자 키로 옮기고 PROGRAM·SCREEN을 채운다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0200',
      dynpro_data: JSON.stringify({
        metadata: { descript: 'Detail', lines: 10 },
        containers: [{ name: 'MAIN' }],
        flow_logic: 'PROCESS BEFORE OUTPUT.\nPROCESS AFTER INPUT.',
      }),
    });

    const params = harness.rfcCalls[0]!.params as Record<string, string>;
    expect(JSON.parse(params['dynpro_data']!)).toEqual({
      HEADER: { DESCRIPT: 'Detail', LINES: 10, PROGRAM: 'ZSCR', SCREEN: '0200' },
      CONTAINERS: [{ NAME: 'MAIN' }],
      FLOW_LOGIC: [{ LINE: 'PROCESS BEFORE OUTPUT.' }, { LINE: 'PROCESS AFTER INPUT.' }],
    });
  });

  it('호출자가 준 HEADER.PROGRAM·SCREEN이 있으면 덮지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0200',
      dynpro_data: JSON.stringify({ HEADER: { PROGRAM: 'ZOTHER', SCREEN: '9000' } }),
    });
    const params = harness.rfcCalls[0]!.params as Record<string, string>;
    expect(JSON.parse(params['dynpro_data']!).HEADER).toEqual({
      PROGRAM: 'ZOTHER',
      SCREEN: '9000',
    });
  });

  it('JSON이 아니면 손대지 않고 그대로 보낸다 — 판정은 ABAP 몫이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0200',
      dynpro_data: 'not json at all',
    });
    const params = harness.rfcCalls[0]!.params as Record<string, string>;
    expect(params['dynpro_data']).toBe('not json at all');
  });
});

describe('갈래', () => {
  it('인자가 빠지면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(createScreen, harness, { program_name: 'ZSCR' }))).toBe(
      'Error: Missing required parameters: program_name and screen_number',
    );
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('구문검사가 오류를 내면 **접두사 없이** 줄번호까지 담아 실패한다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ check: failingCheckRun('Field VBELN is unknown', '12') }),
      rfc: () => ({ result: {} }),
    });
    const result = await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0100',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Screen ZSCR/0100 preCheck syntax check failed (1 error): [L12] Field VBELN is unknown',
    );
    // 검사가 실패했으니 활성화까지 가지 않는다.
    expect(harness.adtCalls().map((call) => call.path)).toEqual([CHECKRUNS]);
  });

  it('DYNPRO_INSERT가 실패하면 검사도 돌지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: () => ({ subrc: 3, message: 'Program not found' }),
    });
    const result = await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0100',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to create screen: ZMCP_ADT_DISPATCH error (action=DYNPRO_INSERT, subrc=3): Program not found',
    );
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ activation: activationBody([{ type: 'E', text: 'Dynpro is inconsistent' }]) }),
      rfc: () => ({ result: {} }),
    });
    const result = await invoke(createScreen, harness, {
      program_name: 'ZSCR',
      screen_number: '0100',
      activate: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZSCR was not activated');
  });
});

describe('응답', () => {
  it('활성화하지 않으면 그렇게 답한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: () => ({ result: {} }) });
    const body = jsonOf(
      await invoke(createScreen, harness, { program_name: 'ZSCR', screen_number: '0100' }),
    );
    expect(body).toEqual({
      success: true,
      program_name: 'ZSCR',
      screen_number: '0100',
      type: 'DYNP',
      activated: false,
      message: 'Screen ZSCR/0100 created (not activated).',
      steps_completed: ['create'],
    });
  });
});
