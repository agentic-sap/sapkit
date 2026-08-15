// CLI 갈래길 — 명령 이름 하나를 골라 그 결과를 돌려준다.
//
// **SAP 접속도 MCP 서버 모드도 없다.** 입력은 파일·디렉터리·표준입력뿐이고, 그것이
// spec §2가 정한 표면의 전부다. 구 vsp에 있던 `--system`·`--offline`(MCP) 같은 길은
// 여기에 존재하지 않는다.
//
// exit 계약: **통과 0 · 결함 1 · 사용/입력 오류 2.** 결함 쪽은 `lint`(Error 심각도)와
// `check`(미해결 Z·Y·$ 인클루드)만 낸다 — `parse`와 `analyze`는 읽히면 0이다.

import { UsageError } from './args';
import { ANALYZE_USAGE, analyzeCommand } from './analyze';
import { CHECK_USAGE, checkCommand } from './check';
import { InputError } from './io';
import { LINT_USAGE, lintCommand } from './lint';
import { PARSE_USAGE, parseCommand } from './parse';
import { EXIT_OK, EXIT_USAGE } from './result';
import type { CommandResult } from './result';
import { SAPKIT_CLI_VERSION } from './version';

export const USAGE = [
  'sapkit — offline ABAP inspector (no SAP connection, no MCP mode)',
  '',
  'usage:',
  `  sapkit ${LINT_USAGE}`,
  `  sapkit ${PARSE_USAGE}`,
  `  sapkit ${ANALYZE_USAGE}`,
  `  sapkit ${CHECK_USAGE}`,
  '',
  '  sapkit --help | --version',
  '',
  'exit: 0 clean · 1 defects found · 2 usage or input error',
  '',
].join('\n');

const COMMANDS: Readonly<Record<string, (argv: readonly string[]) => CommandResult>> = {
  lint: lintCommand,
  parse: parseCommand,
  analyze: analyzeCommand,
  check: checkCommand,
};

export function run(argv: readonly string[]): CommandResult {
  if (argv.includes('--help')) return { stdout: USAGE, stderr: '', code: EXIT_OK };
  if (argv.includes('--version')) return { stdout: `${SAPKIT_CLI_VERSION}\n`, stderr: '', code: EXIT_OK };

  try {
    const name = argv[0];
    if (name === undefined) throw new UsageError('no command given');

    const command = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (command === undefined) throw new UsageError(`unknown command '${name}'`);

    return command(argv.slice(1));
  } catch (err) {
    if (err instanceof UsageError) return { stdout: '', stderr: `sapkit: ${err.message}\n\n${USAGE}`, code: EXIT_USAGE };
    if (err instanceof InputError) return { stdout: '', stderr: `sapkit: ${err.message}\n`, code: EXIT_USAGE };
    throw err;
  }
}
