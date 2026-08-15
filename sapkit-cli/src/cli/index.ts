// CLI 표면 — 공개 배럴.
//
// 명령 넷(`lint` · `parse` · `analyze` · `check`)과 exit 계약이 여기서 나간다.
// 인자 파서·입력 읽기는 **구현 세부라 내보내지 않는다** — 부르는 쪽이 붙잡을 만한
// 표면은 명령과 `analyzeSource`(순수 함수)뿐이다.
//
// 진입점(`entry.ts`)도 재수출하지 않는다. 부작용이 있는 파일이라, 배럴을 import 했다는
// 이유로 CLI가 돌아 버리면 안 된다.

export { SAPKIT_CLI_VERSION } from './version';

export { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE } from './result';
export type { CommandResult } from './result';

export { UsageError } from './args';
export { InputError } from './io';

export { lintCommand } from './lint';
export { parseCommand } from './parse';
export { ANALYZE_MAX_SOURCE_BYTES, analyzeCommand, analyzeSource } from './analyze';
export type { AnalyzeFinding, AnalyzeFindingSeverity, AnalyzeResult, AnalyzeScore, AnalyzeSummary } from './analyze';
export { checkCommand } from './check';

export { USAGE, run } from './main';
