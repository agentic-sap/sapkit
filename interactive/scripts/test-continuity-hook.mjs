#!/usr/bin/env node
// test-continuity-hook.mjs — 연속성 SessionStart 훅과 **그 전용 스위치 설치기**의 음성 시험.
//
// ───────────────────────────── 무엇을 지키는가 ──────────────────────────────
// 재개점 2종(`HANDOFF.md`·`RUN-PLAN.md`)은 사용자 **자기 프로젝트**에 세워진다. 세션이
// 시작될 때 그 존재를 알려 주는 층이 이 훅이고, 훅은 **기본 미배선**(D-062)이라 사람이
// 설치기를 직접 돌려야만 켜진다. 그래서 지켜야 할 성질이 둘이다.
//
//   S. 스위치  — 설치가 멱등이고, 제거가 **찾은 파일을 byte 그대로** 돌려주며,
//                남의 훅·남의 키를 건드리지 않고, **안전훅 6종 번들과 양방향으로
//                독립**이다(연속성을 켠다고 안전훅이 켜지지 않고, 연속성을 끈다고
//                안전훅이 꺼지지 않는다).
//   D. 결정표  — 표식 있는 `HANDOFF.md`가 있고 **표식 없는 동명 파일이 하나도 없을
//                때만** 짧은 포인터를 주입한다. 그 밖은 전부 무음이다. 특히
//                **표식 없는 `RUN-PLAN.md`가 섞여 있으면 무음**(fail-closed)인데,
//                이것이 「우리가 세우지 않은 남의 파일을 우리 것으로 착각하지
//                않는다」를 재는 자리다.
//
// 훅은 **조언층이지 관문이 아니다**. 어떤 입력에도 예외를 던지지 않고 exit 0으로
// 끝나야 하며, 무게의 척도가 세션 토큰이므로 **파일 본문을 절대 주입하지 않는다** —
// 그래서 fixture 본문에 sentinel을 심고 주입문에 그 문자열이 없음을 단언한다.
//
// ─────────────────────────────── 격리 ──────────────────────────────────────
// · 모든 대상은 임시 디렉터리다. `--project <tmp>`로 임시 프로젝트 settings만 만진다.
// · 모든 자식은 임시 HOME/USERPROFILE을 받는다 — 설치기가
//   `~/.claude/plugins/marketplaces/...`를 먼저 보므로, 실 HOME이면 command 문자열이
//   머신마다 달라진다. 임시 HOME이면 항상 레포 경로로 폴백해 결정적이다.
// · 사용자 실제 `~/.claude/settings.json`은 **해시만** 전후 대조한다(내용 미출력).
//
// 사용: node interactive/scripts/test-continuity-hook.mjs [--verbose]
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
const HOOK = path.join(HOOKS_DIR, 'session-continuity.mjs');
const INSTALLER = path.join(HOOKS_DIR, 'install-continuity-hook.mjs');
const SAFETY_INSTALLER = path.join(HOOKS_DIR, 'install-hooks.mjs');

// 계약 상수 — 템플릿(`interactive/assets/continuity/`)이 정본이고 여기서는 인용만 한다.
// 값이 갈리면 훅이 자기가 세운 파일을 못 알아본다.
const MARKER = '<!-- sapkit:continuity -->';
const TAG = '[SAPKIT CONTINUITY]';
const HANDOFF_CAP = 500;
const CONT_MARKER = 'session-continuity.mjs';

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

for (const [label, file] of [
  ['훅', HOOK],
  ['설치기', INSTALLER],
  ['안전훅 설치기', SAFETY_INSTALLER],
]) {
  if (!fs.existsSync(file)) {
    console.error(`❌ ${label} 부재: ${file}`);
    process.exit(1);
  }
}

// ── 임시 세계 ───────────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-continuity-'));
const FAKE_HOME = path.join(ROOT, 'home');
fs.mkdirSync(FAKE_HOME, { recursive: true });
process.on('exit', () => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* OS에 맡긴다 */
  }
});

const childEnv = () => ({ ...process.env, HOME: FAKE_HOME, USERPROFILE: FAKE_HOME });

function runScript(script, args) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', env: childEnv() }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const runInstaller = (args) => runScript(INSTALLER, args);
const runSafetyInstaller = (args) => runScript(SAFETY_INSTALLER, args);

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const readBytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);

// 안전훅 6종의 marker는 그쪽 설치기 원문에서 파생한다 — 하드코딩하면 훅이 늘 때
// 독립성 단언이 조용히 좁아진다.
const SAFETY_MARKERS = [
  ...fs.readFileSync(SAFETY_INSTALLER, 'utf8').matchAll(/marker:\s*'([^']+)'/g),
].map((m) => m[1]);

function mkdir(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// hooks 밖 키 + 남의 훅 항목이 이미 있는 프로젝트 settings. 직렬화 규칙을
// 설치기(`JSON.stringify(obj, null, 2) + '\n'`)와 맞춰 심어야 「왕복 후 byte 동일」이
// 형식 차이가 아닌 **의미 보존**을 재는 단언이 된다.
const FOREIGN = () => ({
  $schema: 'https://example.invalid/settings.json',
  permissions: { allow: ['Read(*)'] },
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "/opt/foreign/pre.mjs"' }] },
    ],
  },
});

function makeProject(name) {
  const dir = mkdir(name);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  const settings = path.join(dir, '.claude', 'settings.json');
  fs.writeFileSync(settings, `${JSON.stringify(FOREIGN(), null, 2)}\n`, 'utf8');
  return { dir, settings };
}

console.log('연속성 훅 + 전용 스위치 시험\n');

// ═══════════════════════════════════════════════════════════════════════════
// S. 스위치 계약
// ═══════════════════════════════════════════════════════════════════════════
console.log('S1. 설치 → 멱등 → --uninstall byte 원상복구');
{
  const { dir, settings } = makeProject('s1');
  const baseline = readBytes(settings);

  const first = runInstaller(['--project', dir]);
  const afterInstall = fs.readFileSync(settings, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(afterInstall);
  } catch {
    /* 아래 단언이 잡는다 */
  }
  const sessionGroups = parsed?.hooks?.SessionStart ?? [];

  ok(
    '설치가 exit 0이고 marker가 SessionStart 아래에 놓인다',
    first.code === 0 && JSON.stringify(sessionGroups).includes(CONT_MARKER),
    `exit=${first.code} · SessionStart=${JSON.stringify(sessionGroups)}`,
  );

  runInstaller(['--project', dir]);
  const afterTwice = fs.readFileSync(settings, 'utf8');
  ok(
    '재설치가 byte 동일 (멱등 upsert)',
    afterTwice === afterInstall,
    `sha16 1회=${sha(Buffer.from(afterInstall))} 2회=${sha(Buffer.from(afterTwice))}`,
  );

  const un = runInstaller(['--project', dir, '--uninstall']);
  const restored = readBytes(settings);
  ok(
    '--uninstall이 찾은 파일을 byte 그대로 돌려준다',
    un.code === 0 && restored != null && restored.equals(baseline),
    `baseline=${sha(baseline)} · 복구=${restored ? sha(restored) : 'absent'}`,
  );

  const beforeNoop = readBytes(settings);
  const noop = runInstaller(['--project', dir, '--uninstall']);
  ok(
    'clean 상태 --uninstall = 무변경 no-op',
    noop.code === 0 && readBytes(settings).equals(beforeNoop),
    `출력: ${noop.out.trim().split('\n')[0]}`,
  );
}

console.log('\nS2. 남의 훅 항목·hooks 밖 키가 설치·제거 양쪽에서 살아남는다');
{
  const { dir, settings } = makeProject('s2');
  const before = JSON.parse(fs.readFileSync(settings, 'utf8'));

  const foreignCmds = (obj) =>
    Object.values(obj.hooks ?? {})
      .flat()
      .flatMap((g) => (g.hooks ?? []).map((h) => h.command))
      .filter((c) => typeof c === 'string' && c.includes('/opt/foreign/'))
      .sort();
  const outsideHooks = (obj) => JSON.stringify({ s: obj.$schema, p: obj.permissions });

  runInstaller(['--project', dir]);
  const installed = JSON.parse(fs.readFileSync(settings, 'utf8'));
  ok(
    '설치 후 남의 훅 항목 무손상',
    JSON.stringify(foreignCmds(installed)) === JSON.stringify(foreignCmds(before)) &&
      foreignCmds(installed).length === 1,
    `foreign=${JSON.stringify(foreignCmds(installed))}`,
  );
  ok(
    '설치가 hooks 밖 키($schema·permissions)를 건드리지 않는다',
    outsideHooks(installed) === outsideHooks(before),
    outsideHooks(installed),
  );
  ok(
    '설치가 연속성 훅을 실제로 추가했다 (보존 단언이 공허하지 않음)',
    JSON.stringify(installed).includes(CONT_MARKER),
    `marker 탐지=${JSON.stringify(installed).includes(CONT_MARKER)}`,
  );

  runInstaller(['--project', dir, '--uninstall']);
  const after = JSON.parse(fs.readFileSync(settings, 'utf8'));
  ok(
    '제거 후에도 남의 훅 항목·hooks 밖 키가 그대로다',
    JSON.stringify(foreignCmds(after)) === JSON.stringify(foreignCmds(before)) &&
      outsideHooks(after) === outsideHooks(before),
    `foreign=${JSON.stringify(foreignCmds(after))} · ${outsideHooks(after)}`,
  );
}

console.log('\nS3. 안전훅 6종 번들과 양방향 독립');
{
  const { dir, settings } = makeProject('s3');

  runInstaller(['--project', dir]);
  const contOnly = fs.readFileSync(settings, 'utf8');
  const leaked = SAFETY_MARKERS.filter((m) => contOnly.includes(m));
  ok(
    '연속성 설치가 안전훅 6종을 하나도 배선하지 않는다',
    SAFETY_MARKERS.length === 6 && leaked.length === 0,
    `안전훅 marker ${SAFETY_MARKERS.length}종 · 유출 ${leaked.length}건 [${leaked.join(', ')}]`,
  );

  // 반대 방향 — 안전훅이 이미 켜진 프로젝트에서 연속성만 껐을 때.
  runSafetyInstaller(['--project', dir]);
  const both = fs.readFileSync(settings, 'utf8');
  const bothWired = SAFETY_MARKERS.every((m) => both.includes(m)) && both.includes(CONT_MARKER);

  const un = runInstaller(['--project', dir, '--uninstall']);
  const afterText = fs.readFileSync(settings, 'utf8');
  const survivors = SAFETY_MARKERS.filter((m) => afterText.includes(m));
  ok(
    '연속성 --uninstall이 기설치 안전훅 6종을 남긴다',
    bothWired &&
      un.code === 0 &&
      survivors.length === SAFETY_MARKERS.length &&
      !afterText.includes(CONT_MARKER),
    `공존=${bothWired} · 잔존 안전훅 ${survivors.length}/${SAFETY_MARKERS.length} · 연속성 잔여=${afterText.includes(CONT_MARKER)}`,
  );
}

console.log('\nS4. 시험 밖(사용자 실제 settings) 무접촉');
{
  const realSettings = path.join(os.homedir(), '.claude', 'settings.json');
  const realBefore = readBytes(realSettings);
  const realBeforeTag = realBefore ? sha(realBefore) : 'absent';

  const inst = runInstaller([]);
  const fakeSettings = path.join(FAKE_HOME, '.claude', 'settings.json');
  const fakeText = fs.existsSync(fakeSettings) ? fs.readFileSync(fakeSettings, 'utf8') : '';
  ok(
    '--project 없는 설치는 <HOME>/.claude/settings.json으로 간다',
    inst.code === 0 && fs.existsSync(fakeSettings) && fakeText.includes(CONT_MARKER),
    `대상=${fakeSettings} · 존재=${fs.existsSync(fakeSettings)}`,
  );
  ok(
    '마켓캐시 부재 시 command가 레포 훅 경로로 폴백한다',
    fakeText.includes(HOOKS_DIR.replace(/\\/g, '/')),
    'locateHookScript 폴백 확인',
  );

  runInstaller(['--uninstall']);
  const realAfter = readBytes(realSettings);
  const realAfterTag = realAfter ? sha(realAfter) : 'absent';
  ok('사용자 실제 ~/.claude/settings.json 무변경', realBeforeTag === realAfterTag,
    `sha16 전=${realBeforeTag} 후=${realAfterTag}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// D. 훅 결정표 — 자식 프로세스에 stdin payload를 먹이고 stdout을 읽는다
// ═══════════════════════════════════════════════════════════════════════════
const SENTINEL = 'SENTINEL-BODY-LINE-DO-NOT-LEAK-7f3a9c';
const NEUTRAL = mkdir('neutral'); // 아무 재개점도 없는 디렉터리

/** `lines`줄짜리 본문. LF 개수 = lines (wc -l 정의). markerLine이 0이면 표식 없음. */
function makeDoc(lines, { markerLine = 1, sentinelAt = 0 } = {}) {
  const body = [];
  for (let i = 1; i <= lines; i++) {
    if (i === markerLine) body.push(MARKER);
    else if (i === sentinelAt) body.push(SENTINEL);
    else body.push(`line ${i} filler`);
  }
  return `${body.join('\n')}\n`;
}

/** 재개점 fixture 프로젝트. `handoff`/`runplan`이 null이면 그 파일은 없다. */
function makeFixture(name, { handoff = null, runplan = null } = {}) {
  const dir = mkdir(path.join('fx', name));
  if (handoff !== null) fs.writeFileSync(path.join(dir, 'HANDOFF.md'), handoff, 'utf8');
  if (runplan !== null) fs.writeFileSync(path.join(dir, 'RUN-PLAN.md'), runplan, 'utf8');
  return dir;
}

/** 훅을 자식으로 돌린다. `cwd`는 프로세스 작업 디렉터리, `input`은 stdin JSON. */
function runHook({ cwd = NEUTRAL, input = '' } = {}) {
  try {
    const out = execFileSync(process.execPath, [HOOK], {
      encoding: 'utf8',
      input,
      env: childEnv(),
      cwd,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}`, err: `${e.stderr ?? ''}` };
  }
}

/** payload의 cwd로 프로젝트를 가리켜 훅을 돌리고, 주입문(없으면 null)을 돌려준다. */
function inject(projectDir) {
  const res = runHook({
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: projectDir }),
  });
  let json = null;
  try {
    json = JSON.parse(res.out);
  } catch {
    /* 파싱 불가 = 계약 위반. 아래 단언이 잡는다. */
  }
  return { res, json, text: json?.hookSpecificOutput?.additionalContext ?? null };
}

const MARKED = makeDoc(40, { markerLine: 1, sentinelAt: 5 });
const UNMARKED = makeDoc(40, { markerLine: 0, sentinelAt: 5 });

console.log('\nD1. 표식 있는 재개점 2종 → 주입');
{
  const dir = makeFixture('both', { handoff: MARKED, runplan: makeDoc(30) });
  const { json, text } = inject(dir);
  ok(
    '주입한다 (hookSpecificOutput.hookEventName = SessionStart)',
    json?.continue === true &&
      json?.hookSpecificOutput?.hookEventName === 'SessionStart' &&
      typeof text === 'string',
    `출력=${JSON.stringify(json)?.slice(0, 160)}`,
  );
  ok(
    '주입문이 조언 태그 · HANDOFF.md · RUN-PLAN.md · handoff 스킬을 모두 담는다',
    Boolean(
      text &&
        text.includes(TAG) &&
        text.includes('HANDOFF.md') &&
        text.includes('RUN-PLAN.md') &&
        text.includes('handoff'),
    ),
    text ?? '(주입 없음)',
  );
  ok(
    '주입문이 15줄 미만이다 (포인터이지 본문이 아니다)',
    Boolean(text) && text.split('\n').length < 15,
    `줄 수=${text ? text.split('\n').length : 'n/a'}`,
  );
  ok(
    '주입문에 파일 본문(sentinel)이 섞이지 않는다',
    Boolean(text) && !text.includes(SENTINEL),
    `sentinel 유출=${text ? text.includes(SENTINEL) : 'n/a'}`,
  );
}

console.log('\nD2. 표식 있는 HANDOFF만 (RUN-PLAN 부재) → 주입, 큐 파일을 주장하지 않는다');
{
  const dir = makeFixture('handoff-only', { handoff: MARKED });
  const { text } = inject(dir);
  ok('주입한다', Boolean(text && text.includes(TAG) && text.includes('HANDOFF.md')), text ?? '(주입 없음)');
  ok('없는 RUN-PLAN.md를 언급하지 않는다', Boolean(text) && !text.includes('RUN-PLAN.md'), text ?? '(주입 없음)');
}

console.log('\nD3. 무음 분기 — 표식 없는 동명 파일이 하나라도 있으면 세우지 않는다');
{
  const silent = (label, fixture) => {
    const { res, json, text } = inject(fixture);
    ok(
      label,
      res.code === 0 && json?.continue === true && json?.suppressOutput === true && text === null,
      `exit=${res.code} 출력=${res.out.trim().slice(0, 120)}`,
    );
  };

  silent(
    'marked HANDOFF + **unmarked RUN-PLAN** → 무음 (fail-closed)',
    makeFixture('mixed', { handoff: MARKED, runplan: UNMARKED }),
  );
  silent('unmarked HANDOFF → 무음', makeFixture('unmarked', { handoff: UNMARKED, runplan: makeDoc(30) }));
  silent('두 파일 모두 부재 → 무음', makeFixture('none'));
  silent(
    'marker가 21번째 줄 → 무음 (20줄 창 고정)',
    makeFixture('line21', { handoff: makeDoc(40, { markerLine: 21, sentinelAt: 5 }) }),
  );
}

console.log('\nD4. 경계 — 20줄 창 · 상한');
{
  const { text: t20 } = inject(
    makeFixture('line20', { handoff: makeDoc(40, { markerLine: 20, sentinelAt: 5 }) }),
  );
  ok('marker가 20번째 줄 → 주입 (off-by-one 경계)', Boolean(t20 && t20.includes(TAG)), t20 ?? '(주입 없음)');

  const { text: tOver } = inject(
    makeFixture('over-cap', { handoff: makeDoc(HANDOFF_CAP + 1, { markerLine: 1, sentinelAt: 5 }) }),
  );
  ok(
    `${HANDOFF_CAP + 1}줄 → 주입 + 상한 경고(파일명·줄수·상한·이관처)`,
    Boolean(
      tOver &&
        tOver.includes(TAG) &&
        tOver.includes('HANDOFF.md') &&
        tOver.includes(String(HANDOFF_CAP + 1)) &&
        tOver.includes(String(HANDOFF_CAP)) &&
        tOver.includes('archive/'),
    ),
    tOver ?? '(주입 없음)',
  );
  ok(
    '상한 경고가 삭제가 아니라 이관을 말한다',
    Boolean(tOver) && /relocate/i.test(tOver) && !/delete/i.test(tOver),
    tOver ?? '(주입 없음)',
  );

  const { text: tAt } = inject(
    makeFixture('at-cap', { handoff: makeDoc(HANDOFF_CAP, { markerLine: 1, sentinelAt: 5 }) }),
  );
  ok(
    `${HANDOFF_CAP}줄 → 주입하되 상한 경고 없음 (경계)`,
    Boolean(tAt && tAt.includes(TAG)) && !(tAt ?? '').includes('archive/'),
    tAt ?? '(주입 없음)',
  );
}

console.log('\nD5. 조언층은 절대 던지지 않는다');
{
  const isSilent = (res) => {
    let json = null;
    try {
      json = JSON.parse(res.out);
    } catch {
      /* 아래 단언이 잡는다 */
    }
    return res.code === 0 && json?.continue === true && json?.suppressOutput === true;
  };

  const empty = runHook({ input: '' });
  ok('빈 stdin → 무음 · exit 0', isSilent(empty), `exit=${empty.code} 출력=${empty.out.trim().slice(0, 120)}`);

  const broken = runHook({ input: '{not json' });
  ok('깨진 JSON stdin → 무음 · exit 0', isSilent(broken), `exit=${broken.code} 출력=${broken.out.trim().slice(0, 120)}`);

  const noCwd = runHook({ input: JSON.stringify({ hook_event_name: 'SessionStart' }) });
  ok(
    'payload에 cwd가 없음 → process.cwd() 폴백 · 재개점 없으므로 무음',
    isSilent(noCwd),
    `exit=${noCwd.code} 출력=${noCwd.out.trim().slice(0, 120)}`,
  );
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log(`\n통과 ${pass}/${pass + fail}`);
if (fail) {
  console.log('\n❌ 연속성 훅/스위치 계약 위반 — 배선하지 말 것.');
  process.exit(1);
}
console.log('✅ 연속성 훅/스위치 통과 — 스위치 왕복 · 안전훅 독립 · 결정표 · 무본문 주입');
