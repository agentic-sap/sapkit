/**
 * CheckSyntax — SAP에 **아무것도 쓰지 않는** 독립 구문 검사.
 *
 * 다섯 종류 전부 결국 `POST /sap/bc/adt/checkruns?reporters=abapCheckRun` 하나로
 * 간다. 갈리는 것은 본문이다:
 *
 *  - `source_code`가 있고 class/program/interface면 **인라인 아티팩트** 본문 —
 *    제안 소스를 base64로 실어 그 자리에서 컴파일시킨다. 서버 상태는 그대로다.
 *  - 그 밖에는 URI + `chkrun:version="inactive"`만 실어, 서버에 이미 올라가 있는
 *    비활성 판을 검사한다. include·function_module에 준 `source_code`는 SAP의
 *    checkrun이 받아 주지 않으므로 **무시되고**, 무시했다는 사실이 `note`로
 *    응답에 남는다.
 *
 * 구조에서 물려받은 결이 하나 있다. class/program/interface를 `source_code`
 * 없이 검사할 때, 구 엔진은 벤더 래퍼를 거쳤고 그 래퍼는 오류가 있으면
 * **던졌다** — 그래서 그 갈래에서만 구문 오류가 도구 오류로 올라온다. 도구
 * 설명이 말하는 "구문 오류는 보통 결과로 돌려준다"와 어긋나지만, 이것이 구
 * 동작이고 의도적 차이는 별도 등재 사안이므로 여기서는 **그대로 승계**한다.
 *
 * ## 판정불능을 실패로 말하지 않는다 (차이 — `harness/DIVERGENCES.md` D149)
 *
 * `CheckSyntax(include)`가 메인 프로그램 문맥 없이 `success:false · errors:[]`를
 * 냈다(2026-07-31 · 2회 재현 · 직후 활성화는 오류 0 — `sapkit-feedback.md`). 구는
 * `status !== 'processed'`를 그대로 `success:false`로 접어, **오류가 하나도 없는
 * 실패**라는 자기모순을 낸다. 지금은 세 값 `verdict`(`clean`·`errors`·
 * `indeterminate`)를 함께 싣고, 판정불능이면 `success: null`이다. include에는 덧인자
 * `main_program`이 있다 — 주면 그 프로그램의 트리(메인 + 인클루드 전량 · 비활성)를
 * 컴파일해 진짜 판정을 얻는다(쓰기 쪽 `UpdateInclude`가 쓰는 것과 같은 요청이다 —
 * `write/internal/programScoped.ts`의 `runProgramTreeCheck`). 실기 미검증.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import {
  functionModuleCheckUri,
  includeCheckUri,
  objectCheckUri,
  objectInlineUri,
  objectSourcePath,
  readSourceText,
} from './internal/adt';
import {
  ACCEPT_CHECK_MESSAGES,
  CHECKRUN_PATH,
  CHECKRUN_REPORTER,
  CT_CHECK_OBJECTS,
  type CheckRunResult,
  buildCheckObjectList,
  buildInlineArtifactCheckObjectList,
  downgradeReportMissingNoise,
  emptyCheckResult,
  isAlreadyCheckedText,
  isReportMissingNoiseText,
  parseCheckRunResponse,
  wrapperWouldThrow,
} from './internal/checkRun';
import { messageOf, ok, returnError } from './internal/results';

type CheckKind = 'class' | 'program' | 'interface' | 'include' | 'functionModule';

const KIND_MAP: Record<string, CheckKind> = {
  class: 'class',
  program: 'program',
  interface: 'interface',
  include: 'include',
  function_module: 'functionModule',
};

const WRAPPER_LABEL: Record<'class' | 'program' | 'interface', string> = {
  class: 'Class',
  program: 'Program',
  interface: 'Interface',
};

const CHECKRUN_REQUEST_PATH = `${CHECKRUN_PATH}?reporters=${CHECKRUN_REPORTER}`;

/** 서버에 이미 있는 판을 검사한다. 이 갈래는 던지지 않는다. */
async function rawCheckRun(
  client: AdtClient,
  objectUri: string,
  version: 'active' | 'inactive' = 'inactive',
): Promise<CheckRunResult> {
  try {
    const response = await client.request({
      method: 'POST',
      path: CHECKRUN_REQUEST_PATH,
      body: buildCheckObjectList(objectUri, version),
      contentType: CT_CHECK_OBJECTS,
      timeout: 'default',
    });
    return parseCheckRunResponse(response.body);
  } catch (error) {
    if (isAlreadyCheckedText(messageOf(error))) return emptyCheckResult();
    throw error;
  }
}

/** 제안 소스를 그 자리에서 컴파일시킨다. PUT도 잠금도 없다. */
async function inlineArtifactCheck(
  client: AdtClient,
  outerUri: string,
  artifactUri: string,
  sourceCode: string,
): Promise<CheckRunResult> {
  try {
    const response = await client.request({
      method: 'POST',
      path: CHECKRUN_REQUEST_PATH,
      body: buildInlineArtifactCheckObjectList(outerUri, artifactUri, sourceCode),
      contentType: CT_CHECK_OBJECTS,
      accept: ACCEPT_CHECK_MESSAGES,
      timeout: 'default',
    });
    return parseCheckRunResponse(response.body);
  } catch (error) {
    if (isAlreadyCheckedText(messageOf(error))) return emptyCheckResult();
    throw error;
  }
}

/**
 * 비활성 판이 없는 프로그램의 회복 경로.
 *
 * 비활성 판이 없으면 SAP은 "REPORT/PROGRAM 문이 없다"는 잡음을 낸다 — 소스는
 * 멀쩡한데 오류로 보인다. 진짜 활성 소스를 읽어 그것을 인라인으로 검사하면,
 * 멀쩡한 프로그램은 깨끗하게 나오고 실제로 깨진 프로그램은 줄 번호가 붙은
 * 진짜 오류를 낸다. 활성 소스조차 못 읽으면 유일한 신호가 알려진 거짓 양성
 * 뿐이므로 깨끗한 결과로 본다.
 */
async function activeProgramSourceCheck(
  client: AdtClient,
  name: string,
  warn: (message: string) => void,
): Promise<CheckRunResult> {
  const programUri = objectInlineUri('program', name);

  let activeSource = '';
  try {
    const response = await readSourceText(
      client,
      objectSourcePath('program', name),
      'active',
    );
    activeSource = response.body;
  } catch (error) {
    warn(`could not read active source for '${name}': ${messageOf(error)}`);
  }

  if (!activeSource.trim()) return emptyCheckResult();

  const result = await inlineArtifactCheck(
    client,
    programUri,
    `${programUri}/source/main`,
    activeSource,
  );
  return downgradeReportMissingNoise(result);
}

/**
 * 구 벤더 래퍼가 서 있던 자리. 오류가 있으면 던진다 — 그 던짐이 이 갈래의
 * 계약이다(파일 머리 주석 참조).
 */
async function wrappedCheck(
  client: AdtClient,
  kind: 'class' | 'program' | 'interface',
  name: string,
): Promise<CheckRunResult> {
  const result = await rawCheckRun(client, objectCheckUri(kind, name), 'inactive');
  const verdict = wrapperWouldThrow(result);
  if (verdict.throws) {
    const joined = verdict.errors.map((entry) => entry.text).join('; ');
    throw new Error(`${WRAPPER_LABEL[kind]} check failed: ${joined}`);
  }
  return result;
}

export type CheckVerdict = 'clean' | 'errors' | 'indeterminate';

/**
 * 검사 결과를 세 값으로 가른다 — D149.
 *
 *  - `errors`: 실오류가 하나라도 있다.
 *  - `clean`: 오류 0이고 SAP이 검사를 **실제로 처리했다**(`processed`), 또는 보고서
 *    자체가 없어 「문제 없음」으로 답한 것(`no_report`), 또는 「이미 검사됐다」로
 *    돌려보낸 것(`not_run`).
 *  - `indeterminate`: 오류 0인데 상태가 그 밖이다(`notProcessed`·`parse_error`·알 수
 *    없는 값) — SAP이 판정을 **내리지 않았다**. include에서 메인 프로그램 문맥 없이
 *    검사할 때 실제로 이렇게 온다. 그리고 include의 오류가 **전부** "REPORT/PROGRAM 문이
 *    없다" 잡음이면 그것도 판정불능이다 — 그 문구는 컴파일할 문맥이 없다는 뜻이지
 *    소스가 틀렸다는 뜻이 아니다(쓰기 쪽 `assertNoCheckErrors`가 같은 판단을 한다).
 */
export function verdictOf(
  kind: CheckKind,
  result: CheckRunResult,
): { verdict: CheckVerdict; reason?: string } {
  if (result.errors.length > 0) {
    if (kind === 'include' && result.errors.every((entry) => isReportMissingNoiseText(entry.text))) {
      return {
        verdict: 'indeterminate',
        reason:
          `SAP could not compile the include on its own (${result.errors.map((entry) => entry.text).join(' | ')}). ` +
          'Pass main_program (the program that INCLUDEs it) to check it inside that program\'s tree.',
      };
    }
    return { verdict: 'errors' };
  }
  if (result.status === 'processed' || result.status === 'no_report' || result.status === 'not_run') {
    return { verdict: 'clean' };
  }
  const detail = result.message ? ` (${result.message})` : '';
  return {
    verdict: 'indeterminate',
    reason:
      `SAP returned no verdict: check run status "${result.status}" with no messages${detail}.` +
      (kind === 'include'
        ? ' An include has no compile context of its own — pass main_program (the program that INCLUDEs it) to check it inside that program\'s tree.'
        : ''),
  };
}

async function runSyntaxCheck(
  client: AdtClient,
  args: {
    kind: CheckKind;
    name: string;
    sourceCode?: string;
    functionGroupName?: string;
    mainProgram?: string;
  },
  warn: (message: string) => void,
): Promise<CheckRunResult> {
  const { kind, name } = args;

  try {
    if (kind === 'include') {
      // D149 — 메인 프로그램을 주면 그 트리를 컴파일한다. 프로그램 URI **하나만**
      // 실어 `inactive`로 보내면 메인 + 인클루드 전량이 한 번에 컴파일된다
      // (`write/internal/programScoped.ts`의 `runProgramTreeCheck`와 같은 요청).
      if (args.mainProgram !== undefined) {
        return await rawCheckRun(client, objectCheckUri('program', args.mainProgram), 'inactive');
      }
      return await rawCheckRun(client, includeCheckUri(name), 'inactive');
    }
    if (kind === 'functionModule') {
      const group = String(args.functionGroupName).toUpperCase();
      return await rawCheckRun(client, functionModuleCheckUri(group, name), 'inactive');
    }

    if (args.sourceCode !== undefined) {
      const outerUri = objectInlineUri(kind, name);
      return await inlineArtifactCheck(
        client,
        outerUri,
        `${outerUri}/source/main`,
        args.sourceCode,
      );
    }

    if (kind === 'program') {
      try {
        return await wrappedCheck(client, 'program', name);
      } catch (error) {
        if (isAlreadyCheckedText(messageOf(error))) throw error;
        if (isReportMissingNoiseText(messageOf(error))) {
          return await activeProgramSourceCheck(client, name, warn);
        }
        throw error;
      }
    }

    return await wrappedCheck(client, kind, name);
  } catch (error) {
    if (isAlreadyCheckedText(messageOf(error))) return emptyCheckResult();
    throw error;
  }
}

export const checkSyntax = defineTool(
  {
    name: 'CheckSyntax',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json`) — D149.
    description:
      "[read-only] Run a standalone ABAP syntax check WITHOUT writing anything to SAP. Supports 'class', 'program', 'interface', 'include', and 'function_module'. If source_code is provided (class/program/interface only), the proposed source is compiled in place and checked without touching the server. If source_code is omitted, checks whatever is currently staged as the inactive version on the server (mirroring the post-write check Update* handlers run). Syntax errors are returned as normal results, not as tool errors — only connection/infra failures are reported as errors." +
      " For 'include', pass main_program (the program that INCLUDEs it) to compile the include inside that program's tree — main plus all includes, inactive version; without it SAP may return no verdict at all, which is reported as success: null with verdict: \"indeterminate\" (not as a failure). Every response carries verdict: \"clean\" | \"errors\" | \"indeterminate\".",
    inputSchema: {
      object_type: z
        .enum(['class', 'program', 'interface', 'include', 'function_module'])
        .describe(
          "[read-only] ABAP object kind to check: 'class' (CLAS), 'program' (PROG), 'interface' (INTF), 'include' (PROG/I), or 'function_module' (FUGR/FF).",
        ),
      object_name: z
        .string()
        .describe('[read-only] Name of the object to check (e.g., ZCL_MY_CLASS).'),
      function_group_name: z
        .string()
        .optional()
        .describe(
          "[read-only] Function group name. Required when object_type is 'function_module'.",
        ),
      source_code: z
        .string()
        .optional()
        .describe(
          "[read-only] Optional proposed ABAP source code to check in place. Only honored for object_type 'class', 'program', or 'interface' — ignored for 'include' and 'function_module' (see description).",
        ),
      // 덧인자(D149) — 채록본에 없던 선택 인자.
      main_program: z
        .string()
        .optional()
        .describe(
          "[read-only] For object_type 'include' only: name of the main program that INCLUDEs it. When given, the include is compiled inside that program's tree (inactive version) so the check has a real verdict.",
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    // `targetNames`를 **일부러 선언하지 않는다.** 이 도구는 `source_code` 인자로
    // 원본을 통째로 받으므로, 대상 이름이 Z여도 표준 소스가 실려 올 수 있다.
    // 선언하는 순간 녹화의 사후 백스톱(`detectUnguardedSource`)이 이 도구를
    // 건너뛰어 그 경로가 열린다. 판정은 백스톱이 계속 소유한다.
  },
  async (context, args) => {
    try {
      const { object_type, object_name, function_group_name, source_code, main_program } = args;

      if (!object_type || !object_name) {
        throw new Error('object_type and object_name are required');
      }

      const kind = KIND_MAP[object_type];
      if (!kind) {
        throw new Error(
          `Unsupported object_type '${object_type}'. Must be one of: ${Object.keys(KIND_MAP).join(', ')}`,
        );
      }
      if (kind === 'functionModule' && !function_group_name) {
        throw new Error('function_group_name is required when object_type is function_module');
      }

      const name = String(object_name).toUpperCase();
      const sourceCodeIgnored =
        source_code !== undefined && (kind === 'include' || kind === 'functionModule');
      // D149 — include에만 뜻이 있다. 다른 종류에 오면 무시하고 note로 남긴다.
      const mainProgram =
        kind === 'include' && main_program?.trim() ? main_program.trim().toUpperCase() : undefined;
      const mainProgramIgnored = main_program !== undefined && kind !== 'include';

      context.logger.info(
        `CheckSyntax: object_type=${object_type}, object_name=${name}, hasSourceCode=${!!source_code}` +
          (mainProgram ? `, mainProgram=${mainProgram}` : ''),
      );

      const client = await context.getConnection();
      const result = await runSyntaxCheck(
        client,
        {
          kind,
          name,
          sourceCode: sourceCodeIgnored ? undefined : source_code,
          functionGroupName: kind === 'functionModule' ? function_group_name : undefined,
          mainProgram,
        },
        (message) => context.logger.warn(message),
      );
      const { verdict, reason } = verdictOf(kind, result);

      const notes: string[] = [];
      if (sourceCodeIgnored) {
        notes.push(
          `source_code is only used for pre-write substitution checks on class/program/interface; SAP's checkrun endpoint for '${object_type}' always validates the current inactive version already staged on the server, so the supplied source_code was ignored.`,
        );
      }
      if (mainProgramIgnored) {
        notes.push(`main_program only applies to object_type 'include'; it was ignored for '${object_type}'.`);
      }

      return ok(
        JSON.stringify(
          {
            // D149 — 판정불능은 실패가 아니다: `null`이 「판정 없음」이다.
            success: verdict === 'clean' ? true : verdict === 'errors' ? false : null,
            verdict,
            check_status: result.status,
            reason,
            object_type,
            object_name: name,
            main_program: mainProgram,
            errors: result.errors,
            warnings: result.warnings,
            note: notes.length > 0 ? notes.join(' ') : undefined,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      // 구문 오류는 위에서 정상 결과로 나갔다. 여기 오는 것은 인자 오류와
      // 전송·기반 실패뿐이다.
      context.logger.error(`CheckSyntax failed: ${messageOf(error)}`);
      return returnError(error);
    }
  },
);
