/**
 * BDEF·BIMP 쓰기 4종이 함께 쓰는 URI 조립과 검사 통로.
 *
 * **단계마다 이름 표기가 다르다.** 클래스 계열은 전부 소문자였고 인터페이스는
 * PUT·UNLOCK만 갈라졌는데, 이 계열은 또 다르다 — 아래 표는 전부 실측이며
 * 베낀 것이 아니다.
 *
 * ## BDEF — `/sap/bc/adt/bo/behaviordefinitions`
 *
 * | 단계 | 이름 표기 | 근거 (읽기 전용 참조) |
 * |---|---|---|
 * | CREATE | 이름이 URL에 **없다** (POST는 컬렉션으로) | `dist/core/behaviorDefinition/create.js:56` |
 * | LOCK | `name.toLowerCase()` · **인코딩 없음** | `.../lock.js:29` |
 * | PUT (source/main) | `name.toLowerCase()` · **인코딩 없음** | `.../update.js:52` |
 * | UNLOCK | `name.toLowerCase()` · **인코딩 없음** | `.../unlock.js:29` |
 * | 활성화 objectUri | `name.toLowerCase()` · **인코딩 없음** | `.../activation.js:27` |
 * | 활성화 objectName | `name.toUpperCase()` | `.../activation.js:28` |
 * | 구문검사 URI | **`encodeURIComponent(name).toLowerCase()`** | `engine/src/lib/preCheckBeforeActivation.ts:284` |
 *
 * 마지막 줄이 이 계열의 함정이다. 검사만 엔진이 직접 조립하고 나머지는 벤더가
 * 조립하는데, 두 쪽의 인코딩 규칙이 다르다. 슬래시가 든 이름에서 `%2f` vs `/`로
 * 갈리므로 **합치지 않는다.**
 *
 * ## BIMP — 클래스다 (`/sap/bc/adt/oo/classes`)
 *
 * | 단계 | 이름 표기 | 근거 |
 * |---|---|---|
 * | CREATE | 이름이 URL에 **없다** | `dist/core/class/create.js:20` |
 * | LOCK · UNLOCK | `encodeSapObjectName(name).toLowerCase()` | `.../class/lock.js:19` · `.../class/unlock.js:17` |
 * | PUT (source/main) | `encodeSapObjectName(name).toLowerCase()` | `.../class/update.js:101-102` |
 * | PUT (includes/implementations) | `encodeSapObjectName(name).toLowerCase()` | `.../behaviorImplementation/update.js:23-24` |
 * | 활성화 objectUri | `encodeSapObjectName(name).toLowerCase()` | `.../class/activation.js:16` |
 * | 구문검사 URI | **`encodeSapObjectName(name.toLowerCase())`** | `dist/utils/checkRun.js:19-23` |
 * | **읽기**(소스·메타데이터) | `encodeSapObjectName(name)` — **대문자 그대로** | `dist/core/shared/AdtUtils.js:652-656`·`:743-748` |
 *
 * 읽기만 대문자인 것도 실측이다. 자세한 것은
 * `src/tools/read/internal/behaviorRead.ts`의 표.
 */

import type { AdtClient } from '../../adt';
import type { ToolContext } from '../../server/toolDefinition';
import {
  CT_CHECK_OBJECTS,
  type CheckMessage,
  type CheckRunResult,
  buildCheckObjectList,
  encodeObjectName,
  parseCheckRun,
} from './shared';

/**
 * 생성 페이로드의 `adtcore:masterSystem`·`adtcore:responsible` — **env에서만**
 * 읽는다(차이 장부 **D62**와 같은 부류이며, BDEF 쪽 적용은 **D98**).
 *
 * 구는 기동 때 `resolveSystemContext`로 한 번 풀어 캐시하고
 * (`engine/src/lib/systemContext.ts:45-86`) `createAdtClient`가 그 값을
 * `AdtBehaviorDefinition`의 `systemContext`로 넘겨 준다
 * (`engine/src/lib/clients.ts:20-31`). 그 계층이 이 판에는 없다.
 *
 * **BIMP 생성은 이 통로를 쓰지 않는다** — 그쪽은 벤더가 매 호출마다
 * `/sap/bc/adt/core/http/systeminformation`을 직접 물어보므로 그대로 재현한다.
 */
export function ownerAttributes(context: ToolContext): string {
  const env = context.env;
  const masterSystem = env['SAP_MASTER_SYSTEM'] ?? '';
  const responsible = env['SAP_RESPONSIBLE'] ?? env['SAP_USERNAME'] ?? '';
  return (
    (masterSystem ? ` adtcore:masterSystem="${masterSystem}"` : '') +
    (responsible ? ` adtcore:responsible="${responsible}"` : '')
  );
}

// ── BDEF ────────────────────────────────────────────────────────────────────

/** 벤더가 쓰는 BDEF 오브젝트 URI — 소문자, **인코딩 없음**. */
export function bdefObjectUri(name: string): string {
  return `/sap/bc/adt/bo/behaviordefinitions/${name.toLowerCase()}`;
}

/** 엔진의 `runRawCheckRun`이 쓰는 BDEF URI — 인코딩한 뒤 소문자. */
export function bdefCheckUri(name: string): string {
  return `/sap/bc/adt/bo/behaviordefinitions/${encodeObjectName(name).toLowerCase()}`;
}

// ── BIMP (클래스) ───────────────────────────────────────────────────────────

/** 벤더가 쓰는 BIMP(=클래스) 오브젝트 URI — 인코딩한 뒤 소문자. */
export function bimpObjectUri(name: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(name).toLowerCase()}`;
}

/** 벤더 `checkRun.js`의 URI — **이름을 먼저 소문자로** 만들고 인코딩한다. */
export function bimpCheckUri(name: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(name.toLowerCase())}`;
}

/** BIMP를 읽을 때의 URI — 인코딩만 하고 대소문자는 그대로다. */
export function bimpReadUri(name: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(name)}`;
}

/** `updateBehaviorImplementation`가 PUT 하는 구현 인클루드. */
export function bimpImplementationsPath(name: string): string {
  return `${bimpObjectUri(name)}/includes/implementations`;
}

// ── 구문검사 ────────────────────────────────────────────────────────────────

/**
 * **Accept 없이** 보내는 checkruns POST.
 *
 * 구 `runRawCheckRun`(`engine/src/lib/preCheckBeforeActivation.ts:503-533`)은
 * `Content-Type`만 싣고 `Accept`를 싣지 않는다. 그러면 접속 계층의 기본값
 * (`application/xml, application/json, text/plain, ...`)이 나간다 —
 * `checkStored`가 싣는 `application/vnd.sap.adt.checkmessages+xml`와 **다른
 * 헤더**다. BDEF 계열은 이쪽이므로 접어 합치지 않는다.
 */
export async function rawCheckRun(
  client: AdtClient,
  objectUri: string,
  version: 'active' | 'inactive' = 'inactive',
): Promise<CheckRunResult> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildCheckObjectList(objectUri, version),
    contentType: CT_CHECK_OBJECTS,
  });
  return parseCheckRun(response.body);
}

/**
 * 벤더 `parseCheckRunResponse`의 `has_errors` 판정
 * (`dist/utils/checkRun.js:210-217`).
 *
 * 둘을 함께 본다:
 *  - `status === 'processed'`일 때 SAP이 `statusText`를 **`type="E"` 메시지로
 *    되울리는** 잡음을 걸러 낸다(「오브젝트 Z_X를 검사했습니다」 류).
 *  - `status === 'notProcessed'`는 메시지가 없어도 실패다 — 오브젝트가 없거나
 *    검사할 수 없었다는 뜻이다.
 */
export function vendorCheckErrors(result: CheckRunResult): CheckMessage[] {
  const statusText = (result.message ?? '').toLowerCase().trim();
  if (result.status === 'processed' && statusText) {
    return result.errors.filter((entry) => entry.text.toLowerCase().trim() !== statusText);
  }
  return [...result.errors];
}

/** 벤더 `has_errors` 전체 판정. */
export function vendorCheckFailed(result: CheckRunResult): boolean {
  return vendorCheckErrors(result).length > 0 || result.status === 'notProcessed';
}
