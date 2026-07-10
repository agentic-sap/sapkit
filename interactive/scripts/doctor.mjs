#!/usr/bin/env node
// 3사 하네스(Claude Code/Codex/Antigravity) 어댑터-코어 동기화 점검.
// ① 번들 무결성(verify-engine.mjs 위임 — 로직 재사용, 복제 금지)
// ② adapters/compatibility.json 고정 버전 vs 설치 실측 + 플러그인 설치 여부 (미설치 하네스는 SKIP)
// ③ Claude 훅 배선 경로(.claude/settings*.json)의 command 스크립트 실재 여부
// 전 항목 OK/SKIP → exit 0, FAIL 1건 이상 → exit 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); // interactive/
const REPO_ROOT = path.join(ROOT, '..');

const results = [];
function report(status, label, reason) {
  results.push({ status, label, reason });
  console.log(`[doctor] ${status.padEnd(4)} ${label} — ${reason}`);
}

function lastLine(s) {
  return (s ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
}

// ① 번들 무결성 — verify-engine.mjs를 child_process로 실행해 exit 코드로만 판정
function checkBundleIntegrity() {
  const verifyPath = path.join(ROOT, 'server', 'verify-engine.mjs');
  const r = spawnSync(process.execPath, [verifyPath], { encoding: 'utf8', timeout: 30000 });
  if (r.error) {
    report('FAIL', '① 번들 무결성', `verify-engine.mjs 실행 실패: ${r.error.message}`);
  } else if (r.status === 0) {
    report('OK', '① 번들 무결성', lastLine(r.stdout) || 'verify-engine.mjs exit 0');
  } else {
    report('FAIL', '① 번들 무결성', lastLine(r.stderr) || lastLine(r.stdout) || `verify-engine.mjs exit ${r.status}`);
  }
}

// ② compatibility.json의 3사 고정 버전 vs 설치 실측 + 플러그인 설치 여부
function describeProbeFailure(r) {
  if (r.error?.code === 'ENOENT') return 'PATH에 없음';
  if (r.signal) return `타임아웃/시그널 종료(${r.signal})`;
  if (/not recognized|not found/i.test(r.stderr ?? '')) return 'PATH에 없음';
  if (r.error) return `실행 실패(${r.error.code ?? r.error.message})`;
  return `비정상 종료(exit ${r.status})`;
}

function pluginInstalledNote(cmd) {
  const r = spawnSync(cmd, ['plugin', 'list'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (r.error) return '플러그인 목록 조회 실패';
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return out.includes('sap-agentic-harness') ? '플러그인 설치됨' : '플러그인 미설치';
}

// pinnedVersion === null → 버전 고정 없음(Claude): CLI 존재 + 플러그인 여부만 확인
function checkHarness(label, cmd, pinnedVersion) {
  const probe = spawnSync(cmd, ['--version'], { shell: true, timeout: 30000, encoding: 'utf8' });
  if (probe.error || probe.status !== 0 || probe.signal) {
    report('SKIP', `② ${label}`, `${cmd} ${describeProbeFailure(probe)} — 미설치로 간주`);
    return;
  }
  const installedVersion = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;

  if (pinnedVersion != null) {
    if (!installedVersion) {
      report('FAIL', `② ${label}`, '버전 문자열 파싱 실패 (--version 출력에서 semver 미검출)');
      return;
    }
    if (installedVersion !== pinnedVersion) {
      report('FAIL', `② ${label}`, `설치 ${installedVersion} ≠ 고정 ${pinnedVersion} (compatibility.json 재검증 필요)`);
      return;
    }
  }

  const pluginNote = pluginInstalledNote(cmd);
  const versionNote = pinnedVersion != null ? `버전 ${installedVersion} 고정값과 일치` : `CLI ${installedVersion ?? '버전 미확인'}`;
  report('OK', `② ${label}`, `${versionNote}, ${pluginNote}`);
}

// ③ Claude 훅 배선 경로 실재
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
  const quoted = cmdStr.match(/"([^"]+?\.(?:mjs|cjs|js))"/i);
  if (quoted) return quoted[1];
  const token = cmdStr.split(/\s+/).find((t) => /\.(?:mjs|cjs|js)$/i.test(t.replace(/["']/g, '')));
  return token ? token.replace(/["']/g, '') : null;
}

function checkHookWiring() {
  const files = ['settings.json', 'settings.local.json']
    .map((f) => path.join(REPO_ROOT, '.claude', f))
    .filter((p) => fs.existsSync(p));

  if (!files.length) {
    report('SKIP', '③ Claude 훅 배선', '.claude/settings*.json 없음 — 훅 미배선');
    return;
  }

  const commands = [];
  for (const f of files) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      report('FAIL', '③ Claude 훅 배선', `${path.basename(f)} JSON 파싱 실패: ${e.message}`);
      return;
    }
    if (json.hooks) {
      for (const cmd of collectCommands(json.hooks)) commands.push({ file: path.basename(f), cmd });
    }
  }

  if (!commands.length) {
    report('SKIP', '③ Claude 훅 배선', '설정 파일에 hooks 키 없음 — 훅 미배선');
    return;
  }

  const seen = new Set();
  const missing = [];
  let checked = 0;
  for (const { file, cmd } of commands) {
    const scriptPath = extractScriptPath(cmd);
    if (!scriptPath) {
      missing.push(`${file}: 경로 추출 실패(${cmd.slice(0, 50)})`);
      continue;
    }
    if (seen.has(scriptPath)) continue;
    seen.add(scriptPath);
    checked++;
    if (!fs.existsSync(scriptPath)) missing.push(`${file}: ${scriptPath} 없음`);
  }

  if (missing.length) {
    report('FAIL', '③ Claude 훅 배선', `${missing.length}건 문제 — ${missing.join('; ')}`);
  } else {
    report('OK', '③ Claude 훅 배선', `경로 ${checked}개 전부 실재`);
  }
}

console.log('[doctor] 3사 어댑터-코어 동기화 점검\n');

checkBundleIntegrity();

let compat;
try {
  compat = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters', 'compatibility.json'), 'utf8'));
} catch (e) {
  report('FAIL', '② compatibility.json', `읽기/파싱 실패: ${e.message}`);
  compat = {};
}
checkHarness('Claude Code', 'claude', null);
checkHarness('Codex', 'codex', compat.codex?.version ?? null);
checkHarness('Antigravity', 'agy', compat.antigravity?.agy ?? null);

checkHookWiring();

const okCount = results.filter((r) => r.status === 'OK').length;
const skipCount = results.filter((r) => r.status === 'SKIP').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;
console.log(`\n요약: OK ${okCount} · SKIP ${skipCount} · FAIL ${failCount}`);
console.log(failCount ? '❌ 불일치 발견 — 위 FAIL 항목 확인' : '✅ 전 항목 OK/SKIP — 3사 동기화 이상 없음');
process.exit(failCount ? 1 : 0);
