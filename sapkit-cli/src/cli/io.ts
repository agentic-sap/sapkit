// 입력을 읽는 한 곳.
//
// **SAP에 닿는 길은 없다.** 구 vsp는 `<TYPE> <NAME>`을 받으면 접속해서 소스를 가져왔고
// analyze는 source가 비면 GetSource를 불렀지만, 이 CLI의 입력은 파일·디렉터리·표준입력
// 셋뿐이다(spec §2 · DIVERGENCES D-003).
//
// `--stdin`은 fd 0을 그대로 읽는다. 구 구현은 `/dev/stdin`을 열어서 Windows에서 깨졌고,
// parse는 그 오류를 버려 빈 결과를 exit 0으로 돌려줬다(DIVERGENCES D-004).

import { readFileSync } from 'node:fs';
import { UsageError } from './args';

/** 입력을 읽지 못했다 — 판정을 시작하지도 못했다는 뜻이다. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

/** 표준입력으로 들어온 소스에 붙이는 이름. */
export const STDIN_LABEL = '<stdin>';

export interface SourceInput {
  /** 판정 줄 앞머리에 찍히는 이름. */
  readonly label: string;
  readonly source: string;
}

/**
 * 파일 하나 또는 표준입력에서 소스를 읽는다.
 *
 * @param usage 사용 오류에 함께 보일 한 줄 (`lint <file>` 형태)
 */
export function readSource(positionals: readonly string[], useStdin: boolean, usage: string): SourceInput {
  if (useStdin) {
    if (positionals.length > 0) {
      throw new UsageError(`--stdin takes no file argument (got '${positionals.join(' ')}')`);
    }
    return { label: STDIN_LABEL, source: readStdin() };
  }

  const path = positionals[0];
  if (path === undefined) throw new UsageError(`usage: sapkit ${usage}`);
  if (positionals.length > 1) {
    throw new UsageError(`sapkit ${usage} takes exactly one file (got ${positionals.length})`);
  }

  return { label: path, source: readSourceFile(path) };
}

/** 파일 하나를 UTF-8로 읽는다. 인코딩 결정의 근거는 DIVERGENCES D-001이다. */
export function readSourceFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    throw new InputError(`cannot read '${path}': ${describe(err)}`);
  }
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch (err) {
    throw new InputError(`cannot read standard input: ${describe(err)}`);
  }
}

/** 오류를 한 마디로 — 절대 경로·스택은 흘리지 않는다. */
function describe(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return code;
  return err instanceof Error ? err.message : String(err);
}
