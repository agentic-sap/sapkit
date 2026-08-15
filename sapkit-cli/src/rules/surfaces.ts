// 표면별 규칙 구성.
//
// 규칙이 몇 종 도는지, 어떤 파라미터로 도는지는 **어느 표면에 등록되느냐로 갈린다.**
// 구 검사기에는 서로 다른 구성 셋이 있었고(실측), 그 셋을 그대로 승계한다:
//
// | 표면 | 규칙 수 | 갈리는 칸 |
// |---|---|---|
// | `lint` (CLI) | 7 | 행 길이 상한 120 · REFRESH 켬 · double_space 없음 |
// | 기본 구성 | 8 | 위에 double_space를 더한 것 |
// | `analyze` (MCP) | 13 | 행 길이 상한 130 · REFRESH 끔 · 이름 무늬 비움 |
//
// `analyze`의 `local_variable_names`는 **등록만 되고 한 건도 내지 않는다.** 그래서
// 그 표면은 「규칙 13종을 적용했다」고 보고하면서 실제로 발견을 낼 수 있는 규칙은
// 12종이다 — 고치지 않고 승계한 무동작이다(`DIVERGENCES.md` D-002).

import type { AbapFile } from '../core';
import { catchCxRootRule } from './catch-cx-root';
import { colonMissingSpaceRule } from './colon-missing-space';
import { commitInLoopRule } from './commit-in-loop';
import { doubleSpaceRule } from './double-space';
import { dynamicCallNoTryRule } from './dynamic-call-no-try';
import { emptyStatementRule } from './empty-statement';
import { hardcodedCredentialsRule } from './hardcoded-credentials';
import { LOCAL_NAME_PATTERNS, localVariableNamesRule } from './local-variable-names';
import { DEFAULT_MAX_LINE_LENGTH, lineLengthRule } from './line-length';
import { maxOneStatementRule } from './max-one-statement';
import { obsoleteStatementRule } from './obsolete-statement';
import { preferredCompareOperatorRule } from './preferred-compare-operator';
import { selectStarRule } from './select-star';
import type { Finding, Rule, Severity } from './types';

/** `analyze` 표면의 행 길이 상한 — lint보다 10 넉넉하다 (실측). */
export const ANALYZE_MAX_LINE_LENGTH = 130;

/** CLI `lint` 구성 7종. 상한은 `--max-length`가 정한다. */
export function lintRules(maxLength: number = DEFAULT_MAX_LINE_LENGTH): Rule[] {
  return [
    lineLengthRule(maxLength),
    emptyStatementRule(),
    obsoleteStatementRule({ refresh: true }),
    maxOneStatementRule(),
    preferredCompareOperatorRule(),
    colonMissingSpaceRule(),
    localVariableNamesRule(LOCAL_NAME_PATTERNS),
  ];
}

/** 기본 구성 8종 — lint에 `double_space`를 더한 것. */
export function defaultRules(): Rule[] {
  return [
    lineLengthRule(DEFAULT_MAX_LINE_LENGTH),
    emptyStatementRule(),
    obsoleteStatementRule({ refresh: true }),
    maxOneStatementRule(),
    preferredCompareOperatorRule(),
    colonMissingSpaceRule(),
    doubleSpaceRule(),
    localVariableNamesRule(LOCAL_NAME_PATTERNS),
  ];
}

/** `analyze` 구성 13종 — 구현된 규칙 전부. */
export function analyzeRules(): Rule[] {
  return [
    lineLengthRule(ANALYZE_MAX_LINE_LENGTH),
    emptyStatementRule(),
    maxOneStatementRule(),
    preferredCompareOperatorRule(),
    obsoleteStatementRule({ refresh: false }),
    colonMissingSpaceRule(),
    doubleSpaceRule(),
    localVariableNamesRule(),
    selectStarRule(),
    hardcodedCredentialsRule(),
    catchCxRootRule(),
    commitInLoopRule(),
    dynamicCallNoTryRule(),
  ];
}

/** 규칙을 등록 순서대로 돌려 판정을 이어 붙인다. */
export function runRules(rules: readonly Rule[], file: AbapFile): Finding[] {
  return rules.flatMap((rule) => rule.run(file));
}

/** `analyze` 표면이 쓰는 심각도 이름. */
export type AnalyzeSeverity = 'high' | 'medium';

/** `analyze` 표면이 쓰는 분류. */
export type AnalyzeCategory = 'quality' | 'security' | 'performance' | 'robustness';

/**
 * 판정 등급을 `analyze` 이름으로 옮긴다.
 *
 * 구 코드에는 그 밖을 `info`로 떨어뜨리는 되돌림이 있었지만, 규칙 13종 중 `Error`·
 * `Warning` 밖을 내는 것이 없어 도달하지 않는다.
 */
export function analyzeSeverity(severity: Severity): AnalyzeSeverity {
  return severity === 'Error' ? 'high' : 'medium';
}

const CATEGORY_BY_RULE: ReadonlyMap<string, AnalyzeCategory> = new Map<string, AnalyzeCategory>([
  ['select_star', 'performance'],
  ['commit_in_loop', 'performance'],
  ['hardcoded_credentials', 'security'],
  ['catch_cx_root', 'robustness'],
  ['dynamic_call_no_try', 'robustness'],
]);

/** 규칙 키의 분류. 표에 없는 키는 `quality`다 (실측). */
export function analyzeCategory(key: string): AnalyzeCategory {
  return CATEGORY_BY_RULE.get(key) ?? 'quality';
}

/** 규칙 키별 고칠 방향 한 줄. 모르는 키는 빈 문자열이다. */
export function analyzeSuggestion(key: string): string {
  return SUGGESTION_BY_RULE.get(key) ?? '';
}

const SUGGESTION_BY_RULE: ReadonlyMap<string, string> = new Map([
  ['line_length', 'Break the statement across lines so each one stays readable'],
  ['empty_statement', 'Delete the stray period'],
  ['max_one_statement', 'Put each statement on its own line'],
  ['preferred_compare_operator', 'Switch to the symbol operators: = <> < > <= >='],
  ['obsolete_statement', 'Rewrite with the modern equivalent (MOVE to assignment, ADD to +=)'],
  ['colon_missing_space', 'Add a space after the colon that opens the chain'],
  ['double_space', 'Leave a single space between tokens'],
  ['local_variable_names', 'Name locals by the agreed prefixes (lv_, lt_, ls_, lc_)'],
  ['select_star', 'List the columns the program actually reads'],
  ['hardcoded_credentials', 'Read the credential from secure storage at runtime'],
  ['catch_cx_root', 'Catch the specific exception classes the block can recover from'],
  ['commit_in_loop', 'Commit once after the loop so one unit of work stays whole'],
  ['dynamic_call_no_try', 'Wrap the dynamic call in TRY and handle CX_SY_DYN_CALL_ERROR'],
]);
