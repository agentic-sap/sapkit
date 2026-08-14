/**
 * `WriteTextElementsBulk` — RFC 쓰기 한 번으로 여러 행을 등록한다.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/text_element/high/handleWriteTextElementsBulk.ts:133-284`)의
 * 실측에서 뽑았다. **부분 실패 처리**가 이 도구의 핵심 계약이므로 거기에 무게를
 * 실었다 — 결론부터 말하면 **부분 상태가 존재하지 않는다.**
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type RfcHarness,
  type RfcResponder,
  invoke,
  jsonOf,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { writeTextElementsBulk } from '../writeTextElementsBulk';

const EXISTING = [
  { ID: 'I', KEY: '001', ENTRY: 'Old one', LENGTH: 7 },
  { ID: 'S', KEY: 'P_WERKS ', ENTRY: 'Plant', LENGTH: 5 },
];

function poolResponder(existing: unknown[] = EXISTING): RfcResponder {
  return (call) => (call.action === 'READ' ? { result: existing } : { result: [] });
}

function rowsOf(harness: RfcHarness, index: number): unknown {
  return JSON.parse(harness.rfcCalls[index]!.inputs['IV_TEXTPOOL_JSON']!);
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(writeTextElementsBulk)).toEqual(
      publishedDeclaration('WriteTextElementsBulk'),
    );
  });

  it('장부 D94 — 구 소스의 minItems는 발행 표면에 없다. 채록본을 따른다', () => {
    const schema = publishedDeclaration('WriteTextElementsBulk').inputSchema as {
      properties: { text_elements: Record<string, unknown> };
    };
    expect(schema.properties.text_elements).not.toHaveProperty('minItems');
  });

  it('노출 선언은 구 핸들러 그대로다 — high · onprem/legacy · mutation', () => {
    expect(writeTextElementsBulk.definition.sets).toEqual(['high']);
    expect(writeTextElementsBulk.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(writeTextElementsBulk.definition.kind).toBe('mutation');
    expect(writeTextElementsBulk.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어 — 부모 프로그램을 잠그지 않는다', () => {
  it('항목이 몇이든 RFC 쓰기는 한 번이고 ADT 축은 아예 타지 않는다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    const result = await invoke(writeTextElementsBulk, harness, {
      program_name: 'zsapkit_demo',
      text_elements: [
        { type: 'R', text: 'Demo report' },
        { type: 'I', key: '001', text: 'One' },
        { type: 'I', key: '002', text: 'Two' },
        { type: 'S', key: 'P_WERKS', text: 'Plant' },
        { type: 'H', key: 'listHeader', text: 'Inventory' },
      ],
    });

    expect(result.isError).toBe(false);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['WRITE_INACTIVE']);
    // 잠금도 해제도 활성화도 없다 — 구 핸들러에 makeAdtRequest 호출이 없다.
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('`activate`는 ADT 활성화가 아니라 **RFC 동작 이름**을 고른다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });

    const staged = jsonOf(
      await invoke(writeTextElementsBulk, harness, {
        program_name: 'ZA',
        text_elements: [{ type: 'I', key: '001', text: 'x' }],
      }),
    );
    const active = jsonOf(
      await invoke(writeTextElementsBulk, harness, {
        program_name: 'ZA',
        text_elements: [{ type: 'I', key: '001', text: 'x' }],
        activate: true,
      }),
    );

    expect(staged['rfc_action']).toBe('WRITE_INACTIVE');
    expect(staged['steps_completed']).toEqual(['write_inactive']);
    expect(active['rfc_action']).toBe('WRITE');
    expect(active['steps_completed']).toEqual(['write_active']);
    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['WRITE_INACTIVE', 'WRITE']);
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('R만 키를 대문자로 올린다 — 나머지는 trim뿐이다 (형제 두 도구와 갈리는 자리)', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    await invoke(writeTextElementsBulk, harness, {
      program_name: 'ZSAPKIT_DEMO',
      text_elements: [
        { type: 'R', text: 'Title' },
        { type: 'I', key: ' 00a ', text: 'lower key kept' },
      ],
    });

    expect(rowsOf(harness, 0)).toEqual([
      { ID: 'R', KEY: 'ZSAPKIT_DEMO', ENTRY: 'Title', LENGTH: 5 },
      { ID: 'I', KEY: '00a', ENTRY: 'lower key kept', LENGTH: 14 },
    ]);
  });
});

describe('병합 — replace_existing', () => {
  it('기본(true)은 전량 교체다 — READ가 아예 나가지 않는다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    const body = jsonOf(
      await invoke(writeTextElementsBulk, harness, {
        program_name: 'ZA',
        text_elements: [{ type: 'I', key: '009', text: 'only' }],
      }),
    );

    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['WRITE_INACTIVE']);
    expect(body['replace_existing']).toBe(true);
    expect(body['total_rows_written']).toBe(1);
    expect(rowsOf(harness, 0)).toEqual([{ ID: 'I', KEY: '009', ENTRY: 'only', LENGTH: 4 }]);
  });

  it('false면 READ를 앞에 붙이고 (ID, KEY)로 덮어쓴다 — 기존 순서가 유지된다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    const body = jsonOf(
      await invoke(writeTextElementsBulk, harness, {
        program_name: 'ZA',
        replace_existing: false,
        text_elements: [
          { type: 'I', key: '001', text: 'New one' },
          { type: 'H', key: 'listHeader', text: 'Head' },
        ],
      }),
    );

    expect(harness.rfcCalls.map((call) => call.action)).toEqual(['READ', 'WRITE_INACTIVE']);
    expect(body['steps_completed']).toEqual(['read_existing_for_merge', 'write_inactive']);
    expect(rowsOf(harness, 1)).toEqual([
      // 기존 001이 제자리에서 갈렸고
      { ID: 'I', KEY: '001', ENTRY: 'New one', LENGTH: 7 },
      // 손대지 않은 기존 행은 그대로 살아 있고
      { ID: 'S', KEY: 'P_WERKS ', ENTRY: 'Plant', LENGTH: 5 },
      // 새 행은 뒤에 붙는다
      { ID: 'H', KEY: 'listHeader', ENTRY: 'Head', LENGTH: 4 },
    ]);
  });

  it('병합 키는 KEY를 trim+대문자로 견준다 — 오른쪽 공백이 있는 기존 행도 맞물린다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    await invoke(writeTextElementsBulk, harness, {
      program_name: 'ZA',
      replace_existing: false,
      text_elements: [{ type: 'S', key: 'p_werks', text: 'Werk' }],
    });
    expect(rowsOf(harness, 1)).toEqual([
      { ID: 'I', KEY: '001', ENTRY: 'Old one', LENGTH: 7 },
      { ID: 'S', KEY: 'p_werks', ENTRY: 'Werk', LENGTH: 4 },
    ]);
  });
});

describe('부분 실패 — 존재하지 않는다', () => {
  it('한 항목이 어긋나면 **첨자를 담아** 거절하고 SAP에는 한 번도 나가지 않는다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    const result = await invoke(writeTextElementsBulk, harness, {
      program_name: 'ZA',
      text_elements: [
        { type: 'I', key: '001', text: 'ok' },
        { type: 'I', text: 'no key' },
        { type: 'I', key: '003', text: 'ok too' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: text_elements[1] type "I" requires "key"');
    expect(harness.rfcCalls).toHaveLength(0);
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('검증 문구는 구가 적어 두던 그대로다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    const cases: Array<[unknown[], string]> = [
      [
        [{ type: 'Z', text: 'x' }],
        'Error: text_elements[0] has missing or unsupported type "Z"',
      ],
      [[{ type: 'I', key: '001', text: 5 }], 'Error: text_elements[0] "text" must be a string'],
      [
        [{ type: 'I', key: '001', text: 'x'.repeat(133) }],
        'Error: text_elements[0] text exceeds 132 chars (133)',
      ],
      [
        [{ type: 'S', key: 'P_TOO_LONG', text: 'x' }],
        'Error: text_elements[0] selection key "P_TOO_LONG" exceeds 8 chars',
      ],
      [
        [
          { type: 'R', text: 'a' },
          { type: 'R', text: 'b' },
        ],
        'Error: Only one R-type entry is allowed per program',
      ],
    ];

    for (const [elements, expected] of cases) {
      const result = await invoke(writeTextElementsBulk, harness, {
        program_name: 'ZA',
        text_elements: elements,
      });
      expect(textOf(result)).toBe(expected);
    }
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('빈 배열은 핸들러가 거절한다 (장부 D94 — 스키마가 막지 않는다)', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(await invoke(writeTextElementsBulk, harness, { program_name: 'ZA', text_elements: [] })),
    ).toBe('Error: text_elements must be a non-empty array');
    expect(
      textOf(await invoke(writeTextElementsBulk, harness, { program_name: 'ZA' })),
    ).toBe('Error: text_elements must be a non-empty array');
  });

  it('program_name이 없으면 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(
      textOf(
        await invoke(writeTextElementsBulk, harness, {
          text_elements: [{ type: 'I', key: '001', text: 'x' }],
        }),
      ),
    ).toBe('Error: program_name is required');
  });

  it('RFC 쓰기가 실패하면 **전부** 실패다 — 「몇 건 성공」이라는 칸이 없다', async () => {
    harness = await startRfcHarness({
      rfc: () => ({ subrc: 8, message: 'TPOOL write rejected' }),
    });
    const result = await invoke(writeTextElementsBulk, harness, {
      program_name: 'ZA',
      text_elements: [
        { type: 'I', key: '001', text: 'a' },
        { type: 'I', key: '002', text: 'b' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: WriteTextElementsBulk failed: ZMCP_ADT_TEXTPOOL error (action=WRITE_INACTIVE, subrc=8): TPOOL write rejected',
    );
  });
});

describe('응답', () => {
  it('형별 수와 쓴 행 수를 함께 싣는다', async () => {
    harness = await startRfcHarness({ rfc: poolResponder() });
    const body = jsonOf(
      await invoke(writeTextElementsBulk, harness, {
        program_name: 'ZA',
        language: 'k',
        text_elements: [
          { type: 'R', text: 'Title' },
          { type: 'I', key: '001', text: 'a' },
          { type: 'I', key: '002', text: 'b' },
        ],
      }),
    );

    expect(body).toMatchObject({
      success: true,
      program_name: 'ZA',
      total_entries: 3,
      per_type: { R: 1, I: 2 },
      total_rows_written: 3,
      replace_existing: true,
      language_used: 'K',
      activate: false,
      rfc_action: 'WRITE_INACTIVE',
      message: 'Staged 3 INACTIVE text element row(s) for ZA. Activate the parent program to promote.',
    });
  });
});
