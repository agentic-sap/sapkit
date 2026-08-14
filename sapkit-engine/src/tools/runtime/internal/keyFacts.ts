/**
 * 덤프 payload에서 **핵심 몇 줄만** 긁어내는 요약기.
 *
 * 구 엔진은 이 함수를 두 핸들러에 **글자 그대로 복사해** 두었다
 * (`handleRuntimeGetDumpById.ts:44-101` · `handleRuntimeAnalyzeDump.ts:41-98` —
 * 두 사본은 완전히 같다). 신 엔진에서는 한 벌만 두고 둘이 함께 쓴다. 결과가
 * 같으므로 등재할 차이가 아니다.
 *
 * 판단 규칙 셋을 그대로 옮겼다:
 *  - **먼저 찾은 값이 이긴다** — 이미 채운 키는 덮어쓰지 않는다.
 *  - **스칼라만 담는다** — 문자열·숫자·불리언만. 객체·배열은 값이 아니라 길이다.
 *  - **깊이 8 · 키 20에서 멈춘다** — 덤프는 깊고 넓다. 요약이 payload만큼
 *    커지면 요약이 아니다.
 *
 * 관심 키 목록에 `shorttext`와 `shortText`가 **둘 다** 들어 있는 것도 구 그대로다.
 * 비교가 소문자 정규화라 사실상 중복이지만, 목록은 실측을 옮기는 자리이지
 * 정리하는 자리가 아니다.
 */

const INTERESTING_KEYS = [
  'title',
  'shorttext',
  'shortText',
  'category',
  'exception',
  'program',
  'include',
  'line',
  'user',
  'date',
  'time',
  'host',
  'application',
  'component',
  'client',
] as const;

const MAX_DEPTH = 8;
const MAX_FACTS = 20;

export function collectKeyFacts(
  value: unknown,
  target: Record<string, unknown>,
  depth = 0,
): void {
  if (!value || depth > MAX_DEPTH || Object.keys(target).length >= MAX_FACTS) return;

  if (Array.isArray(value)) {
    for (const item of value) collectKeyFacts(item, target, depth + 1);
    return;
  }

  if (typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    const interesting = INTERESTING_KEYS.some(
      (candidate) => normalized === candidate.toLowerCase(),
    );

    if (
      interesting &&
      target[key] === undefined &&
      (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean')
    ) {
      target[key] = nested;
    }

    collectKeyFacts(nested, target, depth + 1);
  }
}

/** 빈 표에서 시작해 핵심 몇 줄을 긁어 돌려준다. */
export function keyFactsOf(payload: unknown): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  collectKeyFacts(payload, facts);
  return facts;
}
