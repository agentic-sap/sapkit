// 문장 분할 — 토큰 열을 문장으로 끊는다.
//
// 끊는 자리는 셋이다: 마침표(문장 끝), 콜론(체이닝 시작), 쉼표(체이닝 중 다음 조각).
// 주석 토큰은 어디서 나오든 그 자리에서 자기 문장이 되고, 체인 한가운데 끼어들어도
// 체인을 끊지 않는다.

import { TokenType } from './token';
import type { Token } from './token';
import type { StatementType } from './statement-types';

/** 문장 하나. `type`은 분류기가 마지막에 확정한다. */
export interface Statement {
  /** 프래그마를 걷어낸 문장 토큰. 체인 문장이면 접두부가 앞에 복제돼 있다. */
  readonly tokens: readonly Token[];
  /** 문장에서 걷어낸 `##...` 프래그마. */
  readonly pragmas: readonly Token[];
  type: StatementType;
  /** 체이닝으로 만들어진 문장이면 그 콜론 토큰. */
  readonly colon: Token | null;
}

/** ABAP 키워드용 ASCII 전용 대문자화 (로케일에 흔들리지 않게 한다). */
export function asciiUpper(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 97 && code <= 122 ? String.fromCharCode(code - 32) : s.charAt(i);
  }
  return out;
}

/** 문장 토큰을 공백 하나로 이어붙인다. */
export function concatTokens(stmt: Statement): string {
  return stmt.tokens.map((t) => t.str).join(' ');
}

/** 첫 토큰을 대문자로. 토큰이 없으면 빈 문자열. */
export function firstTokenStr(stmt: Statement): string {
  const first = stmt.tokens[0];
  return first === undefined ? '' : asciiUpper(first.str);
}

/**
 * 토큰 열을 문장으로 끊는다.
 *
 * 콜론 체이닝은 `DATA: a TYPE i, b TYPE string.`을 접두부 `DATA`를 공유하는 문장
 * 2개로 편다. 접두부는 각 조각 앞에 복제되고, 콜론 토큰 자체는 문장 토큰에서 빠져
 * `colon`에만 남는다.
 */
export function splitStatements(tokens: readonly Token[]): Statement[] {
  const statements: Statement[] = [];
  /** 지금 쌓는 중인 토큰. */
  let pending: Token[] = [];
  /** 체인 접두부 (콜론 앞에 있던 것). */
  let prefix: Token[] = [];
  let colon: Token | null = null;

  for (const token of tokens) {
    if (token.type === TokenType.Comment) {
      statements.push({ tokens: [token], pragmas: [], type: 'Comment', colon: null });
      continue;
    }

    pending.push(token);

    if (token.str === '.') {
      statements.push(buildStatement(prefix, pending, colon));
      pending = [];
      prefix = [];
      colon = null;
    } else if (token.str === ',') {
      // 체인 밖의 쉼표(인자 구분 등)는 문장을 끊지 않는다.
      if (prefix.length > 0) {
        statements.push(buildStatement(prefix, pending, colon));
        pending = [];
      }
    } else if (token.str === ':') {
      pending.pop();
      if (colon === null) {
        colon = token;
        prefix = pending;
        pending = [];
      }
      // 두 번째 이후의 콜론은 그냥 버린다.
    }
  }

  if (pending.length > 0) {
    statements.push(buildStatement(prefix, pending, colon));
  }

  return applyNativeSql(statements);
}

function buildStatement(prefix: readonly Token[], pending: readonly Token[], colon: Token | null): Statement {
  const all = [...prefix, ...pending];
  const tokens: Token[] = [];
  const pragmas: Token[] = [];

  all.forEach((token, i) => {
    // 마지막 토큰이 프래그마면 걷어내지 않는다 (구 구현 승계 — 보통 그 자리는 마침표다).
    if (token.type === TokenType.Pragma && i < all.length - 1) pragmas.push(token);
    else tokens.push(token);
  });

  const only = tokens.length === 1 ? tokens[0] : undefined;
  const type: StatementType = only !== undefined && only.type === TokenType.Punctuation ? 'Empty' : 'Unknown';

  return { tokens, pragmas, type, colon };
}

/**
 * AMDP·EXEC SQL 후처리.
 *
 * `METHOD ... BY DATABASE` 뒤부터 `ENDMETHOD`까지는 ABAP 문법이 아니므로 통째로
 * `NativeSQL`로 덮는다. 마지막 SQL 줄에 `ENDMETHOD .`가 붙어 온 경우(SQL 쪽에
 * 마침표가 없어 한 문장으로 뭉친 경우)에는 뒤 두 토큰을 떼어 별도 문장으로 세운다.
 */
function applyNativeSql(statements: Statement[]): Statement[] {
  const result: Statement[] = [];
  let inSql = false;

  for (const stmt of statements) {
    if (!inSql) {
      if (isMethodByDatabase(stmt)) inSql = true;
      result.push(stmt);
      continue;
    }

    if (firstTokenStr(stmt) === 'ENDMETHOD') {
      inSql = false;
      result.push(stmt);
      continue;
    }

    const split = splitTrailingEndMethod(stmt);
    if (split !== null) {
      result.push(...split);
      inSql = false;
      continue;
    }

    stmt.type = 'NativeSQL';
    result.push(stmt);
  }

  return result;
}

/** 문장 끝에 `ENDMETHOD .`가 붙어 있으면 [SQL 부분, ENDMETHOD 부분]으로 가른다. */
function splitTrailingEndMethod(stmt: Statement): Statement[] | null {
  const tokens = stmt.tokens;
  if (tokens.length < 2) return null;

  const last = tokens[tokens.length - 1];
  const beforeLast = tokens[tokens.length - 2];
  if (last === undefined || beforeLast === undefined) return null;
  if (last.type !== TokenType.Punctuation || last.str !== '.') return null;
  if (asciiUpper(beforeLast.str) !== 'ENDMETHOD') return null;

  const sqlTokens = tokens.slice(0, tokens.length - 2);
  const endTokens = tokens.slice(tokens.length - 2);

  const out: Statement[] = [];
  if (sqlTokens.length > 0) {
    out.push({ tokens: sqlTokens, pragmas: [], type: 'NativeSQL', colon: null });
  }
  out.push({ tokens: endTokens, pragmas: [], type: 'Unknown', colon: null });
  return out;
}

/** `METHOD <이름> BY DATABASE ...` 인가. */
function isMethodByDatabase(stmt: Statement): boolean {
  return stmt.tokens.some((token, i) => {
    if (i < 2 || asciiUpper(token.str) !== 'DATABASE') return false;
    const previous = stmt.tokens[i - 1];
    return previous !== undefined && asciiUpper(previous.str) === 'BY';
  });
}
