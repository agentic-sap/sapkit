// 자작 인자 파서 시험 — 외부 의존 0의 전제를 지키는 부품이라 여기서 못 박는다.

import { UsageError, parseArgs } from '../args';

describe('parseArgs', () => {
  it('위치 인자를 순서대로 모은다', () => {
    expect(parseArgs(['a.abap', 'b.abap'], {}).positionals).toEqual(['a.abap', 'b.abap']);
  });

  it('불리언 깃발은 값 없이 선다', () => {
    const args = parseArgs(['--stdin'], { stdin: 'boolean' });
    expect(args.bool('stdin')).toBe(true);
    expect(args.bool('nope')).toBe(false);
  });

  it('문자열 깃발은 `--이름 값`과 `--이름=값` 둘 다 받는다', () => {
    expect(parseArgs(['--format', 'json'], { format: 'string' }).str('format', 'text')).toBe('json');
    expect(parseArgs(['--format=json'], { format: 'string' }).str('format', 'text')).toBe('json');
  });

  it('없는 깃발은 기본값으로 떨어진다', () => {
    expect(parseArgs([], { format: 'string' }).str('format', 'text')).toBe('text');
    expect(parseArgs([], { 'max-length': 'number' }).num('max-length', 120)).toBe(120);
  });

  it('숫자 깃발은 정수만 받는다', () => {
    expect(parseArgs(['--max-length', '80'], { 'max-length': 'number' }).num('max-length', 120)).toBe(80);
    expect(() => parseArgs(['--max-length', 'wide'], { 'max-length': 'number' })).toThrow(UsageError);
    expect(() => parseArgs(['--max-length', '1.5'], { 'max-length': 'number' })).toThrow(UsageError);
  });

  it('마지막 지정이 이긴다', () => {
    expect(parseArgs(['--format=text', '--format=json'], { format: 'string' }).str('format', 'text')).toBe('json');
  });

  it('모르는 깃발은 사용 오류다', () => {
    expect(() => parseArgs(['--wat'], {})).toThrow(UsageError);
    expect(() => parseArgs(['--wat=1'], { format: 'string' })).toThrow(UsageError);
  });

  it('짧은 깃발은 지원하지 않는다', () => {
    expect(() => parseArgs(['-f'], { format: 'string' })).toThrow(UsageError);
  });

  it('값이 빠진 문자열 깃발은 사용 오류다', () => {
    expect(() => parseArgs(['--format'], { format: 'string' })).toThrow(UsageError);
  });

  it('불리언 깃발에 값을 붙이면 사용 오류다', () => {
    expect(() => parseArgs(['--stdin=1'], { stdin: 'boolean' })).toThrow(UsageError);
  });

  it('`--` 뒤는 전부 위치 인자다', () => {
    const args = parseArgs(['--', '--stdin', '-x'], { stdin: 'boolean' });
    expect(args.positionals).toEqual(['--stdin', '-x']);
    expect(args.bool('stdin')).toBe(false);
  });

  it('홑 하이픈은 위치 인자로 본다', () => {
    expect(parseArgs(['-'], {}).positionals).toEqual(['-']);
  });
});
