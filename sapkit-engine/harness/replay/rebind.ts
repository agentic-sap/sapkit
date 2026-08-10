/**
 * 자리표시자 되묶기 — 시퀀스 안의 **상관관계**를 살아 있는 엔진 위에서 잇는다.
 *
 * 픽스처에는 원본 토큰이 없다. 1단계가 받은 잠금 핸들은 `<<LOCK_HANDLE_1>>`로
 * 남아 있고, 2단계 인자에도 같은 자리표시자가 있다. 그 상태로 2단계를 그대로
 * 보내면 신 엔진은 존재하지 않는 핸들을 받는다 — 상관이 끊긴다.
 *
 * 그래서 재생은 **살아 있는 쪽에서 자리표시자를 다시 묶는다**:
 *
 *   ① 방금 받은 응답을 채록기의 정규화기로 정규화한다.
 *   ② 원본과 정규화 결과를 나란히 걸어 `자리표시자 → 이번 판의 원본 토큰`을 읽는다.
 *   ③ 다음 단계의 인자에서 자리표시자를 그 원본 토큰으로 되돌린다.
 *
 * ②는 정규화 **규칙을 다시 구현하지 않는다**. 규칙은 채록기 것 하나뿐이고,
 * 여기서는 그 결과를 원본과 대조해 **관찰**할 뿐이다. 규칙이 두 벌이 되는
 * 순간 대조가 의미를 잃는다.
 *
 * ## 되묶을 수 없는 자리표시자
 *
 * 인자 자체에서 처음 생긴 자리표시자(사람이 넘긴 타임스탬프 등)는 원본이
 * 픽스처 어디에도 없다. 정규화는 되돌릴 수 있는 규칙이 아니라 판정용 사상이기
 * 때문이다. 그런 자리는 **자리표시자 그대로 나가고 메모로 남는다** — 조용히
 * 넘어가지 않는다.
 */
import { findPlaceholders, isPlaceholder } from '../recorder';
import type { JsonValue } from '../recorder';

/** `자리표시자 → 이번 판의 원본 토큰`. */
export type LiveBindings = Map<string, string>;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 정규화 결과를 틀로 삼아 원본에서 각 자리의 토큰을 되읽는다.
 *
 * 틀은 `앞부분<<KIND_1>>뒷부분` 꼴이므로, 자리표시자 자리를 최소 일치 캡처로
 * 바꾼 정규식이 곧 되읽기다.
 */
function readTokensFromTemplate(raw: string, template: string, placeholders: readonly string[]): string[] | null {
  const pattern = new RegExp(
    `^${template
      .split(/<<[A-Z]+(?:_[A-Z]+)*_\d+>>/)
      .map(escapeRegExp)
      .join('([\\s\\S]+?)')}$`,
  );
  const matched = pattern.exec(raw);
  if (matched === null) return null;
  return placeholders.map((_, i) => matched[i + 1] ?? '');
}

/**
 * 원본과 정규화 결과를 나란히 걸어 대응을 배운다.
 *
 * 두 나무는 정규화가 구조를 보존하므로 모양이 같다. 처음 배운 대응이 이긴다 —
 * 같은 자리표시자가 여러 자리에 나오면 그것이 곧 상관이고, 첫 자리의 원본이
 * 그 상관의 원본이다.
 */
export function learnBindings(raw: JsonValue, normalized: JsonValue, into: LiveBindings): void {
  if (typeof raw === 'string' && typeof normalized === 'string') {
    if (isPlaceholder(normalized)) {
      if (!into.has(normalized)) into.set(normalized, raw);
      return;
    }
    const found = findPlaceholders(normalized);
    if (found.length === 0) return;
    const tokens = readTokensFromTemplate(raw, normalized, found);
    if (tokens === null) return;
    found.forEach((placeholder, i) => {
      const token = tokens[i];
      if (token !== undefined && token !== '' && !into.has(placeholder)) into.set(placeholder, token);
    });
    return;
  }
  if (Array.isArray(raw) && Array.isArray(normalized)) {
    const length = Math.min(raw.length, normalized.length);
    for (let i = 0; i < length; i++) learnBindings(raw[i] as JsonValue, normalized[i] as JsonValue, into);
    return;
  }
  if (
    raw !== null &&
    normalized !== null &&
    typeof raw === 'object' &&
    typeof normalized === 'object' &&
    !Array.isArray(raw) &&
    !Array.isArray(normalized)
  ) {
    for (const [key, value] of Object.entries(raw)) {
      const counterpart = (normalized as { [key: string]: JsonValue })[key];
      if (counterpart !== undefined) learnBindings(value, counterpart, into);
    }
  }
}

/**
 * 자리표시자를 이번 판의 원본 토큰으로 되돌린다.
 *
 * 묶이지 않은 자리표시자는 **그대로 두고** `unbound`에 담는다.
 */
export function substitutePlaceholders(value: JsonValue, bindings: LiveBindings, unbound: Set<string>): JsonValue {
  if (typeof value === 'string') {
    const found = findPlaceholders(value);
    if (found.length === 0) return value;
    let out = value;
    for (const placeholder of found) {
      const token = bindings.get(placeholder);
      if (token === undefined) {
        unbound.add(placeholder);
        continue;
      }
      out = out.split(placeholder).join(token);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => substitutePlaceholders(item, bindings, unbound));
  if (value !== null && typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) out[key] = substitutePlaceholders(item, bindings, unbound);
    return out;
  }
  return value;
}
