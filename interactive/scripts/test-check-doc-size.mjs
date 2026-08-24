#!/usr/bin/env node
// check-doc-size.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
//
// 임시 디렉터리에 대상 문서 2종을 합성해 넣고 `--root`로 먹여, 게이트가 **정말
// 거부하는지** 본다. 원본 트리는 건드리지 않는다. SAP 무접촉 · 오프라인.
//
// 고정하는 것:
//   ⑴ 현행 실물 복제(무변조)                 → PASS  (게이트가 지금 초록이다)
//   ⑵ HANDOFF 상한 초과                      → FAIL
//   ⑶ RUN-PLAN 상한 초과                     → FAIL
//   ⑷ 상한과 정확히 같은 줄 수               → PASS  (상한은 '이하'까지 허용)
//   ⑸ 대상 파일 부재                         → FAIL  (없는 것을 통과로 읽지 않는다)
//   ⑹ 초과 사유 문구가 **이사**를 안내한다   → 문구 계약 (삭제로 줄이면 안 된다)
//
// ⑷가 핵심 경계다 — off-by-one으로 상한을 한 줄 좁게 잡으면 정상 문서가 red가 된다.
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

function runGate(root) {
  try {
    return { code: 0, out: execFileSync('node', [GATE, '--root', root], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
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

// ⑹ 문구 계약 — 초과를 삭제로 줄이라고 안내하면 안 된다
{
  const root = buildTree({ handoff: doc(600), runplan: doc(10) });
  const r = runGate(root);
  check('⑹ 초과 안내가 아카이브 이사를 지목한다', r.out.includes('이사') && r.out.includes('archive'));
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n통과 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
