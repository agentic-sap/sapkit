/**
 * 구조 대조 — **어디가 왜 다른지**를 JSON 포인터로 짚는다.
 *
 * 값은 이미 정규화를 지난 뒤에만 여기로 온다. 그래서 여기서는 비결정 토큰을
 * 다시 다루지 않는다 — 정규화 규칙이 판정 쪽에서 갈라지면 대조가 의미를 잃는다.
 *
 * ## 보고서가 새면 안 된다
 *
 * 픽스처 쪽(`expected`)은 마스킹 검사기를 이미 통과한 값이라 그대로 실을 수
 * 있다. 신 엔진 쪽(`actual`)은 **그렇지 않다** — 방금 살아 있는 시스템에서 온
 * 값이다. 그래서 실기 전에 채록기의 `scanForSecrets`를 한 번 지나고, 걸리면
 * 규칙 id만 남긴 문구로 대체한다. 여기서도 오탐이 누락보다 낫다.
 */
import { scanForSecrets } from '../recorder';
import type { JsonValue } from '../recorder';
import type { Difference, DifferenceReason } from './types';

/** 값을 문자열로 줄인 길이 상한. 보고서가 응답 전문을 실어 나르지 않게 한다. */
export const DEFAULT_MAX_VALUE_CHARS = 200;

/**
 * 실데이터 2종. 마스킹 검사기가 이 두 도구의 응답만 **text 콘텐츠 안까지**
 * 들여다본다(`harness/recorder/masking.ts`의 `ROW_DATA_TOOLS`). 그 상수는
 * 내보내지지 않으므로 여기서 같은 이름을 다시 적는다 — 늘어나면 두 곳을 함께
 * 고쳐야 한다.
 */
const ROW_DATA_TOOLS: ReadonlySet<string> = new Set(['GetTableContents', 'GetSqlQuery']);

export interface RenderOptions {
  readonly maxValueChars?: number;
  /** 이 값이 실데이터 도구의 것인가. 마스킹 판정의 폭이 달라진다. */
  readonly tool?: string;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…(${text.length}자)`;
}

/** 픽스처 쪽 값 — 이미 마스킹을 통과했으므로 자르기만 한다. */
export function renderExpected(value: JsonValue | undefined, options: RenderOptions = {}): string {
  if (value === undefined) return '(없음)';
  return truncate(JSON.stringify(value), options.maxValueChars ?? DEFAULT_MAX_VALUE_CHARS);
}

/**
 * 신 엔진 쪽 값 — **비밀 검사를 지나야 실린다.**
 *
 * 걸리면 값을 통째로 버리고 규칙 id만 남긴다. 무엇이 걸렸는지는 남기되 걸린
 * 원문은 어디에도 남기지 않는다(채록기 마스킹 보고서와 같은 규약).
 */
export function renderActual(value: JsonValue | undefined, options: RenderOptions = {}): string {
  if (value === undefined) return '(없음)';
  const violations = scanForSecrets(value, '', { rowDataTool: ROW_DATA_TOOLS.has(options.tool ?? '') });
  if (violations.length > 0) {
    const rules = [...new Set(violations.map((v) => v.ruleId))].sort().join(', ');
    return `<<REDACTED: ${rules}>> — 신 엔진 응답에 비밀로 보이는 값이 있어 보고서에 싣지 않는다.`;
  }
  return truncate(JSON.stringify(value), options.maxValueChars ?? DEFAULT_MAX_VALUE_CHARS);
}

function pointerEscape(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function typeOf(value: JsonValue): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface DiffOptions extends RenderOptions {
  /** 시작 포인터. 기본은 루트(`''`). */
  readonly basePath?: string;
}

/**
 * 두 JSON 값을 견준다.
 *
 * 배열은 **위치로** 견준다 — 응답 안의 순서는 구 엔진의 계약이고, 정렬해서
 * 비교하면 순서가 바뀐 회귀를 놓친다.
 */
export function diffJson(expected: JsonValue, actual: JsonValue, options: DiffOptions = {}): Difference[] {
  const out: Difference[] = [];
  const walk = (a: JsonValue, b: JsonValue, path: string): void => {
    if (typeOf(a) !== typeOf(b)) {
      out.push(entry(path, 'type', a, b, options));
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const length = Math.max(a.length, b.length);
      for (let i = 0; i < length; i++) {
        const child = `${path}/${i}`;
        if (i >= a.length) out.push(entry(child, 'extra', undefined, b[i], options));
        else if (i >= b.length) out.push(entry(child, 'missing', a[i], undefined, options));
        else walk(a[i] as JsonValue, b[i] as JsonValue, child);
      }
      return;
    }
    if (isObject(a) && isObject(b)) {
      for (const key of Object.keys(a)) {
        const child = `${path}/${pointerEscape(key)}`;
        if (!(key in b)) out.push(entry(child, 'missing', a[key], undefined, options));
        else walk(a[key] as JsonValue, b[key] as JsonValue, child);
      }
      for (const key of Object.keys(b)) {
        if (key in a) continue;
        out.push(entry(`${path}/${pointerEscape(key)}`, 'extra', undefined, b[key], options));
      }
      return;
    }
    if (a !== b) out.push(entry(path, 'value', a, b, options));
  };
  walk(expected, actual, options.basePath ?? '');
  return out;
}

function entry(
  path: string,
  reason: DifferenceReason,
  expected: JsonValue | undefined,
  actual: JsonValue | undefined,
  options: RenderOptions,
): Difference {
  return {
    path,
    reason,
    expected: renderExpected(expected, options),
    actual: renderActual(actual, options),
  };
}

/** 사유·경로·양쪽 값을 한 줄로. 보고에 그대로 실을 수 있다. */
export function formatDifference(difference: Difference): string {
  return `${difference.path} [${difference.reason}] 기대=${difference.expected} 실제=${difference.actual}`;
}
