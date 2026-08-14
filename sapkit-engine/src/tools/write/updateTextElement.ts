/**
 * UpdateTextElement — 텍스트풀의 **기존** 행 하나를 갈아 끼운다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/text_element/high/handleUpdateTextElement.ts:78-269`
 *  - 텍스트풀 와이어: `engine/src/lib/odataRfc.ts:331-357`
 *  - 잠금·활성화 와이어: `src/tools/write/internal/programScoped.ts` 머리주석 참조
 *
 * `CreateTextElement`와 **같은 시퀀스**(LOCK → READ → WRITE 전량 → UNLOCK →
 * 활성화)이고, 가운데 한 걸음만 다르다:
 *
 *  - Create: 같은 (ID, KEY)가 **있으면** 거절하고, 없으면 **뒤에 붙인다.**
 *  - Update: 같은 (ID, KEY)가 **없으면** 거절하고, 있으면 **그 자리를 덮어쓴다**
 *    (`:169-183` — `findIndex` → `rows[idx] = …`). 자리를 옮기지 않으므로 풀의
 *    행 순서가 보존된다.
 *
 * 덮어쓸 때 `KEY`는 **정규화된 값**(trim + 대문자)으로 다시 쓰인다 — 구가
 * `rows[idx] = { ID: textType, KEY: rowKey, … }`로 통째 교체하기 때문이다.
 * 원래 행의 오른쪽 공백은 그 순간 사라진다. 구의 동작이므로 그대로 둔다.
 *
 * ## 구와 다른 것
 *  - 장부 D91 — `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 *  - 장부 D93 — 활성화 응답을 **읽는다**. 구는 버렸다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import { describeFailure, okResult } from './shared';
import {
  activateParentProgram,
  programObjectUri,
  programScopedError,
} from './internal/programScoped';
import { MAX_ENTRY_LEN, type TpoolRow, keyMatches, normalizeTpoolRows } from './internal/textPool';

export const updateTextElement = defineTool(
  {
    name: 'UpdateTextElement',
    description:
      'Update an existing text element in an ABAP program text pool. Handles lock/unlock automatically.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      text_type: z.enum(['I', 'S', 'R', 'H']).describe('"I"|"S"|"R"|"H" — see GetTextElement.'),
      key: z
        .string()
        .describe('Row key. Required except for "R" (single program title).')
        .optional(),
      text: z.string().describe(`New text content (max ${MAX_ENTRY_LEN} characters).`),
      language: z
        .string()
        .describe('Language key. Defaults to SAP logon language.')
        .optional(),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate: z
        .boolean()
        .describe('Activate the parent program after write. Default: false.')
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || !args.text_type || typeof args.text !== 'string') {
      return programScopedError('Missing required parameters: program_name, text_type, text');
    }

    const programName = args.program_name.toUpperCase();
    const textType = args.text_type.toUpperCase();
    const language = (args.language || '').toUpperCase();
    const shouldActivate = args.activate === true;

    let rowKey = (args.key || '').trim().toUpperCase();
    if (textType === 'R') {
      rowKey = rowKey || programName;
    } else if (!rowKey) {
      return programScopedError(`key is required for text_type "${textType}"`);
    }

    if (args.text.length > MAX_ENTRY_LEN) {
      return programScopedError(
        `text exceeds max length (${MAX_ENTRY_LEN} chars): got ${args.text.length}`,
      );
    }

    const uri = programObjectUri(programName);
    context.logger.info(
      `Updating text element: ${programName} ${textType}/${rowKey}${language ? ` [${language}]` : ''}`,
    );

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      await client.withLock(uri, async () => {
        const { result: fetched } = await channel.callTextpool('READ', {
          program: programName,
          language,
        });
        const rows: TpoolRow[] = normalizeTpoolRows(fetched);

        const index = rows.findIndex((row) => row.ID === textType && keyMatches(row.KEY, rowKey));
        if (index < 0) {
          throw new Error(
            `Text element not found: ${programName} ${textType}/${rowKey}. Use CreateTextElement to add it.`,
          );
        }

        // 자리를 그대로 두고 통째 교체한다 — 풀의 행 순서가 보존된다.
        rows[index] = { ID: textType, KEY: rowKey, ENTRY: args.text, LENGTH: args.text.length };

        await channel.callTextpool('WRITE', {
          program: programName,
          language,
          textpoolJson: JSON.stringify(rows),
        });
      });

      if (shouldActivate) {
        await activateParentProgram(client, programName, 'text element');
      }

      context.logger.info(`✅ Text element updated: ${programName} ${textType}/${rowKey}`);

      return okResult({
        success: true,
        program_name: programName,
        text_type: textType,
        key: rowKey,
        text: args.text,
        length: args.text.length,
        language: language || null,
        activated: shouldActivate,
        message: shouldActivate
          ? `Text element ${programName} ${textType}/${rowKey} updated and activated.`
          : `Text element ${programName} ${textType}/${rowKey} updated (not activated).`,
        steps_completed: ['lock', 'read', 'write', 'unlock', ...(shouldActivate ? ['activate'] : [])],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error updating text element: ${message}`);
      return programScopedError(`Failed to update text element: ${message}`);
    }
  },
);
