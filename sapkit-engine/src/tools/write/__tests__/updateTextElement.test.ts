/**
 * `UpdateTextElement` — Create와 같은 시퀀스, 가운데 한 걸음만 다르다.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/text_element/high/handleUpdateTextElement.ts:78-269`)의
 * 실측에서 뽑았고, `Create`와의 **갈림**을 한 시험에서 나란히 못 박는다.
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
import { createTextElement } from '../createTextElement';
import { updateTextElement } from '../updateTextElement';

const PROGRAM_URI = '/sap/bc/adt/programs/programs/ZSAPKIT_DEMO';
const ACTIVATION = '/sap/bc/adt/activation';

/** KEY의 오른쪽 공백은 SAP이 채워 보내는 그대로다. */
const EXISTING = [
  { ID: 'R', KEY: 'ZSAPKIT_DEMO', ENTRY: 'Old title', LENGTH: 9 },
  { ID: 'I', KEY: '001 ', ENTRY: 'Old symbol', LENGTH: 10 },
  { ID: 'S', KEY: 'P_WERKS ', ENTRY: 'Plant', LENGTH: 5 },
];

function adtResponder(options: { activation?: string } = {}): AdtResponder {
  return (request, response) => {
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody());
    }
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === ACTIVATION) {
      return xml(response, options.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

function poolResponder(existing: unknown[] = EXISTING): RfcResponder {
  return (call) => (call.action === 'READ' ? { result: existing } : { result: [] });
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(updateTextElement)).toEqual(
      publishedDeclaration('UpdateTextElement'),
    );
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(updateTextElement.definition.sets).toEqual(['high']);
    expect(updateTextElement.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(updateTextElement.definition.kind).toBe('mutation');
    expect(updateTextElement.definition.targetNames).toEqual(['program_name']);
  });
});

describe('시퀀스와 와이어', () => {
  it('LOCK → (READ · WRITE) → UNLOCK → 활성화 순이다 — Create와 같다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    const result = await invoke(updateTextElement, harness, {
      program_name: 'zsapkit_demo',
      text_type: 'I',
      key: '001',
      text: 'New symbol',
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(harness.adtCalls().map((call) => call.query.get('_action') ?? call.query.get('method'))).toEqual([
      'LOCK',
      'UNLOCK',
      'activate',
    ]);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['READ', 'WRITE']);
  });

  it('바꾼 행은 **제자리에서** 통째 교체되고 나머지 행은 그대로 실린다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    await invoke(updateTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: '001',
      text: 'New symbol',
    });

    expect(JSON.parse(harness.rfcCalls[1]!.inputs['IV_TEXTPOOL_JSON']!)).toEqual([
      { ID: 'R', KEY: 'ZSAPKIT_DEMO', ENTRY: 'Old title', LENGTH: 9 },
      // 자리는 그대로, KEY는 정규화된 값으로 다시 쓰인다(오른쪽 공백이 사라진다).
      { ID: 'I', KEY: '001', ENTRY: 'New symbol', LENGTH: 10 },
      { ID: 'S', KEY: 'P_WERKS ', ENTRY: 'Plant', LENGTH: 5 },
    ]);
  });

  it('"R"은 키 없이도 프로그램 제목 행을 찾아 바꾼다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    const body = jsonOf(
      await invoke(updateTextElement, harness, {
        program_name: 'ZSAPKIT_DEMO',
        text_type: 'R',
        text: 'New title',
      }),
    );
    expect(body['key']).toBe('ZSAPKIT_DEMO');
    expect(JSON.parse(harness.rfcCalls[1]!.inputs['IV_TEXTPOOL_JSON']!)[0]).toEqual({
      ID: 'R',
      KEY: 'ZSAPKIT_DEMO',
      ENTRY: 'New title',
      LENGTH: 9,
    });
  });
});

describe('Create와의 갈림 — 같은 입력, 반대 판정', () => {
  it('있는 행: Update는 덮어쓰고 Create는 거절한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    const args = { program_name: 'ZSAPKIT_DEMO', text_type: 'I', key: '001', text: 'x' };

    const updated = await invoke(updateTextElement, harness, args);
    const created = await invoke(createTextElement, harness, args);

    expect(updated.isError).toBe(false);
    expect(created.isError).toBe(true);
    expect(textOf(created)).toContain('Text element already exists');
  });

  it('없는 행: Update는 거절하고 Create는 붙인다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    const args = { program_name: 'ZSAPKIT_DEMO', text_type: 'I', key: '999', text: 'x' };

    const updated = await invoke(updateTextElement, harness, args);
    const created = await invoke(createTextElement, harness, args);

    expect(updated.isError).toBe(true);
    expect(textOf(updated)).toBe(
      'Error: Failed to update text element: Text element not found: ZSAPKIT_DEMO I/999. Use CreateTextElement to add it.',
    );
    expect(created.isError).toBe(false);
  });
});

describe('갈래', () => {
  it('필수 인자가 빠지면 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(updateTextElement, harness, { program_name: 'ZA' }))).toBe(
      'Error: Missing required parameters: program_name, text_type, text',
    );
  });

  it('"R"이 아닌데 키가 없으면 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(
        await invoke(updateTextElement, harness, {
          program_name: 'ZA',
          text_type: 'H',
          text: 'head',
        }),
      ),
    ).toBe('Error: key is required for text_type "H"');
  });

  it('132자를 넘으면 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(
        await invoke(updateTextElement, harness, {
          program_name: 'ZA',
          text_type: 'I',
          key: '001',
          text: 'x'.repeat(140),
        }),
      ),
    ).toBe('Error: text exceeds max length (132 chars): got 140');
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({ activation: activationBody([{ type: 'E', text: 'Syntax error' }]) }),
      rfc: poolResponder(),
    });
    const result = await invoke(updateTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: '001',
      text: 'x',
      activate: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZSAPKIT_DEMO was not activated');
  });
});
