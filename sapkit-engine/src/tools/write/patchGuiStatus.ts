/**
 * PatchGuiStatus — CUA를 **읽고 병합해서** 쓴다. 이 표면의 유일한 `Patch*`다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/gui_status/high/handlePatchGuiStatus.ts:100-305`
 *  - 병합 규칙: `engine/src/lib/cuaSchema.ts:236-297` → `./internal/cuaSchema.ts`
 *  - 대리자 와이어: `engine/src/lib/odataRfc.ts:288-327`
 *  - 잠금·활성화 와이어: `./internal/programScoped.ts` 머리주석
 *
 * ## `Update*`와 무엇이 다른가 — **읽는 걸음이 있다**
 *
 * SAP 쪽 쓰기는 **똑같다.** 둘 다 `RS_CUA_INTERNAL_WRITE`(대리자 동작
 * `CUA_WRITE`)에 CUA 전량을 실어 보내고, 그 함수모듈은 프로그램의 GUI 상태를
 * 원자적으로 갈아엎는다. 갈리는 것은 **그 전량을 누가 만드느냐**다.
 *
 * |  | `UpdateGuiStatus` | `PatchGuiStatus` |
 * |---|---|---|
 * | `CUA_FETCH` | 없다 | **있다** (첫 걸음) |
 * | 보내는 전량 | 호출자가 준 것 그대로 | 읽은 것 + 바뀐 것을 자연키로 병합 |
 * | 생략한 표·행·칸 | **지워진다** | 보존된다 |
 * | 검증 대상 | 호출자가 준 `cua_data` | **병합 결과** |
 * | 검증 실패 문구 | 접두사 없음 | `Failed to patch GUI status: ` 가 붙는다 |
 * | 응답 | 상태 몇 줄 | 표별 행 수 `summary` 10칸을 더 싣는다 |
 * | 인자 이름 | `cua_data` | `changes` |
 *
 * 마지막 두 줄이 실측의 자잘한 자리다: 구는 `Update`에서 검증 실패를 **바로
 * 돌려주고**(`handleUpdateGuiStatus.ts:113-120`), `Patch`에서는 같은 판정을
 * **throw** 해서 자기 catch가 접두사를 붙인다(`handlePatchGuiStatus.ts:177-181`).
 * 문구 자체도 다르다(`cua_data has` vs `merged cua has`).
 *
 * ## 시퀀스 (구 그대로)
 *
 *   CUA_FETCH → 병합 → 검증 → LOCK → CUA_WRITE → UNLOCK → (활성화)
 *
 * **`CUA_FETCH` 실패는 삼키지 않는다** — `CreateGuiStatus`가 같은 호출을 삼키는
 * 것과 갈리는 자리다. 읽지 못한 것을 병합의 바탕으로 삼으면 "보존한다"는 약속이
 * 거짓이 되기 때문이다.
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
  type CuaData,
  hardProblems,
  mergeCuaData,
  normalizeCuaInput,
  serializeCuaForRfc,
  validateCuaData,
} from './internal/cuaSchema';
import {
  activateParentProgram,
  programObjectUri,
  programScopedError,
} from './internal/programScoped';

/** 응답의 `summary`가 세는 열 표. `BIV`는 세지 않는다 — 구 그대로다. */
const SUMMARY_TABLES = [
  ['sta', 'STA'],
  ['fun', 'FUN'],
  ['pfk', 'PFK'],
  ['but', 'BUT'],
  ['tit', 'TIT'],
  ['men', 'MEN'],
  ['mtx', 'MTX'],
  ['act', 'ACT'],
  ['set', 'SET'],
  ['doc', 'DOC'],
] as const;

function summaryOf(merged: CuaData): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const [key, table] of SUMMARY_TABLES) {
    const rows = merged[table];
    summary[key] = Array.isArray(rows) ? rows.length : 0;
  }
  return summary;
}

export const patchGuiStatus = defineTool(
  {
    name: 'PatchGuiStatus',
    description:
      'Row-level merge into an existing ABAP GUI Status definition. Fetches current CUA → merges the caller-supplied changes (by natural key) → writes merged result back. Rows / fields you omit are preserved. Safer default for targeted edits; use UpdateGuiStatus only when you truly want to replace the whole CUA.\n\nMerge keys per table:\n  STA=CODE, FUN=CODE, PFK=CODE+PFNO, BUT=PFK_CODE+CODE+NO, TIT=CODE,\n  MEN=CODE+NO, MTX=CODE, ACT=CODE+NO, SET=STATUS+FUNCTION,\n  DOC=OBJ_TYPE+OBJ_CODE, BIV=CODE+POS.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      // 채록본의 이 자리에는 `type`도 `oneOf`도 없다 — `UpdateGuiStatus.cua_data`와 같다.
      changes: z
        .unknown()
        .describe(
          'Partial CUA data to merge into the current definition. Same shape as cua_data (ADM / STA / FUN / MEN / MTX / ACT / BUT / PFK / SET / DOC / TIT / BIV). Accepts JSON string or object. Rows matched by natural key are field-merged (changes win). New rows are appended. Omitted tables are left untouched.',
        ),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate: z.boolean().describe('Activate after patch. Default: false.').optional(),
      skip_validation: z
        .boolean()
        .describe('Skip client-side validation of the merged result. Default: false.')
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || args.changes === undefined || args.changes === null) {
      return programScopedError('Missing required parameters: program_name and changes');
    }

    let changes: CuaData;
    try {
      changes = normalizeCuaInput(args.changes);
    } catch (error) {
      return programScopedError(
        `Invalid changes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const programName = args.program_name.toUpperCase();
    const uri = programObjectUri(programName);
    const shouldActivate = args.activate === true;
    const steps: string[] = [];

    context.logger.info(`Patching GUI status: ${programName}`);

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      // ① 지금의 CUA를 읽는다. **실패를 삼키지 않는다** — 읽지 못한 것을 바탕으로
      //    병합하면 "생략한 것은 보존된다"는 약속이 거짓이 된다.
      const fetched = await channel.callDispatch('CUA_FETCH', { program: programName });
      let current: CuaData;
      try {
        const result = fetched.result;
        if (result && typeof result === 'object') current = result as CuaData;
        else if (typeof result === 'string') current = normalizeCuaInput(result);
        else current = {};
      } catch (error) {
        throw new Error(
          `Failed to parse current CUA for ${programName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      steps.push('fetch_current');

      // ② 자연키로 행 단위 병합.
      const merged = mergeCuaData(current, changes);
      steps.push('merge');

      // ③ **병합 결과**를 검증한다 — Update가 입력을 검증하는 것과 갈리는 자리다.
      if (args.skip_validation !== true) {
        const problems = validateCuaData(merged);
        const hard = hardProblems(problems);
        if (hard.length > 0) {
          // 구는 여기서 throw 해서 자기 catch가 접두사를 붙인다.
          throw new Error(
            `PatchGuiStatus rejected — merged cua has ${hard.length} validation problem(s). ` +
              `Fix changes (or pass skip_validation=true):\n${hard
                .map((problem) => `- ${problem.message}`)
                .join('\n')}`,
          );
        }
        if (problems.length > 0) {
          context.logger.warn(
            `Merged cua has ${problems.length} cross-reference warning(s): ${problems
              .map((problem) => problem.message)
              .join(' | ')}`,
          );
        }
      }

      // ④ 잠그고 ⑤ 병합 결과를 전량으로 쓴다 ⑥ 푼다.
      await client.withLock(uri, async () => {
        steps.push('lock');
        await channel.callDispatch('CUA_WRITE', {
          program: programName,
          cua_data: serializeCuaForRfc(merged),
        });
        steps.push('write');
      });
      steps.push('unlock');

      if (shouldActivate) {
        await activateParentProgram(client, programName, 'GUI status');
        steps.push('activate');
      }

      context.logger.info(`✅ GUI status patched: ${programName}`);

      return okResult({
        success: true,
        program_name: programName,
        type: 'CUAD',
        activated: shouldActivate,
        steps_completed: steps,
        summary: summaryOf(merged),
        message: shouldActivate
          ? `GUI Status for ${programName} patched and activated.`
          : `GUI Status for ${programName} patched (not activated).`,
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error patching GUI status: ${message}`);
      return programScopedError(`Failed to patch GUI status: ${message}`);
    }
  },
);
