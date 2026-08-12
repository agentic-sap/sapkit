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

async function runSyntaxCheck(
  client: AdtClient,
  args: {
    kind: CheckKind;
    name: string;
    sourceCode?: string;
    functionGroupName?: string;
  },
  warn: (message: string) => void,
): Promise<CheckRunResult> {
  const { kind, name } = args;

  try {
    if (kind === 'include') {
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
    description:
      "[read-only] Run a standalone ABAP syntax check WITHOUT writing anything to SAP. Supports 'class', 'program', 'interface', 'include', and 'function_module'. If source_code is provided (class/program/interface only), the proposed source is compiled in place and checked without touching the server. If source_code is omitted, checks whatever is currently staged as the inactive version on the server (mirroring the post-write check Update* handlers run). Syntax errors are returned as normal results, not as tool errors — only connection/infra failures are reported as errors.",
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
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const { object_type, object_name, function_group_name, source_code } = args;

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

      context.logger.info(
        `CheckSyntax: object_type=${object_type}, object_name=${name}, hasSourceCode=${!!source_code}`,
      );

      const client = await context.getConnection();
      const result = await runSyntaxCheck(
        client,
        {
          kind,
          name,
          sourceCode: sourceCodeIgnored ? undefined : source_code,
          functionGroupName: kind === 'functionModule' ? function_group_name : undefined,
        },
        (message) => context.logger.warn(message),
      );

      return ok(
        JSON.stringify(
          {
            success: result.success,
            object_type,
            object_name: name,
            errors: result.errors,
            warnings: result.warnings,
            note: sourceCodeIgnored
              ? `source_code is only used for pre-write substitution checks on class/program/interface; SAP's checkrun endpoint for '${object_type}' always validates the current inactive version already staged on the server, so the supplied source_code was ignored.`
              : undefined,
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
