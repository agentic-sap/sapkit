/**
 * `DeleteTextElement` — 발행 계약 · LOCK → READ → WRITE(남은 전량) → UNLOCK →
 * (활성화) · **와일드카드 두 층** · D114(활성화 거짓 성공) · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteTextElement`
 *  - 겉 핸들러: `engine/src/handlers/text_element/high/handleDeleteTextElement.ts:22-269`
 *  - 잠금·활성화 와이어: `src/tools/write/internal/programScoped.ts` 머리주석
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
import { deleteTextElement } from '../deleteTextElement';
import { describeTierGate, exposureMemberships } from './deletionSupport';

const PROGRAM = 'ZSAPKIT_TXT';
const PROGRAM_URI = `/sap/bc/adt/programs/programs/${PROGRAM}`;
const ACTIVATION = '/sap/bc/adt/activation';

const POOL = [
  { ID: 'I', KEY: '001', ENTRY: 'Hello', LENGTH: 5 },
  { ID: 'I', KEY: '002', ENTRY: 'World', LENGTH: 5 },
  { ID: 'S', KEY: 'P_MATNR', ENTRY: 'Material', LENGTH: 8 },
  { ID: 'R', KEY: PROGRAM, ENTRY: 'Demo report', LENGTH: 11 },
];

function adtResponder(activation?: string): AdtResponder {
  return (request, response) => {
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('LOCK-TXT'));
    }
    if (request.path === PROGRAM_URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === ACTIVATION) return xml(response, activation ?? activationBody());
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

const readThenWrite: RfcResponder = (call) =>
  call.action === 'READ' ? { result: POOL } : { result: {} };

/** WRITE에 실려 나간 남은 전량. */
function writtenRows(harness: RfcHarness): Array<Record<string, unknown>> {
  const write = harness.rfcCalls.find((call) => call.action === 'WRITE');
  return JSON.parse(String(write?.inputs['IV_TEXTPOOL_JSON'] ?? write?.params?.textpool_json ?? '[]'));
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteTextElement)).toEqual(
      publishedDeclaration('DeleteTextElement'),
    );
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteTextElement.definition.sets).toEqual(['high']);
    expect(deleteTextElement.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(deleteTextElement.definition.kind).toBe('mutation');
    expect(deleteTextElement.definition.targetNames).toEqual(['program_name']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다 — 클라우드에는 없다', () => {
    expect(exposureMemberships('DeleteTextElement')).toEqual(['connected_default']);
  });
});

describe('시퀀스 — LOCK → READ → WRITE → UNLOCK', () => {
  it('대리자에게 READ · WRITE 둘을 부르고 남은 전량을 쓴다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const result = await invoke(deleteTextElement, harness, {
      program_name: PROGRAM.toLowerCase(),
      text_type: 'I',
      key: '001',
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['READ', 'WRITE']);
    expect(writtenRows(harness).map((row) => `${row.ID}/${row.KEY}`)).toEqual([
      'I/002',
      'S/P_MATNR',
      `R/${PROGRAM}`,
    ]);
  });

  it('ADT 축은 잠금과 해제 둘뿐이다 (활성화 없이)', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    await invoke(deleteTextElement, harness, { program_name: PROGRAM, text_type: 'I', key: '001' });

    expect(harness.adtCalls().map((call) => call.query.get('_action'))).toEqual(['LOCK', 'UNLOCK']);
    expect(harness.adtCalls().map((call) => call.path)).not.toContain(ACTIVATION);
  });

  it('성공 응답은 구의 아홉 칸 그대로다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    expect(
      jsonOf(
        await invoke(deleteTextElement, harness, {
          program_name: PROGRAM,
          text_type: 'I',
          key: '001',
        }),
      ),
    ).toEqual({
      success: true,
      program_name: PROGRAM,
      text_type: 'I',
      key: '001',
      language: null,
      rows_removed: 1,
      rows_remaining: 3,
      activated: false,
      message: `Text element ${PROGRAM} I/001 deleted (not activated).`,
      steps_completed: ['lock', 'read', 'write', 'unlock'],
    });
  });
});

describe('와일드카드 두 층 — `*`가 자리마다 뜻이 다르다', () => {
  it('key="*"는 그 text_type의 모든 행을 지운다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const payload = jsonOf(
      await invoke(deleteTextElement, harness, { program_name: PROGRAM, text_type: 'I', key: '*' }),
    );
    expect(payload.rows_removed).toBe(2);
    expect(writtenRows(harness).map((row) => row.ID)).toEqual(['S', 'R']);
  });

  it('text_type="*"는 **풀 전체**를 비운다 — key를 보지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const payload = jsonOf(
      await invoke(deleteTextElement, harness, {
        program_name: PROGRAM,
        text_type: '*',
        key: '001',
      }),
    );
    expect(payload.rows_removed).toBe(4);
    expect(payload.rows_remaining).toBe(0);
    expect(writtenRows(harness)).toEqual([]);
  });

  it('text_type="R"은 key의 기본값이 **프로그램 이름**이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const payload = jsonOf(
      await invoke(deleteTextElement, harness, { program_name: PROGRAM, text_type: 'R' }),
    );
    expect(payload.key).toBe(PROGRAM);
    expect(payload.rows_removed).toBe(1);
  });

  it('다른 종류에서 key가 비면 요청을 보내지 않고 거절한다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const result = await invoke(deleteTextElement, harness, {
      program_name: PROGRAM,
      text_type: 'S',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: key is required for text_type "S" (use "*" to delete all rows of this type)',
    );
    expect(harness.rfcCalls).toHaveLength(0);
  });
});

describe('갈래', () => {
  it('인자가 빠지면 요청을 하나도 보내지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const result = await invoke(deleteTextElement, harness, { program_name: PROGRAM });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Missing required parameters: program_name, text_type');
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('**지워진 행이 0이면 쓰지 않고 실패한다** — 없는 것을 지웠다고 답하지 않는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const result = await invoke(deleteTextElement, harness, {
      program_name: PROGRAM,
      text_type: 'I',
      key: 'NOPE',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Error: Failed to delete text element: Text element not found: ${PROGRAM} I/NOPE`,
    );
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['READ']);
  });
});

describe('D114 — 부모 프로그램 활성화의 거짓 성공을 접지 않는다', () => {
  it('activate=true면 해제 뒤에 활성화가 나간다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(), rfc: readThenWrite });
    const payload = jsonOf(
      await invoke(deleteTextElement, harness, {
        program_name: PROGRAM,
        text_type: 'I',
        key: '001',
        activate: true,
      }),
    );

    expect(harness.adtCalls().map((call) => call.path)).toEqual([
      PROGRAM_URI,
      PROGRAM_URI,
      ACTIVATION,
    ]);
    expect(payload.activated).toBe(true);
    expect(payload.steps_completed).toEqual(['lock', 'read', 'write', 'unlock', 'activate']);
  });

  it('type="E"가 하나라도 있으면 실패다 (구는 activated:true였다)', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(activationBody([{ type: 'E', text: 'Program is inconsistent' }])),
      rfc: readThenWrite,
    });
    const result = await invoke(deleteTextElement, harness, {
      program_name: PROGRAM,
      text_type: 'I',
      key: '001',
      activate: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Program is inconsistent');
  });

  it('경고만 있는 활성화는 성공이다 — 과수리 역검증', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(activationBody([{ type: 'W', text: 'Obsolete statement' }])),
      rfc: readThenWrite,
    });
    const result = await invoke(deleteTextElement, harness, {
      program_name: PROGRAM,
      text_type: 'I',
      key: '001',
      activate: true,
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).activated).toBe(true);
  });
});

describeTierGate(deleteTextElement, { program_name: PROGRAM, text_type: 'I', key: '001' });
