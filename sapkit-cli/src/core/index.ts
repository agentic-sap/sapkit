// 검사기 코어 — 어휘 분석 · 문장 분할 · 유형 분류.
//
// 규칙과 CLI는 여기서 나가는 것만 쓴다. 런타임 외부 의존은 0이다.

export { TokenType, isArrowToken, isParenLeftToken, isParenRightToken } from './token';
export type { Token } from './token';

export { tokenize } from './lexer';

export { asciiUpper, concatTokens, firstTokenStr, splitStatements } from './statement';
export type { Statement } from './statement';

export { STATEMENT_TYPES } from './statement-types';
export type { StatementType } from './statement-types';

export { classifyStatement, classifyStatements, registeredStatementTypes } from './classifier';

export { AbapFile } from './abap-file';
