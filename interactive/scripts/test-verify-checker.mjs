#!/usr/bin/env node
// verify-checker.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
//
// 그 게이트는 **배포되는 검사기 번들이 조용히 낡는 것**을 막는 유일한 장치다
// ("파일에 썼다 ≠ 읽힌다"). 그러므로 네 assert가 각각 **정말 거부하는지**를 여기서
// 고정한다:
//
//   ① 번들 바이트 ↔ integrity.json          → 오염·핀 변조를 거부
//   ② VERSION ↔ integrity.json ↔ package.json → 버전·커밋 3자 어긋남을 거부
//   ③ sourceCommit 실재 + HEAD 조상          → 없는 커밋·곁가지 커밋을 거부
//   ④ 소스 내용 표류                          → 수리 후 재번들 누락을 거부
//
// 경계도 함께 고정한다 — `__tests__` 변경과 `.ts`가 아닌 파일은 재번들을 요구하지
// **않는다**(그러지 않으면 시험만 고친 커밋마다 거짓 경보가 난다).
//
// **작업 트리를 그 자리에서 변조한다.** 게이트가 `--root` 같은 주입구를 갖지 않고
// 자기 위치에서 레포를 찾기 때문이다(그리고 ③이 이 레포의 실제 git 이력을 본다 —
// 임시 트리로는 재현할 수 없다). 그래서 만지는 파일의 바이트를 먼저 떠 두고
// `finally` + `process.on('exit')` 양쪽에서 되돌린다. 중간에 죽어도 트리는
// 원상태다 — 마지막에 `git status`를 시작 시점과 대조해 그 사실을 확인한다.
//
// SAP 무접촉 · 오프라인. exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GATE = path.join(HERE, 'verify-checker.mjs');

const BUNDLE = 'interactive/checker/sapkit-checker.bundle.cjs';
const VERSION = 'interactive/checker/VERSION';
const INTEGRITY = 'interactive/checker/integrity.json';
const CLI_PKG = 'sapkit-cli/package.json';
const SRC_FILE = 'sapkit-cli/src/core/lexer.ts';
const TEST_FILE = 'sapkit-cli/src/core/__tests__/lexer.test.ts';

let pass = 0;
let fail = 0;

// ── 원상복구 장치 ──────────────────────────────────────────────────────────
// rel → 원래 바이트(파일이 없었으면 null). 되돌린 뒤 비운다.
const touched = new Map();
const abs = (rel) => path.join(REPO, ...rel.split('/'));

function snapshot(rel) {
  if (touched.has(rel)) return;
  const p = abs(rel);
  touched.set(rel, fs.existsSync(p) ? fs.readFileSync(p) : null);
}
function W(rel, data) {
  snapshot(rel);
  const p = abs(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
function RM(rel) {
  snapshot(rel);
  fs.rmSync(abs(rel), { force: true });
}
function R(rel) {
  return fs.readFileSync(abs(rel), 'utf8');
}
function restoreAll() {
  for (const [rel, buf] of touched) {
    const p = abs(rel);
    if (buf === null) fs.rmSync(p, { force: true });
    else fs.writeFileSync(p, buf);
  }
  touched.clear();
}
// 예외·시그널로 죽어도 트리를 더럽히지 않는다.
process.on('exit', restoreAll);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    restoreAll();
    process.exit(1);
  });
}

// 신원 env를 명시한다 — `commit-tree`는 committer가 필요한데 CI 러너에는 git 신원이
// 설정돼 있지 않다(로컬에서만 통과하는 시험이 되지 않게).
const git = (args) =>
  execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test-verify-checker',
      GIT_AUTHOR_EMAIL: 'test@localhost',
      GIT_COMMITTER_NAME: 'test-verify-checker',
      GIT_COMMITTER_EMAIL: 'test@localhost',
    },
  }).trim();

function runGate(args = []) {
  try {
    return { code: 0, out: execFileSync('node', [GATE, ...args], { cwd: REPO, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

function t(name, mutate, expectCode, expectText, args = []) {
  try {
    if (mutate) mutate();
    const { code, out } = runGate(args);
    const codeOk = code === expectCode;
    const textOk = !expectText || out.includes(expectText);
    if (codeOk && textOk) {
      console.log(`  ✅ ${name}`);
      pass++;
    } else {
      console.log(`  ❌ ${name} — exit ${code}(기대 ${expectCode})${textOk ? '' : ` · 기대 문구 부재: ${expectText}`}`);
      console.log(out.split('\n').map((l) => '       ' + l).join('\n'));
      fail++;
    }
  } catch (err) {
    console.log(`  ❌ ${name} — 시험 자체 실패: ${err.message}`);
    fail++;
  } finally {
    restoreAll();
  }
}

const statusBefore = git(['status', '--porcelain']);

console.log('무변조');
t('현 트리는 PASS', null, 0, '검사기 번들 통과');

console.log('\n① 번들 바이트 ↔ integrity.json');
t(
  '번들에 한 바이트 덧붙이면 → FAIL',
  () => W(BUNDLE, Buffer.concat([fs.readFileSync(abs(BUNDLE)), Buffer.from('\n')])),
  1,
  '번들 sha256 불일치',
);
t(
  '핀의 bytes만 틀려도 → FAIL',
  () => {
    const j = JSON.parse(R(INTEGRITY));
    j.bytes += 1;
    W(INTEGRITY, `${JSON.stringify(j, null, 2)}\n`);
  },
  1,
  '번들 bytes 불일치',
);
t(
  '핀의 file 경로가 다르면 → FAIL',
  () => {
    const j = JSON.parse(R(INTEGRITY));
    j.file = 'interactive/checker/other.cjs';
    W(INTEGRITY, `${JSON.stringify(j, null, 2)}\n`);
  },
  1,
  '번들 file 불일치',
);
t('번들이 사라지면 → FAIL', () => RM(BUNDLE), 1, '부재');
t('integrity.json이 사라지면 → FAIL', () => RM(INTEGRITY), 1, 'integrity.json 부재');

console.log('\n② 버전·커밋 3자 일치');
t(
  'sapkit-cli/package.json 버전만 올리면 → FAIL',
  () => {
    const j = JSON.parse(R(CLI_PKG));
    j.version = '9.9.9';
    W(CLI_PKG, `${JSON.stringify(j, null, 2)}\n`);
  },
  1,
  '버전 불일치: sapkit-cli/package.json',
);
t(
  'integrity.json 버전만 올리면 → FAIL',
  () => {
    const j = JSON.parse(R(INTEGRITY));
    j.version = '9.9.9';
    W(INTEGRITY, `${JSON.stringify(j, null, 2)}\n`);
  },
  1,
  '버전 불일치: integrity.json',
);
t(
  'VERSION의 source commit만 바꾸면 → FAIL',
  () => W(VERSION, R(VERSION).replace(/source commit [0-9a-f]{40}/, `source commit ${git(['rev-parse', 'HEAD'])}`)),
  1,
  'sourceCommit 불일치',
);
t(
  'VERSION 1행이 "<package> <semver>"가 아니면 → FAIL',
  () => W(VERSION, R(VERSION).replace(/^sapkit-cli 0\.\d+\.\d+/, 'sapkit-cli')),
  1,
  'VERSION 1행이',
);
t(
  'VERSION에 미확정 문구("working tree")가 있으면 → FAIL',
  () => W(VERSION, R(VERSION) + '\nnote: built from the working tree\n'),
  1,
  '미확정 문구',
);
t(
  '--refresh도 미확정 VERSION은 거부한다 (낡은 핀을 굳히지 않는다)',
  () => W(VERSION, R(VERSION) + '\nnote: built from the working tree\n'),
  1,
  'VERSION을 먼저 고칠 것',
  ['--refresh'],
);

console.log('\n③ sourceCommit 실재 + HEAD 조상');
const pinCommit = (sha) => {
  const j = JSON.parse(R(INTEGRITY));
  j.sourceCommit = sha;
  W(INTEGRITY, `${JSON.stringify(j, null, 2)}\n`);
  W(VERSION, R(VERSION).replace(/source commit [0-9a-f]{40}/, `source commit ${sha}`));
};
t(
  '없는 커밋을 가리키면 → FAIL',
  () => pinCommit('0123456789abcdef0123456789abcdef01234567'),
  1,
  '이 레포에 없음',
);
t(
  '40자 SHA가 아니면 → FAIL',
  () => {
    const j = JSON.parse(R(INTEGRITY));
    j.sourceCommit = 'HEAD';
    W(INTEGRITY, `${JSON.stringify(j, null, 2)}\n`);
  },
  1,
  '40자 SHA가 아님',
);
t(
  '실재하지만 HEAD의 조상이 아닌 커밋이면 → FAIL',
  () => {
    // HEAD를 부모로 삼는 곁가지 커밋을 만든다 — 참조를 옮기지 않으므로 작업 트리는
    // 그대로이고, 이 객체는 도달 불가라 gc가 걷어간다.
    const tree = git(['rev-parse', 'HEAD^{tree}']);
    pinCommit(git(['commit-tree', tree, '-p', 'HEAD', '-m', 'test-verify-checker sidecar']));
  },
  1,
  'HEAD의 조상이 아님',
);

console.log('\n④ 소스 표류 (수리하고 재번들을 잊었을 때)');
t(
  '소스 파일 내용을 고치면 → FAIL',
  () => W(SRC_FILE, R(SRC_FILE) + '\n// drift\n'),
  1,
  '검사기 소스가 재번들 없이 바뀜',
);
t(
  '소스 파일을 새로 더하면 → FAIL',
  () => W('sapkit-cli/src/core/brand-new-rule.ts', 'export const x = 1;\n'),
  1,
  '검사기 소스가 재번들 없이 바뀜',
);
t(
  '소스 파일을 지워도 → FAIL (목록도 해시에 들어간다)',
  () => RM(SRC_FILE),
  1,
  '검사기 소스가 재번들 없이 바뀜',
);

console.log('\n④ 경계 — 재번들을 요구하지 않는 변경');
t(
  '`__tests__` 아래 변경은 PASS (번들에 들어가지 않는다)',
  () => W(TEST_FILE, R(TEST_FILE) + '\n// touched\n'),
  0,
  '검사기 번들 통과',
);
t(
  '`.ts`가 아닌 파일 추가는 PASS',
  () => W('sapkit-cli/src/NOTES.md', '메모\n'),
  0,
  '검사기 번들 통과',
);

// ── 원상복구 확인 ──────────────────────────────────────────────────────────
const statusAfter = git(['status', '--porcelain']);
if (statusAfter === statusBefore) {
  console.log('\n  ✅ 작업 트리 원상복구 (git status 시작 시점과 동일)');
  pass++;
} else {
  console.log('\n  ❌ 작업 트리가 더러워졌다 — 복구 실패');
  console.log('     before:\n' + statusBefore);
  console.log('     after:\n' + statusAfter);
  fail++;
}

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
