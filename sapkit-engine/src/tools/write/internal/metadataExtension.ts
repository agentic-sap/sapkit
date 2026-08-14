/**
 * 메타데이터 확장(DDLX) 쓰기의 ADT 조각 — `CreateMetadataExtension`·`UpdateMetadataExtension`이
 * 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 구 핸들러 `engine/src/handlers/ddlx/high/handleCreateMetadataExtension.ts:75-139`
 * · `.../handleUpdateMetadataExtension.ts:71-131`
 * → 벤더 `@babamba2/mcp-abap-adt-clients/dist/core/metadataExtension/`의
 *   `create.js:30-75` · `lock.js:25-48` · `update.js:34-48` · `unlock.js:26-33` ·
 *   `activate.js:24-27` → `utils/activationUtils.js:116-132` `activateObjectInSession`
 * → 구문검사는 엔진 자신의
 *   `engine/src/lib/preCheckBeforeActivation.ts:263-276`(`kind: 'metadataExtension'`)
 *   → 같은 파일 `:503-533`의 `runRawCheckRun`.
 *
 * ```
 * 생성     POST /sap/bc/adt/ddic/ddlx/sources[?corrNr=…]
 *               Accept·Content-Type: application/vnd.sap.adt.ddic.ddlx.v1+xml
 * 잠금     POST /sap/bc/adt/ddic/ddlx/sources/{소문자}?_action=LOCK&accessMode=MODIFY
 * PUT      PUT  /sap/bc/adt/ddic/ddlx/sources/{소문자}/source/main?lockHandle=…[&corrNr=…]
 *               Accept: text/plain · Content-Type: text/plain; charset=utf-8
 * 구문검사 POST /sap/bc/adt/checkruns?reporters=abapCheckRun
 *               Content-Type: application/vnd.sap.adt.checkobjects+xml · **Accept 없음**
 * 해제     POST /sap/bc/adt/ddic/ddlx/sources/{소문자}?_action=UNLOCK&lockHandle=…
 * 활성화   POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 *               Accept: application/xml · Content-Type: application/vnd.sap.adt.activation+xml
 * ```
 *
 * ## 이름 인코딩이 **한 도구 안에서 두 갈래**다
 *
 * 벤더 경로(생성·잠금·PUT·해제·활성화)는 이름을 **인코딩 없이 소문자로만** 내린다
 * (`lock.js:26` · `update.js:35` · `unlock.js:27` · `activate.js:25`). 그런데
 * 구문검사만은 엔진 자신의 코드를 타고, 그쪽은 **인코딩한 뒤 소문자로** 만든다
 * (`preCheckBeforeActivation.ts:273` — `encodeSapObjectName(name).toLowerCase()`).
 * 슬래시가 든 이름(`/NS/Z_X`)에서 앞의 다섯은 `/ns/z_x`로, 검사만 `%2fns%2fz_x`로
 * 나간다. 실측이며, 접어 합치면 검사 대상이 달라진다.
 *
 * ## 구문검사의 Accept가 **없다**
 *
 * 벤더 `checkMetadataExtension`이 아니라 엔진의 `runRawCheckRun`을 탄다. 그쪽은
 * `Content-Type`만 싣고 Accept를 주지 않아 접속 계층 기본값이 나간다
 * (`preCheckBeforeActivation.ts:516-524`).
 *
 * ## 활성화 응답을 **아무도 읽지 않는다** — 거짓 성공 (차이 D103)
 *
 * `activate.js`는 `activateObjectInSession`의 응답을 그대로 돌려주고, 감싸개
 * (`AdtMetadataExtension.js:372-396`)도 판정하지 않으며, 두 구 핸들러도 보지 않고
 * `success: true` · "created/updated and activated successfully"로 답한다. **SAP은
 * 활성화 실패를 HTTP 200 + `<chkl:msg type="E">`로 돌려주므로**, 활성화되지 않은
 * 것이 활성화됐다고 보고된다. 이웃한 서비스 정의(SRVD)는 벤더가
 * `chkl:properties`를 읽어 막는데 이 계열에는 그 판정이 없다. 여기서는 실패로
 * 되돌린다 — 등재는 `harness/DIVERGENCES.md`의 D103이고, `UpdateView`의 D66과
 * 같은 계열이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 활성화 본문의 XML 선언과 루트 태그 사이 줄바꿈 한 개가 없다(공용
 * `buildObjectReferences`). 서버가 읽는 문서는 같다.
 */

import { AdtError } from '../../../adt';
import type { AdtClient } from '../../../adt';
import {
  CT_CHECK_OBJECTS,
  type CheckRunResult,
  buildCheckObjectList,
  encodeObjectName,
  parseCheckRun,
} from '../shared';

/** DDLX 컬렉션. */
export const DDLX_ROOT = '/sap/bc/adt/ddic/ddlx/sources';

/** `CT_METADATA_EXTENSION` — `constants/contentTypes.js:104`. 생성의 Accept이자 Content-Type. */
export const CT_METADATA_EXTENSION = 'application/vnd.sap.adt.ddic.ddlx.v1+xml';

/**
 * 벤더 경로(잠금·PUT·해제·활성화)의 오브젝트 URI — **인코딩 없이 소문자로만**
 * (머리주석의 「이름 인코딩이 한 도구 안에서 두 갈래다」 참조).
 */
export function metadataExtensionWriteUri(name: string): string {
  return `${DDLX_ROOT}/${name.toLowerCase()}`;
}

/**
 * 구문검사가 겨누는 URI — 이쪽만 **인코딩한 뒤 소문자**다
 * (`preCheckBeforeActivation.ts:273`).
 */
export function metadataExtensionCheckUri(name: string): string {
  return `${DDLX_ROOT}/${encodeObjectName(name).toLowerCase()}`;
}

/**
 * 서버에 올라간 인액티브 판을 그대로 검사한다.
 *
 * 공용 `checkStored`를 쓰지 않는 이유는 **Accept 한 줄** 때문이다 — 머리주석 참조.
 */
export async function checkStagedMetadataExtension(
  client: AdtClient,
  objectUri: string,
): Promise<CheckRunResult> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildCheckObjectList(objectUri, 'inactive'),
    contentType: CT_CHECK_OBJECTS,
  });
  return parseCheckRun(response.body);
}

/**
 * 구 `extractAdtErrorMessage`(`engine/src/lib/utils.ts:210-269`)의 순서 그대로:
 * ADT 예외 본문의 메시지가 있으면 `SAP Error: …`, 없으면 응답 본문 원문(2000자
 * 상한), 그것도 없으면 오류 메시지.
 */
export function adtErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AdtError) {
    if (error.adtMessage && error.adtMessage.trim().length > 0) {
      return `SAP Error: ${error.adtMessage.trim()}`;
    }
    const raw = error.rawBody?.trim();
    if (raw && raw.length > 0) return raw.slice(0, 2000);
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  return fallback;
}

/**
 * 구 `return_error(error)`가 ADT 실패에서 문구를 뽑던 순서
 * (`engine/src/lib/utils.ts:317-333`): 예외 XML이면 `SAP Error: … [HTTP n]`,
 * 그냥 본문이면 원문(2000자 상한), 응답 본문이 없으면 오류 메시지.
 *
 * {@link adtErrorMessage}와 갈리는 것은 **`[HTTP n]` 꼬리 하나**다. 구에서 그
 * 꼬리가 붙는 경로(`return_error`)와 안 붙는 경로(`extractAdtErrorMessage`)가
 * 도구마다 다르므로 합치지 않는다.
 */
export function returnErrorText(error: unknown): string {
  if (error instanceof AdtError) {
    if (error.adtMessage && error.adtMessage.trim().length > 0) {
      const head = `SAP Error: ${error.adtMessage.trim()}`;
      return error.status ? `${head} [HTTP ${error.status}]` : head;
    }
    const raw = error.rawBody;
    if (raw && raw.length > 0) return raw.slice(0, 2000);
  }
  return error instanceof Error ? error.message : String(error);
}
