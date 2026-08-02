#!/usr/bin/env node
// test-hook-switch.mjs — 훅 **스위치**(설치/제거) 왕복 시험.
// 설계 정본: docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md
//            §7-4(훅 = 기본 미설치 + 스위치 보존 · R-SWITCH) · §14-1("훅 스위치 왕복") ·
//            §14-3(출시 불가 조건: "훅 스위치가 손상된 채 출시됨")
//
// ───────────────────────────── 무엇을 지키는가 ──────────────────────────────
// v2에서 훅은 기본 미설치가 된다. 그 결정을 사용자가 받아들인 전제는 **"설정으로
// 껐다 다시 켤 수 있다"**였다(R-SWITCH). 그러니 되돌릴 길 자체가 곧 안전 기능이고,
// 그 길이 조용히 썩으면 훅 기본값을 내린 근거가 무너진다. 이 시험이 고정하는 것:
//
//   D1 설치 → marker 탐지 → `--uninstall` → **원상복구(byte 대조)** 가 2회 멱등
//   D2 설치가 **남의 훅·남의 설정 키를 보존**한다 (미리 심어둔 가짜 항목 무손상)
//   D3 설치기가 시험 밖(= 사용자 실제 `~/.claude/settings.json`)을 건드리지 않는다
//
// ─────────────────────────────── 격리 ──────────────────────────────────────
// · D1·D2는 `--project <tmp>`로 임시 프로젝트 settings만 만진다.
// · 모든 자식은 임시 HOME/USERPROFILE을 받는다 — 설치기의 `resolveHookScript()`가
//   `~/.claude/plugins/marketplaces/...`를 먼저 보므로, 실 HOME이면 소유자 머신에서만
//   달라지는 command 문자열이 나온다(= 머신 의존 시험). 임시 HOME이면 항상 레포
//   경로로 폴백해 결정적이다.
// · D3는 사용자 실제 settings.json의 **해시만** 전후 대조한다(내용은 읽어도 출력하지
//   않는다). 없으면 "없음 유지"를 단언한다.
//
// 사용: node interactive/scripts/test-hook-switch.mjs [--verbose]
// exit 0 통과 / 1 실패

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const HOOKS_DIR = path.join(INTERACTIVE, 'adapters', 'claude', 'hooks');
const INSTALLER = path.join(HOOKS_DIR, 'install-hooks.mjs');

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

if (!fs.existsSync(INSTALLER)) {
  console.error(`❌ 설치기 부재: ${INSTALLER}`);
  process.exit(1);
}

// ── 임시 세계 ───────────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-hookswitch-'));
const FAKE_HOME = path.join(ROOT, 'home');
fs.mkdirSync(FAKE_HOME, { recursive: true });
process.on('exit', () => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* OS에 맡긴다 */
  }
});

function runInstaller(args, { home = FAKE_HOME } = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    return { code: 0, out: execFileSync(process.execPath, [INSTALLER, ...args], { encoding: 'utf8', env }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const readBytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);

// ── 설치기가 다루는 marker 목록 (설치기 원문에서 파생 + 실물 파일과 교차 확인) ──
// 하드코딩하면 훅이 늘거나 이름이 바뀔 때 시험이 조용히 좁아진다.
const installerSrc = fs.readFileSync(INSTALLER, 'utf8');
const MARKERS = [...installerSrc.matchAll(/marker:\s*'([^']+)'/g)].map((m) => m[1]);
const HOOK_FILES = fs
  .readdirSync(HOOKS_DIR)
  .filter((f) => f.endsWith('.mjs') && f !== 'install-hooks.mjs')
  .sort();

console.log('훅 스위치 왕복 시험 (설계 §7-4 · §14-1)\n');
console.log('전제');
ok(
  '설치기의 marker 목록이 실물 훅 파일 집합과 일치한다',
  MARKERS.length > 0 && JSON.stringify([...MARKERS].sort()) === JSON.stringify(HOOK_FILES),
  `installer markers=${MARKERS.length} [${[...MARKERS].sort().join(', ')}] · 파일=${HOOK_FILES.length} [${HOOK_FILES.join(', ')}]`,
);

// ── fixture: 남의 훅 + 남의 설정 키가 이미 있는 프로젝트 settings ────────────
// 직렬화 규칙을 설치기(`JSON.stringify(obj, null, 2) + '\n'`)와 맞춰 심는다.
// 그래야 "왕복 후 byte 동일"이 형식 차이가 아닌 **의미 보존**을 재는 단언이 된다.
const FOREIGN = () => ({
  $schema: 'https://example.invalid/settings.json',
  permissions: { allow: ['Read(*)'], deny: ['Bash(rm:*)'] },
  env: { FOREIGN_FLAG: '1' },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "/opt/foreign/pre.mjs"' }] }],
    PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'node "/opt/foreign/post.mjs"' }] }],
    PostToolUseFailure: [{ matcher: '.*', hooks: [{ type: 'command', command: 'node "/opt/foreign/fail.mjs"' }] }],
  },
});

function makeProject(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  const settings = path.join(dir, '.claude', 'settings.json');
  fs.writeFileSync(settings, `${JSON.stringify(FOREIGN(), null, 2)}\n`, 'utf8');
  return { dir, settings };
}

const markersPresent = (text) => MARKERS.filter((m) => text.includes(m));

// ── D1. 설치 → 탐지 → 제거 왕복이 byte 원상복구 · 2회 멱등 ──────────────────
console.log('\nD1. 설치 → marker 탐지 → --uninstall 원상복구 (2회 멱등)');
{
  const { dir, settings } = makeProject('d1');
  const baseline = readBytes(settings);
  let roundtripOk = true;
  const notes = [];

  for (const cycle of [1, 2]) {
    const inst = runInstaller(['--project', dir]);
    if (inst.code !== 0) {
      roundtripOk = false;
      notes.push(`cycle${cycle} 설치 exit ${inst.code}: ${inst.out.split('\n')[0]}`);
      break;
    }
    const afterInstall = fs.readFileSync(settings, 'utf8');
    const found = markersPresent(afterInstall);
    if (found.length !== MARKERS.length) {
      roundtripOk = false;
      notes.push(`cycle${cycle} marker ${found.length}/${MARKERS.length}만 탐지`);
    }

    // 같은 설치를 한 번 더 → 두 번째 실행의 diff 0 (설계 R-IDEMPOTENT)
    runInstaller(['--project', dir]);
    const afterInstallTwice = fs.readFileSync(settings, 'utf8');
    if (afterInstallTwice !== afterInstall) {
      roundtripOk = false;
      notes.push(`cycle${cycle} 재설치가 파일을 바꿈 (${sha(afterInstall)} → ${sha(afterInstallTwice)})`);
    }

    const un = runInstaller(['--project', dir, '--uninstall']);
    if (un.code !== 0) {
      roundtripOk = false;
      notes.push(`cycle${cycle} 제거 exit ${un.code}`);
      break;
    }
    const restored = readBytes(settings);
    if (!restored || !restored.equals(baseline)) {
      roundtripOk = false;
      notes.push(`cycle${cycle} 원상복구 실패 (baseline ${sha(baseline)} → ${restored ? sha(restored) : 'absent'})`);
    }
  }
  ok('설치→제거 2회 왕복이 byte 원상복구 · 재설치 diff 0', roundtripOk,
    notes.length ? notes.join(' · ') : `baseline sha=${sha(baseline)} · marker ${MARKERS.length}종 · 2 cycle 모두 복구`);

  // 제거가 실제로 markers를 없앴는지(빈 파일 비교로만 통과하는 것을 막는다)
  const finalText = fs.readFileSync(settings, 'utf8');
  ok('제거 후 SAPKit marker 0건', markersPresent(finalText).length === 0,
    `잔여 marker: ${markersPresent(finalText).join(', ') || '없음'}`);

  // 아무것도 설치되지 않은 상태에서의 --uninstall은 파일을 건드리지 않는다
  const beforeNoop = readBytes(settings);
  const noop = runInstaller(['--project', dir, '--uninstall']);
  const afterNoop = readBytes(settings);
  ok('clean 상태 --uninstall = 무변경 no-op', afterNoop.equals(beforeNoop) && /nothing to remove/i.test(noop.out),
    `출력: ${noop.out.trim().split('\n')[0]}`);
}

// ── D2. 남의 훅·남의 설정 키 보존 ───────────────────────────────────────────
console.log('\nD2. 설치가 기존 다른 훅·설정 키를 보존한다');
{
  const { dir, settings } = makeProject('d2');
  const before = JSON.parse(fs.readFileSync(settings, 'utf8'));
  runInstaller(['--project', dir]);
  const installed = JSON.parse(fs.readFileSync(settings, 'utf8'));

  const foreignCmds = (obj) =>
    Object.values(obj.hooks ?? {})
      .flat()
      .flatMap((g) => (g.hooks ?? []).map((h) => h.command))
      .filter((c) => typeof c === 'string' && c.includes('/opt/foreign/'))
      .sort();

  ok('설치 후에도 남의 훅 3종이 그대로 있다',
    JSON.stringify(foreignCmds(installed)) === JSON.stringify(foreignCmds(before)) && foreignCmds(installed).length === 3,
    `foreign=${JSON.stringify(foreignCmds(installed))}`);

  ok('설치가 hooks 밖의 키(permissions·env·$schema)를 건드리지 않는다',
    JSON.stringify({ s: installed.$schema, p: installed.permissions, e: installed.env }) ===
      JSON.stringify({ s: before.$schema, p: before.permissions, e: before.env }),
    `permissions=${JSON.stringify(installed.permissions)} env=${JSON.stringify(installed.env)}`);

  ok('설치가 SAPKit 훅을 실제로 추가했다 (보존 단언이 공허하지 않음)',
    markersPresent(JSON.stringify(installed)).length === MARKERS.length,
    `추가된 marker ${markersPresent(JSON.stringify(installed)).length}/${MARKERS.length}`);

  const un = runInstaller(['--project', dir, '--uninstall']);
  const after = JSON.parse(fs.readFileSync(settings, 'utf8'));
  ok('제거 후에도 남의 훅 3종이 그대로 있다',
    JSON.stringify(foreignCmds(after)) === JSON.stringify(foreignCmds(before)) && un.code === 0,
    `foreign=${JSON.stringify(foreignCmds(after))}`);
}

// ── D3. 시험 밖(사용자 실제 settings) 무접촉 ────────────────────────────────
console.log('\nD3. 설치기가 시험 밖을 건드리지 않는다');
{
  // 사용자 실제 파일 — 해시만 본다. 내용은 출력하지 않는다.
  const realSettings = path.join(os.homedir(), '.claude', 'settings.json');
  const realBefore = readBytes(realSettings);
  const realBeforeTag = realBefore ? sha(realBefore) : 'absent';

  // `--project` 없이(= 기본 대상 = 사용자 settings) 임시 HOME으로 돌린다.
  const inst = runInstaller([]);
  const fakeSettings = path.join(FAKE_HOME, '.claude', 'settings.json');
  ok('--project 없는 설치는 <HOME>/.claude/settings.json으로 간다', fs.existsSync(fakeSettings) && inst.code === 0,
    `대상=${fakeSettings} · 존재=${fs.existsSync(fakeSettings)}`);

  const fakeText = fs.existsSync(fakeSettings) ? fs.readFileSync(fakeSettings, 'utf8') : '';
  ok('임시 HOME 대상에 marker 전종이 설치된다', markersPresent(fakeText).length === MARKERS.length,
    `marker ${markersPresent(fakeText).length}/${MARKERS.length}`);

  ok('설치기가 참조한 훅 스크립트 경로가 임시 HOME 마켓캐시가 아닌 레포 경로다',
    fakeText.includes(HOOKS_DIR.replace(/\\/g, '/')),
    `resolveHookScript 폴백 확인 (marketplace 캐시 부재 시 레포 경로)`);

  const un = runInstaller(['--uninstall']);
  ok('임시 HOME 대상 --uninstall이 marker를 지운다',
    un.code === 0 && markersPresent(fs.readFileSync(fakeSettings, 'utf8')).length === 0,
    `잔여 marker: ${markersPresent(fs.readFileSync(fakeSettings, 'utf8')).join(', ') || '없음'}`);

  const realAfter = readBytes(realSettings);
  const realAfterTag = realAfter ? sha(realAfter) : 'absent';
  ok('사용자 실제 ~/.claude/settings.json 무변경', realBeforeTag === realAfterTag,
    `sha16 전=${realBeforeTag} 후=${realAfterTag}`);
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log(`\n총 ${pass + fail}건 · PASS ${pass} · FAIL ${fail}`);
if (fail) {
  console.log('\n❌ 훅 스위치 왕복 실패 — 설계 §14-3 "훅 스위치가 손상된 채 출시됨"에 해당한다.');
  process.exit(1);
}
console.log('✅ 훅 스위치 왕복 통과 — 설치·제거 멱등 · 타 설정 보존 · 시험 밖 무접촉');
