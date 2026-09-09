/**
 * 쓰기·활성 도구의 공용 내부 — ADT 와이어 조립과 결과 판정.
 *
 * 이 묶음은 SAP의 **상태를 바꾼다**. 그래서 여기 있는 것은 전부 두 가지 중
 * 하나다: ⑴ 구 엔진이 실제로 보내던 요청을 같은 모양으로 다시 조립하는 것,
 * ⑵ "성공했다는 응답"이 곧 성공이 아님을 붙잡는 판정.
 *
 * ⑵가 이 파일의 존재 이유다. SAP의 활성화는 **오류를 담은 채 HTTP 200으로
 * 답한다** — 상태 코드만 보면 깨진 코드가 "활성화 성공"으로 보고된다(이 레포의
 * CLAS 거짓 성공 실증 이력). 그래서 활성화 응답 본문의 `<chkl:msg type="E">`를
 * 파싱해 실패로 되돌리는 자리를 여기 하나로 모았다.
 *
 * 잠금은 접속 계층이 소유한다 — `client.withLock()`이 실패 경로에서도 해제를
 * 보장하고, 잠금을 들고 있는 동안 요청을 stateful로 유지한다. 여기서 잠금
 * 수명주기를 다시 짜지 않는다.
 */

import { XMLParser } from 'fast-xml-parser';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import type { ToolResult } from '../../server/toolDefinition';

// ── ADT 콘텐츠 타입 (구 `@babamba2/mcp-abap-adt-clients`의 실측값) ──────────

export const CT_SOURCE = 'text/plain; charset=utf-8';
export const ACCEPT_SOURCE = 'text/plain';
export const CT_CHECK_OBJECTS = 'application/vnd.sap.adt.checkobjects+xml';
export const ACCEPT_CHECK_MESSAGES = 'application/vnd.sap.adt.checkmessages+xml';
export const CT_ACTIVATION = 'application/vnd.sap.adt.activation+xml';
/** 인클루드·메인프로그램 활성화가 쓰는 쪽. 구 핸들러가 직접 조립하던 값이다. */
export const CT_ACTIVATION_REQUEST =
  'application/vnd.sap.adt.activation.request+xml; charset=utf-8';
export const CT_PROGRAM = 'application/vnd.sap.adt.programs.programs.v2+xml';
export const ACCEPT_VALIDATION = 'application/vnd.sap.as+xml';
export const ACCEPT_INCLUDE =
  'application/vnd.sap.adt.programs.includes.v2+xml, application/vnd.sap.adt.programs.includes+xml';
export const CT_INCLUDE = 'application/vnd.sap.adt.programs.includes+xml';
export const ACCEPT_INACTIVE_OBJECTS =
  'application/vnd.sap.adt.inactivectsobjects.v1+xml, application/xml;q=0.8';

// ── 이름과 URI ──────────────────────────────────────────────────────────────

export function encodeObjectName(name: string): string {
  return encodeURIComponent(name);
}

/** 프로그램 URI — 구는 **소문자**로 보낸다. */
export function programUri(name: string): string {
  return `/sap/bc/adt/programs/programs/${encodeObjectName(name).toLowerCase()}`;
}

/**
 * 인클루드 URI — 구는 **대문자 그대로** 보낸다
 * (`handleUpdateInclude.ts:95-96` · `handleCreateInclude.ts:380-381`).
 * 프로그램·클래스와 규칙이 다르므로 접어 넣지 않는다.
 */
export function includeUri(name: string): string {
  return `/sap/bc/adt/programs/includes/${encodeObjectName(name)}`;
}

/** 클래스 URI — 구는 **소문자**로 보낸다. */
export function classUri(name: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(name).toLowerCase()}`;
}

/**
 * 함수그룹 인클루드의 이름에서 그룹 이름을 유도한다 — `L<그룹>TOP` · `L<그룹>UXX` ·
 * `L<그룹>F01`처럼 SAP이 함수그룹 인클루드에 붙이는 이름 규칙이다. 규칙에 맞지
 * 않으면 `undefined`(독립 인클루드).
 *
 * 왜 이름으로 가르는가 (장부 D143): 독립 인클루드 주소(`/programs/includes/<name>`)로
 * 함수그룹 인클루드를 잠그면 SAP이 403 `This syntax cannot be used for an object
 * name`으로 거절한다(실측 2026-07-30 · `sapkit-feedback.md`). 그 문구를 만나 재시도하는
 * 길도 있으나 SAP 메시지는 로그온 언어를 따라 독일어·한국어로도 오므로 문구 판정은
 * 언어 의존이다. 이름 규칙은 언어와 무관하고, `L*`는 고객 이름공간(Z·Y)의 독립
 * 프로그램에 쓸 수 없는 접두라 오분류 위험이 낮다. 활성화 쪽은 이미 같은 주소를
 * 쓴다(`activateObjects.ts`의 `FUGR/I`). **실기 미검증** — 이 주소로 잠금이 실제로
 * 성립하는지는 attended에서 확인할 자리다.
 */
export function functionGroupOfInclude(name: string): string | undefined {
  const match = /^L(.+?)(TOP|UXX|[A-Z]\d\d)$/i.exec(name);
  return match?.[1] ? match[1].toUpperCase() : undefined;
}

/**
 * 인클루드 **쓰기** 주소(잠금·PUT·해제·활성화). 함수그룹 인클루드면
 * `/functions/groups/<그룹>/includes/<이름>`(둘 다 소문자 — `activateObjects.ts`와
 * `GetInactiveObjects`가 보고하는 모양), 아니면 구 그대로 대문자 독립 주소다.
 * **읽기는 여기를 쓰지 않는다** — `/programs/includes/<이름>/source/main`이
 * 함수그룹 인클루드에도 소스를 돌려주는 것이 실측이다(같은 피드백 항목).
 */
export function includeWriteUri(name: string): string {
  const group = functionGroupOfInclude(name);
  if (group === undefined) return includeUri(name);
  return `/sap/bc/adt/functions/groups/${encodeObjectName(group).toLowerCase()}/includes/${encodeObjectName(name).toLowerCase()}`;
}

/** 60자를 넘는 설명은 잘린다 — 구 `limitDescription`. */
export function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

// ── 오류 보고 ───────────────────────────────────────────────────────────────

/**
 * 사전 구문검사·활성화가 찾아낸 오류를 실어 나르는 예외.
 *
 * 구 핸들러의 `error.isPreCheckFailure` 자리다 — 진단(줄번호까지)을 잃지 않고
 * 호출자에게 그대로 올리기 위한 통로이며, 삼켜서는 안 되는 실패다.
 */
export class SourceCheckFailure extends Error {
  readonly checkErrors: readonly CheckMessage[];
  readonly checkWarnings: readonly CheckMessage[];

  constructor(
    message: string,
    checkErrors: readonly CheckMessage[],
    checkWarnings: readonly CheckMessage[] = [],
  ) {
    super(message);
    this.name = 'SourceCheckFailure';
    this.checkErrors = checkErrors;
    this.checkWarnings = checkWarnings;
  }
}

/**
 * 실패 하나를 사람이 읽을 한 줄로. **SAP이 돌려준 문구는 글자 그대로 보존**하고,
 * 엔진이 판정한 종류(`lock-conflict`·`forbidden`·`csrf`·`not-found`…)를 앞에
 * 붙인다 — 어떤 벽에 막혔는지가 문구에 없으면 호출자는 손쓸 곳을 모른다.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof SourceCheckFailure) return error.message;
  if (error instanceof AdtError) {
    const where = error.status === undefined ? error.kind : `${error.status} ${error.kind}`;
    const text = error.adtMessage ? `SAP Error: ${error.adtMessage}` : error.message;
    const hint = ctsLockHint(error);
    return hint ? `[${where}] ${text} — ${hint}` : `[${where}] ${text}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * CTS 잠금 문구 — `transport_request` 누락·태스크 번호 오도의 표식 (장부 D144).
 *
 * 실측: 이송 대상 CLAS에 `transport_request`를 안 넘기면 PROG처럼 `corrNr` 400이
 * 아니라 「…요청 DEVK…에서 이미 잠겨 있습니다」로 실패하고(ZUNIWTH L-011 ·
 * 2026-08-05 — 사용자가 SM12를 확인했으나 잠금은 없었다), 태스크 번호를 넘기면 같은
 * 문구로 HTTP 500이다(ZUNIVAT-MODI 도메인노트 · 2026-08-10 — 상위 요청 번호로 통과).
 * 둘 다 잠금이 아닌데 문구가 잠금이라 말하므로 힌트를 덧붙인다. **원문은 그대로**
 * 두고 뒤에 붙일 뿐이다. 문구는 로그온 언어를 따르므로 세 언어를 본다.
 */
const CTS_LOCK_PHRASE =
  /already locked in (?:request|task)|locked in (?:request|task)\s+[A-Z0-9]+|이미\s*잠겨\s*있습니다|bereits (?:in|im) (?:Auftrag|Aufgabe)[^\n]*gesperrt/i;

export const CTS_LOCK_HINT =
  'Hint: this CTS message usually means transport_request was omitted or is a task number — not a lock held by another user. Pass the parent request number (E070.STRKORR of the task) as transport_request and retry before asking anyone to release a lock.';

/** 오류가 CTS 잠금 문구를 담고 있으면 힌트를, 아니면 `undefined`를 돌려준다. */
export function ctsLockHint(error: unknown): string | undefined {
  if (!(error instanceof AdtError)) return undefined;
  const text = `${error.adtMessage ?? ''}\n${error.rawBody ?? ''}\n${error.message}`;
  return CTS_LOCK_PHRASE.test(text) ? CTS_LOCK_HINT : undefined;
}

export function okResult(payload: unknown): ToolResult {
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

export function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

// ── 구문검사 (`/sap/bc/adt/checkruns`) ───────────────────────────────────────

export interface CheckMessage {
  readonly type: string;
  readonly text: string;
  readonly line?: string | number;
  readonly href?: string;
}

export interface CheckRunResult {
  readonly status: string;
  readonly message: string;
  readonly errors: CheckMessage[];
  readonly warnings: CheckMessage[];
  readonly info: CheckMessage[];
}

const EMPTY_CHECK: CheckRunResult = {
  status: 'no_report',
  message: '',
  errors: [],
  warnings: [],
  info: [],
};

const checkParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

function stringOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const text = record['#text'] ?? record['txt'];
    if (text !== undefined) return stringOf(text);
  }
  return '';
}

/**
 * SAP이 자주 `line="1"`을 자리표시자로 놓고 실제 위치를 `href` 조각
 * (`#start=줄,열`)에 담는다. 조각이 있으면 그쪽이 이긴다.
 */
function lineOf(raw: unknown, href: unknown): string | number | undefined {
  if (typeof href === 'string') {
    const match = href.match(/#start=(\d+),/);
    if (match?.[1]) return match[1];
  }
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  return undefined;
}

/** `<chkrun:checkRunReports>` 한 장을 오류/경고/정보로 가른다. */
export function parseCheckRun(body: string): CheckRunResult {
  let document: Record<string, unknown>;
  try {
    document = checkParser.parse(body ?? '') as Record<string, unknown>;
  } catch {
    return { ...EMPTY_CHECK, status: 'parse_error' };
  }

  const reports = document['chkrun:checkRunReports'] ?? document['checkRunReports'];
  const report =
    (reports as Record<string, unknown> | undefined)?.['chkrun:checkReport'] ??
    (reports as Record<string, unknown> | undefined)?.['checkReport'] ??
    document['chkrun:checkReport'] ??
    document['checkReport'];
  if (!report || typeof report !== 'object') return EMPTY_CHECK;

  const fields = report as Record<string, unknown>;
  const status = stringOf(fields['@_chkrun:status'] ?? fields['@_status']) || 'unknown';
  const statusText = stringOf(fields['@_chkrun:statusText'] ?? fields['@_statusText']);

  const list = fields['chkrun:checkMessageList'] ?? fields['checkMessageList'];
  const messages = asArray(
    (list as Record<string, unknown> | undefined)?.['chkrun:checkMessage'] ??
      (list as Record<string, unknown> | undefined)?.['checkMessage'],
  );

  const errors: CheckMessage[] = [];
  const warnings: CheckMessage[] = [];
  const info: CheckMessage[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const type = stringOf(entry['@_chkrun:type'] ?? entry['@_type']) || 'I';
    const href = entry['@_chkrun:uri'] ?? entry['@_href'];
    const message: CheckMessage = {
      type,
      text: stringOf(entry['@_chkrun:shortText'] ?? entry['shortText']),
      line: lineOf(entry['@_line'], href),
      href: typeof href === 'string' ? href : undefined,
    };
    if (type === 'E') errors.push(message);
    else if (type === 'W') warnings.push(message);
    else info.push(message);
  }

  return { status, message: statusText, errors, warnings, info };
}

/** 오브젝트 하나를 그대로 검사하는 요청 본문. */
export function buildCheckObjectList(objectUri: string, version: 'active' | 'inactive'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="${version}"/>\n` +
    `</chkrun:checkObjectList>`
  );
}

/**
 * **쓰기 전** 검사 본문 — 제안 소스를 base64로 실어 보낸다.
 *
 * SAP은 이것을 메모리에서 컴파일한다. PUT도 잠금도 필요 없고, 서버에 저장된
 * 것은 한 바이트도 바뀌지 않는다. 그래서 "깨진 코드를 올린 다음 알아채는" 대신
 * **올리기 전에** 막을 수 있다.
 */
export function buildInlineCheckObjectList(
  outerUri: string,
  artifactUri: string,
  sourceCode: string,
): string {
  const encoded = Buffer.from(sourceCode, 'utf-8').toString('base64');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${outerUri}" chkrun:version="active">\n` +
    `    <chkrun:artifacts>\n` +
    `      <chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="${artifactUri}">\n` +
    `        <chkrun:content>${encoded}</chkrun:content>\n` +
    `      </chkrun:artifact>\n` +
    `    </chkrun:artifacts>\n` +
    `  </chkrun:checkObject>\n` +
    `</chkrun:checkObjectList>`
  );
}

export async function postCheckRun(client: AdtClient, body: string): Promise<CheckRunResult> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body,
    contentType: CT_CHECK_OBJECTS,
    accept: ACCEPT_CHECK_MESSAGES,
  });
  return parseCheckRun(response.body);
}

/** 저장된 버전을 그대로 검사한다. */
export function checkStored(
  client: AdtClient,
  objectUri: string,
  version: 'active' | 'inactive' = 'inactive',
): Promise<CheckRunResult> {
  return postCheckRun(client, buildCheckObjectList(objectUri, version));
}

/** 제안 소스를 얹어 검사한다(쓰기 전). */
export function checkProposed(
  client: AdtClient,
  outerUri: string,
  artifactUri: string,
  sourceCode: string,
): Promise<CheckRunResult> {
  return postCheckRun(client, buildInlineCheckObjectList(outerUri, artifactUri, sourceCode));
}

/**
 * "REPORT/PROGRAM 문이 없다 / 프로그램 타입이 INCLUDE"는 SAP 리포터가 컴파일할
 * 인액티브 버전을 못 찾았을 때도 나온다 — 소스가 멀쩡해도 나오는 잡음이다.
 * 이것만 있는 결과로 쓰기를 막으면 정상 작업이 통째로 멈춘다.
 */
export function isReportMissingNoise(text: string): boolean {
  return (
    /REPORT\/?\s*PROGRAM statement is missing/i.test(text) ||
    /program type is INCLUDE/i.test(text)
  );
}

/**
 * 오류가 있으면 **던진다**. 잡음뿐이면 통과시킨다(판정 유보 — 진짜 검증은
 * 활성화가 한다). 메시지에는 **모든** 오류를 줄번호와 함께 담는다: 한 번에
 * 고칠 수 있게.
 */
export function assertNoCheckErrors(result: CheckRunResult, kind: string, name: string): void {
  const real = result.errors.filter((entry) => !isReportMissingNoise(entry.text));
  if (real.length === 0) return;

  const detail = real
    .map((entry) => {
      const location = entry.line ? `[L${entry.line}] ` : '';
      const type = entry.type === 'E' ? '' : `<${entry.type}> `;
      return `${type}${location}${entry.text}`;
    })
    .join(' | ');

  throw new SourceCheckFailure(
    `${kind} ${name} preCheck syntax check failed (${real.length} error${
      real.length === 1 ? '' : 's'
    }): ${detail}`,
    real,
    result.warnings,
  );
}

// ── 소스 쓰기 ───────────────────────────────────────────────────────────────

/** `PUT {baseUri}/source/main?lockHandle=…[&corrNr=…]`. */
export async function putSource(
  client: AdtClient,
  baseUri: string,
  lockHandle: string,
  sourceCode: string,
  transportRequest?: string,
): Promise<void> {
  await client.request({
    method: 'PUT',
    path: `${baseUri}/source/main`,
    params: { lockHandle, corrNr: transportRequest },
    body: sourceCode,
    contentType: CT_SOURCE,
    accept: ACCEPT_SOURCE,
  });
}

/** `GET {baseUri}/source/main[?version=…]`. */
export async function getSource(
  client: AdtClient,
  baseUri: string,
  version?: 'active' | 'inactive',
): Promise<string> {
  const response = await client.request({
    method: 'GET',
    path: `${baseUri}/source/main`,
    params: { version },
    accept: ACCEPT_SOURCE,
  });
  return response.body;
}

// ── 활성화 ──────────────────────────────────────────────────────────────────

export interface ObjectReference {
  readonly uri: string;
  readonly name: string;
  readonly type?: string;
}

export function buildObjectReferences(entries: readonly ObjectReference[]): string {
  const refs = entries
    .map(
      (entry) =>
        `  <adtcore:objectReference adtcore:uri="${entry.uri}"${
          entry.type ? ` adtcore:type="${entry.type}"` : ''
        } adtcore:name="${entry.name}"/>`,
    )
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `${refs}\n</adtcore:objectReferences>`
  );
}

/**
 * 활성화 응답의 `<chkl:msg>`를 가른다.
 *
 * **SAP은 활성화 실패도 HTTP 200으로 답한다.** 상태 코드만 믿으면 깨진 코드가
 * "활성화됨"으로 보고된다. 여기서 나온 `E`는 실패이며, 호출자는 이것을 성공으로
 * 접어서는 안 된다.
 */
export function parseActivationMessages(body: string): CheckMessage[] {
  if (!body || !body.includes('<')) return [];
  let document: unknown;
  try {
    document = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: false,
      parseAttributeValue: false,
      removeNSPrefix: true,
      trimValues: true,
    }).parse(body);
  } catch {
    return [];
  }
  const root = (document as Record<string, unknown>)?.['messages'];
  const messages = asArray((root as Record<string, unknown> | undefined)?.['msg']);
  const parsed: CheckMessage[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const href = entry['@_href'];
    parsed.push({
      type: stringOf(entry['@_type']).toUpperCase(),
      text: stringOf(entry['shortText'] ?? entry['@_shortText']),
      line: lineOf(entry['@_line'], href),
      href: typeof href === 'string' ? href : undefined,
    });
  }
  return parsed;
}

/** 활성화 응답이 담은 진짜 실패들. */
export function activationErrors(messages: readonly CheckMessage[]): CheckMessage[] {
  return messages.filter((entry) => entry.type === 'E' || entry.type === 'A' || entry.type === 'X');
}

/**
 * 오브젝트 하나를 활성화한다 — 구 `activateObjectInSession`과 같은 요청.
 * 응답 본문을 그대로 돌려주므로, 판정은 호출자가 `parseActivationMessages`로 한다.
 */
export async function activateOne(
  client: AdtClient,
  objectUri: string,
  objectName: string,
  options: { readonly contentType?: string; readonly timeout?: 'default' | 'long' } = {},
): Promise<string> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/activation',
    params: { method: 'activate', preauditRequested: 'true' },
    body: buildObjectReferences([{ uri: objectUri, name: objectName }]),
    contentType: options.contentType ?? CT_ACTIVATION,
    accept: 'application/xml',
    timeout: options.timeout ?? 'default',
  });
  return response.body;
}
