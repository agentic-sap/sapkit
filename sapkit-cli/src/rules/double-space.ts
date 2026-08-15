// double_space — 코드부에 공백이 겹쳤다.
//
// 원문 행을 바이트로 훑는다. 첫 글자가 `*`나 `"`인 주석행은 통째로 건너뛰고, 그
// 밖의 행은 후행 주석을 여는 따옴표 **앞까지만** 코드부로 본다. 그래서 주석 바로
// 앞에 놓인 겹공백은 코드부 안이라 잡힌다 — 구 구현 승계다.
//
// 들여쓰기는 세지 않는다. 한 행에서 한 건만 낸다.

import type { AbapFile } from '../core';
import { toByteView } from './common';
import type { Finding, Rule } from './types';

const KEY = 'double_space';

/**
 * 주석행을 가려낼 때 앞에서 지나칠 글자 — Go `unicode.IsSpace`와 같은 집합이다
 * (코어 어휘 분석기가 토큰을 다듬을 때 쓰는 것과 같은 목록).
 * ASCII 6종으로 갈음하면 안 된다: NBSP나 전각 공백으로 들여쓴 주석행이 갈린다.
 */
const GO_SPACE: ReadonlySet<number> = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

const TRAILING_BLANK = /[ \t\r]+$/;

export function doubleSpaceRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      file.getRawRows().forEach((row, index) => {
        if (isCommentRow(row)) return;

        const col = firstDoubleSpace(codePart(toByteView(row)));
        if (col === null) return;

        findings.push({
          rule: KEY,
          row: index + 1,
          col,
          severity: 'Warning',
          message: 'Collapse the repeated space',
        });
      });

      return findings;
    },
  };
}

/** 공백을 지나 처음 나오는 글자가 주석 표시인가. */
function isCommentRow(row: string): boolean {
  for (const ch of row) {
    const code = ch.codePointAt(0);
    if (code !== undefined && GO_SPACE.has(code)) continue;
    return ch === '*' || ch === '"';
  }
  return false;
}

/** 행 끝 여백을 떼고, 후행 주석이 있으면 그 앞까지 자른다. */
function codePart(bytes: string): string {
  const trimmed = bytes.replace(TRAILING_BLANK, '');
  const quote = trimmed.indexOf('"');
  return quote > 0 ? trimmed.slice(0, quote) : trimmed;
}

/** 들여쓰기를 지난 뒤 처음 겹치는 공백의 열. 없으면 null. */
function firstDoubleSpace(code: string): number | null {
  let indentDone = false;

  for (let i = 0; i + 1 < code.length; i += 1) {
    const ch = code.charAt(i);
    if (!indentDone) {
      // 들여쓰기를 끝낸 그 글자 자체는 검사에서 빠진다 (구 구현 승계).
      indentDone = ch !== ' ' && ch !== '\t';
      continue;
    }
    if (ch === ' ' && code.charAt(i + 1) === ' ') return i + 1;
  }

  return null;
}
