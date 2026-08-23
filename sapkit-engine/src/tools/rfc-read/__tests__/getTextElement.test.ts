/**
 * `GetTextElement` — 텍스트풀 READ 한 번 + 클라이언트쪽 걸러 내기.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/text_element/high/handleGetTextElement.ts:59-141`)와 그
 * 아래 통로(`engine/src/lib/odataRfc.ts:331-357`)의 실측에서 뽑았다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { getTextElement } from '../getTextElement';
import {
  type RfcHarness,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
} from './rfcToolSupport';

/** 구가 실제로 받던 모양 — 필드 이름이 대문자다(`/ui2/cl_json=>serialize`). */
const POOL = [
  { ID: 'R', KEY: 'ZSAPKIT_DEMO', ENTRY: 'Demo report', LENGTH: 11 },
  { ID: 'I', KEY: '001', ENTRY: 'First symbol', LENGTH: 12 },
  { ID: 'I', KEY: '002', ENTRY: 'Second symbol', LENGTH: 13 },
  { ID: 'S', KEY: 'P_WERKS ', ENTRY: 'Plant', LENGTH: 5 },
];

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(getTextElement)).toEqual(publishedDeclaration('GetTextElement'));
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · read', () => {
    expect(getTextElement.definition.sets).toEqual(['high']);
    expect(getTextElement.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getTextElement.definition.kind).toBe('read');
    expect(getTextElement.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('Textpool READ 한 번만 나가고, 이름과 언어는 대문자로 실린다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: POOL }) });
    const result = await invoke(getTextElement, harness, {
      program_name: 'zsapkit_demo',
      language: 'k',
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls).toHaveLength(1);
    const call = harness.rfcCalls[0]!;
    expect(call.functionImport).toBe('Textpool');
    expect(call.inputs).toEqual({
      IV_ACTION: 'READ',
      IV_PROGRAM: 'ZSAPKIT_DEMO',
      IV_LANGUAGE: 'K',
      IV_TEXTPOOL_JSON: '',
    });
    // ADT 축은 한 번도 타지 않는다 — 이 도구는 대리자 하나로 끝난다.
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('언어를 주지 않으면 IV_LANGUAGE가 빈 문자열로 나간다 (로그온 언어에 맡긴다)', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: [] }) });
    await invoke(getTextElement, harness, { program_name: 'ZSAPKIT_DEMO' });
    expect(harness.rfcCalls[0]!.inputs['IV_LANGUAGE']).toBe('');
  });
});

describe('걸러 내기', () => {
  it('필터가 없으면 받은 행을 그대로 싣는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: POOL }) });
    const body = jsonOf(await invoke(getTextElement, harness, { program_name: 'ZSAPKIT_DEMO' }));

    expect(body).toMatchObject({
      success: true,
      program_name: 'ZSAPKIT_DEMO',
      language: null,
      text_type: null,
      key: null,
      total_rows: 4,
      steps_completed: ['get_text_pool'],
    });
    expect(body['text_elements']).toEqual(POOL);
  });

  it('text_type은 대문자 비교로 거른다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: POOL }) });
    const body = jsonOf(
      await invoke(getTextElement, harness, { program_name: 'ZSAPKIT_DEMO', text_type: 'I' }),
    );
    expect(body['total_rows']).toBe(2);
    expect(body['text_type']).toBe('I');
  });

  it('key는 **양끝 공백을 떼고** 대문자로 비교한다 — SAP이 KEY를 오른쪽 공백으로 채운다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: POOL }) });
    const body = jsonOf(
      await invoke(getTextElement, harness, { program_name: 'ZSAPKIT_DEMO', key: ' p_werks ' }),
    );
    expect(body['total_rows']).toBe(1);
    expect(body['key']).toBe('P_WERKS');
    expect(body['text_elements']).toEqual([POOL[3]]);
  });

  it('EV_RESULT가 배열이 아니면 빈 목록이다 — 오류가 아니다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: { unexpected: true } }) });
    const body = jsonOf(await invoke(getTextElement, harness, { program_name: 'ZSAPKIT_DEMO' }));
    expect(body['total_rows']).toBe(0);
    expect(body['text_elements']).toEqual([]);
  });
});

describe('갈래', () => {
  it('program_name이 없으면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    const result = await invoke(getTextElement, harness, {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Missing required parameter: program_name');
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('subrc가 0이 아니면 대리자 문구를 그대로 실어 실패한다', async () => {
    harness = await startRfcHarness({
      rfc: () => ({ subrc: 4, message: 'Program ZNOPE not found', result: [] }),
    });
    const result = await invoke(getTextElement, harness, { program_name: 'ZNOPE' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to read text elements: ZSAPKIT_ADT_TEXTPOOL error (action=READ, subrc=4): Program ZNOPE not found',
    );
  });
});
