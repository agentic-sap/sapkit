// commit_in_loop — 루프 안의 COMMIT WORK.
//
// 첫 토큰만 보고 루프 깊이를 세다가, 깊이가 0보다 클 때 나온 `COMMIT WORK`를 잡는다.
// 문장 유형이 아니라 첫 낱말로 세므로 `LOOP AT`·`DO`·`WHILE`이 모두 한 자로 잡힌다.

import type { AbapFile } from '../core';
import { isCodeStatement, upperSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'commit_in_loop';

const LOOP_OPENERS: ReadonlySet<string> = new Set(['LOOP', 'DO', 'WHILE']);
const LOOP_CLOSERS: ReadonlySet<string> = new Set(['ENDLOOP', 'ENDDO', 'ENDWHILE']);

export function commitInLoopRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];
      let depth = 0;

      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;

        const first = stmt.tokens[0];
        if (first === undefined) continue;

        const word = upperSimple(first.str);
        if (LOOP_OPENERS.has(word)) depth += 1;
        else if (LOOP_CLOSERS.has(word) && depth > 0) depth -= 1;

        if (depth === 0 || word !== 'COMMIT') continue;

        const second = stmt.tokens[1];
        if (second === undefined || upperSimple(second.str) !== 'WORK') continue;

        findings.push({
          rule: KEY,
          row: first.row,
          col: first.col,
          severity: 'Error',
          message: 'COMMIT WORK inside a loop breaks the unit of work into pieces',
        });
      }

      return findings;
    },
  };
}
