#!/usr/bin/env node
// sapkit-cli 자체 게이트 러너 — `gates/` 안의 다른 `.mjs` 게이트를 이름순으로 전부 돌리고
// 하나라도 비-0이면 비-0으로 끝난다. 게이트를 추가하려면 이 폴더에 `.mjs`를 떨구면 된다
// (러너 수정 불필요).

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const self = 'run-all.mjs';

const gates = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== self)
  .sort();

if (gates.length === 0) {
  console.log('[gates] 등록된 게이트 없음 — 통과');
  process.exit(0);
}

let failed = 0;
for (const gate of gates) {
  console.log(`\n[gates] ▶ ${gate}`);
  const r = spawnSync(process.execPath, [join(here, gate)], { stdio: 'inherit' });
  const code = r.status === null ? 1 : r.status;
  if (code !== 0) {
    failed += 1;
    console.error(`[gates] ✗ ${gate} — exit ${code}`);
  } else {
    console.log(`[gates] ✓ ${gate}`);
  }
}

console.log(`\n[gates] ${gates.length - failed}/${gates.length} 통과`);
process.exit(failed === 0 ? 0 : 1);
