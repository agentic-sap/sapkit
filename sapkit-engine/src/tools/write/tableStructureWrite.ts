/**
 * `CreateTable`·`UpdateTable`·`CreateStructure`·`UpdateStructure`의 공용 내부.
 *
 * 넷은 같은 DDIC 흐름(검증 → 생성 → 잠금 → 사전검사 → PUT → 해제 → 사후검사 →
 * 활성화)을 타지만, **URI의 대소문자 규칙이 단계마다 다르다.** 구 벤더 코드가
 * 단계별로 다른 함수에서 이름을 다르게 다듬기 때문이고, 합치면 이름에 슬래시가
 * 든 오브젝트에서 보내는 주소가 달라진다. 그래서 여기서는 그 차이를 **지우지 않고
 * 표로 굳혀 둔다.** 근거는 전부
 * `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist` 실측이다.
 *
 * | 단계 | 테이블 | 구조체 |
 * |---|---|---|
 * | 잠금·해제 | `encode(NAME)` (`core/table/lock.js:15`) | `encode(NAME).toLowerCase()` (`core/structure/lock.js:17`) |
 * | 소스 PUT | `encode(NAME).toLowerCase()` (`core/table/update.js:26`) | `encode(NAME)` (`core/structure/update.js:17`) |
 * | 검사 objectUri | `encode(NAME).toLowerCase()` (`core/table/check.js:17`) | `encode(name.toLowerCase())` (`utils/checkRun.js:20,43-46`) |
 * | 활성화 objectUri | `encode(NAME)` (`core/table/activation.js:12`) | `encode(NAME)` (`core/structure/activation.js:12`) |
 *
 * 테이블과 구조체가 **서로 반대**인 칸이 둘(잠금 / 소스 PUT)이라는 점이 요점이다.
 * 이름이 순수 영숫자면 결과가 같지만, `/NS/ZTAB` 같은 이름에서 `%2F`와 `%2f`로
 * 갈린다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import type { ToolResult } from '../../server/toolDefinition';
import { type CheckRunResult, parseCheckRun } from './shared';

// ── 콘텐츠 타입 (구 `constants/contentTypes.js` 실측값) ─────────────────────

/** `:78` — `ACCEPT_TABLE`. */
export const ACCEPT_TABLE = 'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml';
/** `:79` — `CT_TABLE`. */
export const CT_TABLE = 'application/vnd.sap.adt.tables.v2+xml';
/** `core/structure/create.js:41` — 상수가 아니라 그 자리에 적힌 문자열이다. */
export const ACCEPT_STRUCTURE_CREATE =
  'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.structures.v2+xml';
/** `:91` — `CT_STRUCTURE`. */
export const CT_STRUCTURE = 'application/vnd.sap.adt.structures.v2+xml';
/** `:34` — `ACCEPT_VALIDATION`. */
export const ACCEPT_VALIDATION = 'application/vnd.sap.as+xml';
/** `:19` — `CT_SOURCE`. */
export const CT_SOURCE = 'text/plain; charset=utf-8';
/** `:16` — `ACCEPT_SOURCE`. 테이블 PUT이 쓴다(`core/table/update.js:29`). */
export const ACCEPT_SOURCE = 'text/plain';
/**
 * 구조체 PUT이 쓰는 Accept — `core/structure/update.js:19`에 그 자리 문자열로
 * 적혀 있고 테이블 쪽과 다르다.
 */
export const ACCEPT_STRUCTURE_SOURCE = 'application/xml, application/json, text/plain, */*';
/** `:23`·`:24`. */
export const ACCEPT_CHECK_MESSAGES = 'application/vnd.sap.adt.checkmessages+xml';
export const CT_CHECK_OBJECTS = 'application/vnd.sap.adt.checkobjects+xml';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
const DEFAULT_MASTER_LANGUAGE = 'EN';

// ── 종류 표 ─────────────────────────────────────────────────────────────────

export interface DdicWriteKind {
  /** ADT 컬렉션 뿌리. */
  readonly root: string;
  /** 사람이 읽을 이름 — 오류 문구에 그대로 들어간다. */
  readonly label: 'table' | 'structure';
  /** 첫 글자가 대문자인 형태 — 구 문구가 그렇게 쓴다. */
  readonly Label: 'Table' | 'Structure';
  /** 생성 페이로드의 `adtcore:type`. */
  readonly adtcoreType: 'TABL/DT' | 'TABL/DS';
  /** 생성 요청의 Accept·Content-Type. */
  readonly createAccept: string;
  readonly createContentType: string;
  /** 소스 PUT의 Accept. */
  readonly sourceAccept: string;
  /** 이름 검증의 `objtype` 질의 인자. */
  readonly validationObjType: 'tabldt' | 'stru';
  /** 인자·응답의 이름 키. */
  readonly nameKey: 'table_name' | 'structure_name';
  /** 잠금·해제 URI. */
  lockUri(name: string): string;
  /** 소스 PUT URI(뒤에 `/source/main`이 붙기 전 몸통). */
  sourceUri(name: string): string;
  /** 검사 payload의 `adtcore:uri`. */
  checkUri(name: string): string;
  /** 활성화 payload의 `adtcore:uri`. */
  activateUri(name: string): string;
}

const encode = encodeURIComponent;

export const TABLE_WRITE: DdicWriteKind = {
  root: '/sap/bc/adt/ddic/tables',
  label: 'table',
  Label: 'Table',
  adtcoreType: 'TABL/DT',
  createAccept: ACCEPT_TABLE,
  createContentType: CT_TABLE,
  sourceAccept: ACCEPT_SOURCE,
  validationObjType: 'tabldt',
  nameKey: 'table_name',
  lockUri: (name) => `/sap/bc/adt/ddic/tables/${encode(name)}`,
  sourceUri: (name) => `/sap/bc/adt/ddic/tables/${encode(name).toLowerCase()}`,
  checkUri: (name) => `/sap/bc/adt/ddic/tables/${encode(name).toLowerCase()}`,
  activateUri: (name) => `/sap/bc/adt/ddic/tables/${encode(name)}`,
};

export const STRUCTURE_WRITE: DdicWriteKind = {
  root: '/sap/bc/adt/ddic/structures',
  label: 'structure',
  Label: 'Structure',
  adtcoreType: 'TABL/DS',
  createAccept: ACCEPT_STRUCTURE_CREATE,
  createContentType: CT_STRUCTURE,
  sourceAccept: ACCEPT_STRUCTURE_SOURCE,
  validationObjType: 'stru',
  nameKey: 'structure_name',
  lockUri: (name) => `/sap/bc/adt/ddic/structures/${encode(name).toLowerCase()}`,
  sourceUri: (name) => `/sap/bc/adt/ddic/structures/${encode(name)}`,
  // 벤더 `getObjectUri`는 **먼저 소문자로 만들고** 인코딩한다 — 테이블 쪽과 순서가 반대다.
  checkUri: (name) => `/sap/bc/adt/ddic/structures/${encode(name.toLowerCase())}`,
  activateUri: (name) => `/sap/bc/adt/ddic/structures/${encode(name)}`,
};

// ── 공통 인자 조각 ──────────────────────────────────────────────────────────

/** 네 도구가 같은 문구로 발행하는 `transport_request` 인자. */
export const transportRequestArg = (required: boolean) =>
  z
    .string()
    .describe(
      required
        ? 'Transport request number (e.g., E19K905635). Required for transportable packages.'
        : 'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
    )
    .optional();

// ── 구와 같은 잡일 ──────────────────────────────────────────────────────────

/** 구 `limitDescription` — 60자를 넘으면 자른다. */
export function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/** 구 핸들러 16곳이 갈라지던 그 판정(`SAP_VERSION` 대문자 비교). */
export function isEcc(sapVersion: string | null): boolean {
  return sapVersion?.toUpperCase() === 'ECC';
}

/**
 * 접속된 시스템의 로그온/마스터 언어. 조회가 안 되면 `EN`이다 — 이 조회 실패가
 * 생성 실패가 되어서는 안 된다(구 `lib/adtLogonLanguage.ts`).
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
    if (/^[A-Z]{1,3}$/.test(language)) return language;
  } catch {
    // 조회 불가 — 기본값으로.
  }
  return DEFAULT_MASTER_LANGUAGE;
}

// ── 생성 페이로드 ───────────────────────────────────────────────────────────

/**
 * `blue:blueSource` 한 장 — 테이블·구조체가 같은 뼈대를 쓰고 `adtcore:type`만
 * 다르다(`core/table/create.js:40-46` · `core/structure/create.js:33-36`).
 *
 * **줄바꿈까지 구와 같게 둔다.** 테이블 쪽은 `packageRef` 앞뒤로 빈 줄이 하나씩
 * 더 있고 구조체 쪽은 없다 — 서버가 신경 쓰지 않을 가능성이 높지만, 재생 대조가
 * 본문을 글자로 견주므로 지어내지 않는다.
 */
export function buildBlueSource(options: {
  readonly kind: DdicWriteKind;
  readonly name: string;
  readonly packageName: string;
  readonly description: string;
  readonly masterLanguage: string;
}): string {
  const { kind, name, packageName, description, masterLanguage } = options;
  const head =
    `<?xml version="1.0" encoding="UTF-8"?><blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" ` +
    `xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" ` +
    `adtcore:language="${masterLanguage}" adtcore:name="${name.toUpperCase()}" ` +
    `adtcore:type="${kind.adtcoreType}" adtcore:masterLanguage="${masterLanguage}">`;
  const packageRef = `  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>`;
  return kind.label === 'table'
    ? `${head}\n\n${packageRef}\n\n</blue:blueSource>`
    : `${head}\n${packageRef}\n</blue:blueSource>`;
}

// ── 요청 조각 ───────────────────────────────────────────────────────────────

/** 이름 검증. 구는 응답을 **해석하지 않는다** — 4xx면 요청 자체가 던진다. */
export async function validateName(
  client: AdtClient,
  kind: DdicWriteKind,
  name: string,
  description: string | undefined,
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `${kind.root}/validation`,
    params: {
      objtype: kind.validationObjType,
      objname: name,
      // 테이블은 값이 없어도 인자를 붙이고(`core/table/validation.js:25-26`),
      // 구조체는 값이 있을 때만 붙인다(`core/structure/validation.js:25-27`).
      description: kind.label === 'table' ? (description ?? '') : description || undefined,
    },
    accept: ACCEPT_VALIDATION,
  });
}

/** 빈 껍데기 생성. */
export async function createShell(
  client: AdtClient,
  kind: DdicWriteKind,
  body: string,
  transportRequest: string | undefined,
): Promise<void> {
  await client.request({
    method: 'POST',
    path: kind.root,
    params: { corrNr: transportRequest },
    body,
    contentType: kind.createContentType,
    accept: kind.createAccept,
  });
}

/** 소스 PUT — 잠금 핸들을 들고 있는 동안에만 부른다. */
export async function putDdlSource(
  client: AdtClient,
  kind: DdicWriteKind,
  name: string,
  lockHandle: string,
  ddlCode: string,
  transportRequest: string | undefined,
): Promise<void> {
  await client.request({
    method: 'PUT',
    path: `${kind.sourceUri(name)}/source/main`,
    params: { lockHandle, corrNr: transportRequest },
    body: ddlCode,
    contentType: CT_SOURCE,
    accept: kind.sourceAccept,
  });
}

// ── 검사 ────────────────────────────────────────────────────────────────────

/**
 * DDIC 검사 payload. 소스를 주면 base64 artifact가 실린다.
 *
 * 구 프로그램·클래스 쪽(`./shared.ts`의 `buildInlineCheckObjectList`)은 바깥
 * `chkrun:version`을 `active`로 박지만, DDIC 쪽은 **호출자가 준 버전을 그대로**
 * 쓴다(`core/table/check.js:16-31` · `utils/checkRun.js:99-113`). 그래서 그쪽
 * 헬퍼를 쓰지 않고 여기서 따로 짓는다.
 */
export function buildDdicCheckPayload(
  objectUri: string,
  version: 'active' | 'inactive',
  sourceCode?: string,
): string {
  if (sourceCode) {
    const encoded = Buffer.from(sourceCode, 'utf-8').toString('base64');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
      `  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="${version}">\n` +
      `    <chkrun:artifacts>\n` +
      `      <chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="${objectUri}/source/main">\n` +
      `        <chkrun:content>${encoded}</chkrun:content>\n` +
      `      </chkrun:artifact>\n` +
      `    </chkrun:artifacts>\n` +
      `  </chkrun:checkObject>\n` +
      `</chkrun:checkObjectList>`
    );
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="${version}"/>\n` +
    `</chkrun:checkObjectList>`
  );
}

/** DDIC 검사 한 번. 응답 해석은 {@link judgeDdicCheck}가 한다. */
export async function runDdicCheck(
  client: AdtClient,
  kind: DdicWriteKind,
  name: string,
  version: 'active' | 'inactive',
  sourceCode?: string,
): Promise<CheckRunResult> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildDdicCheckPayload(kind.checkUri(name), version, sourceCode),
    contentType: CT_CHECK_OBJECTS,
    accept: ACCEPT_CHECK_MESSAGES,
  });
  return parseCheckRun(response.body);
}

/**
 * 검사 결과가 **쓰기를 막아야 하는가**.
 *
 * 구 `parseCheckRunResponse`(`utils/checkRun.js:117-242`)의 판정을 다시 저작한
 * 것이다. 셋이 요점이다:
 *
 *  1. `status='processed'`일 때 SAP이 **완료 통지를 `type="E"`로 되울리는** 일이
 *     있다("Objekt Z_X wurde geprüft"). 그 문구는 `statusText`와 같으므로 걸러야
 *     한다 — 안 거르면 정상 검사가 전부 오류가 된다(`:210-214`).
 *  2. `status='notProcessed'`는 메시지가 하나도 없어도 오류다(`:216`) — 요청한
 *     버전을 검증할 수 없었다는 뜻이다.
 *  3. DDIC 오브젝트는 "inactive version does not exist" / "importing from
 *     database"를 정상적으로 낸다. 이 둘은 **통과시킨다**
 *     (`core/structure/check.js:16-30` · `handleUpdateTable.ts:182-188`).
 */
export function judgeDdicCheck(result: CheckRunResult): { readonly blocked: boolean; readonly detail: string } {
  const statusText = (result.message ?? '').trim().toLowerCase();
  const realErrors =
    result.status === 'processed' && statusText
      ? result.errors.filter((entry) => entry.text.trim().toLowerCase() !== statusText)
      : result.errors;

  const hasErrors = realErrors.length > 0 || result.status === 'notProcessed';
  const success = result.status === 'processed' && realErrors.length === 0;
  if (success || !hasErrors) return { blocked: false, detail: '' };

  const tolerable =
    (statusText.includes('inactive version') && statusText.includes('does not exist')) ||
    (statusText.includes('importing') && statusText.includes('database'));
  if (tolerable) return { blocked: false, detail: '' };

  // 문구가 비면 상태라도 싣는다 — 구 4.13.11이 고친 "빈 오류" 자리다.
  const detail =
    realErrors
      .map((entry) => entry.text)
      .filter((text) => text && text.trim())
      .join('; ') || `${result.message ?? ''} (check status: ${result.status})`.trim();
  return { blocked: true, detail };
}

// ── 응답 조립 ───────────────────────────────────────────────────────────────

/**
 * 구 `return_response(JSON.stringify(x))` — **들여쓰기가 없다.**
 * `Create*` 둘이 이 모양이고 `Update*` 둘은 `null, 2`를 쓴다. 이유가 있어 보이지는
 * 않지만 응답 형태는 계약이므로 접지 않는다
 * (`handleCreateTable.ts:200` vs `handleUpdateTable.ts:348`).
 */
export function compactResult(payload: unknown): ToolResult {
  return { isError: false, content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

export function prettyResult(payload: unknown): ToolResult {
  return { isError: false, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}
