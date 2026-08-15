// analyze 결과 형태 시험 — 구 `CodeAnalysisResult`의 **계약 표면**을 못 박는다.
//
// 키 이름(camelCase)·정렬(행, 규칙)·score 산식·500KB 되돌림은 구 코드 실측
// (`vsp/pkg/adt/codeanalysis.go` `AnalyzeABAPSource`·`calculateCodeScore`)이다.
// 문구(description·suggestion)는 새로 썼으므로 시험하지 않는다.

import { ANALYZE_MAX_SOURCE_BYTES, analyzeSource } from '../analyze';

describe('analyzeSource — 결과 형태', () => {
  it('최상위 키는 findings · summary · rulesApplied 셋이다', () => {
    expect(Object.keys(analyzeSource('DATA lv_a TYPE i.'))).toEqual(['findings', 'summary', 'rulesApplied']);
  });

  it('발견이 없어도 findings는 빈 배열 · summary는 빈 셈이다', () => {
    const result = analyzeSource('DATA lv_a TYPE i.');
    expect(result.findings).toEqual([]);
    expect(result.summary).toEqual({ totalFindings: 0, bySeverity: {}, byCategory: {}, score: 'good' });
    expect(result.rulesApplied).toBe(13);
  });

  it('발견 하나의 키는 8종을 순서대로 갖는다', () => {
    const result = analyzeSource('CATCH cx_root.');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(Object.keys(result.findings[0] ?? {})).toEqual([
      'rule',
      'category',
      'severity',
      'line',
      'endLine',
      'match',
      'description',
      'suggestion',
    ]);
  });

  it('endLine은 line과 같다 (구 구현 승계)', () => {
    for (const f of analyzeSource('CATCH cx_root.').findings) {
      expect(f.endLine).toBe(f.line);
    }
  });

  it('match와 description은 같은 문구다 (구 구현 승계)', () => {
    for (const f of analyzeSource('CATCH cx_root.').findings) {
      expect(f.match).toBe(f.description);
      expect(f.match.length).toBeGreaterThan(0);
    }
  });

  it('심각도는 Error→high · Warning→medium이다', () => {
    const warning = analyzeSource('lv_a  = 1.');
    expect(warning.findings.map((f) => f.severity)).toEqual(['medium']);
    const error = analyzeSource('.');
    expect(error.findings.map((f) => f.severity)).toEqual(['high']);
  });

  it('(행, 규칙) 순으로 정렬한다', () => {
    // 3행의 double_space와 1행의 empty_statement — 규칙 등록 순서와 행 순서가 어긋난다.
    const source = ['.', 'DATA lv_a TYPE i.', 'lv_a  = 1.'].join('\n');
    const result = analyzeSource(source);
    expect(result.findings.map((f) => [f.line, f.rule])).toEqual([
      [1, 'empty_statement'],
      [3, 'double_space'],
    ]);
  });

  it('같은 행이면 규칙 키 사전순으로 갈린다', () => {
    const source = ['lv_a  = 1 . .'].join('\n');
    const result = analyzeSource(source);
    const sameLine = result.findings.filter((f) => f.line === 1).map((f) => f.rule);
    expect([...sameLine]).toEqual([...sameLine].sort());
  });
});

describe('analyzeSource — summary', () => {
  it('bySeverity·byCategory는 건수를 센다', () => {
    const source = ['.', 'lv_a  = 1.'].join('\n');
    const result = analyzeSource(source);
    expect(result.summary.totalFindings).toBe(result.findings.length);
    expect(result.summary.bySeverity).toEqual({ high: 1, medium: 1 });
    expect(result.summary.byCategory).toEqual({ quality: 2 });
  });

  it('score는 high가 하나라도 있으면 warning · 아니면 good이다', () => {
    expect(analyzeSource('DATA lv_a TYPE i.').summary.score).toBe('good');
    expect(analyzeSource('lv_a  = 1.').summary.score).toBe('good'); // medium만 — good이다
    expect(analyzeSource('.').summary.score).toBe('warning');
  });

  it('셈의 키는 사전순이다 (구 Go map 직렬화 대응)', () => {
    const source = ['SELECT * FROM mara INTO TABLE lt_mara.', 'CATCH cx_root.', '.'].join('\n');
    const result = analyzeSource(source);
    expect(Object.keys(result.summary.bySeverity)).toEqual([...Object.keys(result.summary.bySeverity)].sort());
    expect(Object.keys(result.summary.byCategory)).toEqual([...Object.keys(result.summary.byCategory)].sort());
  });
});

describe('analyzeSource — 500KB 되돌림', () => {
  it('상한을 넘으면 info 1건만 내고 규칙을 돌리지 않는다', () => {
    const big = '*'.repeat(ANALYZE_MAX_SOURCE_BYTES + 1);
    const result = analyzeSource(big);
    expect(result.rulesApplied).toBe(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe('source_too_large');
    expect(result.findings[0]?.severity).toBe('info');
    expect(result.findings[0]?.line).toBe(1);
    expect(result.findings[0]?.endLine).toBe(1);
    expect(result.summary).toEqual({
      totalFindings: 1,
      bySeverity: { info: 1 },
      byCategory: { quality: 1 },
      score: 'good',
    });
  });

  it('상한은 글자 수가 아니라 UTF-8 바이트다', () => {
    // 한글 한 글자는 3바이트 — 글자 수로 재면 상한 아래지만 바이트로는 넘는다.
    const source = '가'.repeat(Math.floor(ANALYZE_MAX_SOURCE_BYTES / 3) + 1);
    expect(source.length).toBeLessThan(ANALYZE_MAX_SOURCE_BYTES);
    expect(analyzeSource(source).findings[0]?.rule).toBe('source_too_large');
  });

  it('상한 딱 그만큼은 정상 분석한다', () => {
    const source = '*'.repeat(ANALYZE_MAX_SOURCE_BYTES);
    expect(analyzeSource(source).rulesApplied).toBe(13);
  });
});
