/**
 * UpdateGuiStatus — CUA 정의를 **통째로 갈아엎는다**(FULL REPLACE).
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/gui_status/high/handleUpdateGuiStatus.ts:71-248`
 *  - 대리자 와이어: `engine/src/lib/odataRfc.ts:288-327` (`ZMCP_ADT_DISPATCH` →
 *    `RS_CUA_INTERNAL_WRITE`)
 *  - 검증 규칙: `engine/src/lib/cuaSchema.ts:162-234` → `./internal/cuaSchema.ts`
 *  - 잠금·활성화 와이어: `./internal/programScoped.ts` 머리주석
 *
 * ## 시퀀스 (구 그대로)
 *
 *   정규화 → 검증 → LOCK(부모 프로그램) → CUA_WRITE(전량) → UNLOCK → (활성화)
 *
 * **검증이 잠금보다 앞이다**(`:96-128` vs `:141`). 못 쓸 페이로드로 프로그램을
 * 잠그지 않겠다는 것이고, 그래서 검증 실패에서는 SAP 왕복이 **한 번도** 없다.
 *
 * ## `PatchGuiStatus`와 무엇이 다른가 — **읽지 않는다**
 *
 * 이 도구는 `CUA_FETCH`를 **부르지 않는다.** 호출자가 준 `cua_data`가 곧
 * 프로그램의 새 CUA 전부이며, 빠뜨린 표·행·칸은 **지워진다**(`RS_CUA_INTERNAL_WRITE`의
 * 원자적 전량 교체 — `cuaSchema.ts:5-8`). `PatchGuiStatus`는 같은 자리에서 먼저
 * 읽고 자연키로 병합한 뒤 쓴다. 발행 설명의 `⚠️ FULL REPLACE`가 그 차이를 말한다.
 *
 * ## 검증의 두 등급 (실측 `:108-127`)
 *  - **막는 것**: 표별 필수 칸 누락(STA.CODE · FUN.CODE · PFK.{CODE,PFNO,FUNCODE} ·
 *    BUT.{PFK_CODE,CODE,NO,PFNO} · TIT.CODE).
 *  - **경고만**: 상호참조(`STA.PFKCODE`·`BUT.PFK_CODE`가 PFK에 없다). 부분
 *    페이로드에서 흔히 걸리므로 로그로만 남기고 통과시킨다.
 *  - `skip_validation: true`면 둘 다 건너뛴다.
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
  normalizeCuaInput,
  serializeCuaForRfc,
  validateCuaData,
} from './internal/cuaSchema';
import {
  activateParentProgram,
  programObjectUri,
  programScopedError,
} from './internal/programScoped';

export const updateGuiStatus = defineTool(
  {
    name: 'UpdateGuiStatus',
    description:
      '⚠️ FULL REPLACE — overwrites the entire GUI Status definition (all 12 CUA tables) for the program. Any row or field you omit is DROPPED. Always Read (ReadGuiStatus) → modify → Update, or use PatchGuiStatus for row-level merges. cua_data must include complete STA / FUN / PFK / BUT / TIT rows with all required fields (CODE, PFNO, FUNCODE, ...). Handles lock/unlock automatically.',
    inputSchema: {
      program_name: z.string().describe('Parent program name.'),
      // 채록본의 이 자리에는 `type`도 `oneOf`도 없다 — 구 서버가 발행한 표면에는
      // 설명 한 줄뿐이다. 글이든 객체든 받는 것은 핸들러가 판정한다.
      cua_data: z
        .unknown()
        .describe(
          'Complete CUA data — accepts either a JSON string or a structured object with ADM / STA / FUN / MEN / MTX / ACT / BUT / PFK / SET / DOC / TIT / BIV. Required row fields: STA.CODE, FUN.CODE, PFK.{CODE,PFNO,FUNCODE}, BUT.{PFK_CODE,CODE,NO,PFNO}, TIT.CODE. Missing rows are dropped — this is full-replace semantics.',
        ),
      transport_request: z.string().describe('Transport request number.').optional(),
      activate: z.boolean().describe('Activate after update. Default: false.').optional(),
      skip_validation: z
        .boolean()
        .describe(
          'Skip client-side schema validation. Default: false. Only set true if you know the CUA payload is intentionally partial and SAP will accept it.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    if (!args.program_name || args.cua_data === undefined || args.cua_data === null) {
      return programScopedError('Missing required parameters: program_name and cua_data');
    }

    let cua: CuaData;
    try {
      cua = normalizeCuaInput(args.cua_data);
    } catch (error) {
      return programScopedError(
        `Invalid cua_data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 검증은 **잠금보다 앞**이다 — 못 쓸 페이로드로 프로그램을 잠그지 않는다.
    if (args.skip_validation !== true) {
      const problems = validateCuaData(cua);
      const hard = hardProblems(problems);
      if (hard.length > 0) {
        return programScopedError(
          `UpdateGuiStatus rejected — cua_data has ${hard.length} validation problem(s). ` +
            `Fix these (or pass skip_validation=true to bypass):\n${hard
              .map((problem) => `- ${problem.message}`)
              .join('\n')}`,
        );
      }
      if (problems.length > 0) {
        context.logger.warn(
          `cua_data has ${problems.length} cross-reference warning(s): ${problems
            .map((problem) => problem.message)
            .join(' | ')}`,
        );
      }
    }

    const programName = args.program_name.toUpperCase();
    const uri = programObjectUri(programName);
    const shouldActivate = args.activate === true;

    context.logger.info(`Updating GUI status data: ${programName}`);

    try {
      const client = await context.getConnection();
      const channel = await rfcChannelFor(context);

      await client.withLock(uri, async () => {
        await channel.callDispatch('CUA_WRITE', {
          program: programName,
          cua_data: serializeCuaForRfc(cua),
        });
      });

      if (shouldActivate) {
        await activateParentProgram(client, programName, 'GUI status');
      }

      context.logger.info(`✅ GUI status updated: ${programName}`);

      return okResult({
        success: true,
        program_name: programName,
        type: 'CUAD',
        activated: shouldActivate,
        message: shouldActivate
          ? `GUI Status data for ${programName} updated and activated.`
          : `GUI Status data for ${programName} updated (not activated).`,
        steps_completed: ['lock', 'update', 'unlock', ...(shouldActivate ? ['activate'] : [])],
      });
    } catch (error) {
      const message = describeFailure(error);
      context.logger.error(`Error updating GUI status: ${message}`);
      return programScopedError(`Failed to update GUI status: ${message}`);
    }
  },
);
