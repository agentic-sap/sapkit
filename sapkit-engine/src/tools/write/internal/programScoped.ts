/**
 * 프로그램에 **딸린** 오브젝트(텍스트풀 · 화면 · GUI 상태)를 쓰는 도구들의 공용 조각.
 *
 * 이 셋은 ADT에 자기 URI가 없다. 그래서 구 핸들러는 전부 **부모 프로그램**을
 * 잠그고, 대리자 RFC로 내용을 쓰고, 부모를 풀고, 부모를 활성화한다. 여기 모인
 * 것은 그 「부모 프로그램」 축의 와이어뿐이고, 내용 쓰기는 각 도구가 RFC 통로로
 * 직접 한다.
 *
 * ## 이름이 URL에 실리는 방식이 **한 핸들러 안에서 두 갈래다** (실측)
 *
 *  - 잠금·해제·활성화는 `encodeSapObjectName(programName)`을 그대로 쓴다 —
 *    **대문자 그대로**다(`handleUpdateGuiStatus.ts:131-132` ·
 *    `handleCreateTextElement.ts:131-132` · `handleUpdateScreen.ts:84-85`).
 *  - 화면 두 종의 사후 구문검사만 `encodeSapObjectName(x).toLowerCase()`로
 *    **소문자**를 쓴다(`engine/src/lib/preCheckBeforeActivation.ts:655`).
 *
 * 합치면 보내는 URL이 달라지므로 합치지 않는다. `src/tools/write/shared.ts`의
 * `programUri()`(항상 소문자)를 쓰지 않는 이유도 그것이다.
 *
 * ## 활성화 요청은 구가 손으로 조립하던 XML 그대로다
 *
 * `shared.ts`의 `activateOne`/`buildObjectReferences`는 선언을 `UTF-8`로 쓰고
 * 줄바꿈·들여쓰기를 넣으며 `Accept: application/xml`을 싣는다. 이 묶음의 구
 * 핸들러는 **한 줄 XML + `encoding="utf-8"` + Accept 미지정**(→ 접속 계층 기본값)
 * 이므로 여기서 그 바이트를 그대로 다시 만든다.
 *
 * ## 구와 다른 것 — 장부 D93 (`harness/DIVERGENCES.md`)
 *
 * **구는 활성화 응답을 읽지 않는다.** SAP은 활성화 실패도 HTTP 200 + 본문의
 * `<chkl:msg type="E">`로 답하므로, 구 핸들러 8종은 활성화가 실패해도
 * `activated: true`로 답했다. 여기서는 본문을 갈라 실패로 되돌린다 — 이 레포의
 * CLAS 거짓 성공 실증 이력과 `CLAUDE.md` 안전 규칙("write 성공 보고를 그대로
 * 믿지 않는다")이 근거이고, 같은 수리가 D41·D51·D56·D66·D73에 선례로 있다.
 */

import { AdtError } from '../../../adt';
import type { AdtClient } from '../../../adt';
import type { ToolResult } from '../../../server/toolDefinition';
import {
  CT_ACTIVATION_REQUEST,
  CT_CHECK_OBJECTS,
  type CheckRunResult,
  SourceCheckFailure,
  activationErrors,
  errorResult,
  parseActivationMessages,
  parseCheckRun,
} from '../shared';

/**
 * 구 `return_error(new Error(msg))` 그대로 — **`Error: ` 접두사가 계약의 일부**다
 * (`engine/src/lib/utils.ts:421-429`). 이 묶음의 구 핸들러 8종은 전부 그 함수로
 * 오류를 냈으므로 접두사를 함께 옮긴다.
 */
export function programScopedError(message: string): ToolResult {
  return errorResult(`Error: ${message}`);
}

/** 잠금·해제·활성화가 쓰는 URI — 이름은 **대문자 그대로**다. */
export function programObjectUri(programName: string): string {
  return `/sap/bc/adt/programs/programs/${encodeURIComponent(programName)}`;
}

/** 프로그램 트리 구문검사가 쓰는 URI — 이쪽만 **소문자**다. */
export function programCheckUri(programName: string): string {
  return `/sap/bc/adt/programs/programs/${encodeURIComponent(programName).toLowerCase()}`;
}

/** 검사가 한 번도 돌지 않은 것과 같은 빈 결과. */
const NOT_RUN: CheckRunResult = {
  status: 'not_run',
  message: '',
  errors: [],
  warnings: [],
  info: [],
};

/**
 * ADT가 "이미 검사됐다"고 답한 것인가.
 * 구 `engine/src/lib/utils.ts:1147-1155`와 같은 세 문구다.
 */
export function isAlreadyCheckedError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('has been checked') ||
    message.includes('was checked') ||
    message.includes('already checked')
  );
}

/**
 * 부모 프로그램 트리 전체를 컴파일한다 — 화면(dynpro)에는 독립 검사가 없다.
 *
 * 실측: `preCheckBeforeActivation.ts:649-671` → `:503-533`. 프로그램 URI **하나만**
 * 실어 `version="inactive"`로 보내면 메인 + 인클루드 전량이 한 번에 컴파일된다.
 * **인클루드 URI를 목록에 더하면 안 된다** — 개별 검사로 바뀌어 인클루드 사이의
 * 참조 오류가 조용히 빠진다(구 주석 `:664-666`).
 */
export async function runProgramTreeCheck(
  client: AdtClient,
  programName: string,
): Promise<CheckRunResult> {
  const uri = programCheckUri(programName.toUpperCase());
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${uri}" chkrun:version="inactive"/>\n` +
    `</chkrun:checkObjectList>`;

  try {
    const response = await client.request({
      method: 'POST',
      path: '/sap/bc/adt/checkruns',
      params: { reporters: 'abapCheckRun' },
      body,
      contentType: CT_CHECK_OBJECTS,
      // Accept를 주지 않는다 — 구도 주지 않아 접속 계층 기본값이 나갔다.
    });
    return parseCheckRun(response.body);
  } catch (error) {
    if (isAlreadyCheckedError(error)) return NOT_RUN;
    throw error;
  }
}

/**
 * 검사 결과에 진짜 오류가 있으면 던진다.
 *
 * 구 `preCheckBeforeActivation.ts:843-882`와 같은 판정·같은 문구다 — 잡음
 * (`REPORT/PROGRAM statement is missing` 계열)만 남으면 판정을 유보한다.
 * `shared.ts`의 `assertNoCheckErrors`가 같은 일을 하므로 그것을 그대로 쓴다.
 */
export { assertNoCheckErrors } from '../shared';

/**
 * 부모 프로그램을 활성화하고 **응답 본문을 갈라 본다.**
 *
 * 요청 바이트는 구 그대로다(한 줄 XML · `encoding="utf-8"` · Accept 미지정 ·
 * `long` 타임아웃). 다른 것은 응답을 읽는다는 것뿐이다 — 장부 D93.
 */
export async function activateParentProgram(
  client: AdtClient,
  programName: string,
  what: string,
): Promise<void> {
  const uri = programObjectUri(programName);
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/activation',
    params: { method: 'activate', preauditRequested: 'true' },
    body:
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<adtcore:objectReference adtcore:uri="${uri}" adtcore:name="${programName}"/>` +
      `</adtcore:objectReferences>`,
    contentType: CT_ACTIVATION_REQUEST,
    timeout: 'long',
  });

  const messages = parseActivationMessages(response.body);
  const failures = activationErrors(messages);
  if (failures.length === 0) return;

  // 구 엔진은 여기서 success:true를 돌려줬다. 활성화되지 않은 것을 활성화됐다고
  // 말하는 것은 거짓 성공이다 — 장부 D93.
  throw new SourceCheckFailure(
    `Activation failed: program ${programName} was not activated (${failures.length} error${
      failures.length === 1 ? '' : 's'
    }): ${failures
      .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
      .join(' | ')}. The ${what} change is on SAP; the active version is unchanged.`,
    failures,
  );
}

/** ADT 실패의 HTTP 상태. 구 핸들러의 `error.response?.status` 자리다. */
export function adtStatusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}
