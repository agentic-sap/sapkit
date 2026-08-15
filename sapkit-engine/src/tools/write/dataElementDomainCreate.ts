/**
 * `CreateDataElement`·`CreateDomain`의 공용 내부 — 두 사슬이 **함께 쓰는 것만** 둔다.
 *
 * 두 도구는 겉보기에 쌍둥이지만 사슬이 실제로 다르다. 아래 표가 안쪽 패키지에서
 * 복원한 실측이며, 접어 합치면 사라지는 차이들이다 — 그래서 사슬 자체는 각
 * 도구 파일이 따로 짓고 여기에는 조각만 둔다.
 *
 * | | `CreateDataElement` | `CreateDomain` |
 * |---|---|---|
 * | 사슬 순서 | create → lock → update → **unlock → check** | create → lock → update → **check → unlock** |
 * | 검사 실패 무시 목록 | 있다 (3종) | **없다** — 오류면 무조건 던진다 |
 * | 활성화 Content-Type | `application/xml` | `application/vnd.sap.adt.activation+xml` |
 * | 활성화 응답 판정 | **한다** (`chkl:properties`) | **안 한다** |
 * | `activate` 인자 | 발행 스키마에 **없다** | 있다 |
 * | 응답 직렬화 | `JSON.stringify(…, null, 2)` | `JSON.stringify(…)` (한 줄) |
 *
 * 근거:
 * `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/{create,lock,unlock,check,activation,update}.js` ·
 * `.../core/domain/{create,lock,unlock,check,activation,update}.js` ·
 * `.../utils/{checkRun,activationUtils,internalUtils,timeouts}.js` ·
 * 구 핸들러 `engine/src/handlers/data_element/high/handleCreateDataElement.ts` ·
 * `engine/src/handlers/domain/high/handleCreateDomain.ts`.
 *
 * 계약 정본은 구 엔진 자신의 시험 둘이다 —
 * `engine/src/__tests__/unit/createHandlersStatefulSessionFamily.test.ts`
 * (잠금부터 해제까지 **모든 요청이 stateful**) ·
 * `engine/src/__tests__/unit/createLogonLanguageConsistency.test.ts`
 * (생성 페이로드의 언어가 시스템 로그온 언어, 조회 불가 시 `EN`).
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 질의 인자의 공백이 `+`가 아니라 `%20`으로 나간다. 구 벤더는 `URLSearchParams`로
 * 조립했고(예: `core/domain/validation.js:21-31`) 신 접속 계층은 항상
 * `encodeURIComponent`를 쓴다(`src/adt/url.ts` 머리주석 — 잠금 핸들 왕복 때문에
 * 정한 규칙이다). 서버가 푸는 값은 같다.
 */

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_CHECK_MESSAGES,
  CT_CHECK_OBJECTS,
  type CheckMessage,
  buildCheckObjectList,
  encodeObjectName,
  parseCheckRun,
} from './shared';

// ── ADT 콘텐츠 타입 (안쪽 패키지 `constants/contentTypes.js`의 실측값) ────────

/** `ACCEPT_VALIDATION` — `:34`. */
export const ACCEPT_VALIDATION = 'application/vnd.sap.as+xml';
/** `ACCEPT_DOMAIN` — `:84`. */
export const ACCEPT_DOMAIN =
  'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml';
/** `CT_DOMAIN` — `:85`. */
export const CT_DOMAIN = 'application/vnd.sap.adt.domains.v2+xml';
/** `ACCEPT_DATA_ELEMENT` — `:87`. */
export const ACCEPT_DATA_ELEMENT =
  'application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml';
/** `CT_DATA_ELEMENT` — `:88`. */
export const CT_DATA_ELEMENT = 'application/vnd.sap.adt.dataelements.v2+xml';
/** 읽기-수정-쓰기 PUT이 싣는 값 — 벤더가 상수를 안 쓰고 직접 적어 둔 자리다. */
export const CT_DOMAIN_PUT = 'application/vnd.sap.adt.domains.v2+xml; charset=utf-8';
export const CT_DATA_ELEMENT_PUT = 'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8';
/** `CT_ACTIVATION` — `:32`. 도메인 활성화만 이것을 쓴다. */
export const CT_ACTIVATION = 'application/vnd.sap.adt.activation+xml';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
/** 벤더의 역사적 기본값. 조회가 안 될 때만 쓴다. */
export const DEFAULT_MASTER_LANGUAGE = 'EN';

// ── 이름과 URI ──────────────────────────────────────────────────────────────

/**
 * 벤더가 DDIC 오브젝트의 **쓰기·잠금·검사·활성화 경로**에 쓰는 이름 —
 * 소문자로 만든 **뒤** 인코딩한다(`utils/internalUtils.js:19-21`을
 * `name.toLowerCase()`로 부른다). 읽기 경로는 대문자 그대로라 규칙이 다르다.
 */
export function lowerUriName(name: string): string {
  return encodeObjectName(name.toLowerCase());
}

export function ddicObjectUri(segment: string, name: string): string {
  return `/sap/bc/adt/ddic/${segment}/${lowerUriName(name)}`;
}

// ── 로그온 언어 ─────────────────────────────────────────────────────────────

/**
 * 접속된 시스템의 로그온/마스터 언어.
 *
 * 구는 `engine/src/lib/adtLogonLanguage.ts`가 같은 엔드포인트를 읽어 생성
 * 페이로드에 주입했다. EN을 박아 두면 로그온 언어가 EN이 아닌 시스템에서
 * **설명이 통째로 사라진 껍데기**가 남는다(HANDOFF §6 백로그 11-⑧, IDES 실측).
 * 조회 실패는 생성 실패가 아니다 — `EN`으로 떨어진다.
 */
export async function resolveMasterLanguage(client: AdtClient): Promise<string> {
  try {
    const response = await client.request({
      method: 'GET',
      path: SYSTEMINFO_PATH,
      accept: SYSTEMINFO_ACCEPT,
    });
    const parsed = JSON.parse(response.body) as { language?: unknown };
    const language = typeof parsed.language === 'string' ? parsed.language.trim().toUpperCase() : '';
    // ADT 언어 코드는 1~3자다. 모양이 다르면 쓰지 않는다.
    if (/^[A-Z]{1,3}$/.test(language)) return language;
  } catch {
    // 조회 불가 — 기본값으로.
  }
  return DEFAULT_MASTER_LANGUAGE;
}

// ── 시스템 문맥 (`adtcore:masterSystem` · `adtcore:responsible`) ─────────────

/**
 * 구 `getSystemContext()`가 생성 페이로드에 실어 주던 두 값.
 *
 * 구는 기동 때 `resolveSystemContext`로 한 번 풀어 캐시했고, 그 해석 순서는
 * ⑴ HTTP 헤더 override ⑵ `SAP_MASTER_SYSTEM` / (`SAP_RESPONSIBLE` ||
 * `SAP_USERNAME`) ⑶ 그래도 없으면 `getSystemInformation`이었다
 * (`engine/src/lib/systemContext.ts:45-86`). 해석된 프로파일에는 `SAP_USERNAME`이
 * 반드시 있으므로 실사용에서 걸리는 것은 ⑵다. ⑶은 이 판에서 짓지 않았다 —
 * 차이 장부 D62.
 */
export function systemContextOf(context: ToolContext): {
  readonly masterSystem: string;
  readonly responsible: string;
} {
  const env = context.env;
  return {
    masterSystem: env.SAP_MASTER_SYSTEM ?? '',
    responsible: env.SAP_RESPONSIBLE ?? env.SAP_USERNAME ?? '',
  };
}

// ── 읽기-수정-쓰기 XML 패치 (벤더 `utils/xmlPatch.js`) ──────────────────────
//
// 두 사슬이 GET 한 XML을 **문자열 그대로** 손본다. 처음부터 다시 짓지 않는 것이
// 요점이다 — 그러면 `abapLanguageVersion`처럼 우리가 모르는 SAP 관리 필드가
// 통째로 사라진다(벤더 파일 머리주석).

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 속성 하나를 갈아 끼운다. 없으면 **루트 여는 태그에 새로 넣는다**
 * (벤더 `xmlPatch.js:31-46`의 `addIfMissing` — 두 사슬 모두 그 옵션으로 부른다).
 * SAP이 설명을 통째로 버린 껍데기는 이 경로로만 고칠 수 있다.
 */
export function patchXmlAttribute(xml: string, attribute: string, value: string): string {
  const regex = new RegExp(`${attribute}="[^"]*"`);
  if (regex.test(xml)) return xml.replace(regex, `${attribute}="${escapeXmlAttr(value)}"`);

  // 여는 태그를 찾되 따옴표 안의 `>`에 속지 않는다.
  const rootOpen = /<([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/;
  const match = xml.match(rootOpen);
  if (match && match.index !== undefined) {
    const tag = `<${match[1]}${match[2]} ${attribute}="${escapeXmlAttr(value)}"${match[3]}>`;
    return xml.slice(0, match.index) + tag + xml.slice(match.index + match[0].length);
  }
  return xml;
}

/** 요소 본문을 갈아 끼운다. 빈 값이면 자기 닫음 태그로 접는다(`xmlPatch.js:51-59`). */
export function patchXmlElement(xml: string, tag: string, value: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>|<${tag}\\s*/>`);
  if (value === '') return xml.replace(regex, `<${tag}/>`);
  return xml.replace(regex, `<${tag}>${escapeXmlText(value)}</${tag}>`);
}

/**
 * 블록 통째 갈아치우기 — `xmlPatch.js:74-92`의 `patchXmlBlock`.
 *
 * 대상 블록이 없으면 **루트 닫는 태그 앞에 끼워 넣는다.** 갓 만든 껍데기에는
 * `<doma:fixValues/>`가 아예 없을 수 있는데, 그때 조용히 아무 일도 안 하면
 * "넣었는데 사라진" 것과 "넣을 자리가 없던" 것을 구분할 수 없다.
 */
export function patchXmlBlock(xml: string, tag: string, content: string): string {
  const regex = new RegExp(`<${tag}[\\s\\S]*?</${tag}>|<${tag}\\s*/>`);
  if (regex.test(xml)) return xml.replace(regex, content);

  const rootClose = xml.match(/<\/[a-zA-Z0-9:_-]+>\s*$/);
  if (!rootClose || rootClose.index === undefined) return `${xml}\n${content}`;
  return `${xml.slice(0, rootClose.index)}${content}\n${xml.slice(rootClose.index)}`;
}

// ── 검사 (`/sap/bc/adt/checkruns`) ──────────────────────────────────────────

export interface CheckVerdict {
  readonly hasErrors: boolean;
  readonly errors: readonly CheckMessage[];
}

/**
 * 벤더 `parseCheckRunResponse`의 판정을 그대로 되살린다
 * (`utils/checkRun.js` — `realErrors` / `has_errors` 계산).
 *
 * 두 자리가 요점이다:
 *  - `status='processed'`일 때 SAP이 **완료 통지문을 type="E"로 되돌려 보내는**
 *    일이 있어, 그 문구가 `statusText`와 같으면 오류에서 뺀다(언어 무관 판정).
 *  - `status='notProcessed'`는 메시지가 하나도 없어도 **오류다.**
 */
export function checkVerdict(body: string): CheckVerdict {
  const parsed = parseCheckRun(body);
  let errors: readonly CheckMessage[] = parsed.errors;
  if (parsed.status === 'processed' && parsed.message && errors.length > 0) {
    const statusLower = parsed.message.toLowerCase().trim();
    errors = errors.filter((entry) => entry.text.toLowerCase().trim() !== statusLower);
  }
  return { hasErrors: errors.length > 0 || parsed.status === 'notProcessed', errors };
}

/** 저장된 판을 검사한다 — 벤더 `runCheckRun(…, 'abapCheckRun')`과 같은 요청. */
export async function runObjectCheck(
  client: AdtClient,
  objectUri: string,
  version: 'active' | 'inactive',
): Promise<CheckVerdict> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildCheckObjectList(objectUri, version),
    contentType: CT_CHECK_OBJECTS,
    accept: ACCEPT_CHECK_MESSAGES,
  });
  return checkVerdict(response.body);
}

/** 검사 오류 문구를 벤더처럼 이어 붙인다 — `errors.map(text).join('; ')`. */
export function joinCheckErrors(errors: readonly CheckMessage[]): string {
  return errors.map((entry) => entry.text).join('; ');
}

/**
 * 구 `safeCheckOperation` + `isAlreadyCheckedError`
 * (`engine/src/lib/utils.ts:1147-1155`·`:1226-1252`).
 *
 * "이미 검사됨"은 실패가 아니다 — 구는 그 예외에 `isAlreadyChecked` 표를 달아
 * 호출부가 삼키게 했다. 결과가 같으므로 여기서는 판정 하나로 접었다.
 */
export function isAlreadyCheckedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('has been checked') ||
    lower.includes('was checked') ||
    lower.includes('already checked')
  );
}

// ── 오류 문구 ───────────────────────────────────────────────────────────────

/** 구의 `error.response?.data` 자리 — ADT가 돌려준 원문 본문. */
export function responseBodyOf(error: unknown): string | undefined {
  return error instanceof AdtError ? error.rawBody : undefined;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 구 핸들러가 실패 문구를 뽑던 순서 그대로: 응답 본문이 있으면 그것, 없으면
 * 오류 메시지. 구의 500자 자르기는 본문이 **문자열이 아닐 때만** 걸리는
 * 갈래였고(`handleCreateDataElement.ts:322-326`), 신 접속 계층의 `rawBody`는
 * 언제나 문자열이라 그 갈래에 닿지 않는다.
 */
export function createFailureDetail(error: unknown): string {
  return responseBodyOf(error) ?? messageOf(error);
}

/**
 * "이미 있다"의 판정 — 구 핸들러가 인라인으로 쓰던 거친 검사 그대로다
 * (`handleCreateDataElement.ts:312-315` · `handleCreateDomain.ts:307-310`).
 * 구 `utils.ts`에는 T100 키를 보는 더 나은 판정기가 있지만 **이 두 핸들러는
 * 그것을 쓰지 않는다** — 여기서 몰래 갈아 끼우지 않는다.
 */
export function looksAlreadyExists(error: unknown): boolean {
  if (messageOf(error).includes('already exists')) return true;
  return responseBodyOf(error)?.includes('ExceptionResourceAlreadyExists') === true;
}

// ── ECC 우회로 ──────────────────────────────────────────────────────────────

/** 구 게이트와 같은 판정 — 대문자화만 하고 trim 하지 않는다. */
export function isEcc(sapVersion: string | null): boolean {
  return sapVersion?.toUpperCase() === 'ECC';
}

/**
 * ECC 우회로가 M1에 없다는 것을 정직하게 알린다 (차이 장부 D61).
 * 그냥 ADT로 흘려보내면 ECC 커널에 없는 엔드포인트에 **쓰기를 시도**하게 된다.
 */
export function eccCreateUnsupported(
  toolName: string,
  bridgeFm: string,
  segment: string,
): string {
  return (
    `${toolName} on SAP_VERSION=ECC needs the ${bridgeFm} OData bridge, which this engine does not implement yet (divergence D61). ` +
    `The ADT endpoint /sap/bc/adt/ddic/${segment} does not exist on ECC kernels (BASIS < 7.50), so falling through to it would attempt a write against a missing endpoint.`
  );
}
