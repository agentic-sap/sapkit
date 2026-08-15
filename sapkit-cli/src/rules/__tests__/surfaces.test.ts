// 표면별 규칙 구성 시험.
//
// 같은 규칙이라도 어느 표면에 등록되느냐로 파라미터가 갈린다 — 그 갈림이 곧 판정
// 차이이므로 여기서 못 박는다. 구성·순서는 구 코드 실측이다.

import { AbapFile } from '../../core';
import {
  analyzeCategory,
  analyzeRules,
  analyzeSeverity,
  analyzeSuggestion,
  defaultRules,
  lintRules,
  runRules,
} from '../index';
import type { Rule } from '../index';

const LINT_KEYS = [
  'line_length',
  'empty_statement',
  'obsolete_statement',
  'max_one_statement',
  'preferred_compare_operator',
  'colon_missing_space',
  'local_variable_names',
];

function keysOf(rules: readonly Rule[]): string[] {
  return rules.map((r) => r.key);
}

function findingKeys(rules: readonly Rule[], source: string): string[] {
  return runRules(rules, new AbapFile('t.abap', source)).map((f) => f.rule);
}

describe('표면 구성', () => {
  it('lint은 7종을 등록 순서대로 갖는다', () => {
    expect(keysOf(lintRules())).toEqual(LINT_KEYS);
  });

  it('기본 구성은 lint에 double_space를 더한 8종이다', () => {
    expect(keysOf(defaultRules())).toEqual([
      'line_length',
      'empty_statement',
      'obsolete_statement',
      'max_one_statement',
      'preferred_compare_operator',
      'colon_missing_space',
      'double_space',
      'local_variable_names',
    ]);
  });

  it('analyze는 13종 전부를 등록 순서대로 갖는다', () => {
    expect(keysOf(analyzeRules())).toEqual([
      'line_length',
      'empty_statement',
      'max_one_statement',
      'preferred_compare_operator',
      'obsolete_statement',
      'colon_missing_space',
      'double_space',
      'local_variable_names',
      'select_star',
      'hardcoded_credentials',
      'catch_cx_root',
      'commit_in_loop',
      'dynamic_call_no_try',
    ]);
  });

  it('규칙 키에 중복이 없다', () => {
    for (const rules of [lintRules(), defaultRules(), analyzeRules()]) {
      expect(new Set(keysOf(rules)).size).toBe(rules.length);
    }
  });
});

describe('표면별 파라미터 갈림 (구 코드 실측)', () => {
  it('행 길이 상한은 lint 120 · analyze 130이다', () => {
    const source = 'x'.repeat(125);
    expect(findingKeys(lintRules(), source)).toEqual(['line_length']);
    expect(findingKeys(defaultRules(), source)).toEqual(['line_length']);
    expect(findingKeys(analyzeRules(), source)).toEqual([]);
  });

  it('lint의 상한은 부를 때 바꿀 수 있다 (구 CLI의 --max-length)', () => {
    expect(findingKeys(lintRules(200), 'x'.repeat(125))).toEqual([]);
  });

  it('REFRESH는 lint·기본에서만 낡은 구문이다', () => {
    const source = 'REFRESH lt_items.';
    expect(findingKeys(lintRules(), source)).toEqual(['obsolete_statement']);
    expect(findingKeys(defaultRules(), source)).toEqual(['obsolete_statement']);
    expect(findingKeys(analyzeRules(), source)).toEqual([]);
  });

  it('double_space는 lint 구성에 없다', () => {
    const source = 'lv_a  = 1.';
    expect(findingKeys(lintRules(), source)).toEqual([]);
    expect(findingKeys(defaultRules(), source)).toEqual(['double_space']);
    expect(findingKeys(analyzeRules(), source)).toEqual(['double_space']);
  });

  it('analyze의 local_variable_names는 등록만 되고 한 건도 내지 않는다 (무동작 승계)', () => {
    const source = [
      'CLASS zcl_demo IMPLEMENTATION.',
      '  METHOD run.',
      '    DATA counter TYPE i.',
      '    FIELD-SYMBOLS <lv_row> TYPE i.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(findingKeys(lintRules(), source)).toEqual(['local_variable_names', 'local_variable_names']);
    expect(findingKeys(analyzeRules(), source)).toEqual([]);
    // 그래도 등록 수는 13이다 — 「발견을 낼 수 있는 규칙」과 「등록된 규칙」은 다르다.
    expect(analyzeRules()).toHaveLength(13);
  });
});

describe('runRules', () => {
  it('규칙 등록 순서대로 이어 붙인다', () => {
    const source = ['lv_a  = 1.', '.'].join('\n');
    expect(findingKeys(defaultRules(), source)).toEqual(['empty_statement', 'double_space']);
  });

  it('판정이 없으면 빈 배열이다', () => {
    expect(runRules(analyzeRules(), new AbapFile('t.abap', 'DATA lv_a TYPE i.'))).toEqual([]);
  });
});

describe('analyze 표면 매핑', () => {
  it('심각도는 Error→high · Warning→medium이다', () => {
    expect(analyzeSeverity('Error')).toBe('high');
    expect(analyzeSeverity('Warning')).toBe('medium');
  });

  it('분류는 규칙 키로 정해진다', () => {
    expect(analyzeCategory('select_star')).toBe('performance');
    expect(analyzeCategory('commit_in_loop')).toBe('performance');
    expect(analyzeCategory('hardcoded_credentials')).toBe('security');
    expect(analyzeCategory('catch_cx_root')).toBe('robustness');
    expect(analyzeCategory('dynamic_call_no_try')).toBe('robustness');
    expect(analyzeCategory('line_length')).toBe('quality');
    expect(analyzeCategory('local_variable_names')).toBe('quality');
  });

  it('모르는 키는 quality로 떨어진다', () => {
    expect(analyzeCategory('no_such_rule')).toBe('quality');
  });

  it('13종 모두 제안 문구를 갖는다', () => {
    for (const rule of analyzeRules()) {
      expect(analyzeSuggestion(rule.key).length).toBeGreaterThan(0);
    }
    expect(analyzeSuggestion('no_such_rule')).toBe('');
  });
});
