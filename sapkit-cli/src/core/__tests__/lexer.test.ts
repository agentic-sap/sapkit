// 어휘 분석기 단위 시험.
// 기대값은 구 vsp 검사기(Go)를 실제로 돌려 실측한 것이다 — 문서에서 옮겨오지 않았다.

import { TokenType, tokenize } from '../index';
import type { Token } from '../index';

/** 토큰을 [문자열, 유형, 행, 열]로 납작하게 편다 (읽기 쉬운 대조용). */
function shape(source: string): Array<[string, string, number, number]> {
  return tokenize(source).map((t: Token) => [t.str, t.type, t.row, t.col]);
}

function strs(source: string): string[] {
  return tokenize(source).map((t: Token) => t.str);
}

function types(source: string): string[] {
  return tokenize(source).map((t: Token) => t.type);
}

describe('tokenize — 기본', () => {
  it('평범한 선언을 토큰 5개로 자른다', () => {
    expect(shape('DATA lv_x TYPE i.')).toEqual([
      ['DATA', TokenType.Identifier, 1, 1],
      ['lv_x', TokenType.Identifier, 1, 6],
      ['TYPE', TokenType.Identifier, 1, 11],
      ['i', TokenType.Identifier, 1, 16],
      ['.', TokenType.Punctuation, 1, 17],
    ]);
  });

  it('빈 원문과 공백뿐인 원문은 토큰 0개', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });

  it('마침표 없는 마지막 문장도 토큰으로 나온다', () => {
    expect(strs('DATA lv_x TYPE i')).toEqual(['DATA', 'lv_x', 'TYPE', 'i']);
  });

  it('CR을 걷어내고 행을 센다 (CRLF 원문)', () => {
    expect(shape('DATA a TYPE i.\r\nDATA b TYPE i.\r\n')).toEqual([
      ['DATA', TokenType.Identifier, 1, 1],
      ['a', TokenType.Identifier, 1, 6],
      ['TYPE', TokenType.Identifier, 1, 8],
      ['i', TokenType.Identifier, 1, 13],
      ['.', TokenType.Punctuation, 1, 14],
      ['DATA', TokenType.Identifier, 2, 1],
      ['b', TokenType.Identifier, 2, 6],
      ['TYPE', TokenType.Identifier, 2, 8],
      ['i', TokenType.Identifier, 2, 13],
      ['.', TokenType.Punctuation, 2, 14],
    ]);
  });

  it('선행 빈 줄만큼 행 번호가 밀린다', () => {
    expect(shape('\n\n\nDATA lv_x TYPE i.')[0]).toEqual(['DATA', TokenType.Identifier, 4, 1]);
  });

  it('탭은 열 1칸으로 센다', () => {
    expect(shape('\tDATA\tlv_x\tTYPE i.')).toEqual([
      ['DATA', TokenType.Identifier, 1, 2],
      ['lv_x', TokenType.Identifier, 1, 7],
      ['TYPE', TokenType.Identifier, 1, 12],
      ['i', TokenType.Identifier, 1, 17],
      ['.', TokenType.Punctuation, 1, 18],
    ]);
  });
});

describe('tokenize — 문자열 리터럴', () => {
  it("작은따옴표 리터럴은 공백을 품은 채 한 토큰", () => {
    expect(shape("WRITE 'hello world'.")).toEqual([
      ['WRITE', TokenType.Identifier, 1, 1],
      ["'hello world'", TokenType.StringToken, 1, 7],
      ['.', TokenType.Punctuation, 1, 20],
    ]);
  });

  it("리터럴 안의 두 겹 따옴표는 끝으로 보지 않는다", () => {
    expect(strs("lv_x = 'it''s'.")).toEqual(['lv_x', '=', "'it''s'", '.']);
  });

  it('리터럴 안의 큰따옴표는 주석 시작이 아니다', () => {
    expect(shape('WRITE \'it"s\'.')).toEqual([
      ['WRITE', TokenType.Identifier, 1, 1],
      ['\'it"s\'', TokenType.StringToken, 1, 7],
      ['.', TokenType.Punctuation, 1, 13],
    ]);
  });

  it('백틱 리터럴도 StringToken이고 두 겹 백틱을 품는다', () => {
    expect(shape('lv_x = `hello`` world`.')).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 6],
      ['`hello`` world`', TokenType.StringToken, 1, 8],
      ['.', TokenType.Punctuation, 1, 23],
    ]);
  });

  it('백틱 리터럴 안의 큰따옴표도 주석이 아니다', () => {
    expect(strs('lv_x = `back "tick`.')).toEqual(['lv_x', '=', '`back "tick`', '.']);
  });
});

describe('tokenize — 문자열 템플릿', () => {
  it('보간 없는 템플릿은 StringTemplate 한 개', () => {
    expect(shape('lv_x = ||.')).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 6],
      ['||', TokenType.StringTemplate, 1, 8],
      ['.', TokenType.Punctuation, 1, 10],
    ]);
  });

  it('보간 1개는 Begin/End로 갈린다', () => {
    expect(shape('lv_x = |hello { lv_name } world|.')).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 6],
      ['|hello {', TokenType.StringTemplateBegin, 1, 8],
      ['lv_name', TokenType.Identifier, 1, 17],
      ['} world|', TokenType.StringTemplateEnd, 1, 25],
      ['.', TokenType.Punctuation, 1, 33],
    ]);
  });

  it('보간 2개는 Begin/Middle/End', () => {
    expect(types('lv_x = |a{ b }c{ d }e|.')).toEqual([
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.StringTemplateBegin,
      TokenType.Identifier,
      TokenType.StringTemplateMiddle,
      TokenType.Identifier,
      TokenType.StringTemplateEnd,
      TokenType.Punctuation,
    ]);
  });

  it('보간이 템플릿 처음/끝에 붙어도 Begin/End', () => {
    expect(shape('lv_x = |{ a }|.')).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 6],
      ['|{', TokenType.StringTemplateBegin, 1, 8],
      ['a', TokenType.Identifier, 1, 11],
      ['}|', TokenType.StringTemplateEnd, 1, 13],
      ['.', TokenType.Punctuation, 1, 15],
    ]);
  });

  it('역슬래시로 벗어난 파이프는 템플릿을 끝내지 않는다', () => {
    expect(shape('lv_x = |a\\|b|.')).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 6],
      ['|a\\|b|', TokenType.StringTemplate, 1, 8],
      ['.', TokenType.Punctuation, 1, 14],
    ]);
  });

  it('줄바꿈을 낀 템플릿은 Identifier 두 조각으로 깨진다 (구 구현 승계)', () => {
    expect(shape('lv_x = |line1\nline2|.')).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 6],
      ['|line1', TokenType.Identifier, 1, 9],
      ['line2|', TokenType.Identifier, 2, 1],
      ['.', TokenType.Punctuation, 2, 7],
    ]);
  });
});

describe('tokenize — 주석 두 형태', () => {
  it('별표는 줄 첫 칸일 때만 주석', () => {
    expect(shape('DATA a TYPE i.\n* star comment\n" quote comment\nDATA b TYPE i.')).toEqual([
      ['DATA', TokenType.Identifier, 1, 1],
      ['a', TokenType.Identifier, 1, 6],
      ['TYPE', TokenType.Identifier, 1, 8],
      ['i', TokenType.Identifier, 1, 13],
      ['.', TokenType.Punctuation, 1, 14],
      ['* star comment', TokenType.Comment, 2, 1],
      ['" quote comment', TokenType.Comment, 3, 1],
      ['DATA', TokenType.Identifier, 4, 1],
      ['b', TokenType.Identifier, 4, 6],
      ['TYPE', TokenType.Identifier, 4, 8],
      ['i', TokenType.Identifier, 4, 13],
      ['.', TokenType.Punctuation, 4, 14],
    ]);
  });

  it('줄 가운데 별표는 주석이 아니라 Identifier', () => {
    expect(types('DATA lv_x TYPE i. * not a comment')).toEqual([
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Punctuation,
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Identifier,
    ]);
  });

  it('줄 끝 큰따옴표 주석은 마지막 토큰', () => {
    const toks = tokenize('DATA lv_x TYPE i. " inline comment');
    expect(toks[toks.length - 1]).toEqual({
      str: '" inline comment',
      type: TokenType.Comment,
      row: 1,
      col: 19,
    });
  });
});

describe('tokenize — 프래그마', () => {
  it('문장 끝 프래그마는 Pragma 토큰', () => {
    expect(shape('DATA lv_x TYPE i ##NEEDED.')).toEqual([
      ['DATA', TokenType.Identifier, 1, 1],
      ['lv_x', TokenType.Identifier, 1, 6],
      ['TYPE', TokenType.Identifier, 1, 11],
      ['i', TokenType.Identifier, 1, 16],
      ['##NEEDED', TokenType.Pragma, 1, 18],
      ['.', TokenType.Punctuation, 1, 26],
    ]);
  });

  it('프래그마가 연달아 와도 각각 Pragma', () => {
    expect(shape('DATA lv_x TYPE i ##NEEDED ##NO_TEXT.').slice(4)).toEqual([
      ['##NEEDED', TokenType.Pragma, 1, 18],
      ['##NO_TEXT', TokenType.Pragma, 1, 27],
      ['.', TokenType.Punctuation, 1, 36],
    ]);
  });

  it('맨 앞 프래그마도 Pragma', () => {
    expect(shape('##NEEDED DATA lv_x TYPE i.')[0]).toEqual(['##NEEDED', TokenType.Pragma, 1, 1]);
  });
});

describe('tokenize — 연산자 붙여쓰기와 공백 변종', () => {
  it('등호는 분리 문자가 아니라 붙여쓰면 한 토큰이 된다 (구 구현 승계)', () => {
    expect(shape('lv_a=lv_b+1-2.')).toEqual([
      ['lv_a=lv_b', TokenType.Identifier, 1, 1],
      ['+', TokenType.Plus, 1, 10],
      ['1', TokenType.Identifier, 1, 11],
      ['-', TokenType.Dash, 1, 12],
      ['2', TokenType.Identifier, 1, 13],
      ['.', TokenType.Punctuation, 1, 14],
    ]);
  });

  it('화살표는 앞뒤 공백에 따라 4변종으로 갈린다', () => {
    expect(shape('lo_a->meth( ).')[1]).toEqual(['->', TokenType.InstanceArrow, 1, 5]);
    expect(shape('lo_a -> meth( ).')[1]).toEqual(['->', TokenType.WInstanceArrowW, 1, 6]);
    expect(shape('lo_a ->meth( ).')[1]).toEqual(['->', TokenType.WInstanceArrow, 1, 6]);
    expect(shape('zcl_a=>b( ).')[1]).toEqual(['=>', TokenType.StaticArrow, 1, 6]);
  });

  it('괄호·대괄호도 공백 변종을 갖는다', () => {
    expect(shape('lo_a->meth( ).').slice(3, 5)).toEqual([
      ['(', TokenType.ParenLeftW, 1, 11],
      [')', TokenType.WParenRightW, 1, 13],
    ]);
    expect(shape('lv_x = lt_y[ 1 ].').slice(3)).toEqual([
      ['[', TokenType.BracketLeftW, 1, 12],
      ['1', TokenType.Identifier, 1, 14],
      [']', TokenType.WBracketRightW, 1, 16],
      ['.', TokenType.Punctuation, 1, 17],
    ]);
  });

  it('오프셋 표기는 Plus·Paren으로 잘게 갈린다', () => {
    expect(shape("lv_x+3(2) = 'ab'.")).toEqual([
      ['lv_x', TokenType.Identifier, 1, 1],
      ['+', TokenType.Plus, 1, 5],
      ['3', TokenType.Identifier, 1, 6],
      ['(', TokenType.ParenLeft, 1, 7],
      ['2', TokenType.Identifier, 1, 8],
      [')', TokenType.ParenRightW, 1, 9],
      ['=', TokenType.Identifier, 1, 11],
      ["'ab'", TokenType.StringToken, 1, 13],
      ['.', TokenType.Punctuation, 1, 17],
    ]);
  });

  it('구성요소 접근의 대시는 Dash로 갈라진다', () => {
    expect(shape('foo-bar = 1.').slice(0, 3)).toEqual([
      ['foo', TokenType.Identifier, 1, 1],
      ['-', TokenType.Dash, 1, 4],
      ['bar', TokenType.Identifier, 1, 5],
    ]);
  });

  it('호스트 변수 @는 앞 공백에 따라 WAt', () => {
    expect(shape('SELECT * FROM t INTO @lv_x.').slice(5, 7)).toEqual([
      ['@', TokenType.WAt, 1, 22],
      ['lv_x', TokenType.Identifier, 1, 23],
    ]);
  });

  it('콜론은 Identifier로 나온다', () => {
    expect(shape('DATA: lv_a TYPE i.')[1]).toEqual([':', TokenType.Identifier, 1, 5]);
  });
});

describe('tokenize — 열 계산은 UTF-8 바이트 기준 (구 구현 실측)', () => {
  it('라틴 확장 글자가 뒤 토큰의 열을 바이트만큼 민다', () => {
    expect(shape("WRITE 'héllo'. WRITE 'x'.")).toEqual([
      ['WRITE', TokenType.Identifier, 1, 1],
      ["'héllo'", TokenType.StringToken, 1, 7],
      ['.', TokenType.Punctuation, 1, 15],
      ['WRITE', TokenType.Identifier, 1, 17],
      ["'x'", TokenType.StringToken, 1, 23],
      ['.', TokenType.Punctuation, 1, 26],
    ]);
  });

  it('한글은 글자당 3바이트로 열이 밀린다', () => {
    expect(shape('lv_한글 = 1.')).toEqual([
      ['lv_한글', TokenType.Identifier, 1, 1],
      ['=', TokenType.Identifier, 1, 11],
      ['1', TokenType.Identifier, 1, 13],
      ['.', TokenType.Punctuation, 1, 14],
    ]);
  });

  it('한글 주석 다음 줄의 열은 1부터 다시 센다', () => {
    expect(shape('" 한글 주석\nDATA lv_a TYPE i.').slice(0, 2)).toEqual([
      ['" 한글 주석', TokenType.Comment, 1, 1],
      ['DATA', TokenType.Identifier, 2, 1],
    ]);
  });
});
