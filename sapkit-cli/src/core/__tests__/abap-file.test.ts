// 파일 객체 API 시험 — 규칙(T4)과 CLI(T5)는 이 표면만 보고 쓴다.

import { AbapFile, TokenType } from '../index';

const SRC = ['REPORT zfoo.', '', 'DATA: lv_a TYPE i,', '      lv_b TYPE string.', '" done'].join('\n');

describe('AbapFile', () => {
  it('파일 이름과 원문을 그대로 들고 있다', () => {
    const file = new AbapFile('zfoo.prog.abap', SRC);
    expect(file.filename).toBe('zfoo.prog.abap');
    expect(file.raw).toBe(SRC);
  });

  it('원문 행은 줄바꿈으로만 자른다 (빈 줄 포함)', () => {
    const file = new AbapFile('t.abap', SRC);
    expect(file.getRawRows()).toEqual([
      'REPORT zfoo.',
      '',
      'DATA: lv_a TYPE i,',
      '      lv_b TYPE string.',
      '" done',
    ]);
  });

  it('원문 행은 CR을 걷어내지 않는다 (구 구현 승계 — 토큰만 CR을 뗀다)', () => {
    const file = new AbapFile('t.abap', 'DATA a TYPE i.\r\nDATA b TYPE i.');
    expect(file.getRawRows()).toEqual(['DATA a TYPE i.\r', 'DATA b TYPE i.']);
    expect(file.getTokens()[0]?.str).toBe('DATA');
  });

  it('두 번 불러도 같은 행 배열을 준다', () => {
    const file = new AbapFile('t.abap', SRC);
    expect(file.getRawRows()).toBe(file.getRawRows());
  });

  it('토큰에 행·열이 실려 나온다', () => {
    const file = new AbapFile('t.abap', SRC);
    expect(file.getTokens()[0]).toEqual({
      str: 'REPORT',
      type: TokenType.Identifier,
      row: 1,
      col: 1,
    });
  });

  it('문장은 이미 분류된 상태로 나온다', () => {
    const file = new AbapFile('t.abap', SRC);
    expect(file.getStatements().map((s) => s.type)).toEqual(['Report', 'Data', 'Data', 'Comment']);
  });

  it('빈 파일도 다룰 수 있다', () => {
    const file = new AbapFile('t.abap', '');
    expect(file.getTokens()).toEqual([]);
    expect(file.getStatements()).toEqual([]);
    expect(file.getRawRows()).toEqual(['']);
  });
});
