#!/usr/bin/env node
// migrate-runtime-dir.mjs — `.sc4sap` → `.sapkit` 런타임 상태 이행기 (D-057 §5).
//
// git 밖 상태(자격증명·프로젝트 산출물)를 **copy-not-move**로 새 세대 디렉터리에
// 복제한다. 원본은 삭제하지 않는다 — 성공한 이행도 신·구 양쪽이 valid로 남고,
// 그 상태가 `COEXIST_OK`(정상 공존)다(§5-5).
//
// 상태 머신 (§5-2) — marker(journal)를 rename **안에** 넣어 crash-safe를 성립시킨다:
//   ① preflight  목적지가 조금이라도 존재하면 거부 · symlink/junction/reparse 거부
//                쓰기 주체 정지 확인(§5-3) · manifest 밖 항목은 열거만
//   ② snapshot   소스 사전 manifest: 경로·크기·mtime·sha256 (+ 자격증명은 mode/DACL)
//   ③ staging    같은 파일시스템(= 같은 부모)의 `<parent>/.sapkit.staging-<ts>/`에 복사
//   ④ verify     소스 사후 manifest = 사전과 동일 · staging sha256 일치 ·
//                자격증명 보호 보존(POSIX=mode · win32=icacls DACL)
//   ⑤ seal       journal을 **staging 안에** `.migration-journal.json`으로 기록
//   ⑥ commit     no-replace: 목적지 이름을 mkdir로 원자 예약한 뒤 rename
//
// ⑥ 이전에 죽으면 목적지는 **존재하지 않고** `.sapkit.staging-<ts>`만 남는다. 이 이름은
// 어떤 소비자의 후보(`.sapkit`/`.sc4sap`)와도 일치하지 않으므로 활성화되지 않는다.
// ⑥이 원자적이라 "완료 marker 없는 완전한 목적지"라는 중간 상태가 존재하지 않는다.
//
// journal 계약 (엔진 리더와 정확히 호환되어야 한다):
//   `engine/src/lib/profile.ts` `hasMigrationJournalFrom()`이 목적지의
//   `.migration-journal.json`을 JSON.parse 한 뒤 `parsed.source ?? parsed.from`을
//   읽어 **이행 원본 디렉터리 절대경로**와 `samePath()` 비교한다(win32는 대소문자
//   무시). 여기서 쓰는 `source`가 그 계약이다 — 어긋나면 이행에 성공한 사용자
//   전원에게 both-valid 영구 오경고가 난다(§5-5). 같은 계약을
//   `interactive/scripts/conformance-runtime-dir.mjs`와
//   `test-migrate-runtime-dir.mjs` 케이스 ⑵가 기계로 고정한다.
//
// 실행자: **사람만.** 에이전트 대행 금지(§5-2 "실행자"). 기본은 dry-run.
//
// exit 0 통과 / 1 거부·실패 / 2 인자 오류
//
// ─────────────────────── 포함 manifest 유지 규약 (§5-4) ───────────────────────
// **이 목록은 썩는다.** 새 절차가 런타임 디렉터리에 슬롯을 추가하면 그 절차의 커밋에서
// 아래 INCLUDE_* 를 함께 갱신한다. 누적 산출물이 이사에서 빠지면 사용자에겐 지식이
// 사라진 것처럼 보인다(설계 초판이 `knowledge/`·`processes/`를 빠뜨린 실례).
// 재수집 명령 (레포 루트에서):
//   rg -oE '\.sapkit/[A-Za-z0-9._/{}*-]+' interactive/core interactive/skills \
//      interactive/agents interactive/tools | sed 's/^[^:]*://' | sort -u
// 2026-08-02 집행 시점 실측으로 설계 §5-4 목록에 다음이 추가됐다:
//   deep-interviews/ · specs/ · comparisons/ · analysis/ ·
//   blocklist-extend.txt · blocklist-custom.txt · data-access-approval-*

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';

const NEW_DIR = '.sapkit';
const LEGACY_DIR = '.sc4sap';
const JOURNAL = '.migration-journal.json';
const STAGING_PREFIX = `${NEW_DIR}.staging-`;

// ── 포함·제외 manifest (§5-4) ───────────────────────────────────────────────
const INCLUDE_FILES = new Set([
  'active-profile.txt',
  'config.json',
  'sap.env',
  'RULES.md',
  'LESSONS.md',
  'blocklist-extend.txt',
  'blocklist-custom.txt',
]);
const INCLUDE_DIRS = new Set([
  'knowledge',      // D-052
  'processes',      // D-056
  'program',
  'cbo',
  'vpass',
  'work',
  'profiles',       // 홈 스코프 — 자격증명
  'deep-interviews',
  'specs',
  'comparisons',
  'analysis',
  'customizations',
]);
const INCLUDE_PATTERNS = [
  /^spro-config.*\.json$/,
  /^customizations.*$/,
  /^data-access-approval-.*$/,
];
// 이행하지 않는 것: 휘발성 캐시(logs·state·hud-cache) · vsp 바이너리(bin — get-vsp
// 재실행이 sha 검증 경로다) · 자기 자신이 만든 staging · journal.
const EXCLUDE_NAMES = new Set(['logs', 'state', 'hud-cache', 'bin', JOURNAL]);

// 자격증명 보유 경로 — mode(POSIX) 보존을 개별 확인한다.
function isSecretBearing(rel) {
  const parts = rel.split('/');
  return parts[0] === 'profiles' || parts[parts.length - 1] === 'sap.env';
}

function classify(name, isDir) {
  if (EXCLUDE_NAMES.has(name)) return 'exclude';
  if (name.startsWith(STAGING_PREFIX) || name.startsWith(`${LEGACY_DIR}.staging-`)) return 'exclude';
  if (isDir) return INCLUDE_DIRS.has(name) || INCLUDE_PATTERNS.some((re) => re.test(name)) ? 'include' : 'unclassified';
  if (INCLUDE_FILES.has(name)) return 'include';
  return INCLUDE_PATTERNS.some((re) => re.test(name)) ? 'include' : 'unclassified';
}

// ── 인자 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const USAGE = `Usage: node interactive/scripts/migrate-runtime-dir.mjs [options]

  (기본)          dry-run — 무엇이 이사할지 보고만 하고 아무것도 바꾸지 않는다
  --apply         실제로 이행한다
  --scope S       project | home | both   (기본: project)
  --yes           "쓰기 주체를 모두 멈췄다"는 대화형 확인을 생략한다
                  (생략하면 잠금 시도 + commit 직전 재스냅샷만이 방어선이다)
  --revert        journal 이후 목적지가 무변경일 때만 목적지 사본을 되돌린다
                  (divergence면 병합 없이 거부). --apply와 함께 써야 실제로 지운다
  --status        스코프별 현재 경로·세대·journal·마지막 write 시각을 보고하고 종료
  --help

프로젝트 스코프의 소스는 현재 작업 디렉터리의 \`${LEGACY_DIR}/\`, 목적지는 \`${NEW_DIR}/\`다.
홈 스코프의 소스는 R-ENV 선택 결과(\$SC4SAP_HOME_DIR 또는 ~/${LEGACY_DIR}), 목적지는
**같은 부모의 \`${NEW_DIR}\`**다(§11-5).

이 도구는 사람이 직접 돌린다. 에이전트 대행 금지(§5-2).`;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const APPLY = argv.includes('--apply');
const YES = argv.includes('--yes');
const REVERT = argv.includes('--revert');
const STATUS = argv.includes('--status');
const scopeIdx = argv.indexOf('--scope');
const SCOPE = scopeIdx >= 0 ? argv[scopeIdx + 1] : 'project';
if (!['project', 'home', 'both'].includes(SCOPE)) {
  console.error(`[migrate] --scope는 project|home|both 중 하나여야 한다 (받은 값: ${SCOPE ?? '(없음)'})\n\n${USAGE}`);
  process.exit(2);
}
for (const a of argv) {
  if (a.startsWith('-') && !['--apply', '--yes', '--revert', '--status', '--scope', '--help', '-h'].includes(a)) {
    console.error(`[migrate] 알 수 없는 옵션: ${a}\n\n${USAGE}`);
    process.exit(2);
  }
}

// ── 유틸 ────────────────────────────────────────────────────────────────────
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function isReparse(p) {
  // lstat은 Windows에서 junction/symlink/기타 reparse point를 심볼릭 링크로 보고한다.
  const st = fs.lstatSync(p);
  return st.isSymbolicLink();
}

/**
 * no-follow 존재 검사. `existsSync`는 링크를 **따라가므로** 목적지가 끊어진
 * symlink(dangling)면 "없다"고 답한다 — 그 상태로 진행하면 rename이 링크 이름을
 * 차지하거나 링크가 가리키던 자리로 자격증명이 새어 나갈 수 있다. lstat은 링크
 * 자신을 보므로 "이름이 이미 쓰이고 있다"를 정확히 답한다(3차 리뷰 #3).
 */
function lexists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** 소스 하위를 훑어 { files, excluded, unclassified, links } 를 만든다. */
function scanSource(root) {
  const files = [];
  const excluded = [];
  const unclassified = [];
  const links = [];

  for (const ent of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(root, ent.name);
    if (isReparse(abs)) {
      links.push(ent.name);
      continue;
    }
    const kind = classify(ent.name, ent.isDirectory());
    if (kind === 'exclude') {
      excluded.push(ent.name + (ent.isDirectory() ? '/' : ''));
      continue;
    }
    if (kind === 'unclassified') {
      unclassified.push(ent.name + (ent.isDirectory() ? '/' : ''));
      continue;
    }
    if (ent.isDirectory()) walkInto(abs, ent.name, files, links);
    else files.push(statFile(abs, ent.name));
  }
  return { files, excluded, unclassified, links };
}

function walkInto(dir, rel, files, links) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, ent.name);
    const childRel = `${rel}/${ent.name}`;
    if (isReparse(abs)) {
      links.push(childRel);
      continue;
    }
    // 포함 디렉터리 **안쪽**은 통째로 이사한다 — 안에서 다시 분류하면 사용자 산출물이
    // "미분류"로 빠지는 사고가 난다. 단 journal·staging 잔재는 언제나 뺀다.
    if (ent.name === JOURNAL || ent.name.startsWith(STAGING_PREFIX)) continue;
    if (ent.isDirectory()) walkInto(abs, childRel, files, links);
    else files.push(statFile(abs, childRel));
  }
}

// ── Windows DACL 캡처 (§5 "sap.env·profiles/ DACL 상속 결과 검증") ─────────
// POSIX에서는 mode 비트가 보호의 전부지만 win32에는 그 개념이 없다 —
// `fs.stat().mode`가 항상 0o666/0o444라 mode 대조가 무의미하고, 그래서 지금까지
// 자격증명 보호 검증이 win32에서 **한 번도 실행되지 않았다**(3차 리뷰 #4).
// 대신 `icacls` 출력을 소스↔스테이징으로 대조한다. staging을 목적지와 같은 부모
// 밑에 만드는 이유가 바로 이 상속 결과를 같게 만들기 위해서다(③ 주석).
// 불일치 = 소스에는 명시 ACE가 있었는데 사본은 부모 기본값만 물려받았다는 뜻이므로,
// 자격증명을 덜 보호된 파일로 복제하지 않고 멈춘다(fail-close).
//
// 로케일 비의존: ACE 줄만 남긴다(`IDENTITY:(I)(F)` — `:(` 를 포함). 경로가 박힌
// 첫 줄의 경로 부분과 "Successfully processed …"류 요약 줄은 제거된다.
function winAcl(abs) {
  let out;
  try {
    out = execFileSync('icacls', [abs], { encoding: 'utf8', windowsHide: true });
  } catch {
    return null; // 읽지 못하면 "확인 불가" — 아래 검증에서 거부 사유가 된다
  }
  const aces = [];
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line || !line.includes(':(')) continue;
    aces.push(line.startsWith(abs) ? line.slice(abs.length).trim() : line);
  }
  return aces.length ? aces.join('\n') : null;
}

const WIN = process.platform === 'win32';

function statFile(abs, rel) {
  const st = fs.statSync(abs);
  return {
    path: rel,
    size: st.size,
    mtimeMs: Math.round(st.mtimeMs),
    sha256: sha256File(abs),
    mode: WIN ? null : st.mode & 0o777,
    // win32에서만·자격증명 파일에서만 캡처한다(프로세스 spawn 비용).
    acl: WIN && isSecretBearing(rel) ? winAcl(abs) : undefined,
  };
}

function sameManifest(a, b) {
  if (a.length !== b.length) return `항목 수 ${a.length} → ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    for (const k of ['path', 'size', 'mtimeMs', 'sha256']) {
      if (a[i][k] !== b[i][k]) return `${a[i].path}: ${k} ${a[i][k]} → ${b[i][k]}`;
    }
  }
  return null;
}

function copyInto(srcRoot, dstRoot, files) {
  for (const f of files) {
    const from = path.join(srcRoot, ...f.path.split('/'));
    const to = path.join(dstRoot, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    if (f.mode !== null) fs.chmodSync(to, f.mode);
  }
}

function lastWrite(root) {
  let newest = 0;
  const stack = [root];
  let budget = 20000;
  while (stack.length && budget-- > 0) {
    const d = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      try {
        const st = fs.lstatSync(p);
        if (st.mtimeMs > newest) newest = st.mtimeMs;
        if (e.isDirectory() && !st.isSymbolicLink()) stack.push(p);
      } catch {
        /* 접근 불가 항목은 건너뛴다 */
      }
    }
  }
  return newest ? new Date(newest).toISOString() : '(없음)';
}

function readJournal(dir) {
  const p = path.join(dir, JOURNAL);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { __unreadable: true };
  }
}

// ── 스코프 해석 ─────────────────────────────────────────────────────────────
/**
 * 홈 스코프의 소스는 **R-ENV 선택 결과**다(§11-5). `SAPKIT_HOME_DIR`이 설정돼 있으면
 * 운영자가 이미 홈을 고정한 것이므로 이 도구는 추측하지 않고 거부한다 — 자격증명
 * 디렉터리를 env가 가리키지 않는 위치로 복제하면 "이사했는데 안 보인다"가 된다.
 */
function resolveScope(scope) {
  if (scope === 'project') {
    const parent = process.cwd();
    return { scope, parent, source: path.join(parent, LEGACY_DIR), destination: path.join(parent, NEW_DIR) };
  }
  const pinned = process.env.SAPKIT_HOME_DIR;
  if (pinned) {
    return {
      scope,
      refuse:
        `SAPKIT_HOME_DIR이 ${pinned} 로 고정돼 있다. R-ENV상 홈은 이 값이 결정하므로 ` +
        `이 도구는 다른 위치로 자격증명을 복제하지 않는다. 홈을 옮기려면 env를 먼저 정리하고 다시 실행할 것.`,
    };
  }
  const legacyEnv = process.env.SC4SAP_HOME_DIR;
  const source = legacyEnv ? path.resolve(legacyEnv) : path.join(os.homedir(), LEGACY_DIR);
  return { scope, parent: path.dirname(source), source, destination: path.join(path.dirname(source), NEW_DIR) };
}

const SCOPES = SCOPE === 'both' ? ['project', 'home'] : [SCOPE];

// ── --status (§11-② 진단) ───────────────────────────────────────────────────
if (STATUS) {
  for (const s of SCOPES) {
    const t = resolveScope(s);
    console.log(`\n[${s}] ${t.refuse ? '(건너뜀)' : t.parent}`);
    if (t.refuse) {
      console.log(`  ${t.refuse}`);
      continue;
    }
    for (const [label, dir] of [[NEW_DIR, t.destination], [LEGACY_DIR, t.source]]) {
      if (!fs.existsSync(dir)) {
        console.log(`  ${label.padEnd(9)}: 없음`);
        continue;
      }
      const j = readJournal(dir);
      const jLabel = j?.__unreadable
        ? ' · journal 읽기 실패'
        : j
          ? ` · journal source=${j.source ?? j.from ?? '(없음)'}`
          : '';
      console.log(`  ${label.padEnd(9)}: 존재 · 마지막 write ${lastWrite(dir)}${jLabel}`);
    }
    const j = readJournal(t.destination);
    const src = j && !j.__unreadable ? (j.source ?? j.from) : null;
    const coexist =
      fs.existsSync(t.destination) &&
      fs.existsSync(t.source) &&
      typeof src === 'string' &&
      path.resolve(src).toLowerCase() === path.resolve(t.source).toLowerCase();
    console.log(`  판정      : ${coexist ? 'COEXIST_OK (정상 공존 — 경고 대상 아님)' : fs.existsSync(t.destination) && fs.existsSync(t.source) ? '양쪽 존재 + journal 없음 → 이행 미완결 경고 대상' : '단일 세대'}`);
  }
  console.log(
    '\n소비자마다 탐색 깊이·채택 기준이 다르다(engine/launch=0 · tier-guard=8 · profile-resolve=64).' +
      '\n"모든 소비자가 같은 디렉터리를 고른다"는 보장은 없다 — 설계 §11-2.',
  );
  process.exit(0);
}

// ── 쓰기 주체 정지 확인 (§5-3) ──────────────────────────────────────────────
async function confirmWritersStopped(targets) {
  // 1. 사람 확인 (--yes로 생략 가능)
  if (!YES) {
    if (!process.stdin.isTTY) {
      console.error(
        '[migrate] 대화형 확인이 불가능한 환경이다(stdin이 TTY가 아님). MCP 서버를 쓰는 하네스 세션을\n' +
          '          모두 종료했음을 확인한 뒤 --yes를 붙여 다시 실행할 것.',
      );
      return false;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((r) =>
      rl.question(
        'MCP 서버를 쓰는 하네스 세션(Claude Code / Codex / Antigravity)을 모두 종료했는가? [y/N] ',
        (a) => {
          rl.close();
          r(a.trim().toLowerCase());
        },
      ),
    );
    if (answer !== 'y' && answer !== 'yes') {
      console.error('[migrate] 중단 — 쓰기 주체 종료가 확인되지 않았다.');
      return false;
    }
  }

  // 2. 잠금 시도 — 다른 프로세스가 공유 없이 연 파일이면 EBUSY로 걸린다(Windows에서
  //    실효, POSIX는 best-effort). 최종 방어선은 ④의 사후 재스냅샷이다.
  for (const t of targets) {
    for (const name of ['active-profile.txt', 'sap.env']) {
      const p = path.join(t.source, name);
      if (!fs.existsSync(p)) continue;
      let fd;
      try {
        fd = fs.openSync(p, 'r+');
      } catch (err) {
        console.error(`[migrate] 거부 — ${p} 를 배타적으로 열 수 없다 (${err.code}). 사용 중으로 판정한다.`);
        return false;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
  }
  return true;
}

// ── --revert ────────────────────────────────────────────────────────────────
function revertOne(t) {
  const dest = t.destination;
  if (!fs.existsSync(dest)) {
    console.log(`  목적지 ${dest} 가 없다 — 되돌릴 것이 없다.`);
    return true;
  }
  const journal = readJournal(dest);
  if (!journal || journal.__unreadable) {
    console.error(
      `  거부 — ${dest} 에 읽을 수 있는 ${JOURNAL} 이 없다. 이 도구가 만든 사본인지 확인할 수 없으므로\n` +
        '         자동으로 지우지 않는다. 내용을 직접 확인한 뒤 수동으로 처리할 것.',
    );
    return false;
  }
  const journalSource = journal.source ?? journal.from;
  if (typeof journalSource !== 'string') {
    console.error(`  거부 — journal에 source 필드가 없다: ${path.join(dest, JOURNAL)}`);
    return false;
  }

  const now = scanSource(dest);
  if (now.links.length) {
    console.error(`  거부 — 목적지에 symlink/junction이 있다: ${now.links.join(', ')}`);
    return false;
  }
  const before = new Map((journal.items ?? []).map((i) => [i.path, i]));
  const after = new Map(now.files.map((f) => [f.path, f]));
  const added = [...after.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k).sha256 !== after.get(k).sha256);

  if (added.length || removed.length || changed.length) {
    console.error(`  거부 — journal 이후 목적지가 변경됐다 (병합하지 않는다):`);
    for (const p of added.slice(0, 20)) console.error(`    + ${p}`);
    for (const p of removed.slice(0, 20)) console.error(`    - ${p}`);
    for (const p of changed.slice(0, 20)) console.error(`    ~ ${p}`);
    const more = added.length + removed.length + changed.length - Math.min(20, added.length) - Math.min(20, removed.length) - Math.min(20, changed.length);
    if (more > 0) console.error(`    … 외 ${more}건`);
    console.error(
      `  수동 처리: ${dest} 의 새 산출물을 ${journalSource} 로 직접 옮긴 뒤 목적지를 지울 것.\n` +
        '            이 도구는 어느 쪽이 정본인지 판단하지 않는다.',
    );
    return false;
  }

  // apply 시점의 목적지는 **스테이징 그대로**다 — 스테이징에는 manifest 항목과
  // journal만 들어간다(⑤·⑥). 따라서 지금 목적지에 있는 제외·미분류 항목은 전부
  // **이행 후에 생긴 산출물**이다. journal의 items에 없으니 위의 sha 대조에는
  // 걸리지 않지만, 그대로 rmSync 하면 사용자가 만든 적 없는 삭제가 된다.
  // 그래서 "함께 사라진다"고 통보하지 않고 divergence로 **거부**한다(3차 리뷰 #1).
  const strays = now.excluded.filter((n) => n !== JOURNAL).concat(now.unclassified);
  if (strays.length) {
    console.error(`  거부 — 이행 뒤 목적지에 비이행 항목이 생겼다 (지우지 않는다):`);
    for (const s of strays.slice(0, 20)) console.error(`    ? ${s}`);
    if (strays.length > 20) console.error(`    … 외 ${strays.length - 20}건`);
    console.error(
      `  이 항목들은 이행 시점의 목적지에 없던 사후 산출물이다(로그·캐시·미분류 파일).\n` +
        `  수동 처리: 필요한 것을 ${journalSource} 로 직접 옮기거나 목적지에서 지운 뒤 다시 실행할 것.\n` +
        '            이 도구는 어느 쪽이 정본인지 판단하지 않는다.',
    );
    return false;
  }
  console.log(`  journal 대조: 무변경 (${now.files.length}건 일치)`);
  if (!APPLY) {
    console.log(`  [dry-run] --apply 를 붙이면 ${dest} 를 지운다. 소스 ${journalSource} 는 그대로다.`);
    return true;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  console.log(`  ✅ ${dest} 제거 — 선택은 ${journalSource} 로 돌아간다.`);
  return true;
}

// ── 이행 본체 ───────────────────────────────────────────────────────────────
function preflight(t) {
  const problems = [];
  if (!fs.existsSync(t.source)) {
    return { skip: `소스 ${t.source} 가 없다 — 이행할 것이 없다.` };
  }
  if (isReparse(t.source)) problems.push(`소스 ${t.source} 자체가 symlink/junction이다`);
  // no-follow: 끊어진 symlink도 "이미 존재한다"로 센다.
  if (lexists(t.destination)) {
    const kind = fs.existsSync(t.destination) ? '이미 존재한다' : '끊어진 symlink/junction로 존재한다';
    problems.push(
      `목적지 ${t.destination} 가 ${kind} — 병합·덮어쓰기를 하지 않는다. ` +
        `기존 내용을 확인하고 옮기거나 지운 뒤 다시 실행할 것.`,
    );
  }
  if (problems.length) return { problems };

  const scan = scanSource(t.source);
  if (scan.links.length) {
    return { problems: [`소스에 symlink/junction/reparse point가 있다: ${scan.links.join(', ')}`] };
  }
  return { scan };
}

function migrateOne(t, scan) {
  const staging = path.join(t.parent, `${STAGING_PREFIX}${Date.now()}`);
  let reserved = false;
  try {
    // ③ staging — 목적지와 같은 부모라 같은 파일시스템이고, Windows의 DACL 상속 부모도
    //    동일하다(= rename 후 상속 결과가 목적지에서 직접 만든 것과 같다).
    fs.mkdirSync(staging, { recursive: false });
    copyInto(t.source, staging, scan.files);

    // ④ verify — 소스 사후 manifest(= commit 직전 재스냅샷, §5-3의 최종 방어선)
    const after = scanSource(t.source);
    const drift = sameManifest(scan.files, after.files);
    if (drift) throw new Error(`이행 중 소스가 변경됐다 (${drift}) — 쓰기 주체가 살아 있다. 중단한다.`);

    for (const f of scan.files) {
      const to = path.join(staging, ...f.path.split('/'));
      if (sha256File(to) !== f.sha256) throw new Error(`staging 사본 해시 불일치: ${f.path}`);
      if (!isSecretBearing(f.path)) continue;
      if (f.mode !== null) {
        const got = fs.statSync(to).mode & 0o777;
        if (got !== f.mode) throw new Error(`자격증명 mode 미보존: ${f.path} ${f.mode.toString(8)} → ${got.toString(8)}`);
      }
      if (WIN) {
        if (f.acl === null) {
          throw new Error(
            `자격증명 DACL을 읽지 못했다 (icacls 실패): ${f.path} — 보호 상태를 확인할 수 없으므로 이행하지 않는다.`,
          );
        }
        const gotAcl = winAcl(to);
        if (gotAcl === null) {
          throw new Error(`staging 사본의 DACL을 읽지 못했다 (icacls 실패): ${f.path}`);
        }
        if (gotAcl !== f.acl) {
          throw new Error(
            `자격증명 DACL 미보존: ${f.path}\n` +
              `    소스     : ${f.acl.split('\n').join(' | ')}\n` +
              `    스테이징 : ${gotAcl.split('\n').join(' | ')}\n` +
              '    소스에 명시 ACE가 걸려 있으면 사본은 부모 상속만 받아 더 느슨해진다. ' +
              '목적지 부모의 상속을 소스와 맞추거나 사람이 직접 옮길 것.',
          );
        }
      }
    }

    // ⑤ seal — journal을 staging **안에** 쓴다. rename 이전이라야 "완료 marker 없는
    //    완전한 목적지"가 생기지 않는다.
    const journal = {
      tool: 'interactive/scripts/migrate-runtime-dir.mjs',
      journal_version: 1,
      decision: 'D-057',
      design: 'docs/reference/designs/2026-08-01-runtime-path-rename-sapkit.md',
      scope: t.scope,
      // ↓ 엔진 리더(`profile.ts hasMigrationJournalFrom`)가 읽는 필드. 이행 원본
      //   디렉터리의 절대경로여야 한다.
      source: t.source,
      destination: t.destination,
      migrated_at: new Date().toISOString(),
      mode: 'copy-not-move',
      items: scan.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
      excluded: scan.excluded,
      unclassified: scan.unclassified,
      note:
        'copy-not-move: the source directory is intact. Both generations staying valid is the ' +
        'normal post-migration state (COEXIST_OK, D-057 §5-5), not an unfinished migration.',
    };
    fs.writeFileSync(path.join(staging, JOURNAL), JSON.stringify(journal, null, 2) + '\n');

    // ⑥ commit — **no-replace**. `existsSync` 후 rename은 그 사이가 열려 있고
    //    (TOCTOU) rename 자체도 이름을 덮어쓸 수 있다. 대신 `mkdirSync`(recursive
    //    없음)로 목적지 이름을 **원자적으로 예약**한다 — 이미 무엇이든(디렉터리·파일·
    //    끊어진 symlink) 있으면 EEXIST로 즉시 실패한다.
    fs.mkdirSync(t.destination);
    reserved = true;
    if (process.platform === 'win32') {
      // win32의 rename은 빈 디렉터리라도 덮어쓰지 못한다(EPERM). 예약을 지우고
      // 곧바로 rename한다. rmdir↔rename 사이에 **잔여 창**이 남는다 — 그 찰나에
      // 제3자가 같은 이름을 만들면 rename이 EPERM/EEXIST로 실패하고 아래 catch가
      // staging을 정리한다(목적지·소스 모두 무변경). 창을 완전히 없애려면 win32
      // 전용 API가 필요한데, 이 도구의 실행자는 "쓰기 주체를 모두 멈춘 사람"이라
      // (§5-2·§5-3) 그 비용을 지불하지 않는다.
      fs.rmdirSync(t.destination);
    }
    // POSIX의 rename은 목적지가 **빈 디렉터리**일 때만 교체한다 — 위에서 방금 만든
    // 그 빈 디렉터리다. 내용이 있으면 ENOTEMPTY로 실패한다(덮어쓰기 없음).
    fs.renameSync(staging, t.destination);
    reserved = false;
    return { ok: true, journal };
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    // 예약만 해두고 실패했다면 그 빈 디렉터리를 남기지 않는다 — 남으면 다음 실행이
    // "목적지가 이미 존재한다"로 거부된다. rmdir은 비어 있을 때만 성공하므로
    // 남의 내용을 지울 위험이 없다.
    if (reserved) {
      try {
        fs.rmdirSync(t.destination);
      } catch {
        /* 이미 없거나 비어 있지 않으면 사람이 확인해야 한다 */
      }
    }
    return { ok: false, error: err.message };
  }
}

function guidance(t) {
  console.log('\n  이 도구가 하지 않는 것 (사람이 해야 한다):');
  console.log(`    · vsp 바이너리 — bin/ 는 복사하지 않는다. 새 홈에 다시 설치:`);
  console.log('        node interactive/scripts/get-vsp.mjs');
  if (t.scope === 'home') {
    console.log('    · 환경변수 — SC4SAP_HOME_DIR 을 쓰고 있었다면 SAPKIT_HOME_DIR 로 다시 등록할 것');
    console.log('      (같은 의미·같은 값. 이 도구는 사용자 환경변수를 건드리지 않는다).');
  }
  console.log('    · 훅·권한 재배선:');
  console.log('        node interactive/adapters/claude/hooks/install-hooks.mjs');
  console.log('        (권한 템플릿은 폴백 기간 동안 신·구 6줄을 모두 담고 있어 재병합은 선택)');
  console.log(`    · 원본 ${t.source} 는 그대로 남는다. 확인이 끝난 뒤 사람이 직접 지운다.`);
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const targets = SCOPES.map(resolveScope);
let failed = 0;

if (REVERT) {
  console.log(`역이행(--revert)${APPLY ? '' : ' [dry-run]'}`);
  for (const t of targets) {
    console.log(`\n[${t.scope}]`);
    if (t.refuse) {
      console.error(`  거부 — ${t.refuse}`);
      failed++;
      continue;
    }
    if (!revertOne(t)) failed++;
  }
  console.log(failed ? `\n❌ ${failed}건 거부·실패` : '\n✅ 역이행 확인 완료');
  process.exit(failed ? 1 : 0);
}

const plans = [];
for (const t of targets) {
  console.log(`\n[${t.scope}]`);
  if (t.refuse) {
    console.error(`  거부 — ${t.refuse}`);
    failed++;
    continue;
  }
  console.log(`  소스   : ${t.source}`);
  console.log(`  목적지 : ${t.destination}`);
  const pre = preflight(t);
  if (pre.skip) {
    console.log(`  ${pre.skip}`);
    continue;
  }
  if (pre.problems) {
    for (const p of pre.problems) console.error(`  거부 — ${p}`);
    failed++;
    continue;
  }
  const { scan } = pre;
  const bytes = scan.files.reduce((n, f) => n + f.size, 0);
  console.log(`  이행 대상: ${scan.files.length}개 파일 · ${bytes.toLocaleString()} bytes`);
  const tops = [...new Set(scan.files.map((f) => f.path.split('/')[0]))];
  for (const top of tops) console.log(`    + ${top}`);
  if (scan.excluded.length) console.log(`  제외(설계 §5-4): ${scan.excluded.join(', ')}`);
  if (scan.unclassified.length) {
    console.log(`  ⚠ 미분류 — 이행하지 않고 열거만 한다 (추측 이행 금지, §5-4):`);
    for (const u of scan.unclassified) console.log(`      ? ${u}`);
    console.log('    필요하면 사람이 직접 옮기거나, 새 슬롯이면 이 스크립트의 INCLUDE_* 를 갱신할 것.');
  }
  plans.push({ t, scan });
}

if (!APPLY) {
  console.log('\n[dry-run] 아무것도 바꾸지 않았다. 실제로 이행하려면 --apply 를 붙일 것.');
  for (const { t } of plans) guidance(t);
  process.exit(failed ? 1 : 0);
}

if (plans.length === 0) {
  if (!failed) console.log('\n이행할 대상이 없다.');
  process.exit(failed ? 1 : 0);
}

const ok = await confirmWritersStopped(plans.map((p) => p.t));
if (!ok) process.exit(1);

for (const { t, scan } of plans) {
  const res = migrateOne(t, scan);
  if (!res.ok) {
    console.error(`\n[${t.scope}] ❌ 이행 실패 — ${res.error}`);
    console.error('  staging은 정리했다. 소스·목적지 모두 변경되지 않았다.');
    failed++;
    continue;
  }
  console.log(`\n[${t.scope}] ✅ ${t.source} → ${t.destination} (${res.journal.items.length}개 파일)`);
  console.log(`  journal: ${path.join(t.destination, JOURNAL)} (source=${res.journal.source})`);
  console.log('  두 세대가 함께 남는 것이 정상이다 — COEXIST_OK로 판정되어 경고하지 않는다.');
  guidance(t);
}

process.exit(failed ? 1 : 0);
