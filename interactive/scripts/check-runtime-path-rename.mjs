#!/usr/bin/env node
// check-runtime-path-rename.mjs — 런타임 경로 개명(`.sc4sap` → `.sapkit`) 완료 게이트.
// 설계 `docs/reference/designs/2026-08-01-runtime-path-rename-sapkit.md` · D-057.
//
// ─────────────────────────── 이 게이트의 현재 주장 ──────────────────────────
// 개명은 **끝났다.** 사람 선행 게이트(이행 완료·두 스코프 COEXIST_OK·구 env 부재)가
// 통과한 뒤 renew R5에서 호환층을 걷어냈다 — `SC4SAP_HOME_DIR` 폴백 · `.sc4sap`
// 런타임 디렉터리 폴백 · 마이그레이터(`migrate-runtime-dir`)와 그 시험.
//
// 그래서 이 게이트는 더 이상 "신·구 병존 의무"를 세지 않는다(구 구역 C 폐지).
// 남은 주장은 **하나**다:
//
//   구 세대 토큰(`\.sc4sap` · `SC4SAP_HOME_DIR`)이 활성 코드·활성 제품 문서에
//   **다시 나타나지 않는다.**
//
// 이전 판의 3구역·ALLOWLIST·캡·폴백 의무는 전부 사라졌다. 폴백이 없으니 "구 이름을
// 함께 안내해야 한다"는 요구가 성립하지 않고, 캡으로 관리할 승인된 등장도 없다.
//
// ──────────────────────────────── 하나의 예외 ────────────────────────────────
//   역사(HISTORY)  결정·설계 로그, provenance, CHANGELOG, 빌드 산출물, 시험 자산.
//                  여기서 구 이름은 **기록**이거나 "무시되는지"를 시험하는 입력이다.
//
// 한때 있던 인계(PENDING) 예외 — "다른 작업이 소유한 파일이라 경고만 한다" — 는
// 그 마지막 항목(`adapters/vsp/SAFETY-PROFILES.md`)이 정리되면서 T8에서 사라졌다.
// 지금은 역사 밖의 모든 구 토큰이 곧바로 실패다.
//
// 안전 앵커(ANCHORS)는 그대로 남는다. 이것들은 런타임 경로가 아니라 **SAP 안에
// 실재하는 이름**(ABAP 오브젝트명·keychain 서비스명)이라 개명하면 예제가 깨진다.
//
// exit 0 통과 / 1 위반
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --root <dir>: 스캔 루트 override. 음성시험이 복제 트리를 먹이기 위한 것.
const rootIdx = process.argv.indexOf('--root');
const ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(HERE, '..', '..');

// 점 없는 제품명 토큰 `sc4sap`은 범위 밖이다 (파일명 `sc4sap-mcp-tools-runtime.md` ·
// provenance `sc4sap-public-source.json` — D-041이 다룬 영역).
const LEGACY_RE = /\.sc4sap|SC4SAP_HOME_DIR/g;

// ── 역사 — 경로 단위 스캔 제외 ──────────────────────────────────────────────
const HISTORY = [
  // 상태·결정·설계 로그 (append-only 역사)
  'HANDOFF.md',
  'docs/',
  '.claude/',
  // 이식 완료 기록 · 상류 참조
  'interactive/MIGRATION-MANIFEST.md',
  'interactive/provenance/',
  // ⚠ `interactive/DESIGN.md`는 append-only 로그가 아니라 **살아 있는 트랙 B 설계
  //   정본**이다. 이식·개명 대응표가 구 이름을 열거해야 해서 통째로 제외하지만,
  //   그 대가로 **새 구 이름 안내가 이 파일로 들어와도 게이트가 잡지 못한다.**
  //   의식적으로 감수한 구멍이다 — 이 파일을 고칠 때는 사람이 직접 확인할 것.
  'interactive/DESIGN.md',
  'interactive/docs/research/',
  'engine/CHANGELOG.md',
  'engine/UPSTREAM-FIX-HANDOFF.md',
  // 빌드 산출물 — 소스가 정본이다
  'interactive/server/VERSION',
  'interactive/server/server.bundle.cjs',
  'engine/dist/',
  // 시험 자산: 구 세대가 **무시되는지**를 시험하려면 그 이름을 적어야 한다
  'engine/__tests__/',
  'engine/src/__tests__/',
  'engine/tests/',
  'interactive/scripts/test-launch-toolsurface.mjs',
  'interactive/scripts/test-setup-state.mjs',
  // 이 게이트 자신과 그 음성시험 (토큰을 정의·주입한다)
  'interactive/scripts/check-runtime-path-rename.mjs',
  'interactive/scripts/test-check-runtime-path-rename.mjs',
];

// ── 안전 앵커 — 개명 금지 호환성 문자열(§3-3). 사라지면 FAIL ───────────────
// 런타임 경로가 아니라 SAP 안에 실재하는 이름이다.
const ANCHORS = [
  { file: 'interactive/core/procedures/troubleshooting.md', label: 'keychain 서비스명', strings: ['keychain:sc4sap/'] },
  { file: 'interactive/core/procedures/create-program.md', label: 'ABAP 앵커', strings: ['zsapkit_oop_ex'] },
  { file: 'interactive/core/procedures/review-checklist.md', label: 'ABAP 앵커', strings: ['zsapkit_oop_ex'] },
  { file: 'interactive/core/personas/sap-executor.md', label: 'ABAP 앵커', strings: ['zsapkit_oop_ex'] },
  { file: 'interactive/core/knowledge/abap/conventions/clean-code-oop.md', label: 'ABAP 앵커', strings: ['zsapkit_oop_ex'] },
  { file: 'interactive/core/knowledge/abap/conventions/include-structure.md', label: 'ABAP 앵커', strings: ['zsapkit_oop_ex'] },
  { file: 'interactive/core/knowledge/abap/conventions/oop-pattern.md', label: 'ABAP 앵커', strings: ['zsapkit_oop_ex'] },
];

// ── 스캔 ────────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['.git', 'node_modules', '.sapkit', '.sc4sap', '.dryforge']);
const TEXT_EXT = new Set([
  '.md', '.mjs', '.cjs', '.js', '.ts', '.json', '.ps1', '.sh', '.yml', '.yaml',
  '.txt', '.abap', '.xml', '.gitignore', '',
]);

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}
function matchesList(r, list) {
  return list.some((z) => (z.endsWith('/') ? r.startsWith(z) : r === z));
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

const hits = [];
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
    if (matchesList(r, HISTORY)) continue;
    const text = readIfText(abs);
    if (text === null) continue;
    const legacy = countMatches(text, LEGACY_RE);
    if (legacy > 0) hits.push({ rel: r, legacy });
  }
})(ROOT);

const fail = [];

// ── 잔존 금지 ───────────────────────────────────────────────────────────────
for (const hit of hits) {
  fail.push(
    `${hit.rel} — 구 세대 토큰 ${hit.legacy}건. 호환층은 R5에서 제거됐다. ` +
      `\`.sapkit\` / \`SAPKIT_HOME_DIR\`만 쓸 것 (구 경로를 일부러 시험하는 자산이면 HISTORY에 등재).`,
  );
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
console.log(`스캔 루트   : ${ROOT}`);
console.log(`역사 제외   : 경로 ${HISTORY.length}개 (결정·설계 로그 · provenance · 빌드 산출물 · 시험 자산)`);
console.log(`활성 잔존   : ${hits.length}개 파일`);
console.log(`안전 앵커   : ${ANCHORS.reduce((n, a) => n + a.strings.length, 0)}개 정확 문자열`);

if (fail.length) {
  console.log(`\n❌ 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 개명 완료 게이트 통과 — 활성 구역에 구 세대 토큰 없음 · 안전 앵커 온전');
