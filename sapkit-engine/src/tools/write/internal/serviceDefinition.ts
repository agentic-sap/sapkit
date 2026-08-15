/**
 * 서비스 정의(SRVD) 쓰기의 ADT 조각 — `CreateServiceDefinition`·`UpdateServiceDefinition`이
 * 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 구 핸들러 `engine/src/handlers/service_definition/high/handleCreateServiceDefinition.ts:113-197`
 * · `.../handleUpdateServiceDefinition.ts:95-189`
 * → 벤더 `@babamba2/mcp-abap-adt-clients/dist/core/serviceDefinition/`의
 *   `validation.js:20-36` · `create.js:15-44` · `lock.js:16-37` · `update.js:14-30` ·
 *   `unlock.js:14-21` · `activation.js:13-73`
 * → 구문검사는 벤더가 아니라 엔진 자신의
 *   `engine/src/lib/preCheckBeforeActivation.ts:311-320`(`kind: 'serviceDefinition'`)
 *   → 같은 파일 `:503-533`의 `runRawCheckRun`.
 *
 * ```
 * 이름검증 POST /sap/bc/adt/ddic/srvd/sources/validation?objtype=srvdsrv&objname=…[&description=…]
 *               Accept: application/vnd.sap.as+xml                       (응답은 읽지 않는다)
 * 생성     POST /sap/bc/adt/ddic/srvd/sources[?corrNr=…]
 *               Accept·Content-Type: application/vnd.sap.adt.ddic.srvd.v1+xml
 * 잠금     POST /sap/bc/adt/ddic/srvd/sources/{소문자}?_action=LOCK&accessMode=MODIFY
 * PUT      PUT  /sap/bc/adt/ddic/srvd/sources/{소문자}/source/main?lockHandle=…[&corrNr=…]
 *               Accept: text/plain · Content-Type: text/plain; charset=utf-8
 * 구문검사 POST /sap/bc/adt/checkruns?reporters=abapCheckRun
 *               Content-Type: application/vnd.sap.adt.checkobjects+xml · **Accept 없음**
 * 해제     POST /sap/bc/adt/ddic/srvd/sources/{소문자}?_action=UNLOCK&lockHandle=…
 * 활성화   POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 *               Accept·Content-Type: application/xml
 * ```
 *
 * ## 쓰기 쪽 이름은 **전부 소문자**다
 *
 * 잠금·PUT·해제·활성화·구문검사가 모두 `encodeSapObjectName(name.toLowerCase())`를
 * 쓴다(`lock.js:17` · `update.js:15` · `unlock.js:15` · `activation.js:16` ·
 * `preCheckBeforeActivation.ts:317`). **다만 응답의 `uri` 필드만은 대문자**다 —
 * 구 핸들러가 거기서만 `encodeSapObjectName(대문자 이름)`을 쓴다
 * (`handleCreateServiceDefinition.ts:218` · `handleUpdateServiceDefinition.ts:209`).
 * 나가는 주소와 보고되는 주소가 갈리는 자리이므로 접지 않는다.
 *
 * ## 구문검사의 Accept가 **없다**
 *
 * 이 계열의 검사는 벤더 `checkServiceDefinition`이 아니라 엔진의 `runRawCheckRun`을
 * 탄다. 그쪽은 `Content-Type`만 싣고 Accept를 주지 않아 접속 계층 기본값
 * (`DEFAULT_ACCEPT`)이 그대로 나간다(`preCheckBeforeActivation.ts:516-524`).
 * 공용 `postCheckRun`은 `application/vnd.sap.adt.checkmessages+xml`을 명시하므로
 * 여기서는 쓸 수 없다 — 뷰 묶음이 `checkStagedView`로 같은 자리를 갈라 둔 것과
 * 같은 이유다.
 *
 * ## 활성화 **거짓 성공은 이 계열에 없다** (실측)
 *
 * 벤더 `activation.js:22-73`은 응답을 파싱해 `chkl:messages > chkl:properties`의
 * `activationExecuted`와 `checkExecuted`가 **둘 다 참**일 때만 통과시키고, 아니면
 * `Service definition activation failed: …`을 던진다. 속성 블록 자체가 없으면
 * `Unknown activation status`로 실패다. 다른 계열(메타데이터 확장·서비스 바인딩)이
 * 활성화 응답을 아예 읽지 않는 것과 갈리므로, 여기서는 **고칠 것이 없고 그대로
 * 옮긴다.** 판정을 더하거나 빼면 그것이 구와의 차이가 된다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * - 활성화 본문의 XML 선언과 루트 태그 사이 줄바꿈 한 개가 없다. 공용
 *   `buildObjectReferences`가 둘을 한 줄에 붙이기 때문이며, 이미 지어진 쓰기
 *   도구들이 같은 조립기를 쓴다. 서버가 읽는 문서는 같다.
 * - 질의 인자의 공백이 `+`가 아니라 `%20`으로 나간다(`src/adt/url.ts` 머리주석).
 */

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient } from '../../../adt';
import {
  CT_CHECK_OBJECTS,
  type CheckRunResult,
  buildCheckObjectList,
  encodeObjectName,
  parseCheckRun,
} from '../shared';

/** SRVD 컬렉션. */
export const SRVD_ROOT = '/sap/bc/adt/ddic/srvd/sources';

/** `CT_SERVICE_DEFINITION` — `constants/contentTypes.js:102`. 생성의 Accept이자 Content-Type. */
export const CT_SERVICE_DEFINITION = 'application/vnd.sap.adt.ddic.srvd.v1+xml';

/** 서비스 정의 오브젝트 URI — 나가는 주소는 **소문자**다(머리주석 참조). */
export function serviceDefinitionWriteUri(name: string): string {
  return `${SRVD_ROOT}/${encodeObjectName(name.toLowerCase())}`;
}

/** 응답에 실리는 `uri` — 구는 여기서만 **대문자**를 쓴다(머리주석 참조). */
export function serviceDefinitionReportedUri(name: string): string {
  return `${SRVD_ROOT}/${encodeObjectName(name)}`;
}

/**
 * 서버에 올라간 인액티브 판을 그대로 검사한다.
 *
 * 공용 `checkStored`를 쓰지 않는 이유는 **Accept 한 줄** 때문이다 — 머리주석의
 * 「구문검사의 Accept가 없다」 참조.
 */
export async function checkStagedServiceDefinition(
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

const activationParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export interface ActivationVerdict {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * 활성화 응답 판정 — 벤더 `serviceDefinition/activation.js:22-50`의
 * `parseActivationResponse` 그대로.
 *
 * **SAP은 활성화 실패도 HTTP 200으로 답한다.** 그래서 상태 코드가 아니라
 * `chkl:messages > chkl:properties`의 두 플래그를 본다.
 */
export function serviceDefinitionActivationVerdict(body: string): ActivationVerdict {
  let document: Record<string, unknown>;
  try {
    document = activationParser.parse(body ?? '') as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      message: `Failed to parse activation response: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  const messages = document['chkl:messages'] as Record<string, unknown> | undefined;
  const properties = messages?.['chkl:properties'] as Record<string, unknown> | undefined;
  if (!properties) return { ok: false, message: 'Unknown activation status' };

  const activated = properties.activationExecuted === 'true';
  const checked = properties.checkExecuted === 'true';
  return {
    ok: activated && checked,
    message: activated ? 'Service definition activated successfully' : 'Activation failed',
  };
}
