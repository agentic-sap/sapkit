// preferred_compare_operator — 조건문 안의 낡은 비교 연산자.
//
// 조건문 세 유형(If·ElseIf·While) 안의 토큰만 본다. 구 구현은 여기에 `Check`도 적어
// 두었지만 분류기가 그 유형을 만드는 일이 없어 **사문**이다(코퍼스 1,050문장 중 0건 ·
// `CHECK lv_a EQ 1.`은 `Move`로 분류된다). 사문을 살리면 판정이 바뀌므로 살리지
// 않는다 — 그래서 CHECK 문의 EQ는 여기서 잡히지 않는다.
//
// 낡은 연산자 7종은 세 표면이 모두 같게 등록한다(실측 — 나열 순서만 달랐다).

import type { AbapFile, StatementType } from '../core';
import { upperSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'preferred_compare_operator';

const CONDITIONALS: ReadonlySet<StatementType> = new Set<StatementType>(['If', 'ElseIf', 'While']);

/** 낡은 연산자 → 권하는 현대 연산자. */
const MODERN_FORM: ReadonlyMap<string, string> = new Map([
  ['EQ', '='],
  ['NE', '<>'],
  ['><', '<>'],
  ['GT', '>'],
  ['LT', '<'],
  ['GE', '>='],
  ['LE', '<='],
]);

export function preferredCompareOperatorRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      for (const stmt of file.getStatements()) {
        if (!CONDITIONALS.has(stmt.type)) continue;

        for (const token of stmt.tokens) {
          const modern = MODERN_FORM.get(upperSimple(token.str));
          if (modern === undefined) continue;

          findings.push({
            rule: KEY,
            row: token.row,
            col: token.col,
            severity: 'Error',
            message: `Write ${modern} rather than ${token.str}`,
          });
        }
      }

      return findings;
    },
  };
}
