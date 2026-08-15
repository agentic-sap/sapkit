/**
 * 뷰(DDLS) 읽기의 ADT 조각 — `GetView`·`ReadView`가 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 소스 읽기:
 *  - `engine/src/handlers/view/high/handleGetView.ts:70-74` → `client.getView().read()`
 *  - `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/view/AdtView.js`
 *    의 `read()` — 404를 **오류가 아니라 `undefined`로 접는다**(아래 참조)
 *  - `dist/core/view/read.js:27-29` `getViewSource` → `readObjectSource('view', …)`
 *  - `dist/core/shared/AdtUtils.js:306-324` `readObjectSource` — Accept 기본값이
 *    **`text/plain`**이고 `version`은 URI에 실린다
 *  - `dist/core/shared/AdtUtils.js:743-777` `getObjectSourceUri` case `'view'` →
 *    `/sap/bc/adt/ddic/ddl/sources/{name}/source/main?version=…`
 *
 * 메타데이터 읽기(ReadView 전용):
 *  - `engine/src/handlers/view/readonly/handleReadView.ts:63` → `readMetadata()`
 *  - `dist/core/view/read.js:21-23` `getViewMetadata` → `readObjectMetadata('view', …)`
 *  - `dist/core/shared/AdtUtils.js:269-291` — Accept는 `getMetadataAcceptHeader`가 정한다
 *  - `dist/core/shared/AdtUtils.js:652-697` `getObjectMetadataUri` case `'view'` →
 *    `/sap/bc/adt/ddic/ddl/sources/{name}` (`/source/main` 없음)
 *  - `dist/core/shared/AdtUtils.js:700-741` `getMetadataAcceptHeader` case `'view'`
 *    → `CT_VIEW` = `application/vnd.sap.adt.ddlSource+xml`
 *    (`dist/constants/contentTypes.js:95`)
 *
 * ## 뷰 종류는 경로를 가르지 않는다 (실측)
 *
 * `CreateView`의 설명은 "CDS View or Classic View"라고 말하지만, **구 엔진은 이
 * 넷 어디에서도 종류로 갈라지지 않는다.** `getObjectSourceUri`·
 * `getObjectMetadataUri` 양쪽에서 `'view'`와 `'ddls/df'`가 **같은 case**에 묶여
 * DDLS 경로 하나로 떨어지고, 생성 페이로드도 언제나 `adtcore:type="DDLS/DF"`다
 * (`dist/core/view/create.js:37`).
 *
 * 클래식 DDIC 뷰 전용 경로 `/sap/bc/adt/ddic/views/{name}`은 벤더 트리에 존재하긴
 * 한다 — `dist/utils/activationUtils.js:66-68`의 `buildObjectUri` case `'VIEW/DV'`.
 * 그러나 **뷰 도구 넷 중 어느 것도 그 갈래를 타지 않는다**: 활성화는
 * `buildObjectUri`가 아니라 DDLS 경로를 직접 박아 넣은 `activateDDLS`를 쓴다
 * (`dist/core/view/activation.js:12-14`). 즉 여기서 말하는 "Classic View"는
 * TABL/VIEW 사전 오브젝트가 아니라 **DDL로 정의된 클래식 뷰**이며, 종류에 따른
 * 갈래를 새로 만들면 그것이 구와의 차이가 된다.
 *
 * 청사진 §4.5가 적어 둔 유령 참조 `CreateCdsView`가 이 사실의 흔적이다 — 그런
 * 이름의 도구는 표면에 없고, 있는 것은 두 종류를 한 경로로 처리하는 `CreateView`
 * 하나뿐이다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import { SOURCE_ACCEPT, type SourceVersion, encodeObjectName } from './adt';

/** DDLS 컬렉션 — 뷰 도구 넷이 전부 여기로 간다. */
export const VIEW_ROOT = '/sap/bc/adt/ddic/ddl/sources';

/**
 * 메타데이터 요청의 Accept — 구 `getMetadataAcceptHeader('view')`가 고르는
 * `CT_VIEW`다. 소스 요청의 `text/plain`과 다르다.
 */
export const VIEW_METADATA_ACCEPT = 'application/vnd.sap.adt.ddlSource+xml';

/**
 * 뷰 오브젝트 경로. **읽기 쪽은 이름을 소문자로 접지 않는다** — 벤더의
 * `getObjectSourceUri`/`getObjectMetadataUri`는 `encodeSapObjectName(name)`만
 * 쓰고, 호출하는 핸들러가 이미 대문자로 올려 둔 이름이 그대로 URL에 실린다.
 * 쓰기 쪽(`src/tools/write/internal/view.ts`)은 반대로 전부 소문자다 — 규칙이
 * 갈리는 자리이므로 합치지 않는다.
 */
export function viewObjectPath(name: string): string {
  return `${VIEW_ROOT}/${encodeObjectName(name)}`;
}

export function viewSourcePath(name: string): string {
  return `${viewObjectPath(name)}/source/main`;
}

/** `GET …/source/main?version=…` — 구와 같은 Accept(`text/plain`). */
export function readViewSource(
  client: AdtClient,
  viewName: string,
  version: SourceVersion,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: viewSourcePath(viewName),
    params: { version },
    accept: SOURCE_ACCEPT,
    timeout: 'default',
  });
}

/**
 * `GET …/{name}` — 메타데이터. **`version`을 싣지 않는다**: 구 핸들러가
 * `readMetadata({ viewName })`를 옵션 없이 부르므로 질의 인자가 붙지 않는다
 * (`handleReadView.ts:63` · `AdtUtils.js:269-280`).
 */
export function readViewMetadata(client: AdtClient, viewName: string): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: viewObjectPath(viewName),
    accept: VIEW_METADATA_ACCEPT,
    timeout: 'default',
  });
}
