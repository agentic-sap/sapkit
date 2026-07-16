#!/usr/bin/env node
// 엔진 source/bundle provenance 게이트 (S3 · D-027 로드맵 §9.3).
//
// verify-engine.mjs는 "VERSION ↔ integrity.json ↔ 번들 바이트"의 3자 일치만 본다.
// 그것만으로는 **소스와 번들이 같은 지점인지**를 모른다 — 소스를 고치고 번들을 다시
// 만들지 않아도(또는 그 반대여도) 셋은 여전히 서로 일치할 수 있다. 이 게이트가 그 축을 맡는다.
//
// 검사:
//   ① VERSION에 'working tree / uncommitted' 같은 미확정 문구가 없다
//      (구 VERSION은 실제로 "working tree, uncommitted"로 끝났다 — 재현 불가 선언)
//   ② integrity.json.sourceCommit이 이 레포의 실재 커밋이고 HEAD의 조상이다
//      (상류 fork 커밋 1964959를 우리 소스 커밋인 양 기록하던 것을 교정)
//   ③ 그 커밋이 **번들을 만드는 엔진 소스를 마지막으로 바꾼 커밋**과 일치한다
//      → 소스만 고치고 재핀하지 않으면 여기서 걸린다
//   ④ engine/package.json · VERSION · integrity.json의 버전이 같다
//   ⑤ --rebuild: 그 커밋의 소스에서 다시 빌드하면 바이트가 재현된다
//
// exit 0 통과 / 1 계약 위반
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256 } from './lib/target-hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..'); // repo root
const VERSION_PATH = path.join(ROOT, 'interactive', 'server', 'VERSION');
const INTEGRITY_PATH = path.join(ROOT, 'interactive', 'server', 'integrity.json');
const BUNDLE_PATH = path.join(ROOT, 'interactive', 'server', 'server.bundle.cjs');
const ENGINE = path.join(ROOT, 'engine');

const REBUILD = process.argv.includes('--rebuild');

// 번들 산출에 실제로 영향을 주는 소스 경로. engine/CLAUDE.md 같은 문서는 제외한다
// — 문서를 고쳤다고 번들 재빌드를 요구하면 게이트가 거짓 경보만 낸다.
const ENGINE_SOURCE_PATHS = [
  'engine/src',
  'engine/package.json',
  'engine/package-lock.json',
  'engine/patches',
  'engine/tsconfig.json',
  'engine/tools/bundle.mjs',
];

const fail = [];
const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

// ── ① VERSION 문구 ─────────────────────────────────────────────────────────
const versionText = fs.readFileSync(VERSION_PATH, 'utf8');
const FORBIDDEN = ['working tree', 'uncommitted', 'dirty'];
for (const f of FORBIDDEN) {
  if (versionText.toLowerCase().includes(f))
    fail.push(`VERSION에 미확정 문구 "${f}" — 번들은 확정 커밋에서만 만든다 (§9.3)`);
}

const vHead = versionText.match(/^(\S+)\s+(\d+\.\d+\.\d+)/);
const vCommit = versionText.match(/commit\s+([0-9a-f]{7,40})/);
if (!vHead) fail.push('VERSION 1행이 "<package> <semver>" 형식이 아님');
if (!vCommit) fail.push('VERSION에 "commit <sha>" 줄이 없음');

const integrity = JSON.parse(fs.readFileSync(INTEGRITY_PATH, 'utf8'));
const enginePkg = JSON.parse(fs.readFileSync(path.join(ENGINE, 'package.json'), 'utf8'));

// ── ② sourceCommit 실재 + HEAD 조상 ────────────────────────────────────────
const pinned = integrity.sourceCommit;
if (!/^[0-9a-f]{40}$/.test(pinned ?? '')) {
  fail.push(`integrity.json.sourceCommit이 40자 SHA가 아님: "${pinned}" (상류 fork 약식 SHA를 쓰던 잔재?)`);
} else {
  let exists = true;
  try {
    git(['cat-file', '-e', `${pinned}^{commit}`]);
  } catch {
    exists = false;
    fail.push(`sourceCommit ${pinned.slice(0, 12)}…이 이 레포에 없음`);
  }
  if (exists) {
    try {
      git(['merge-base', '--is-ancestor', pinned, 'HEAD']);
    } catch {
      fail.push(`sourceCommit ${pinned.slice(0, 12)}…이 HEAD의 조상이 아님`);
    }
    // ③ 번들 소스를 마지막으로 바꾼 커밋과 일치하는가
    let last;
    try {
      last = git(['log', '-1', '--format=%H', 'HEAD', '--', ...ENGINE_SOURCE_PATHS]);
    } catch {
      fail.push('git log 실패 — CI라면 actions/checkout에 fetch-depth: 0 필요(얕은 클론은 이력 부재)');
    }
    if (last && last !== pinned) {
      const subj = git(['log', '-1', '--format=%s', last]);
      fail.push(
        `엔진 소스가 재핀 없이 변경됨 — 번들 소스 최종 커밋 ${last.slice(0, 12)}… ("${subj}") vs ` +
          `핀 ${pinned.slice(0, 12)}…\n      소스를 고쳤으면: cd engine && npm run build:bundle → 번들 복사 → ` +
          `VERSION의 source commit 갱신 → node interactive/server/verify-engine.mjs --refresh`
      );
    }
  }
}

// ── ④ 버전 3자 일치 ────────────────────────────────────────────────────────
if (vHead && enginePkg.version !== vHead[2])
  fail.push(`버전 불일치: engine/package.json ${enginePkg.version} vs VERSION ${vHead[2]}`);
if (vHead && integrity.version !== vHead[2])
  fail.push(`버전 불일치: integrity.json ${integrity.version} vs VERSION ${vHead[2]}`);
if (vCommit && integrity.sourceCommit !== vCommit[1])
  fail.push(`sourceCommit 불일치: integrity.json ${integrity.sourceCommit} vs VERSION ${vCommit[1]}`);

// ── ⑤ 재현 빌드 ────────────────────────────────────────────────────────────
let rebuildLine = '재현 빌드    : (--rebuild 미지정 — 건너뜀)';
if (REBUILD) {
  const shippedSha = sha256(fs.readFileSync(BUNDLE_PATH));
  const dirty = git(['status', '--porcelain', '--', 'engine']);
  if (dirty) fail.push(`engine/ 작업트리가 clean이 아님 — 재현 빌드 판정 불가:\n${dirty.split('\n').slice(0, 5).join('\n')}`);
  else {
    try {
      // shell:true + args 배열은 인자가 이스케이프되지 않아 DEP0190 경고를 낸다.
      // Windows의 npm은 .cmd라 확장자를 직접 지정하고 shell 없이 실행한다.
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      execFileSync(npm, ['run', 'build:bundle'], { cwd: ENGINE, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      fail.push(`재현 빌드 실패: ${String(e.message).split('\n')[0]}`);
    }
    const built = path.join(ENGINE, 'dist', 'server.bundle.cjs');
    if (!fs.existsSync(built)) fail.push('재현 빌드 산출물 부재: engine/dist/server.bundle.cjs');
    else {
      const builtSha = sha256(fs.readFileSync(built));
      if (builtSha !== shippedSha) {
        fail.push(
          `번들 재현 실패 — 재빌드 ${builtSha.slice(0, 12)}… vs 배포본 ${shippedSha.slice(0, 12)}…\n` +
            '      재현 불가가 확정이면 build environment와 artifact hash를 별도 lock에 기록할 것 (§9.3)'
        );
        rebuildLine = '재현 빌드    : ❌ 불일치';
      } else {
        rebuildLine = `재현 빌드    : ✅ 재현 (${builtSha.slice(0, 12)}… · ${fs.statSync(built).size} bytes)`;
      }
      // 빌드가 tracked 파일을 더럽혔는지 — 더럽혔다면 dist/가 커밋 상태와 다르다는 뜻
      const after = git(['status', '--porcelain', '--', 'engine']);
      if (after) fail.push(`재현 빌드가 tracked engine/ 파일을 변경함 (커밋된 dist/와 빌드 산출물이 다름):\n${after.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

// ── 보고 ───────────────────────────────────────────────────────────────────
console.log(`엔진         : ${enginePkg.name}@${enginePkg.version}`);
console.log(`source commit: ${pinned?.slice(0, 12)}… (${integrity.sourceCommit === vCommit?.[1] ? 'VERSION과 일치' : 'VERSION과 불일치'})`);
console.log(`번들         : ${integrity.sha256?.slice(0, 12)}… · ${integrity.bytes} bytes`);
console.log(rebuildLine);

if (fail.length) {
  console.log(`\n❌ provenance 계약 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 엔진 provenance 통과 — 소스 커밋이 실재·HEAD 조상·번들 소스 최종 커밋과 일치 · 버전 3자 일치');
