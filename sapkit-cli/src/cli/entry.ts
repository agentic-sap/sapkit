// 실행 진입점 — **프로세스 표면에 닿는 유일한 파일**이다.
//
// `run()`이 돌려준 문자열 둘을 각자의 흐름에 쓰고 exit code를 놓는다.
// `process.exit()`가 아니라 `process.exitCode`를 쓰는 이유: 파이프로 나가는 stdout이
// 아직 비워지지 않았는데 즉시 죽으면 출력이 잘린다(Windows에서 실제로 난다).

import { run } from './main';
import { EXIT_USAGE } from './result';

try {
  const result = run(process.argv.slice(2));
  if (result.stdout !== '') process.stdout.write(result.stdout);
  if (result.stderr !== '') process.stderr.write(result.stderr);
  process.exitCode = result.code;
} catch (err) {
  // 여기 오면 CLI 자체의 결함이다 — 판정이 아니므로 사용 오류와 같은 자리로 낸다.
  process.stderr.write(`sapkit: internal error — ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = EXIT_USAGE;
}
