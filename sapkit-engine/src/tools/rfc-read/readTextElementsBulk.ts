/**
 * ReadTextElementsBulk — 텍스트풀 전량을 READ 한 번으로 읽어 형별로 가른다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/text_element/high/handleReadTextElementsBulk.ts:54-136`
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:331-357` — `GetTextElement`와
 *    **같은 요청**이다(`IV_ACTION='READ'`). 이 도구가 다른 것은 응답 조립뿐이다.
 *
 * 구 머리주석(`:1-13`)이 밝힌 설계 근거: ADT의 `/textelements` 하위 자원은
 * I/S/H의 편집기 뷰만 보여 주고 **R(프로그램 제목)을 아예 노출하지 않는다.**
 * 그래서 `WriteTextElementsBulk`와 같은 저장 경로(TPOOL RFC)를 그대로 써서 네 형을
 * 고르게 드러낸다.
 *
 * ## 이 도구의 「부분 처리」 계약 (실측 — `:90-98`·`:106-112`)
 *  - **ID가 R/I/S/H가 아닌 행은 버킷에서 조용히 빠진다**(`continue`).
 *  - 그런데 `counts.total`은 **버킷 합이 아니라 받은 행 수**(`raw.length`)다.
 *    즉 알 수 없는 형이 섞이면 `R+I+S+H < total`이 되고, 그 차이가 곧 "떨어진
 *    행이 있다"는 신호다. 구가 그렇게 지었고 그대로 둔다 — 합을 맞추면 무엇이
 *    빠졌는지 알 수 없게 된다.
 *  - `r`은 마지막으로 만난 R 행이다(R이 없으면 `null`).
 *  - 선택화면 텍스트(S)의 키만 `trim` 한다. I·H는 그대로 싣는다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * `isCloudConnection()` 갈래(JWT 인증 전용)는 신 엔진에 인증 종류가 하나뿐이라
 * 도달 불가능하므로 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from '../read/internal/results';
import { rfcChannelFor } from './rfcChannel';

type TextType = 'R' | 'I' | 'S' | 'H';

interface Entry {
  readonly type: TextType;
  readonly key: string;
  readonly text: string;
  readonly length: number;
}

function stringField(row: unknown, upper: string, lower: string): string {
  const record = (row ?? {}) as Record<string, unknown>;
  return String(record[upper] ?? record[lower] ?? '');
}

function numberField(row: unknown, upper: string, lower: string): number {
  const record = (row ?? {}) as Record<string, unknown>;
  return Number(record[upper] ?? record[lower] ?? 0);
}

function isTextType(value: string): value is TextType {
  return value === 'R' || value === 'I' || value === 'S' || value === 'H';
}

export const readTextElementsBulk = defineTool(
  {
    name: 'ReadTextElementsBulk',
    description:
      'Read every text element (R/I/S/H) of a program in ONE call via the TPOOL RFC. Partitions rows by type and returns structured arrays. Use this instead of calling GetTextElement per row.',
    inputSchema: {
      program_name: z.string().describe('Program name.'),
      language: z
        .string()
        .describe('1-char language. Defaults to SAP logon language.')
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name) {
      return returnError(new Error('program_name is required'));
    }

    const programName = args.program_name.toUpperCase();
    const language = (args.language || '').toUpperCase();

    context.logger.info(`ReadTextElementsBulk: ${programName}`);

    try {
      const channel = await rfcChannelFor(context);
      const { result: fetched } = await channel.callTextpool('READ', {
        program: programName,
        language,
      });
      const raw: unknown[] = Array.isArray(fetched) ? fetched : [];

      const bucket: Record<TextType, Entry[]> = { R: [], I: [], S: [], H: [] };
      let rEntry: { text: string; length: number } | null = null;

      for (const row of raw) {
        const id = stringField(row, 'ID', 'id').toUpperCase();
        const key = stringField(row, 'KEY', 'key');
        const text = stringField(row, 'ENTRY', 'entry');
        const length = numberField(row, 'LENGTH', 'length');
        if (!isTextType(id)) continue;
        bucket[id].push({ type: id, key, text, length });
        if (id === 'R') rEntry = { text, length };
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            language: language || null,
            counts: {
              R: bucket.R.length,
              I: bucket.I.length,
              S: bucket.S.length,
              H: bucket.H.length,
              // 버킷 합이 아니라 **받은 행 수**다 — 위 머리주석 참조.
              total: raw.length,
            },
            r: rEntry,
            symbols: bucket.I.map((entry) => ({ key: entry.key, text: entry.text })),
            selections: bucket.S.map((entry) => ({ key: entry.key.trim(), text: entry.text })),
            headings: bucket.H.map((entry) => ({ key: entry.key, text: entry.text })),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      const message = messageOf(error);
      context.logger.error(`ReadTextElementsBulk failed: ${message}`);
      return returnError(new Error(`ReadTextElementsBulk failed: ${message}`));
    }
  },
);
