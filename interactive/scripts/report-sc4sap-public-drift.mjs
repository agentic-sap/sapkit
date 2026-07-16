#!/usr/bin/env node
// 상류 sc4sap-custom public 영역 드리프트 리포트 (S3 · D-027 로드맵 §9.2).
//
// 이것은 **리포트**지 게이트가 아니다. 무엇도 실패시키지 않고, 무엇도 자동 이식하지 않는다.
// CI에서 돌지 않는다(원본이 없다). 사람이 이식 여부를 판단할 때 쓰는 목록을 만든다.
//
// private 안전 계약 (R-004):
//   - pinned snapshot의 public_root_allowlist만 pathspec으로 넘긴다 — private/ 는 질의하지 않는다.
//   - 원본을 수정하지 않는다(읽기 전용 plumbing).
//
// 분류: adopted / intentionally-diverged / obsolete / pending
//   기록처 = interactive/provenance/upstream-drift-dispositions.json
//   기록이 없는 변경은 전부 pending이다(= 아직 안 봤다. 없는 판단을 지어내지 않는다).
//
// 사용: node interactive/scripts/report-sc4sap-public-drift.mjs [--src <path>] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROV = path.join(ROOT, 'provenance');
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const srcIdx = argv.indexOf('--src');
const SRC = srcIdx >= 0 ? argv[srcIdx + 1] : (process.env.SC4SAP_SRC ?? 'D:/claude for SAP/sc4sap-custom');

const CLASSES = ['adopted', 'intentionally-diverged', 'obsolete', 'pending'];

function loadJson(f, hint) {
  if (!fs.existsSync(f)) {
    console.error(`❌ 부재: ${path.relative(ROOT, f)}${hint ? ' — ' + hint : ''}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

const src = loadJson(path.join(PROV, 'sc4sap-public-source.json'), 'build-migration-snapshot.mjs로 생성');
const map = loadJson(path.join(PROV, 'migration-map.json'));
const dispFile = path.join(PROV, 'upstream-drift-dispositions.json');
const disp = fs.existsSync(dispFile) ? JSON.parse(fs.readFileSync(dispFile, 'utf8')) : { dispositions: {} };

const PIN = src.source.pinned_commit;
const ROOTS = src.public_root_allowlist;
const PRIVATE_ROOTS = src.private_roots_never_read ?? ['private/'];

if (ROOTS.some((r) => PRIVATE_ROOTS.some((p) => r === p.replace(/\/$/, '') || r.startsWith(p)))) {
  console.error('❌ allowlist에 private root — 중단');
  process.exit(3);
}

function git(args) {
  return execFileSync('git', ['-C', SRC, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

let head;
try {
  head = git(['rev-parse', 'HEAD']).trim();
} catch (e) {
  console.error(`❌ 원본 접근 실패: ${SRC}`);
  console.error('   이 리포트는 원본이 있는 머신에서만 돈다 (CI 대상 아님).');
  console.error('   이식 provenance 검증만 필요하면: node interactive/scripts/check-migration-snapshot.mjs');
  process.exit(4);
}

if (head === PIN) {
  console.log(`pin과 현재 public HEAD가 동일(${PIN.slice(0, 12)}…) — 드리프트 0`);
  process.exit(0);
}

// pinned..HEAD 사이 public 영역 변경만. pathspec = allowlist.
let raw;
try {
  raw = git(['diff', '--name-status', '-M', `${PIN}..${head}`, '--', ...ROOTS]);
} catch (e) {
  console.error(`❌ diff 실패 — pin(${PIN.slice(0, 12)}…)이 이 원본에 없을 수 있다.`);
  console.error(String(e.message).split('\n')[0]);
  process.exit(4);
}

const changes = [];
for (const line of raw.split('\n').filter(Boolean)) {
  const parts = line.split('\t');
  const status = parts[0][0]; // A/M/D/R
  const p = status === 'R' ? parts[2] : parts[1];
  const from = status === 'R' ? parts[1] : undefined;
  changes.push({ status, path: p, from });
}

// private 유출 방어 — allowlist pathspec이면 구조적으로 불가하나, 그래도 assert한다.
const leaked = changes.filter((c) => PRIVATE_ROOTS.some((r) => c.path.startsWith(r)));
if (leaked.length) {
  console.error(`❌ 치명: private 경로가 diff에 등장 (${leaked.length}건) — 중단`);
  process.exit(3);
}

// 각 변경에 이식 규칙 분류를 붙인다(우리가 그 경로를 애초에 어떻게 다뤘는지).
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
const matchers = (map.rules ?? []).map((r) => ({ ...r, match: toMatcher(r.pattern) }));

const STATUS_LABEL = { A: '신규', M: '수정', D: '삭제', R: '이동' };
for (const c of changes) {
  const rule = matchers.find((r) => r.match(c.path));
  c.migration_class = rule ? rule.class : '(규칙 없음 — pin 이후 신설 경로)';
  c.rule = rule?.pattern ?? null;
  const d = disp.dispositions?.[c.path];
  c.disposition = d?.disposition ?? 'pending';
  c.disposition_note = d?.note;
  if (!CLASSES.includes(c.disposition)) c.disposition = 'pending';
}

if (AS_JSON) {
  console.log(JSON.stringify({ pin: PIN, head, count: changes.length, changes }, null, 2));
  process.exit(0);
}

console.log(`pin      : ${PIN.slice(0, 12)}… (${src.source.pinned_commit_date})`);
console.log(`public HEAD: ${head.slice(0, 12)}…`);
console.log(`public 변경: ${changes.length}건 (allowlist ${ROOTS.length}개 root · private 질의 0)\n`);

const byDisp = {};
for (const c of changes) (byDisp[c.disposition] ??= []).push(c);

for (const cls of CLASSES) {
  const list = byDisp[cls];
  if (!list?.length) continue;
  console.log(`── ${cls} (${list.length})`);
  // 이식 분류별로 다시 묶어 보여준다 — copy/transform 변경이 pending이면 실제 검토 대상.
  const byMig = {};
  for (const c of list) (byMig[c.migration_class] ??= []).push(c);
  for (const [mig, cs] of Object.entries(byMig).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   [${mig}] ${cs.length}건`);
    for (const c of cs.slice(0, 12)) {
      console.log(`     ${STATUS_LABEL[c.status] ?? c.status} ${c.path}${c.from ? ` (← ${c.from})` : ''}`);
    }
    if (cs.length > 12) console.log(`     … 외 ${cs.length - 12}건`);
  }
  console.log('');
}

const actionable = changes.filter(
  (c) => c.disposition === 'pending' && (c.migration_class === 'copy' || c.migration_class === 'transform')
);
console.log(`검토 필요(pending × copy/transform): ${actionable.length}건`);
console.log(`판단 기록처: interactive/provenance/upstream-drift-dispositions.json`);
console.log(`\n이 리포트는 아무것도 이식하지 않는다. 이식은 사람이 결정하고 MIGRATION-MANIFEST + 스냅샷 재생성으로 반영한다.`);
