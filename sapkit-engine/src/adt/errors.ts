/**
 * ADT 오류의 **단일 정규화 타입**.
 *
 * ADT는 실패를 두 축으로 알린다: HTTP 상태와, 본문에 실리는
 * `<exc:exception>` XML(`<type id="...">`에 기계용 코드, `<message>`에 사람용
 * 문구, `<properties>`에 T100 메시지 키). 상위 계층이 이걸 문자열로 다시
 * 파싱하지 않도록 여기서 한 번만 구조화하고, 진단을 위해 **원문은 그대로
 * 보존**한다.
 *
 * 분류를 메시지 문구로 하지 않는 이유: ADT 메시지 텍스트는 백엔드 메시지 풀의
 * 언어를 따라가서 `lang="EN"`인데 독일어가 실려 오기도 한다. 판단은 항상
 * 상태 코드와 `type/@id`로 한다.
 */

import { XMLParser } from 'fast-xml-parser';

export type AdtErrorKind =
  /** 응답을 받기 전에 시간이 다 됐다. */
  | 'timeout'
  /** 연결·DNS·TLS 실패 — 응답 자체가 없다. */
  | 'network'
  /** 401 — 자격증명·로그온. */
  | 'auth'
  /** 403 — 권한 거부(잠금·CSRF가 아닌). */
  | 'forbidden'
  /** CSRF 토큰이 재취득 후에도 거부됐다. */
  | 'csrf'
  /** 404 — 대상 없음. */
  | 'not-found'
  /** 409/423, 또는 403 + ExceptionResourceNoAccess — 다른 사용자의 잠금. */
  | 'lock-conflict'
  /** 5xx. */
  | 'server'
  /** 응답은 성공인데 기대한 모양이 아니다(예: 잠금 핸들 없음). */
  | 'protocol'
  /** 그 밖의 HTTP 실패. */
  | 'http';

/** `<exc:exception>`에서 뽑아낸 구조화된 값. */
export interface AdtExceptionPayload {
  readonly namespace?: string;
  /** `<type id="...">` — 기계 판단의 근거. */
  readonly type?: string;
  readonly message?: string;
  readonly localizedMessage?: string;
  /** `<properties><entry key="...">` 표. T100KEY-ID/NO 등. */
  readonly properties: Readonly<Record<string, string>>;
}

export interface AdtErrorInit {
  readonly kind: AdtErrorKind;
  readonly status?: number;
  readonly statusText?: string;
  readonly method?: string;
  readonly url?: string;
  readonly adt?: AdtExceptionPayload | null;
  readonly rawBody?: string;
  /** ADT 예외 XML이 없을 때 메시지에 덧붙일 설명(전송 실패 사유 등). */
  readonly detail?: string;
  readonly cause?: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function textOf(node: unknown): string | undefined {
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (node && typeof node === 'object') {
    const text = (node as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text;
    if (typeof text === 'number' || typeof text === 'boolean') return String(text);
    return '';
  }
  return undefined;
}

function attributeOf(node: unknown, attribute: string): string | undefined {
  if (node && typeof node === 'object') {
    const value = (node as Record<string, unknown>)[`@_${attribute}`];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

/**
 * ADT 오류 XML을 구조화한다. ADT 예외가 아니거나 XML이 깨졌으면 null —
 * **던지지 않는다**(오류 경로에서 다시 터지면 원인을 잃는다).
 */
export function parseAdtExceptionXml(body: string | undefined): AdtExceptionPayload | null {
  if (!body || !body.includes('<')) return null;
  if (!/<(?:[A-Za-z0-9_.-]+:)?exception[\s>]/.test(body)) return null;

  let document: Record<string, unknown>;
  try {
    document = parser.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }

  const rootKey = Object.keys(document).find((key) => /(^|:)exception$/.test(key));
  if (!rootKey) return null;
  const root = document[rootKey];
  if (!root || typeof root !== 'object') return null;
  const fields = root as Record<string, unknown>;

  const properties: Record<string, string> = {};
  const propertyRoot = fields['properties'];
  if (propertyRoot && typeof propertyRoot === 'object') {
    for (const entry of asArray((propertyRoot as Record<string, unknown>)['entry'])) {
      const key = attributeOf(entry, 'key');
      if (key === undefined) continue;
      properties[key] = textOf(entry) ?? '';
    }
  }

  return {
    namespace: attributeOf(fields['namespace'], 'id'),
    type: attributeOf(fields['type'], 'id'),
    message: textOf(fields['message']) || undefined,
    localizedMessage: textOf(fields['localizedMessage']) || undefined,
    properties,
  };
}

function classify(status: number, adt: AdtExceptionPayload | null | undefined): AdtErrorKind {
  if (status === 401) return 'auth';
  if (status === 404) return 'not-found';
  if (status === 409 || status === 423) return 'lock-conflict';
  if (status === 403) {
    // 다른 사용자의 ENQUEUE 잠금은 403 + ExceptionResourceNoAccess로 온다.
    return adt?.type && /ResourceNoAccess/i.test(adt.type) ? 'lock-conflict' : 'forbidden';
  }
  if (status >= 500) return 'server';
  return 'http';
}

function formatMessage(init: AdtErrorInit, adtMessage: string | undefined): string {
  const where = [init.method, init.url].filter(Boolean).join(' ');
  const parts = [`ADT 요청 실패${where ? `: ${where}` : ''}`];
  if (init.status !== undefined) {
    parts.push(`HTTP ${init.status}${init.statusText ? ` ${init.statusText}` : ''}`);
  }
  if (init.adt?.type) parts.push(`[${init.adt.type}]`);
  parts.push(`(${init.kind})`);
  const head = parts.join(' — ');
  return adtMessage ? `${head}: ${adtMessage}` : head;
}

export class AdtError extends Error {
  readonly kind: AdtErrorKind;
  readonly status?: number;
  readonly statusText?: string;
  readonly method?: string;
  readonly url?: string;
  readonly adtType?: string;
  readonly adtNamespace?: string;
  readonly adtMessage?: string;
  readonly adtProperties: Readonly<Record<string, string>>;
  /** 진단용 원문 응답 본문. 분류는 여기 의존하지 않는다. */
  readonly rawBody?: string;

  constructor(init: AdtErrorInit) {
    const adtMessage = init.adt?.message ?? init.adt?.localizedMessage;
    super(formatMessage(init, adtMessage ?? init.detail), { cause: init.cause });
    this.name = 'AdtError';
    this.kind = init.kind;
    this.status = init.status;
    this.statusText = init.statusText;
    this.method = init.method;
    this.url = init.url;
    this.adtType = init.adt?.type;
    this.adtNamespace = init.adt?.namespace;
    this.adtMessage = adtMessage;
    this.adtProperties = init.adt?.properties ?? {};
    this.rawBody = init.rawBody;
  }
}

export interface AdtFailedResponse {
  readonly status: number;
  readonly statusText?: string;
  readonly method?: string;
  readonly url?: string;
  readonly body?: string;
}

/**
 * 실패한 HTTP 응답 하나를 AdtError로 정규화한다.
 * `kindOverride`를 주면 상태 기반 분류를 덮어쓴다(예: CSRF 재시도 소진).
 */
export function adtErrorFromResponse(
  response: AdtFailedResponse,
  kindOverride?: AdtErrorKind,
): AdtError {
  const adt = parseAdtExceptionXml(response.body);
  return new AdtError({
    kind: kindOverride ?? classify(response.status, adt),
    status: response.status,
    statusText: response.statusText,
    method: response.method,
    url: response.url,
    adt,
    rawBody: response.body,
  });
}
