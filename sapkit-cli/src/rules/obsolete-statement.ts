// obsolete_statement — 낡은 계산·대입 구문.
//
// 문장의 **첫 토큰만** 본다. 그래서 `MOVE-CORRESPONDING`도 `MOVE`로 잡힌다.
//
// 구 구현은 일곱 낱말을 낱낱이 켜고 끌 수 있었지만, 실제 세 표면 모두 여섯은 켬이고
// `REFRESH`만 갈린다(lint·기본 구성 켬 / analyze 끔). 그래서 갈리는 한 칸만 남겼다.

import type { AbapFile } from '../core';
import { isCodeStatement, upperSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'obsolete_statement';

/** 표면과 무관하게 늘 낡은 것으로 보는 여섯 낱말 → 권하는 현대 표현. */
const ALWAYS_OBSOLETE: ReadonlyMap<string, string> = new Map([
  ['COMPUTE', 'assign directly'],
  ['ADD', 'use the += operator'],
  ['SUBTRACT', 'use the -= operator'],
  ['MULTIPLY', 'use the *= operator'],
  ['DIVIDE', 'use the /= operator'],
  ['MOVE', 'assign directly'],
]);

const REFRESH_ADVICE = 'use CLEAR';

export interface ObsoleteStatementOptions {
  /** `REFRESH`도 낡은 구문으로 볼 것인가 — 표면마다 갈리는 유일한 칸이다. */
  readonly refresh: boolean;
}

export function obsoleteStatementRule(options: ObsoleteStatementOptions): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;

        const token = stmt.tokens[0];
        if (token === undefined) continue;

        const word = upperSimple(token.str);
        const advice = word === 'REFRESH' && options.refresh ? REFRESH_ADVICE : ALWAYS_OBSOLETE.get(word);
        if (advice === undefined) continue;

        findings.push({
          rule: KEY,
          row: token.row,
          col: token.col,
          severity: 'Warning',
          message: `${word} is obsolete — ${advice}`,
        });
      }

      return findings;
    },
  };
}
