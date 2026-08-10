/**
 * 오류 응답의 대조 규칙 — 장부 **D13**.
 *
 * > 오류 응답은 **오류 종류(kind)와 SAP 유래 텍스트로 엄격 대조**하고, 엔진이
 * > 스스로 지어내는 **진단 산문은 비결정 토큰과 같은 취급으로 정규화**한다.
 * > **이 정규화가 적용된 건은 커버리지 표에 반드시 드러나야 한다** — 조용히
 * > 넘어가면 오류 경로 전체가 무증거가 된다.
 *
 * 그래서 오류 문구를 통째로 무시하지 않는다. 문구를 넷으로 쪼갠다:
 *
 * | 조각 | 대조 |
 * |---|---|
 * | `sapText` — SAP이 돌려준 메시지, 구 엔진이 조립해 실어 보내던 계약성 문구 | **엄격** |
 * | `codes` — 오류 종류 표식 (`ERR_*` · `[AdtType]` · `(kind)` · JSON-RPC 코드) | **엄격** |
 * | `statuses` — HTTP 상태 | **엄격** |
 * | `prose` — 나머지, 즉 엔진이 스스로 지어낸 진단 산문 | 정규화(느슨) |
 *
 * ## 엄격 신호가 하나도 없으면 통과시키지 않는다
 *
 * "산문**만** 다르다"는 말은 엄격한 부분이 있고 그것이 같을 때만 성립한다.
 * 양쪽 다 코드도 상태도 SAP 텍스트도 없는데 문구가 다르면, 그것은 "산문만
 * 다른 것"이 아니라 **아무것도 대조하지 못한 것**이다. 통과시키면 오류 경로
 * 전체가 무증거가 된다 — D13이 경계한 바로 그 상태다. 그래서 `error-prose`로
 * 떨어뜨리고, 그것이 의도된 차이라면 장부에 등재하게 한다(예: D18).
 *
 * ## 조각을 뽑는 순서가 곧 우선순위다
 *
 * `sapText`를 **먼저** 뽑아 그 자리를 지운다. 그래야 계약성 문구 안의
 * `subrc=4` 같은 값이 코드 규칙에 두 번 잡히지 않고, 그 문구가 달라졌을 때
 * 사유가 `error-sap-text` 하나로 떨어진다.
 */

/** 문구에서 뽑아낸, 대조 가능한 조각들. */
export interface ErrorSignature {
  /** 오류 종류 표식. 정렬·중복 제거돼 있다. */
  readonly codes: readonly string[];
  readonly statuses: readonly number[];
  /** SAP 유래 텍스트 — **글자 그대로** 보존한다. */
  readonly sapText: readonly string[];
  /** 나머지(엔진 자체 저작 진단 산문). 공백만 정규화한다. */
  readonly prose: string;
  /** 엄격히 대조할 신호가 하나라도 있는가. */
  readonly strictSignal: boolean;
}

export interface ErrorSignatureRules {
  /**
   * SAP 유래 텍스트를 잡는 규칙. **덧붙이는** 목록이며 기본 규칙을 대체하지
   * 않는다. 캡처 그룹 1이 있으면 그 값을, 없으면 매치 전체를 보존한다.
   */
  readonly sapText?: readonly RegExp[];
  /** 오류 종류 표식을 잡는 규칙. 위와 같은 규약. */
  readonly codes?: readonly RegExp[];
}

/**
 * SAP 유래 텍스트의 기본 규칙.
 *
 * 장부 D13이 이름을 든 두 갈래다:
 *  ① 구 엔진이 조립해 도구 응답에 실어 보내던 계약성 문구
 *     (`ZMCP_ADT_DISPATCH error (action=…, subrc=…): …`).
 *  ② SAP이 돌려준 메시지 텍스트 — ADT 예외 XML의 `<message>`.
 *
 * 계약성 문구 갈래를 늘려야 하면 여기 한 줄을 더한다. 규칙이 좁아 놓치는 쪽이
 * 넓어 삼키는 쪽보다 낫다 — 놓치면 `error-prose`로 떨어져 **눈에 띈다**.
 */
const DEFAULT_SAP_TEXT_RULES: readonly RegExp[] = [
  /Z[A-Z0-9_]+ error \([^)]*\)(?::[^\n]*)?/g,
  /<message[^>]*>([^<]*)<\/message>/g,
];

/**
 * 오류 종류 표식의 기본 규칙.
 *
 * - `ERR_*` — 신·구 엔진이 도구 응답에 싣는 계약 코드.
 * - `[AdtType]` — ADT 예외 XML의 `type/@id`(`[ExceptionResourceNoAccess]`).
 * - `(kind)` — 계층이 붙이는 분류 표식(`(lock-conflict)` · `(csrf)` · `(config)`).
 *   소문자와 하이픈만 허용해 `(action=…, subrc=…)` 같은 자리를 삼키지 않는다.
 * - JSON-RPC 오류 코드.
 *
 * 오탐이 나면 대조가 **더 엄격해질 뿐** 느슨해지지 않는다. 그래서 이 방향의
 * 오탐은 안전하다.
 */
const DEFAULT_CODE_RULES: readonly RegExp[] = [
  /\bERR_[A-Z][A-Z0-9_]*\b/g,
  /\[([A-Za-z][A-Za-z0-9_.]*)\]/g,
  /\(([a-z][a-z-]*[a-z])\)/g,
  /(-32\d{3})\b/g,
];

const STATUS_RULES: readonly RegExp[] = [/\bHTTP\s+(\d{3})\b/g, /\bstatus(?:\s+code)?\s*[:=]?\s*(\d{3})\b/gi];

interface Extraction {
  readonly values: string[];
  readonly rest: string;
}

/** 규칙을 순서대로 적용해 값을 모으고, 매치 자리는 공백으로 지운다. */
function extract(text: string, rules: readonly RegExp[]): Extraction {
  const values: string[] = [];
  let rest = text;
  for (const rule of rules) {
    rest = rest.replace(new RegExp(rule.source, rule.flags), (...args: unknown[]): string => {
      const whole = String(args[0]);
      const captured = typeof args[1] === 'string' ? args[1] : undefined;
      values.push(captured ?? whole);
      return ' ';
    });
  }
  return { values, rest };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v.trim() !== ''))].sort();
}

/** 오류 문구 하나를 대조 가능한 조각으로 쪼갠다. */
export function errorSignature(text: string, rules: ErrorSignatureRules = {}): ErrorSignature {
  const sap = extract(text, [...DEFAULT_SAP_TEXT_RULES, ...(rules.sapText ?? [])]);
  const code = extract(sap.rest, [...DEFAULT_CODE_RULES, ...(rules.codes ?? [])]);
  const status = extract(code.rest, STATUS_RULES);

  const codes = uniqueSorted(code.values);
  const statuses = [...new Set(status.values.map((v) => Number(v)))].sort((a, b) => a - b);
  const sapText = uniqueSorted(sap.values);

  return {
    codes,
    statuses,
    sapText,
    prose: status.rest.replace(/\s+/g, ' ').trim(),
    strictSignal: codes.length > 0 || statuses.length > 0 || sapText.length > 0,
  };
}

export interface ErrorSignatureComparison {
  readonly ok: boolean;
  /** 실패 사유. 통과면 null. */
  readonly reason: 'error-kind' | 'error-sap-text' | 'error-prose' | null;
  /** 산문만 달라 느슨하게 판정했는가 — 커버리지 표가 세는 값. */
  readonly proseNormalized: boolean;
  /** 엄격히 대조된 신호가 양쪽에 하나라도 있었는가. */
  readonly strictSignal: boolean;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** 두 서명을 D13 규칙으로 대조한다. */
export function compareErrorSignatures(
  recorded: ErrorSignature,
  actual: ErrorSignature,
): ErrorSignatureComparison {
  const strictSignal = recorded.strictSignal || actual.strictSignal;

  if (!sameStrings(recorded.codes, actual.codes) || !sameNumbers(recorded.statuses, actual.statuses)) {
    return { ok: false, reason: 'error-kind', proseNormalized: false, strictSignal };
  }
  if (!sameStrings(recorded.sapText, actual.sapText)) {
    return { ok: false, reason: 'error-sap-text', proseNormalized: false, strictSignal };
  }
  if (recorded.prose === actual.prose) {
    return { ok: true, reason: null, proseNormalized: false, strictSignal };
  }
  if (!strictSignal) {
    // 대조한 것이 아무것도 없다. 통과시키면 오류 경로가 통째로 무증거가 된다.
    return { ok: false, reason: 'error-prose', proseNormalized: false, strictSignal };
  }
  return { ok: true, reason: null, proseNormalized: true, strictSignal };
}

/** 사람이 읽을 서명 요약. 보고서에 싣기 전에 비밀 검사를 한 번 더 지난다. */
export function summarizeSignature(signature: ErrorSignature): string {
  return [
    `kind=[${signature.codes.join(' ')}]`,
    `status=[${signature.statuses.join(' ')}]`,
    `sap=[${signature.sapText.join(' | ')}]`,
  ].join(' ');
}
