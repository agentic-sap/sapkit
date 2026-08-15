// colon_missing_space — 콜론 뒤에 공백이 없다.
//
// 토큰이 아니라 원문 행을 바이트로 훑는다. 그래서 **주석 안의 콜론도 잡힌다** —
// 행을 글자로만 보고 문장 구조를 보지 않기 때문이다. 건너뛰는 것은 문자열 리터럴
// (작은따옴표·백틱) 안뿐이다. 구 구현 승계다.
//
// 행 맨 끝 콜론은 뒤 글자를 볼 수 없어 잡히지 않고, 한 행에서 한 건만 낸다.
// (구 구현은 다음 글자가 줄바꿈인지도 보지만, 행은 줄바꿈으로 자른 조각이라
// 그 조건에 걸릴 글자가 없다.)

import type { AbapFile } from '../core';
import { toByteView } from './common';
import type { Finding, Rule } from './types';

const KEY = 'colon_missing_space';

export function colonMissingSpaceRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      file.getRawRows().forEach((row, index) => {
        const bytes = toByteView(row);

        for (let i = 0; i + 1 < bytes.length; i += 1) {
          if (bytes.charAt(i) !== ':' || bytes.charAt(i + 1) === ' ') continue;
          if (insideLiteral(bytes, i)) continue;

          findings.push({
            rule: KEY,
            row: index + 1,
            col: i + 1,
            severity: 'Warning',
            message: 'Put a space after the colon',
          });
          break;
        }
      });

      return findings;
    },
  };
}

/** 그 자리가 따옴표·백틱 리터럴 안인가 — 앞쪽 글자를 세어 짝을 맞춘다. */
function insideLiteral(bytes: string, position: number): boolean {
  let inQuote = false;
  let inBacktick = false;

  for (let i = 0; i < position; i += 1) {
    const ch = bytes.charAt(i);
    if (ch === "'" && !inBacktick) inQuote = !inQuote;
    else if (ch === '`' && !inQuote) inBacktick = !inBacktick;
  }

  return inQuote || inBacktick;
}
