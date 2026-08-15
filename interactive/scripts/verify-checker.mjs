#!/usr/bin/env node
// 검사기 번들 무결성·출처 게이트.
//
// 플러그인은 오프라인 ABAP 검사기를 **단일 파일 번들**로 동봉한다
// (`interactive/checker/sapkit-checker.bundle.cjs`). 소스 정본은 레포 내
// `sapkit-cli/`이고, 번들은 거기서 esbuild로 만 산출물이다. 엔진 쪽 두 게이트
// (`interactive/server/verify-engine.mjs` + `interactive/scripts/check-engine-provenance.mjs`)가
// 나눠 맡는 두 축을 검사기 규모에 맞게 한 파일로 합쳤다.
//
//   ① 번들 바이트 ↔ integrity.json (해시·크기)
//   ② VERSION ↔ integrity.json ↔ sapkit-cli/package.json (버전·커밋 3자 일치)
//   ③ 기록된 소스 커밋이 이 레포에 실재하고 HEAD의 조상이다
//   ④ **표류**: 지금 `sapkit-cli/src`의 내용 해시가 번들을 말 때의 것과 같다
//
// ④가 이 게이트의 존재 이유다. 검사기 소스를 수리하고 재번들을 잊으면 배포되는
// 번들은 조용히 낡은 채로 남는다 — "파일에 썼다 ≠ 읽힌다". 커밋 경계가 아니라
// **내용**을 재기 때문에 아직 커밋하지 않은 수리도 잡는다(엔진 게이트는 커밋
// 경계로만 재서, 소스와 번들을 한 커밋에 담으면 거짓 경보가 난다 — 그 함정을
// 물려받지 않는다).
//
// 사용:
//   node interactive/scripts/verify-checker.mjs            # 검사 (게이트), exit 0/1
//   node interactive/scripts/verify-checker.mjs --refresh   # 재번들 뒤 재핀
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashContent, sha256 } from './lib/target-hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..'); // repo root
const CHECKER = path.join(ROOT, 'interactive', 'checker');
const BUNDLE_PATH = path.join(CHECKER, 'sapkit-checker.bundle.cjs');
const VERSION_PATH = path.join(CHECKER, 'VERSION');
const INTEGRITY_PATH = path.join(CHECKER, 'integrity.json');
const CLI_PKG_PATH = path.join(ROOT, 'sapkit-cli', 'package.json');
const CLI_SRC = path.join(ROOT, 'sapkit-cli', 'src');

const REFRESH = process.argv.includes('--refresh');
const BUNDLE_REL = 'interactive/checker/sapkit-checker.bundle.cjs';

const fail = [];
const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

// ── 소스 내용 해시 ─────────────────────────────────────────────────────────
// 번들에 실제로 들어가는 것만 센다. `__tests__`는 esbuild가 따라가지 않으므로
// 시험만 고친 커밋이 재번들을 요구하면 거짓 경보다.
function sourceFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === '__tests__') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(abs, out);
    else if (e.name.endsWith('.ts')) out.push(abs);
  }
  return out;
}

// 파일 목록 자체도 해시에 넣는다 — 그러지 않으면 파일을 지운 것이 잡히지 않는다.
// EOL 정규화 해시를 쓰는 이유는 lib/target-hash.mjs 원문 참조(CI ubuntu ↔ 로컬 Windows).
function hashSource() {
  const files = sourceFiles(CLI_SRC);
  const lines = files.map((abs) => {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    return `${rel} ${hashContent(fs.readFileSync(abs))}`;
  });
  return { hash: sha256(Buffer.from(lines.join('\n'), 'utf8')), count: files.length };
}

// ── 현 상태 ────────────────────────────────────────────────────────────────
if (!fs.existsSync(BUNDLE_PATH)) {
  console.error(`[verify-checker] FAIL: ${BUNDLE_REL} 부재 — 먼저: cd sapkit-cli && npm run bundle`);
  process.exit(1);
}
if (!fs.existsSync(VERSION_PATH)) {
  console.error('[verify-checker] FAIL: interactive/checker/VERSION 부재');
  process.exit(1);
}

const versionText = fs.readFileSync(VERSION_PATH, 'utf8');
for (const f of ['working tree', 'uncommitted', 'dirty']) {
  if (versionText.toLowerCase().includes(f))
    fail.push(`VERSION에 미확정 문구 "${f}" — 번들은 확정된 소스에서만 만든다`);
}
const vHead = versionText.match(/^(\S+)\s+(\d+\.\d+\.\d+)/);
const vCommit = versionText.match(/source commit\s+([0-9a-f]{40})/);
if (!vHead) fail.push('VERSION 1행이 "<package> <semver>" 형식이 아님');
if (!vCommit) fail.push('VERSION에 "source commit <40자 sha>" 줄이 없음');

const bundleBytes = fs.readFileSync(BUNDLE_PATH);
const src = hashSource();
const state = {
  name: vHead ? vHead[1] : null,
  version: vHead ? vHead[2] : null,
  sourceCommit: vCommit ? vCommit[1] : null,
  sourceHash: src.hash,
  sourceFiles: src.count,
  file: BUNDLE_REL,
  sha256: sha256(bundleBytes),
  bytes: bundleBytes.length,
};

if (REFRESH) {
  if (fail.length) {
    console.error('[verify-checker] FAIL: VERSION을 먼저 고칠 것 —');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  fs.writeFileSync(INTEGRITY_PATH, `${JSON.stringify(state, null, 2)}\n`);
  let lastSrcCommit = '(git 조회 실패)';
  try {
    lastSrcCommit = git(['log', '-1', '--format=%H', 'HEAD', '--', 'sapkit-cli/src']) || '(없음)';
  } catch { /* 이력 없는 체크아웃 — 참고 출력일 뿐이다 */ }
  console.log(`[verify-checker] 재핀 ${state.name}@${state.version} (${state.sha256.slice(0, 12)}… · ${state.bytes} bytes)`);
  console.log(`  소스 ${state.sourceFiles}개 파일 · 내용 해시 ${state.sourceHash.slice(0, 12)}…`);
  console.log(`  참고: sapkit-cli/src의 마지막 커밋 = ${lastSrcCommit.slice(0, 12)}… (VERSION의 source commit과 다르면 VERSION을 고칠 것)`);
  process.exit(0);
}

if (!fs.existsSync(INTEGRITY_PATH)) {
  console.error('[verify-checker] FAIL: interactive/checker/integrity.json 부재 — 재핀: node interactive/scripts/verify-checker.mjs --refresh');
  process.exit(1);
}
const pinned = JSON.parse(fs.readFileSync(INTEGRITY_PATH, 'utf8'));

// ── ① 번들 바이트 ↔ integrity.json ─────────────────────────────────────────
for (const key of ['sha256', 'bytes', 'file']) {
  if (String(pinned[key]) !== String(state[key]))
    fail.push(`번들 ${key} 불일치 — integrity.json "${pinned[key]}" vs 실물 "${state[key]}"`);
}

// ── ② 버전·커밋 3자 일치 ───────────────────────────────────────────────────
const cliPkg = JSON.parse(fs.readFileSync(CLI_PKG_PATH, 'utf8'));
if (vHead && cliPkg.version !== vHead[2])
  fail.push(`버전 불일치: sapkit-cli/package.json ${cliPkg.version} vs VERSION ${vHead[2]}`);
if (vHead && pinned.version !== vHead[2])
  fail.push(`버전 불일치: integrity.json ${pinned.version} vs VERSION ${vHead[2]}`);
if (vCommit && pinned.sourceCommit !== vCommit[1])
  fail.push(`sourceCommit 불일치: integrity.json ${pinned.sourceCommit} vs VERSION ${vCommit[1]}`);

// ── ③ 소스 커밋 실재 + HEAD 조상 ───────────────────────────────────────────
if (!/^[0-9a-f]{40}$/.test(pinned.sourceCommit ?? '')) {
  fail.push(`integrity.json.sourceCommit이 40자 SHA가 아님: "${pinned.sourceCommit}"`);
} else {
  try {
    git(['cat-file', '-e', `${pinned.sourceCommit}^{commit}`]);
    try {
      git(['merge-base', '--is-ancestor', pinned.sourceCommit, 'HEAD']);
    } catch {
      fail.push(`sourceCommit ${pinned.sourceCommit.slice(0, 12)}…이 HEAD의 조상이 아님`);
    }
  } catch {
    fail.push(
      `sourceCommit ${pinned.sourceCommit.slice(0, 12)}…이 이 레포에 없음 ` +
        '(얕은 클론이면 fetch-depth: 0 · 이력이 다시 쓰였으면 재핀할 것)',
    );
  }
}

// ── ④ 표류: 소스가 번들보다 새로운가 ───────────────────────────────────────
if (pinned.sourceHash !== state.sourceHash || pinned.sourceFiles !== state.sourceFiles) {
  fail.push(
    `검사기 소스가 재번들 없이 바뀜 — 핀 ${String(pinned.sourceHash).slice(0, 12)}…(${pinned.sourceFiles}파일) vs ` +
      `현재 ${state.sourceHash.slice(0, 12)}…(${state.sourceFiles}파일)\n` +
      '      절차: cd sapkit-cli && npm run bundle → VERSION의 source commit 갱신 → ' +
      'node interactive/scripts/verify-checker.mjs --refresh (interactive/checker/UPDATE-RUNBOOK.md)',
  );
}

// ── 보고 ───────────────────────────────────────────────────────────────────
console.log(`검사기       : ${state.name}@${state.version}`);
console.log(`source commit: ${String(pinned.sourceCommit).slice(0, 12)}…`);
console.log(`번들         : ${state.sha256.slice(0, 12)}… · ${state.bytes} bytes`);
console.log(`소스 대조    : ${state.sourceFiles}개 파일 · ${state.sourceHash.slice(0, 12)}…`);

if (fail.length) {
  console.log(`\n❌ 검사기 번들 계약 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 검사기 번들 통과 — 바이트 일치 · 버전 3자 일치 · 소스 커밋 실재·HEAD 조상 · 소스 표류 없음');
