/**
 * DeleteInclude — 인클루드 프로그램(Type I)을 SAP에서 **지운다.** 필요하면 메인
 * 프로그램의 `INCLUDE <이름>.` 줄을 먼저 걷어낸다.
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 이 묶음에서 **유일하게 진짜 `DELETE` 메서드를 쓰는 오브젝트 삭제**다
 *
 * 겉: `engine/src/handlers/include/high/handleDeleteInclude.ts:259-428`. 벤더에
 * 인클루드 메서드가 없어 겉 핸들러가 ADT REST를 직접 친다.
 *
 * ```
 * (선택) 메인 프로그램 정리
 *   ⓐ GET    /sap/bc/adt/programs/programs/{대문자}/source/main
 *   ⓑ LOCK   POST …?_action=LOCK&accessMode=MODIFY        (stateful)
 *   ⓒ PUT    …/source/main?lockHandle=…[&corrNr=…]        (stateless · Accept 없음)
 *   ⓓ UNLOCK POST …?_action=UNLOCK&lockHandle=…           (stateful)
 *   ⓔ 활성화 POST /sap/bc/adt/activation?method=activate&preauditRequested=true (long)
 * 본 삭제
 *   ① LOCK   POST /sap/bc/adt/programs/includes/{대문자}?_action=LOCK&accessMode=MODIFY (stateful)
 *   ② DELETE DELETE /sap/bc/adt/programs/includes/{대문자}?lockHandle=…[&corrNr=…] (stateless)
 * ```
 *
 * ## 실측한 함정 넷 — 이웃 도구를 베끼면 전부 틀린다
 *
 *  1. **성공하면 UNLOCK을 보내지 않는다.** 오브젝트가 사라졌기 때문이다. 해제는
 *     실패 경로에만 있다(`:384-403`). `withLock`을 쓰면 삭제된 주소에 UNLOCK을
 *     보내게 되므로 여기서는 잠금 수명주기를 손으로 짠다.
 *  2. **세션이 걸음마다 뒤집힌다.** 잠금·해제는 stateful, PUT·DELETE는 stateless다
 *     (`:313-323`·`:387-395`). 다른 삭제 도구는 삭제 걸음이 stateful이었다.
 *  3. **활성화 XML의 인코딩 표기가 대문자 `UTF-8`이다**(`:235`). 형제
 *     `DeleteTextElement`는 소문자 `utf-8`을 쓴다(`handleDeleteTextElement.ts:206`).
 *     그래서 `./internal/programScoped.ts`의 `activateParentProgram`을 쓰지 않고
 *     여기서 따로 조립한다 — 한 글자 차이지만 채록 대조의 대상이다.
 *  4. **오류 문구의 우선순위가 삭제 서비스 계열과 반대다.** 이쪽은 예외 XML의
 *     `SAP Error:`가 **먼저**이고, 그것이 없을 때만 404·423·400 힌트를 쓴다
 *     (`:405-421`). `DeleteClass` 계열은 상태 코드가 먼저였다.
 *
 * ## 구를 그대로 둔 자리
 *
 *  - **메인 프로그램 정리 실패는 삼킨다.** 메모만 남기고 삭제를 계속한다 — 구
 *    주석이 이유를 적는다("delete will likely still fail with 'referenced' error,
 *    but the SAP message is more helpful than our soft failure").
 *  - **활성화 실패도 경고로 끝난다**(`:250-254`). 여기서는 응답 본문까지 읽지만
 *    판정 결과는 그대로 메모로 접힌다 — 구의 흐름을 바꾸지 않는다.
 *  - **인클루드 이름을 정규식에 이스케이프 없이 넣는다**(`:81-84`). `.`이 든 이름은
 *    임의 문자로 읽힌다. 구의 동작이므로 재현했다.
 *  - 클라우드(JWT) 거절 갈래는 짓지 않았다 — 차이 장부 **D112**.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { programObjectUri } from './internal/programScoped';
import {
  CT_ACTIVATION_REQUEST,
  CT_SOURCE,
  describeFailure,
  encodeObjectName,
  errorResult,
  okResult,
} from './shared';

/** 인클루드 주소 — **대문자 그대로**(`./shared.ts`의 `includeUri`와 같은 규칙). */
function includeDeletionUri(includeName: string): string {
  return `/sap/bc/adt/programs/includes/${encodeObjectName(includeName)}`;
}

/**
 * 소스에서 `INCLUDE <이름>.` 줄을 걷어낸다. 주석 줄(`*`·`"`)은 건드리지 않고,
 * 줄바꿈 표기(CRLF/LF)는 원본을 따른다. 구 `removeIncludeStatement`와 같다.
 */
export function removeIncludeStatement(
  mainSource: string,
  includeName: string,
): { newSource: string; removed: boolean } {
  const usesCrlf = mainSource.includes('\r\n');
  const newline = usesCrlf ? '\r\n' : '\n';
  // 구는 이름을 이스케이프하지 않는다. 재현한다(머리주석 참조).
  const pattern = new RegExp(`^\\s*INCLUDE\\s+${includeName.toLowerCase()}\\s*\\.`, 'i');

  const kept: string[] = [];
  let removed = false;
  for (const line of mainSource.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    const isComment = trimmed.startsWith('*') || trimmed.startsWith('"');
    if (!isComment && pattern.test(line)) {
      removed = true;
      continue;
    }
    kept.push(line);
  }
  return { newSource: kept.join(newline), removed };
}

/** 구가 손으로 조립하던 활성화 XML — 인코딩 표기가 **대문자**다. */
function activationXml(uri: string, name: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
    `<adtcore:objectReference adtcore:uri="${uri}" adtcore:name="${name}"/>` +
    '</adtcore:objectReferences>'
  );
}

/** 메인 프로그램에서 참조를 걷어낸다. 실패는 던지고, 호출자가 메모로 접는다. */
async function removeFromMainProgram(
  client: AdtClient,
  context: ToolContext,
  input: {
    readonly mainProgram: string;
    readonly includeName: string;
    readonly transportRequest?: string;
  },
  steps: string[],
): Promise<string> {
  const programUri = programObjectUri(input.mainProgram);
  const sourcePath = `${programUri}/source/main`;

  const read = await client.request({ method: 'GET', path: sourcePath, timeout: 'default' });
  const currentSource = read.body;
  if (!currentSource) throw new Error('Main program source is empty or unreadable');

  const { newSource, removed } = removeIncludeStatement(currentSource, input.includeName);
  if (!removed) {
    const note = `INCLUDE ${input.includeName} line not found in ${input.mainProgram} — skipping main program update.`;
    context.logger.info(note);
    steps.push('skip_remove_not_present');
    return note;
  }

  const lock = await client.lock(programUri);
  try {
    // 구는 잠금 직후 stateless로 되돌리고 PUT을 보낸다.
    client.setSessionType('stateless');
    await client.request({
      method: 'PUT',
      path: sourcePath,
      params: { lockHandle: lock.handle, corrNr: input.transportRequest },
      body: newSource,
      contentType: CT_SOURCE,
      timeout: 'default',
    });
    steps.push('remove_from_main');
  } finally {
    // 해제는 다시 stateful로. 해제 실패는 경고로 끝난다(구 그대로).
    client.setSessionType('stateful');
    try {
      await client.unlock(lock);
    } catch (error) {
      client.setSessionType('stateless');
      context.logger.warn(
        `Failed to unlock main program ${input.mainProgram}: ${describeFailure(error)}`,
      );
    }
  }

  // 활성화가 참조를 실제로 풀어 준다. 실패해도 경고로 끝난다(구 그대로).
  try {
    await client.request({
      method: 'POST',
      path: '/sap/bc/adt/activation',
      params: { method: 'activate', preauditRequested: 'true' },
      body: activationXml(programUri, input.mainProgram),
      contentType: CT_ACTIVATION_REQUEST,
      timeout: 'long',
    });
    steps.push('activate_main');
  } catch (error) {
    context.logger.warn(`Main program activation warning: ${describeFailure(error)}`);
  }

  return `INCLUDE ${input.includeName}. removed from ${input.mainProgram}.`;
}

/**
 * 실패 문구 — **예외 XML이 상태 코드보다 먼저다**(삭제 서비스 계열과 반대).
 */
function failureMessage(error: unknown, includeName: string): string {
  const adtMessage = error instanceof AdtError ? error.adtMessage : undefined;
  if (adtMessage && adtMessage.trim().length > 0) return `SAP Error: ${adtMessage.trim()}`;

  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `Include ${includeName} not found. It may already be deleted.`;
  if (status === 423) return `Include ${includeName} is locked by another user. Cannot delete.`;
  if (status === 400) return 'Bad request (400). Check if transport request is required and valid.';
  return describeFailure(error);
}

export const deleteInclude = defineTool(
  {
    name: 'DeleteInclude',
    description:
      'Delete an existing ABAP Include program (Type I) from the SAP system via ADT API. If the include is referenced by a main program, provide main_program so the handler can first remove the `INCLUDE <name>.` line from the main program source before deleting.',
    inputSchema: {
      include_name: z.string().describe('Include program name to delete.'),
      main_program: z
        .string()
        .describe(
          'Optional. Name of the main program referencing this include. If provided, the `INCLUDE <name>.` line is removed from the main program source first (so the include is no longer referenced and delete succeeds).',
        )
        .optional(),
      transport_request: z
        .string()
        .describe(
          'Transport request number. Required for transportable packages. Optional for local ($TMP) objects. Also used for updating the main program if main_program is provided.',
        )
        .optional(),
      remove_from_main: z
        .boolean()
        .describe(
          'Auto-remove `INCLUDE <name>.` line from main program source. Default: true when main_program is provided. Set false to skip the main-program modification.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    // 메인 프로그램도 대상이다 — 그 소스를 바꾸기 때문이다. 선택 인자라 없으면
    // 위반으로 세지 않는다(`harness/targetGuard.ts`).
    targetNames: ['include_name', 'main_program'],
  },
  async (context, args) => {
    if (!args.include_name) return errorResult('Error: include_name is required');

    const includeName = args.include_name.toUpperCase();
    const mainProgram = args.main_program?.toUpperCase();
    const baseUri = includeDeletionUri(includeName);
    const shouldRemoveFromMain = Boolean(mainProgram) && args.remove_from_main !== false;

    context.logger.info(`Starting include deletion: ${includeName}`);

    const steps: string[] = [];
    let removeNote: string | undefined;

    try {
      const client = await context.getConnection();

      if (shouldRemoveFromMain && mainProgram) {
        try {
          removeNote = await removeFromMainProgram(
            client,
            context,
            { mainProgram, includeName, transportRequest: args.transport_request },
            steps,
          );
        } catch (error) {
          // 구 그대로 삼킨다 — SAP이 낼 "referenced" 오류가 더 쓸모 있다.
          removeNote = `Could not remove reference from ${mainProgram}: ${failureOf(error)}`;
          context.logger.warn(removeNote);
        }
      }

      const lock = await client.lock(baseUri);
      steps.push('lock');
      // 구는 잠금 직후 stateless로 되돌리고 DELETE를 보낸다.
      client.setSessionType('stateless');
      try {
        await client.request({
          method: 'DELETE',
          path: baseUri,
          params: { lockHandle: lock.handle, corrNr: args.transport_request },
          timeout: 'default',
        });
      } catch (error) {
        // 실패했을 때만 해제한다 — 성공하면 오브젝트가 없으므로 보내지 않는다.
        client.setSessionType('stateful');
        try {
          await client.unlock(lock);
          context.logger.debug(`Include unlocked after error: ${includeName}`);
        } catch (unlockError) {
          client.setSessionType('stateless');
          context.logger.warn(`Failed to unlock include after error: ${describeFailure(unlockError)}`);
        }
        throw error;
      }
      steps.push('delete');

      context.logger.info(`DeleteInclude completed: ${includeName}`);
      return okResult({
        success: true,
        include_name: includeName,
        main_program: mainProgram || null,
        transport_request: args.transport_request || null,
        message: removeNote
          ? `Include ${includeName} deleted. ${removeNote}`
          : `Include ${includeName} deleted successfully.`,
        steps_completed: steps,
        remove_note: removeNote || null,
      });
    } catch (error) {
      const message = failureMessage(error, includeName);
      context.logger.error(`Error deleting include ${includeName}: ${message}`);
      return errorResult(`Error: Failed to delete include ${includeName}: ${message}`);
    }
  },
);

/** 메인 정리 실패 메모의 문구 — 예외 XML이 있으면 그것이 이긴다(구 `extractSapError`). */
function failureOf(error: unknown): string {
  const adtMessage = error instanceof AdtError ? error.adtMessage : undefined;
  if (adtMessage && adtMessage.trim().length > 0) return `SAP Error: ${adtMessage.trim()}`;
  return describeFailure(error);
}
