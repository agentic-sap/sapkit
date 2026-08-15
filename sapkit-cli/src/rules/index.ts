// 검사 규칙 13종 — 공개 배럴.
//
// 규칙 하나는 파일 하나를 훑어 판정을 내놓을 뿐이고, 어느 규칙이 어떤 파라미터로
// 도는지는 `surfaces.ts`가 정한다. CLI 표면은 여기서 나가는 것만 쓴다.
//
// 규칙 키·심각도·판정 자리·파라미터는 구 vsp 검사기 실측 그대로 승계한 **기능
// 계약**이고, 메시지 문구는 이 검사기가 새로 썼다.

export type { Finding, Rule, Severity } from './types';

export { catchCxRootRule } from './catch-cx-root';
export { colonMissingSpaceRule } from './colon-missing-space';
export { commitInLoopRule } from './commit-in-loop';
export { doubleSpaceRule } from './double-space';
export { dynamicCallNoTryRule } from './dynamic-call-no-try';
export { emptyStatementRule } from './empty-statement';
export { hardcodedCredentialsRule } from './hardcoded-credentials';
export { DEFAULT_MAX_LINE_LENGTH, lineLengthRule } from './line-length';
export { LOCAL_NAME_PATTERNS, localVariableNamesRule } from './local-variable-names';
export type { LocalNamePatterns } from './local-variable-names';
export { maxOneStatementRule } from './max-one-statement';
export { obsoleteStatementRule } from './obsolete-statement';
export type { ObsoleteStatementOptions } from './obsolete-statement';
export { preferredCompareOperatorRule } from './preferred-compare-operator';
export { selectStarRule } from './select-star';

export {
  ANALYZE_MAX_LINE_LENGTH,
  analyzeCategory,
  analyzeRules,
  analyzeSeverity,
  analyzeSuggestion,
  defaultRules,
  lintRules,
  runRules,
} from './surfaces';
export type { AnalyzeCategory, AnalyzeSeverity } from './surfaces';
