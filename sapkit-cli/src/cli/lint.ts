// `sapkit lint <file>` — 규칙 7종 (구 `vsp lint` CLI 등록분 그대로).
//
// 판정(규칙 구성·심각도·행·열)은 `rules/surfaces.ts`가 소유하고 여기서는 **줄로
// 옮기기만** 한다. 형식은 구 CLI 계약 그대로 `파일:행:열: W|E [키] 메시지`이고,
// 문구만 새로 썼다.
//
// exit 계약은 심각도 기준이다 — **Error가 하나라도 있으면 1, Warning만이면 0.**
// 기준 채록본의 `exit_code`와 47/47 일치하는 식이며, 구 계약을 그대로 승계한 것이다.

import { AbapFile } from '../core';
import { DEFAULT_MAX_LINE_LENGTH, lintRules, runRules } from '../rules';
import type { Finding } from '../rules';
import { parseArgs } from './args';
import { readSource } from './io';
import { EXIT_FINDINGS, EXIT_OK } from './result';
import type { CommandResult } from './result';

export const LINT_USAGE = 'lint <file> | lint --stdin  [--max-length <n>]';

export function lintCommand(argv: readonly string[]): CommandResult {
  const args = parseArgs(argv, { stdin: 'boolean', 'max-length': 'number' });
  const maxLength = args.num('max-length', DEFAULT_MAX_LINE_LENGTH);
  const { label, source } = readSource(args.positionals, args.bool('stdin'), LINT_USAGE);

  const findings = runRules(lintRules(maxLength), new AbapFile(label, source));
  const errors = findings.filter((f) => f.severity === 'Error').length;

  const stdout = findings.map((f) => `${formatFinding(label, f)}\n`).join('');
  const stderr =
    findings.length === 0
      ? `${label}: no findings\n`
      : `${label}: ${findings.length} finding(s), ${errors} at Error level\n`;

  return { stdout, stderr, code: errors > 0 ? EXIT_FINDINGS : EXIT_OK };
}

function formatFinding(label: string, finding: Finding): string {
  const mark = finding.severity === 'Error' ? 'E' : 'W';
  return `${label}:${finding.row}:${finding.col}: ${mark} [${finding.rule}] ${finding.message}`;
}
