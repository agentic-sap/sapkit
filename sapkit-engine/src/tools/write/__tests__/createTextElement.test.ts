/**
 * `CreateTextElement` — LOCK → TPOOL READ → 중복 검사 → TPOOL WRITE → UNLOCK →
 * (활성화).
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/text_element/high/handleCreateTextElement.ts:85-290`)의
 * 실측에서 뽑았다.
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

const PROGRAM_URI = '/sap/bc/adt/programs/programs/ZSAPKIT_DEMO';
const ACTIVATION = '/sap/bc/adt/activation';

const EXISTING = [{ ID: 'I', KEY: '001', ENTRY: 'First symbol', LENGTH: 12 }];

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

/** READ는 기존 풀을, WRITE는 성공을 돌려준다. */
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
    expect(await publishedSurfaceOf(createTextElement)).toEqual(
      publishedDeclaration('CreateTextElement'),
    );
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(createTextElement.definition.sets).toEqual(['high']);
    expect(createTextElement.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(createTextElement.definition.kind).toBe('mutation');
    expect(createTextElement.definition.targetNames).toEqual(['program_name']);
  });
});

describe('시퀀스와 와이어', () => {
  it('LOCK → (READ · WRITE) → UNLOCK 순이고, 활성화는 **해제 뒤**다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    const result = await invoke(createTextElement, harness, {
      program_name: 'zsapkit_demo',
      text_type: 'I',
      key: '002',
      text: 'Second symbol',
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(harness.adtCalls().map((call) => `${call.method} ${call.path}?${call.query.get('_action') ?? call.query.get('method')}`)).toEqual([
      `POST ${PROGRAM_URI}?LOCK`,
      `POST ${PROGRAM_URI}?UNLOCK`,
      `POST ${ACTIVATION}?activate`,
    ]);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['READ', 'WRITE']);
  });

  it('잠금 URI의 프로그램 이름은 **대문자 그대로**다 (검사 경로만 소문자를 쓴다)', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    await invoke(createTextElement, harness, {
      program_name: 'zsapkit_demo',
      text_type: 'I',
      key: '002',
      text: 'x',
    });
    expect(harness.nthAdt(0).path).toBe(PROGRAM_URI);
    expect(harness.nthAdt(0).url).toContain('accessMode=MODIFY');
  });

  it('WRITE에는 **읽은 전량 + 새 행**이 실린다 — TPOOL은 전량 교체다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: '002',
      text: 'Second symbol',
      language: 'k',
    });

    const write = harness.rfcCalls[1]!;
    expect(write.inputs['IV_ACTION']).toBe('WRITE');
    expect(write.inputs['IV_LANGUAGE']).toBe('K');
    expect(JSON.parse(write.inputs['IV_TEXTPOOL_JSON']!)).toEqual([
      { ID: 'I', KEY: '001', ENTRY: 'First symbol', LENGTH: 12 },
      { ID: 'I', KEY: '002', ENTRY: 'Second symbol', LENGTH: 13 },
    ]);
  });

  it('활성화 요청은 구가 손으로 조립하던 한 줄 XML 그대로다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'R',
      text: 'Title',
      activate: true,
    });

    const activation = harness.nthAdt(2);
    expect(activation.query.get('preauditRequested')).toBe('true');
    expect(activation.headers['content-type']).toBe(
      'application/vnd.sap.adt.activation.request+xml; charset=utf-8',
    );
    expect(activation.body).toBe(
      '<?xml version="1.0" encoding="utf-8"?>' +
        '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
        `<adtcore:objectReference adtcore:uri="${PROGRAM_URI}" adtcore:name="ZSAPKIT_DEMO"/>` +
        '</adtcore:objectReferences>',
    );
  });
});

describe('행 키 규칙', () => {
  it('"R"은 키를 주지 않으면 **프로그램 이름**이 키가 된다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder([]) });
    const body = jsonOf(
      await invoke(createTextElement, harness, {
        program_name: 'ZSAPKIT_DEMO',
        text_type: 'R',
        text: 'Demo report',
      }),
    );
    expect(body['key']).toBe('ZSAPKIT_DEMO');
    expect(JSON.parse(harness.rfcCalls[1]!.inputs['IV_TEXTPOOL_JSON']!)).toEqual([
      { ID: 'R', KEY: 'ZSAPKIT_DEMO', ENTRY: 'Demo report', LENGTH: 11 },
    ]);
  });

  it('"R"이 아니면 키가 없을 때 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    const result = await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'S',
      text: 'Plant',
    });
    expect(textOf(result)).toBe('Error: key is required for text_type "S"');
    expect(harness.adtCalls()).toHaveLength(0);
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('132자를 넘는 텍스트는 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    const result = await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: '001',
      text: 'x'.repeat(133),
    });
    expect(textOf(result)).toBe('Error: text exceeds max length (132 chars): got 133');
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('필수 인자가 빠지면 거절한다', async () => {
    harness = await startRfcHarness({});
    const result = await invoke(createTextElement, harness, { program_name: 'ZSAPKIT_DEMO' });
    expect(textOf(result)).toBe(
      'Error: Missing required parameters: program_name, text_type, text',
    );
  });
});

describe('갈래', () => {
  it('같은 (형, 키)가 이미 있으면 UpdateTextElement로 보낸다 — 쓰기는 나가지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: poolResponder() });
    const result = await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: ' 001 ',
      text: 'again',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to create text element: Text element already exists: ZSAPKIT_DEMO I/001. Use UpdateTextElement instead.',
    );
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['READ']);
    // 잠금은 풀렸다 — withLock이 실패 경로에서도 해제를 보장한다.
    expect(harness.adtCalls().map((call) => call.query.get('_action'))).toEqual(['LOCK', 'UNLOCK']);
  });

  it('장부 D93 — 활성화가 오류를 담은 200으로 오면 성공으로 접지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder({
        activation: activationBody([{ type: 'E', text: 'Program ZSAPKIT_DEMO is syntactically wrong' }]),
      }),
      rfc: poolResponder([]),
    });
    const result = await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: '001',
      text: 'x',
      activate: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: program ZSAPKIT_DEMO was not activated');
    expect(textOf(result)).toContain('Program ZSAPKIT_DEMO is syntactically wrong');
  });

  it('TPOOL WRITE가 subrc로 실패하면 대리자 문구를 그대로 싣는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(),
      rfc: (call) =>
        call.action === 'READ' ? { result: [] } : { subrc: 4, message: 'TPOOL locked' },
    });
    const result = await invoke(createTextElement, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_type: 'I',
      key: '001',
      text: 'x',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to create text element: ZSAPKIT_ADT_TEXTPOOL error (action=WRITE, subrc=4): TPOOL locked',
    );
  });
});
