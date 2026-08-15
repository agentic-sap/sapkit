// empty_statement — 내용 없이 마침표만 선 문장.
//
// 문장 분할기가 이미 `Empty`로 표시해 둔 문장만 보면 된다.

import type { AbapFile } from '../core';
import type { Finding, Rule } from './types';

const KEY = 'empty_statement';

export function emptyStatementRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      for (const stmt of file.getStatements()) {
        if (stmt.type !== 'Empty') continue;

        const token = stmt.tokens[0];
        if (token === undefined) continue;

        findings.push({
          rule: KEY,
          row: token.row,
          col: token.col,
          severity: 'Error',
          message: 'Stray period — this statement carries nothing',
        });
      }

      return findings;
    },
  };
}
