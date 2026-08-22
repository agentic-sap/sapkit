#!/usr/bin/env node
// check-runtime-path-rename.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
//
// 실제 트리를 임시 디렉터리로 **필요한 파일만** 복제해 변조하고, `--root`로 먹여
// 게이트가 거부하는지 본다. 원본 트리는 건드리지 않는다. SAP 무접촉 · 오프라인.
//
// 게이트의 현재 주장은 하나다 — **구 세대 토큰이 활성 구역에 다시 나타나지 않는다**
// (호환층은 R5에서 제거됐고, 그와 함께 3구역·ALLOWLIST·폴백 의무도 사라졌다).
// 그래서 이 시험이 고정하는 것도 그 하나와 그 경계다:
//
//   ⑴ 활성 파일에 구 토큰 주입              → FAIL (두 표기 모두)
//   ⑵ 안전 앵커 제거                        → FAIL (개명 금지 문자열은 지켜진다)
//   ⑶ 역사(HISTORY) 경로의 구 토큰          → PASS (기록은 결함이 아니다)
//   ⑷ 무변조 복제 트리                      → PASS
//
// 한때 있던 인계(PENDING) 경고 경로의 시험 2건은 T8에서 함께 은퇴했다 — 마지막
// 인계 파일(`adapters/vsp/SAFETY-PROFILES.md`)이 정리되며 게이트에서 그 예외 자체가
// 사라졌기 때문이다. 지금은 역사 밖 구 토큰이 예외 없이 FAIL이고, 그 사실은 ⑴이 고정한다.
//
// ⑸ 이 게이트의 **한계**와 그 보완자. 게이트는 문자열만 본다 — 구 토큰을 지우면서
//    해석 자체를 망가뜨려도 통과한다. 그 절반을 메우는 것은
//    `conformance-runtime-dir.mjs`이고, 그 분업의 실측은 저쪽 음성시험
//    (`test-launch-toolsurface.mjs`의 '은퇴한 세대 config 차단' 변조)이 담당한다.
//    여기서는 그 사실을 문서로만 남긴다 — 두 시험이 서로를 중복 구현하지 않도록.
//
// exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GATE = path.join(HERE, 'check-runtime-path-rename.mjs');

let pass = 0;
let fail = 0;

// 게이트가 보는 것 = 안전 앵커 · "그 밖의 활성 파일". 복제 트리에는 그 실물만 넣는다.
// 전체 레포를 복사하면 케이스당 수천 파일이라 시험이 느려지고, 무엇을 검사했는지도
// 흐려진다.
const NEEDED = [
  // 안전 앵커 7종 — 하나라도 없으면 게이트가 스스로 FAIL 하므로 전부 필요하다
  'interactive/core/procedures/troubleshooting.md',
  'interactive/core/procedures/create-program.md',
  'interactive/core/procedures/review-checklist.md',
  'interactive/core/personas/sap-executor.md',
  'interactive/core/knowledge/abap/conventions/clean-code-oop.md',
  'interactive/core/knowledge/abap/conventions/include-structure.md',
  'interactive/core/knowledge/abap/conventions/oop-pattern.md',
  // 정리가 끝난 활성 파일들 — 주입 대상이자 "무변조면 PASS"의 근거
  'interactive/adapters/claude/lib/profile-resolve.mjs',
  'interactive/server/launch.cjs',
  'interactive/scripts/setup-state.mjs',
  'interactive/adapters/claude/permissions-template.json',
  '.gitignore',
  'interactive/.gitignore',
];

function buildTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-gate-'));
  for (const rel of NEEDED) {
    const src = path.join(REPO, rel);
    if (!fs.existsSync(src)) throw new Error(`시험 전제 파일 부재: ${rel}`);
    const dst = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  return root;
}

function runGate(root) {
  try {
    return { code: 0, out: execFileSync('node', [GATE, '--root', root], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

function t(name, mutate, expectCode, expectText) {
  let root;
  try {
    root = buildTree();
    if (mutate) mutate(root);
    const { code, out } = runGate(root);
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
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
}

const W = (root, rel, text) => {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const R = (root, rel) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');

console.log('무변조');
t('무변조 복제 트리는 PASS', null, 0, '개명 완료 게이트 통과');

console.log('\n⑴ 활성 구역에 구 세대 토큰 주입');
t(
  '활성 문서에 `.sc4sap` 1개 → FAIL',
  (root) => {
    const rel = 'interactive/core/procedures/create-program.md';
    W(root, rel, R(root, rel) + '\n프로젝트 상태는 `.sc4sap/program/` 아래에 쌓인다.\n');
  },
  1,
  '구 세대 토큰 1건',
);
t(
  '`SC4SAP_HOME_DIR` 표기도 같은 규칙으로 잡힌다 → FAIL',
  (root) => {
    const rel = 'interactive/core/personas/sap-executor.md';
    W(root, rel, R(root, rel) + '\n환경변수 SC4SAP_HOME_DIR 을 확인한다.\n');
  },
  1,
  '구 세대 토큰 1건',
);
t(
  '리졸버에 폴백을 되살리면 → FAIL',
  (root) => {
    const rel = 'interactive/adapters/claude/lib/profile-resolve.mjs';
    W(
      root,
      rel,
      R(root, rel).replace(
        'const NEW_DIR = \'.sapkit\';',
        'const NEW_DIR = \'.sapkit\';\nconst LEGACY_DIR = \'.sc4sap\';',
      ),
    );
  },
  1,
  '구 세대 토큰',
);
t(
  '.gitignore에 구 세대를 되살려도 → FAIL',
  (root) => W(root, 'interactive/.gitignore', 'node_modules/\n.sapkit/\n.sc4sap/\n'),
  1,
  '구 세대 토큰',
);
t(
  '권한 템플릿에 구 경로 규칙을 되살리면 → FAIL',
  (root) => {
    const rel = 'interactive/adapters/claude/permissions-template.json';
    W(root, rel, R(root, rel).replace('"Grep(.sapkit/**)"', '"Grep(.sapkit/**)",\n      "Read(.sc4sap/**)"'));
  },
  1,
  '구 세대 토큰',
);
t(
  '새 파일이 구 이름을 들여와도 → FAIL',
  (root) => W(root, 'interactive/scripts/brand-new-thing.mjs', "const home = process.env.SC4SAP_HOME_DIR;\n"),
  1,
  'brand-new-thing.mjs',
);

console.log('\n⑵ 안전 앵커 제거 (개명 금지 문자열)');
t(
  'keychain 서비스명 제거 → FAIL',
  (root) => {
    const rel = 'interactive/core/procedures/troubleshooting.md';
    W(root, rel, R(root, rel).replaceAll('keychain:sc4sap/', 'keychain:sapkit/'));
  },
  1,
  'keychain 서비스명',
);
t(
  'ABAP 앵커(zsapkit_oop_ex) 개명 → FAIL',
  (root) => {
    const rel = 'interactive/core/knowledge/abap/conventions/oop-pattern.md';
    W(root, rel, R(root, rel).replaceAll('zsapkit_oop_ex', 'zrenamed_oop_ex'));
  },
  1,
  'ABAP 앵커',
);
t(
  '앵커 파일 자체가 사라져도 → FAIL',
  (root) => fs.rmSync(path.join(root, 'interactive', 'core', 'personas', 'sap-executor.md')),
  1,
  '[앵커] 파일 부재',
);

console.log('\n⑶ 역사(HISTORY)는 결함이 아니다');
t(
  'docs/ 아래 구 토큰 → PASS',
  (root) => W(root, 'docs/reference/decision-note.md', '구 세대는 `.sc4sap` 이었고 `SC4SAP_HOME_DIR` 을 썼다.\n'),
  0,
  '개명 완료 게이트 통과',
);
t(
  // 판7.5(D-101)에서 `engine/` 예외가 HISTORY에서 전부 빠졌다 — 구 포크가 은퇴해
  // 스캔 대상 자체가 없어졌기 때문이다. 이 두 케이스가 지키는 뜻은 경로가 아니라
  // **범주**다("시험 자산의 구 토큰은 PASS" · "빌드 산출물의 구 토큰은 PASS").
  // 그래서 같은 범주의 **살아 있는** 예외로 옮겨 뜻을 유지한다.
  '시험 자산(interactive/scripts/test-*)의 구 토큰 → PASS',
  (root) => W(root, 'interactive/scripts/test-setup-state.mjs', 'const LEGACY = ".sc4sap";\n'),
  0,
  '개명 완료 게이트 통과',
);
t(
  '빌드 산출물(server.bundle.cjs)의 구 토큰 → PASS',
  (root) => W(root, 'interactive/server/server.bundle.cjs', 'const LEGACY = ".sc4sap";\n'),
  0,
  '개명 완료 게이트 통과',
);
t(
  // 죽은 예외를 지운 것이 **실제로 효력이 있는지** 잰다 — engine/ 예외가 남아 있었다면
  // 이 케이스가 PASS(exit 0)로 새어 나갔을 것이다.
  '은퇴한 engine/ 경로의 구 토큰 → 더는 봐주지 않는다 (exit 1)',
  (root) => W(root, 'engine/dist/lib/profile.js', 'const LEGACY = ".sc4sap";\n'),
  1,
  '구 세대 토큰',
);

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
