// local_variable_names — 지역 선언의 이름 규약.
//
// FORM·METHOD·FUNCTION 블록 **안에서만** 본다. 무늬가 비어 있는 종류는 아예 검사하지
// 않는다 — analyze 표면은 세 무늬가 모두 비어 있어 등록만 되고 한 건도 내지 않는다
// (구 구현 실측 · `DIVERGENCES.md` D-002의 「알려진 무동작 승계」).
//
// 승계한 이상 동작 둘 — 고치면 기준과 갈린다:
//
// - FIELD-SYMBOLS의 이름을 **세 번째 토큰**에서 읽는다. 그런데 `FIELD-SYMBOLS`는
//   `FIELD` · `-` · `SYMBOLS` 세 토큰으로 쪼개지므로 그 자리는 늘 리터럴 `SYMBOLS`다.
//   규약에 맞는 이름을 써도 반드시 울리고, 판정 자리도 이름이 아니라 `SYMBOLS`다.
// - 데이터 무늬가 `lo_` 접두를 받지 않는다. 정작 이 규칙의 제안 문구는 `lo_`를 권한다.

import type { AbapFile, StatementType } from '../core';
import type { Finding, Rule } from './types';

const KEY = 'local_variable_names';

/** 지역 범위를 여는 문장 유형. */
const OPENS_LOCAL_SCOPE: ReadonlySet<StatementType> = new Set<StatementType>([
  'MethodImplementation',
  'Form',
  'FunctionModule',
]);

/** 지역 범위를 닫는 문장 유형. */
const CLOSES_LOCAL_SCOPE: ReadonlySet<StatementType> = new Set<StatementType>([
  'EndMethod',
  'EndForm',
  'EndFunction',
]);

/** 선언 종류별 이름 무늬. 빈 값·없는 값은 「그 종류는 검사하지 않는다」는 뜻이다. */
export interface LocalNamePatterns {
  readonly data?: string;
  readonly constant?: string;
  readonly fieldSymbol?: string;
}

/** lint·기본 구성이 쓰는 무늬 (실측). */
export const LOCAL_NAME_PATTERNS: LocalNamePatterns = {
  data: '^[Ll][VvSsTtRrCc]_\\w+$',
  constant: '^[Ll][Cc]_\\w+$',
  fieldSymbol: '^<[Ll][VvSsTtRr]_\\w+>$',
};

/** 한 선언 종류를 어떻게 볼지 — 이름이 놓인 토큰 자리와 맞춰 볼 무늬. */
interface NameCheck {
  readonly index: number;
  readonly what: string;
  readonly pattern: RegExp;
}

export function localVariableNamesRule(patterns: LocalNamePatterns = {}): Rule {
  const checks = new Map<StatementType, NameCheck>();
  addCheck(checks, 'Data', 1, 'Local variable', patterns.data);
  addCheck(checks, 'Constant', 1, 'Local constant', patterns.constant);
  addCheck(checks, 'FieldSymbol', 2, 'Field symbol', patterns.fieldSymbol);

  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];
      let inLocalScope = false;

      for (const stmt of file.getStatements()) {
        if (OPENS_LOCAL_SCOPE.has(stmt.type)) inLocalScope = true;
        else if (CLOSES_LOCAL_SCOPE.has(stmt.type)) inLocalScope = false;
        if (!inLocalScope) continue;

        const check = checks.get(stmt.type);
        if (check === undefined) continue;

        const token = stmt.tokens[check.index];
        if (token === undefined || check.pattern.test(token.str)) continue;

        findings.push({
          rule: KEY,
          row: token.row,
          col: token.col,
          severity: 'Warning',
          message: `${check.what} name "${token.str}" is outside the agreed pattern ${check.pattern.source}`,
        });
      }

      return findings;
    },
  };
}

/**
 * 빈 무늬는 아예 등록하지 않는다 — 그 종류를 검사하지 않는다는 뜻이다.
 *
 * 대소문자를 가리지 않는 것은 구 구현 승계인데, 그쪽의 대소문자 무시는 **유니코드
 * 겹침**까지 본다 — 긴 s(U+017F)가 `[Ss]`에도 `\w`에도 걸린다. JS는 `u` 깃발을 함께
 * 줘야 같은 겹침을 쓰므로 둘을 같이 준다. 실측(같은 이름 7종을 양쪽에 돌려 대조):
 * `u`가 없으면 `lc_fooſ` 같은 이름에서 구 검사기는 조용한데 이쪽만 울린다.
 */
function addCheck(
  into: Map<StatementType, NameCheck>,
  type: StatementType,
  index: number,
  what: string,
  pattern: string | undefined,
): void {
  if (pattern !== undefined && pattern !== '') into.set(type, { index, what, pattern: new RegExp(pattern, 'iu') });
}
