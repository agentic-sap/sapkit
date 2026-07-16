#!/usr/bin/env node
// sc4sap 이식 provenance 게이트 (S3 · D-027 로드맵 §9.2·§9.7).
// 구 check-migration-coverage.mjs(외부 원본 live walk)의 대체물.
//
// 계약:
//   - **외부 원본에 접근하지 않는다.** pinned snapshot만 읽으므로 CI 러너에서 그대로 돈다.
//   - private 경로 열거 0건을 assert한다 (R-004).
//   - 구 게이트의 실질(미분류 0 / 죽은 규칙 0 / 목적지 실재)을 pinned inventory에 대해 보존한다.
//   - 추가로 목적지 **내용 해시**까지 검사해 이식 자산 드리프트를 잡는다(구 게이트는 존재만 봄).
//
// exit 0 통과 / 1 계약 위반 / 3 private 유출(치명)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, hashTarget } from './lib/target-hash.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// --prov <dir>: provenance 디렉터리 override. 음성시험이 변조 스냅샷을 먹이면서
// 목적지 자산은 실제 트리를 그대로 쓰기 위한 것. 기본은 interactive/provenance.
const provIdx = process.argv.indexOf('--prov');
const PROV = provIdx >= 0 ? path.resolve(process.argv[provIdx + 1]) : path.join(ROOT, 'provenance');

function load(name) {
  const f = path.join(PROV, name);
  if (!fs.existsSync(f)) {
    console.error(`❌ 스냅샷 부재: interactive/provenance/${name}`);
    console.error('   생성: node interactive/scripts/build-migration-snapshot.mjs (원본 있는 머신에서만)');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

const src = load('sc4sap-public-source.json');
const map = load('migration-map.json');
const fail = [];
const note = [];

// ── 1. private 봉인 ────────────────────────────────────────────────────────
const privateRoots = src.private_roots_never_read ?? [];
if (!privateRoots.length) fail.push('private_roots_never_read 선언이 비어 있음');

const isPrivate = (p) => privateRoots.some((r) => p === r.replace(/\/$/, '') || p.startsWith(r));

for (const r of src.public_root_allowlist ?? []) {
  if (isPrivate(r)) fail.push(`public_root_allowlist에 private root 포함: ${r}`);
}
// 경로를 담는 모든 필드에 private 열거가 없어야 한다.
const pathBearing = [
  ...(src.inventory?.entries ?? []).map((e) => e.path),
  ...(map.unmatched_source_paths ?? []),
  ...(map.rules ?? []).flatMap((r) => r.sources ?? []),
];
const leaked = pathBearing.filter(isPrivate);
if (leaked.length) {
  console.error(`❌ 치명: private 경로 ${leaked.length}건이 provenance 기록에 열거됨`);
  process.exit(3);
}

// ── 2. pin 정합 ────────────────────────────────────────────────────────────
if (!/^[0-9a-f]{40}$/.test(src.source?.pinned_commit ?? '')) fail.push('pinned_commit이 40자 SHA가 아님');
if (map.pinned_commit !== src.source?.pinned_commit)
  fail.push(`pin 불일치: migration-map=${map.pinned_commit} vs source=${src.source?.pinned_commit}`);

// ── 3. inventory hash 재계산 ───────────────────────────────────────────────
const entries = src.inventory?.entries ?? [];
if (!entries.length) fail.push('inventory 비어 있음');
const sorted = [...entries].every((e, i, a) => i === 0 || a[i - 1].path <= e.path);
if (!sorted) fail.push('inventory가 path 정렬 상태가 아님 — hash 재현 불가');
const recomputed = sha256(entries.map((e) => `${e.path} ${e.blob}\n`).join(''));
if (recomputed !== src.inventory?.hash)
  fail.push(`inventory hash 불일치: 기록 ${src.inventory?.hash?.slice(0, 16)}… vs 재계산 ${recomputed.slice(0, 16)}…`);
if (entries.length !== src.inventory?.count)
  fail.push(`inventory count 불일치: 기록 ${src.inventory?.count} vs 실제 ${entries.length}`);

// ── 4. 커버리지 (구 게이트의 '미분류 0'을 pinned inventory에 대해 오프라인 재현) ──
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
const rules = map.rules ?? [];
if (!rules.length) fail.push('migration-map에 규칙 0개');
const matchers = rules.map((r) => ({ ...r, match: toMatcher(r.pattern) }));

const unmatched = entries.map((e) => e.path).filter((p) => !matchers.some((r) => r.match(p)));
if (unmatched.length) fail.push(`미분류 원본 경로 ${unmatched.length}건 (예: ${unmatched.slice(0, 3).join(', ')})`);
if ((map.unmatched_source_paths ?? []).length)
  fail.push(`migration-map이 미분류 ${map.unmatched_source_paths.length}건을 기록 중`);

// 규칙별 매칭 수 재계산(첫 매칭 우선) — 기록된 source_matches와 대조.
const counts = new Map(rules.map((r) => [r.pattern, 0]));
for (const e of entries) {
  const hit = matchers.find((r) => r.match(e.path));
  if (hit) counts.set(hit.pattern, counts.get(hit.pattern) + 1);
}
for (const r of rules) {
  const actual = counts.get(r.pattern);
  if (actual !== r.source_matches)
    fail.push(`규칙 source_matches 불일치: ${r.pattern} 기록 ${r.source_matches} vs 재계산 ${actual}`);
  if (r.expect_zero) {
    if (actual !== 0) fail.push(`expect_zero 규칙에 매칭 발생: ${r.pattern} (${actual}건) — ${r.expect_zero_reason}`);
  } else if (actual === 0) {
    fail.push(`죽은 규칙(매칭 0건, expect_zero 아님): ${r.pattern}`);
  }
}

// ── 5. 목적지 실재 + 내용 해시 (계약은 lib/target-hash.mjs 공유 — EOL 정규화) ──
let checked = 0;
let deferredSkipped = 0;
for (const r of rules) {
  for (const t of r.targets ?? []) {
    if (r.deferred) {
      deferredSkipped++;
      continue;
    }
    if (t.missing) {
      fail.push(`목적지 부재: ${r.pattern} → ${t.token}`);
      continue;
    }
    const now = hashTarget(ROOT, t.token);
    if (!now) {
      fail.push(`목적지 소실: ${r.pattern} → ${t.token} (스냅샷 작성 시엔 존재)`);
      continue;
    }
    checked++;
    if (now.kind !== t.kind) fail.push(`목적지 종류 변경: ${t.token} (${t.kind} → ${now.kind})`);
    else if (now.sha256 !== t.sha256)
      fail.push(
        `이식 자산 드리프트: ${t.token} — 해시 ${t.sha256.slice(0, 12)}… → ${now.sha256.slice(0, 12)}…` +
          (t.kind === 'tree' ? ` (파일 ${t.files} → ${now.files})` : '')
      );
  }
}

// ── 보고 ───────────────────────────────────────────────────────────────────
console.log(`pin           : ${src.source?.pinned_commit?.slice(0, 12)}… (${src.source?.pinned_commit_date}) — 원본 미접근`);
console.log(`public roots  : ${(src.public_root_allowlist ?? []).length} (private 열거 0건)`);
console.log(`inventory     : ${entries.length} files, hash 재계산 ${recomputed === src.inventory?.hash ? 'OK' : 'FAIL'}`);
console.log(`rules         : ${rules.length} (미분류 ${unmatched.length} · expect_zero ${rules.filter((r) => r.expect_zero).length})`);
console.log(`목적지        : 해시 검사 ${checked}건 (deferred 스킵 ${deferredSkipped}건)`);
for (const n of note) console.log(`  ℹ ${n}`);

// 같은 목적지 토큰을 가리키는 규칙이 여럿이면(예: server/) 동일 메시지가 중복된다 — 접는다.
const uniqueFail = [...new Set(fail)];
if (uniqueFail.length) {
  console.log(`\n❌ 계약 위반 ${uniqueFail.length}건:`);
  for (const f of uniqueFail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 이식 provenance 통과 — pinned snapshot 정합 · 목적지 무드리프트 · private 열거 0');
