#!/usr/bin/env node
// 3사 하네스(Claude Code/Codex/Antigravity) 어댑터-코어 동기화 · capability 기반 진단.
// 설계 정본: docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md
//            §9(doctor와 호환성 판정) · §3(현행 진단) · §7-4(훅 정직 표)
//
// v2 변경 요지: Codex는 더 이상 exact `version` 문자열 비교로 판정하지 않는다(호환 가능한
// 새 버전도 FAIL로 오판하던 구 로직 폐기, §9-1). compatibility.json의 codex 항목은
// minimumSupported(null=pre-conformance)·probeCandidates·lastVerified·requiredCapabilities로
// 바뀌었다 — 판정 규칙은 checkCodexCompat() 참조. claude-code/antigravity는 현행 exact-핀
// 로직을 그대로 유지한다(비범위).
//
// §9-2 검사 항목(번들 해시·CLI 존재·Claude 훅 경로이던 기존 3종에 추가):
//   ③ 설치된 플러그인 루트·manifest version(레포 버전과 병기, 불일치는 FAIL이 아니라 WARN)
//   ④ Claude/Codex bundled MCP 선언 실재 + Codex wrapper 배선 상태 3분류
//      (토큰 잔존=미배선 · 캐시와 다른 절대경로=스테일 · 일치=정상)
//   ⑤ 프로젝트 cwd의 runtime dir(.sapkit)·active-profile.txt 해석 결과
//   ⑥ 기대 toolSurface와 그 의미(launch.cjs의 실제 결정 로직을 require해 재사용 — 중복 구현 금지)
//   ⑦ Codex legacy 전역 `sap` MCP 중복(그림자) 감지 — 자동 제거 금지, 경고만
//   ⑧ SAPKIT 훅 배선 상태 — 사용자 `~/.claude/settings.json` + 프로젝트
//      `.claude/settings.json`·`settings.local.json` 양쪽. v2부터 미배선이 기본값이므로
//      미배선=INFO(정상), 죽은 경로만 WARN.
//   ⑨ `sap.env` 존재 여부만(내용·값은 어떤 경로로도 출력하지 않는다)
//
// D-043 소유자 머신 예외(설계 §9-2 마지막): Codex `disabled_tools` 부재·Claude 실데이터
// 2종 allow·훅 미배선을 "결함"으로 보고하지 않는다 — 상태 서술만(코드는 INFO를 쓴다).
//
// 상태 어휘: OK(정상 확인) · INFO(정상이지만 서술이 필요한 상태 — 결함 아님) ·
//           WARN(주의 필요하나 배포를 막지 않음) · SKIP(대상 미설치/미해당) · FAIL(결함).
// 종료 코드: FAIL 1건 이상 → 1, 그 외(OK/INFO/WARN/SKIP만) → 0 (현행 관례 유지).
//
// 로컬 전용(CI 아님 — 3사 CLI에 의존). 비밀은 어떤 출력 경로로도 내지 않는다. 사용자 실환경은
// 읽기만 하고 쓰지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); // interactive/
// "프로젝트" 앵커 = process.cwd() (스크립트 경로 기준 REPO_ROOT가 아니다). launch.cjs
// (runtime-dir/toolSurface 결정)와 install-hooks.mjs(--project 기본값) 둘 다 실제로 이
// 값을 쓴다 — 스크립트 경로 기준으로 대체하면 doctor가 "실제로 MCP가 보는 것"과 다른
// 걸 잴 위험이 있다. 레포 루트에서 통상적으로 실행하는 한(`node interactive/scripts/doctor.mjs`)
// 두 값은 같다.
const PROJECT_DIR = process.cwd();

const JSON_MODE = process.argv.includes('--json');
const require_ = createRequire(import.meta.url);

const results = [];
function report(status, code, label, evidence, remediation = null) {
  results.push({ status, code, label, evidence, remediation });
  if (!JSON_MODE) {
    console.log(`[doctor] ${status.padEnd(4)} ${label} — ${evidence}`);
    if (remediation) console.log(`         ↳ ${remediation}`);
  }
  return status;
}

function lastLine(s) {
  return (s ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
}

// ── ① 번들 무결성 — verify-engine.mjs를 child_process로 실행해 exit 코드로만 판정 ──────
function checkBundleIntegrity() {
  const code = 'BUNDLE_INTEGRITY';
  const label = '① 번들 무결성';
  const verifyPath = path.join(ROOT, 'server', 'verify-engine.mjs');
  const r = spawnSync(process.execPath, [verifyPath], { encoding: 'utf8', timeout: 30000 });
  if (r.error) {
    report('FAIL', code, label, `verify-engine.mjs 실행 실패: ${r.error.message}`);
  } else if (r.status === 0) {
    report('OK', code, label, lastLine(r.stdout) || 'verify-engine.mjs exit 0');
  } else {
    report('FAIL', code, label, lastLine(r.stderr) || lastLine(r.stdout) || `verify-engine.mjs exit ${r.status}`);
  }
}

// ── CLI 존재 프로브 (공통) ────────────────────────────────────────────────────────────
function describeProbeFailure(r) {
  if (r.error?.code === 'ENOENT') return 'PATH에 없음';
  if (r.signal) return `타임아웃/시그널 종료(${r.signal})`;
  if (/not recognized|not found/i.test(r.stderr ?? '')) return 'PATH에 없음';
  if (r.error) return `실행 실패(${r.error.code ?? r.error.message})`;
  return `비정상 종료(exit ${r.status})`;
}

function probeCli(cmd) {
  const r = spawnSync(cmd, ['--version'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (r.error || r.status !== 0 || r.signal) {
    return { installed: false, reason: describeProbeFailure(r) };
  }
  const version = `${r.stdout ?? ''}${r.stderr ?? ''}`.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
  return { installed: true, version };
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

// 구 방식(plain-text substring) — Antigravity 전용으로만 보존한다(비범위, 현행 로직 유지).
function pluginInstalledNote(cmd) {
  const r = spawnSync(cmd, ['plugin', 'list'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (r.error) return '플러그인 목록 조회 실패';
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = out.split('\n').find((l) => l.includes('sapkit'));
  if (!line) return '플러그인 미설치';
  return /not installed/i.test(line) ? '플러그인 미설치' : '플러그인 설치됨';
}

// ── Claude/Codex 설치 실물 조회 (JSON 인터페이스 — §9-2 ③④의 공통 데이터원) ────────────
function queryClaudePlugins() {
  const r = spawnSync('claude', ['plugin', 'list', '--json'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (r.error || r.status !== 0) return { ok: false, entries: [], reason: describeProbeFailure(r) };
  try {
    const all = JSON.parse(r.stdout || '[]');
    return { ok: true, entries: all.filter((p) => typeof p.id === 'string' && p.id.startsWith('sapkit@')) };
  } catch (e) {
    return { ok: false, entries: [], reason: `JSON 파싱 실패: ${e.message}` };
  }
}

function queryCodexPlugins() {
  const r = spawnSync('codex', ['plugin', 'list', '--json', '--available'], {
    shell: true,
    timeout: 30000,
    encoding: 'utf8',
  });
  if (r.error || r.status !== 0) return { ok: false, entries: [], reason: describeProbeFailure(r) };
  try {
    const parsed = JSON.parse(r.stdout || '{}');
    const all = [...(parsed.installed ?? []), ...(parsed.available ?? [])];
    return { ok: true, entries: all.filter((p) => typeof p.pluginId === 'string' && p.pluginId.startsWith('sapkit@')) };
  } catch (e) {
    return { ok: false, entries: [], reason: `JSON 파싱 실패: ${e.message}` };
  }
}

function normalizeClaudePlugins(entries) {
  return entries.map((p) => ({
    id: p.id,
    version: p.version,
    enabled: p.enabled,
    path: p.installPath ?? null,
    scope: p.scope ?? null,
    marketplace: null,
    installed: true, // claude plugin list --json은 설치된 것만 열거
  }));
}

function normalizeCodexPlugins(entries) {
  return entries.map((p) => ({
    id: p.pluginId,
    version: p.version,
    enabled: p.enabled,
    path: p.source?.path ?? null,
    scope: null,
    marketplace: p.marketplaceName ?? null,
    installed: Boolean(p.installed),
  }));
}

function describePluginNote(entries) {
  const installedOnes = entries.filter((p) => p.installed !== false);
  if (!installedOnes.length) return '플러그인 미설치';
  const p = installedOnes[0];
  const bits = [`v${p.version}`, `enabled=${p.enabled}`];
  if (p.scope) bits.push(`scope=${p.scope}`);
  if (p.marketplace) bits.push(`marketplace=${p.marketplace}`);
  const extra = installedOnes.length > 1 ? ` 외 ${installedOnes.length - 1}개` : '';
  return `플러그인 설치됨(${bits.join(', ')})${extra}`;
}

// ── ② 클라이언트 호환성 판정 ──────────────────────────────────────────────────────────
function checkClaudeCompat(probe, plugins) {
  const code = 'CLIENT_COMPAT_CLAUDE';
  const label = '② Claude Code 호환성';
  if (!probe.installed) {
    report('SKIP', code, label, `claude ${probe.reason} — 미설치로 간주`);
    return;
  }
  report('OK', code, label, `CLI ${probe.version ?? '버전 미확인'}, ${describePluginNote(plugins)}`);
}

// codex 판정 규칙(설계 §9-1): CLI 미설치→SKIP · minimumSupported===null(pre-conformance)→
// 어떤 버전도 PASS로 부르지 않고 WARN(미검증, 설치 실물 검사는 ③④⑦이 이어서 수행) ·
// 이후 minimumSupported가 채워지면: 미만→FAIL, lastVerified 포함→OK(=PASS), 이상+미검증→WARN.
function checkCodexCompat(probe, plugins, codexCompat) {
  const code = 'CLIENT_COMPAT_CODEX';
  const label = '② Codex 호환성';
  if (!probe.installed) {
    report('SKIP', code, label, `codex ${probe.reason} — 미설치로 간주`);
    return;
  }
  const pluginNote = describePluginNote(plugins);
  if (!probe.version) {
    report('WARN', code, label, `버전 문자열 파싱 실패(--version 출력에서 semver 미검출), ${pluginNote}`);
    return;
  }
  const installed = probe.version;
  const min = codexCompat?.minimumSupported ?? null;
  const lastVerified = Array.isArray(codexCompat?.lastVerified) ? codexCompat.lastVerified : [];
  const caps = Array.isArray(codexCompat?.requiredCapabilities) ? codexCompat.requiredCapabilities : [];

  if (min === null) {
    report(
      'WARN',
      code,
      label,
      `pre-conformance(minimumSupported 미확정) — 설치 ${installed}는 어떤 버전도 PASS로 부르지 않음 · requiredCapabilities=[${caps.join(', ')}] · ${pluginNote}`,
      'P0 capability probe(설계 §13) 완료 후 minimumSupported/lastVerified를 채우면 이 WARN이 FAIL/OK/WARN으로 갈린다. 아래 ③④⑦이 설치 실물을 이어서 검사한다.',
    );
    return;
  }
  if (compareSemver(installed, min) < 0) {
    report('FAIL', code, label, `설치 ${installed} < 최소지원 ${min}`, 'Codex CLI를 업그레이드하십시오.');
    return;
  }
  if (lastVerified.includes(installed)) {
    report('OK', code, label, `설치 ${installed}는 검증된 버전(lastVerified 포함) — ${pluginNote}`);
    return;
  }
  report(
    'WARN',
    code,
    label,
    `설치 ${installed} ≥ 최소지원 ${min}이나 미검증(lastVerified 미포함) — ${pluginNote}`,
    'requiredCapabilities probe 재실행 후 lastVerified 갱신을 검토하십시오.',
  );
}

function checkAntigravityCompat(probe, agyCompat) {
  const code = 'CLIENT_COMPAT_AGY';
  const label = '② Antigravity 호환성';
  if (!probe.installed) {
    report('SKIP', code, label, `agy ${probe.reason} — 미설치로 간주`);
    return;
  }
  const pinned = agyCompat?.agy ?? null;
  if (pinned != null) {
    if (!probe.version) {
      report('FAIL', code, label, '버전 문자열 파싱 실패 (--version 출력에서 semver 미검출)');
      return;
    }
    if (probe.version !== pinned) {
      report('FAIL', code, label, `설치 ${probe.version} ≠ 고정 ${pinned} (compatibility.json 재검증 필요)`);
      return;
    }
  }
  report('OK', code, label, `버전 ${probe.version ?? '미확인'} 고정값과 일치, ${pluginInstalledNote('agy')}`);
}

// ── ③ 설치된 플러그인 루트·manifest version (레포 버전과 병기) ────────────────────────
function checkInstalledPluginVersions(clientLabel, code, query, normalized, repoVersion) {
  const label = `③ ${clientLabel} 설치본 버전`;
  if (!query.ok) {
    report('SKIP', code, label, `설치 목록 조회 실패: ${query.reason}`);
    return;
  }
  const installedOnes = normalized.filter((p) => p.installed !== false);
  if (!installedOnes.length) {
    report('SKIP', code, label, '설치된 sapkit 플러그인 없음');
    return;
  }
  if (repoVersion == null) {
    report('WARN', code, label, `레포 버전 미확인 — 설치본만 보고: ${installedOnes.map((p) => `${p.path}→v${p.version}`).join('; ')}`);
    return;
  }
  for (const p of installedOnes) {
    const where = p.path ?? '(경로 미확인)';
    if (p.version === repoVersion) {
      report('OK', code, label, `${where} → v${p.version} (레포 v${repoVersion}과 일치)`);
    } else {
      report(
        'WARN',
        code,
        label,
        `${where} → v${p.version} ≠ 레포 v${repoVersion}`,
        clientLabel === 'Claude'
          ? '`claude plugin update sapkit@<marketplace>` 후 재시작/리로드.'
          : '`codex plugin add sapkit@<marketplace>` 재실행이 버전을 교체하는지 확인(설계 §11-2, 재add=update 실측 전).',
      );
    }
  }
}

// ── ④ bundled MCP 선언 실재 + Codex wrapper 배선 상태 3분류 ───────────────────────────
function checkClaudeMcpDeclaration(normalizedClaude) {
  const code = 'MCP_DECL_CLAUDE';
  const label = '④ Claude bundled MCP 선언';
  const installed = normalizedClaude.filter((p) => p.installed !== false && p.path);
  const target = installed[0] ? path.join(installed[0].path, '.mcp.json') : path.join(ROOT, '.mcp.json');
  const sourceNote = installed[0] ? '설치본' : '레포 소스(미설치 또는 개발 모드)';
  if (!fs.existsSync(target)) {
    report('FAIL', code, label, `${target} 없음 (${sourceNote})`);
    return;
  }
  try {
    const mcp = JSON.parse(fs.readFileSync(target, 'utf8'));
    const args = mcp?.mcpServers?.sap?.args ?? [];
    const hasLauncher = Array.isArray(args) && args.some((a) => typeof a === 'string' && a.includes('launch.cjs'));
    if (hasLauncher) report('OK', code, label, `${target} (${sourceNote}) → mcpServers.sap이 launch.cjs를 가리킴`);
    else report('FAIL', code, label, `${target} (${sourceNote}) → mcpServers.sap.args에 launch.cjs 없음`);
  } catch (e) {
    report('FAIL', code, label, `${target} (${sourceNote}) 파싱 실패: ${e.message}`);
  }
}

function normSlash(s) {
  return String(s).replace(/\\/g, '/');
}

function checkCodexMcpWiring(normalizedCodex) {
  const code = 'MCP_DECL_CODEX';
  const label = '④ Codex bundled MCP 배선';
  const installed = normalizedCodex.filter((p) => p.installed && p.path);
  if (!installed.length) {
    report('SKIP', code, label, 'Codex sapkit 플러그인 미설치(또는 경로 미확인) — 검사 대상 없음');
    return;
  }
  const wireScriptExists = fs.existsSync(path.join(ROOT, 'scripts', 'codex-wire-mcp.mjs'));
  const applyHint = wireScriptExists
    ? 'node interactive/scripts/codex-wire-mcp.mjs apply 실행.'
    : '(codex-wire-mcp.mjs가 아직 레포에 없음 — P1 패키징 대기, 수동 배선 필요)';

  for (const p of installed) {
    const pluginJsonPath = path.join(p.path, '.codex-plugin', 'plugin.json');
    if (!fs.existsSync(pluginJsonPath)) {
      report('FAIL', code, label, `${pluginJsonPath} 없음`);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    } catch (e) {
      report('FAIL', code, label, `${pluginJsonPath} 파싱 실패: ${e.message}`);
      continue;
    }
    const mcpRel = manifest.mcpServers;
    if (!mcpRel || typeof mcpRel !== 'string') {
      report(
        'INFO',
        code,
        label,
        `${p.path} → plugin.json에 mcpServers 필드 없음 — bundled MCP 미패키징(P1 미착수), 수동 등록 경로 유효(adapters/codex/README.md)`,
      );
      continue;
    }
    const wrapperPath = path.join(p.path, mcpRel.replace(/^\.\//, ''));
    if (!fs.existsSync(wrapperPath)) {
      report('FAIL', code, label, `${p.path} → mcpServers=${mcpRel} 이나 파일 없음(${wrapperPath})`);
      continue;
    }
    let wrapper;
    try {
      wrapper = JSON.parse(fs.readFileSync(wrapperPath, 'utf8'));
    } catch (e) {
      report('FAIL', code, label, `${wrapperPath} 파싱 실패: ${e.message}`);
      continue;
    }
    // 원문 문자열을 개별 정규화한 뒤 합친다 — JSON.stringify로 먼저 뭉치면 Windows
    // 경로의 백슬래시가 `\\`로 이스케이프되고, 그 뒤 normSlash가 그 두 글자를 각각
    // `/`로 바꿔 `//`가 돼 버려 원래 경로(단일 `/`)와 영영 일치하지 않는 결함이 있었다.
    // 생성물 wrapper는 **서버 맵 직접형** `{ "sap": {...} }`이다(gen-plugin-manifests —
    // 주석 키조차 가짜 서버가 되므로 없음). 구형 `{ "mcpServers": { "sap": ... } }`도
    // 방어적으로 수용한다(v0.5.0 독립 리뷰 M-1 — 직접형을 못 읽어 정상 배선을 스테일로
    // 오진하던 결함의 수리).
    const sapDef = wrapper?.sap ?? wrapper?.mcpServers?.sap;
    const rawArgs = Array.isArray(sapDef?.args) ? sapDef.args : [];
    const argsStr = rawArgs.filter((a) => typeof a === 'string').map(normSlash).join(' | ');
    if (argsStr.includes('{{SAPKIT_PLUGIN_ROOT}}')) {
      report('WARN', code, label, `${wrapperPath} → 토큰 미치환({{SAPKIT_PLUGIN_ROOT}} 잔존) = 미배선`, applyHint);
      continue;
    }
    const rootNorm = normSlash(p.path);
    if (argsStr.includes(rootNorm)) {
      report('OK', code, label, `${wrapperPath} → 절대경로가 현재 설치 루트와 일치 = 정상`);
    } else {
      report(
        'WARN',
        code,
        label,
        `${wrapperPath} → 절대경로가 현재 설치 루트(${p.path})와 불일치 = 스테일`,
        `업데이트 후 캐시 경로가 바뀐 것으로 보임 — ${applyHint}`,
      );
    }
  }
}

// ── ⑤⑥⑨의 공통 기반: launch.cjs를 require해 실제 결정 로직을 재사용(중복 구현 금지) ──
function loadLaunchModule() {
  try {
    return require_(path.join(ROOT, 'server', 'launch.cjs'));
  } catch {
    return null;
  }
}

// launch.cjs의 selectRuntimeDir()은 내부적으로 resolveHome()/candidateFrom()을 거치며
// warnOnce()로 console.error에 진단을 직접 쓴다 — 그중 PROFILE_NOT_FOUND 변형은
// 프로파일 **별칭을 메시지에 그대로 삽입**한다(launch.cjs는
// 수정 금지 대상). doctor는 별칭을 어떤 경로로도 출력하지 않는다는 원칙(⑤의 "경로·별칭은
// 비밀 취급")을 지키려면, 이 한 호출 동안만 stderr를 무음 처리하고 반환값(별칭이 섞이지
// 않은 구조체)만 쓴다. decideExposition()은 자체 console.error가 없어(순수 함수) 별도
// 처리가 필요 없다.
function withSilencedStderr(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

function resolvePicked(launchMod) {
  if (!launchMod) return { runtimeDir: null, envPath: null, invalid: false, loadFailed: true };
  const raw = withSilencedStderr(() => launchMod.selectRuntimeDir(PROJECT_DIR));
  const invalid = typeof raw.envPath === 'symbol'; // ENV_INVALID sentinel (not exported — 구조로 판별)
  return {
    runtimeDir: invalid ? null : raw.runtimeDir,
    envPath: invalid ? null : raw.envPath,
    invalid,
    loadFailed: false,
  };
}

// ── ⑤ 프로젝트 runtime dir · active-profile.txt 해석 결과 ─────────────────────────────
function checkRuntimeDir(picked) {
  const code = 'RUNTIME_DIR';
  const label = '⑤ 프로젝트 runtime dir · active-profile';
  if (picked.loadFailed) {
    report('SKIP', code, label, 'launch.cjs 로드 실패로 건너뜀');
    return;
  }
  if (picked.invalid) {
    report(
      'WARN',
      code,
      label,
      'SAPKIT_HOME_DIR가 존재하지 않는 경로를 가리켜 연결이 fail-closed됨',
      'SAPKIT_HOME_DIR 환경변수를 점검하십시오(오탈자 또는 이동된 경로).',
    );
    return;
  }
  if (!picked.runtimeDir) {
    report(
      'INFO',
      code,
      label,
      `${PROJECT_DIR} 아래 연결 가능한 .sapkit runtime dir 없음 — inspection-only(정상 기본값)`,
    );
    return;
  }
  const gen = path.basename(picked.runtimeDir);
  const hasPointer = fs.existsSync(path.join(picked.runtimeDir, 'active-profile.txt'));
  report(
    'OK',
    code,
    label,
    `세대=${gen} · active-profile.txt=${hasPointer ? '존재' : '부재'} · sap.env 해석=${picked.envPath ? '성공' : '실패'} (경로·별칭은 비밀 취급 — 미출력)`,
  );
}

// ── ⑥ 기대 toolSurface와 그 의미 — launch.cjs의 실제 decideExposition()을 그대로 호출 ──
function checkToolSurface(launchMod, picked) {
  const code = 'TOOL_SURFACE';
  const label = '⑥ toolSurface 기대값';
  if (!launchMod || picked.loadFailed) {
    report('SKIP', code, label, 'launch.cjs 로드 실패로 건너뜀');
    return;
  }
  let decided;
  try {
    decided = launchMod.decideExposition({
      args: [],
      cwd: PROJECT_DIR,
      selectedDir: picked.runtimeDir,
      envPath: picked.envPath,
    });
  } catch (e) {
    report('WARN', code, label, `결정 로직 호출 실패: ${e.message}`);
    return;
  }
  const surfaceState = decided.surface.state === 'set' ? decided.surface.value : decided.surface.state;
  const notice = decided.notices[0] ?? null;
  const evidence = `설정=${surfaceState} → 예상 exposition=${decided.exposition}${notice ? ` · ${notice.code}` : ''}`;

  if (!notice) {
    report('OK', code, label, evidence);
    return;
  }
  if (notice.code === 'TOOLSURFACE_DEFAULT') {
    report('INFO', code, label, evidence);
    return;
  }
  // TOOLSURFACE_FAIL_CLOSED(development인데 SAP_TIER≠DEV 등) · UNKNOWN · UNREADABLE
  report('WARN', code, label, evidence, notice.message);
}

// ── ⑦ Codex legacy 전역 `sap` MCP 중복(그림자) 감지 ───────────────────────────────────
function checkCodexLegacyShadow(codexProbe) {
  const code = 'CODEX_LEGACY_SAP';
  const label = '⑦ Codex legacy 전역 sap 중복';
  if (!codexProbe.installed) {
    report('SKIP', code, label, `codex ${codexProbe.reason} — 미설치로 간주`);
    return;
  }
  const r = spawnSync('codex', ['mcp', 'list', '--json'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    report('SKIP', code, label, `codex mcp list --json 실행 실패 — 확인 불가(${describeProbeFailure(r)})`);
    return;
  }
  let entries;
  try {
    entries = JSON.parse(r.stdout || '[]');
  } catch (e) {
    report('SKIP', code, label, `codex mcp list --json 파싱 실패: ${e.message}`);
    return;
  }
  const legacy = Array.isArray(entries) ? entries.find((e) => e.name === 'sap') : null;
  if (!legacy) {
    report('OK', code, label, '전역 [mcp_servers.sap] 등록 없음 — plugin-bundled sap과 충돌 없음');
    return;
  }
  // 전역 항목에는 두 부류가 있다(v0.5.0 독립 리뷰 M-2): ⓐ command를 가진 진짜 전역
  // 서버(bundled를 그림자로 가림 — 제거 후보) ⓑ command 없이 disabled_tools 등만 둔
  // 오버라이드 전용 항목(실데이터 하드차단 레시피 — adapters/codex/README.md). ⓑ에
  // "제거하라"고 안내하면 하드차단이 사라지므로 두 부류를 구분해 보고한다.
  // command 유무는 `codex mcp get sap --json`에서 읽고, 실패하면 판정 불가로 보수 처리.
  let hasCommand = null; // true | false | null(판정 불가)
  let hasHardBlock = false;
  const g = spawnSync('codex', ['mcp', 'get', 'sap', '--json'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (!g.error && g.status === 0) {
    try {
      const detail = JSON.parse(g.stdout || '{}');
      const flat = JSON.stringify(detail);
      hasCommand = /"command"\s*:\s*"[^"]+"/.test(flat);
      hasHardBlock = flat.includes('GetTableContents') && flat.includes('GetSqlQuery') && flat.includes('disabled_tools');
    } catch {
      /* 판정 불가 — null 유지 */
    }
  }
  if (hasCommand === false && hasHardBlock) {
    report(
      'INFO',
      code,
      label,
      '전역 [mcp_servers.sap] 항목이 있으나 command 없는 오버라이드 전용(disabled_tools 실데이터 하드차단)으로 보임 — 제거 대상이 아님',
      '이 오버라이드가 bundled 서버에 병합 적용되는지는 미실측(README "실데이터 2종 하드 차단" 절) — `codex mcp get sap --json`으로 적용 여부를 확인하고, 제거하려면 대체 차단을 먼저 마련하십시오.',
    );
    return;
  }
  report(
    'WARN',
    code,
    label,
    `전역 [mcp_servers.sap] 등록이 존재(enabled=${legacy.enabled}${hasCommand === null ? ' · command 유무 판정 불가' : hasCommand ? ' · command 보유 = 진짜 전역 서버' : ''}) — plugin-bundled sap을 조용히 가릴 수 있음(동시 기동 아님, 그림자)`,
    '제거는 `codex mcp remove sap` — 사용자 확인 후에만. 그 항목에 disabled_tools 실데이터 하드차단이 있다면 제거 전에 대체 차단을 먼저 마련하십시오(자동 제거 금지).',
  );
}

// ── ⑧ SAPKIT 훅 배선 상태 — 사용자 + 프로젝트(양쪽) ────────────────────────────────────
function collectCommands(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectCommands(item, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'command' && typeof v === 'string') out.push(v);
      else collectCommands(v, out);
    }
  }
  return out;
}

function extractScriptPath(cmdStr) {
  const quoted = cmdStr.match(/"([^"]+?\.(?:mjs|cjs|js|py))"/i);
  if (quoted) return quoted[1];
  const token = cmdStr.split(/\s+/).find((t) => /\.(?:mjs|cjs|js|py)$/i.test(t.replace(/["']/g, '')));
  return token ? token.replace(/["']/g, '') : null;
}

function sapkitHookMarkers() {
  const installerPath = path.join(ROOT, 'adapters', 'claude', 'hooks', 'install-hooks.mjs');
  if (!fs.existsSync(installerPath)) return [];
  const src = fs.readFileSync(installerPath, 'utf8');
  return [...src.matchAll(/marker:\s*'([^']+)'/g)].map((m) => m[1]);
}

function scanSettingsFile(filePath, markers) {
  if (!fs.existsSync(filePath)) return { exists: false };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { exists: true, parseError: e.message };
  }
  const commands = json.hooks ? collectCommands(json.hooks) : [];
  const found = new Map();
  for (const cmd of commands) {
    for (const marker of markers) {
      if (found.has(marker) || !cmd.includes(marker)) continue;
      const scriptPath = extractScriptPath(cmd) ?? cmd;
      const resolved = scriptPath.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, PROJECT_DIR);
      found.set(marker, { resolved, exists: fs.existsSync(resolved) });
    }
  }
  return { exists: true, found };
}

function checkHookWiring() {
  const code = 'HOOK_WIRING';
  const label = '⑧ SAPKIT 훅 배선';
  const markers = sapkitHookMarkers();
  if (!markers.length) {
    report('SKIP', code, label, 'install-hooks.mjs를 찾지 못해 marker 목록을 확정할 수 없음');
    return;
  }

  const scopes = [
    { name: '사용자', file: path.join(os.homedir(), '.claude', 'settings.json') },
    { name: '프로젝트', file: path.join(PROJECT_DIR, '.claude', 'settings.json') },
    { name: '프로젝트(local)', file: path.join(PROJECT_DIR, '.claude', 'settings.local.json') },
  ];

  let anyParseError = false;
  let anyDead = false;
  let anyActive = false;
  const notes = [];
  for (const scope of scopes) {
    const scan = scanSettingsFile(scope.file, markers);
    if (!scan.exists) {
      notes.push(`${scope.name}: 파일 없음`);
      continue;
    }
    if (scan.parseError) {
      anyParseError = true;
      notes.push(`${scope.name}: JSON 파싱 실패(${scan.parseError})`);
      continue;
    }
    if (scan.found.size === 0) {
      notes.push(`${scope.name}: marker 0/${markers.length}(미배선)`);
      continue;
    }
    anyActive = true;
    const dead = [...scan.found.entries()].filter(([, v]) => !v.exists);
    if (dead.length) {
      anyDead = true;
      notes.push(`${scope.name}: marker ${scan.found.size}/${markers.length} 배선, 죽은 경로 ${dead.length}건(${dead.map(([m]) => m).join(', ')})`);
    } else {
      notes.push(`${scope.name}: marker ${scan.found.size}/${markers.length} 활성`);
    }
  }

  const evidence = notes.join(' · ');
  if (anyParseError) {
    report('WARN', code, label, evidence, '설정 파일 JSON을 점검하십시오.');
    return;
  }
  if (anyDead) {
    report('WARN', code, label, evidence, '죽은 경로 — install-hooks.mjs로 재설치하거나 --uninstall로 제거하십시오.');
    return;
  }
  if (!anyActive) {
    report('INFO', code, label, `${evidence} — v2 기본값(훅 미배선)과 일치, 결함 아님(설계 §7-4·D-043)`);
    return;
  }
  report('OK', code, label, evidence);
}

// ── ⑨ sap.env 존재 여부만(내용·값은 어떤 경로로도 출력하지 않는다) ─────────────────────
function checkSapEnvPresence(picked) {
  const code = 'SAP_ENV_PRESENCE';
  const label = '⑨ sap.env 존재';
  if (picked.loadFailed) {
    report('SKIP', code, label, 'launch.cjs 로드 실패로 건너뜀');
    return;
  }
  report(
    picked.envPath ? 'OK' : 'INFO',
    code,
    label,
    `sap.env 해석 결과=${picked.envPath ? '존재' : '부재'} (내용·값은 출력하지 않음)`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════════════════════
if (!JSON_MODE) console.log('[doctor] 3사 어댑터-코어 동기화 · capability 진단\n');

checkBundleIntegrity(); // ①

let compat;
try {
  compat = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters', 'compatibility.json'), 'utf8'));
} catch (e) {
  report('FAIL', 'COMPAT_JSON_LOAD', '② compatibility.json', `읽기/파싱 실패: ${e.message}`);
  compat = {};
}

let repoVersion = null;
try {
  repoVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin-metadata.json'), 'utf8')).version ?? null;
} catch {
  // 아래 ③에서 client별로 WARN 처리
}

const claudeProbe = probeCli('claude');
const codexProbe = probeCli('codex');
const agyProbe = probeCli('agy');

const claudeQuery = claudeProbe.installed ? queryClaudePlugins() : { ok: false, entries: [], reason: '미설치' };
const codexQuery = codexProbe.installed ? queryCodexPlugins() : { ok: false, entries: [], reason: '미설치' };
const normalizedClaude = normalizeClaudePlugins(claudeQuery.entries);
const normalizedCodex = normalizeCodexPlugins(codexQuery.entries);

checkClaudeCompat(claudeProbe, normalizedClaude); // ②
checkCodexCompat(codexProbe, normalizedCodex, compat.codex); // ②
checkAntigravityCompat(agyProbe, compat.antigravity); // ②

checkInstalledPluginVersions('Claude', 'PLUGIN_ROOT_CLAUDE', claudeQuery, normalizedClaude, repoVersion); // ③
checkInstalledPluginVersions('Codex', 'PLUGIN_ROOT_CODEX', codexQuery, normalizedCodex, repoVersion); // ③

checkClaudeMcpDeclaration(normalizedClaude); // ④
checkCodexMcpWiring(normalizedCodex); // ④

const launchMod = loadLaunchModule();
const picked = resolvePicked(launchMod);
checkRuntimeDir(picked); // ⑤
checkToolSurface(launchMod, picked); // ⑥

checkCodexLegacyShadow(codexProbe); // ⑦

checkHookWiring(); // ⑧

checkSapEnvPresence(picked); // ⑨

const summary = {
  ok: results.filter((r) => r.status === 'OK').length,
  info: results.filter((r) => r.status === 'INFO').length,
  warn: results.filter((r) => r.status === 'WARN').length,
  skip: results.filter((r) => r.status === 'SKIP').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
};
const exitCode = summary.fail ? 1 : 0;

if (JSON_MODE) {
  console.log(
    JSON.stringify(
      { generatedAt: new Date().toISOString(), checks: results, summary, exitCode },
      null,
      2,
    ),
  );
} else {
  console.log(`\n요약: OK ${summary.ok} · INFO ${summary.info} · WARN ${summary.warn} · SKIP ${summary.skip} · FAIL ${summary.fail}`);
  console.log(
    exitCode
      ? '❌ FAIL 발견 — 위 FAIL 항목 확인'
      : summary.warn
        ? '✅ FAIL 없음(WARN 있음) — 배포는 막지 않으나 위 WARN 항목을 검토하십시오'
        : '✅ 전 항목 OK/INFO/SKIP — 3사 동기화 이상 없음',
  );
}
process.exit(exitCode);
