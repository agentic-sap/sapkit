// max_one_statement — 한 행에 문장이 둘 이상.
//
// 문장이 **끝난** 행을 적어 두고, 뒤따르는 문장이 그런 행에서 **시작하면** 잡는다.
// 그래서 여러 행에 걸친 문장은 마지막 행에만 끝을 남긴다.
//
// 콜론 체인은 통째로 건너뛴다 — 한 논리 묶음으로 보기 때문이다. 주석·빈 문장과
// 네이티브 SQL 본문도 세지 않는다.

import type { AbapFile, StatementType } from '../core';
import type { Finding, Rule } from './types';

const KEY = 'max_one_statement';

const NOT_COUNTED: ReadonlySet<StatementType> = new Set<StatementType>(['Comment', 'Empty', 'NativeSQL']);

export function maxOneStatementRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];
      const rowsWithEnd = new Set<number>();

      for (const stmt of file.getStatements()) {
        if (NOT_COUNTED.has(stmt.type) || stmt.colon !== null) continue;

        const first = stmt.tokens[0];
        const last = stmt.tokens[stmt.tokens.length - 1];
        if (first === undefined || last === undefined) continue;

        if (rowsWithEnd.has(first.row)) {
          findings.push({
            rule: KEY,
            row: first.row,
            col: first.col,
            severity: 'Error',
            message: 'Give this statement a line of its own',
          });
        }
        rowsWithEnd.add(last.row);
      }

      return findings;
    },
  };
}
