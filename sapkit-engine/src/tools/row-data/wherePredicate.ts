/**
 * 결함 13-9의 수리 — **돌아온 표가 자기 질의의 WHERE를 지키는지** 확인한다.
 *
 * ## 왜 이것이 필요한가 (구 경로에서 WHERE는 어디서 사라지는가)
 *
 * 구 경로를 끝까지 따라가면 질의문은 **한 글자도 바뀌지 않는다**:
 * `engine/src/handlers/system/readonly/handleGetSqlQuery.ts:237,291-294`가
 * `args.sql_query`를 그대로 클라이언트에 넘기고,
 * `@babamba2/mcp-abap-adt-clients` 의 `dist/core/shared/sqlQuery.js:20-36`이
 * 그것을 그대로 `POST /sap/bc/adt/datapreview/freestyle?rowNumber=N`의 본문으로
 * 싣고, `@babamba2/mcp-abap-connection`의
 * `dist/connection/AbstractAbapConnection.js:139-`이 그대로 전송한다. 즉
 * **클라이언트는 WHERE를 잃지 않는다** — 잃는 쪽은 ADT Data Preview freestyle
 * 엔드포인트이고, 실측 경계는 SELECT 목록 18~28컬럼 사이다
 * (`HANDOFF.md` §6 13-9, 2026-08-04 실측).
 *
 * 그렇다면 구 엔진의 결함은 무엇인가. **아무도 답을 질문에 대조하지 않는 것**이다.
 * 같은 파일의 `parseSqlQueryXml`(:70-197)은 질의문을 받아서 응답의 `sql_query`
 * 필드로 **되울리기만** 하고(:187) 행과 견주지 않으며, 핸들러는 그 결과에
 * `isError: false`를 찍는다(:321-329). 그래서 술어를 무시한 표가 "성공"으로
 * 나간다 — 침묵 실패가 아니라 **그럴듯한 오답**이고, 그대로 P2 판단과 쓰기 게이트
 * 승인 문서로 흘러 들어간다.
 *
 * 이 모듈이 그 대조를 한다. 등재된 의도적 차이 D1이다
 * (`harness/DIVERGENCES.md`).
 *
 * ## 한쪽으로만 틀린다
 *
 * 옳은 결과를 거부하는 것은 틀린 결과를 통과시키는 것만큼 나쁘다. 그래서 이
 * 검증기는 **위반을 증명할 수 있을 때만** 위반이라 말한다:
 *
 * - 모델링한 술어는 `=` · `<>`/`!=` · `IN` 뿐이고, 최상위 `AND` 사슬만 쪼갠다.
 *   `OR` · `NOT` · 하위 질의가 섞이면 항 단위 판정이 성립하지 않으므로 물러난다.
 * - 술어의 컬럼이 반환 표에 없으면 그 항은 판정하지 않는다.
 * - `=`/`IN` 비교는 **관대하게** 본다(원문 · 공백 제거 · 숫자값). SAP은 CHAR를
 *   꼬리 공백째, NUMC를 0채움째 돌려주므로 엄격 비교는 거짓 경보가 된다.
 * - `<>` 비교는 **엄격하게** 본다. 여기서 숫자값까지 같다고 접으면 `'0000001000'`
 *   같은 정상 행이 위반으로 몰린다 — 관대함의 방향이 반대다.
 */

import { stripSqlComments } from '../../safety';

export type WhereVerification =
  /** 확인할 수 있는 항이 하나 이상 있었고, 모든 행이 그것을 만족했다. */
  | { readonly kind: 'honoured'; readonly checked: number }
  /** 판정할 근거가 없다. 결과에 대해 아무 말도 하지 않는다. */
  | { readonly kind: 'unverifiable'; readonly reason: string }
  /** 어떤 행이 자기 질의의 술어를 만족하지 않는다. */
  | {
      readonly kind: 'violated';
      /** 위반된 술어 항의 원문. */
      readonly term: string;
      /** 반환 표에서의 컬럼 이름. */
      readonly column: string;
      /** 0-기반 행 번호. */
      readonly rowIndex: number;
    };

// ── 토큰 ────────────────────────────────────────────────────────────────────

type TokenKind = 'word' | 'number' | 'string' | 'punct';

interface Token {
  readonly kind: TokenKind;
  /** string이면 이스케이프를 푼 값, 그 밖에는 원문. */
  readonly text: string;
  readonly upper: string;
  /** 괄호 깊이. 최상위가 0이다. */
  readonly depth: number;
  readonly start: number;
  readonly end: number;
}

const WORD_CHAR = /[A-Za-z0-9_/~.]/;
const TWO_CHAR_OPERATORS = new Set(['<>', '!=', '<=', '>=']);
const NUMERIC = /^\d+(?:\.\d+)?$/;
const COLUMN_NAME = /^[A-Z0-9_/]+$/;

/** WHERE 절이 끝나는 최상위 키워드. */
const CLAUSE_TERMINATORS: ReadonlySet<string> = new Set([
  'GROUP', 'ORDER', 'HAVING', 'UNION', 'INTO', 'UP', 'FOR', 'BYPASSING',
  'CLIENT', 'LIMIT', 'OFFSET', 'WITH',
]);

/** 항 단위 판정을 무효로 만드는 것들. 하나라도 있으면 통째로 물러난다. */
const UNMODELLED: ReadonlySet<string> = new Set(['OR', 'NOT', 'SELECT', 'EXISTS']);

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "'") {
      const start = index;
      let value = '';
      index += 1;
      while (index < text.length) {
        if (text.charAt(index) === "'") {
          // 리터럴 안의 `''`는 작은따옴표 한 개다.
          if (text.charAt(index + 1) === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += text.charAt(index);
        index += 1;
      }
      tokens.push({ kind: 'string', text: value, upper: value.toUpperCase(), depth, start, end: index });
      continue;
    }

    if (WORD_CHAR.test(char)) {
      const start = index;
      while (index < text.length && WORD_CHAR.test(text.charAt(index))) index += 1;
      const raw = text.slice(start, index);
      tokens.push({
        kind: NUMERIC.test(raw) ? 'number' : 'word',
        text: raw,
        upper: raw.toUpperCase(),
        depth,
        start,
        end: index,
      });
      continue;
    }

    const pair = text.slice(index, index + 2);
    if (TWO_CHAR_OPERATORS.has(pair)) {
      tokens.push({ kind: 'punct', text: pair, upper: pair, depth, start: index, end: index + 2 });
      index += 2;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'punct', text: char, upper: char, depth, start: index, end: index + 1 });
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ')') {
      depth = depth > 0 ? depth - 1 : 0;
      tokens.push({ kind: 'punct', text: char, upper: char, depth, start: index, end: index + 1 });
      index += 1;
      continue;
    }

    tokens.push({ kind: 'punct', text: char, upper: char, depth, start: index, end: index + 1 });
    index += 1;
  }

  return tokens;
}

// ── 술어 항 ─────────────────────────────────────────────────────────────────

type Comparison = 'eq' | 'ne';

interface PredicateTerm {
  readonly column: string;
  readonly comparison: Comparison;
  /** `=`/`<>`는 원소 하나, `IN`은 목록. */
  readonly literals: readonly string[];
  readonly source: string;
}

/** `a~belnr` · `a.belnr` · `belnr` → `BELNR`. 컬럼 이름이 아니면 null. */
function columnOf(token: Token): string | null {
  if (token.kind !== 'word') return null;
  const tail = token.text.split(/[~.]/).pop() ?? '';
  const name = tail.toUpperCase();
  return name && COLUMN_NAME.test(name) ? name : null;
}

function literalOf(token: Token): string | null {
  return token.kind === 'string' || token.kind === 'number' ? token.text : null;
}

function comparisonOf(token: Token): Comparison | null {
  if (token.kind === 'punct') {
    if (token.text === '=') return 'eq';
    if (token.text === '<>' || token.text === '!=') return 'ne';
    return null;
  }
  if (token.kind === 'word') {
    if (token.upper === 'EQ') return 'eq';
    if (token.upper === 'NE') return 'ne';
  }
  return null;
}

/** 모델링한 모양이면 항으로, 아니면 null(그 항은 판정하지 않는다). */
function parseTerm(tokens: readonly Token[], source: string): PredicateTerm | null {
  const first = tokens[0];
  const second = tokens[1];
  if (!first || !second) return null;

  const column = columnOf(first);
  if (!column) return null;
  const text = source.slice(first.start, (tokens[tokens.length - 1] as Token).end);

  const comparison = comparisonOf(second);
  if (comparison) {
    if (tokens.length !== 3) return null;
    const literal = literalOf(tokens[2] as Token);
    return literal === null ? null : { column, comparison, literals: [literal], source: text };
  }

  if (second.kind === 'word' && second.upper === 'IN') {
    const open = tokens[2];
    const close = tokens[tokens.length - 1];
    if (!open || !close || open.text !== '(' || close.text !== ')') return null;
    const literals: string[] = [];
    for (let index = 3; index < tokens.length - 1; index += 1) {
      const token = tokens[index] as Token;
      if (token.kind === 'punct' && token.text === ',') continue;
      const literal = literalOf(token);
      if (literal === null) return null;
      literals.push(literal);
    }
    return literals.length === 0 ? null : { column, comparison: 'eq', literals, source: text };
  }

  return null;
}

// ── 값 비교 ─────────────────────────────────────────────────────────────────

/** `=`/`IN` 쪽. 꼬리 공백·0채움을 같은 값으로 본다 — 거짓 경보를 내지 않는 방향. */
function looselyEqual(cell: string, literal: string): boolean {
  if (cell === literal) return true;
  const left = cell.trim();
  const right = literal.trim();
  if (left === right) return true;
  if (left === '' || right === '') return false;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return (
    Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber
  );
}

/** `<>` 쪽. 여기서 관대하면 정상 행이 위반으로 몰린다. */
function strictlyEqual(cell: string, literal: string): boolean {
  return cell === literal || cell.trim() === literal.trim();
}

function satisfies(term: PredicateTerm, cell: string): boolean {
  if (term.comparison === 'eq') {
    return term.literals.some((literal) => looselyEqual(cell, literal));
  }
  return !term.literals.some((literal) => strictlyEqual(cell, literal));
}

// ── 진입점 ──────────────────────────────────────────────────────────────────

function resolveKey(row: Record<string, string | null>, column: string): string | null {
  for (const key of Object.keys(row)) {
    if (key.toUpperCase() === column) return key;
  }
  return null;
}

export function verifyWherePredicate(
  sql: string,
  rows: ReadonlyArray<Record<string, string | null>>,
): WhereVerification {
  const text = stripSqlComments(sql);
  const tokens = tokenize(text);

  const whereAt = tokens.findIndex(
    (token) => token.depth === 0 && token.kind === 'word' && token.upper === 'WHERE',
  );
  if (whereAt === -1) return { kind: 'unverifiable', reason: 'statement has no WHERE clause' };

  const clause: Token[] = [];
  for (let index = whereAt + 1; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;
    if (token.depth === 0 && token.kind === 'word' && CLAUSE_TERMINATORS.has(token.upper)) break;
    clause.push(token);
  }
  if (clause.length === 0) return { kind: 'unverifiable', reason: 'empty WHERE clause' };

  if (clause.some((token) => token.kind === 'word' && UNMODELLED.has(token.upper))) {
    return {
      kind: 'unverifiable',
      reason: 'the predicate carries OR / NOT / a subquery, so it cannot be split into terms',
    };
  }

  const groups: Token[][] = [[]];
  for (const token of clause) {
    if (token.depth === 0 && token.kind === 'word' && token.upper === 'AND') {
      groups.push([]);
      continue;
    }
    (groups[groups.length - 1] as Token[]).push(token);
  }

  const first = rows[0];
  let checked = 0;
  for (const group of groups) {
    const term = parseTerm(group, text);
    if (!term) continue;
    const key = first ? resolveKey(first, term.column) : null;
    if (key === null) continue;

    checked += 1;
    for (let index = 0; index < rows.length; index += 1) {
      const cell = (rows[index] as Record<string, string | null>)[key] ?? '';
      if (satisfies(term, cell)) continue;
      return { kind: 'violated', term: term.source, column: key, rowIndex: index };
    }
  }

  if (checked === 0) {
    return {
      kind: 'unverifiable',
      reason: 'no predicate term could be checked against the returned columns',
    };
  }
  return { kind: 'honoured', checked };
}
