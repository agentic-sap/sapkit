/**
 * UpdateProgram — 기존 프로그램의 소스를 갈아 끼운다.
 *
 * 시퀀스는 잠금 → **쓰기 전 구문검사** → PUT → 해제 → 사후검사 → (활성화)다.
 * 구 핸들러(`engine/src/handlers/program/high/handleUpdateProgram.ts`)와 같다.
 *
 * 세 가지가 이 순서의 이유다:
 *  1. 검사가 **PUT 앞에** 있다 — 깨진 코드는 서버에 닿지 않고, 활성 버전은
 *     그대로 살아 있는다.
 *  2. 잠금과 PUT 사이가 stateless로 새면 SAP이 다른 워크 프로세스로 라우팅하며
 *     세션을 접고, 잠금이 증발해 PUT이 423으로 죽는다. 접속 계층의 `withLock`이
 *     잠금 보유 구간을 stateful로 유지하므로 여기서 다시 손대지 않는다.
 *  3. 활성화 응답은 **오류를 담은 채 200으로 온다**. 상태 코드만 보면 거짓
 *     성공이 된다 — 본문의 `E` 메시지를 실패로 되돌린다.
 *
 * ## 거짓 FIXPT precheck를 통째로 믿지 않는다 (차이 — `harness/DIVERGENCES.md` D144)
 *
 * 쓰기 전 검사는 제안 소스를 인라인으로 컴파일하는데(`checkProposed`), 그 경로가
 * `TRDIR.FIXPT='X'` 프로그램에서 「fixed point arithmetic flag」 오류 수십 건 + 인라인
 * 선언 연쇄 `is unknown`을 **거짓으로** 내고 쓰기를 통째로 막는 일이 실측됐다
 * (2026-08-06 38건 · 08-19 51건 6연속 — `sapkit-feedback.md`). 같은 순간 `source_code`
 * 없는 raw check는 오류 0, 활성화도 오류 0이었다. 인클루드 경로(프로그램 트리 검사)는
 * 걸리지 않았다. 무엇이 그 경로를 켜는지는 **여전히 미확인**이다.
 *
 * 그래서 인라인 검사가 **FIXPT 계열 오류를 포함해** 실패하면 저장된 판을 한 번 더
 * 검사하고(`checkStored` · inactive), 그쪽이 깨끗하면 precheck를 신뢰하지 않고 쓰기를
 * 진행한다 — 응답에 `precheck_overridden: true`와 오류 원문(`precheck_messages`)을
 * 싣는다. ⚠ 이 갈래에서는 **제안 소스가 쓰기 전에 검증되지 않은 채** 올라간다:
 * 저장된 판의 검사는 저장된 판을 보는 것이지 제안을 보는 것이 아니다. 진짜 판정은
 * 사후검사(`check_warnings`)와 활성화가 한다. FIXPT 문구가 없는 실패는 구 그대로 막는다.
 * 실기 미검증.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  CT_ACTIVATION,
  type CheckMessage,
  type CheckRunResult,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  checkProposed,
  checkStored,
  describeFailure,
  errorResult,
  isReportMissingNoise,
  okResult,
  parseActivationMessages,
  programUri,
  putSource,
} from './shared';

/** 거짓 precheck의 표식 — 실측 문구 «…can only be used when the fixed point arithmetic flag is activated». */
export const FIXPT_FALSE_POSITIVE = /fixed point arithmetic/i;

/** D144 — 인라인 검사가 FIXPT 계열로 실패했는가. 그 문구가 하나도 없으면 거짓 precheck가 아니다. */
export function looksLikeFixptFalsePositive(preCheck: CheckRunResult): boolean {
  return preCheck.errors.some((entry) => FIXPT_FALSE_POSITIVE.test(entry.text));
}

export const updateProgram = defineTool(
  {
    name: 'UpdateProgram',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json`) — D144.
    description:
      'Update source code of an existing ABAP program. Locks the program, checks new code, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.' +
      " If the in-place pre-check rejects the proposed source with 'fixed point arithmetic flag' errors (a known false positive on programs with FIXPT set) while the stored version checks clean, the write proceeds with precheck_overridden: true and those messages under precheck_messages — the post-write check and activation do the real compile.",
    inputSchema: {
      program_name: z
        .string()
        .describe('Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.'),
      source_code: z.string().describe('Complete ABAP program source code.'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      activate: z
        .boolean()
        .describe(
          'Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['program_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.program_name || !args.source_code) {
      return errorResult('Missing required parameters: program_name and source_code');
    }

    const programName = args.program_name.toUpperCase();
    const uri = programUri(programName);
    const shouldActivate = args.activate === true;
    const sourceCode = args.source_code;
    logger.info(`Starting program source update: ${programName} (activate=${shouldActivate})`);

    try {
      const client = await context.getConnection();
      let checkWarnings: CheckMessage[] = [];
      // D144 — 거짓 FIXPT precheck를 넘어 쓴 경우 그 원문. 아니면 undefined.
      let precheckOverride: { messages: CheckMessage[]; storedStatus: string } | undefined;

      await client.withLock(uri, async (lock) => {
        const preCheck = await checkProposed(client, uri, `${uri}/source/main`, sourceCode);
        try {
          assertNoCheckErrors(preCheck, 'Program', programName);
        } catch (error) {
          if (!(error instanceof SourceCheckFailure) || !looksLikeFixptFalsePositive(preCheck)) {
            throw error;
          }
          // 저장된 판을 한 번 더 검사한다 — 그쪽이 깨끗하면 인라인 경로가 깨진 것이다.
          const stored = await checkStored(client, uri, 'inactive');
          const storedReal = stored.errors.filter((entry) => !isReportMissingNoise(entry.text));
          if (storedReal.length > 0) throw error;
          precheckOverride = { messages: [...preCheck.errors], storedStatus: stored.status };
          logger.warn(
            `Program ${programName}: in-place pre-check rejected the source with ${preCheck.errors.length} ` +
              'fixed-point-arithmetic-class error(s) while the stored version checks clean — treating the ' +
              'pre-check as a false positive and writing (D144)',
          );
        }
        checkWarnings = [...preCheck.warnings];
        await putSource(client, uri, lock.handle, sourceCode, args.transport_request);
      });
      logger.info(`Program source code updated: ${programName}`);

      // 사후검사는 최선 노력이다 — 전송요청·툴링 사정으로 이 패스가 실패해도
      // 쓰기 자체를 되돌리지 않는다. 다만 **결과는 삼키지 않는다**: 경고도
      // 오류도 종류(type)를 단 채 그대로 실려 나간다.
      try {
        const postCheck = await checkStored(client, uri, 'inactive');
        checkWarnings = [...checkWarnings, ...postCheck.errors, ...postCheck.warnings];
      } catch (error) {
        logger.warn(`Inactive version check had issues: ${programName} - ${describeFailure(error)}`);
      }

      let activationWarnings: string[] = [];
      if (shouldActivate) {
        const body = await activateOne(client, uri, programName, {
          contentType: CT_ACTIVATION,
        });
        const messages = parseActivationMessages(body);
        const failures = activationErrors(messages);
        if (failures.length > 0) {
          // 구 엔진은 여기서 success:true를 돌려줬다. 활성화되지 않은 것을
          // 활성화됐다고 말하는 것은 거짓 성공이다.
          throw new SourceCheckFailure(
            `Activation failed: program ${programName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The source update is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        activationWarnings = messages.map((entry) => `${entry.type}: ${entry.text || 'Unknown'}`);
        logger.info(`Program activated: ${programName}`);
      }

      return okResult({
        success: true,
        program_name: programName,
        type: 'PROG/P',
        activated: shouldActivate,
        message: shouldActivate
          ? `Program ${programName} source updated and activated successfully`
          : `Program ${programName} source updated successfully (not activated)`,
        uri,
        steps_completed: [
          'lock',
          'check_new_code',
          ...(precheckOverride ? ['check_stored_version'] : []),
          'update',
          'unlock',
          'check_inactive',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
        // D144 — 이 세 키는 거짓 precheck를 넘어 썼을 때만 나타난다.
        precheck_overridden: precheckOverride ? true : undefined,
        precheck_messages: precheckOverride?.messages,
        precheck_note: precheckOverride
          ? `The in-place pre-check rejected the proposed source with ${precheckOverride.messages.length} ` +
            "error(s) of the 'fixed point arithmetic flag' class while the stored version checks clean " +
            `(status "${precheckOverride.storedStatus}") — a known false positive on FIXPT programs. The source ` +
            'was written WITHOUT a pre-write syntax verdict: check_warnings holds the post-write check of the ' +
            'inactive version, and activation is the real compile.'
          : undefined,
        source_size_bytes: sourceCode.length,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating program source ${programName}: ${message}`);
      if (error instanceof SourceCheckFailure) return errorResult(message);
      return errorResult(`Failed to update program ${programName}: ${message}`);
    }
  },
);
