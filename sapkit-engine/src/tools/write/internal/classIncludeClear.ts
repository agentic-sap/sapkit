/**
 * 클래스 **로컬 인클루드 비우기** — `DeleteLocal{Definitions,Macros,TestClass,Types}`
 * 넷이 함께 타는 사슬.
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 넷 다 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 「지음 · 증거 대기」에 머문다.
 *
 * ## 「지운다」가 **PUT**이다 (실측 — 이 계열의 핵심)
 *
 * 로컬 인클루드는 ADT에 자기 삭제 주소가 없다. 그래서 넷 다 삭제 서비스
 * (`/sap/bc/adt/deletion/*`)를 타지 않고 **부모 클래스를 잠그고 인클루드에 빈
 * 소스를 PUT** 한다.
 *
 * ```
 * ① LOCK   POST /sap/bc/adt/oo/classes/{소문자}?_action=LOCK&accessMode=MODIFY
 * ② PUT    PUT  /sap/bc/adt/oo/classes/{소문자}/includes/{종류}?lockHandle=…[&corrNr=…]
 *               Content-Type: text/plain; charset=utf-8   Accept: text/plain
 *               본문: 공백 한 칸
 * ③ UNLOCK POST /sap/bc/adt/oo/classes/{소문자}?_action=UNLOCK&lockHandle=…
 * ④ (선택) 활성화 POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ```
 *
 * 근거: `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/`의
 * `AdtLocalTestClass.js`·`AdtLocalDefinitions.js`·`AdtLocalMacros.js`·
 * `AdtLocalTypes.js`의 각 `delete()` (전부 lock → clear PUT → unlock 세 걸음) ·
 * `includes.js`의 `clearClassInclude` · `testclasses.js`의 `clearClassTestInclude` ·
 * `lock.js:18`(잠금 URL) · `unlock.js:17`(해제 URL).
 *
 * ## 본문이 **공백 한 칸**인 것은 벤더의 실측 결정이다
 *
 * `includes.js`의 주석이 근거를 적어 둔다 — S/4HANA는 공백 한 칸을 빈 인클루드로
 * 정규화하고(실기 확인분), 진짜 빈 문자열 `''`은 `if (!includeSource)` 같은 falsy
 * 검사에 걸려 **PUT이 와이어에 나가지도 못했다**(backlog 11-⑩). 그래서 벤더가
 * `update()` 위임을 버리고 전용 clear 경로를 따로 만들었다. **여기서 `''`로
 * "개선"하면 구가 고친 결함이 되살아난다.**
 *
 * ## 인클루드 이름이 도구 이름과 어긋난다 (실측)
 *
 * | 도구 | 인클루드 종류 | 근거 |
 * |---|---|---|
 * | `DeleteLocalDefinitions` | `definitions` | `AdtLocalDefinitions.js` delete |
 * | `DeleteLocalMacros` | `macros` | `AdtLocalMacros.js` delete |
 * | `DeleteLocalTestClass` | `testclasses` | `AdtLocalTestClass.js` delete |
 * | `DeleteLocalTypes` | **`implementations`** | `AdtLocalTypes.js` delete |
 *
 * 마지막 줄이 함정이다 — `LocalTypes`인데 주소는 `implementations`다. 발행 설명도
 * "clearing the implementations include"라고 적는다.
 *
 * ## 활성화의 거짓 성공을 접지 않는다 (차이 장부 **D111**)
 *
 * 구는 `activate_on_delete: true`에서 `AdtClass.activate()`를 부르고 **응답 본문을
 * 읽지 않는다**(`AdtClass.js`의 activate는 HTTP 4xx에서만 던진다). SAP은 활성화
 * 실패도 **HTTP 200 + `<chkl:msg type="E">`** 로 답하므로 활성화가 실패해도
 * `activated: true`가 나갔다. 여기서는 본문을 갈라 실패로 되돌린다 —
 * D41·D93·D103·D105와 같은 수리다.
 */

import type { AdtClient } from '../../../adt';
import {
  ACCEPT_SOURCE,
  CT_ACTIVATION,
  CT_SOURCE,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  classUri,
  parseActivationMessages,
} from '../shared';

/** 이 사슬이 비울 수 있는 인클루드 넷. */
export type ClearableClassInclude = 'definitions' | 'macros' | 'testclasses' | 'implementations';

/**
 * 벤더가 clear 경로에 싣는 본문 — **공백 한 칸**이다(`includes.js`·`testclasses.js`).
 * 빈 문자열로 바꾸면 구가 고친 결함이 되살아난다(머리주석 참조).
 */
export const EMPTY_INCLUDE_SOURCE = ' ';

/** 잠금 → 빈 소스 PUT → 해제. 잠금 수명주기는 접속 계층의 `withLock`이 진다. */
export async function clearClassInclude(
  client: AdtClient,
  input: {
    readonly className: string;
    readonly includeType: ClearableClassInclude;
    readonly transportRequest?: string;
  },
): Promise<void> {
  await client.withLock(classUri(input.className), async (lock) => {
    await client.request({
      method: 'PUT',
      path: `${classUri(input.className)}/includes/${input.includeType}`,
      params: { lockHandle: lock.handle, corrNr: input.transportRequest },
      body: EMPTY_INCLUDE_SOURCE,
      contentType: CT_SOURCE,
      accept: ACCEPT_SOURCE,
    });
  });
}

/**
 * 부모 클래스를 활성화하고 **응답 본문을 갈라 본다** — 장부 D111.
 *
 * 요청 바이트는 구 그대로다(`activateObjectInSession`과 같은 주소·헤더·전문).
 * 다른 것은 응답을 읽는다는 것뿐이다.
 */
export async function activateParentClass(
  client: AdtClient,
  className: string,
  what: string,
): Promise<void> {
  const body = await activateOne(client, classUri(className), className, {
    contentType: CT_ACTIVATION,
  });
  const failures = activationErrors(parseActivationMessages(body));
  if (failures.length === 0) return;

  throw new SourceCheckFailure(
    `Activation failed: class ${className} was not activated (${failures.length} error${
      failures.length === 1 ? '' : 's'
    }): ${failures
      .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
      .join(' | ')}. The ${what} was cleared on SAP as an inactive version; the active version is unchanged.`,
    failures,
  );
}
