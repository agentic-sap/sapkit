#!/usr/bin/env node
// conformance-runtime-dir.mjs — 런타임 경로 개명 적합성 러너 (D-057 §7-3).
//
// `engine/__tests__/fixtures/runtime-dir-selection.json`(공통 입력 + **소비자별** 기대)을
// 읽어 **실물 코드를 구동**해 대조한다. 엔진 Jest와 같은 파일을 읽되 구현 모듈은 공유
// 하지 않는다(3차 리뷰 수용).
//
// ─────────────────────────── 이 시험이 묻는 것 ──────────────────────────────
// "모두 같은 답을 내는가"가 **아니다.** R-PRESERVE상 소비자마다 깊이(0/8/64)·채택
// 기준·state 정의가 다르고 그 차이가 각자의 안전 의미를 담고 있다. 묻는 것은
// **"각 소비자가 개명 전과 동일하게 동작하는가"**다. 그래서 기대값이 소비자별로
// 갈리는 것이 정상이며, 여기에 "일치 검사"를 넣으면 안 된다.
//
// ─────────────────────────────── 구동 방식 (seam) ───────────────────────────
//   profile-resolve  export 함수 직접 호출 (자식 프로세스 안에서 import — 홈 스텁은
//                    HOME/USERPROFILE env로만 가능하다. `os.homedir` 몽키패치는 ESM
//                    named import에 전파되지 않는 것을 실측 확인했다.)
//   tier-guard       임시 cwd/env + JSON stdin 자식 프로세스
//   blocklist        임시 cwd/env + JSON stdin 자식 프로세스 (실제 차단 판정으로 관측)
//   launch.cjs       실 shim + 스텁 번들로 실기동 (MCP_ENV_PATH·exposition 관측)
//                    + 진짜 번들 부팅 스모크 1회(무접속 안전 확인)
//   vpass · extract  `--resolve-only` (무접속 · exit 0 · JSON stdout)
//   engine           **이 러너의 범위 밖** — fixture `_schema.readers`대로 Jest가 소유한다
//
// 모든 자식은 가짜 HOME/USERPROFILE을 받는다. 실사용자 상태(`~/.sc4sap` 실물)는
// 읽지도 쓰지도 않는다.
//
// ─────────────────── 이 러너가 게이트에 대해 지는 책임 (§7-2 ↔ §7-3) ────────
// `check-runtime-path-rename.mjs` 구역 C는 파일에 신·구 **토큰이 있는지**만 본다 —
// 상수·주석만 남기고 legacy 실행 분기를 지워도 그 게이트는 통과한다(3차 리뷰 #5).
// 그 구멍을 메우는 것은 게이트가 아니라 **이 러너**다: legacy-only 입력을 소비자별
// 실물로 구동해 결과를 대조하므로, 분기가 사라지면 여기서 red가 난다. 그래서 이
// 러너는 CI 필수다 — 게이트만 돌리는 것은 반쪽이다.
//   `--consumer-root <dir>`: 소비자 실물 경로를 <dir>/<같은 상대경로>로 바꿔치기한다
//   (없는 파일은 실물로 폴백). 위 주장 자체의 음성시험이
//   `test-check-runtime-path-rename.mjs`에서 이 플래그를 쓴다.
//
// 사용: node interactive/scripts/conformance-runtime-dir.mjs
//         [--case <id>] [--verbose] [--observe] [--consumer-root <dir>]
// exit 0 통과 / 1 불일치 · 안전 케이스 실패

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const REPO = path.resolve(INTERACTIVE, '..');
const FIXTURE = path.join(REPO, 'engine', '__tests__', 'fixtures', 'runtime-dir-selection.json');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
// --observe: 대조 대신 **관측값**을 placeholder 형태로 덤프한다. fixture의
// `expected: null`(기대 미확정)을 실물 관측으로 채울 때 쓰는 유지 도구다.
// 관측값을 그대로 기대값으로 복사하는 것은 "코드가 하는 일을 기대로 승격"하는
// 행위이므로, 반드시 note에 왜 그 값이 맞는지 근거를 함께 적을 것.
const OBSERVE = argv.includes('--observe');
const onlyIdx = argv.indexOf('--case');
const ONLY = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
// --consumer-root <dir>: 소비자 실물을 복제·변조한 트리로 갈아끼운다. 없는 파일은
// 실물로 폴백하므로 한 파일만 넣어도 된다(번들 수 MB를 복사하지 않는다).
const consumerRootIdx = argv.indexOf('--consumer-root');
const CONSUMER_ROOT = consumerRootIdx >= 0 ? path.resolve(argv[consumerRootIdx + 1]) : null;

if (!fs.existsSync(FIXTURE)) {
  console.error(`❌ fixture 부재: ${FIXTURE}`);
  process.exit(1);
}
const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// ── 대상 실물 경로 ──────────────────────────────────────────────────────────
// --consumer-root가 있으면 같은 상대경로의 파일을 우선 쓴다(없으면 실물).
function consumerPath(...rel) {
  if (CONSUMER_ROOT) {
    const over = path.join(CONSUMER_ROOT, ...rel);
    if (fs.existsSync(over)) return over;
  }
  return path.join(INTERACTIVE, ...rel);
}
const PATHS = {
  profileResolve: consumerPath('adapters', 'claude', 'lib', 'profile-resolve.mjs'),
  tierGuard: consumerPath('adapters', 'claude', 'hooks', 'tier-readonly-guard.mjs'),
  blocklist: consumerPath('adapters', 'claude', 'hooks', 'block-forbidden-tables.mjs'),
  launch: consumerPath('server', 'launch.cjs'),
  bundle: consumerPath('server', 'server.bundle.cjs'),
  vpass: consumerPath('tools', 'vpass', 'vpass.mjs'),
  extractSpro: consumerPath('tools', 'extract', 'extract-spro.mjs'),
  extractCust: consumerPath('tools', 'extract', 'extract-customizations.mjs'),
};
if (CONSUMER_ROOT) {
  const swapped = Object.entries(PATHS)
    .filter(([, p]) => p.startsWith(CONSUMER_ROOT))
    .map(([k]) => k);
  console.log(`⚠ --consumer-root ${CONSUMER_ROOT} — 바꿔치기된 소비자: ${swapped.join(', ') || '(없음)'}`);
}
for (const [k, p] of Object.entries(PATHS)) {
  if (!fs.existsSync(p)) {
    console.error(`❌ 소비자 실물 부재: ${k} → ${p}`);
    process.exit(1);
  }
}

// USR02 = 내장 blocklist의 minimal tier deny 테이블. minimal/standard/strict 어느
// 프로필에서도 걸리므로 "어떤 프로필이 적용됐는지" 라벨을 관측하는 프로브로 쓴다.
const PROFILE_PROBE_TABLE = 'USR02';

// ── 유틸 ────────────────────────────────────────────────────────────────────
const WIN = process.platform === 'win32';
function norm(p) {
  if (p === null || p === undefined) return null;
  const r = path.resolve(String(p));
  return WIN ? r.toLowerCase() : r;
}
function run(file, args, { cwd, env, input, timeout = 30000 }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { cwd, env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err) });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

// ── 케이스 트리 구성 ────────────────────────────────────────────────────────
function expandPath(s, ctx) {
  return String(s)
    .replaceAll('$PROJECT', ctx.project)
    .replaceAll('$HOME', ctx.home)
    .replaceAll('$CWD', ctx.cwd);
}
// 파일 **내용**에 박히는 경로는 슬래시 형태로 넣는다. JSON 내부의 Windows
// 역슬래시는 잘못된 escape가 되어 journal 파싱이 조용히 실패하기 때문이다
// (`path.resolve`가 슬래시를 정규화하므로 엔진의 samePath 비교는 그대로 성립한다).
function expandContent(s, ctx) {
  const fwd = (p) => p.split(path.sep).join('/');
  return String(s)
    .replaceAll('$PROJECT', fwd(ctx.project))
    .replaceAll('$HOME', fwd(ctx.home))
    .replaceAll('$CWD', fwd(ctx.cwd));
}

function materialize(kase, root) {
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const cwdRel = kase.input?.cwd ?? '.';
  const cwd = path.resolve(project, cwdRel);
  const ctx = { project, home, cwd };

  for (const d of kase.input?.dirs ?? []) fs.mkdirSync(expandPath(d, ctx), { recursive: true });
  for (const [p, content] of Object.entries(kase.input?.files ?? {})) {
    const abs = expandPath(p, ctx);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, expandContent(content, ctx));
  }
  fs.mkdirSync(cwd, { recursive: true });

  const env = { ...process.env };
  delete env.SAPKIT_HOME_DIR;
  delete env.SC4SAP_HOME_DIR;
  delete env.MCP_ENV_PATH;
  env.HOME = home;
  env.USERPROFILE = home;
  for (const [k, v] of Object.entries(kase.input?.env ?? {})) {
    if (v === null) delete env[k];
    else env[k] = expandPath(v, ctx);
  }
  return { ctx, env, cwd };
}

// ── 소비자 드라이버 ─────────────────────────────────────────────────────────
let DRIVER_FILE = null;
function profileResolveDriver(tmpRoot) {
  if (DRIVER_FILE) return DRIVER_FILE;
  DRIVER_FILE = path.join(tmpRoot, 'profile-resolve-driver.mjs');
  fs.writeFileSync(
    DRIVER_FILE,
    `import { resolveRuntimeDir, resolveWorkspaceRoot, resolveSapEnvPath, resolveConfigJsonPath } from ${JSON.stringify(
      pathToFileURL(PATHS.profileResolve).href,
    )};
const cwd = process.cwd();
const e = resolveSapEnvPath(cwd);
const c = resolveConfigJsonPath(cwd);
process.stdout.write(JSON.stringify({
  runtimeDir: resolveRuntimeDir(cwd),
  workspaceRoot: resolveWorkspaceRoot(cwd),
  sapEnvPath: e ? { path: e.path, source: e.source } : null,
  configJsonPath: c ? { path: c.path, source: c.source } : null,
}));
`,
  );
  return DRIVER_FILE;
}

let LAUNCH_PROBE = null;
function launchProbe(tmpRoot) {
  if (LAUNCH_PROBE) return LAUNCH_PROBE;
  const dir = path.join(tmpRoot, 'launch-probe');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(PATHS.launch, path.join(dir, 'launch.cjs'));
  // 실 shim을 그대로 돌리되 번들만 스텁으로 바꾼다 — shim이 계산한 MCP_ENV_PATH와
  // **도구면 인자**를 관측하기 위한 것이고, 네트워크·MCP 세션은 전혀 열리지 않는다.
  //
  // exposition은 진짜 번들의 파서(ArgumentsParser.getArgument)와 **같은 규칙**으로
  // 읽는다: `--exposition=v` 또는 `--exposition v`를 좌→우로 훑어 **첫 번째**를
  // 채택한다. 그래서 shim이 인자를 하나만 남기지 않으면(예: 빈 `--exposition=`을
  // 지우지 않고 뒤에 덧붙이면) 여기서 값이 어긋나거나 count가 2가 되어 잡힌다.
  fs.writeFileSync(
    path.join(dir, 'server.bundle.cjs'),
    `const a = process.argv.slice(2);
let first = null;
let count = 0;
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith('--exposition=')) { count++; if (first === null) first = a[i].slice('--exposition='.length); }
  else if (a[i] === '--exposition') { count++; if (first === null) first = i + 1 < a.length ? a[++i] : ''; else i++; }
}
process.stdout.write(JSON.stringify({
  envPath: process.env.MCP_ENV_PATH ?? null,
  exposition: first,
  expositionArgCount: count,
}));
`,
  );
  LAUNCH_PROBE = path.join(dir, 'launch.cjs');
  return LAUNCH_PROBE;
}

async function driveProfileResolve(tmpRoot, cwd, env) {
  const r = await run(profileResolveDriver(tmpRoot), [], { cwd, env });
  if (r.code !== 0) return { error: `exit ${r.code}: ${r.stderr.trim().slice(0, 300)}` };
  try {
    return { value: JSON.parse(r.stdout) };
  } catch {
    return { error: `JSON 아님: ${r.stdout.slice(0, 200)}` };
  }
}

function hookDecision(r) {
  if (!r.stdout.trim()) return { decision: 'allow', message: '' };
  try {
    const j = JSON.parse(r.stdout);
    const h = j.hookSpecificOutput ?? {};
    return { decision: h.permissionDecision ?? 'allow', message: h.permissionDecisionReason ?? '' };
  } catch {
    return { decision: 'parse-error', message: r.stdout.slice(0, 200) };
  }
}

async function driveTierGuard(cwd, env) {
  const payload = JSON.stringify({ tool_name: 'mcp__plugin_sapkit_sap__CreateProgram', tool_input: { name: 'ZPROBE' } });
  const r = await run(PATHS.tierGuard, [], { cwd, env, input: payload });
  const { decision, message } = hookDecision(r);
  let tier = null;
  if (decision === 'allow') {
    // 이 훅은 명시 DEV만 mutation을 통과시킨다 → allow ⇒ tier DEV.
    tier = 'DEV';
  } else {
    const m = message.match(/tier:\s*(\S+)/);
    const v = m ? m[1] : '';
    tier = v === '(unresolved)' ? null : v || null;
  }
  return { value: { tier, decision }, raw: message };
}

function firstToken(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.replace(/#.*$/, '').trim();
      if (t) return t;
    }
  } catch {
    /* 없으면 없는 것 */
  }
  return null;
}

async function probeTable(cwd, env, table) {
  const payload = JSON.stringify({ tool_name: 'mcp__plugin_sapkit_sap__GetTableContents', tool_input: { table } });
  const r = await run(PATHS.blocklist, [], { cwd, env, input: payload });
  return hookDecision(r);
}

async function driveBlocklist(cwd, env, expected, ctx) {
  const probe = await probeTable(cwd, env, PROFILE_PROBE_TABLE);
  const m = probe.message.match(/\(profile:\s*([a-z]+)\)/);
  const blocklistProfile = m ? m[1] : null;
  const out = { blocklistProfile };
  let note = null;

  // extendFrom은 훅이 출력하지 않는다 — **효과**로 관측한다: 기대된 세대의
  // blocklist-extend.txt 토큰은 deny(사용자 확장은 deny), 다른 세대의 토큰은 deny가
  // 아니어야 한다. 세대가 갈린 정책을 섞어 읽으면 즉시 red가 된다(§7-3 케이스 6).
  if (expected && Object.prototype.hasOwnProperty.call(expected, 'extendFrom')) {
    if (expected.extendFrom === null) {
      out.extendFrom = null;
    } else {
      const wantedFile = expandPath(expected.extendFrom, ctx);
      const otherFile = wantedFile.includes('.sapkit')
        ? wantedFile.replace('.sapkit', '.sc4sap')
        : wantedFile.replace('.sc4sap', '.sapkit');
      const wanted = firstToken(wantedFile);
      const unwanted = firstToken(otherFile);
      const wantedHit = wanted ? await probeTable(cwd, env, wanted) : null;
      const unwantedHit = unwanted ? await probeTable(cwd, env, unwanted) : null;
      const wantedDenied = wantedHit?.decision === 'deny';
      const unwantedDenied = unwantedHit?.decision === 'deny';
      if (wantedDenied && !unwantedDenied) {
        out.extendFrom = wantedFile;
      } else {
        out.extendFrom = null;
        note =
          `blocklist: 확장 목록 세대 판별 실패 — ${wanted ?? '(토큰 없음)'}=${wantedHit?.decision ?? 'n/a'} ` +
          `(deny여야 함) / ${unwanted ?? '(토큰 없음)'}=${unwantedHit?.decision ?? 'n/a'} (deny면 안 됨)`;
      }
    }
  }
  return { value: out, raw: probe.message, note };
}

async function driveLaunch(tmpRoot, cwd, env) {
  const r = await run(launchProbe(tmpRoot), [], { cwd, env });
  if (r.code !== 0) return { error: `exit ${r.code}: ${r.stderr.trim().slice(0, 300)}` };
  try {
    return { value: JSON.parse(r.stdout) };
  } catch {
    return { error: `JSON 아님: ${r.stdout.slice(0, 200)}` };
  }
}

async function driveResolveOnly(file, cwd, env) {
  const r = await run(file, ['--resolve-only'], { cwd, env });
  // R-ENV: `SAPKIT_HOME_DIR`이 없는 경로를 가리키면 이 도구들은 조용한 폴백 대신
  // 하드 오류로 멈춘다. 그것이 기대 동작이므로 구동 실패로 세지 않는다.
  if (r.code !== 0 && /ENV_INVALID/.test(r.stderr + r.stdout)) return { envInvalid: true };
  if (r.code !== 0) return { error: `exit ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 300)}` };
  try {
    return { value: JSON.parse(r.stdout) };
  } catch {
    return { error: `JSON 아님: ${r.stdout.slice(0, 200)}` };
  }
}

// ── 비교 ────────────────────────────────────────────────────────────────────
const PATH_KEYS = new Set(['runtimeDir', 'workspaceRoot', 'envPath', 'path', 'extendFrom']);
function compare(expected, actual, ctx, prefix = '') {
  const diffs = [];
  for (const [k, want] of Object.entries(expected)) {
    const got = actual?.[k];
    const label = prefix ? `${prefix}.${k}` : k;
    if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
      if (got === null || got === undefined) {
        diffs.push(`${label}: 기대 객체, 실제 ${JSON.stringify(got)}`);
        continue;
      }
      diffs.push(...compare(want, got, ctx, label));
      continue;
    }
    if (PATH_KEYS.has(k)) {
      const w = want === null ? null : norm(expandPath(want, ctx));
      const g = got === null || got === undefined ? null : norm(got);
      if (w !== g) diffs.push(`${label}: 기대 ${w ?? 'null'} · 실제 ${g ?? 'null'}`);
      continue;
    }
    if (want !== got) diffs.push(`${label}: 기대 ${JSON.stringify(want)} · 실제 ${JSON.stringify(got)}`);
  }
  return diffs;
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const CONSUMERS = ['profile-resolve', 'launch', 'tier-guard', 'blocklist'];
// 출하된 인터페이스로 관측할 수 없는 기대 키. tier 가드는 deny JSON 한 장만 내놓고
// 거기에 선택한 런타임 디렉터리는 들어 있지 않다. 이 키를 억지로 비교하려면 훅에
// 진단 출력을 새로 뚫어야 하는데, 그건 이 작업의 범위(경로 이름 이중화)를 넘는다.
// 대신 **그 선택의 결과**가 decision/tier로 드러나는 케이스들이 같은 것을 고정한다
// (safety-1: 상위가 DEV인데 하위 artifact-only에서 멈춰 deny · safety-4: 세대별
// SAP_TIER가 달라 어느 쪽을 읽었는지 tier로 판별된다).
const UNOBSERVABLE = { 'tier-guard': new Set(['runtimeDir']) };
// R-DEFAULT 바닥선 (설계 2026-08-02 §7-1). launch.cjs는 이제 도구면도 고른다 —
// 그 결정이 **경로 선택에 딸린 결과**이므로 이 진리표의 소비자다. fixture가
// `launch.expected.exposition`을 명시하지 않은 케이스는 전부 "write 도구면이 열리지
// 않는다"를 단언한다: 진리표 입력 중 `toolSurface`를 담은 것만 예외이고, 그 예외는
// fixture에 적혀 있어야 한다. 이 바닥선이 없으면 런처가 어떤 입력에서 조용히
// readonly,high를 열어도 러너는 초록이다.
const DEFAULT_SURFACE = 'readonly';
const results = [];
let failures = 0;
let skipped = 0;
let asserted = 0;
let unobserved = 0;

// profile-resolve는 64단계를 **올라간다.** 임시 트리를 사용자 홈 밑(Windows의
// `%TEMP%`가 그렇다)에 만들면 워크가 픽스처 밖으로 새어 나가 실사용자의 `~/.sc4sap`을
// 집는다 — 실측으로 확인했다. 그래서 조상 사슬에 런타임 디렉터리가 없는 루트를 고른다.
function ancestorsClean(dir) {
  let cur = path.resolve(dir);
  for (let i = 0; i < 80; i++) {
    if (fs.existsSync(path.join(cur, '.sapkit')) || fs.existsSync(path.join(cur, '.sc4sap'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}
function makeCleanRoot() {
  const candidates = [os.tmpdir(), path.parse(os.tmpdir()).root, path.parse(REPO).root];
  const rejected = [];
  for (const base of candidates) {
    let dir;
    try {
      dir = fs.mkdtempSync(path.join(base, 'rt-conform-'));
    } catch (err) {
      rejected.push(`${base}: 생성 불가 (${err.code})`);
      continue;
    }
    const dirty = ancestorsClean(dir);
    if (!dirty) return dir;
    fs.rmSync(dir, { recursive: true, force: true });
    rejected.push(`${base}: 조상 ${dirty} 에 런타임 디렉터리가 있다`);
  }
  console.error('❌ 격리 가능한 임시 루트를 만들지 못했다 — 64-깊이 워크가 픽스처 밖으로 샌다:');
  for (const r of rejected) console.error(`   - ${r}`);
  process.exit(1);
}
const tmpRoot = makeCleanRoot();
let exitCode = 0;

try {
  for (const kase of fixture.cases) {
    if (ONLY && kase.id !== ONLY) continue;
    const caseRoot = path.join(tmpRoot, kase.id.replace(/[^a-z0-9-]/gi, '_'));
    fs.mkdirSync(caseRoot, { recursive: true });
    const { ctx, env, cwd } = materialize(kase, caseRoot);
    const row = { id: kase.id, axis: kase.axis, cells: {}, diffs: [] };

    // 정적 레포 단언 케이스 — 이 러너의 대상이 아니다(§7-2 게이트가 소유).
    const allNull = CONSUMERS.every((c) => (kase.consumers?.[c]?.expected ?? null) === null);
    const noEngine = (kase.consumers?.engine?.expected ?? null) === null;
    if (allNull && noEngine) {
      row.note = '정적 레포 단언 — check-runtime-path-rename.mjs가 소유';
      for (const c of CONSUMERS) row.cells[c] = 'n/a';
      results.push(row);
      continue;
    }

    const [pr, lh, tg] = await Promise.all([
      driveProfileResolve(tmpRoot, cwd, env),
      driveLaunch(tmpRoot, cwd, env),
      driveTierGuard(cwd, env),
    ]);
    const bl = await driveBlocklist(cwd, env, kase.consumers?.blocklist?.expected ?? null, ctx);
    if (bl.note) row.diffs.push(bl.note);

    const observed = { 'profile-resolve': pr, launch: lh, 'tier-guard': tg, blocklist: bl };

    if (OBSERVE) {
      const templ = (v) => {
        if (typeof v === 'string') {
          let s = v;
          if (norm(ctx.cwd) !== norm(ctx.project)) s = s.split(ctx.cwd).join('$CWD');
          return s.split(ctx.project).join('$PROJECT').split(ctx.home).join('$HOME').split(path.sep).join('/');
        }
        if (Array.isArray(v)) return v.map(templ);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, templ(x)]));
        return v;
      };
      const dump = {};
      for (const c of CONSUMERS) {
        dump[c] = observed[c].error ? { error: observed[c].error } : templ(observed[c].value);
      }
      console.log(`\n── ${kase.id}`);
      console.log(JSON.stringify(dump, null, 2));
      results.push(row);
      continue;
    }

    for (const c of CONSUMERS) {
      const exp = kase.consumers?.[c]?.expected ?? null;
      const obs = observed[c];
      if (obs.error) {
        row.cells[c] = 'ERR';
        row.diffs.push(`${c}: 구동 실패 — ${obs.error}`);
        failures++;
        continue;
      }
      if (exp === null) {
        row.cells[c] = 'skip';
        skipped++;
        continue;
      }
      const blind = UNOBSERVABLE[c];
      const cmpExp = {};
      for (const [k, v] of Object.entries(exp)) {
        if (blind?.has(k)) unobserved++;
        else cmpExp[k] = v;
      }
      if (Object.keys(cmpExp).length === 0) {
        row.cells[c] = 'blind';
        continue;
      }
      const diffs = compare(cmpExp, obs.value, ctx);
      asserted++;
      if (diffs.length) {
        row.cells[c] = 'FAIL';
        row.diffs.push(...diffs.map((d) => `${c}: ${d}`));
        failures++;
      } else {
        row.cells[c] = 'ok';
      }
    }

    // ── launch.cjs 도구면 (설계 2026-08-02 §7-1) ────────────────────────────
    // ⓐ 번들에 가는 --exposition은 **정확히 하나**여야 한다. 번들 파서는 첫 인자를
    //    채택하므로 둘이 남으면 뒤엣것이 조용히 무시된다(빈 `--exposition=`이 남으면
    //    번들은 "미지정"으로 읽어 자기 기본값 readonly,high를 연다).
    // ⓑ fixture가 값을 고정하지 않은 케이스는 R-DEFAULT 바닥선을 단언한다.
    //    값을 고정한 케이스는 위 compare()가 이미 대조했다.
    if (!lh.error) {
      const pinnedLaunch = kase.consumers?.launch?.expected ?? null;
      if (lh.value.expositionArgCount !== 1) {
        row.diffs.push(`launch: --exposition 인자 ${lh.value.expositionArgCount}개 — 정확히 1개여야 한다`);
        row.cells.launch = 'FAIL';
        failures++;
      } else if (!pinnedLaunch || !Object.prototype.hasOwnProperty.call(pinnedLaunch, 'exposition')) {
        asserted++;
        if (lh.value.exposition !== DEFAULT_SURFACE) {
          row.diffs.push(
            `launch: exposition 바닥선 위반 — fixture 미고정 케이스는 ${DEFAULT_SURFACE}여야 하는데 ` +
              `${JSON.stringify(lh.value.exposition)} (write 도구면이 열렸다면 fixture에 근거와 함께 고정할 것)`,
          );
          row.cells.launch = 'FAIL';
          failures++;
        }
      }
    }

    // tier-guard의 runtimeDir은 훅의 공개 출력에 없다 — 대신 그 선택이
    // decision/tier로 드러나는 케이스(safety-1 등)가 같은 것을 고정한다.
    if (kase.consumers?.['tier-guard']?.expected?.runtimeDir) {
      row.note = (row.note ? row.note + ' · ' : '') + 'tier-guard.runtimeDir은 훅 출력에 없어 decision/tier로 간접 고정';
    }

    // cwd-상대 기록기 3종. fixture에 **도구별** 기대(`consumers['cwd-tools']`)가 있으면
    // 각각 대조하고, 없으면 R-PRESERVE 불변식만 assert한다. 불변식만으로는 셋이 **같은
    // 오답**을 내면 통과해 버린다(3차 리뷰 #6) — 그래서 도구별 기대가 본선이고
    // 불변식은 그물이다. 둘 다 돌린다.
    const cwdExpected = kase.consumers?.['cwd-tools']?.expected ?? null;
    const [vp, es, ec] = await Promise.all([
      driveResolveOnly(PATHS.vpass, cwd, env),
      driveResolveOnly(PATHS.extractSpro, cwd, env),
      driveResolveOnly(PATHS.extractCust, cwd, env),
    ]);
    const trio = { vpass: vp, 'extract-spro': es, 'extract-customizations': ec };
    const trioDirs = [];
    let envInvalidCount = 0;
    for (const [name, res] of Object.entries(trio)) {
      if (res.envInvalid) {
        envInvalidCount++;
        continue;
      }
      if (res.error) {
        row.diffs.push(`${name}: --resolve-only 구동 실패 — ${res.error}`);
        failures++;
        continue;
      }
      trioDirs.push([name, norm(res.value.runtime_dir)]);
    }
    if (envInvalidCount > 0) {
      row.cells['cwd-tools'] = `env-invalid ${envInvalidCount}/3`;
      row.note =
        (row.note ? row.note + ' · ' : '') +
        'R-ENV 하드 오류로 멈춘 도구가 있다(기대 동작). extract-customizations는 --resolve-only에서 홈을 해석하지 않아 멈추지 않는다 — 출력 범위 차이';
    } else if (trioDirs.length === 3) {
      asserted++;
      const cwdDiffs = [];
      const [a, b, c3] = trioDirs;
      const legacyAt = fs.existsSync(path.join(cwd, '.sc4sap'));
      const newAt = fs.existsSync(path.join(cwd, '.sapkit'));
      if (!(a[1] === b[1] && b[1] === c3[1])) {
        cwdDiffs.push(`cwd-상대 3종 불일치: ${trioDirs.map(([n, d]) => `${n}=${d}`).join(' | ')}`);
      } else if (legacyAt && !newAt && a[1] !== norm(path.join(cwd, '.sc4sap'))) {
        cwdDiffs.push(`R-PRESERVE 위반: cwd에 .sc4sap만 있는데 ${a[1]} 를 골랐다`);
      } else if (!legacyAt && !newAt && a[1] !== norm(path.join(cwd, '.sapkit'))) {
        cwdDiffs.push(`R-NEW 위반: cwd에 아무 세대도 없는데 ${a[1]} 를 골랐다`);
      }
      // 도구별 기대값 — "셋이 같으면 통과"의 구멍을 막는 본선 대조.
      if (cwdExpected) {
        for (const [name, got] of trioDirs) {
          if (!Object.prototype.hasOwnProperty.call(cwdExpected, name)) continue;
          const want = norm(expandPath(cwdExpected[name], ctx));
          if (want !== got) cwdDiffs.push(`${name}.runtime_dir: 기대 ${want} · 실제 ${got}`);
        }
      }
      if (cwdDiffs.length) {
        row.diffs.push(...cwdDiffs.map((d) => `cwd-tools: ${d}`));
        failures++;
        row.cells['cwd-tools'] = 'FAIL';
      } else {
        row.cells['cwd-tools'] = cwdExpected ? 'ok(pinned)' : 'ok';
      }
    }

    results.push(row);
  }

  // ── launch.cjs 실기동 스모크 (무접속 안전 확인) ───────────────────────────
  // 스텁이 아니라 **진짜 번들**을 띄운다. 런타임 디렉터리가 없는 임시 cwd라
  // MCP_ENV_PATH가 서지 않고, 서버는 inspection-only로 뜬다 = SAP 무접속.
  //
  // 전건 실행일 때만 돈다. 이것은 케이스 단언이 아니라 **전역** 단언이라, 케이스를
  // 하나만 고른 실행(--case)이나 소비자를 바꿔치기한 실행(--consumer-root, 번들이
  // 옆에 없다)에서 돌리면 의미도 없고 결과만 흐려진다.
  const GLOBAL_ASSERTS = !ONLY && !CONSUMER_ROOT;
  let bootOk = false;
  let bootNote = GLOBAL_ASSERTS ? '' : '(부분 실행 — 전역 스모크 생략)';
  if (GLOBAL_ASSERTS) {
    const bootCwd = path.join(tmpRoot, 'boot-smoke');
    fs.mkdirSync(bootCwd, { recursive: true });
    const env = { ...process.env };
    delete env.SAPKIT_HOME_DIR;
    delete env.SC4SAP_HOME_DIR;
    delete env.MCP_ENV_PATH;
    env.HOME = bootCwd;
    env.USERPROFILE = bootCwd;
    const req =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'conformance', version: '0' } },
      }) + '\n';
    const r = await run(PATHS.launch, [], { cwd: bootCwd, env, input: req, timeout: 60000 });
    bootOk = /"result"/.test(r.stdout) && !/ENV_INVALID/.test(r.stderr);
    bootNote = bootOk
      ? 'initialize 응답 수신 · MCP_ENV_PATH 미설정(무접속 inspection-only)'
      : `stdout ${r.stdout.slice(0, 160)} / stderr ${r.stderr.slice(0, 160)}`;
    if (!bootOk) failures++;
    else asserted++;
  }

  // ── 보고 ──────────────────────────────────────────────────────────────────
  const cols = [...CONSUMERS, 'cwd-tools'];
  const w = Math.max(...results.map((r) => r.id.length), 4);
  console.log(`\n소비자 × 케이스 매트릭스 (fixture ${fixture.cases.length}건 · version ${fixture.version})`);
  console.log(`${'case'.padEnd(w)}  ${cols.map((c) => c.padEnd(16)).join('')}`);
  for (const r of results) {
    console.log(`${r.id.padEnd(w)}  ${cols.map((c) => String(r.cells[c] ?? '-').padEnd(16)).join('')}${r.note ? '  # ' + r.note : ''}`);
  }

  const failedRows = results.filter((r) => r.diffs.length);
  if (failedRows.length || VERBOSE) {
    console.log('\n불일치 상세:');
    for (const r of failedRows) {
      console.log(`  [${r.id}]`);
      for (const d of r.diffs) console.log(`    - ${d}`);
    }
  }

  // ── 안전 회귀 9종 ─────────────────────────────────────────────────────────
  const safetyGroups = new Map();
  for (const r of results) {
    const m = r.id.match(/^safety-(\d)/);
    if (!m) continue;
    const g = m[1];
    if (!safetyGroups.has(g)) safetyGroups.set(g, []);
    safetyGroups.get(g).push(r);
  }
  console.log('\n안전 회귀 (§7-3):');
  let safetyFail = 0;
  for (const g of [...safetyGroups.keys()].sort()) {
    const rows = safetyGroups.get(g);
    const bad = rows.filter((r) => r.diffs.length);
    const ok = bad.length === 0;
    if (!ok) safetyFail++;
    console.log(`  #${g}  ${ok ? 'PASS' : 'FAIL'}  ${rows.map((r) => r.id).join(', ')}`);
  }
  // 9종 완비 검사도 전역 단언이다 — 부분 실행에서는 세지 않는다.
  if (GLOBAL_ASSERTS && safetyGroups.size !== 9) {
    console.log(`  ⚠ 안전 그룹 ${safetyGroups.size}개 — 9종이어야 한다`);
    safetyFail++;
  }

  console.log(`\nlaunch 실기동 스모크: ${GLOBAL_ASSERTS ? (bootOk ? 'PASS' : 'FAIL') : 'SKIP'} — ${bootNote}`);
  console.log(
    `\nassert ${asserted}건 · skip(fixture 기대 미확정) ${skipped}건 · ` +
      `unobservable(출하 인터페이스로 관측 불가 — tier-guard.runtimeDir) ${unobserved}건 · 실패 ${failures}건`,
  );

  if (failures || safetyFail) {
    console.log('\n❌ 적합성 시험 실패');
    exitCode = 1;
  } else {
    console.log('\n✅ 적합성 시험 통과 — 소비자별 현행 의미 보존(R-PRESERVE) · 안전 회귀 9종 PASS');
  }
} finally {
  // process.exit()은 finally를 건너뛴다 — 임시 트리를 지운 뒤에 종료해야 한다.
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
process.exit(exitCode);
