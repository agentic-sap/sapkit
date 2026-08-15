// 토큰 유형과 토큰.
//
// 유형 이름(값)은 **기능 계약**이다 — 판정 대조에 이 글자가 그대로 실린다.
// 괄호·대괄호·대시·플러스·@·화살표는 앞뒤 공백에 따라 4변종으로 갈린다:
// 접두 W = 앞에 공백, 접미 W = 뒤에 공백.

export const TokenType = {
  Identifier: 'Identifier',
  Comment: 'Comment',
  /** 작은따옴표 'abc' 또는 백틱 `abc` 리터럴 */
  StringToken: 'StringToken',
  /** 보간 없는 완결 템플릿 |abc| */
  StringTemplate: 'StringTemplate',
  /** |begin{ */
  StringTemplateBegin: 'StringTemplateBegin',
  /** }end| */
  StringTemplateEnd: 'StringTemplateEnd',
  /** }middle{ */
  StringTemplateMiddle: 'StringTemplateMiddle',
  /** 마침표와 쉼표 */
  Punctuation: 'Punctuation',
  /** ##PRAGMA */
  Pragma: 'Pragma',

  ParenLeft: 'ParenLeft',
  ParenLeftW: 'ParenLeftW',
  WParenLeft: 'WParenLeft',
  WParenLeftW: 'WParenLeftW',
  ParenRight: 'ParenRight',
  ParenRightW: 'ParenRightW',
  WParenRight: 'WParenRight',
  WParenRightW: 'WParenRightW',

  BracketLeft: 'BracketLeft',
  BracketLeftW: 'BracketLeftW',
  WBracketLeft: 'WBracketLeft',
  WBracketLeftW: 'WBracketLeftW',
  BracketRight: 'BracketRight',
  BracketRightW: 'BracketRightW',
  WBracketRight: 'WBracketRight',
  WBracketRightW: 'WBracketRightW',

  Dash: 'Dash',
  DashW: 'DashW',
  WDash: 'WDash',
  WDashW: 'WDashW',

  Plus: 'Plus',
  PlusW: 'PlusW',
  WPlus: 'WPlus',
  WPlusW: 'WPlusW',

  At: 'At',
  AtW: 'AtW',
  WAt: 'WAt',
  WAtW: 'WAtW',

  InstanceArrow: 'InstanceArrow',
  InstanceArrowW: 'InstanceArrowW',
  WInstanceArrow: 'WInstanceArrow',
  WInstanceArrowW: 'WInstanceArrowW',

  StaticArrow: 'StaticArrow',
  StaticArrowW: 'StaticArrowW',
  WStaticArrow: 'WStaticArrow',
  WStaticArrowW: 'WStaticArrowW',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

/**
 * 어휘 분석기가 내놓는 토큰 한 개.
 *
 * `row`·`col`은 **1부터** 세고, `col`은 그 줄 안의 **UTF-8 바이트** 자리다
 * (구 검사기 실측 기준 — 비-ASCII 글자는 열을 바이트 수만큼 민다).
 */
export interface Token {
  readonly str: string;
  readonly type: TokenType;
  readonly row: number;
  readonly col: number;
}

const ARROW_TYPES: ReadonlySet<TokenType> = new Set<TokenType>([
  TokenType.InstanceArrow,
  TokenType.InstanceArrowW,
  TokenType.WInstanceArrow,
  TokenType.WInstanceArrowW,
  TokenType.StaticArrow,
  TokenType.StaticArrowW,
  TokenType.WStaticArrow,
  TokenType.WStaticArrowW,
]);

const PAREN_LEFT_TYPES: ReadonlySet<TokenType> = new Set<TokenType>([
  TokenType.ParenLeft,
  TokenType.ParenLeftW,
  TokenType.WParenLeft,
  TokenType.WParenLeftW,
]);

const PAREN_RIGHT_TYPES: ReadonlySet<TokenType> = new Set<TokenType>([
  TokenType.ParenRight,
  TokenType.ParenRightW,
  TokenType.WParenRight,
  TokenType.WParenRightW,
]);

/** `->` 또는 `=>` 인가 (공백 변종 4가지 모두). */
export function isArrowToken(token: Token): boolean {
  return ARROW_TYPES.has(token.type);
}

/** 여는 둥근 괄호인가. */
export function isParenLeftToken(token: Token): boolean {
  return PAREN_LEFT_TYPES.has(token.type) || token.str === '(';
}

/** 닫는 둥근 괄호인가. */
export function isParenRightToken(token: Token): boolean {
  return PAREN_RIGHT_TYPES.has(token.type) || token.str === ')';
}
