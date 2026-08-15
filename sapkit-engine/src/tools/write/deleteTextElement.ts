/**
 * DeleteTextElement — 프로그램 텍스트풀에서 행을 **지운다.** 와일드카드로 표 하나
 * 또는 풀 전체를 비울 수도 있다.
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 시퀀스 (실측)
 *
 * 겉: `engine/src/handlers/text_element/high/handleDeleteTextElement.ts:78-269`.
 *
 * ```
 * ① LOCK   POST /sap/bc/adt/programs/programs/{대문자}?_action=LOCK&accessMode=MODIFY
 * ② READ   대리자 TEXTPOOL READ  { program, language }
 * ③ (로컬) 지울 행을 걸러 낸다
 * ④ WRITE  대리자 TEXTPOOL WRITE { program, language, textpool_json }  ← **남은 전량**
 * ⑤ UNLOCK POST …?_action=UNLOCK&lockHandle=…
 * ⑥ (선택) 활성화 POST /sap/bc/adt/activation … (long 타임아웃)
 * ```
 *
 * `CreateTextElement`·`UpdateTextElement`와 같은 사슬이고 가운데 한 걸음만 다르다.
 *
 * ## 와일드카드 두 층 — **`*`가 자리마다 뜻이 다르다** (실측)
 *
 * | 인자 | 값 | 지우는 것 |
 * |---|---|---|
 * | `text_type` | `*` | **언어 전체**(풀의 모든 행). `key`는 보지 않는다 |
 * | `key` | `*` | 그 `text_type`의 모든 행 |
 * | `key` | 이름 | 그 `text_type`의 그 행 하나 |
 *
 * 그리고 `text_type`이 `R`(프로그램 제목)일 때만 `key`의 기본값이 **프로그램 이름**
 * 이다. 다른 종류에서 `key`가 비면 요청을 보내지 않고 거절한다.
 *
 * **지워진 행이 0이면 쓰지 않고 실패한다** — 없는 것을 지웠다고 답하지 않는다.
 *
 * ## 구를 그대로 둔 자리 · 고친 자리
 *
 *  - `transport_request`를 받지만 **쓰지 않는다**(형제 둘과 같다).
 *  - 활성화 응답을 **읽는다** — 차이 장부 **D114**. 구는 버렸다.
 *  - 클라우드(JWT) 거절 갈래는 짓지 않았다 — 차이 장부 **D112**.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { rfcChannelFor } from '../rfc-read/rfcChannel';
import {
  activateParentProgram,
  programObjectUri,
  programScopedError,
} from './internal/programScoped';
import { type TpoolRow, keyMatches, normalizeTpoolRows } from './internal/textPool';
import { describeFailure, okResult } from './shared';

export const deleteTextElement = defineTool(
  {
    name: 'DeleteTextElement',
    description:
      'Delete a text element from an ABAP program text pool. key="*" wipes all rows of the given text_type; text_type="*" wipes the whole pool.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      text_type: z
        .enum(['I', 'S', 'R', 'H', '*'])
        .describe('"I"|"S"|"R"|"H", or "*" to wipe every row in the language.'),
      key: z.string().describe('Row key, or "*" to delete every row of the given text_type.').optional(),
      language: z.string().describe('Language key. Defaults to SAP logon language.').optional(),
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
    if (!args.program_name || !args.text_type) {
      return programScopedError('Missing required parameters: program_name, text_type');
    }

    const programName = args.program_name.toUpperCase();
    const textType = args.text_type.toUpperCase();
    const language = (args.language || '').toUpperCase();
    const shouldActivate = args.activate === true;
    const wipeAll = textType === '*';
    let rowKey = (args.key || '').trim().toUpperCase();

    // 콕 집어 지우는 경우에만 키가 필요하다. `R`은 프로그램 이름이 기본값이다.
    if (!wipeAll && rowKey !== '*') {
      if (textType === 'R') {
        rowKey = rowKey || programName;
      } else if (!rowKey) {
        return programScopedError(
          `key is required for text_type "${textType}" (use "*" to delete all rows of this type)`,
        );
      }
    }

    const uri = programObjectUri(programName);
    const label = `${programName} ${textType}/${rowKey || '(wipe)'}`;
    context.logger.info(`Deleting text element: ${label}${language ? ` [${language}]` : ''}`);

    let removed = 0;
    let remaining = 0;

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      await client.withLock(uri, async () => {
        const { result: fetched } = await channel.callTextpool('READ', {
          program: programName,
          language,
        });
        const rows: TpoolRow[] = normalizeTpoolRows(fetched);

        let kept: TpoolRow[];
        if (wipeAll) {
          kept = [];
        } else if (rowKey === '*') {
          kept = rows.filter((row) => row.ID !== textType);
        } else {
          kept = rows.filter((row) => !(row.ID === textType && keyMatches(row.KEY, rowKey)));
        }

        removed = rows.length - kept.length;
        // 지워진 것이 없으면 쓰지 않는다 — 없는 것을 지웠다고 답하지 않는다.
        if (removed === 0) throw new Error(`Text element not found: ${label}`);
        remaining = kept.length;

        await channel.callTextpool('WRITE', {
          program: programName,
          language,
          textpoolJson: JSON.stringify(kept),
        });
      });

      if (shouldActivate) await activateParentProgram(client, programName, 'text element');

      context.logger.info(`Text element deleted: ${label} (${removed} rows removed)`);
      return okResult({
        success: true,
        program_name: programName,
        text_type: textType,
        key: rowKey || null,
        language: language || null,
        rows_removed: removed,
        rows_remaining: remaining,
        activated: shouldActivate,
        message: shouldActivate
          ? `Text element ${label} deleted and activated.`
          : `Text element ${label} deleted (not activated).`,
        steps_completed: [
          'lock',
          'read',
          'write',
          'unlock',
          ...(shouldActivate ? ['activate'] : []),
        ],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error deleting text element: ${message}`);
      return programScopedError(`Failed to delete text element: ${message}`);
    }
  },
);
