#!/usr/bin/env node
// sc4sap 이식 provenance 스냅샷 생성기 (S3 · D-027 로드맵 §9.2).
//
// ⚠️ 이 스크립트만이 외부 원본(sc4sap-custom)에 접근한다. CI에서 실행하지 않는다.
//    검증 게이트는 check-migration-snapshot.mjs이며 그쪽은 원본 없이 오프라인으로 돈다.
//
// private 안전 계약 (R-004):
//   - 파일시스템 재귀 순회를 하지 않는다. `git ls-tree`에 **명시 public root allowlist**를
//     pathspec으로 넘기는 방식만 쓴다 — private/ 는 git에 질의조차 하지 않는다.
//   - 산출 JSON에 private 경로가 한 건이라도 섞이면 생성 자체를 거부한다.
//   - 원본을 수정하지 않는다 (읽기 전용 plumbing 명령만).
//
// 사용: node interactive/scripts/build-migration-snapshot.mjs [--src <path>] [--check]
//   --check : 파일을 쓰지 않고 현재 커밋된 스냅샷과 재생성 결과가 같은지만 비교(재현성 검사)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROV = path.join(ROOT, 'provenance');
const MANIFEST = path.join(ROOT, 'MIGRATION-MANIFEST.md');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const srcIdx = argv.indexOf('--src');
const SRC = srcIdx >= 0 ? argv[srcIdx + 1] : (process.env.SC4SAP_SRC ?? 'D:/claude for SAP/sc4sap-custom');

// ── 핀 계약 ────────────────────────────────────────────────────────────────
// 이식은 2026-07-10에 수행됐다. 핀 = 그 시점 원본 레포의 HEAD.
// 확정 방법(재현 가능): git rev-list -1 --until=2026-07-10T23:59:59 HEAD
const PINNED_COMMIT = 'a95eb0fe962adfb12fae6840213d85391b7703a8';
const PINNED_DATE = '2026-07-07';

// 명시 public root allowlist — MIGRATION-MANIFEST 규칙의 최상위 토큰에서 유래.
// private/ 는 여기에 없고, 앞으로도 추가하지 않는다.
const PUBLIC_ROOTS = [
  '.claude-plugin', '.github', 'hooks', 'configs', 'industry', 'country', 'agents',
  'skills', 'common', 'abap', 'engine', 'runtime-deps', 'data', 'exceptions', 'asset',
  'scripts', 'docs', 'src', 'tests', 'LICENSE', 'CLAUDE.md', 'README.md', 'README.de.md',
  'README.ja.md', 'README.ko.md', 'CHANGELOG.md', '.mcp.json', '.gitattributes',
  '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts',
  '.release-exclude', 'sc4sap.png', 'sc4sap_unleashed.png',
];

// 절대 읽지 않는 root — 선언이지 열거가 아니다(내용을 묻지 않는다).
const PRIVATE_ROOTS = ['private/'];

// 원본에 존재하나 git에 추적되지 않는 런타임 상태(.omc/ .sc4sap/ .claude/settings.local.json).
// 매니페스트가 obsolete로 분류하며, 추적 대상이 아니므로 pinned inventory에는 없다.
const UNTRACKED_OBSOLETE = ['.omc/**', '.sc4sap/**', '.claude/settings.local.json'];

// pinned inventory에서 매칭 0건이 **정상인** 규칙과 그 사유.
// 구 live-walk 게이트는 "죽은 규칙"으로 exit 2를 냈지만, tracked-public-inventory
// 계약에서는 아래 4건이 0이어야 오히려 옳다. 0이 아니면 계약 위반이다.
const EXPECT_ZERO = {
  'private/**': 'allowlist pathspec이라 git에 질의조차 하지 않음 — 0이 아니면 private 유출',
  '.omc/**': 'untracked 세션 상태 — git tree에 없음',
  '.sc4sap/**': 'untracked MCP 런타임 상태 — git tree에 없음',
  '.claude/settings.local.json': 'untracked 로컬 권한 상태 — git tree에 없음',
};

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function assertNoPrivate(paths, where) {
  const bad = paths.filter((p) => PRIVATE_ROOTS.some((r) => p === r.replace(/\/$/, '') || p.startsWith(r)));
  if (bad.length) {
    console.error(`❌ private 경로가 ${where}에 유입됨 (${bad.length}건) — 생성 거부`);
    process.exit(3);
  }
}

// ── 1. pinned public inventory ─────────────────────────────────────────────
assertNoPrivate(PUBLIC_ROOTS, 'PUBLIC_ROOTS allowlist');

function git(args) {
  // core.quotePath=false: 비ASCII 경로(한글 파일명)를 C-escape 없이 그대로 받는다.
  return execFileSync('git', ['-C', SRC, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

let entries;
try {
  // ls-tree -r -z: allowlist를 pathspec으로 고정 → private/ 는 질의 대상이 아님.
  const out = git(['ls-tree', '-r', '-z', '--format=%(objectname) %(path)', PINNED_COMMIT, '--', ...PUBLIC_ROOTS]);
  entries = out.split('\0').filter(Boolean).map((line) => {
    const sp = line.indexOf(' ');
    return { path: line.slice(sp + 1), blob: line.slice(0, sp) };
  });
} catch (e) {
  console.error(`❌ 원본 접근 실패: ${SRC}`);
  console.error('   이 생성기는 원본이 있는 머신에서만 돈다. 검증 게이트는 check-migration-snapshot.mjs(오프라인)다.');
  console.error(String(e.message).split('\n')[0]);
  process.exit(4);
}

entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
assertNoPrivate(entries.map((e) => e.path), 'pinned inventory');

const inventoryHash = sha256(entries.map((e) => `${e.path} ${e.blob}\n`).join(''));

// ── 2. 매니페스트 규칙 파싱 ─────────────────────────────────────────────────
const rules = [];
for (const line of fs.readFileSync(MANIFEST, 'utf8').split('\n')) {
  const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(copy|transform|archive|exclude-private|obsolete)\s*\|(.*?)\|?\s*$/);
  if (m) rules.push({ pattern: m[1], cls: m[2], note: m[3].trim() });
}
if (!rules.length) {
  console.error('❌ 규칙 0개 — 매니페스트 파싱 실패');
  process.exit(1);
}

function toMatcher(p) {
  if (p.endsWith('/**')) {
    const prefix = p.slice(0, -2);
    return (f) => f.startsWith(prefix);
  }
  if (p.includes('*')) {
    const re = new RegExp(
      '^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$'
    );
    return (f) => re.test(f);
  }
  return (f) => f === p;
}

// 첫 매칭 우선 — 원본 경로를 규칙에 배정.
const perRule = new Map(rules.map((r) => [r.pattern, []]));
const unmatched = [];
for (const e of entries) {
  const hit = rules.find((r) => toMatcher(r.pattern)(e.path));
  if (hit) perRule.get(hit.pattern).push(e.path);
  else unmatched.push(e.path);
}

// ── 3. 목적지(우리 자산) 해시 ───────────────────────────────────────────────
// copy/transform 규칙의 목적지 토큰 → interactive/ 기준 실재 + 내용 해시.
// 디렉터리 토큰은 tree hash(정렬된 'relpath sha256' 라인들의 sha256).
function hashTarget(token) {
  const abs = path.join(ROOT, token);
  if (!fs.existsSync(abs)) return null;
  const st = fs.statSync(abs);
  if (st.isFile()) return { kind: 'file', sha256: sha256(fs.readFileSync(abs)) };
  const files = [];
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else files.push(full);
    }
  })(abs);
  files.sort();
  const lines = files.map((f) => `${path.relative(abs, f).replaceAll('\\', '/')} ${sha256(fs.readFileSync(f))}\n`);
  return { kind: 'tree', files: files.length, sha256: sha256(lines.join('')) };
}

const mapped = rules.map((r) => {
  const sources = perRule.get(r.pattern);
  const rec = {
    pattern: r.pattern,
    class: r.cls,
    note: r.note,
    source_matches: sources.length,
  };
  if (EXPECT_ZERO[r.pattern]) {
    rec.expect_zero = true;
    rec.expect_zero_reason = EXPECT_ZERO[r.pattern];
  }
  // transform 자산은 source list를 명시 기록(로드맵 §9.2). copy는 수가 많아 count + 목적지 해시로 갈음하되,
  // 매칭 0건이 아님을 pinned inventory가 증명한다.
  if (r.cls === 'transform') rec.sources = sources;
  if (r.cls !== 'copy' && r.cls !== 'transform') return rec;

  const deferred = /deferred/i.test(r.note);
  const tokens = [...r.note.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t) => !t.includes('*'));
  rec.deferred = deferred;
  rec.targets = tokens.map((t) => {
    const h = hashTarget(t);
    return h ? { token: t, ...h } : { token: t, missing: true };
  });
  return rec;
});

// ── 4. 산출 ────────────────────────────────────────────────────────────────
const sourceDoc = {
  _: 'sc4sap-custom public source pin — S3/D-027 로드맵 §9.2. 이 파일과 migration-map.json이 이식 provenance의 정본이다.',
  _private_contract:
    'private/ 는 어떤 도구로도 읽지 않는다. 아래 allowlist는 명시 열거이며, 게이트는 private 경로 0건을 assert한다.',
  source: {
    repo: 'sc4sap-custom',
    local_path_hint: 'D:/claude for SAP/sc4sap-custom (동결 · R-004)',
    pinned_commit: PINNED_COMMIT,
    pinned_commit_date: PINNED_DATE,
    pin_rationale:
      '이식 실행일은 2026-07-10이고, 이 커밋이 그 시점 원본 레포의 HEAD다. 이후 원본 public 영역은 변경됐다(드리프트는 report-sc4sap-public-drift.mjs 소관).',
    pin_method: 'git rev-list -1 --until=2026-07-10T23:59:59 HEAD',
  },
  public_root_allowlist: PUBLIC_ROOTS,
  private_roots_never_read: PRIVATE_ROOTS,
  untracked_obsolete_not_in_inventory: UNTRACKED_OBSOLETE,
  inventory: {
    scope: 'pinned commit에서 public_root_allowlist에 매칭되는 git-tracked 파일 전량',
    count: entries.length,
    hash: inventoryHash,
    hash_method: "sha256( 정렬된 '<path> <blob>\\n' 라인들의 연결 )",
    count_note:
      "MIGRATION-MANIFEST 머리말의 508(2026-07-10 실측)은 untracked 런타임 상태를 포함한 파일시스템 walk 수치이고, 구 live 게이트의 494는 원본이 이후 변동한 뒤의 walk 수치다. 이 인벤토리의 수는 'pinned commit의 tracked public 파일' 이라는 다른(그리고 재현 가능한) 계약이므로 세 수치는 일치하지 않는 것이 정상이다.",
    entries,
  },
};

const mapDoc = {
  _: 'sc4sap → interactive 이식 맵 — 규칙별 분류/원본 매칭/목적지 해시. 정본 분류는 MIGRATION-MANIFEST.md이며 이 파일은 그것을 pinned inventory에 대해 해석한 결과다.',
  pinned_commit: PINNED_COMMIT,
  manifest: 'interactive/MIGRATION-MANIFEST.md',
  unmatched_source_paths: unmatched,
  rules: mapped,
};

// 경로를 담는 필드만 검사한다. `private/**`(매니페스트 규칙 패턴)과 `private/`
// (never_read 선언)는 열거가 아니라 배제 선언이므로 검사 대상이 아니다.
assertNoPrivate(entries.map((e) => e.path), 'inventory entries');
assertNoPrivate(unmatched, 'unmatched source paths');
assertNoPrivate(mapped.flatMap((r) => r.sources ?? []), 'transform source lists');

const outFiles = [
  [path.join(PROV, 'sc4sap-public-source.json'), JSON.stringify(sourceDoc, null, 2) + '\n'],
  [path.join(PROV, 'migration-map.json'), JSON.stringify(mapDoc, null, 2) + '\n'],
];

if (CHECK_ONLY) {
  let drift = 0;
  for (const [f, content] of outFiles) {
    const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (cur !== content) {
      console.log(`❌ 재생성 불일치: ${path.relative(ROOT, f)}`);
      drift++;
    } else console.log(`✅ 재현: ${path.relative(ROOT, f)}`);
  }
  process.exit(drift ? 1 : 0);
}

fs.mkdirSync(PROV, { recursive: true });
for (const [f, content] of outFiles) fs.writeFileSync(f, content);

console.log(`pinned commit : ${PINNED_COMMIT} (${PINNED_DATE})`);
console.log(`public roots  : ${PUBLIC_ROOTS.length}`);
console.log(`inventory     : ${entries.length} files, hash ${inventoryHash.slice(0, 16)}…`);
console.log(`rules         : ${rules.length} (unmatched source paths: ${unmatched.length})`);
console.log(`private paths : 0 (allowlist pathspec — private/ 는 질의조차 하지 않음)`);
console.log(`\n작성: interactive/provenance/{sc4sap-public-source.json,migration-map.json}`);
