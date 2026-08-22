#!/usr/bin/env node
/**
 * 구 핸들러 트리 최종 채록기 — `engine/src/handlers`를 **마지막으로 한 번** 읽어
 * `harness/old-surface/handler-tree.json`으로 굳힌다.
 *
 * 판7.5에서 구 MCP 서버 포크 `engine/`이 레포에서 통째로 삭제된다. 그 전까지
 * `harness/build-plan.mjs`(`folderByTool()`)와 `harness/ledger/collect.ts`
 * (`scanDelegation()`)가 그 트리를 **라이브로** 읽고 있었다 — 삭제되면 둘 다 깨진다.
 * 이 스크립트가 그 라이브 읽기를 한 번의 채록으로 굳혀, 이후에는 소비자 둘 다
 * `engine/`이 아니라 이 채록본만 읽게 한다(`harness/build-plan.mjs`·
 * `harness/ledger/collect.ts` 참조).
 *
 *   node harness/old-surface/capture-handler-tree.mjs
 *
 * **원본은 삭제되면 되뜰 수 없다.** 그래서 이 스크립트는 `engine/src/handlers`가
 * 있을 때만 돌고, 없으면 조용히 넘어가지 않고 "원본이 은퇴했다 · 이 채록본이
 * 정본이다 · git 이력에서만 되뜰 수 있다"로 명확히 멈춘다(exit 2). `--check`
 * 대조 모드는 없다 — 채록본은 매 실행마다 바뀔 수 있는 `git rev-parse HEAD`를
 * 메타로 싣고, 원본은 이 커밋 이후 다시는 채록되지 않을 것이므로 "산식과
 * 일치하는가"를 상시 지킬 대상이 아니다(`m1-tools.json`의 `capture.mjs`와 같은
 * 지위 — 되뜰 수 없는 기준의 잔존 형태).
 *
 * SAP에 붙지 않는다. 입력은 레포 안의 `engine/src/handlers`뿐이다. 구 부품은
 * **읽기만** 한다.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const OLD_SURFACE = fileURLToPath(new URL('.', import.meta.url));
const ENGINE_ROOT = path.resolve(OLD_SURFACE, '..', '..'); // sapkit-engine/
const REPO_ROOT = path.resolve(ENGINE_ROOT, '..');
const HANDLERS = path.join(REPO_ROOT, 'engine', 'src', 'handlers');
const OUT = path.join(OLD_SURFACE, 'handler-tree.json');

if (!fs.existsSync(HANDLERS)) {
  console.error('❌ 원본이 은퇴했다 — engine/src/handlers 가 없다.');
  console.error('   · 구 MCP 서버 포크 engine/ 은 판7.5에서 레포에서 삭제됐다 — 재채록 수단이 없다.');
  console.error(`   · ${path.relative(REPO_ROOT, OUT).split(path.sep).join('/')} 이 되뜰 수 없는 기준이다.`);
  console.error('   · 되뜨려야 하면 git 이력에서 삭제 이전 커밋을 참조하라 — 예:');
  console.error('       git log --oneline --diff-filter=D -- engine/src/handlers   (삭제된 커밋을 찾는다)');
  console.error('       git show <그 부모 커밋>:engine/src/handlers/...            (그때의 실물을 본다)');
  process.exit(2);
}

const DIST_LEDGER = here('../../dist/harness/ledger/index.js');
if (!fs.existsSync(DIST_LEDGER)) {
  console.error(`❌ 빌드 산출물이 없다: ${DIST_LEDGER}`);
  console.error('   · scanDelegation()은 harness/ledger/delegation.ts가 소유한다 — `npm run build`를 먼저 돌려라.');
  process.exit(2);
}
const { scanDelegation } = require(DIST_LEDGER);

// ── folderByTool — harness/build-plan.mjs의 folderByTool()과 정확히 같은 산식
// (읽기 전용). 두 곳에 같은 규칙을 두 번 적는 이유: 이 스크립트는 채록 시점에
// 딱 한 번 돌고, build-plan.mjs는 이 채록본을 매 실행 읽기만 한다 — 산식 자체는
// 채록 시점에 이미 결과로 굳어 채록본 안에 있으므로 두 파일이 같은 함수를
// import로 공유해야 할 이유가 사라진다.
const TOOL_NAME = /export const TOOL_DEFINITION[^{]*=\s*{\s*name:\s*['"]([^'"]+)['"]/;

function walkTypeScript(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTypeScript(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function folderByTool(files) {
  const map = {};
  for (const file of files) {
    const hit = TOOL_NAME.exec(fs.readFileSync(file, 'utf8'));
    if (hit === null) continue;
    const rel = path.relative(HANDLERS, file).split(path.sep);
    map[hit[1]] = rel.length > 1 ? rel[0] : '(root)';
  }
  return map;
}

// ── 채록 ─────────────────────────────────────────────────────────────────────
const files = walkTypeScript(HANDLERS);
const folders = folderByTool(files);
const scan = scanDelegation(HANDLERS); // srcRoot 기본값 = HANDLERS의 부모(= engine/src) — 산식과 동일

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

const sortEntries = (map) => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));

const report = {
  _: [
    '이 파일은 되뜰 수 없는 기준이다 — 원본 engine/ 은 판7.5에서 은퇴했고 재채록 수단이 없다.',
    '손으로 고치지 말 것 — engine/이 아직 있을 때 capture-handler-tree.mjs를 다시 돌려서만 만든다.',
    'folderByTool = harness/build-plan.mjs 의 folderByTool() 산출과 정확히 같은 값 (도구명 → 구 핸들러 최상위 폴더명).',
    'delegation = harness/ledger/delegation.ts 의 scanDelegation() 산출 전부 — byTool·byToolValue·sourceFiles·directHandlerFiles·directValueHandlerFiles.',
  ],
  capturedAt: {
    engineTreeCommit: commitSha,
    filesWalked: files.length,
    toolsFound: Object.keys(folders).length,
    note: 'engineTreeCommit = 채록 시점 레포 HEAD의 SHA(git rev-parse HEAD). filesWalked = engine/src/handlers 아래 .ts 전체, toolsFound = 그중 TOOL_DEFINITION을 내보낸 파일 수.',
  },
  folderByTool: Object.fromEntries(Object.entries(folders).sort(([a], [b]) => a.localeCompare(b))),
  delegation: {
    byTool: sortEntries(scan.byTool),
    byToolValue: sortEntries(scan.byToolValue),
    sourceFiles: scan.sourceFiles,
    directHandlerFiles: scan.directHandlerFiles,
    directValueHandlerFiles: scan.directValueHandlerFiles,
  },
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`구 핸들러 트리 채록 → ${OUT}`);
console.log(`   · 커밋 ${commitSha} · 파일 ${files.length} · 도구 ${Object.keys(folders).length}종`);
console.log(
  `   · 위임형 — 직접 ${[...scan.byTool.values()].filter((k) => k === 'direct').length} · ` +
    `간접 ${[...scan.byTool.values()].filter((k) => k === 'indirect').length} · ` +
    `없음 ${[...scan.byTool.values()].filter((k) => k === 'none').length} ` +
    `(소스 ${scan.sourceFiles}파일 · 직접참조파일 ${scan.directHandlerFiles} · 값참조파일 ${scan.directValueHandlerFiles})`,
);
process.exit(0);
