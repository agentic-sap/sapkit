#!/usr/bin/env node
// check-runtime-path-rename.mjs — 런타임 경로 개명(`.sc4sap` → `.sapkit`) 3구역 게이트.
// 설계 `docs/reference/designs/2026-08-01-runtime-path-rename-sapkit.md` §7-2 · D-057.
//
// ─────────────────────────────── 박제 (§3 · §7-2) ───────────────────────────
// 기준 커밋 : 34a207a4  (집행 착수 시점)
// 계수      : `\.sc4sap|SC4SAP_HOME_DIR` = **704 matching lines / 172 files**
//             (설계 문서 자신 제외 · v4 계수와 동일)
// 재현 명령 :
//   rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' '\.sc4sap|SC4SAP_HOME_DIR' .
// 이 수는 다른 머신 작업으로 계속 움직인다. 게이트는 총량을 세지 않고 **구역별 규칙**을
// assert한다 — v2의 "occurrence ledger 688건 영구 관리"가 과잉이라는 3차 리뷰 판정.
//
// ──────────────────────────────── 스캔 범위 ─────────────────────────────────
// 정규식 = `\.sc4sap|SC4SAP_HOME_DIR`. **점 없는 제품명 토큰 `sc4sap`은 범위 밖**이다
// (파일명 `sc4sap-mcp-tools-runtime.md` · provenance `sc4sap-public-source.json` ·
// 이식 변수 `SC4SAP_SRC`/`SC4SAP_DST` — D-041이 다룬 영역).
//
// ─────────────────────────────── 3구역 + 앵커 ───────────────────────────────
//   A 활성       legacy 토큰 **전면 금지**. 예외는 아래 ALLOWLIST(파일 단위 + 등장 수 캡)뿐.
//   B 역사       경로 단위 스캔 제외 (§3-2 원천 참조 · 결정/설계 로그 · 시험 자산 · 빌드 산출물)
//   C 폴백 의무  신·구 **둘 다** 있어야 PASS. 구 토큰이 사라지면 legacy-only 프로젝트가
//                조용히 끊긴다 — 그래서 "없음"이 곧 FAIL이다.
//   앵커         개명 금지 호환성 문자열(§3-3). 정확 문자열이 **사라지면 FAIL**.
//
// ─────────────── 구역 C가 보장하지 **않는** 것 (3차 리뷰 #5) ────────────────
// 구역 C는 파일 안에 legacy **토큰이 있는지**만 센다. 상수 선언과 주석만 남기고
// 실행 분기를 지워도 통과한다 — 즉 "폴백이 살아 있다"가 아니라 "폴백을 말하는
// 문자열이 남아 있다"까지가 이 게이트의 주장이다. 소비자마다 동작 앵커를 박는
// 방식(정규식으로 분기 형태를 고정)은 리팩터링마다 깨져 유지비가 보장을 넘는다.
//
// **실행 보증의 소유자는 `interactive/scripts/conformance-runtime-dir.mjs`다.**
// 그 러너가 legacy-only 입력(tie-legacy-only · env-legacy-only ·
// compat-legacy-artifact-schema 등)을 소비자별 실물로 구동해 결과를 대조하므로,
// 분기가 사라지면 토큰이 남아 있어도 거기서 red가 난다. 두 시험은 짝이다 —
// 게이트만 CI에 걸고 러너를 빼면 이 구멍이 그대로 열린다.
// 이 주장 자체의 음성시험: `test-check-runtime-path-rename.mjs` 마지막 절
// (러너 `--consumer-root`로 legacy 분기를 지운 리졸버를 먹여 red를 실측).
//
// exit 0 통과 / 1 위반
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --root <dir>: 스캔 루트 override. 음성시험이 복제 트리를 먹이기 위한 것.
const rootIdx = process.argv.indexOf('--root');
const ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(HERE, '..', '..');

const LEGACY_RE = /\.sc4sap|SC4SAP_HOME_DIR/g;
const NEW_RE = /\.sapkit|SAPKIT_HOME_DIR/g;

// ── 구역 B — 경로 단위 스캔 제외 ────────────────────────────────────────────
// 역사·provenance·시험 자산·빌드 산출물. 여기서 legacy 토큰은 **기록**이지 결함이 아니다.
const ZONE_B = [
  // 상태·결정·설계 로그 (append-only 역사)
  'HANDOFF.md',
  'docs/reference/',
  'docs/superpowers/',
  '.harness/',
  '.claude/',
  '.github/',
  // 원천(sc4sap-custom) 참조 — §3-2 무접촉
  'interactive/MIGRATION-MANIFEST.md',
  'interactive/provenance/',
  'interactive/DESIGN.md',
  'interactive/docs/research/',
  'interactive/scripts/build-migration-snapshot.mjs',
  'interactive/scripts/report-sc4sap-public-drift.mjs',
  'engine/CHANGELOG.md',
  'engine/UPSTREAM-FIX-HANDOFF.md',
  // 번들·핀 이력 (append-only 서술) 과 빌드 산출물 — 소스가 정본이다
  'interactive/server/VERSION',
  'interactive/server/server.bundle.cjs',
  'engine/dist/',
  // 공방 증거 아카이브 (Track A phase 기록)
  'phases/',
  // 시험 자산: 구 세대 동작을 **일부러** 재현한다
  'engine/__tests__/',
  'engine/src/__tests__/',
  'engine/tests/',
  // 이 개명 작업 자신 (게이트·마이그레이터·각 시험)
  'interactive/scripts/check-runtime-path-rename.mjs',
  'interactive/scripts/test-check-runtime-path-rename.mjs',
  'interactive/scripts/migrate-runtime-dir.mjs',
  'interactive/scripts/test-migrate-runtime-dir.mjs',
  'interactive/scripts/conformance-runtime-dir.mjs',
  // 기존 게이트 음성시험(구 경로 픽스처를 그대로 쓴다)
  'interactive/scripts/test-get-vsp.mjs',
];

// ── 구역 C — 폴백 의무: 신·구 둘 다 존재해야 PASS ──────────────────────────
// 이 파일들이 구 토큰을 잃으면 마이그레이션하지 않은 사용자의 경로 해석이 끊긴다.
const ZONE_C = [
  // 경로 해석 정본
  'engine/src/lib/profile.ts',
  'interactive/server/launch.cjs',
  'interactive/adapters/claude/lib/profile-resolve.mjs',
  'interactive/adapters/claude/hooks/tier-readonly-guard.mjs',
  'interactive/adapters/claude/hooks/block-forbidden-tables.mjs',
  'interactive/tools/vpass/vpass.mjs',
  'interactive/tools/extract/extract-spro.mjs',
  'interactive/tools/extract/extract-customizations.mjs',
  'interactive/scripts/get-vsp.mjs',
  // R-ENV 홈 선택을 직접 수행하는 나머지 두 소비자 — 설계 §6-6·§6-10.
  // (브리핑의 열거를 넘어선 추가분. 근거: 위 리졸버들과 기능적으로 동일한
  //  `SC4SAP_HOME_DIR` + `~/.sc4sap` 폴백 분기를 직접 구현한다.)
  'interactive/adapters/claude/hooks/offline-code-analysis.mjs',
  'scripts/vsp-env.ps1',
  // 게이트 자신의 제외 목록 (§6-8) — 신·구 둘 다 제외해야 개명 뒤에도 안 깨진다
  'interactive/scripts/lib/target-hash.mjs',
  // ignore 4종 — 폴백 기간 동안 두 세대 모두 커밋 대상에서 빠져야 한다
  '.gitignore',
  'interactive/.gitignore',
  'engine/.gitignore',
  'vsp/.gitignore',
  // 권한 — 경로 규칙 6줄 = 신 3 · 구 3
  'interactive/adapters/claude/permissions-template.json',
  'interactive/scripts/gen-permissions.mjs',
];

// ── 구역 A 예외 — 승인된 legacy-폴백 안내 (파일 + 등장 수 캡) ──────────────
// 캡은 2026-08-02 기준 커밋 34a207a4 이후 트리의 **실측 등장 수**를 박제한 것이다.
// 늘어나면 FAIL — 새 문서가 구 이름을 퍼뜨리는 것을 막는다. 폴백 제거(설계 §11-3,
// v1.0 이전 금지) 시 이 목록 전체가 0으로 내려가야 한다.
// `requireNew`: 같은 파일이 신 이름도 반드시 함께 말해야 한다(구 이름만 남은 안내 방지).
const ALLOWLIST = [
  // 제품 문서 — 마이그레이션 안 한 사용자에게 구 경로를 안내해야 한다
  { file: 'interactive/core/procedures/setup.md', cap: 8, requireNew: true },
  { file: 'interactive/core/procedures/troubleshooting.md', cap: 9, requireNew: true },
  { file: 'interactive/core/project-context.md', cap: 5, requireNew: true },
  { file: 'adapters/vsp/SAFETY-PROFILES.md', cap: 4, requireNew: true },
  // ReloadProfile의 현재 동작 계약 행 (§3-1 — 같은 파일의 파일명·링크는 범위 밖)
  { file: 'interactive/server/tool-catalog/sc4sap-mcp-tools-runtime.md', cap: 1, requireNew: true },
  // 엔진 소스의 **모델·사용자 노출 텍스트** — 폴백 기간에는 두 이름을 다 말해야 정확하다
  { file: 'engine/src/handlers/system/readonly/handleReloadProfile.ts', cap: 3, requireNew: true },
  { file: 'engine/src/lib/gatewayRfc.ts', cap: 1, requireNew: true },
  { file: 'engine/src/lib/nativeRfc.ts', cap: 1, requireNew: true },
  { file: 'engine/src/lib/odataRfc.ts', cap: 1, requireNew: true },
  { file: 'engine/src/lib/zrfcProxy.ts', cap: 1, requireNew: true },
  { file: 'engine/src/server/launcher.ts', cap: 2, requireNew: true },
  // 위 description에서 **생성된** 도구 목록 문서 (engine/docs)
  { file: 'engine/docs/user-guide/AVAILABLE_TOOLS.md', cap: 1, requireNew: true },
  { file: 'engine/docs/user-guide/AVAILABLE_TOOLS_LEGACY.md', cap: 1, requireNew: true },
  { file: 'engine/docs/user-guide/AVAILABLE_TOOLS_READONLY.md', cap: 1, requireNew: true },
  // 공방 스크립트의 usage 문자열 — "구 경로도 받는다"는 한 줄
  { file: 'scripts/promote-track-b-run.ps1', cap: 1, requireNew: true },
];

// ── 안전 앵커 — 개명 금지 호환성 문자열(§3-3). 사라지면 FAIL ───────────────
const ANCHORS = [
  {
    file: 'scripts/vsp-env.ps1',
    label: 'Windows credential target (`<profile>/<user>.sc4sap`) — cmdkey에 저장된 실제 이름',
    strings: [
      "if ($credTarget -match '^sc4sap/(.+)$') {",
      "$credTargetCandidates += ($Matches[1] + '.sc4sap')",
    ],
  },
  { file: 'interactive/core/procedures/troubleshooting.md', label: 'keychain 서비스명', strings: ['keychain:sc4sap/'] },
  // ABAP 오브젝트명·텍스트 심볼은 SAP 안에 실재하는 이름이다 — 개명하면 예제가 깨진다.
  { file: 'interactive/core/procedures/create-program.md', label: 'ABAP 앵커', strings: ['zrsc4sap_oop_ex'] },
  { file: 'interactive/core/procedures/review-checklist.md', label: 'ABAP 앵커', strings: ['zrsc4sap_oop_ex'] },
  { file: 'interactive/core/personas/sap-executor.md', label: 'ABAP 앵커', strings: ['zrsc4sap_oop_ex'] },
  { file: 'interactive/core/knowledge/abap/conventions/clean-code-oop.md', label: 'ABAP 앵커', strings: ['zrsc4sap_oop_ex'] },
  { file: 'interactive/core/knowledge/abap/conventions/include-structure.md', label: 'ABAP 앵커', strings: ['zrsc4sap_oop_ex'] },
  { file: 'interactive/core/knowledge/abap/conventions/oop-pattern.md', label: 'ABAP 앵커', strings: ['zrsc4sap_oop_ex'] },
];

// ── 스캔 ────────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['.git', 'node_modules', '.sapkit', '.sc4sap']);
const TEXT_EXT = new Set([
  '.md', '.mjs', '.cjs', '.js', '.ts', '.json', '.ps1', '.sh', '.yml', '.yaml',
  '.txt', '.abap', '.xml', '.gitignore', '',
]);

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}
function inZoneB(r) {
  return ZONE_B.some((z) => (z.endsWith('/') ? r.startsWith(z) : r === z));
}
function countMatches(text, re) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}
function readIfText(p) {
  const ext = path.extname(p) || path.basename(p);
  if (!TEXT_EXT.has(ext) && !TEXT_EXT.has(path.extname(p))) return null;
  try {
    const buf = fs.readFileSync(p);
    if (buf.includes(0)) return null; // 바이너리
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

const scanned = [];
(function walk(dir) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const abs = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(abs);
      continue;
    }
    const r = rel(abs);
    if (inZoneB(r)) continue;
    const text = readIfText(abs);
    if (text === null) continue;
    const legacy = countMatches(text, LEGACY_RE);
    if (legacy > 0) scanned.push({ rel: r, legacy, hasNew: countMatches(text, NEW_RE) > 0 });
  }
})(ROOT);

const fail = [];
const info = [];

// ── 구역 A ──────────────────────────────────────────────────────────────────
const allowByFile = new Map(ALLOWLIST.map((a) => [a.file, a]));
const zoneCSet = new Set(ZONE_C);
for (const hit of scanned) {
  if (zoneCSet.has(hit.rel)) continue;
  const allow = allowByFile.get(hit.rel);
  if (!allow) {
    fail.push(
      `[구역 A] ${hit.rel} — legacy 토큰 ${hit.legacy}건. 활성 소스·제품 문서에는 구 이름을 남기지 않는다. ` +
        `의도된 폴백 안내라면 이 게이트의 ALLOWLIST에 캡과 함께 등재할 것.`,
    );
    continue;
  }
  if (hit.legacy > allow.cap) {
    fail.push(
      `[구역 A · 캡 초과] ${hit.rel} — legacy 토큰 ${hit.legacy}건 > 캡 ${allow.cap}건. ` +
        `구 이름이 새로 퍼졌다. 새 문장에서 구 이름을 빼거나, 정당하면 캡을 올리며 그 이유를 적을 것.`,
    );
  }
  if (allow.requireNew && !hit.hasNew) {
    fail.push(`[구역 A · 신 이름 부재] ${hit.rel} — 구 이름만 안내하고 있다. 신 이름(.sapkit)을 함께 말해야 한다.`);
  }
}
for (const a of ALLOWLIST) {
  const hit = scanned.find((s) => s.rel === a.file);
  if (!hit) info.push(`ALLOWLIST 항목이 이제 legacy 토큰 0건: ${a.file} — 캡을 0으로 내리거나 목록에서 뺄 것`);
}

// ── 구역 C — 폴백 의무 ──────────────────────────────────────────────────────
for (const f of ZONE_C) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) {
    fail.push(`[구역 C] 파일 부재: ${f} — 폴백 의무 대상이 사라졌다`);
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const legacy = countMatches(text, LEGACY_RE);
  const newer = countMatches(text, NEW_RE);
  if (newer === 0) fail.push(`[구역 C] ${f} — 신 세대 토큰(.sapkit / SAPKIT_HOME_DIR)이 없다`);
  if (legacy === 0) {
    fail.push(
      `[구역 C] ${f} — 구 세대 토큰(.sc4sap / SC4SAP_HOME_DIR)이 없다. 폴백이 제거되면 ` +
        `마이그레이션하지 않은 프로젝트가 조용히 끊긴다(설계 §11-3: v1.0 이전 제거 금지).`,
    );
  }
}

// ── 안전 앵커 ───────────────────────────────────────────────────────────────
for (const a of ANCHORS) {
  const abs = path.join(ROOT, a.file);
  if (!fs.existsSync(abs)) {
    fail.push(`[앵커] 파일 부재: ${a.file} (${a.label})`);
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  for (const s of a.strings) {
    if (!text.includes(s)) {
      fail.push(`[앵커] ${a.file} — ${a.label}: 정확 문자열이 사라졌다 → ${JSON.stringify(s)}`);
    }
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
const zoneA = scanned.filter((s) => !zoneCSet.has(s.rel));
const totalLegacy = zoneA.reduce((n, s) => n + s.legacy, 0);
console.log(`기준 커밋   : 34a207a4 (박제 계수 704 lines / 172 files — 총량은 assert하지 않는다)`);
console.log(`스캔 루트   : ${ROOT}`);
console.log(`구역 B      : 경로 ${ZONE_B.length}개 제외 (역사·provenance·시험 자산·빌드 산출물)`);
console.log(`구역 C      : 폴백 의무 ${ZONE_C.length}개 파일 — 신·구 둘 다 요구`);
console.log(`구역 A      : legacy 보유 ${zoneA.length}개 파일 · 토큰 ${totalLegacy}건 (ALLOWLIST ${ALLOWLIST.length}개, 캡 합 ${ALLOWLIST.reduce((n, a) => n + a.cap, 0)})`);
console.log(`안전 앵커   : ${ANCHORS.reduce((n, a) => n + a.strings.length, 0)}개 정확 문자열`);
for (const i of info) console.log(`  ℹ ${i}`);

if (fail.length) {
  console.log(`\n❌ 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 런타임 경로 개명 게이트 통과 — 활성 구역 무누출 · 폴백 의무 유지 · 안전 앵커 온전');
