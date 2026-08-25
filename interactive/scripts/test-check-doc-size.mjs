#!/usr/bin/env node
// check-doc-size.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
//
// 임시 디렉터리에 대상 문서를 합성해 넣고 `--root`로 먹여, 게이트가 **정말
// 거부하는지** 본다. 원본 트리는 건드리지 않는다. SAP 무접촉 · 오프라인.
//
// 고정하는 것:
//   ⑴ 현행 실물 복제(무변조)                 → PASS  (게이트가 지금 초록이다)
//   ⑵ HANDOFF 상한 초과                      → FAIL
//   ⑶ RUN-PLAN 상한 초과                     → FAIL
//   ⑷ 상한과 정확히 같은 줄 수               → PASS  (상한은 '이하'까지 허용)
//   ⑸ 대상 파일 부재                         → FAIL  (없는 것을 통과로 읽지 않는다)
//   ⑹ 초과 사유 문구가 **이사**를 안내한다   → 문구 계약 (삭제로 줄이면 안 된다)
//   ⑺ 무인자 실행                            → exit 2 · 사용법 안내 (위반이 아니다)
//   ⑻ `--file` 상한이 정수가 아님            → exit 2
//   ⑼ `--file`에 상한이 없음                 → exit 2
//   ⑽ 지목하지 않은 파일은 검사하지 않는다   → PASS  (내장 기본 대상이 없다는 증명)
//   ⑾ 아카이브 힌트를 안 줬을 때의 일반 문구 → 문구 계약
//
// ⑷가 상한 경계다 — off-by-one으로 한 줄 좁게 잡으면 정상 문서가 red가 된다.
// ⑽이 인자화의 핵심이다 — 상수로 박힌 기본 대상이 남아 있으면 **남의 프로젝트에서
// 거짓 red**가 난다. 여기서 상한을 한참 넘는 `HANDOFF.md`를 트리에 두고도 그것을
// 지목하지 않으면, 게이트는 그 파일을 쳐다보지도 않아야 한다.
//
// exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GATE = path.join(HERE, 'check-doc-size.mjs');

// 레포 게이트가 쓰는 대상 명세 — CLAUDE.md 게이트 절·CI와 같은 값이어야 한다.
const REPO_TARGETS = [
  'HANDOFF.md:500:docs/reference/handoff-archive/',
  'docs/RUN-PLAN.md:300:docs/reference/run-archive/',
];

let pass = 0;
let fail = 0;

/** n줄짜리 문서 — 개행으로 끝나므로 `wc -l` = n. */
function doc(n) {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
}

function buildTree({ handoff, runplan }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-size-'));
  if (handoff !== null) fs.writeFileSync(path.join(root, 'HANDOFF.md'), handoff);
  if (runplan !== null) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'RUN-PLAN.md'), runplan);
  }
  return root;
}

/** argv를 그대로 넘겨 게이트를 돌린다. 사용법 안내는 stderr로 나오므로 둘 다 받는다. */
function runArgs(args) {
  try {
    return {
      code: 0,
      out: execFileSync('node', [GATE, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** 레포 게이트와 **같은 모양**으로 부른다 — 대상 2종을 명시 인자로. */
function runGate(root) {
  return runArgs(['--root', root, ...REPO_TARGETS.flatMap((s) => ['--file', s])]);
}

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  [ok ] ${label}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function expectCode(label, root, want, extra) {
  const r = runGate(root);
  check(label, r.code === want, `기대 exit ${want} / 실제 ${r.code}`);
  if (extra) extra(r);
  fs.rmSync(root, { recursive: true, force: true });
}

// ⑴ 현행 실물 — 복제해서 먹인다. 지금 게이트가 초록이라는 사실을 시험이 고정한다.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-size-real-'));
  for (const rel of ['HANDOFF.md', 'docs/RUN-PLAN.md']) {
    const src = path.join(REPO, ...rel.split('/'));
    if (!fs.existsSync(src)) throw new Error(`시험 전제 파일 부재: ${rel}`);
    const dst = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  expectCode('⑴ 현행 실물 복제 — 무변조', root, 0);
}

// ⑵ HANDOFF 초과
expectCode('⑵ HANDOFF 501줄 (상한 500)', buildTree({ handoff: doc(501), runplan: doc(10) }), 1, (r) => {
  check('   └ 사유가 HANDOFF를 지목한다', r.out.includes('HANDOFF.md'));
});

// ⑶ RUN-PLAN 초과
expectCode('⑶ RUN-PLAN 301줄 (상한 300)', buildTree({ handoff: doc(10), runplan: doc(301) }), 1, (r) => {
  check('   └ 사유가 RUN-PLAN을 지목한다', r.out.includes('RUN-PLAN.md'));
});

// ⑷ 경계 — 상한과 정확히 같으면 통과여야 한다
expectCode('⑷ 경계 정확 500 / 300', buildTree({ handoff: doc(500), runplan: doc(300) }), 0);

// ⑸ 부재
expectCode('⑸ HANDOFF 부재', buildTree({ handoff: null, runplan: doc(10) }), 1, (r) => {
  check('   └ 사유가 부재를 말한다', r.out.includes('없다'));
});

// ⑹ 문구 계약 — 초과를 삭제로 줄이라고 안내하면 안 된다. 이사 갈 자리는 인자로 받은 값이다.
{
  const root = buildTree({ handoff: doc(600), runplan: doc(10) });
  const r = runGate(root);
  check(
    '⑹ 초과 안내가 아카이브 이사를 지목한다',
    r.out.includes('이사') && r.out.includes('docs/reference/handoff-archive/'),
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// ⑺ 무인자 — **위반이 아니라 사용법 오류**다. 남의 프로젝트에서 그냥 돌려도 거짓 red가
//    나면 안 되므로, 판정 어휘(위반·❌)가 섞이지 않는 것까지 계약이다.
{
  const r = runArgs([]);
  check('⑺ 무인자 실행 → exit 2', r.code === 2, `기대 exit 2 / 실제 ${r.code}`);
  check(
    '   └ 출력이 사용법 안내이지 위반 판정이 아니다',
    r.out.includes('사용법') && !r.out.includes('위반') && !r.out.includes('❌'),
  );
}

// ⑻ 형식 오류 — 상한이 정수가 아니다
{
  const r = runArgs(['--file', 'HANDOFF.md:오백']);
  check('⑻ `--file` 상한이 정수가 아님 → exit 2', r.code === 2, `기대 exit 2 / 실제 ${r.code}`);
}

// ⑼ 형식 오류 — 상한이 아예 없다
{
  const r = runArgs(['--file', 'HANDOFF.md']);
  check('⑼ `--file`에 상한이 없음 → exit 2', r.code === 2, `기대 exit 2 / 실제 ${r.code}`);
}

// ⑽ 인자화의 핵심 — 지목하지 않은 파일은 존재해도, 상한을 한참 넘어도 검사되지 않는다.
//    (내장 기본 대상이 남아 있으면 여기서 exit 1이 나온다 = 남의 프로젝트 거짓 red)
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-size-other-'));
  fs.writeFileSync(path.join(root, 'HANDOFF.md'), doc(9999));
  fs.writeFileSync(path.join(root, 'NOTES.md'), doc(5));
  const r = runArgs(['--root', root, '--file', 'NOTES.md:100']);
  check(
    '⑽ 지목하지 않은 초과 HANDOFF.md는 검사되지 않는다',
    r.code === 0,
    `기대 exit 0 / 실제 ${r.code}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// ⑾ 아카이브 힌트 생략 — 그래도 삭제가 아니라 이사를 안내한다 (일반 문구로).
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-size-nohint-'));
  fs.writeFileSync(path.join(root, 'NOTES.md'), doc(50));
  const r = runArgs(['--root', root, '--file', 'NOTES.md:10']);
  check(
    '⑾ 아카이브 힌트 없이도 이사를 안내한다',
    r.code === 1 && r.out.includes('이사') && r.out.includes('아카이브'),
    `실제 exit ${r.code}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n통과 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
