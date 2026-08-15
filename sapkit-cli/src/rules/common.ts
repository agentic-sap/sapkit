// 규칙 13종이 함께 쓰는 도우미.
//
// 구 검사기는 Go 문자열 위에서 돌았고, 그 두 성질이 판정에 그대로 실린다:
//
// 1. **문자열 색인이 바이트 단위다.** 행 길이도 열도 UTF-8 바이트로 재야 같은 값이
//    나온다 (한글 한 글자는 열을 3칸 민다). 어휘 분석기가 토큰 열을 그렇게 매기므로
//    원문 행을 직접 훑는 규칙도 같은 자로 재야 두 값이 한 좌표계에 놓인다.
// 2. **대소문자 올리기가 낱개 1:1 사상이다.** Go의 `strings.ToUpper`는 룬마다
//    `unicode.ToUpper`를 적용할 뿐이라 한 글자가 여러 글자로 늘어나지 않는다
//    (ß→SS 아님). JS `toUpperCase()`를 통째로 쓰면 그 자리에서 갈린다.
//    코어 분류기가 같은 이유로 같은 판단을 했지만 그 도우미를 내보내지 않고,
//    코어는 이 판의 수정 범위 밖이라 여기 따로 둔다.

import type { Statement } from '../core';

/** 바이트 하나가 글자 하나인 시점의 문자열. 색인과 길이가 Go 문자열과 같아진다. */
export function toByteView(s: string): string {
  return Buffer.from(s, 'utf8').toString('latin1');
}

/** UTF-8 바이트 길이. */
export function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Go `strings.ToUpper` 대응 — 낱개 1:1 사상만 쓴다. */
export function upperSimple(s: string): string {
  return mapRunes(s, (ch) => ch.toUpperCase());
}

/** Go `strings.ToLower` 대응 — 낱개 1:1 사상만 쓴다. */
export function lowerSimple(s: string): string {
  return mapRunes(s, (ch) => ch.toLowerCase());
}

/**
 * 규칙 대부분이 건드리지 않는 문장인가 — 주석·빈 문장·토큰 없는 문장.
 *
 * 이 셋을 걸러 두면 뒤따르는 `tokens[0]` 읽기가 늘 성립한다.
 */
export function isCodeStatement(stmt: Statement): boolean {
  return stmt.type !== 'Comment' && stmt.type !== 'Empty' && stmt.tokens.length > 0;
}

function mapRunes(s: string, transform: (ch: string) => string): string {
  // ASCII는 어떤 글자도 늘어나지 않으므로 통째로 넘긴다.
  if (isAscii(s)) return transform(s);

  let out = '';
  for (const ch of s) {
    const mapped = transform(ch);
    out += [...mapped].length === 1 ? mapped : ch;
  }
  return out;
}

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}
