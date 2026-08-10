/**
 * ADT `/sap/bc/adt/checkruns` — 요청 조립과 응답 해석.
 *
 * 구 엔진은 이 자리에 **파서 두 벌**을 두고 있었다. 엔진 쪽
 * (`engine/src/lib/checkRunParser.ts`)의 결과가 도구 응답으로 나가고, 벤더 쪽
 * (`@babamba2/…/utils/checkRun.js`)의 결과는 `client.getXxx().check()`가
 * "던질까 말까"를 정하는 데만 쓰였다. 둘은 한 곳에서 갈린다 —
 * **벤더만** `status='processed'`일 때 statusText를 그대로 되읊는 E 메시지를
 * 걸러 낸다(검사 완료 통지가 오류로 세는 것을 막는다).
 *
 * 그래서 여기서는 파서 하나(엔진 판)를 두고, "구 래퍼라면 던졌을까"는
 * {@link wrapperWouldThrow}가 벤더의 걸러내기 규칙으로 따로 판단한다. 두 벌을
 * 다 짓지 않으면서 갈림은 보존하는 방법이다.
 */

import { XMLParser } from 'fast-xml-parser';

export interface CheckMessage {
  readonly type: string;
  readonly text: string;
  readonly line?: string | number;
  readonly href?: string;
}

export interface CheckRunResult {
  success: boolean;
  status: string;
  message: string;
  errors: CheckMessage[];
  warnings: CheckMessage[];
  info: CheckMessage[];
  total_messages: number;
  has_errors: boolean;
  has_warnings: boolean;
}

/** 검사를 한 번도 돌리지 않은 상태. 구 `EMPTY_RESULT`와 같다. */
export function emptyCheckResult(): CheckRunResult {
  return {
    success: true,
    status: 'not_run',
    message: '',
    errors: [],
    warnings: [],
    info: [],
    total_messages: 0,
    has_errors: false,
    has_warnings: false,
  };
}

export const CHECKRUN_PATH = '/sap/bc/adt/checkruns';
export const CHECKRUN_REPORTER = 'abapCheckRun';
export const CT_CHECK_OBJECTS = 'application/vnd.sap.adt.checkobjects+xml';
export const ACCEPT_CHECK_MESSAGES = 'application/vnd.sap.adt.checkmessages+xml';

/** 서버가 이미 가진 판을 검사한다 — 소스를 싣지 않는 본문. */
export function buildCheckObjectList(objectUri: string, version: 'active' | 'inactive'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="${version}"/>\n` +
    `</chkrun:checkObjectList>`
  );
}

/**
 * 제안된 소스를 base64로 실어 **서버에 쓰지 않고** 그 자리에서 컴파일시킨다.
 * 바깥 `checkObject`는 컴파일 대상이고, 안쪽 `artifact`가 갈아끼울 조각이다.
 */
export function buildInlineArtifactCheckObjectList(
  outerUri: string,
  artifactUri: string,
  sourceCode: string,
): string {
  const base64Source = Buffer.from(sourceCode, 'utf-8').toString('base64');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${outerUri}" chkrun:version="active">\n` +
    `    <chkrun:artifacts>\n` +
    `      <chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="${artifactUri}">\n` +
    `        <chkrun:content>${base64Source}</chkrun:content>\n` +
    `      </chkrun:artifact>\n` +
    `    </chkrun:artifacts>\n` +
    `  </chkrun:checkObject>\n` +
    `</chkrun:checkObjectList>`
  );
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function shortTextOf(message: Record<string, unknown>): string {
  const attribute = message['@_chkrun:shortText'];
  if (typeof attribute === 'string') return attribute;
  const nested = message['shortText'];
  if (nested && typeof nested === 'object') {
    const record = nested as Record<string, unknown>;
    const text = firstDefined(record['#text'], record['txt']);
    return text === undefined ? '' : String(text);
  }
  return nested === undefined || nested === null ? '' : String(nested);
}

/** 구 엔진 `checkRunParser.ts`의 해석 그대로. 이 결과가 도구 응답으로 나간다. */
export function parseCheckRunResponse(body: string): CheckRunResult {
  try {
    const document = parser.parse(body) as Record<string, any>;
    const checkReport =
      document['chkrun:checkRunReports']?.['chkrun:checkReport'] ??
      document['checkRunReports']?.['checkReport'] ??
      document['chkrun:checkReport'] ??
      document['checkReport'];

    if (!checkReport) {
      return {
        success: true,
        status: 'no_report',
        message: 'No check report in response (no issues reported)',
        errors: [],
        warnings: [],
        info: [],
        total_messages: 0,
        has_errors: false,
        has_warnings: false,
      };
    }

    const status = String(
      firstDefined(
        checkReport['@_chkrun:status'],
        checkReport['chkrun:status'],
        checkReport['@_status'],
        checkReport['status'],
      ) ?? 'unknown',
    );
    const statusText = String(
      firstDefined(
        checkReport['chkrun:statusText'],
        checkReport['@_chkrun:statusText'],
        checkReport['statusText'],
        checkReport['@_statusText'],
      ) ?? '',
    );

    const messages = firstDefined(
      checkReport['chkrun:checkMessageList']?.['chkrun:checkMessage'],
      checkReport['checkMessageList']?.['checkMessage'],
      checkReport['chkrun:messages']?.['msg'],
      checkReport['messages']?.['msg'],
      checkReport['chkrun:messages'],
      checkReport['messages'],
    );
    const messageArray: unknown[] = Array.isArray(messages)
      ? messages
      : messages
        ? [messages]
        : [];

    const errors: CheckMessage[] = [];
    const warnings: CheckMessage[] = [];
    const info: CheckMessage[] = [];

    for (const raw of messageArray) {
      if (!raw || typeof raw !== 'object') continue;
      const message = raw as Record<string, unknown>;
      const type = String(
        firstDefined(message['@_chkrun:type'], message['@_type'], message['type']) ?? 'I',
      );
      const line = firstDefined(message['@_line'], message['line']) as
        | string
        | number
        | undefined;
      const href = firstDefined(
        message['@_chkrun:uri'],
        message['@_href'],
        message['href'],
      ) as string | undefined;

      const entry: CheckMessage = { type, text: shortTextOf(message), line, href };
      if (type === 'E') errors.push(entry);
      else if (type === 'W') warnings.push(entry);
      else info.push(entry);
    }

    return {
      success: status === 'processed' && errors.length === 0,
      status,
      message: statusText,
      errors,
      warnings,
      info,
      total_messages: messageArray.length,
      has_errors: errors.length > 0 || status === 'notProcessed',
      has_warnings: warnings.length > 0,
    };
  } catch (error) {
    return {
      success: false,
      status: 'parse_error',
      message: `Failed to parse check run response: ${error}`,
      errors: [],
      warnings: [],
      info: [],
      total_messages: 0,
      has_errors: false,
      has_warnings: false,
    };
  }
}

/**
 * 구 `client.getXxx().check()` 래퍼가 이 결과에서 던졌을지 판단한다.
 *
 * 벤더 파서의 규칙이다: `status='processed'`일 때 statusText를 그대로 되읊는 E
 * 메시지는 "검사 완료 통지"이므로 오류로 세지 않는다. 남은 실오류가 있거나
 * 상태가 `notProcessed`이면 던진다.
 */
export function wrapperWouldThrow(result: CheckRunResult): {
  throws: boolean;
  errors: CheckMessage[];
} {
  const echo = result.message.toLowerCase().trim();
  const errors =
    result.status === 'processed' && echo
      ? result.errors.filter((entry) => entry.text.toLowerCase().trim() !== echo)
      : result.errors;
  return { throws: errors.length > 0 || result.status === 'notProcessed', errors };
}

/** SAP의 "REPORT/PROGRAM 문이 없다" 잡음 판정 — 구와 같은 두 갈래다. */
export function isReportMissingNoiseText(text: string): boolean {
  return (
    /REPORT\/?\s*PROGRAM statement is missing/i.test(text) ||
    /program type is INCLUDE/i.test(text)
  );
}

/** 잡음만 남은 오류 목록을 걷어내고 판정을 다시 센다. 구와 같은 규칙. */
export function downgradeReportMissingNoise(result: CheckRunResult): CheckRunResult {
  const errors = result.errors.filter((entry) => !isReportMissingNoiseText(entry.text));
  if (errors.length === result.errors.length) return result;
  return {
    ...result,
    errors,
    total_messages: errors.length + result.warnings.length + result.info.length,
    has_errors: errors.length > 0 || result.status === 'notProcessed',
    success: result.status === 'processed' && errors.length === 0,
  };
}

/** 구 `isAlreadyCheckedError` — 문구 세 갈래. */
export function isAlreadyCheckedText(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    lowered.includes('has been checked') ||
    lowered.includes('was checked') ||
    lowered.includes('already checked')
  );
}
