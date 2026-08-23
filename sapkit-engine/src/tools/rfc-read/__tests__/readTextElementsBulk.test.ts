/**
 * `ReadTextElementsBulk` — 한 번의 READ로 네 형을 갈라 싣는다.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/text_element/high/handleReadTextElementsBulk.ts:54-136`)의
 * 실측에서 뽑았다. 특히 **부분 처리**(알 수 없는 ID 행)의 계약을 못 박는다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import { getTextElement } from '../getTextElement';
import { readTextElementsBulk } from '../readTextElementsBulk';
import {
  type RfcHarness,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
} from './rfcToolSupport';

const POOL = [
  { ID: 'R', KEY: 'ZSAPKIT_DEMO', ENTRY: 'Demo report', LENGTH: 11 },
  { ID: 'I', KEY: '001', ENTRY: 'First symbol', LENGTH: 12 },
  { ID: 'S', KEY: 'P_WERKS ', ENTRY: 'Plant', LENGTH: 5 },
  { ID: 'H', KEY: 'listHeader', ENTRY: 'Inventory', LENGTH: 9 },
];

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(readTextElementsBulk)).toEqual(
      publishedDeclaration('ReadTextElementsBulk'),
    );
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · read', () => {
    expect(readTextElementsBulk.definition.sets).toEqual(['high']);
    expect(readTextElementsBulk.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(readTextElementsBulk.definition.kind).toBe('read');
    expect(readTextElementsBulk.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('GetTextElement와 **같은 요청**을 보낸다 — 다른 것은 응답 조립뿐이다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: POOL }) });
    await invoke(readTextElementsBulk, harness, { program_name: 'zsapkit_demo', language: 'k' });
    const bulkCall = harness.rfcCalls[0]!;

    await invoke(getTextElement, harness, { program_name: 'zsapkit_demo', language: 'k' });
    const singleCall = harness.rfcCalls[1]!;

    expect(bulkCall.functionImport).toBe('Textpool');
    expect(bulkCall.inputs).toEqual({
      IV_ACTION: 'READ',
      IV_PROGRAM: 'ZSAPKIT_DEMO',
      IV_LANGUAGE: 'K',
      IV_TEXTPOOL_JSON: '',
    });
    expect(bulkCall.inputs).toEqual(singleCall.inputs);
    expect(harness.adtCalls()).toHaveLength(0);
  });
});

describe('형별 가르기', () => {
  it('네 형을 각자 자리에 싣고 R은 `r` 하나로 접는다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: POOL }) });
    const body = jsonOf(
      await invoke(readTextElementsBulk, harness, { program_name: 'ZSAPKIT_DEMO' }),
    );

    expect(body).toEqual({
      success: true,
      program_name: 'ZSAPKIT_DEMO',
      language: null,
      counts: { R: 1, I: 1, S: 1, H: 1, total: 4 },
      r: { text: 'Demo report', length: 11 },
      symbols: [{ key: '001', text: 'First symbol' }],
      selections: [{ key: 'P_WERKS', text: 'Plant' }],
      headings: [{ key: 'listHeader', text: 'Inventory' }],
    });
  });

  it('선택화면 키만 trim 한다 — I·H의 키는 받은 그대로다', async () => {
    harness = await startRfcHarness({
      rfc: () => ({
        result: [
          { ID: 'I', KEY: '001 ', ENTRY: 'sym', LENGTH: 3 },
          { ID: 'H', KEY: 'listHeader ', ENTRY: 'head', LENGTH: 4 },
          { ID: 'S', KEY: 'P_X     ', ENTRY: 'sel', LENGTH: 3 },
        ],
      }),
    });
    const body = jsonOf(
      await invoke(readTextElementsBulk, harness, { program_name: 'ZSAPKIT_DEMO' }),
    );
    expect(body['symbols']).toEqual([{ key: '001 ', text: 'sym' }]);
    expect(body['headings']).toEqual([{ key: 'listHeader ', text: 'head' }]);
    expect(body['selections']).toEqual([{ key: 'P_X', text: 'sel' }]);
  });

  it('R이 여럿이면 **마지막**이 이긴다 (구의 덮어쓰기)', async () => {
    harness = await startRfcHarness({
      rfc: () => ({
        result: [
          { ID: 'R', KEY: 'ZA', ENTRY: 'first title', LENGTH: 11 },
          { ID: 'R', KEY: 'ZB', ENTRY: 'second title', LENGTH: 12 },
        ],
      }),
    });
    const body = jsonOf(await invoke(readTextElementsBulk, harness, { program_name: 'ZA' }));
    expect(body['r']).toEqual({ text: 'second title', length: 12 });
    expect(body['counts']).toEqual({ R: 2, I: 0, S: 0, H: 0, total: 2 });
  });

  it('R이 없으면 `r`은 null이다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ result: [POOL[1]] }) });
    const body = jsonOf(await invoke(readTextElementsBulk, harness, { program_name: 'ZA' }));
    expect(body['r']).toBeNull();
  });
});

describe('부분 처리 — 알 수 없는 ID 행', () => {
  it('버킷에서는 빠지지만 `counts.total`에는 남는다 — 합이 어긋나는 것이 신호다', async () => {
    harness = await startRfcHarness({
      rfc: () => ({
        result: [
          { ID: 'I', KEY: '001', ENTRY: 'ok', LENGTH: 2 },
          { ID: 'X', KEY: 'ZZZ', ENTRY: 'unknown type', LENGTH: 12 },
          { ID: '', KEY: 'ZZZ', ENTRY: 'no type', LENGTH: 7 },
        ],
      }),
    });
    const body = jsonOf(await invoke(readTextElementsBulk, harness, { program_name: 'ZA' }));

    const counts = body['counts'] as Record<string, number>;
    expect(counts).toEqual({ R: 0, I: 1, S: 0, H: 0, total: 3 });
    // 버킷 합 1 < total 3 — 두 행이 떨어졌다는 뜻이다.
    expect(counts['R']! + counts['I']! + counts['S']! + counts['H']!).toBeLessThan(counts['total']!);
    expect(body['symbols']).toEqual([{ key: '001', text: 'ok' }]);
  });

  it('소문자 필드 이름도 받는다 (구의 방어 갈래)', async () => {
    harness = await startRfcHarness({
      rfc: () => ({ result: [{ id: 'i', key: '007', entry: 'lower', length: 5 }] }),
    });
    const body = jsonOf(await invoke(readTextElementsBulk, harness, { program_name: 'ZA' }));
    expect(body['symbols']).toEqual([{ key: '007', text: 'lower' }]);
  });
});

describe('갈래', () => {
  it('program_name이 없으면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    const result = await invoke(readTextElementsBulk, harness, {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: program_name is required');
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('subrc가 0이 아니면 이 도구 이름을 단 문구로 실패한다', async () => {
    harness = await startRfcHarness({ rfc: () => ({ subrc: 8, message: 'no TPOOL' }) });
    const result = await invoke(readTextElementsBulk, harness, { program_name: 'ZNOPE' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: ReadTextElementsBulk failed: ZSAPKIT_ADT_TEXTPOOL error (action=READ, subrc=8): no TPOOL',
    );
  });
});
