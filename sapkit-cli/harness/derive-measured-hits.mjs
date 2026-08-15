#!/usr/bin/env node
// derive-measured-hits — 기준 파일에서 **실측** 적중 수를 뽑아 대장에 되쓴다.
//
// 대장의 `predicted_hits`는 앞 작업자가 **코드를 읽고 세운 예측**이고, 여기서 넣는
// `measured_hits`는 **구 vsp를 실제로 돌려 나온 값**이다. 둘이 갈리면 실측이 이긴다 —
// 그래서 예측을 고쳐 덮지 않고 나란히 남긴다. 어느 쪽이 무엇인지 구분이 사라지면
// "코드를 읽어 그렇게 봤다"와 "돌려 보니 그랬다"를 다시는 가를 수 없다.
//
// 사용: node harness/derive-measured-hits.mjs [--check]
//   기본  — 대장을 갱신한다 (재채록 뒤에 돌린다)
//   --check — 갱신 없이 어긋남만 보고한다 (exit 1)

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASELINE_DIR, CORPUS_DIR } from './corpus.mjs';

const manifestPath = join(CORPUS_DIR, 'synthetic', 'MANIFEST.json');
const check = process.argv.includes('--check');

const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
const baselines = Object.fromEntries(
  ['lint', 'analyze'].map((s) => [s, JSON.parse(readFileSync(join(BASELINE_DIR, `${s}.json`), 'utf8'))]),
);

let changed = 0;
for (const entry of man.files ?? []) {
  // 겨냥한 규칙의 적중 수(`rule`)와 그 파일의 전체 적중 수(`all`)를 함께 남긴다.
  // 겨냥이 없는 커버리지 파일은 `rule: null`.
  const rule = entry.targets?.[0]?.rule ?? null;
  const measured = {};
  for (const surface of ['lint', 'analyze']) {
    const found = baselines[surface].files[entry.path];
    if (!found) throw new Error(`${surface} 기준에 ${entry.path}이 없다 — 먼저 재채록하라`);
    measured[surface] = {
      rule: rule === null ? null : found.findings.filter((f) => f.rule === rule).length,
      all: found.findings.length,
    };
  }
  if (JSON.stringify(entry.measured_hits) !== JSON.stringify(measured)) changed += 1;
  entry.measured_hits = measured;
}

if (check) {
  if (changed > 0) {
    console.error(`[measured] ✗ 대장의 measured_hits가 기준과 다르다 (${changed}건) — 재채록 뒤 이 스크립트를 --check 없이 돌려라`);
    process.exit(1);
  }
  console.log('[measured] ✓ 대장의 measured_hits ↔ 기준 일치');
} else {
  writeFileSync(manifestPath, `${JSON.stringify(man, null, 2)}\n`, 'utf8');
  console.log(`[measured] 대장 갱신 — 변경 ${changed}건`);
}
