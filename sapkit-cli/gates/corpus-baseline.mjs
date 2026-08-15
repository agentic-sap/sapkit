#!/usr/bin/env node
// 코퍼스 대조 게이트 — **새 CLI의 판정 ↔ 구 vsp 채록본**.
//
// 이 판의 완료 기준은 「판정 동등성」이고, 그 기계 정의가 **갈림 0**이다. 여기가
// green인 동안 새 검사기는 구 vsp가 내던 판정을 그대로 낸다.
//
// **구 vsp 없이 돈다.** 기준은 이미 파일(`fixtures/baseline/`)이므로 vsp가 은퇴한
// 뒤에도 이 게이트는 그대로 재실행된다 — 은퇴 뒤 회귀를 잡는 것이 존재 이유다.
//
// exit 0 = 갈림 0 · 1 = 갈림 있음(또는 대조를 시작하지 못함)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareSurface } from '../harness/compare-baseline.mjs';
import { BASELINE_DIR, SURFACES, assertCorpusIsLF, corpusPath, listCorpusFiles } from '../harness/corpus.mjs';
import { judgeAll } from '../harness/judge-current.mjs';

function main() {
  // 코퍼스가 CRLF로 체크아웃되면 행·열 판정이 조용히 갈린다. 대조 전에 못 박는다
  // (CI ubuntu ↔ 로컬 Windows 동일 판정의 전제).
  assertCorpusIsLF();

  const files = listCorpusFiles();
  if (files.length === 0) throw new Error('코퍼스에 .abap 파일이 없다');

  const actual = judgeAll(files.map((rel) => ({ key: rel, path: corpusPath(rel) })));

  let total = 0;
  for (const surface of SURFACES) {
    const expected = JSON.parse(readFileSync(join(BASELINE_DIR, `${surface}.json`), 'utf8'));
    const divergences = compareSurface(surface, expected, actual[surface]);
    total += divergences.length;

    if (divergences.length === 0) {
      console.log(`[corpus-baseline] ✓ ${surface}: ${files.length}파일 갈림 0`);
      continue;
    }
    console.error(`[corpus-baseline] ✗ ${surface}: 갈림 ${divergences.length}건`);
    for (const d of divergences) {
      console.error(`    [${d.kind}] ${d.file ? `${d.file}: ` : ''}${d.detail}`);
    }
  }

  if (total > 0) {
    console.error(
      `[corpus-baseline] ✗ 갈림 합계 ${total}건 — 어느 쪽이 옳은지 판정하고 DIVERGENCES.md에 등재하라 ` +
        '(기준을 구현에 맞춰 고치는 것은 금지 — harness/RECORDING.md §7)',
    );
    process.exit(1);
  }
  console.log(`[corpus-baseline] ✓ ${files.length}파일 × 표면 ${SURFACES.length}종, 갈림 0`);
}

try {
  main();
} catch (e) {
  console.error(`[corpus-baseline] ✗ ${e.message}`);
  process.exit(1);
}
