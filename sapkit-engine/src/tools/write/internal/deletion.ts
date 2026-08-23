/**
 * ADT **삭제 서비스**(`/sap/bc/adt/deletion/*`)의 공용 조각 — 꼬리 삭제 계열의 뼈대.
 *
 * ## 이 파일이 지는 경고 — 오프라인 계약 시험은 「지운다」의 증거가 아니다
 *
 * 삭제는 **재생 대조가 원리상 불가능하다.** 두 번째 실행은 대상이 이미 없어
 * "없다"로 실패하기 때문이다. 그래서 이 계열의 요구 증거 급은 `attended 실기`이고,
 * 이 판이 남기는 계약 시험은 **"구와 같은 바이트를 보낸다"까지만** 증명한다.
 * "SAP이 그것을 받아 실제로 지운다"는 증명하지 않는다 — D22(zrfc)가 같은 모양의
 * 한계를 지고 있고, 그 항목의 문장을 그대로 빌린다.
 *
 * 그래서 **정확성의 근거는 참조 원본의 깊이 하나뿐이다.** 아래 표와 각 도구
 * 모듈의 머리주석은 전부 `engine/node_modules/@babamba2/**`의 구현을 읽어 복원한
 * 것이며, 베낀 것이 아니라 종류마다 따로 읽었다.
 *
 * ## 두 걸음 (구 실측)
 *
 * ```
 * ① POST /sap/bc/adt/deletion/check    Content-Type: …deletion.check.request.v1+xml
 *                                      Accept:       …deletion.check.response.v1+xml
 * ② POST /sap/bc/adt/deletion/delete   Content-Type: …deletion.request.v1+xml
 *                                      Accept:       …deletion.response.v1+xml
 * ```
 *
 * 콘텐츠 타입 4종의 정본은
 * `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/constants/contentTypes.js:26-29`.
 * 타임아웃은 두 걸음 다 `default`(`utils/timeouts.js:16` — `SAP_TIMEOUT_DEFAULT`,
 * 기본 45초).
 *
 * ## 종류별 차이 표 — **베끼지 말고 종류마다 실측한 결과다**
 *
 * | 도구 | 오브젝트 URI | 이름 표기 | 배치 | 세션 | 근거(`dist/core/…`) |
 * |---|---|---|---|---|---|
 * | `DeleteClass` | `/sap/bc/adt/oo/classes/{n}` | `encodeURIComponent` · **대문자 그대로** | 표준 | 삭제 걸음만 **stateful** | `class/delete.js:19-88` · `class/AdtClass.js` delete |
 * | `DeleteInterface` | `/sap/bc/adt/oo/interfaces/{n}` | 〃 | 표준 | 삭제 걸음만 **stateful** | `interface/delete.js:19-84` |
 * | `DeleteProgram` | `/sap/bc/adt/programs/programs/{n}` | 〃 | 표준 | 삭제 걸음만 **stateful** | `program/delete.js:19-83` |
 * | `DeleteTable` | `/sap/bc/adt/ddic/tables/{n}` | 〃 | 표준 | stateless | `table/delete.js:19-84` |
 * | `DeleteStructure` | `/sap/bc/adt/ddic/structures/{n}` | 〃 | 표준 | stateless | `structure/delete.js:19-85` |
 * | `DeleteView` | `/sap/bc/adt/ddic/ddl/sources/{n}` | 〃 | 표준 | stateless | `view/delete.js:19-84` |
 * | `DeleteDomain` | `/sap/bc/adt/ddic/domains/{n}` | 〃 | 표준 | stateless | `domain/delete.js:19-84` |
 * | `DeleteDataElement` | `/sap/bc/adt/ddic/dataelements/{n}` | 〃 | 표준 | stateless | `dataElement/delete.js:19-85` |
 * | `DeleteFunctionGroup` | `/sap/bc/adt/functions/groups/{n}` | 〃 | 표준 | stateless | `functionGroup/delete.js:19-84` |
 * | `DeleteFunctionModule` | `…/groups/{그룹}/fmodules/{모듈}` | 〃 (**둘 다**) | 표준 | stateless | `functionModule/delete.js:22-92` |
 * | `DeleteServiceDefinition` | `/sap/bc/adt/ddic/srvd/sources/{n}` | 〃 | 표준 | stateless | `serviceDefinition/delete.js:19-84` |
 * | `DeleteBehaviorDefinition` | `/sap/bc/adt/bo/behaviordefinitions/{n}` | **인코딩 없음 · 소문자** | **압축** | stateless | `behaviorDefinition/delete.js:28-89` |
 * | `DeleteBehaviorImplementation` | `/sap/bc/adt/oo/classes/{n}` | `DeleteClass`와 같다 | 표준 | 삭제 걸음만 **stateful** | `behaviorImplementation/AdtBehaviorImplementation.js` delete → `class/AdtClass.js` |
 * | `DeleteCdsUnitTest` | `/sap/bc/adt/oo/classes/{n}` | 〃 | 표준 | 〃 | `unitTest/AdtCdsUnitTest.js` delete → `class/AdtClass.js` |
 *
 * **삭제 서비스를 아예 쓰지 않는 5종**(각 도구 모듈의 머리주석이 정본):
 * `DeleteMetadataExtension`(DELETE 한 방) · `DeleteServiceBinding`(발행취소 사전
 * 걸음 + 한 줄 XML · **검사 걸음 없음**) · `DeleteInclude`(잠금 + DELETE) ·
 * `DeleteLocal*` 4종(잠금 + 빈 인클루드 PUT) · `DeleteGuiStatus`·`DeleteScreen`·
 * `DeleteTextElement`(부모 프로그램 잠금 + RFC 대리자) · `DeleteUnitTest`(요청 0회).
 *
 * ## 배치 두 갈래 — 바이트가 다르다
 *
 * 「표준」은 XML 선언 뒤에 줄바꿈이 있고 들여쓰기가 2·4칸이다. 「압축」(BDEF)은
 * 선언과 루트가 **한 줄로 붙고** 들여쓰기가 4·8칸이다. 이송번호 판정도 갈린다:
 * 표준은 `transport_request?.trim()`(공백만 있으면 빈 태그), 압축은 그냥 truthy
 * (공백도 값으로 실린다). 사소해 보이지만 채록·재생 대조의 대상이므로 합치지 않는다.
 */

import { XMLParser } from 'fast-xml-parser';

import { AdtError } from '../../../adt';
import type { AdtClient } from '../../../adt';
import { describeFailure } from '../shared';

// ── 콘텐츠 타입 (`dist/constants/contentTypes.js:26-29`) ─────────────────────

export const ACCEPT_DELETION_CHECK = 'application/vnd.sap.adt.deletion.check.response.v1+xml';
export const CT_DELETION_CHECK = 'application/vnd.sap.adt.deletion.check.request.v1+xml';
export const ACCEPT_DELETION = 'application/vnd.sap.adt.deletion.response.v1+xml';
export const CT_DELETION = 'application/vnd.sap.adt.deletion.request.v1+xml';

export const DELETION_CHECK_PATH = '/sap/bc/adt/deletion/check';
export const DELETION_DELETE_PATH = '/sap/bc/adt/deletion/delete';

/** 전문 배치 — 위 머리주석의 「배치 두 갈래」. */
export type DeletionLayout = 'standard' | 'compact';

// ── 전문 조립 ───────────────────────────────────────────────────────────────

/** 이송번호 태그. 표준은 공백을 값으로 보지 않고, 압축은 본다. */
function transportTag(transportRequest: string | undefined, layout: DeletionLayout): string {
  const present = layout === 'standard' ? Boolean(transportRequest?.trim()) : Boolean(transportRequest);
  return present
    ? `<del:transportNumber>${transportRequest}</del:transportNumber>`
    : '<del:transportNumber/>';
}

export function buildDeletionCheckBody(
  objectUri: string,
  layout: DeletionLayout = 'standard',
): string {
  const head = '<?xml version="1.0" encoding="UTF-8"?>';
  const open =
    '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">';
  const indent = layout === 'standard' ? '  ' : '    ';
  const separator = layout === 'standard' ? '\n' : '';
  return (
    `${head}${separator}${open}\n` +
    `${indent}<del:object adtcore:uri="${objectUri}"/>\n` +
    '</del:checkRequest>'
  );
}

export function buildDeletionRequestBody(
  objectUri: string,
  transportRequest: string | undefined,
  layout: DeletionLayout = 'standard',
): string {
  const head = '<?xml version="1.0" encoding="UTF-8"?>';
  const open =
    '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">';
  const outer = layout === 'standard' ? '  ' : '    ';
  const inner = layout === 'standard' ? '    ' : '        ';
  const separator = layout === 'standard' ? '\n' : '';
  return (
    `${head}${separator}${open}\n` +
    `${outer}<del:object adtcore:uri="${objectUri}">\n` +
    `${inner}${transportTag(transportRequest, layout)}\n` +
    `${outer}</del:object>\n` +
    '</del:deletionRequest>'
  );
}

// ── 「성공했다는 응답」의 판정 ───────────────────────────────────────────────

/**
 * 벤더 옵션 그대로다(`dist/utils/internalUtils.js`의 `assertDeletionSucceeded`) —
 * `parseTagValue`를 끄지 **않는다.** 이 파서는 오직 삭제 응답 판정에만 쓰이고,
 * 판정이 보는 것은 속성(`isDeleted`)과 실패 문구뿐이라 숫자 변환이 결과를 바꾸지
 * 않는다. 구와 같은 옵션을 쓰는 편이 같은 입력에 같은 답을 낸다.
 */
const deletionParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

function read(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * **HTTP 200이 곧 삭제 성공이 아니다.** 삭제 서비스는 실패도 200으로 답하며
 * `<del:object del:isDeleted="false">`와 이유를 본문에 담는다. 이 판정이 없으면
 * "지웠다"고 답한 뒤 오브젝트가 그대로 남는다 — 이 레포의 CLAS 거짓 성공과 같은
 * 모양이다.
 *
 * 삭제 하나가 여러 `del:object`로 갈라지기도 한다(구조체는 TABL/DS와 TABT/DTT 둘을
 * 돌려준다). **전부** `isDeleted="true"`여야 성공이다.
 *
 * 구는 상태 코드 >= 400도 여기서 함께 봤지만, 이 엔진에서는 그 갈래에 닿지 않는다 —
 * `client.request()`가 이미 던진다(`src/adt/client.ts`). 판정을 두 곳에 두지 않는다.
 */
export function assertDeletionSucceeded(body: string, objectLabel: string): void {
  const label = objectLabel || 'Object';
  if (typeof body !== 'string' || !body.includes('deletionResult')) return;

  let objects: unknown[];
  try {
    const parsed = deletionParser.parse(body) as Record<string, unknown>;
    const found =
      read(parsed['del:deletionResult'], 'del:object') ?? read(parsed['deletionResult'], 'object');
    objects = asArray(found);
  } catch {
    // 본문이 `deletionResult`를 말했지만 깨끗이 파싱되지 않았다 — 구와 같이
    // 판정을 유보한다(구는 여기서 상태 코드 검사로 흘렀고, 그 검사는 이 엔진에서
    // 이미 접속 계층이 한다).
    return;
  }

  for (const object of objects) {
    const isDeleted =
      read(object, '@_del:isDeleted') === 'true' || read(object, '@_isDeleted') === 'true';
    if (isDeleted) continue;

    let text = read(read(object, 'del:message'), 'del:text') ?? read(read(object, 'message'), 'text');
    if (text && typeof text === 'object') text = read(text, '#text') ?? '';
    const detail =
      typeof text === 'string' && text.trim()
        ? text.trim()
        : 'the deletion service reported isDeleted="false"';
    throw new Error(`${label} deletion failed: ${detail}`);
  }
}

// ── 두 걸음 실행 ────────────────────────────────────────────────────────────

export interface DeletionRun {
  /** `/sap/bc/adt/deletion/*` 전문에 실리는 오브젝트 주소. */
  readonly objectUri: string;
  /** `assertDeletionSucceeded`가 실패 문구 앞에 붙이는 이름. 종류마다 다르다. */
  readonly label: string;
  readonly transportRequest?: string;
  readonly layout?: DeletionLayout;
  /**
   * 삭제 걸음을 stateful 세션으로 보낼 것인가. 클래스 계열 셋만 참이다
   * (`AdtClass.js`·`AdtInterface.js`·`AdtProgram.js`의 delete가
   * `setSessionType('stateful')`을 걸고 `finally`에서 되돌린다).
   */
  readonly stateful?: boolean;
}

/**
 * 검사 → 삭제 두 걸음. 검사 응답은 구도 판정에 쓰지 않으므로 흘려보낸다
 * (벤더의 `checkDeletion`은 응답을 그대로 돌려줄 뿐이고, 호출자는 그것을
 * `state.checkResult`에 담기만 한다).
 */
export async function runDeletion(client: AdtClient, run: DeletionRun): Promise<void> {
  const layout = run.layout ?? 'standard';

  await client.request({
    method: 'POST',
    path: DELETION_CHECK_PATH,
    body: buildDeletionCheckBody(run.objectUri, layout),
    contentType: CT_DELETION_CHECK,
    accept: ACCEPT_DELETION_CHECK,
    timeout: 'default',
  });

  if (run.stateful === true) client.setSessionType('stateful');
  try {
    const response = await client.request({
      method: 'POST',
      path: DELETION_DELETE_PATH,
      body: buildDeletionRequestBody(run.objectUri, run.transportRequest, layout),
      contentType: CT_DELETION,
      accept: ACCEPT_DELETION,
      timeout: 'default',
    });
    assertDeletionSucceeded(response.body, run.label);
  } finally {
    // 구의 `finally { setSessionType('stateless') }`와 같은 자리다.
    if (run.stateful === true) client.setSessionType('stateless');
  }
}

// ── 실패 문구 ───────────────────────────────────────────────────────────────

/**
 * 삭제 계열 14종이 **글자까지 같은 모양으로** 쓰던 오류 매핑
 * (`engine/src/handlers/class/high/handleDeleteClass.ts:99-128` 외 13곳).
 *
 * **순서가 계약이다** — 404·423·400을 먼저 보고, 그 셋이 아닐 때만 응답 본문의
 * `exc:exception`을 본다. 그래서 예외 XML을 실은 400은 SAP 문구가 아니라
 * "Bad request …"로 답한다. 개선처럼 보여도 구의 동작이므로 그대로 둔다.
 */
export function deletionFailureMessage(
  error: unknown,
  parts: { readonly subject: string; readonly label: string; readonly name: string },
): string {
  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `${parts.label} ${parts.name} not found. It may already be deleted.`;
  if (status === 423) {
    return `${parts.label} ${parts.name} is locked by another user. Cannot delete.`;
  }
  if (status === 400) return 'Bad request. Check if transport request is required and valid.';

  const adtMessage = error instanceof AdtError ? error.adtMessage : undefined;
  if (adtMessage && adtMessage.trim().length > 0) return `SAP Error: ${adtMessage.trim()}`;

  return `Failed to delete ${parts.subject}: ${describeFailure(error)}`;
}

// ── ECC 우회로 ──────────────────────────────────────────────────────────────

/** 구 게이트와 같은 판정 — `process.env.SAP_VERSION?.toUpperCase() === 'ECC'`. */
export function isEcc(sapVersion: string | null): boolean {
  return sapVersion?.toUpperCase() === 'ECC';
}

/**
 * ECC 우회로가 이 판에 없다는 것을 **정직하게 알린다** (차이 장부 D110).
 *
 * 구는 `DeleteTable`·`DeleteDomain`·`DeleteDataElement` 셋에서 `SAP_VERSION=ECC`면
 * `ZSAPKIT_ADT_DDIC_*` OData 브리지로 우회했다. 이 엔진의 RFC 통로는 읽기 브리지
 * (`callDdicTablRead`) 하나만 갖고 있고, 쓰기 브리지를 더하는 것은 `src/rfc/**`를
 * 고치는 일이라 이 묶음의 범위 밖이다. 그냥 ADT로 흘려보내면 **ECC 커널에 없는
 * 엔드포인트에 삭제를 시도**하게 되므로 흘려보내지 않는다. D61(생성 쪽)과 같은 결이다.
 */
export function eccDeleteUnsupported(toolName: string, bridgeFm: string, segment: string): string {
  return (
    `${toolName} on SAP_VERSION=ECC needs the ${bridgeFm} OData bridge, which this engine does not implement yet (divergence D110). ` +
    `The ADT endpoint /sap/bc/adt/ddic/${segment} does not exist on ECC kernels (BASIS < 7.50), so falling through to it would attempt a delete against a missing endpoint.`
  );
}
