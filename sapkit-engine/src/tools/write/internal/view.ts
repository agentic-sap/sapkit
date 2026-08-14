/**
 * 뷰(DDLS) 쓰기의 ADT 조각 — `CreateView`·`UpdateView`가 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 *  - 생성: `engine/src/handlers/view/high/handleCreateView.ts:97-104` →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/view/AdtView.js`
 *    의 `create()` → `dist/core/view/create.js:13-51` `createDDLSObject`
 *  - 이름 검증: `handleCreateView.ts:80-84` → `dist/core/view/validation.js:20-38`
 *  - 잠금·해제: `dist/core/view/lock.js:15-37` · `dist/core/view/unlock.js:12-19`
 *  - 소스 PUT: `dist/core/view/update.js:15-28`
 *  - 활성화: `dist/core/view/activation.js:12-14` →
 *    `dist/utils/activationUtils.js:116-132` `activateObjectInSession`
 *  - 구문검사: `engine/src/lib/preCheckBeforeActivation.ts:389-408` (`kind: 'view'`)
 *
 * ## 쓰기 쪽 이름은 **전부 소문자**다
 *
 * 잠금·해제·PUT·활성화·구문검사가 모두 `encodeSapObjectName(name).toLowerCase()`를
 * 쓴다(`lock.js:16` · `unlock.js:13` · `update.js:17` · `activation.js:13` ·
 * `preCheckBeforeActivation.ts:397`). 읽기 쪽은 반대로 대문자 그대로다
 * (`src/tools/read/internal/view.ts` 참조). 같은 오브젝트인데 규칙이 갈리므로
 * 두 자리를 합치지 않는다 — 합치면 슬래시가 든 이름에서 보내는 URL이 달라진다.
 *
 * ## 뷰 종류로 갈라지지 않는다
 *
 * 생성 페이로드의 `adtcore:type`은 언제나 `DDLS/DF`이고 컬렉션도 언제나
 * `ddic/ddl/sources` 하나다(`create.js:20`·`37`). "CDS View or Classic View"라는
 * 도구 설명은 **DDL 안에서 무엇을 정의하느냐**의 이야기이지 경로의 이야기가
 * 아니다. 자세한 실측은 `src/tools/read/internal/view.ts` 머리주석에 있다.
 */

import type { AdtClient } from '../../../adt';
import {
  CT_CHECK_OBJECTS,
  type CheckRunResult,
  buildCheckObjectList,
  encodeObjectName,
  parseCheckRun,
} from '../shared';

/** DDLS 컬렉션. */
export const VIEW_ROOT = '/sap/bc/adt/ddic/ddl/sources';

/** 생성 요청의 Accept — 구 `ACCEPT_VIEW`(`dist/constants/contentTypes.js:93`). */
export const ACCEPT_VIEW =
  'application/vnd.sap.adt.ddlSource.v2+xml, application/vnd.sap.adt.ddlSource+xml';

/** 생성 요청의 Content-Type — 구 `CT_VIEW`(`contentTypes.js:95`). */
export const CT_VIEW = 'application/vnd.sap.adt.ddlSource+xml';

/** 뷰 오브젝트 URI — 쓰기 쪽은 **소문자**다(머리주석 참조). */
export function viewWriteUri(name: string): string {
  return `${VIEW_ROOT}/${encodeObjectName(name).toLowerCase()}`;
}

/**
 * 쓰기 **뒤** 검사 — 서버에 올라간 인액티브 버전을 그대로 컴파일한다.
 *
 * 공용 `checkStored`를 쓰지 않는 이유는 **Accept 한 줄** 때문이다. 구의 이
 * 경로(`runRawCheckRun` — `preCheckBeforeActivation.ts:516-524`)는 `Content-Type`
 * 만 싣고 Accept를 주지 않아 접속 계층의 기본값(`DEFAULT_ACCEPT` —
 * `application/xml, application/json, text/plain` + 와일드카드)이 그대로 나간다.
 * 쓰기 **전** 검사(`checkProposed`)는 반대로 구도 명시적으로
 * `application/vnd.sap.adt.checkmessages+xml`을 싣는다(`runInlineArtifactCheck` —
 * 같은 파일 484-487). 한 도구 안에서 두 검사의 Accept가 갈리는 자리다.
 */
export async function checkStagedView(
  client: AdtClient,
  viewUri: string,
): Promise<CheckRunResult> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildCheckObjectList(viewUri, 'inactive'),
    contentType: CT_CHECK_OBJECTS,
  });
  return parseCheckRun(response.body);
}
