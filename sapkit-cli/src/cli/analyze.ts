// `sapkit analyze <file>` — 규칙 13종, 결과는 JSON.
//
// 결과 형태는 구 `CodeAnalysisResult`의 **계약 표면**을 그대로 승계한다(실측 정본:
// `vsp/pkg/adt/codeanalysis.go` `AnalyzeABAPSource` · `vsp/pkg/adt/analysis_types.go`):
//
//   { findings: [{rule, category, severity, line, endLine, match, description, suggestion}],
//     summary: {totalFindings, bySeverity, byCategory, score},
//     rulesApplied }
//
// 승계한 것 — 심각도 사상(Error→high · Warning→medium · 그 밖→info) · 분류 사상 ·
// **(행, 규칙) 정렬** · `endLine === line` · `match === description` ·
// score 산식(high가 하나라도 있으면 `warning`, 아니면 `good`) ·
// **500KB 초과 시 `source_too_large` info 1건**(그때 `rulesApplied`는 0이다).
//
// 새로 쓴 것 — `description`·`suggestion` 문구.
//
// exit은 **분석이 돌면 발견 유무와 무관하게 0**이다. 입력 오류만 비-0.
//
// 구 핸들러의 `objectUri`·`objectName`은 SAP에서 가져온 객체를 가리키는 라벨이라
// 오프라인 CLI에는 채울 값이 없다. 구 구현도 비면 빼고 냈으므로(`omitempty`)
// 결과에 나타나지 않는 것이 승계다.

import { AbapFile } from '../core';
import { analyzeCategory, analyzeRules, analyzeSeverity, analyzeSuggestion, runRules } from '../rules';
import type { AnalyzeCategory } from '../rules';
import { UsageError, parseArgs } from './args';
import { readSource } from './io';
import { EXIT_OK } from './result';
import type { CommandResult } from './result';

export const ANALYZE_USAGE = 'analyze <file> | analyze --stdin  [--format json]';

/** 이 크기를 넘는 소스는 분석하지 않는다 — **UTF-8 바이트**로 잰다 (구 `maxSourceBytes`). */
export const ANALYZE_MAX_SOURCE_BYTES = 500 * 1024;

/** 결과에 실리는 심각도. `info`는 500KB 되돌림에서만 나온다. */
export type AnalyzeFindingSeverity = 'high' | 'medium' | 'info';

export type AnalyzeScore = 'good' | 'warning';

export interface AnalyzeFinding {
  readonly rule: string;
  readonly category: AnalyzeCategory;
  readonly severity: AnalyzeFindingSeverity;
  readonly line: number;
  readonly endLine: number;
  readonly match: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface AnalyzeSummary {
  readonly totalFindings: number;
  readonly bySeverity: Readonly<Record<string, number>>;
  readonly byCategory: Readonly<Record<string, number>>;
  readonly score: AnalyzeScore;
}

export interface AnalyzeResult {
  readonly findings: readonly AnalyzeFinding[];
  readonly summary: AnalyzeSummary;
  readonly rulesApplied: number;
}

export function analyzeCommand(argv: readonly string[]): CommandResult {
  const args = parseArgs(argv, { stdin: 'boolean', format: 'string' });
  const format = args.str('format', 'json');
  if (format !== 'json') throw new UsageError(`option '--format' must be json (got '${format}')`);

  const { source } = readSource(args.positionals, args.bool('stdin'), ANALYZE_USAGE);
  return { stdout: `${JSON.stringify(analyzeSource(source), null, 2)}\n`, stderr: '', code: EXIT_OK };
}

/** 소스 한 덩이를 분석한다. 파일도 프로세스도 모르는 순수 함수다. */
export function analyzeSource(source: string): AnalyzeResult {
  if (Buffer.byteLength(source, 'utf8') > ANALYZE_MAX_SOURCE_BYTES) return tooLarge();

  const rules = analyzeRules();
  const findings: AnalyzeFinding[] = runRules(rules, new AbapFile('source.abap', source)).map((f) => ({
    rule: f.rule,
    category: analyzeCategory(f.rule),
    severity: analyzeSeverity(f.severity),
    line: f.row,
    endLine: f.row,
    match: f.message,
    description: f.message,
    suggestion: analyzeSuggestion(f.rule),
  }));

  // (행, 규칙) 정렬 — 구 구현 승계. 같은 (행, 규칙)끼리의 상대 순서는 규칙이 낸
  // 차례를 그대로 둔다(JS `sort`는 안정 정렬이다).
  findings.sort((a, b) => a.line - b.line || compare(a.rule, b.rule));

  return {
    findings,
    summary: {
      totalFindings: findings.length,
      bySeverity: tally(findings.map((f) => f.severity)),
      byCategory: tally(findings.map((f) => f.category)),
      // 구 산식은 critical → warning → good 순으로 봤지만, 규칙 13종 중 `critical`을
      // 내는 것이 없어 그 갈래는 도달하지 않는다. 승계하되 도달점만 남긴다.
      score: findings.some((f) => f.severity === 'high') ? 'warning' : 'good',
    },
    rulesApplied: rules.length,
  };
}

function tooLarge(): AnalyzeResult {
  const limitKb = ANALYZE_MAX_SOURCE_BYTES / 1024;
  return {
    findings: [
      {
        rule: 'source_too_large',
        category: 'quality',
        severity: 'info',
        line: 1,
        endLine: 1,
        match: '',
        description: `Source is bigger than the ${limitKb}KB ceiling — nothing was inspected`,
        suggestion: '',
      },
    ],
    summary: {
      totalFindings: 1,
      bySeverity: { info: 1 },
      byCategory: { quality: 1 },
      score: 'good',
    },
    rulesApplied: 0,
  };
}

/** 값별 건수. 키는 **사전순**이다 — 구 Go map 직렬화가 그렇게 나온다. */
function tally(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) out[key] = counts.get(key) ?? 0;
  return out;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
