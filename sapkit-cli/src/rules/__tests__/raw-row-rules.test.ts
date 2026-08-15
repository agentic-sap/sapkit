// 원문 행을 보는 규칙 3종 단위 시험 — line_length · colon_missing_space · double_space.
//
// 이 셋은 토큰을 보지 않고 행 문자열을 바로 훑는다. 그래서 **길이도 열도 UTF-8 바이트**
// 자리이며(구 구현이 Go 문자열을 바이트로 색인했다), 여기 기대값은 그 실측이다.

import { AbapFile } from '../../core';
import { colonMissingSpaceRule, doubleSpaceRule, lineLengthRule } from '../index';
import type { Rule } from '../index';

/** 판정을 [규칙, 행, 열, 심각도]로 편다 — 문구는 계약이 아니므로 대조하지 않는다. */
function shape(rule: Rule, source: string): Array<[string, number, number, string]> {
  return rule.run(new AbapFile('t.abap', source)).map((f) => [f.rule, f.row, f.col, f.severity]);
}

describe('line_length', () => {
  it('상한을 넘긴 행 하나를 열 1에 Warning으로 잡는다', () => {
    expect(shape(lineLengthRule(120), `* ${'x'.repeat(119)}`)).toEqual([['line_length', 1, 1, 'Warning']]);
  });

  it('상한과 같은 길이는 넘긴 것이 아니다', () => {
    expect(shape(lineLengthRule(120), 'x'.repeat(120))).toEqual([]);
  });

  it('255를 넘기면 Error로 올라간다', () => {
    expect(shape(lineLengthRule(120), 'x'.repeat(256))).toEqual([['line_length', 1, 1, 'Error']]);
  });

  it('255 정확히는 아직 Warning이다', () => {
    expect(shape(lineLengthRule(120), 'x'.repeat(255))).toEqual([['line_length', 1, 1, 'Warning']]);
  });

  it('길이는 글자가 아니라 바이트로 잰다', () => {
    // 한글 41자 = 123바이트. 글자 수로 재면 상한 120을 넘지 않는다.
    expect(shape(lineLengthRule(120), '가'.repeat(41))).toEqual([['line_length', 1, 1, 'Warning']]);
    expect(shape(lineLengthRule(120), '가'.repeat(40))).toEqual([]);
  });

  it('행 끝 CR은 길이에서 뺀다', () => {
    expect(shape(lineLengthRule(120), `${'x'.repeat(120)}\r\nDATA lv_a TYPE i.`)).toEqual([]);
    expect(shape(lineLengthRule(120), `${'x'.repeat(121)}\r\nDATA lv_a TYPE i.`)).toEqual([
      ['line_length', 1, 1, 'Warning'],
    ]);
  });

  it('상한이 0 이하면 120으로 되돌린다 (구 구현 승계 — CLI의 --max-length 0)', () => {
    expect(shape(lineLengthRule(0), 'x'.repeat(121))).toEqual([['line_length', 1, 1, 'Warning']]);
    expect(shape(lineLengthRule(0), 'x'.repeat(120))).toEqual([]);
  });

  it('상한을 올리면 같은 행이 조용해진다 (analyze 표면의 130)', () => {
    expect(shape(lineLengthRule(130), 'x'.repeat(125))).toEqual([]);
    expect(shape(lineLengthRule(130), 'x'.repeat(131))).toEqual([['line_length', 1, 1, 'Warning']]);
  });

  it('파일당 10건에서 조기 중단한다 (구 구현 승계 — 11번째부터는 안 센다)', () => {
    const source = Array.from({ length: 15 }, () => 'x'.repeat(121)).join('\n');
    const rows = shape(lineLengthRule(120), source).map(([, row]) => row);
    expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('colon_missing_space', () => {
  it('공백 없는 콜론을 그 자리에서 잡는다', () => {
    expect(shape(colonMissingSpaceRule(), 'DATA:lv_a TYPE i.')).toEqual([
      ['colon_missing_space', 1, 5, 'Warning'],
    ]);
  });

  it('콜론 뒤에 공백이 있으면 조용하다', () => {
    expect(shape(colonMissingSpaceRule(), 'DATA: lv_a TYPE i.')).toEqual([]);
  });

  it('한 행에 여러 개가 있어도 첫 건만 낸다', () => {
    expect(shape(colonMissingSpaceRule(), 'WRITE:/ lv_a:x.')).toEqual([
      ['colon_missing_space', 1, 6, 'Warning'],
    ]);
  });

  it('행 맨 끝 콜론은 잡지 않는다 (뒤 글자를 봐야 하기 때문)', () => {
    expect(shape(colonMissingSpaceRule(), 'DATA:')).toEqual([]);
  });

  it('문자열 리터럴 안의 콜론은 건너뛴다', () => {
    expect(shape(colonMissingSpaceRule(), "lv_msg = 'window 10:30 to 11:45'.")).toEqual([]);
    expect(shape(colonMissingSpaceRule(), 'lv_msg = `10:30`.')).toEqual([]);
  });

  it('주석 안의 콜론은 건너뛰지 않는다 (구 구현 승계 — 행을 글자로만 본다)', () => {
    expect(shape(colonMissingSpaceRule(), '* note:here')).toEqual([['colon_missing_space', 1, 7, 'Warning']]);
  });

  it('열은 바이트 자리다', () => {
    // '가'는 3바이트라 콜론이 열 3이 아니라 열 7에 선다.
    expect(shape(colonMissingSpaceRule(), '가가:x')).toEqual([['colon_missing_space', 1, 7, 'Warning']]);
  });

  it('행마다 따로 센다', () => {
    expect(shape(colonMissingSpaceRule(), 'DATA:lv_a TYPE i.\nWRITE:/ lv_a.')).toEqual([
      ['colon_missing_space', 1, 5, 'Warning'],
      ['colon_missing_space', 2, 6, 'Warning'],
    ]);
  });
});

describe('double_space', () => {
  it('코드부의 이중 공백을 첫 자리에서 잡는다', () => {
    expect(shape(doubleSpaceRule(), 'lv_a  = 1.')).toEqual([['double_space', 1, 5, 'Warning']]);
  });

  it('한 행에 여러 개가 있어도 첫 건만 낸다', () => {
    expect(shape(doubleSpaceRule(), 'lv_a  =  1.')).toEqual([['double_space', 1, 5, 'Warning']]);
  });

  it('들여쓰기는 이중 공백으로 세지 않는다', () => {
    expect(shape(doubleSpaceRule(), '    lv_a = 1.')).toEqual([]);
  });

  it('별표 주석행과 따옴표 주석행은 통째로 건너뛴다', () => {
    expect(shape(doubleSpaceRule(), '*  double  spaces here')).toEqual([]);
    expect(shape(doubleSpaceRule(), '"  double  spaces here')).toEqual([]);
    expect(shape(doubleSpaceRule(), '  *  indented comment')).toEqual([]);
  });

  it('후행 주석 안쪽은 코드부 밖이라 세지 않는다', () => {
    expect(shape(doubleSpaceRule(), 'lv_b = 2. " a trailing  comment')).toEqual([]);
  });

  it('후행 주석 **앞의** 이중 공백은 코드부라 잡는다 (구 구현 승계)', () => {
    expect(shape(doubleSpaceRule(), 'lv_b = 2.  " tail')).toEqual([['double_space', 1, 10, 'Warning']]);
  });

  it('행 끝 공백은 먼저 떼므로 잡히지 않는다', () => {
    expect(shape(doubleSpaceRule(), 'lv_a = 1.   ')).toEqual([]);
  });

  it('열은 바이트 자리다', () => {
    expect(shape(doubleSpaceRule(), '가  = 1.')).toEqual([['double_space', 1, 4, 'Warning']]);
  });
});
