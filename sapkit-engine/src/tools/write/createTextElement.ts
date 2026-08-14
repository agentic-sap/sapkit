/**
 * CreateTextElement — 텍스트풀에 행 하나를 **더한다**.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/text_element/high/handleCreateTextElement.ts:85-290`
 *  - 잠금·활성화 와이어: 같은 파일 `:142-150`·`:212-234` →
 *    `engine/src/lib/utils.ts:902-921` →
 *    `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-209`
 *    (Accept를 주지 않으면 접속 계층의 기본 Accept가 나가고, POST에는 CSRF
 *    토큰이 먼저 붙는다 — 신 엔진의 같은 기본값은 `src/adt/client.ts:51`)
 *  - 텍스트풀 와이어: `engine/src/lib/odataRfc.ts:331-357`
 *
 * ## 시퀀스 (구 그대로)
 *
 *   LOCK(부모 프로그램) → TPOOL READ → 중복 검사 → TPOOL WRITE(전량) →
 *   UNLOCK → (활성화)
 *
 * 활성화가 **잠금 해제 뒤**인 것은 구의 선택이다(`:211` — "Unlock before
 * activation (same order as handleUpdateGuiStatus)"). 순서를 바꾸지 않았다.
 *
 * 텍스트풀에는 독립 ADT URI가 없으므로 잠그는 것은 **부모 프로그램**이다(`:141`).
 *
 * ## 왜 중복을 거절하나 (구 주석 `:187-189`)
 * `R`은 프로그램 제목이라 행이 하나뿐이다. 덮어쓰기를 허용하면 기존 제목이
 * 조용히 사라진다. 그래서 같은 (ID, KEY)가 있으면 `UpdateTextElement`로 보낸다.
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

export const createTextElement = defineTool(
  {
    name: 'CreateTextElement',
    description:
      'Add a text element (text symbol, selection text, program title, or list heading) to an ABAP program. Optionally activates after write.',
    inputSchema: {
      program_name: z.string().describe('Parent program name (e.g., Z_MY_PROGRAM).'),
      text_type: z
        .enum(['I', 'S', 'R', 'H'])
        .describe(
          '"I"=text symbol (TEXT-xxx), "S"=selection text, "R"=program title, "H"=list heading.',
        ),
      key: z
        .string()
        .describe(
          'Row key. For "I" use 3-char code (e.g., "001"). For "S" use the parameter/select-option name. For "R" the key is ignored (single row).',
        )
        .optional(),
      text: z.string().describe(`Text content (max ${MAX_ENTRY_LEN} characters).`),
      language: z
        .string()
        .describe('Language key (1-char). Defaults to SAP logon language.')
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

    // "R"은 프로그램 제목 한 줄이다 — ABAP TPOOL은 KEY에 프로그램 이름을 담는다.
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
      `Creating text element: ${programName} ${textType}/${rowKey}${language ? ` [${language}]` : ''}`,
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

        if (rows.some((row) => row.ID === textType && keyMatches(row.KEY, rowKey))) {
          throw new Error(
            `Text element already exists: ${programName} ${textType}/${rowKey}. Use UpdateTextElement instead.`,
          );
        }

        rows.push({ ID: textType, KEY: rowKey, ENTRY: args.text, LENGTH: args.text.length });

        await channel.callTextpool('WRITE', {
          program: programName,
          language,
          textpoolJson: JSON.stringify(rows),
        });
      });

      if (shouldActivate) {
        await activateParentProgram(client, programName, 'text element');
      }

      context.logger.info(`✅ Text element created: ${programName} ${textType}/${rowKey}`);

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
          ? `Text element ${programName} ${textType}/${rowKey} created and activated.`
          : `Text element ${programName} ${textType}/${rowKey} created (not activated).`,
        steps_completed: ['lock', 'read', 'write', 'unlock', ...(shouldActivate ? ['activate'] : [])],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error creating text element: ${message}`);
      return programScopedError(`Failed to create text element: ${message}`);
    }
  },
);
