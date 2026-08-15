// catch_cx_root — 너무 넓은 예외 클래스를 잡는 CATCH.
//
// `CATCH`로 시작하는 문장에서 마침표·쉼표를 만날 때까지 예외 이름을 훑고, 넓은
// 클래스가 처음 나온 자리에서 한 건만 낸다.

import { TokenType } from '../core';
import type { AbapFile } from '../core';
import { isCodeStatement, upperSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'catch_cx_root';

/** 잡으면 무엇이 터졌는지 알 수 없게 되는 뿌리 쪽 클래스. */
const TOO_BROAD: ReadonlySet<string> = new Set([
  'CX_ROOT',
  'CX_STATIC_CHECK',
  'CX_DYNAMIC_CHECK',
  'CX_NO_CHECK',
]);

export function catchCxRootRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;

        const first = stmt.tokens[0];
        if (first === undefined || upperSimple(first.str) !== 'CATCH') continue;

        for (let i = 1; i < stmt.tokens.length; i += 1) {
          const token = stmt.tokens[i];
          if (token === undefined || token.type === TokenType.Punctuation) break;
          if (!TOO_BROAD.has(upperSimple(token.str))) continue;

          findings.push({
            rule: KEY,
            row: token.row,
            col: token.col,
            severity: 'Warning',
            message: `${token.str} swallows everything — catch the exception you can actually handle`,
          });
          break;
        }
      }

      return findings;
    },
  };
}
