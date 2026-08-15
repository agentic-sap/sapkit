// `sapkit parse <file>` — 어휘 분석 → 문장 분할 → 문장 유형 분류.
//
// **문법 합격 판정기가 아니다.** 입력을 읽을 수 있으면 0으로 끝난다(구 계약 그대로).
// 구 `vsp parse`가 통과시키던 입력은 이것도 통과시킨다.
//
// 형식 셋은 구 CLI 계약이지만 두 가지를 고쳤다 — **판정이 아니라 출력의 결함**이다:
//   · json — 구현이 문자열을 손으로 이어 붙여 토큰에 `"`가 들어가면 깨진 JSON을 냈다.
//     여기서는 직렬화기가 쓴다(DIVERGENCES D-005).
//   · summary — 구현이 Go map을 그대로 순회해 실행마다 순서가 바뀌었다. 여기서는
//     문장 유형 이름 사전순으로 고정한다(DIVERGENCES D-006).
//
// json에는 `line`을 얹었다(D-007). 구 형식에는 행이 없어 기준 채록본
// (`fixtures/baseline/parse.json` = (유형, 행) 시퀀스)과 맞댈 수가 없었다.

import { AbapFile, concatTokens } from '../core';
import type { Statement } from '../core';
import { UsageError, parseArgs } from './args';
import { readSource } from './io';
import { EXIT_OK } from './result';
import type { CommandResult } from './result';

export const PARSE_USAGE = 'parse <file> | parse --stdin  [--format text|json|summary]';

const FORMATS = ['text', 'json', 'summary'] as const;
type ParseFormat = (typeof FORMATS)[number];

/** 구 `%-20s`·`%-25s` 자리맞춤 승계. */
const TEXT_TYPE_WIDTH = 20;
const SUMMARY_TYPE_WIDTH = 25;

export function parseCommand(argv: readonly string[]): CommandResult {
  const args = parseArgs(argv, { stdin: 'boolean', format: 'string' });
  const format = readFormat(args.str('format', 'text'));
  const { label, source } = readSource(args.positionals, args.bool('stdin'), PARSE_USAGE);

  const file = new AbapFile(label, source);
  const statements = file.getStatements();

  const stdout =
    format === 'json'
      ? renderJson(statements)
      : format === 'summary'
        ? renderSummary(label, file.getTokens().length, statements)
        : renderText(statements);

  return { stdout, stderr: '', code: EXIT_OK };
}

function readFormat(raw: string): ParseFormat {
  const found = FORMATS.find((f) => f === raw);
  if (found === undefined) throw new UsageError(`option '--format' must be one of ${FORMATS.join(', ')} (got '${raw}')`);
  return found;
}

/** 문장이 시작하는 행. 토큰이 없으면 0이다 (구 채록 규약 승계). */
function statementLine(stmt: Statement): number {
  return stmt.tokens[0]?.row ?? 0;
}

function renderText(statements: readonly Statement[]): string {
  return statements.map((s) => `${s.type.padEnd(TEXT_TYPE_WIDTH)} ${concatTokens(s)}\n`).join('');
}

function renderJson(statements: readonly Statement[]): string {
  const rows = statements.map((s) => ({
    type: s.type,
    line: statementLine(s),
    tokens: s.tokens.map((t) => t.str),
  }));
  return `${JSON.stringify(rows)}\n`;
}

function renderSummary(label: string, tokenCount: number, statements: readonly Statement[]): string {
  const counts = new Map<string, number>();
  for (const stmt of statements) counts.set(stmt.type, (counts.get(stmt.type) ?? 0) + 1);

  const head = [`File: ${label}`, `Tokens: ${tokenCount}`, `Statements: ${statements.length}`, '---'];
  const rows = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([type, count]) => `  ${type.padEnd(SUMMARY_TYPE_WIDTH)} ${count}`);

  return `${[...head, ...rows].join('\n')}\n`;
}
