/**
 * WriteTextElementsBulk — 여러 텍스트 엘리먼트를 **RFC 쓰기 한 번**으로 등록한다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/text_element/high/handleWriteTextElementsBulk.ts:133-284`
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:331-357`
 *
 * ## 이 도구가 형제 둘과 다른 것 — **부모 프로그램을 잠그지 않는다**
 *
 * `CreateTextElement`·`UpdateTextElement`는 LOCK → READ → WRITE → UNLOCK →
 * 활성화를 돈다. 이 도구는 **RFC 쓰기 한 번**뿐이고 ADT 축을 아예 타지 않는다
 * (`:214-250` — 구 핸들러에 `makeAdtRequest` 호출이 없다). `activate`도 ADT
 * 활성화가 아니라 **RFC 동작 이름을 고르는 스위치**다:
 *
 *   activate=true  → `WRITE`           (`INSERT TEXTPOOL STATE 'A'` — 즉시 활성)
 *   activate=false → `WRITE_INACTIVE`  (`… STATE 'I'` — 부모 프로그램의 다음
 *                                       활성화가 전부를 한꺼번에 승격시킨다)
 *
 * 기본값이 `WRITE_INACTIVE`인 것은 구 주석(`:10-19`)이 밝힌 "40개를 지금 등록하고
 * 프로그램은 나중에 활성화한다"는 흐름 때문이다.
 *
 * ## 부분 실패가 없는 도구다 (실측)
 *
 *  - **검증은 SAP에 나가기 전에 전부 끝난다**(`:152-196`). 한 항목이라도
 *    어긋나면 그 항목의 **첨자를 문구에 담아** 거절하고, 그 시점까지 나간 SAP
 *    호출은 0건이다.
 *  - **쓰기는 RFC 한 번**이라 SAP 쪽에서도 전부 아니면 전무다. 「몇 건 성공,
 *    몇 건 실패」라는 상태가 존재하지 않으므로 응답에 그런 칸이 없다.
 *  - `replace_existing: false`일 때만 READ가 한 번 앞에 붙고, 그때
 *    `steps_completed`에 `read_existing_for_merge`가 실린다.
 *
 * ## 병합 규칙 (`replace_existing: false`)
 * 키는 `ID + '::' + KEY.trim().toUpperCase()`이고(`:112-114`), **기존 행이 먼저
 * 들어간 뒤 호출자 행이 덮어쓴다** — 그래서 결과 배열은 기존 순서를 유지하고
 * 새 행만 뒤에 붙는다.
 *
 * ## 구와 다른 것
 *  - 장부 D91 — `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 *  - 장부 D94 — 구 소스의 `minItems: 1`은 **구가 발행한 표면에 없다.** 채록본을
 *    따랐고, 빈 배열 거절은 구와 같이 핸들러가 한다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import { describeFailure, okResult } from './shared';
import { programScopedError } from './internal/programScoped';
import { MAX_ENTRY_LEN, type TpoolRow, normalizeTpoolRows } from './internal/textPool';

/** 선택화면 텍스트의 키 상한 — 파라미터/셀렉트옵션 이름은 8자다. */
const MAX_SELECTION_KEY_LEN = 8;

const TEXT_TYPES = ['R', 'I', 'S', 'H'] as const;
type BulkType = (typeof TEXT_TYPES)[number];

interface BulkEntry {
  readonly type: BulkType;
  readonly key?: string;
  readonly text: string;
}

/** 병합 키 — 구 `rowKey`(`:112-114`) 그대로. */
function mergeKey(row: { ID: string; KEY: string }): string {
  return `${row.ID.toUpperCase()}::${row.KEY.trim().toUpperCase()}`;
}

/**
 * 항목 하나를 TPOOL 행으로. **R만 키를 대문자로 올린다** — 나머지는 `trim`뿐이다
 * (`:116-131`). 형제 두 도구가 모든 키를 대문자로 올리는 것과 여기서 갈린다.
 */
function normalizeEntry(entry: BulkEntry, programName: string): TpoolRow {
  const id = entry.type.toUpperCase();
  const key =
    id === 'R' ? (entry.key?.trim() || programName).toUpperCase() : (entry.key ?? '').trim();
  const text = entry.text ?? '';
  return { ID: id, KEY: key, ENTRY: text, LENGTH: text.length };
}

/** 나가기 전 검증. 문제가 있으면 구와 같은 문구를 돌려준다. */
function firstProblem(entries: readonly BulkEntry[]): string | null {
  let rCount = 0;
  for (const [index, entry] of entries.entries()) {
    const type = entry?.type;
    if (!type || !(TEXT_TYPES as readonly string[]).includes(type)) {
      return `text_elements[${index}] has missing or unsupported type "${type}"`;
    }
    if (typeof entry.text !== 'string') {
      return `text_elements[${index}] "text" must be a string`;
    }
    if (entry.text.length > MAX_ENTRY_LEN) {
      return `text_elements[${index}] text exceeds ${MAX_ENTRY_LEN} chars (${entry.text.length})`;
    }
    if (type === 'I' || type === 'S' || type === 'H') {
      if (!entry.key) return `text_elements[${index}] type "${type}" requires "key"`;
      if (type === 'S' && entry.key.length > MAX_SELECTION_KEY_LEN) {
        return `text_elements[${index}] selection key "${entry.key}" exceeds ${MAX_SELECTION_KEY_LEN} chars`;
      }
    }
    if (type === 'R') rCount += 1;
  }
  return rCount > 1 ? 'Only one R-type entry is allowed per program' : null;
}

export const writeTextElementsBulk = defineTool(
  {
    name: 'WriteTextElementsBulk',
    description:
      'Register many ABAP text elements (R/I/S/H) in ONE tool call via a single TPOOL RFC write. Use instead of calling CreateTextElement N times. With activate=false (default) the pool is staged INACTIVE — the parent program\'s next activation promotes every entry atomically, which is the correct flow for "register 40 now, activate program later". With activate=true the pool is written ACTIVE immediately. Set replace_existing=false to merge into the current pool instead of replacing it.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      language: z
        .string()
        .describe('1-char language key (e.g. "K" for Korean). Defaults to SAP logon language.')
        .optional(),
      text_elements: z
        .array(
          z.object({
            type: z.enum(TEXT_TYPES),
            key: z.string().optional(),
            text: z.string(),
          }),
        )
        .describe(
          'Array of entries. Each: { type: "R"|"I"|"S"|"H", key?: string, text: string }. R ignores key (single-row program title — key defaults to program name). I requires a 3-char key. S requires a parameter / select-option name (max 8 chars). H requires one of "listHeader" or "columnHeader_N".',
        ),
      replace_existing: z
        .boolean()
        .describe(
          'If true (default), the TPOOL is replaced with the provided entries only. If false, existing rows are preserved and provided rows merge by (type, key).',
        )
        .optional(),
      transport_request: z
        .string()
        .describe('Transport request number (informational).')
        .optional(),
      activate: z
        .boolean()
        .describe(
          'false (default) — stage as INACTIVE (program activation promotes). true — write ACTIVE immediately.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name) {
      return programScopedError('program_name is required');
    }
    if (!Array.isArray(args.text_elements) || args.text_elements.length === 0) {
      return programScopedError('text_elements must be a non-empty array');
    }

    const entries = args.text_elements as readonly BulkEntry[];
    const problem = firstProblem(entries);
    if (problem !== null) return programScopedError(problem);

    const perType: Record<string, number> = {};
    for (const entry of entries) perType[entry.type] = (perType[entry.type] ?? 0) + 1;

    const programName = args.program_name.toUpperCase();
    const language = (args.language || '').toUpperCase();
    const replaceExisting = args.replace_existing !== false;
    const shouldActivate = args.activate === true;
    const action = shouldActivate ? 'WRITE' : 'WRITE_INACTIVE';
    const steps: string[] = [];

    context.logger.info(
      `WriteTextElementsBulk: ${programName} — ${entries.length} entries (${JSON.stringify(
        perType,
      )}); replace_existing=${replaceExisting}; action=${action}`,
    );

    try {
      const channel = await rfcChannelFor(context);
      const caller = entries.map((entry) => normalizeEntry(entry, programName));

      let finalRows: TpoolRow[];
      if (replaceExisting) {
        finalRows = caller;
      } else {
        const { result: fetched } = await channel.callTextpool('READ', {
          program: programName,
          language,
        });
        const merged = new Map<string, TpoolRow>();
        for (const row of normalizeTpoolRows(fetched)) merged.set(mergeKey(row), row);
        for (const row of caller) merged.set(mergeKey(row), row);
        finalRows = [...merged.values()];
        steps.push('read_existing_for_merge');
      }

      // 항목이 몇이든 RFC 쓰기는 **한 번**이다 — 부분 실패가 없는 이유.
      await channel.callTextpool(action, {
        program: programName,
        language,
        textpoolJson: JSON.stringify(finalRows),
      });
      steps.push(action === 'WRITE' ? 'write_active' : 'write_inactive');

      return okResult({
        success: true,
        program_name: programName,
        total_entries: entries.length,
        per_type: perType,
        total_rows_written: finalRows.length,
        replace_existing: replaceExisting,
        language_used: language || null,
        activate: shouldActivate,
        rfc_action: action,
        steps_completed: steps,
        message: shouldActivate
          ? `Wrote ${finalRows.length} active text element row(s) for ${programName}.`
          : `Staged ${finalRows.length} INACTIVE text element row(s) for ${programName}. Activate the parent program to promote.`,
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`WriteTextElementsBulk failed: ${message}`);
      return programScopedError(`WriteTextElementsBulk failed: ${message}`);
    }
  },
);
