#!/usr/bin/env node
// test-doctor.mjs — doctor.mjs(§9-2 capability 기반 개편)의 음성/실측 시험.
// 설계 정본: docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md §9
//
// doctor.mjs는 모듈이 아니라 스크립트(실행 즉시 전 검사가 돈다)라서, launch.cjs처럼
// in-process로 개별 함수를 부를 수 없다. 그래서 이 시험은 test-hook-switch.mjs·
// test-launch-toolsurface.mjs와 같은 house style — **subprocess 실행 + 외부 CLI는
// PATH 스텁으로 대체** — 를 따른다. doctor.mjs 자신과 launch.cjs·install-hooks.mjs·
// verify-engine.mjs·compatibility.json은 전부 **실물**이다(레포 무변조) — 스텁은 doctor가
// shell-out하는 `claude`/`codex`/`agy` 3개 CLI뿐이다.
//
// 커버: ① CLI 전부 부재 → 관련 검사 SKIP(크래시 없음) ② 파일시스템 전용 검사(⑤⑥⑧⑨)
// 실측 — runtime dir 세대·toolSurface fail-closed·훅 marker 활성/죽은 경로/미배선 ③ 별칭
// 미출력 회귀 시험(doctor가 launch.cjs의 selectRuntimeDir()을 부를 때 warnOnce가
// stderr에 별칭을 흘리던 결함의 재발 방지) ④ Codex 설치본 버전 불일치 WARN ⑤ Codex
// bundled MCP wrapper 3분류(미배선/스테일/정상) + 결손 2종 FAIL ⑥ Codex legacy 전역
// sap 그림자 WARN ⑦ exit code 계약(FAIL 있으면 1, WARN/INFO/SKIP만이면 0) ⑧ --json 계약
// (파싱 유효·필드 4종).
//
// **하지 않는 것**: compatibility.json은 실물을 그대로 둔다(수정·복원 왕복 금지 — 배포
// 산출물을 시험 중 잠깐이라도 변형하는 리스크를 감수하지 않는다). 그 결과 codex 호환성
// 판정의 FAIL/OK(lastVerified)/WARN(이상+미검증) 세 분기는 **오늘 compatibility.json이
// minimumSupported=null(pre-conformance)인 한 어떤 subprocess 시험으로도 도달 불가능**
// 하다 — SKIP·WARN(미검증) 두 분기만 실측한다. P0 probe가 minimumSupported를 채운
// 뒤에는 이 파일도 나머지 분기를 채울 수 있다(코드 리뷰로는 검토 완료, fixture는 미검증).
//
// 사용: node interactive/scripts/test-doctor.mjs [--verbose]
// exit 0 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const DOCTOR = path.join(HERE, 'doctor.mjs');
const HOOKS_DIR = path.join(INTERACTIVE, 'adapters', 'claude', 'hooks');
const REPO_VERSION = JSON.parse(fs.readFileSync(path.join(INTERACTIVE, 'plugin-metadata.json'), 'utf8')).version;

const VERBOSE = process.argv.includes('--verbose');
let pass = 0;
let fail = 0;
function ok(name, cond, evidence) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    if (VERBOSE && evidence) console.log(`       ${evidence}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}`);
    if (evidence) console.log(`       ${evidence}`);
    fail++;
  }
  return cond;
}

if (!fs.existsSync(DOCTOR)) {
  console.error(`❌ doctor.mjs 부재: ${DOCTOR}`);
  process.exit(1);
}

// ── 임시 세계 ───────────────────────────────────────────────────────────────
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-doctor-test-'));
process.on('exit', () => {
  try {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  } catch {
    /* OS에 맡긴다 */
  }
});

function tmpDir(name) {
  const d = path.join(SCRATCH, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// ── 가짜 claude/codex/agy — Windows PATHEXT가 찾는 .cmd 래퍼 + 공용 stub.mjs ──────────
// doctor.mjs는 spawnSync(cmd, args, {shell:true})로 부르므로 cmd.exe의 PATHEXT 해석을
// 그대로 받는다 — `<name>.cmd`가 PATH에서 발견되면 그걸 쓴다(fakebinDir을 PATH 맨
// 앞에 둔다). 역할(claude/codex/agy)은 각 .cmd가 stub.mjs에 __role= 인자로 알려준다.
const FAKEBIN = tmpDir('fakebin');
writeText(
  path.join(FAKEBIN, 'stub.mjs'),
  `const [, , roleArg, ...rest] = process.argv;
const role = String(roleArg || '').replace('__role=', '');
const joined = rest.join(' ');
const env = process.env;
function out(t) { process.stdout.write(t ?? ''); }
if (role === 'claude') {
  if (joined === '--version') { out(env.DOCTOR_STUB_CLAUDE_VERSION ?? '2.1.220 (Claude Code)'); process.exit(0); }
  if (joined.startsWith('plugin list')) { out(env.DOCTOR_STUB_CLAUDE_PLUGIN_LIST ?? '[]'); process.exit(0); }
  process.exit(1);
}
if (role === 'codex') {
  if (joined === '--version') { out(env.DOCTOR_STUB_CODEX_VERSION ?? 'codex-cli 0.146.0'); process.exit(0); }
  if (joined.startsWith('plugin list')) { out(env.DOCTOR_STUB_CODEX_PLUGIN_LIST ?? '{"installed":[],"available":[]}'); process.exit(0); }
  if (joined.startsWith('mcp list')) { out(env.DOCTOR_STUB_CODEX_MCP_LIST ?? '[]'); process.exit(0); }
  if (joined.startsWith('mcp get')) {
    if (env.DOCTOR_STUB_CODEX_MCP_GET) { out(env.DOCTOR_STUB_CODEX_MCP_GET); process.exit(0); }
    process.exit(1);
  }
  process.exit(1);
}
if (role === 'agy') {
  if (joined === '--version') { out(env.DOCTOR_STUB_AGY_VERSION ?? '1.1.4'); process.exit(0); }
  if (joined.startsWith('plugin list')) { out('no plugins'); process.exit(0); }
  process.exit(1);
}
process.exit(1);
`,
);
for (const [name, role] of [['claude', 'claude'], ['codex', 'codex'], ['agy', 'agy']]) {
  writeText(path.join(FAKEBIN, `${name}.cmd`), `@echo off\r\nnode "%~dp0stub.mjs" __role=${role} %*\r\n`);
}

// Windows에서 cmd.exe 자체가 뜨려면 SystemRoot 등 baseline이 필요하다 — process.env를
// 베이스로 깔고 PATH만 갈아 끼운다(test-hook-switch.mjs·test-launch-toolsurface.mjs와
// 같은 패턴). node 자신의 디렉터리도 PATH에 있어야 .cmd 래퍼가 그것을 찾는다.
const NODE_DIR = path.dirname(process.execPath);
const SYSTEM_DIRS = [process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32') : null, process.env.SystemRoot].filter(
  Boolean,
);
const MINIMAL_PATH = [NODE_DIR, ...SYSTEM_DIRS].join(path.delimiter);
const STUBBED_PATH = [FAKEBIN, ...MINIMAL_PATH.split(path.delimiter)].join(path.delimiter);

function runDoctor({ cwd, home = tmpDir('unused-home'), stubbed = true, extraEnv = {} } = {}) {
  const env = { ...process.env, ...extraEnv };
  env.PATH = stubbed ? STUBBED_PATH : MINIMAL_PATH;
  env.HOME = home;
  env.USERPROFILE = home;
  delete env.SAPKIT_HOME_DIR;
  delete env.MCP_ENV_PATH;
  if (extraEnv.SAPKIT_HOME_DIR) env.SAPKIT_HOME_DIR = extraEnv.SAPKIT_HOME_DIR;
  const r = spawnSync(process.execPath, [DOCTOR, '--json'], { cwd, env, encoding: 'utf8', timeout: 60000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* 아래 단언이 raw로 잡는다 */
  }
  return { code: r.status, json, raw: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function findCheck(json, code) {
  return json?.checks?.find((c) => c.code === code) ?? null;
}

// BUNDLE_INTEGRITY(①)는 매 실행 verify-engine.mjs로 **레포의 실제 현재 상태**를 잰다 —
// 이 시험이 통제하지 않는 값이라, 이 레포에서 병렬로 진행 중인 다른 작업이 엔진/번들을
// 잠깐 불일치 상태로 두면(이 세션 실측: engine/·server.bundle.cjs가 동시에 수정 중이라
// FAIL) 이 시험의 다른 시나리오와 무관하게 항상 FAIL 1건이 섞인다. 그래서 exit code
// 단언은 "FAIL이 전혀 없다"가 아니라 "이 시나리오가 새로 만든 FAIL은 없다(있다면
// BUNDLE_INTEGRITY뿐)"로 잡는다 — 노이즈에 강하면서도 회귀는 여전히 잡는다.
function onlyBundleFails(json) {
  return (json?.checks ?? []).filter((c) => c.status === 'FAIL').every((c) => c.code === 'BUNDLE_INTEGRITY');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('doctor.mjs capability 진단 시험 (설계 §9)\n');

// ── T1. CLI 전부 부재 → 크래시 없이 관련 검사 전부 SKIP, exit 0 ──────────────────────
console.log('T1. 3사 CLI 전부 부재');
{
  const proj = tmpDir('t1-project');
  const home = tmpDir('t1-home');
  const r = runDoctor({ cwd: proj, home, stubbed: false });
  ok('doctor가 크래시하지 않고 유효 JSON을 낸다', r.json != null, `exit=${r.code} raw(앞 300자)=${r.raw.slice(0, 300)}`);
  if (r.json) {
    for (const c of ['CLIENT_COMPAT_CLAUDE', 'CLIENT_COMPAT_CODEX', 'CLIENT_COMPAT_AGY', 'PLUGIN_ROOT_CODEX', 'MCP_DECL_CODEX', 'CODEX_LEGACY_SAP']) {
      const chk = findCheck(r.json, c);
      ok(`${c} = SKIP(CLI 부재)`, chk?.status === 'SKIP', JSON.stringify(chk));
    }
    // Claude MCP 선언은 레포 소스로 폴백해 OK여야 한다(설치 안 됐다고 FAIL은 아님).
    const claudeMcp = findCheck(r.json, 'MCP_DECL_CLAUDE');
    ok('MCP_DECL_CLAUDE = OK(레포 소스 폴백)', claudeMcp?.status === 'OK', JSON.stringify(claudeMcp));
    ok('CLI 부재가 새 FAIL을 만들지 않는다(있다면 BUNDLE_INTEGRITY뿐)', onlyBundleFails(r.json), `summary=${JSON.stringify(r.json.summary)}`);
  }
}

// ── T2. 빈 프로젝트의 ⑤⑥⑨(runtime dir·toolSurface·sap.env) — 전부 INFO(정상 기본값) ──
console.log('\nT2. 빈 프로젝트 — runtime dir 없음(inspection-only 기본값)');
{
  const proj = tmpDir('t2-project');
  const home = tmpDir('t2-home');
  const r = runDoctor({ cwd: proj, home, stubbed: false });
  const rd = findCheck(r.json, 'RUNTIME_DIR');
  const ts = findCheck(r.json, 'TOOL_SURFACE');
  const se = findCheck(r.json, 'SAP_ENV_PRESENCE');
  ok('RUNTIME_DIR = INFO(연결 가능한 세대 없음)', rd?.status === 'INFO', JSON.stringify(rd));
  ok('TOOL_SURFACE = INFO(TOOLSURFACE_DEFAULT)', ts?.status === 'INFO' && ts.evidence.includes('TOOLSURFACE_DEFAULT'), JSON.stringify(ts));
  ok('SAP_ENV_PRESENCE = INFO(부재)', se?.status === 'INFO' && se.evidence.includes('부재'), JSON.stringify(se));
}

// ── T3. development + SAP_TIER=QA → TOOL_SURFACE WARN(fail-closed), 이유에 QA 명시 ──
console.log('\nT3. toolSurface=development + SAP_TIER=QA → fail-closed WARN');
{
  const proj = tmpDir('t3-project');
  writeJson(path.join(proj, '.sapkit', 'config.json'), { toolSurface: 'development' });
  writeText(path.join(proj, '.sapkit', 'sap.env'), 'SAP_URL=http://test-qa\nSAP_CLIENT=100\nSAP_TIER=QA\n');
  const home = tmpDir('t3-home');
  const r = runDoctor({ cwd: proj, home, stubbed: false });
  const ts = findCheck(r.json, 'TOOL_SURFACE');
  ok('TOOL_SURFACE = WARN(TOOLSURFACE_FAIL_CLOSED)', ts?.status === 'WARN' && ts.evidence.includes('TOOLSURFACE_FAIL_CLOSED'), JSON.stringify(ts));
  ok('WARN 사유에 실제 SAP_TIER=QA가 담긴다(launch.cjs 실제 메시지 재사용)', (ts?.remediation ?? '').includes('SAP_TIER=QA'), ts?.remediation);
}

// ── T4. development + SAP_TIER=dev → 조용히 OK, sap.env 존재도 OK ───────────────────
console.log('\nT4. toolSurface=development + SAP_TIER=dev → OK(경고 없음)');
{
  const proj = tmpDir('t4-project');
  writeJson(path.join(proj, '.sapkit', 'config.json'), { toolSurface: 'development' });
  writeText(path.join(proj, '.sapkit', 'sap.env'), 'SAP_URL=http://test-dev\nSAP_CLIENT=100\nSAP_TIER=dev\n');
  const home = tmpDir('t4-home');
  const r = runDoctor({ cwd: proj, home, stubbed: false });
  const ts = findCheck(r.json, 'TOOL_SURFACE');
  const se = findCheck(r.json, 'SAP_ENV_PRESENCE');
  ok('TOOL_SURFACE = OK(경고 없음)', ts?.status === 'OK', JSON.stringify(ts));
  ok('SAP_ENV_PRESENCE = OK(존재)', se?.status === 'OK' && se.evidence.includes('존재'), JSON.stringify(se));
}

// ── T5. 별칭 미출력 회귀 시험 — active-profile.txt 포인터 경로에서 별칭이 새면 안 된다 ──
// (doctor 개발 중 실제로 발견한 결함: launch.cjs.selectRuntimeDir()의 내부 warnOnce가
// stderr에 "profile \"<별칭>\" resolved under..."를 직접 썼다. doctor는 이를
// console.error 임시 무음 처리로 막는다 — 이 시험은 그 처치가 유지되는지를 잰다.)
console.log('\nT5. active-profile.txt 별칭이 stdout/stderr 어디에도 새지 않는다(회귀)');
{
  const proj = tmpDir('t5-project');
  const home = tmpDir('t5-home');
  const ALIAS = 'ZZ-DOCTOR-TEST-ALIAS-9F3';
  writeText(path.join(proj, '.sapkit', 'active-profile.txt'), ALIAS);
  writeText(path.join(home, '.sapkit', 'profiles', ALIAS, 'sap.env'), 'SAP_URL=http://test\nSAP_CLIENT=100\nSAP_TIER=dev\n');
  const r = runDoctor({ cwd: proj, home, stubbed: false });
  const rd = findCheck(r.json, 'RUNTIME_DIR');
  ok('RUNTIME_DIR = OK · sap.env 해석=성공(연결 실측)', rd?.status === 'OK' && rd.evidence.includes('해석=성공'), JSON.stringify(rd));
  ok('별칭 문자열이 stdout(JSON)에 없다', !r.raw.includes(ALIAS), `raw에 포함 여부: ${r.raw.includes(ALIAS)}`);
  ok('별칭 문자열이 stderr에도 없다(launch.cjs warnOnce 무음 처리 확인)', !r.stderr.includes(ALIAS), `stderr: ${r.stderr.slice(0, 300)}`);
}

// ── T6. Codex 설치본 버전 불일치 → PLUGIN_ROOT_CODEX WARN(레포 버전과 병기, FAIL 아님) ──
console.log('\nT6. Codex 설치본 버전 ≠ 레포 버전 → WARN(FAIL 아님)');
{
  const proj = tmpDir('t6-project');
  const home = tmpDir('t6-home');
  const codexInstall = tmpDir('t6-codex-install');
  // mcpServers 필드 없음 = 아직 미패키징(P1 미착수) 상태를 같이 재현 — MCP_DECL_CODEX는 INFO다.
  writeJson(path.join(codexInstall, '.codex-plugin', 'plugin.json'), { name: 'sapkit', version: '0.0.1-mismatch' });
  const pluginList = {
    installed: [
      {
        pluginId: 'sapkit@test-market',
        name: 'sapkit',
        marketplaceName: 'test-market',
        version: '0.0.1-mismatch',
        installed: true,
        enabled: true,
        source: { source: 'local', path: codexInstall },
      },
    ],
    available: [],
  };
  const r = runDoctor({
    cwd: proj,
    home,
    extraEnv: { DOCTOR_STUB_CODEX_PLUGIN_LIST: JSON.stringify(pluginList) },
  });
  const pv = findCheck(r.json, 'PLUGIN_ROOT_CODEX');
  ok(
    'PLUGIN_ROOT_CODEX = WARN(버전 불일치, 레포 버전 병기)',
    pv?.status === 'WARN' && pv.evidence.includes('0.0.1-mismatch') && pv.evidence.includes(REPO_VERSION),
    JSON.stringify(pv),
  );
  const mcp = findCheck(r.json, 'MCP_DECL_CODEX');
  ok('MCP_DECL_CODEX = INFO(mcpServers 필드 없음 = 미패키징)', mcp?.status === 'INFO', JSON.stringify(mcp));
  ok('버전 불일치는 FAIL이 아니다(WARN에 그침, 새 FAIL 없음)', pv?.status !== 'FAIL' && onlyBundleFails(r.json), `summary=${JSON.stringify(r.json?.summary)}`);
}

// ── T7. Codex bundled MCP wrapper 3분류 ──────────────────────────────────────────────
console.log('\nT7. Codex wrapper 배선 상태 3분류(미배선/스테일/정상) + 결손 2종');
function codexPluginListFor(installPath) {
  return JSON.stringify({
    installed: [
      {
        pluginId: 'sapkit@test-market',
        name: 'sapkit',
        marketplaceName: 'test-market',
        version: REPO_VERSION,
        installed: true,
        enabled: true,
        source: { source: 'local', path: installPath },
      },
    ],
    available: [],
  });
}
{
  // 7a. 토큰 잔존 = 미배선 — 픽스처를 수기로 쓰지 않고 **레포 실생성물을 그대로 복사**
  // 한다(토큰형이 곧 배포 상태). 생성물 shape이 바뀌면 이 케이스가 실물과 함께
  // 어긋나도록 하는 재발 방지다(v0.5.0 독립 리뷰 M-1 — 수기 픽스처가 doctor의 구형
  // shape 버그를 그대로 베껴 43건이 공허하게 초록이던 결함의 수리).
  const install = tmpDir('t7a-install');
  writeJson(path.join(install, '.codex-plugin', 'plugin.json'), { mcpServers: './adapters/codex/.mcp.json' });
  const realWrapper = path.join(INTERACTIVE, 'adapters', 'codex', '.mcp.json');
  const dst7a = path.join(install, 'adapters', 'codex', '.mcp.json');
  fs.mkdirSync(path.dirname(dst7a), { recursive: true });
  fs.copyFileSync(realWrapper, dst7a);
  const r = runDoctor({ cwd: tmpDir('t7a-project'), home: tmpDir('t7a-home'), extraEnv: { DOCTOR_STUB_CODEX_PLUGIN_LIST: codexPluginListFor(install) } });
  const chk = findCheck(r.json, 'MCP_DECL_CODEX');
  ok('7a 토큰 잔존 → WARN(미배선)', chk?.status === 'WARN' && chk.evidence.includes('미배선'), JSON.stringify(chk));
}
{
  // 7b. 절대경로가 현재 설치 루트와 다름 = 스테일
  const install = tmpDir('t7b-install');
  const decoy = tmpDir('t7b-decoy-old-install');
  writeJson(path.join(install, '.codex-plugin', 'plugin.json'), { mcpServers: './adapters/codex/.mcp.json' });
  // 서버 맵 직접형 — 실제 생성물과 같은 shape (구형 mcpServers 래핑 아님)
  writeJson(path.join(install, 'adapters', 'codex', '.mcp.json'), {
    sap: { command: 'node', args: [path.join(decoy, 'server', 'launch.cjs')] },
  });
  const r = runDoctor({ cwd: tmpDir('t7b-project'), home: tmpDir('t7b-home'), extraEnv: { DOCTOR_STUB_CODEX_PLUGIN_LIST: codexPluginListFor(install) } });
  const chk = findCheck(r.json, 'MCP_DECL_CODEX');
  ok('7b 경로 불일치 → WARN(스테일)', chk?.status === 'WARN' && chk.evidence.includes('스테일'), JSON.stringify(chk));
}
{
  // 7c. 절대경로가 현재 설치 루트와 일치 = 정상
  const install = tmpDir('t7c-install');
  writeJson(path.join(install, '.codex-plugin', 'plugin.json'), { mcpServers: './adapters/codex/.mcp.json' });
  // 서버 맵 직접형 — 실제 생성물과 같은 shape
  writeJson(path.join(install, 'adapters', 'codex', '.mcp.json'), {
    sap: { command: 'node', args: [path.join(install, 'server', 'launch.cjs')] },
  });
  const r = runDoctor({ cwd: tmpDir('t7c-project'), home: tmpDir('t7c-home'), extraEnv: { DOCTOR_STUB_CODEX_PLUGIN_LIST: codexPluginListFor(install) } });
  const chk = findCheck(r.json, 'MCP_DECL_CODEX');
  ok('7c 경로 일치 → OK(정상)', chk?.status === 'OK' && chk.evidence.includes('정상'), JSON.stringify(chk));
  ok('7c는 새 FAIL을 만들지 않는다(있다면 BUNDLE_INTEGRITY뿐)', onlyBundleFails(r.json), `summary=${JSON.stringify(r.json?.summary)}`);
}
{
  // 7d. mcpServers는 있는데 wrapper 파일 자체가 없음 = FAIL, exit 1
  const install = tmpDir('t7d-install');
  writeJson(path.join(install, '.codex-plugin', 'plugin.json'), { mcpServers: './adapters/codex/.mcp.json' });
  const r = runDoctor({ cwd: tmpDir('t7d-project'), home: tmpDir('t7d-home'), extraEnv: { DOCTOR_STUB_CODEX_PLUGIN_LIST: codexPluginListFor(install) } });
  const chk = findCheck(r.json, 'MCP_DECL_CODEX');
  ok('7d wrapper 파일 부재 → FAIL', chk?.status === 'FAIL', JSON.stringify(chk));
  ok('7d FAIL 1건 이상 → exit 1(FAIL 계약)', r.code === 1 && r.json.summary.fail >= 1, `exit=${r.code} summary=${JSON.stringify(r.json?.summary)}`);
}
{
  // 7e. .codex-plugin/plugin.json 자체가 없음 = FAIL
  const install = tmpDir('t7e-install'); // 빈 디렉터리
  const r = runDoctor({ cwd: tmpDir('t7e-project'), home: tmpDir('t7e-home'), extraEnv: { DOCTOR_STUB_CODEX_PLUGIN_LIST: codexPluginListFor(install) } });
  const chk = findCheck(r.json, 'MCP_DECL_CODEX');
  ok('7e plugin.json 부재 → FAIL', chk?.status === 'FAIL', JSON.stringify(chk));
}

// ── T8. Codex legacy 전역 sap 중복(그림자) ───────────────────────────────────────────
console.log('\nT8. Codex legacy 전역 sap 등록 감지');
{
  const r = runDoctor({
    cwd: tmpDir('t8-project'),
    home: tmpDir('t8-home'),
    extraEnv: { DOCTOR_STUB_CODEX_MCP_LIST: JSON.stringify([{ name: 'sap', enabled: true }, { name: 'node_repl', enabled: true }]) },
  });
  const chk = findCheck(r.json, 'CODEX_LEGACY_SAP');
  ok('legacy sap 등록 감지 → WARN', chk?.status === 'WARN', JSON.stringify(chk));
  ok('remediation이 자동 제거를 지시하지 않고 수동 확인을 요구한다', (chk?.remediation ?? '').includes('codex mcp remove sap') && (chk?.remediation ?? '').includes('확인'), chk?.remediation);
}
{
  const r = runDoctor({
    cwd: tmpDir('t8b-project'),
    home: tmpDir('t8b-home'),
    extraEnv: { DOCTOR_STUB_CODEX_MCP_LIST: JSON.stringify([{ name: 'node_repl', enabled: true }]) },
  });
  const chk = findCheck(r.json, 'CODEX_LEGACY_SAP');
  ok('legacy sap 없음 → OK', chk?.status === 'OK', JSON.stringify(chk));
}
{
  // 8c. command 없는 오버라이드 전용 항목(disabled_tools 하드차단 레시피) → INFO,
  // "제거" 권고 아님 (v0.5.0 독립 리뷰 M-2 — README 하드차단을 따른 사용자에게
  // doctor가 제거를 안내해 차단이 사라지는 운용 모순의 수리)
  const r = runDoctor({
    cwd: tmpDir('t8c-project'),
    home: tmpDir('t8c-home'),
    extraEnv: {
      DOCTOR_STUB_CODEX_MCP_LIST: JSON.stringify([{ name: 'sap', enabled: true }]),
      DOCTOR_STUB_CODEX_MCP_GET: JSON.stringify({ name: 'sap', enabled: true, disabled_tools: ['GetTableContents', 'GetSqlQuery'] }),
    },
  });
  const chk = findCheck(r.json, 'CODEX_LEGACY_SAP');
  ok('8c 오버라이드 전용(disabled_tools·command 없음) → INFO(제거 대상 아님)', chk?.status === 'INFO' && chk.evidence.includes('오버라이드 전용'), JSON.stringify(chk));
  ok('8c evidence가 제거 대상이 아님을 명시', (chk?.evidence ?? '').includes('제거 대상이 아님'), chk?.evidence);
}
{
  // 8d. command를 가진 진짜 전역 서버 → 기존 WARN(그림자) 유지 + 대체 차단 경고 동봉
  const r = runDoctor({
    cwd: tmpDir('t8d-project'),
    home: tmpDir('t8d-home'),
    extraEnv: {
      DOCTOR_STUB_CODEX_MCP_LIST: JSON.stringify([{ name: 'sap', enabled: true }]),
      DOCTOR_STUB_CODEX_MCP_GET: JSON.stringify({ name: 'sap', enabled: true, command: 'node', args: ['C:/old/launch.cjs'], disabled_tools: ['GetTableContents', 'GetSqlQuery'] }),
    },
  });
  const chk = findCheck(r.json, 'CODEX_LEGACY_SAP');
  ok('8d command 보유 전역 서버 → WARN(그림자)', chk?.status === 'WARN' && chk.evidence.includes('진짜 전역 서버'), JSON.stringify(chk));
  ok('8d remediation이 대체 차단 선행을 요구', (chk?.remediation ?? '').includes('대체 차단'), chk?.remediation);
}

// ── T9. 훅 배선 — 사용자/프로젝트 스코프, marker 활성·죽은 경로·미배선 ─────────────────
console.log('\nT9. SAPKIT 훅 배선 상태(사용자+프로젝트) — marker 활성/죽은 경로/미배선');
{
  const proj = tmpDir('t9-project');
  const home = tmpDir('t9-home');
  const realHook = (name) => path.join(HOOKS_DIR, name).replace(/\\/g, '/');
  const posix = (full) => full.split(path.sep).join('/');

  // 사용자 settings: block-forbidden-tables만 실재 경로로, tier-readonly-guard는 죽은 경로로.
  writeJson(path.join(home, '.claude', 'settings.json'), {
    hooks: {
      PreToolUse: [
        { matcher: 'x', hooks: [{ type: 'command', command: `node "${realHook('block-forbidden-tables.mjs')}"` }] },
        { matcher: 'x', hooks: [{ type: 'command', command: 'node "/no/such/path/tier-readonly-guard.mjs"' }] },
      ],
    },
  });
  // 프로젝트 settings: 훅 전종을 실재 경로로 배선.
  // 분모는 doctor가 세는 marker 수다 — doctor는 **훅 설치기 전부의 합집합**에서
  // marker를 뽑으므로(`hooks/`의 안전훅 6종 번들 + `hooks/continuity/`의 연속성 전용
  // 스위치), 여기서 6을 못박으면 스위치가 하나 늘 때마다 시험이 조용히 틀어진다.
  // 훅이 하위 디렉터리에도 살므로 열거는 재귀다 — `hooks/`만 훑으면 연속성 훅을 놓친다.
  const hookScripts = [];
  const installerScripts = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs')) {
        (entry.name.startsWith('install-') ? installerScripts : hookScripts).push(full);
      }
    }
  })(HOOKS_DIR);
  const MARKERS = [
    ...new Set(
      installerScripts.flatMap((f) =>
        [...fs.readFileSync(f, 'utf8').matchAll(/marker:\s*'([^']+)'/g)].map((m) => m[1]),
      ),
    ),
  ];
  writeJson(path.join(proj, '.claude', 'settings.json'), {
    hooks: {
      PreToolUse: hookScripts.map((f) => ({ matcher: 'x', hooks: [{ type: 'command', command: `node "${posix(f)}"` }] })),
    },
  });

  const r = runDoctor({ cwd: proj, home, stubbed: false });
  const chk = findCheck(r.json, 'HOOK_WIRING');
  ok(`사용자 스코프: 2/${MARKERS.length} 배선 + 죽은 경로 1건 언급`, new RegExp(`사용자: marker 2/${MARKERS.length}`).test(chk?.evidence ?? '') && (chk?.evidence ?? '').includes('죽은 경로 1건'), chk?.evidence);
  ok(`프로젝트 스코프: ${MARKERS.length}/${MARKERS.length} 활성 언급`, chk?.evidence?.includes(`marker ${MARKERS.length}/${MARKERS.length} 활성`), chk?.evidence);
  ok('죽은 경로가 있으면 전체 WARN', chk?.status === 'WARN', JSON.stringify(chk));
  ok('remediation이 재설치/--uninstall을 안내', (chk?.remediation ?? '').includes('--uninstall'), chk?.remediation);
  ok('훅 배선 자체는 FAIL을 내지 않는다(설계상 WARN 상한, 새 FAIL 없음)', chk?.status !== 'FAIL' && onlyBundleFails(r.json), `summary=${JSON.stringify(r.json?.summary)}`);
}
{
  // 미배선(양쪽 다 파일 없음) = INFO, 결함 아님 — v2 기본값(§7-4·D-043).
  const r = runDoctor({ cwd: tmpDir('t9b-project'), home: tmpDir('t9b-home'), stubbed: false });
  const chk = findCheck(r.json, 'HOOK_WIRING');
  ok('훅 전부 미배선 → INFO(정상, 결함 아님)', chk?.status === 'INFO' && chk.evidence.includes('결함 아님'), JSON.stringify(chk));
}

// ── T10. --json 계약 — 4개 필수 필드 + summary/exitCode 정합 ─────────────────────────
console.log('\nT10. --json 출력 계약');
{
  const r = runDoctor({ cwd: tmpDir('t10-project'), home: tmpDir('t10-home'), stubbed: false });
  ok('stdout이 유효 JSON이고 stderr는 비어 있다(사람용 로그가 섞이지 않음)', r.json != null && r.stderr.trim() === '', `stderr=${r.stderr.slice(0, 200)}`);
  const shapeOk = Array.isArray(r.json?.checks) && r.json.checks.every((c) => 'status' in c && 'code' in c && 'evidence' in c && 'remediation' in c);
  ok('각 check가 {status, code, evidence, remediation} 4종을 갖는다', shapeOk, `checks=${r.json?.checks?.length}`);
  const sum = r.json?.summary ?? {};
  const recount = { ok: 0, info: 0, warn: 0, skip: 0, fail: 0 };
  for (const c of r.json?.checks ?? []) recount[c.status.toLowerCase()]++;
  ok('summary 카운트가 checks 배열과 실제로 일치한다', JSON.stringify(sum) === JSON.stringify(recount), `summary=${JSON.stringify(sum)} recount=${JSON.stringify(recount)}`);
  ok('exitCode 필드와 프로세스 exit code가 일치한다', r.json?.exitCode === r.code, `field=${r.json?.exitCode} process=${r.code}`);
  // 종료 코드 계약 그 자체(설계 §9-2·CLAUDE.md 게이트 표): FAIL 1건 이상이면 1, 아니면
  // 0 — 이 불변식은 이 시점 레포의 BUNDLE_INTEGRITY 실제 상태가 어느 쪽이든 성립해야
  // 한다(하드코딩된 0/1 기대값이 아니라 관계 자체를 잰다).
  ok(
    'exitCode = (summary.fail>0 ? 1 : 0) 불변식',
    r.json?.exitCode === (r.json?.summary?.fail > 0 ? 1 : 0),
    `fail=${r.json?.summary?.fail} exitCode=${r.json?.exitCode}`,
  );
}

// ── 마무리 ─────────────────────────────────────────────────────────────────
console.log(`\n총 ${pass + fail}건 · PASS ${pass} · FAIL ${fail}`);
if (fail) {
  console.log('\n❌ doctor.mjs 음성시험 실패.');
  process.exit(1);
}
console.log('✅ doctor.mjs 음성시험 통과 — CLI 부재 SKIP · 파일시스템 검사 실측 · 별칭 미출력 회귀 · wrapper 3분류 · legacy 그림자 · 훅 배선 · exit/JSON 계약.');
