// 문장 분할기 단위 시험.
// 기대값은 구 vsp 검사기(Go)를 실제로 돌려 실측한 것이다.

import { concatTokens, firstTokenStr, splitStatements, tokenize } from '../index';
import type { Statement } from '../index';

function split(source: string): Statement[] {
  return splitStatements(tokenize(source));
}

/** 분할 결과를 [유형, 토큰 이어붙임, 콜론 여부, 프래그마 수]로 편다. */
function shape(source: string): Array<[string, string, boolean, number]> {
  return split(source).map((s) => [s.type, concatTokens(s), s.colon !== null, s.pragmas.length]);
}

describe('splitStatements — 마침표 분할', () => {
  it('한 문장은 마침표를 포함해 한 덩어리', () => {
    expect(shape('DATA lv_x TYPE i.')).toEqual([['Unknown', 'DATA lv_x TYPE i .', false, 0]]);
  });

  it('한 줄에 두 문장도 마침표마다 끊는다', () => {
    expect(shape('lv_a = 1 . lv_b = 2 .')).toEqual([
      ['Unknown', 'lv_a = 1 .', false, 0],
      ['Unknown', 'lv_b = 2 .', false, 0],
    ]);
  });

  it('마침표 없는 마지막 문장도 문장으로 남는다', () => {
    expect(shape('DATA lv_x TYPE i')).toEqual([['Unknown', 'DATA lv_x TYPE i', false, 0]]);
  });

  it('원문이 비면 문장도 없다', () => {
    expect(split('')).toEqual([]);
    expect(split('   ')).toEqual([]);
  });
});

describe('splitStatements — 콜론 체이닝', () => {
  it('접두부를 공유하는 문장 2개로 전개한다', () => {
    expect(shape('DATA: lv_x TYPE i, lv_y TYPE string.')).toEqual([
      ['Unknown', 'DATA lv_x TYPE i ,', true, 0],
      ['Unknown', 'DATA lv_y TYPE string .', true, 0],
    ]);
  });

  it('콜론 토큰 자체는 문장 토큰에서 빠진다', () => {
    const first = split('DATA: lv_x TYPE i, lv_y TYPE string.')[0];
    expect(first?.tokens.map((t) => t.str)).toEqual(['DATA', 'lv_x', 'TYPE', 'i', ',']);
    expect(first?.colon?.str).toBe(':');
  });

  it('접두부가 여러 토큰이어도 통째로 공유한다', () => {
    expect(shape("WRITE: / 'a', / 'b'.")).toEqual([
      ['Unknown', "WRITE / 'a' ,", true, 0],
      ['Unknown', "WRITE / 'b' .", true, 0],
    ]);
  });

  it('콜론이 겹쳐 나오면 뒤엣것은 버린다', () => {
    expect(shape('DATA: : lv_x TYPE i.')).toEqual([['Unknown', 'DATA lv_x TYPE i .', true, 0]]);
  });

  it('체인 끝에 쉼표가 남으면 접두부만 있는 문장이 하나 더 생긴다 (구 구현 승계)', () => {
    expect(shape('DATA: lv_a TYPE i,.')).toEqual([
      ['Unknown', 'DATA lv_a TYPE i ,', true, 0],
      ['Unknown', 'DATA .', true, 0],
    ]);
  });

  it('체인 중간의 주석은 별도 문장으로 끼어들되 체인을 끊지 않는다', () => {
    expect(shape('DATA: lv_a TYPE i, " mid comment\n      lv_b TYPE i.')).toEqual([
      ['Unknown', 'DATA lv_a TYPE i ,', true, 0],
      ['Comment', '" mid comment', false, 0],
      ['Unknown', 'DATA lv_b TYPE i .', true, 0],
    ]);
  });

  it('콜론 없는 쉼표는 문장을 끊지 않는다', () => {
    expect(shape('SPLIT lv_a AT \',\' INTO lv_b, lv_c.')).toEqual([
      ['Unknown', "SPLIT lv_a AT ',' INTO lv_b , lv_c .", false, 0],
    ]);
  });
});

describe('splitStatements — 주석·빈 문장', () => {
  it('주석은 자기 문장이고 유형이 Comment로 확정된다', () => {
    expect(shape('* this is a comment\nDATA lv_x TYPE i.')).toEqual([
      ['Comment', '* this is a comment', false, 0],
      ['Unknown', 'DATA lv_x TYPE i .', false, 0],
    ]);
  });

  it('마침표 하나뿐이면 Empty', () => {
    expect(shape('.')).toEqual([['Empty', '.', false, 0]]);
  });
});

describe('splitStatements — 프래그마 분리', () => {
  it('문장 안의 프래그마는 토큰에서 빠져 pragmas로 간다', () => {
    expect(shape('DATA lv_x TYPE i ##NEEDED.')).toEqual([['Unknown', 'DATA lv_x TYPE i .', false, 1]]);
    expect(split('DATA lv_x TYPE i ##NEEDED.')[0]?.pragmas.map((t) => t.str)).toEqual(['##NEEDED']);
  });

  it('프래그마 두 개도 모두 빠진다', () => {
    expect(shape('DATA lv_x TYPE i ##NEEDED ##NO_TEXT.')).toEqual([
      ['Unknown', 'DATA lv_x TYPE i .', false, 2],
    ]);
  });

  it('맨 앞 프래그마도 빠진다', () => {
    expect(shape('##NEEDED DATA lv_x TYPE i.')).toEqual([['Unknown', 'DATA lv_x TYPE i .', false, 1]]);
  });

  it('프래그마가 문장의 마지막 토큰이면 남는다 (구 구현 승계)', () => {
    expect(shape('DATA lv_x TYPE i ##NEEDED')).toEqual([
      ['Unknown', 'DATA lv_x TYPE i ##NEEDED', false, 0],
    ]);
  });
});

describe('splitStatements — NativeSQL 후처리', () => {
  it('METHOD ... BY DATABASE 이후는 ENDMETHOD까지 NativeSQL', () => {
    expect(
      shape('METHOD m BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT.\nselect * from t;\nENDMETHOD.'),
    ).toEqual([
      ['Unknown', 'METHOD m BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT .', false, 0],
      ['NativeSQL', 'select * from t;', false, 0],
      ['Unknown', 'ENDMETHOD .', false, 0],
    ]);
  });

  it('마지막 SQL 문장에 ENDMETHOD가 붙어 오면 떼어낸다', () => {
    expect(
      shape('METHOD m BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT.\nselect * from t\nENDMETHOD.'),
    ).toEqual([
      ['Unknown', 'METHOD m BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT .', false, 0],
      ['NativeSQL', 'select * from t', false, 0],
      ['Unknown', 'ENDMETHOD .', false, 0],
    ]);
  });

  it('SQL 구간 안의 주석도 NativeSQL로 덮인다 (구 구현 승계)', () => {
    expect(shape('METHOD m BY DATABASE PROCEDURE.\n* comment inside\nselect 1;\nENDMETHOD.')).toEqual([
      ['Unknown', 'METHOD m BY DATABASE PROCEDURE .', false, 0],
      ['NativeSQL', '* comment inside', false, 0],
      ['NativeSQL', 'select 1;', false, 0],
      ['Unknown', 'ENDMETHOD .', false, 0],
    ]);
  });

  it('BY DATABASE가 없으면 SQL 구간도 없다', () => {
    expect(shape('METHOD m.\nlv_a = 1.\nENDMETHOD.')).toEqual([
      ['Unknown', 'METHOD m .', false, 0],
      ['Unknown', 'lv_a = 1 .', false, 0],
      ['Unknown', 'ENDMETHOD .', false, 0],
    ]);
  });
});

describe('문장 도우미', () => {
  it('concatTokens는 토큰을 공백 하나로 잇는다', () => {
    const stmt = split('DATA lv_x TYPE i.')[0];
    expect(stmt && concatTokens(stmt)).toBe('DATA lv_x TYPE i .');
  });

  it('firstTokenStr은 첫 토큰을 대문자로 준다', () => {
    const stmt = split('data lv_x type i.')[0];
    expect(stmt && firstTokenStr(stmt)).toBe('DATA');
  });

  it('토큰이 없으면 도우미는 빈 문자열', () => {
    const empty: Statement = { tokens: [], pragmas: [], type: 'Unknown', colon: null };
    expect(concatTokens(empty)).toBe('');
    expect(firstTokenStr(empty)).toBe('');
  });
});
