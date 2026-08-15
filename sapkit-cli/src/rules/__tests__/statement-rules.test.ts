// 문장을 보는 규칙 5종 단위 시험 — empty_statement · max_one_statement ·
// obsolete_statement · preferred_compare_operator · local_variable_names.
//
// 구 구현이 그렇게 판정했기 때문에 그렇게 기대하는 칸이 몇 군데 있다. 그런 칸에는
// 「구 구현 승계」라고 적어 두었다 — 조이거나 고치면 기준과 갈린다.

import { AbapFile } from '../../core';
import {
  LOCAL_NAME_PATTERNS,
  emptyStatementRule,
  localVariableNamesRule,
  maxOneStatementRule,
  obsoleteStatementRule,
  preferredCompareOperatorRule,
} from '../index';
import type { Rule } from '../index';

/** 판정을 [규칙, 행, 열, 심각도]로 편다 — 문구는 계약이 아니므로 대조하지 않는다. */
function shape(rule: Rule, source: string): Array<[string, number, number, string]> {
  return rule.run(new AbapFile('t.abap', source)).map((f) => [f.rule, f.row, f.col, f.severity]);
}

/** 메서드 본문 한 줄을 감싼 최소 클래스. */
function inMethod(body: string): string {
  return ['CLASS zcl_demo IMPLEMENTATION.', '  METHOD run.', `    ${body}`, '  ENDMETHOD.', 'ENDCLASS.'].join('\n');
}

describe('empty_statement', () => {
  it('홀로 선 마침표를 Error로 잡는다', () => {
    expect(shape(emptyStatementRule(), "WRITE 'first'.\n.\nWRITE 'second'.\n.")).toEqual([
      ['empty_statement', 2, 1, 'Error'],
      ['empty_statement', 4, 1, 'Error'],
    ]);
  });

  it('보통 문장은 건드리지 않는다', () => {
    expect(shape(emptyStatementRule(), "WRITE 'first'.\nDATA lv_a TYPE i.")).toEqual([]);
  });

  it('빈 줄은 문장이 아니라 아무 일도 없다', () => {
    expect(shape(emptyStatementRule(), 'DATA lv_a TYPE i.\n\n\n')).toEqual([]);
  });
});

describe('max_one_statement', () => {
  it('한 행의 두 번째 문장을 Error로 잡는다', () => {
    expect(shape(maxOneStatementRule(), 'lv_a = 1. lv_b = 2.')).toEqual([
      ['max_one_statement', 1, 11, 'Error'],
    ]);
  });

  it('한 행 한 문장이면 조용하다', () => {
    expect(shape(maxOneStatementRule(), 'lv_a = 1.\nlv_b = 2.')).toEqual([]);
  });

  it('콜론 체인은 통째로 건너뛴다 (구 구현 승계 — 한 논리 묶음으로 본다)', () => {
    expect(shape(maxOneStatementRule(), 'DATA: lv_a TYPE i, lv_b TYPE string.')).toEqual([]);
  });

  it('후행 주석은 문장 수에 들지 않는다', () => {
    expect(shape(maxOneStatementRule(), 'lv_a = 1. " done')).toEqual([]);
  });

  it('여러 행에 걸친 문장은 마지막 행에 끝을 표시한다', () => {
    expect(shape(maxOneStatementRule(), 'DATA lv_a\n  TYPE i. lv_b = 2.')).toEqual([
      ['max_one_statement', 2, 11, 'Error'],
    ]);
  });
});

describe('obsolete_statement', () => {
  const rule = obsoleteStatementRule({ refresh: true });

  it('낡은 계산·대입 구문을 첫 토큰 자리에서 Warning으로 잡는다', () => {
    const source = [
      'COMPUTE lv_a = 1 + 2.',
      'ADD 1 TO lv_a.',
      'SUBTRACT 1 FROM lv_a.',
      'MULTIPLY lv_a BY 2.',
      'DIVIDE lv_a BY 2.',
      'MOVE lv_a TO lv_b.',
    ].join('\n');
    expect(shape(rule, source)).toEqual([
      ['obsolete_statement', 1, 1, 'Warning'],
      ['obsolete_statement', 2, 1, 'Warning'],
      ['obsolete_statement', 3, 1, 'Warning'],
      ['obsolete_statement', 4, 1, 'Warning'],
      ['obsolete_statement', 5, 1, 'Warning'],
      ['obsolete_statement', 6, 1, 'Warning'],
    ]);
  });

  it('MOVE-CORRESPONDING도 MOVE로 잡힌다 (첫 토큰만 보기 때문)', () => {
    expect(shape(rule, 'MOVE-CORRESPONDING ls_src TO ls_dst.')).toEqual([
      ['obsolete_statement', 1, 1, 'Warning'],
    ]);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(shape(rule, 'move lv_a TO lv_b.')).toEqual([['obsolete_statement', 1, 1, 'Warning']]);
  });

  it('REFRESH는 표면마다 켜고 끈다', () => {
    expect(shape(rule, 'REFRESH lt_items.')).toEqual([['obsolete_statement', 1, 1, 'Warning']]);
    expect(shape(obsoleteStatementRule({ refresh: false }), 'REFRESH lt_items.')).toEqual([]);
  });

  it('현대 표현은 조용하다', () => {
    expect(shape(rule, 'lv_a = lv_a + 1.\nCLEAR lt_items.')).toEqual([]);
  });

  it('주석 안의 낡은 낱말은 잡지 않는다', () => {
    expect(shape(rule, '* MOVE lv_a TO lv_b.')).toEqual([]);
  });
});

describe('preferred_compare_operator', () => {
  const rule = preferredCompareOperatorRule();

  it('조건문 안의 낡은 비교 연산자를 그 자리에서 Error로 잡는다', () => {
    expect(shape(rule, 'IF lv_a EQ 1.\nENDIF.')).toEqual([['preferred_compare_operator', 1, 9, 'Error']]);
    expect(shape(rule, 'ELSEIF lv_a NE 2.')).toEqual([['preferred_compare_operator', 1, 13, 'Error']]);
    expect(shape(rule, 'WHILE lv_b LT 10.\nENDWHILE.')).toEqual([
      ['preferred_compare_operator', 1, 12, 'Error'],
    ]);
  });

  it('한 문장 안의 여러 건을 모두 낸다', () => {
    expect(shape(rule, 'IF lv_a GT 0 AND lv_a >< 5.\nENDIF.')).toEqual([
      ['preferred_compare_operator', 1, 9, 'Error'],
      ['preferred_compare_operator', 1, 23, 'Error'],
    ]);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(shape(rule, 'if lv_a eq 1.\nendif.')).toEqual([['preferred_compare_operator', 1, 9, 'Error']]);
  });

  it('현대 연산자는 조용하다', () => {
    expect(shape(rule, 'IF lv_a = 1 AND lv_b <> 2.\nENDIF.')).toEqual([]);
  });

  it('CHECK 문은 범위 밖이다 (구 구현 승계 — 분류기가 Check 유형을 만들지 않는다)', () => {
    expect(shape(rule, 'CHECK lv_a EQ 1.')).toEqual([]);
  });

  it('조건문이 아닌 문장 안의 EQ는 보지 않는다', () => {
    expect(shape(rule, "WRITE 'EQ'.\nlv_a = 1.")).toEqual([]);
  });
});

describe('local_variable_names', () => {
  const rule = localVariableNamesRule(LOCAL_NAME_PATTERNS);

  it('메서드 안의 규약 밖 변수 이름을 그 이름 자리에서 Warning으로 잡는다', () => {
    expect(shape(rule, inMethod('DATA counter TYPE i.'))).toEqual([
      ['local_variable_names', 3, 10, 'Warning'],
    ]);
  });

  it('규약에 맞는 이름은 조용하다', () => {
    expect(shape(rule, inMethod('DATA lv_count TYPE i.'))).toEqual([]);
    expect(shape(rule, inMethod('DATA lt_items TYPE STANDARD TABLE OF i.'))).toEqual([]);
  });

  it('lo_ 접두는 데이터 무늬가 거부한다 (구 구현 승계 — 제안 문구는 lo_를 권하는데도)', () => {
    expect(shape(rule, inMethod('DATA lo_helper TYPE REF TO object.'))).toEqual([
      ['local_variable_names', 3, 10, 'Warning'],
    ]);
  });

  it('상수는 상수 무늬로 본다', () => {
    expect(shape(rule, inMethod('CONSTANTS gc_limit TYPE i VALUE 10.'))).toEqual([
      ['local_variable_names', 3, 15, 'Warning'],
    ]);
    expect(shape(rule, inMethod('CONSTANTS lc_limit TYPE i VALUE 10.'))).toEqual([]);
  });

  it('FIELD-SYMBOLS는 이름이 규약에 맞아도 늘 울린다 (구 구현 승계 — 세 번째 토큰이 늘 SYMBOLS)', () => {
    expect(shape(rule, inMethod('FIELD-SYMBOLS <lv_row> TYPE i.'))).toEqual([
      ['local_variable_names', 3, 11, 'Warning'],
    ]);
  });

  it('FORM과 FUNCTION 안도 지역 범위다', () => {
    expect(shape(rule, 'FORM check.\n  DATA counter TYPE i.\nENDFORM.')).toEqual([
      ['local_variable_names', 2, 8, 'Warning'],
    ]);
    expect(shape(rule, 'FUNCTION z_demo.\n  DATA counter TYPE i.\nENDFUNCTION.')).toEqual([
      ['local_variable_names', 2, 8, 'Warning'],
    ]);
  });

  it('블록 밖 선언은 범위 밖이다', () => {
    expect(shape(rule, 'DATA gv_outside TYPE i.')).toEqual([]);
    expect(shape(rule, 'FORM check.\nENDFORM.\nDATA gv_outside TYPE i.')).toEqual([]);
  });

  it('콜론 체인의 각 조각도 제 이름으로 본다', () => {
    expect(shape(rule, inMethod('DATA: lv_a TYPE i, counter TYPE i.'))).toEqual([
      ['local_variable_names', 3, 24, 'Warning'],
    ]);
  });

  it('무늬의 대소문자 무시는 유니코드 겹침까지 본다 (구 구현 실측)', () => {
    // 긴 s(U+017F)는 구 검사기의 무늬에서 `\w`에 걸려 규약 안이다 — 여기서도 조용해야 한다.
    expect(shape(rule, inMethod('CONSTANTS lc_fooſ TYPE i VALUE 1.'))).toEqual([]);
  });

  it('무늬가 비면 한 건도 내지 않는다 (analyze 표면의 무동작 승계)', () => {
    const silent = localVariableNamesRule();
    expect(shape(silent, inMethod('DATA counter TYPE i.'))).toEqual([]);
    expect(shape(silent, inMethod('FIELD-SYMBOLS <lv_row> TYPE i.'))).toEqual([]);
  });
});
