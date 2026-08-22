#!/usr/bin/env node
/**
 * 은퇴 근거 경로 채록기 — `harness/replay/divergences.ts`의 `evidence`·`substituteTest`
 * 에서 뽑히는 `engine/` 접두 경로 토큰을 전부 모아 **실재를 확인하고** 굳힌다.
 *
 *   node harness/replay/capture-retired-evidence-paths.mjs
 *
 * ## 왜 있는가
 *
 * `harness/replay/__tests__/divergences.test.ts`의 "경로가 전부 실재한다" 계열
 * (`M1_DIVERGENCES`의 `evidence`·`substituteTest`를 `PATHLIKE`로 훑어 `fs.existsSync`로
 * 대조)은 `engine/`이 실물일 때만 뜻이 선다. 판7.5에서 `engine/`이 레포에서
 * 삭제되면 그 인용은 전부 `fs.existsSync`가 무조건 거짓을 낸다 — 하지만 그 인용은
 * **거짓이 아니다**, 삭제 전에는 실재했다는 사실이 사라졌을 뿐이다. 이 채록본이
 * "삭제 전에 실재를 확인했다"는 증거이고, 시험은 이 목록에 **있는** `engine/` 경로만
 * 면제한다 — 목록 **밖**의 `engine/` 경로(앞으로 새로 등재될 것)는 여전히
 * `fs.existsSync`로 검증돼 새 허구를 막는다(`harness/replay/retired-evidence-paths.json`
 * 참조).
 *
 * `engine/`이 있을 때만 돈다 — 없으면 "원본이 은퇴했다"로 명확히 멈춘다(exit 2).
 * **얼리기 전에 전부 실재를 확인한다** — 하나라도 없으면 굳히지 않고 실패한다
 * (지금 깨진 장부를 영구화하지 않는다). `divergences.ts`의 등재 내용은 **고치지
 * 않는다** — append-only 성격이라 이 스크립트가 손댈 자리가 아니다.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPLAY_DIR = fileURLToPath(new URL('.', import.meta.url));
const ENGINE_ROOT = path.resolve(REPLAY_DIR, '..', '..'); // sapkit-engine/
const REPO_ROOT = path.resolve(ENGINE_ROOT, '..');
const ENGINE_TREE = path.join(REPO_ROOT, 'engine');
const OUT = path.join(REPLAY_DIR, 'retired-evidence-paths.json');

if (!fs.existsSync(ENGINE_TREE)) {
  console.error('❌ 원본이 은퇴했다 — engine/ 이 레포에 없다(판7.5에서 삭제, 구 MCP 서버 포크 은퇴).');
  console.error(`   · ${path.relative(REPO_ROOT, OUT).split(path.sep).join('/')} 이 되뜰 수 없는 기준이다.`);
  console.error('   · 되뜨려야 하면 git 이력에서 삭제 이전 커밋을 참조하라.');
  process.exit(2);
}

const DIST_DIVERGENCES = path.join(ENGINE_ROOT, 'dist', 'harness', 'replay', 'divergences.js');
if (!fs.existsSync(DIST_DIVERGENCES)) {
  console.error(`❌ 빌드 산출물이 없다: ${DIST_DIVERGENCES}`);
  console.error('   · `npm run build`를 먼저 돌려라.');
  process.exit(2);
}
const { M1_DIVERGENCES } = require(DIST_DIVERGENCES);

// harness/replay/__tests__/divergences.test.ts · harness/ledger/evidence.ts 와 같은 규칙.
const PATHLIKE = /[\w./@-]+\.(?:ts|mjs|js)/g;

const tokens = new Set();
for (const entry of M1_DIVERGENCES) {
  const fields = [entry.evidence, entry.substituteTest].filter((v) => typeof v === 'string');
  for (const field of fields) {
    for (const token of field.match(PATHLIKE) ?? []) {
      if (token.startsWith('engine/')) tokens.add(token);
    }
  }
}

const sorted = [...tokens].sort();
const missing = sorted.filter((token) => !fs.existsSync(path.join(REPO_ROOT, token)));

if (missing.length > 0) {
  console.error(`❌ 얼리지 않는다 — ${missing.length}개 경로가 지금도 실재하지 않는다(원래부터 깨진 장부일 수 있다):`);
  for (const m of missing) console.error(`   · ${m}`);
  console.error('   이 스크립트는 divergences.ts를 고치지 않는다 — 사람이 먼저 그 등재를 바로잡아야 한다.');
  process.exit(1);
}

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

const report = {
  _: [
    '이 파일은 되뜰 수 없는 기준이다 — 원본 engine/ 은 판7.5에서 은퇴했고 재채록 수단이 없다.',
    '손으로 고치지 말 것 — engine/이 아직 있을 때 capture-retired-evidence-paths.mjs를 다시 돌려서만 만든다.',
    'harness/replay/divergences.ts 의 evidence·substituteTest 에서 PATHLIKE(/[\\w./@-]+\\.(?:ts|mjs|js)/g)로 ' +
      '뽑히는 engine/ 접두 토큰 전부 — 채록 시점에 전부 실재를 확인했다(하나라도 없었다면 이 파일은 쓰이지 않았다).',
    'harness/replay/__tests__/divergences.test.ts 의 "경로가 전부 실재한다" 계열이 이 목록에 있는 engine/ 경로만 ' +
      '면제한다 — 목록 밖의 engine/ 경로(앞으로 새로 등재될 것)는 여전히 fs.existsSync로 검증된다. ' +
      '「engine/으로 시작하면 무조건 통과」가 아니다.',
  ],
  capturedAt: {
    engineTreeCommit: commitSha,
    tokenCount: sorted.length,
    note: 'engineTreeCommit = 채록 시점 레포 HEAD의 SHA(git rev-parse HEAD).',
  },
  paths: sorted,
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`은퇴 근거 경로 채록 → ${OUT}`);
console.log(`   · 커밋 ${commitSha} · 토큰 ${sorted.length}개 · 전부 실재 확인 완료`);
process.exit(0);
