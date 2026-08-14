/**
 * 함수그룹·함수모듈 묶음의 쓰기 도구가 함께 쓰는 조각.
 *
 * 세 도구(`CreateFunctionGroup` · `CreateFunctionModule` · `UpdateFunctionModule`)만
 * 여기를 읽는다. 성격별 배치의 `write/`에 남되 묶음 전용 파일로 갈라 둔 이유는
 * `shared.ts`가 여러 묶음이 동시에 손대는 자리이기 때문이다.
 *
 * ## URI는 **소문자**다
 *
 * 함수 계열의 쓰기 경로는 오브젝트 이름을 소문자로 낮춰 보낸다 — 잠금·PUT·검사·
 * 활성화가 전부 그렇다. 근거(전부 읽기 전용 참고,
 * `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/` 아래):
 *
 *  - 잠금·해제 — `core/functionModule/lock.js:17-18` · `unlock.js:13-14`
 *  - 소스 PUT — `core/functionModule/update.js:16-17`
 *  - 생성(FM) — `core/functionModule/create.js:14`(그룹 이름만 낮춘다)
 *  - 활성화 — `utils/activationUtils.js:115-131` · `core/functionGroup/activation.js:12`
 *  - 검사 — `utils/checkRun.js:19-40`(`encodeSapObjectName(name.toLowerCase())`)
 *
 * **읽기 경로는 반대로 대문자 그대로**다(`core/shared/AdtUtils.js:743-763`). 두
 * 규칙이 한 오브젝트에 공존하므로 합치지 않는다 — 합치면 슬래시가 든 이름에서
 * 보내는 URL이 달라진다. 읽기 쪽 조립은 `../read/internal/adt.ts`가 소유한다.
 *
 * ## 소유자 속성
 *
 * 구는 생성 페이로드에 `adtcore:masterSystem`·`adtcore:responsible`을 붙인다. 값의
 * 출처는 `engine/src/lib/systemContext.ts:63-70` — `SAP_MASTER_SYSTEM`과
 * `SAP_RESPONSIBLE || SAP_USERNAME`이다. 접속 프로파일에 사용자 이름이 있으면
 * **언제나 `responsible`이 실린다**는 뜻이고, 빈 문자열이면 붙이지 않는다
 * (`core/functionGroup/create.js:22-26` — 빈 값이 SAP의 "Kerberos library not
 * loaded" 오류를 부른다는 주석이 그 자리에 달려 있다).
 */

import { XMLParser } from 'fast-xml-parser';

import type { ToolContext, ToolResult } from '../../server/toolDefinition';
import { encodeObjectName, errorResult } from './shared';

// ── ADT 콘텐츠 타입 (구 `constants/contentTypes.js`의 실측값) ────────────────

/** `contentTypes.js:73` — 벤더 기본값. 시스템이 v2만 광고하면 협상이 이긴다. */
export const CT_FUNCTION_GROUP = 'application/vnd.sap.adt.functions.groups.v3+xml';
/** `contentTypes.js:76`. */
export const CT_FUNCTION_MODULE = 'application/vnd.sap.adt.functions.fmodules+xml';
/**
 * 함수모듈 이름 검증이 싣는 Accept — `core/functionModule/validation.js:64`.
 * 함수그룹 쪽(`ACCEPT_VALIDATION`)과 **다른 값**이다. 통일하지 않는다.
 */
export const ACCEPT_FUNCTION_MODULE_VALIDATION =
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage';

/** ADT의 함수 계열 이름 검증 엔드포인트. 그룹과 모듈이 같은 자리를 쓴다. */
export const FUNCTION_VALIDATION_PATH = '/sap/bc/adt/functions/validation';

// ── 오류 문구 ───────────────────────────────────────────────────────────────

/**
 * 구 `return_error(new Error(msg))` 그대로 — **`Error: ` 접두사가 계약의 일부**다
 * (`engine/src/lib/utils.ts:421-429`). 이 묶음의 구 핸들러 셋은 전부 그 함수를
 * 통해 오류를 냈으므로 접두사를 함께 옮긴다. 읽기 도구들이 쓰는
 * `read/internal/results.ts`의 `returnError`와 같은 계약이다.
 */
export function functionErrorResult(message: string): ToolResult {
  return errorResult(`Error: ${message}`);
}

// ── URI ─────────────────────────────────────────────────────────────────────

/** `/sap/bc/adt/functions/groups/zfg_x` — 쓰기 경로는 소문자다. */
export function functionGroupUri(name: string): string {
  return `/sap/bc/adt/functions/groups/${encodeObjectName(name).toLowerCase()}`;
}

/** `/sap/bc/adt/functions/groups/zfg_x/fmodules/z_fm_x` — 둘 다 소문자다. */
export function functionModuleUri(groupName: string, moduleName: string): string {
  return `${functionGroupUri(groupName)}/fmodules/${encodeObjectName(moduleName).toLowerCase()}`;
}

// ── 소유자 속성 ─────────────────────────────────────────────────────────────

export interface OwnerAttributes {
  readonly masterSystem?: string;
  readonly responsible?: string;
}

/**
 * 구 `getSystemContext()`가 생성 페이로드에 실어 주던 두 값.
 *
 * 읽는 자리는 구와 같은 **두 환경변수뿐**이다(`systemContext.ts:64-65`).
 * 접속 설정의 사용자 이름으로 대신 채우지 않는다 — 구가 그러지 않는다.
 * `context.env`는 프로세스 env 위에 프로파일 `sap.env`를 얹은 것이므로
 * `SAP_USERNAME`은 접속 프로파일이 있으면 여기 있다.
 */
export function ownerAttributes(context: ToolContext): OwnerAttributes {
  const masterSystem = context.env.SAP_MASTER_SYSTEM || undefined;
  const raw = context.env.SAP_RESPONSIBLE || context.env.SAP_USERNAME;
  // 빈 문자열은 붙이지 않는다 — 위 머리주석의 Kerberos 주석이 근거다.
  const responsible = raw && raw.trim() !== '' ? raw : undefined;
  return { masterSystem, responsible };
}

/** 두 값을 여는 태그에 덧붙이는 조각. 구와 같은 순서·같은 이스케이프(없음)다. */
export function ownerAttributeXml(owner: OwnerAttributes): string {
  return (
    (owner.masterSystem ? ` adtcore:masterSystem="${owner.masterSystem}"` : '') +
    (owner.responsible ? ` adtcore:responsible="${owner.responsible}"` : '')
  );
}

// ── 이름 검증 응답 읽기 ─────────────────────────────────────────────────────

const validationParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

export interface ValidationVerdict {
  readonly valid: boolean;
  readonly message?: string;
}

/**
 * `/functions/validation`의 답을 읽는다 — 구 `parseValidationResponse`
 * (`engine/src/lib/utils.ts:1017-1136`)의 표준 갈래.
 *
 * `CHECK_RESULT=X`거나 `DATA`가 아예 없으면 통과, `SEVERITY=ERROR`면 거부다.
 * **읽을 수 없는 응답을 거부로 바꾸지 않는다** — 구도 파싱 실패 + HTTP 200이면
 * 통과로 본다. 그쪽 판정은 실제 생성 요청이 한다.
 */
export function parseFunctionValidation(body: string): ValidationVerdict {
  let document: Record<string, unknown>;
  try {
    document = validationParser.parse(body ?? '') as Record<string, unknown>;
  } catch {
    return { valid: true };
  }
  const values = (document['asx:abap'] as Record<string, unknown> | undefined)?.['asx:values'];
  const data = (values as Record<string, unknown> | undefined)?.['DATA'] as
    | Record<string, unknown>
    | undefined;
  if (!data) return { valid: true };
  if (data['CHECK_RESULT'] === 'X') return { valid: true };
  const severity = typeof data['SEVERITY'] === 'string' ? data['SEVERITY'] : undefined;
  const shortText = typeof data['SHORT_TEXT'] === 'string' ? data['SHORT_TEXT'] : undefined;
  return { valid: severity !== 'ERROR', message: shortText };
}

/**
 * 시험용 클라우드에서 SAP이 돌려주는 잡음. 구는 이 문구를 만나면 **검증·생성·검사
 * 어느 단계에서든 실패로 보지 않고 진행한다** — 오브젝트는 실제로 만들어지기
 * 때문이다(`AdtFunctionGroup.js:93-104` · `core/functionGroup/create.js:78-92` ·
 * `core/functionGroup/check.js`의 `isKerberosError`).
 */
export function isKerberosNoise(text: string): boolean {
  return text.toLowerCase().includes('kerberos library not loaded');
}
