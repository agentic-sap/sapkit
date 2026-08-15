// 프로세스 단위 시험 도우미 — CLI를 **진짜 자식 프로세스로 띄운다.**
//
// 함수 호출 시험만으로는 exit code도 stdout/stderr 분리도 검증되지 않는다. 그래서
// 진입점(`entry.ts`)을 esbuild로 한 번 묶어 `node <번들>`로 돌린다. 번들은 세션 임시
// 폴더에 떨어지고 레포에 남지 않는다.
//
// `dist/`를 쓰지 않는 이유: `npm test`가 `npm run build` 없이 단독으로 돌아도
// 시험이 성립해야 하기 때문이다(빌드 순서에 매달리지 않는다).

import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let bundle: string | null = null;

/** 진입점을 한 번만 묶고 그 경로를 돌려준다. */
export function cliBundle(): string {
  if (bundle === null) {
    const dir = mkdtempSync(join(tmpdir(), 'sapkit-cli-test-'));
    const outfile = join(dir, 'sapkit.cjs');
    buildSync({
      entryPoints: [resolve(__dirname, '..', 'entry.ts')],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      logLevel: 'silent',
    });
    bundle = outfile;
  }
  return bundle;
}

export interface CliRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** CLI를 자식 프로세스로 돌린다. `stdin`을 주면 진짜 파이프로 흘려 넣는다. */
export function runCli(args: readonly string[], stdin = ''): CliRun {
  const result = spawnSync(process.execPath, [cliBundle(), ...args], {
    encoding: 'utf8',
    input: stdin,
  });
  if (result.error !== undefined) throw result.error;
  return {
    code: result.status === null ? -1 : result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** 코퍼스 파일의 절대 경로 (읽기 전용 픽스처). */
export function corpus(rel: string): string {
  return resolve(__dirname, '..', '..', '..', 'fixtures', 'corpus', ...rel.split('/'));
}

/** 이 시험 폴더 안의 픽스처 절대 경로. */
export function fixture(rel: string): string {
  return resolve(__dirname, 'fixtures', ...rel.split('/'));
}
