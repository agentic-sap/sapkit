// dynamic_call_no_try — TRY 밖에서 이름을 실행 시점에 정하는 호출.
//
// 동적으로 보는 두 모양:
//   · `CALL METHOD (…)…` — 세 번째 토큰이 여는 괄호일 때
//   · `CALL FUNCTION <문자열 리터럴이 아닌 것>` — 이름을 변수로 줄 때
//
// TRY 깊이를 함께 세어 감싼 호출은 넘어간다. 판정 자리는 문장 첫 토큰이다.

import { TokenType } from '../core';
import type { AbapFile } from '../core';
import { isCodeStatement, upperSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'dynamic_call_no_try';

export function dynamicCallNoTryRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];
      let tryDepth = 0;

      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;

        const first = stmt.tokens[0];
        if (first === undefined) continue;

        const word = upperSimple(first.str);
        if (word === 'TRY') tryDepth += 1;
        else if (word === 'ENDTRY' && tryDepth > 0) tryDepth -= 1;

        if (word !== 'CALL') continue;

        const kind = stmt.tokens[1];
        const target = stmt.tokens[2];
        if (kind === undefined) continue;

        const called = upperSimple(kind.str);
        const dynamic =
          (called === 'METHOD' && target?.str === '(') ||
          (called === 'FUNCTION' && target !== undefined && target.type !== TokenType.StringToken);
        if (!dynamic || tryDepth > 0) continue;

        findings.push({
          rule: KEY,
          row: first.row,
          col: first.col,
          severity: 'Warning',
          message: `CALL ${called} resolves its target at runtime — wrap it in TRY so a missing target does not dump`,
        });
      }

      return findings;
    },
  };
}
