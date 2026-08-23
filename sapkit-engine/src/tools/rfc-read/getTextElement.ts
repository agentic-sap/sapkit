/**
 * GetTextElement — 프로그램 텍스트풀 한 벌을 읽고 형·키로 걸러 낸다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/text_element/high/handleGetTextElement.ts:59-141`
 *  - 한 다리: `engine/src/lib/rfcBackend.ts:63-77` — `callTextpool`은 통로 선택기가
 *    고른 구현이며, 소유자 프로파일이 타는 것은 `odata`다.
 *  - 와이어 정본: `engine/src/lib/odataRfc.ts:331-357` —
 *    `POST {service}/Textpool?IV_ACTION='READ'&IV_PROGRAM='…'&IV_LANGUAGE='…'&IV_TEXTPOOL_JSON=''`
 *    (CSRF 2단 악수는 `odataRfc.ts:120-200`). 인자 넷은 **없어도 빈 문자열로**
 *    나간다 — `IV_TEXTPOOL_JSON`이 READ에서도 실리는 이유가 그것이다.
 *
 * 거기서 확인한 것 셋:
 *  1. **`EV_RESULT`가 배열이 아니면 빈 배열로 떨어진다**(`odataRfc.ts:349`의
 *     `tryParseJson(…, [])`). 그래서 텍스트풀이 없는 프로그램도 오류가 아니라
 *     `total_rows: 0`이다.
 *  2. `subrc != 0`이면 통로가 던지고, 그 문구
 *     (`ZSAPKIT_ADT_TEXTPOOL error (action=READ, subrc=N): …`)가 이 도구의 오류
 *     본문에 그대로 실린다.
 *  3. 행 필드 이름은 `/ui2/cl_json=>serialize`가 **대문자로** 남긴다. 구가
 *     `r.ID ?? r.id`처럼 두 갈래를 다 보는 것은 방어이며, 그대로 옮긴다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * 구는 `isCloudConnection()`(= 인증이 JWT인가)일 때 "Text elements are not
 * available on cloud systems…"로 먼저 거절한다. 신 엔진에는 JWT 인증 자체가 아직
 * 없어(M1 Basic 전용) 그 갈래가 도달 불가능하므로 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from '../read/internal/results';
import { rfcChannelFor } from './rfcChannel';

/** `/ui2/cl_json`이 대문자로 남기는 행 하나. 소문자 갈래는 구의 방어다. */
function fieldOf(row: unknown, upper: string, lower: string): string {
  const record = (row ?? {}) as Record<string, unknown>;
  return String(record[upper] ?? record[lower] ?? '');
}

export const getTextElement = defineTool(
  {
    name: 'GetTextElement',
    description:
      'Read ABAP program text pool (text symbols, selection texts, title, headings). Optionally filter by text_type / key.',
    inputSchema: {
      program_name: z.string().describe('Program name (e.g., Z_MY_PROGRAM).'),
      language: z
        .string()
        .describe(
          'Language key (1-char, e.g., "E", "D", "K"). Defaults to the SAP logon language.',
        )
        .optional(),
      text_type: z
        .enum(['I', 'S', 'R', 'H'])
        .describe(
          'Filter by ID: "I"=text symbol, "S"=selection text, "R"=program title, "H"=list heading.',
        )
        .optional(),
      key: z
        .string()
        .describe(
          'Optional: filter by row key (e.g., "001" for text symbol TEXT-001, or a parameter name for selection text).',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name) {
      return returnError(new Error('Missing required parameter: program_name'));
    }

    const programName = args.program_name.toUpperCase();
    const language = (args.language || '').toUpperCase();
    const textType = args.text_type?.toUpperCase();
    const filterKey = args.key?.trim().toUpperCase();

    context.logger.info(
      `Getting text elements: ${programName}${language ? ` [${language}]` : ''}`,
    );

    try {
      const channel = await rfcChannelFor(context);
      const { result } = await channel.callTextpool('READ', {
        program: programName,
        language,
      });

      let rows: unknown[] = Array.isArray(result) ? result : [];
      if (textType) {
        rows = rows.filter((row) => fieldOf(row, 'ID', 'id').toUpperCase() === textType);
      }
      if (filterKey) {
        rows = rows.filter((row) => fieldOf(row, 'KEY', 'key').trim().toUpperCase() === filterKey);
      }

      context.logger.info(
        `✅ GetTextElement completed: ${programName} (${rows.length} rows)`,
      );

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            language: language || null,
            text_type: textType || null,
            key: filterKey || null,
            total_rows: rows.length,
            text_elements: rows,
            steps_completed: ['get_text_pool'],
          },
          null,
          2,
        ),
      );
    } catch (error) {
      const message = messageOf(error);
      context.logger.error(`Error reading text elements: ${message}`);
      return returnError(new Error(`Failed to read text elements: ${message}`));
    }
  },
);
