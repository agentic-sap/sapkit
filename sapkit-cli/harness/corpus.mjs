// 코퍼스 열거 — 채록기·대조기·커버리지 검사가 같은 파일 목록과 같은 키를 쓰게 하는 한 곳.
//
// 키 규약: 코퍼스 루트 기준 **POSIX 상대 경로**(예 `synthetic/rules/line_length_pos.abap`).
// Windows 역슬래시는 키에 절대 들어가지 않는다 — 기준 파일이 CI(ubuntu)와 로컬(Windows)
// 양쪽에서 바이트 동일해야 하기 때문이다.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** `sapkit-cli/` 절대 경로. */
export const CLI_ROOT = resolve(here, '..');
/** `sapkit-cli/fixtures/corpus/` 절대 경로. */
export const CORPUS_DIR = join(CLI_ROOT, 'fixtures', 'corpus');
/** `sapkit-cli/fixtures/baseline/` 절대 경로. */
export const BASELINE_DIR = join(CLI_ROOT, 'fixtures', 'baseline');

/** 채록·대조가 다루는 표면 3종. 순서 고정(출력 안정성). */
export const SURFACES = ['lint', 'analyze', 'parse'];

function walk(dir, prefix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), rel, out);
    else if (entry.name.endsWith('.abap')) out.push(rel);
  }
  return out;
}

/** 코퍼스의 모든 `.abap`을 정렬된 상대 경로 배열로 돌려준다. */
export function listCorpusFiles() {
  return walk(CORPUS_DIR, '', []).sort();
}

/** 코퍼스 파일의 절대 경로. */
export function corpusPath(rel) {
  return join(CORPUS_DIR, ...rel.split('/'));
}

/**
 * EOL 정규화(CRLF→LF)된 소스. 코퍼스는 `.gitattributes`로 LF 고정이지만,
 * 체크아웃 설정이 흔들려도 판정이 흔들리지 않게 읽는 쪽에서 한 번 더 고정한다.
 */
export function readNormalized(rel) {
  return readFileSync(corpusPath(rel), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * 디스크의 코퍼스가 정말 LF인지 확인한다. `lint` 표면은 vsp가 파일을 직접 읽으므로
 * (`--stdin`은 Windows에서 동작하지 않는다 — RECORDING.md 「구 vsp 이상 동작」)
 * 디스크 EOL이 곧 판정 입력이다. CRLF가 섞이면 행/열 판정이 조용히 갈린다.
 */
export function assertCorpusIsLF() {
  const bad = listCorpusFiles().filter((rel) => readFileSync(corpusPath(rel)).includes('\r\n'));
  if (bad.length > 0) {
    throw new Error(
      `코퍼스에 CRLF가 섞여 있다 (${bad.length}건): ${bad.join(', ')}\n` +
        '.gitattributes가 LF를 강제한다 — `git rm --cached -r fixtures && git reset --hard` 로 재체크아웃하라.',
    );
  }
}
