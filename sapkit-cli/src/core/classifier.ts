// 문장 유형 분류기.
//
// 등록표는 "첫 키워드 → 후보 무늬"의 순서 있는 목록이다. 첫 키워드로 후보를 좁힌 뒤
// **등록 순서대로** 맞춰 보고 처음 걸리는 것을 쓴다 — 그래서 `WHEN OTHERS`를 `WHEN`보다,
// `SELECT-OPTIONS`를 `SELECT`보다 먼저 등록해야 한다.
//
// 무늬는 전부 "낱개 걸음의 줄"이라 되짚기가 필요 없다. 걸음은 넷뿐이다:
// 키워드 · 토큰 유형 · 이름꼴 · 나머지 전부. 무늬가 성립하려면 토큰을 **남김없이**
// 먹어야 한다 (그래서 `FUNCTION zfoo.`는 FunctionModule이지만 `FUNCTION-POOL zfg.`는
// 아니다).

import { TokenType, isArrowToken, isParenLeftToken, isParenRightToken } from './token';
import type { Token } from './token';
import { asciiUpper } from './statement';
import type { Statement } from './statement';
import type { StatementType } from './statement-types';

type Step =
  | { readonly kind: 'keyword'; readonly word: string }
  | { readonly kind: 'tokenType'; readonly tokenType: TokenType }
  | { readonly kind: 'ident' }
  | { readonly kind: 'any' }
  | { readonly kind: 'rest' };

/** 키워드 한 낱말 (대소문자 무시). */
function kw(word: string): Step {
  return { kind: 'keyword', word };
}

/** 공백 없는 대시 — `CLASS-DATA`, `SELECT-OPTIONS` 같은 겹낱말을 잇는다. */
const DASH: Step = { kind: 'tokenType', tokenType: TokenType.Dash };

/** 이름꼴 한 토큰 (식별자 · 필드 심볼 · 네임스페이스). */
const IDENT: Step = { kind: 'ident' };

/** 아무 토큰 하나. */
const ANY: Step = { kind: 'any' };

/** 남은 토큰 전부. */
const REST: Step = { kind: 'rest' };

const IDENT_PATTERN = /^[\w~/<>]+$/;

/** 무늬 한 개. 첫 걸음은 늘 키워드이고, 그 낱말이 곧 색인 열쇠다. */
interface Pattern {
  readonly type: StatementType;
  readonly steps: readonly Step[];
}

function pattern(type: StatementType, ...steps: Step[]): Pattern {
  return { type, steps };
}

/** 한 낱말로 끝나는 문장들. */
const SOLO_KEYWORDS: ReadonlyArray<readonly [StatementType, string]> = [
  ['EndIf', 'ENDIF'],
  ['EndLoop', 'ENDLOOP'],
  ['EndDo', 'ENDDO'],
  ['EndWhile', 'ENDWHILE'],
  ['EndCase', 'ENDCASE'],
  ['EndTry', 'ENDTRY'],
  ['EndMethod', 'ENDMETHOD'],
  ['EndClass', 'ENDCLASS'],
  ['EndForm', 'ENDFORM'],
  ['EndFunction', 'ENDFUNCTION'],
  ['EndInterface', 'ENDINTERFACE'],
  ['EndModule', 'ENDMODULE'],
  ['Else', 'ELSE'],
  ['Try', 'TRY'],
  ['Return', 'RETURN'],
  ['Continue', 'CONTINUE'],
  ['Exit', 'EXIT'],
];

/**
 * 등록표. **순서가 곧 우선순위다** — 같은 첫 키워드 안에서는 위에 있는 것이 이긴다.
 */
const PATTERNS: readonly Pattern[] = [
  ...SOLO_KEYWORDS.map(([type, word]) => pattern(type, kw(word))),

  pattern('Report', kw('REPORT'), REST),
  pattern('Include', kw('INCLUDE'), REST),
  pattern('If', kw('IF'), REST),
  pattern('ElseIf', kw('ELSEIF'), REST),
  pattern('While', kw('WHILE'), REST),
  pattern('Do', kw('DO'), REST),
  pattern('Case', kw('CASE'), REST),
  pattern('WhenOthers', kw('WHEN'), kw('OTHERS')),
  pattern('When', kw('WHEN'), REST),
  pattern('Loop', kw('LOOP'), REST),
  pattern('Catch', kw('CATCH'), REST),
  pattern('Raise', kw('RAISE'), REST),
  pattern('Commit', kw('COMMIT'), REST),
  pattern('LeaveToTransaction', kw('LEAVE'), kw('TO'), kw('TRANSACTION'), REST),
  pattern('Leave', kw('LEAVE'), REST),
  pattern('Submit', kw('SUBMIT'), REST),
  pattern('Sort', kw('SORT'), REST),
  pattern('Assign', kw('ASSIGN'), REST),
  pattern('Unassign', kw('UNASSIGN'), REST),
  pattern('Clear', kw('CLEAR'), REST),
  pattern('Refresh', kw('REFRESH'), REST),
  pattern('Append', kw('APPEND'), REST),
  pattern('Condense', kw('CONDENSE'), REST),
  pattern('Translate', kw('TRANSLATE'), REST),
  pattern('Replace', kw('REPLACE'), REST),
  pattern('Find', kw('FIND'), REST),
  pattern('Split', kw('SPLIT'), REST),
  pattern('Concatenate', kw('CONCATENATE'), REST),
  pattern('Write', kw('WRITE'), REST),
  pattern('Message', kw('MESSAGE'), REST),
  pattern('Add', kw('ADD'), REST),
  pattern('Perform', kw('PERFORM'), REST),
  pattern('SelectOption', kw('SELECT'), DASH, kw('OPTIONS'), REST),
  pattern('Select', kw('SELECT'), REST),

  // 이름이 뒤따라야 선언이다 — `DATA.`만 있으면 여기 걸리지 않는다.
  pattern('Data', kw('DATA'), IDENT, REST),

  pattern('TypeBegin', kw('TYPES'), kw('BEGIN'), kw('OF'), REST),
  pattern('TypeEnd', kw('TYPES'), kw('END'), kw('OF'), REST),
  pattern('Type', kw('TYPES'), IDENT, REST),

  pattern('Constant', kw('CONSTANTS'), REST),

  pattern('ClassDeferred', kw('CLASS'), IDENT, kw('DEFINITION'), kw('DEFERRED'), REST),
  pattern('ClassDefinition', kw('CLASS'), IDENT, kw('DEFINITION'), REST),
  pattern('ClassImplementation', kw('CLASS'), IDENT, kw('IMPLEMENTATION'), REST),
  pattern('ClassData', kw('CLASS'), DASH, kw('DATA'), REST),
  pattern('MethodDef', kw('CLASS'), DASH, kw('METHODS'), REST),

  pattern('MethodImplementation', kw('METHOD'), REST),
  pattern('MethodDef', kw('METHODS'), REST),

  pattern('Interface', kw('INTERFACE'), IDENT, kw('PUBLIC'), REST),
  pattern('Interface', kw('INTERFACE'), IDENT),
  pattern('InterfaceDef', kw('INTERFACES'), REST),

  pattern('Form', kw('FORM'), REST),

  pattern('FunctionModule', kw('FUNCTION'), IDENT),
  pattern('FunctionPool', kw('FUNCTION'), DASH, kw('POOL'), REST),

  pattern('Public', kw('PUBLIC'), kw('SECTION')),
  pattern('Private', kw('PRIVATE'), kw('SECTION')),
  pattern('Protected', kw('PROTECTED'), kw('SECTION')),

  pattern('CreateObject', kw('CREATE'), kw('OBJECT'), REST),
  pattern('CreateData', kw('CREATE'), kw('DATA'), REST),

  pattern('CallFunction', kw('CALL'), kw('FUNCTION'), REST),
  pattern('CallTransaction', kw('CALL'), kw('TRANSACTION'), REST),
  pattern('CallTransformation', kw('CALL'), kw('TRANSFORMATION'), REST),
  pattern('CallScreen', kw('CALL'), kw('SCREEN'), REST),
  pattern('CallSelectionScreen', kw('CALL'), kw('SELECTION'), DASH, kw('SCREEN'), REST),

  pattern('ReadTable', kw('READ'), kw('TABLE'), REST),
  pattern('ReadTextpool', kw('READ'), kw('TEXTPOOL'), REST),

  pattern('InsertTextpool', kw('INSERT'), kw('TEXTPOOL'), REST),
  pattern('InsertInternal', kw('INSERT'), REST),

  pattern('DeleteInternal', kw('DELETE'), REST),

  pattern('FieldSymbol', kw('FIELD'), DASH, kw('SYMBOLS'), REST),

  pattern('Parameter', kw('PARAMETERS'), REST),
  pattern('SelectionScreen', kw('SELECTION'), DASH, kw('SCREEN'), REST),

  pattern('SetPFStatus', kw('SET'), kw('PF'), DASH, kw('STATUS'), REST),
  pattern('SetTitlebar', kw('SET'), kw('TITLEBAR'), REST),

  pattern('GetTime', kw('GET'), kw('TIME'), REST),

  pattern('Module', kw('MODULE'), REST),

  pattern('StartOfSelection', kw('START'), DASH, kw('OF'), DASH, kw('SELECTION')),

  pattern('NativeSQL', kw('DECLARE'), REST),
];

/** 첫 키워드 → 후보 무늬(등록 순서 유지). */
const BY_KEYWORD: ReadonlyMap<string, readonly Pattern[]> = (() => {
  const index = new Map<string, Pattern[]>();
  for (const p of PATTERNS) {
    const first = p.steps[0];
    if (first === undefined || first.kind !== 'keyword') {
      throw new Error(`무늬의 첫 걸음은 키워드여야 한다: ${p.type}`);
    }
    const bucket = index.get(first.word);
    if (bucket === undefined) index.set(first.word, [p]);
    else bucket.push(p);
  }
  return index;
})();

/** 무늬가 토큰을 남김없이 먹는가. */
function matches(steps: readonly Step[], tokens: readonly Token[]): boolean {
  let pos = 0;
  for (const step of steps) {
    if (step.kind === 'rest') {
      pos = tokens.length;
      continue;
    }
    const token = tokens[pos];
    if (token === undefined) return false;
    if (step.kind === 'keyword' && asciiUpper(token.str) !== step.word) return false;
    if (step.kind === 'tokenType' && token.type !== step.tokenType) return false;
    if (step.kind === 'ident' && !IDENT_PATTERN.test(token.str)) return false;
    pos++;
  }
  return pos === tokens.length;
}

/**
 * 메서드 호출 문장인가.
 *
 * 화살표(`->`·`=>`)나 괄호 호출이 있으면서, **괄호 밖의 대입**(`=`·`?=`)이 없어야
 * 호출이다. 대입이 하나라도 있으면 그건 `Move`다 — `lv_a = lo_b->meth( ).`이 Move인
 * 이유가 이것이다.
 */
function isCallStatement(tokens: readonly Token[]): boolean {
  if (tokens.length === 0) return false;

  let hasArrow = false;
  let hasParenCall = false;
  let depth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;

    if (isArrowToken(token)) {
      hasArrow = true;
    } else if (isParenLeftToken(token)) {
      depth++;
      hasParenCall = true;
    } else if (isParenRightToken(token)) {
      if (depth > 0) depth--;
    } else if (depth === 0 && (token.str === '=' || token.str === '?=')) {
      // 떨어져 쓴 `= >`는 정적 화살표이므로 대입이 아니다.
      if (token.str === '=' && tokens[i + 1]?.str === '>') continue;
      return false;
    }
  }

  return hasArrow || hasParenCall;
}

/** 첫 키워드로 못 좁힌 문장을 받는 되돌림 판정. 순서가 곧 우선순위다. */
const FALLBACKS: ReadonlyArray<readonly [StatementType, (tokens: readonly Token[]) => boolean]> = [
  ['Call', isCallStatement],
  ['Move', (tokens) => matches([ANY, REST], tokens)],
];

/** 문장 하나의 유형을 정한다. 원래 문장은 건드리지 않는다. */
export function classifyStatement(stmt: Statement): StatementType {
  if (stmt.type === 'Comment' || stmt.type === 'Empty') return stmt.type;

  let tokens = stmt.tokens;
  if (tokens.length === 0) return 'Empty';

  // 문장 끝의 마침표·쉼표는 무늬 맞추기에서 뺀다.
  const last = tokens[tokens.length - 1];
  if (last !== undefined && last.type === TokenType.Punctuation) tokens = tokens.slice(0, -1);
  if (tokens.length === 0) return 'Empty';

  const first = tokens[0];
  if (first === undefined) return 'Empty';

  for (const candidate of BY_KEYWORD.get(asciiUpper(first.str)) ?? []) {
    if (matches(candidate.steps, tokens)) return candidate.type;
  }

  for (const [type, test] of FALLBACKS) {
    if (test(tokens)) return type;
  }

  return 'Unknown';
}

/** 아직 `Unknown`인 문장들의 유형을 채운다 (제자리 갱신). */
export function classifyStatements(statements: readonly Statement[]): void {
  for (const stmt of statements) {
    if (stmt.type === 'Unknown') stmt.type = classifyStatement(stmt);
  }
}

/** 등록표에 실제로 실린 유형 이름 (등록 순서, 중복 제거). 실측용 표면이다. */
export function registeredStatementTypes(): StatementType[] {
  const seen = new Set<StatementType>();
  const out: StatementType[] = [];
  for (const type of [...PATTERNS.map((p) => p.type), ...FALLBACKS.map(([type]) => type)]) {
    if (seen.has(type)) continue;
    seen.add(type);
    out.push(type);
  }
  return out;
}
