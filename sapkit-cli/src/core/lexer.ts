// ABAP 어휘 분석기.
//
// ## 왜 바이트 위에서 도는가
//
// 열 번호는 **그 줄의 UTF-8 바이트 자리**다 (구 검사기 실측 — 한글 한 글자는 열을
// 3칸 민다). 그래서 원문을 UTF-8 바이트로 펴고, 바이트 하나를 문자 하나로 보는
// latin1 시점에서 훑는다. 토큰을 내놓을 때만 다시 UTF-8로 읽어 문자열로 만든다.
// 이렇게 하면 열 계산·문자 비교·길이 계산이 전부 한 기준(바이트) 위에 놓인다.
//
// ## 왜 상태 기계가 이렇게 생겼는가
//
// 훑개는 "지금 글자"가 아니라 **"다음 글자"**를 보고 토큰 끝을 판단한다. 즉 한 바퀴는
// (1) 지금 글자를 담개에 붙이고 (2) 앞을 내다봐 끊을지 정하고 (3) 한 칸 나아간다.
// 파일 맨 앞에는 가상의 줄바꿈이 하나 있다고 치는데, 첫 줄의 별표 주석(`*`)이
// "줄 첫 칸"이라는 조건에 걸리게 하려는 장치다.

import { TokenType } from './token';
import type { Token } from './token';

type Mode = 'normal' | 'ping' | 'str' | 'template' | 'comment' | 'pragma';

/** 이 글자가 앞에 오면 담개를 끊는다. */
const SPLIT_CHARS = new Set([' ', ':', '.', ',', '-', '+', '(', ')', '[', ']', '\t', '\n']);

/** 담개에 혼자 담겼을 때 곧바로 한 토큰이 되는 글자. */
const SOLO_CHARS = new Set(['.', ',', ':', '(', ')', '[', ']', '+', '@']);

/** 토큰 앞이 "비었다"고 보는 글자. */
const WHITE_BEFORE_CHARS = new Set([' ', '\n', '\t', ':']);

/** 토큰 뒤가 "비었다"고 보는 글자 (빈 문자열 = 원문 끝). */
const WHITE_AFTER_CHARS = new Set([' ', '\n', '\t', ':', ',', '.', '', '"']);

const ASCII_SPACE = new Set([' ', '\t', '\n', '\v', '\f', '\r']);

/** 양끝의 ASCII 공백만 떼어낸다 (바이트 시점에서 안전한 다듬기). */
function trimAsciiSpace(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && ASCII_SPACE.has(s.charAt(start))) start++;
  while (end > start && ASCII_SPACE.has(s.charAt(end - 1))) end--;
  return s.slice(start, end);
}

/** 앞뒤 공백 유무로 4변종 중 하나를 고른다. */
function spacedVariant(
  whiteBefore: boolean,
  whiteAfter: boolean,
  bare: TokenType,
  afterOnly: TokenType,
  beforeOnly: TokenType,
  both: TokenType,
): TokenType {
  if (whiteBefore && whiteAfter) return both;
  if (whiteBefore) return beforeOnly;
  if (whiteAfter) return afterOnly;
  return bare;
}

/** 한 글자 토큰의 유형. */
function singleCharType(s: string, whiteBefore: boolean, whiteAfter: boolean): TokenType {
  const w = (bare: TokenType, afterOnly: TokenType, beforeOnly: TokenType, both: TokenType): TokenType =>
    spacedVariant(whiteBefore, whiteAfter, bare, afterOnly, beforeOnly, both);

  switch (s) {
    case '.':
    case ',':
      return TokenType.Punctuation;
    case '[':
      return w(TokenType.BracketLeft, TokenType.BracketLeftW, TokenType.WBracketLeft, TokenType.WBracketLeftW);
    case ']':
      return w(
        TokenType.BracketRight,
        TokenType.BracketRightW,
        TokenType.WBracketRight,
        TokenType.WBracketRightW,
      );
    case '(':
      return w(TokenType.ParenLeft, TokenType.ParenLeftW, TokenType.WParenLeft, TokenType.WParenLeftW);
    case ')':
      return w(TokenType.ParenRight, TokenType.ParenRightW, TokenType.WParenRight, TokenType.WParenRightW);
    case '-':
      return w(TokenType.Dash, TokenType.DashW, TokenType.WDash, TokenType.WDashW);
    case '+':
      return w(TokenType.Plus, TokenType.PlusW, TokenType.WPlus, TokenType.WPlusW);
    case '@':
      return w(TokenType.At, TokenType.AtW, TokenType.WAt, TokenType.WAtW);
    default:
      return TokenType.Identifier;
  }
}

/** 문자열 템플릿 조각의 유형. 여는/닫는 글자와 바깥 공백으로 판별한다. */
function templateType(s: string, whiteBefore: boolean, whiteAfter: boolean): TokenType {
  const first = s.charAt(0);
  const last = s.charAt(s.length - 1);
  if (first === '|' && last === '|') return TokenType.StringTemplate;
  if (first === '|' && last === '{' && whiteAfter) return TokenType.StringTemplateBegin;
  if (first === '}' && last === '|' && whiteBefore) return TokenType.StringTemplateEnd;
  if (first === '}' && last === '{' && whiteAfter && whiteBefore) return TokenType.StringTemplateMiddle;
  return TokenType.Identifier;
}

class Lexer {
  /** 바이트 하나 = 글자 하나인 시점의 원문. */
  private readonly bytes: string;
  private readonly tokens: Token[] = [];
  private mode: Mode = 'normal';
  private buffer = '';
  /** 지금 보고 있는 바이트 자리. -1은 파일 앞의 가상 줄바꿈. */
  private offset = -1;
  private row = 0;
  private col = 0;

  constructor(source: string) {
    this.bytes = Buffer.from(source.replace(/\r/g, ''), 'utf8').toString('latin1');
  }

  run(): Token[] {
    for (;;) {
      const current = this.currentChar();
      this.buffer += current;
      const ahead = this.byteAt(this.offset + 1);
      const ahead2 = this.bytes.slice(this.offset + 1, this.offset + 3);

      if (this.mode === 'normal') {
        this.stepNormal(current, ahead, ahead2);
      } else if (this.mode === 'pragma' && this.endsPragma(ahead)) {
        this.emit();
        this.mode = 'normal';
      } else if (this.mode === 'ping' && this.endsQuoted(current, ahead, ahead2, '`')) {
        this.emit();
        this.mode = ahead === '"' ? 'comment' : 'normal';
      } else if (this.mode === 'template' && this.endsTemplate(current)) {
        this.emit();
        this.mode = 'normal';
      } else if (this.mode === 'template' && ahead === '}' && current !== '\\') {
        this.emit();
      } else if (this.mode === 'str' && this.endsQuoted(current, ahead, ahead2, "'")) {
        this.emit();
        this.mode = ahead === '"' ? 'comment' : 'normal';
      } else if (ahead === '\n' && this.mode !== 'template') {
        // 주석은 줄이 끝나면 함께 끝난다.
        this.emit();
        this.mode = 'normal';
      } else if (this.mode === 'template' && current === '\n') {
        // 줄바꿈을 낀 템플릿은 여기서 조각난다 (구 구현 승계 — 조각은 Identifier가 된다).
        this.emit();
      }

      if (!this.advance()) break;
    }
    this.emit();
    return this.tokens;
  }

  /** 보통 모드의 끊기 판단. 순서가 곧 우선순위다. */
  private stepNormal(current: string, ahead: string, ahead2: string): void {
    if (ahead.length === 1 && SPLIT_CHARS.has(ahead)) {
      this.emit();
      return;
    }
    if (ahead === "'") {
      this.emit();
      this.mode = 'str';
      return;
    }
    if (ahead === '|' || ahead === '}') {
      this.emit();
      this.mode = 'template';
      return;
    }
    if (ahead === '`') {
      this.emit();
      this.mode = 'ping';
      return;
    }
    if (ahead2 === '##') {
      this.emit();
      this.mode = 'pragma';
      return;
    }
    if (ahead === '"' || (ahead === '*' && current === '\n')) {
      this.emit();
      this.mode = 'comment';
      return;
    }
    if (ahead === '@' && trimAsciiSpace(this.buffer) === '') {
      this.emit();
      return;
    }
    if (ahead2 === '->' || ahead2 === '=>') {
      this.emit();
      return;
    }
    if (current === '>' && ahead !== ' ') {
      const previous = this.byteAt(this.offset - 1);
      if (previous === '-' || previous === '=') {
        this.emit();
        return;
      }
    }
    if (this.buffer.length === 1 && (SOLO_CHARS.has(this.buffer) || (this.buffer === '-' && ahead !== '>'))) {
      this.emit();
    }
  }

  private endsPragma(ahead: string): boolean {
    return ahead === ',' || ahead === ':' || ahead === '.' || ahead === ' ' || ahead === '\n';
  }

  /**
   * 따옴표/백틱 리터럴의 끝인가. 두 겹(`''`, ` `` `)은 벗어난 것이므로 끝이 아니고,
   * 담개 안 따옴표 수가 짝수여야 진짜 닫힘이다.
   */
  private endsQuoted(current: string, ahead: string, ahead2: string, quote: string): boolean {
    return (
      current === quote &&
      this.buffer.length > 1 &&
      ahead2 !== quote + quote &&
      ahead !== quote &&
      this.countIsEven(quote)
    );
  }

  /** 템플릿 조각의 끝인가. 역슬래시로 벗어난 `\|`·`\{`는 끝이 아니다. */
  private endsTemplate(current: string): boolean {
    if (this.buffer.length <= 1) return false;
    if (current !== '|' && current !== '{') return false;
    const previous = this.byteAt(this.offset - 1);
    const previousPair = this.offset - 2 < 0 ? '' : this.bytes.slice(this.offset - 2, this.offset);
    return previous !== '\\' || previousPair === '\\\\';
  }

  private countIsEven(ch: string): boolean {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer.charAt(i) === ch) count++;
    }
    return count % 2 === 0;
  }

  /** 원문 밖은 빈 문자열. 가상 줄바꿈은 여기 없다 — `currentChar()`만 갖는다. */
  private byteAt(index: number): string {
    if (index < 0 || index >= this.bytes.length) return '';
    return this.bytes.charAt(index);
  }

  /** 지금 글자. 파일 앞(-1)에서는 가상 줄바꿈이다. */
  private currentChar(): string {
    return this.offset < 0 ? '\n' : this.byteAt(this.offset);
  }

  /** 한 바이트 나아간다. 원문 끝을 넘어서면 false. */
  private advance(): boolean {
    if (this.currentChar() === '\n') {
      this.col = 1;
      this.row++;
    }
    if (this.offset === this.bytes.length) {
      this.col--;
      return false;
    }
    this.col++;
    this.offset++;
    return true;
  }

  /** 담개에 쌓인 것을 토큰 하나로 내놓고 담개를 비운다. */
  private emit(): void {
    const s = trimAsciiSpace(this.buffer);
    this.buffer = '';
    if (s.length === 0) return;

    const before = this.offset - s.length;
    const whiteBefore = before >= 0 && WHITE_BEFORE_CHARS.has(this.bytes.charAt(before));
    const whiteAfter = WHITE_AFTER_CHARS.has(this.byteAt(this.offset + 1));

    this.tokens.push({
      str: Buffer.from(s, 'latin1').toString('utf8'),
      type: this.typeOf(s, whiteBefore, whiteAfter),
      row: this.row,
      col: this.col - s.length,
    });
  }

  private typeOf(s: string, whiteBefore: boolean, whiteAfter: boolean): TokenType {
    if (this.mode === 'comment') return TokenType.Comment;
    if (this.mode === 'ping' || this.mode === 'str') return TokenType.StringToken;
    if (this.mode === 'template') return templateType(s, whiteBefore, whiteAfter);
    if (s.length > 2 && s.slice(0, 2) === '##') return TokenType.Pragma;
    if (s.length === 1) return singleCharType(s, whiteBefore, whiteAfter);
    if (s.length === 2) {
      if (s === '->') {
        return spacedVariant(
          whiteBefore,
          whiteAfter,
          TokenType.InstanceArrow,
          TokenType.InstanceArrowW,
          TokenType.WInstanceArrow,
          TokenType.WInstanceArrowW,
        );
      }
      if (s === '=>') {
        return spacedVariant(
          whiteBefore,
          whiteAfter,
          TokenType.StaticArrow,
          TokenType.StaticArrowW,
          TokenType.WStaticArrow,
          TokenType.WStaticArrowW,
        );
      }
    }
    return TokenType.Identifier;
  }
}

/** ABAP 원문을 토큰 열로 쪼갠다. */
export function tokenize(source: string): Token[] {
  return new Lexer(source).run();
}
