#!/usr/bin/env node
// check-runtime-path-rename.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
//
// 실제 트리를 임시 디렉터리로 **필요한 파일만** 복제해 변조하고, `--root`로 먹여
// 게이트가 거부하는지 본다. 원본 트리는 건드리지 않는다. SAP 무접촉 · 오프라인.
//
// 검사 4종 (D-057 §7-2):
//   ⑴ 활성 구역(A)에 legacy 토큰 1개 주입      → FAIL
//   ⑵ 안전 앵커 제거                            → FAIL
//   ⑶ 폴백 의무 파일(C)에서 구 토큰 제거        → FAIL
//   ⑷ 무변조 복제 트리                          → PASS
// 보강 2종: 캡 초과 → FAIL · ALLOWLIST 파일이 신 이름을 잃으면 → FAIL
//
// ⑸ 구역 C의 **한계**와 그 보완자 (3차 리뷰 #5). 구역 C는 토큰 존재만 세므로
//    상수·주석만 남기고 실행 분기를 지우면 통과한다. 그 구멍을 메우는 것은
//    게이트가 아니라 적합성 러너다 — 마지막 절이 그 분업을 **실측으로** 고정한다:
//    legacy 분기를 지운 리졸버는 게이트를 통과하지만 러너에서 red가 난다.
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

// 게이트가 보는 것 = 구역 C 목록 · ALLOWLIST · 앵커 · 그리고 "그 밖의 활성 파일".
// 그래서 복제 트리에는 이 세 부류의 실물만 넣으면 충분하다. 전체 레포를 복사하면
// 케이스당 수천 파일이라 시험이 느려지고, 무엇을 검사했는지도 흐려진다.
const NEEDED = [
  // 구역 C — 폴백 의무
  'engine/src/lib/profile.ts',
  'interactive/server/launch.cjs',
  'interactive/adapters/claude/lib/profile-resolve.mjs',
  'interactive/adapters/claude/hooks/tier-readonly-guard.mjs',
  'interactive/adapters/claude/hooks/block-forbidden-tables.mjs',
  'interactive/adapters/claude/hooks/offline-code-analysis.mjs',
  'interactive/tools/vpass/vpass.mjs',
  'interactive/tools/extract/extract-spro.mjs',
  'interactive/tools/extract/extract-customizations.mjs',
  'interactive/scripts/get-vsp.mjs',
  'interactive/scripts/lib/target-hash.mjs',
  'scripts/vsp-env.ps1',
  '.gitignore',
  'interactive/.gitignore',
  'engine/.gitignore',
  'vsp/.gitignore',
  'interactive/adapters/claude/permissions-template.json',
  'interactive/scripts/gen-permissions.mjs',
  // ALLOWLIST — 캡 대상
  'interactive/core/procedures/setup.md',
  'interactive/core/procedures/troubleshooting.md',
  'interactive/core/project-context.md',
  'adapters/vsp/SAFETY-PROFILES.md',
  'interactive/server/tool-catalog/sc4sap-mcp-tools-runtime.md',
  'engine/src/handlers/system/readonly/handleReloadProfile.ts',
  'engine/src/lib/gatewayRfc.ts',
  'engine/src/lib/nativeRfc.ts',
  'engine/src/lib/odataRfc.ts',
  'engine/src/lib/zrfcProxy.ts',
  'engine/src/server/launcher.ts',
  'engine/docs/user-guide/AVAILABLE_TOOLS.md',
  'engine/docs/user-guide/AVAILABLE_TOOLS_LEGACY.md',
  'engine/docs/user-guide/AVAILABLE_TOOLS_READONLY.md',
  'scripts/promote-track-b-run.ps1',
  // 앵커 (위와 겹치지 않는 것)
  'interactive/core/procedures/create-program.md',
  'interactive/core/procedures/review-checklist.md',
  'interactive/core/personas/sap-executor.md',
  'interactive/core/knowledge/abap/conventions/clean-code-oop.md',
  'interactive/core/knowledge/abap/conventions/include-structure.md',
  'interactive/core/knowledge/abap/conventions/oop-pattern.md',
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

const W = (root, rel, text) => fs.writeFileSync(path.join(root, ...rel.split('/')), text);
const R = (root, rel) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');

console.log('무변조');
t('무변조 복제 트리는 PASS', null, 0, '런타임 경로 개명 게이트 통과');

console.log('\n⑴ 활성 구역(A) legacy 토큰 주입');
t(
  '허용 목록에 없는 활성 파일에 `.sc4sap` 1개 → FAIL',
  (root) => {
    const rel = 'interactive/core/procedures/create-program.md';
    W(root, rel, R(root, rel) + '\n프로젝트 상태는 `.sc4sap/program/` 아래에 쌓인다.\n');
  },
  1,
  '[구역 A]',
);
t(
  '`SC4SAP_HOME_DIR` 표기도 같은 규칙으로 잡힌다 → FAIL',
  (root) => {
    const rel = 'interactive/core/personas/sap-executor.md';
    W(root, rel, R(root, rel) + '\n환경변수 SC4SAP_HOME_DIR 을 확인한다.\n');
  },
  1,
  '[구역 A]',
);
t(
  'ALLOWLIST 파일이라도 캡을 넘으면 → FAIL',
  (root) => {
    const rel = 'interactive/core/project-context.md';
    W(root, rel, R(root, rel) + '\n추가 안내: `.sc4sap/` 도 보고 `.sc4sap/config.json` 도 본다.\n');
  },
  1,
  '캡 초과',
);
t(
  'ALLOWLIST 파일이 신 이름을 잃으면 → FAIL',
  (root) => {
    const rel = 'engine/src/lib/gatewayRfc.ts';
    W(root, rel, R(root, rel).replaceAll('.sapkit', '.LEGACYONLY'));
  },
  1,
  '신 이름 부재',
);

console.log('\n⑵ 안전 앵커 제거');
t(
  'Windows credential target 문자열 제거 → FAIL',
  (root) => {
    const rel = 'scripts/vsp-env.ps1';
    W(root, rel, R(root, rel).replace("$credTargetCandidates += ($Matches[1] + '.sc4sap')", '# removed'));
  },
  1,
  'Windows credential target',
);
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
  'ABAP 앵커(zrsc4sap_oop_ex) 개명 → FAIL',
  (root) => {
    const rel = 'interactive/core/knowledge/abap/conventions/oop-pattern.md';
    W(root, rel, R(root, rel).replaceAll('zrsc4sap_oop_ex', 'zrsapkit_oop_ex'));
  },
  1,
  'ABAP 앵커',
);

console.log('\n⑶ 폴백 의무(구역 C) 파괴');
t(
  '리졸버에서 구 토큰 제거 → FAIL',
  (root) => {
    const rel = 'interactive/adapters/claude/lib/profile-resolve.mjs';
    W(root, rel, R(root, rel).replaceAll('.sc4sap', '.sapkit').replaceAll('SC4SAP_HOME_DIR', 'SAPKIT_HOME_DIR'));
  },
  1,
  '구 세대 토큰',
);
t(
  '.gitignore에서 구 세대 제거 → FAIL',
  (root) => W(root, 'interactive/.gitignore', 'node_modules/\n.sapkit/\n'),
  1,
  '구 세대 토큰',
);
t(
  '권한 템플릿에서 구 3줄 제거 → FAIL',
  (root) => {
    const rel = 'interactive/adapters/claude/permissions-template.json';
    const j = JSON.parse(R(root, rel));
    const strip = (arr) => (Array.isArray(arr) ? arr.filter((x) => !String(x).includes('.sc4sap')) : arr);
    for (const k of Object.keys(j.permissions ?? {})) j.permissions[k] = strip(j.permissions[k]);
    W(root, rel, JSON.stringify(j, null, 2));
  },
  1,
  '구 세대 토큰',
);
t(
  'target-hash의 NOT_ASSET_DIRS에서 구 세대 제거 → FAIL',
  (root) => {
    const rel = 'interactive/scripts/lib/target-hash.mjs';
    W(root, rel, R(root, rel).replaceAll('.sc4sap', '.sapkit'));
  },
  1,
  '구 세대 토큰',
);
t(
  '폴백 의무 파일 자체가 사라지면 → FAIL',
  (root) => fs.rmSync(path.join(root, 'interactive', 'server', 'launch.cjs')),
  1,
  '파일 부재',
);

// ── ⑸ 구역 C의 한계 ↔ 적합성 러너의 보완 (3차 리뷰 #5) ─────────────────────
// 구역 C는 "legacy 토큰이 있는가"만 센다. 상수 선언과 주석을 남긴 채 **실행 분기만**
// 지우면 게이트는 통과한다 — 이 절이 그 사실과, 그래서 왜 러너가 CI 필수인지를
// 한꺼번에 실측한다. 변조 대상은 profile-resolve.mjs 하나이므로 러너의
// `--consumer-root`(없는 파일은 실물 폴백)로 번들 복사 없이 갈아끼운다.
console.log('\n⑸ 구역 C 한계 ↔ 러너 보완');
{
  const REL = 'interactive/adapters/claude/lib/profile-resolve.mjs';
  // `--consumer-root`는 **interactive/ 기준** 상대경로로 겹쳐 쓴다.
  const INT_REL = 'adapters/claude/lib/profile-resolve.mjs';
  const RUNNER = path.join(HERE, 'conformance-runtime-dir.mjs');
  const LEGACY_CASE = 'tie-legacy-only';
  const runRunner = (extra) => {
    try {
      return { code: 0, out: execFileSync('node', [RUNNER, '--case', LEGACY_CASE, ...extra], { encoding: 'utf8' }) };
    } catch (e) {
      return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
    }
  };

  // 대조군: 무변조 실물로 같은 케이스를 돌리면 통과한다.
  const control = runRunner([]);
  if (control.code === 0) {
    console.log('  ✅ 대조군: 무변조 실물 + legacy-only 케이스 → 러너 PASS');
    pass++;
  } else {
    console.log(`  ❌ 대조군: 무변조인데 러너가 실패했다 (exit ${control.code})`);
    console.log(control.out.split('\n').slice(-15).map((l) => '       ' + l).join('\n'));
    fail++;
  }

  // 변조군: 실행 분기에서만 legacy 세대를 지우고 **토큰은 주석으로 남긴다.**
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-noexec-'));
  try {
    const dst = path.join(overlay, ...INT_REL.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const src = fs.readFileSync(path.join(REPO, REL), 'utf8');
    // 상수 값만 신 세대로 바꿔 legacy 후보를 실질적으로 제거한다. 파일 전체의
    // `.sc4sap`/`SC4SAP_HOME_DIR` 주석·문서 문자열은 그대로 남는다.
    const mutated = src
      .replace("const LEGACY_DIR = '.sc4sap';", "const LEGACY_DIR = '.sapkit'; // .sc4sap / SC4SAP_HOME_DIR (토큰만 남긴 변조)")
      .replace(
        "  const legacyEnv = process.env.SC4SAP_HOME_DIR;",
        "  const legacyEnv = null; // process.env.SC4SAP_HOME_DIR (토큰만 남긴 변조)",
      );
    if (mutated === src) throw new Error('변조 앵커를 찾지 못했다 — 리졸버 구조가 바뀌었다');
    fs.writeFileSync(dst, mutated);

    // ⓐ 게이트는 그래도 통과한다 = 구역 C의 한계 (토큰이 남아 있으므로).
    let gateRoot;
    try {
      gateRoot = buildTree();
      fs.copyFileSync(dst, path.join(gateRoot, ...REL.split('/')));
      const g = runGate(gateRoot);
      if (g.code === 0) {
        console.log('  ✅ 한계 실측: 실행 분기를 지워도 게이트(구역 C)는 통과한다');
        pass++;
      } else {
        console.log(`  ❌ 한계 실측: 게이트가 exit ${g.code} — 전제가 바뀌었다면 이 문서를 갱신할 것`);
        console.log(g.out.split('\n').map((l) => '       ' + l).join('\n'));
        fail++;
      }
    } finally {
      if (gateRoot) fs.rmSync(gateRoot, { recursive: true, force: true });
    }

    // ⓑ 러너는 잡는다 = 실행 보증의 소유자가 러너라는 주장의 증명.
    const red = runRunner(['--consumer-root', overlay]);
    const caught = red.code === 1 && red.out.includes('profile-resolve');
    if (caught) {
      console.log('  ✅ 보완 실측: 같은 변조를 적합성 러너는 legacy-only 케이스에서 잡는다 (red)');
      pass++;
    } else {
      console.log(`  ❌ 보완 실측: 러너가 잡지 못했다 (exit ${red.code})`);
      console.log(red.out.split('\n').slice(-20).map((l) => '       ' + l).join('\n'));
      fail++;
    }
  } catch (err) {
    console.log(`  ❌ ⑸ 절 자체 실패: ${err.message}`);
    fail++;
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true });
  }
}

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
