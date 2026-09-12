#!/usr/bin/env node
// test-codex-wire-mcp.mjs — codex-wire-mcp.mjs의 **음성·멱등** 시험.
// 설계 정본: docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md
//            §6-1·§6-2 · R-PORTABLE(캐시 절대경로를 커밋물에 고정하지 않는다) ·
//            R-IDEMPOTENT(재실행 diff 0) · R-ATOMIC(parse→검증→임시파일→replace)
//
// ───────────────────────── 무엇을 지키는가 ──────────────────────────────────
// 이 도구는 **설치본의 파일을 고쳐 쓴다.** 조용히 틀리면 두 가지가 동시에 죽는다:
// MCP가 안 뜨거나(경로 오류), 사용자가 손댄 wrapper가 날아간다. 그래서 고정한다:
//
//   D1 토큰 → 자기 버전 디렉터리 절대경로. **2버전 병존**에서 각자 자기 경로로.
//   D2 재실행이 **byte-noop** (해시 동일 · "변경 없음" 보고)
//   D3 스테일 절대경로(다른 버전 경로) → 자기 경로로 **수리**
//   D4 깨진 JSON → **무접촉**(byte 동일) + 오류 보고 + apply exit 1
//   D5 발견 0건 → status exit 0 (상태 보고가 목적이므로 실패가 아니다)
//   D6 치환 후 `/` 구분자 · 무BOM · **EOL 보존** · 다른 키 보존 · JSON 유효
//   D7 status는 **쓰기가 없다** (토큰 상태에서도 파일 불변)
//   D8 실제 생성물(interactive/adapters/codex/.mcp.json)을 fixture로 먹여도 토큰 0 —
//      생성기의 꼬리 경로와 도구 상수가 갈라지면 여기서 잡힌다
//   D9 탐색 범위: 같은 캐시의 **다른 플러그인** wrapper는 건드리지 않는다
//   D10 같은 wrapper의 다른 서버·키·사용자 값은 경로 꼬리가 같아도 보존한다
//   D11 실행 파일이 빠진 설치본은 성공으로 보고하거나 재작성하지 않는다
//   D12 JSON 문법만 맞고 sap 실행 설정이 잘못된 설치본은 거부한다
//   D13 apply 대상이 없으면 실패한다(status의 미설치 조회는 계속 exit 0)
//   D14 배포 트리만 다른 경로에 복사해 그 안의 배선 도구·서버·검사기를 구동한다
//
// ─────────────────────────────── 격리 ──────────────────────────────────────
// 전부 임시 CODEX_HOME 위의 가짜 캐시다. 실 codex CLI를 호출하지 않고, 자식에게
// `CODEX_HOME` env를 지운 채 `--codex-home`만 준다 — 사용자 실제 `~/.codex` 무접촉.
//
// 사용: node interactive/scripts/test-codex-wire-mcp.mjs [--verbose]
// exit 0 통과 / 1 실패
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const TOOL = path.join(HERE, 'codex-wire-mcp.mjs');
const GENERATED_WRAPPER = path.join(INTERACTIVE, 'adapters', 'codex', '.mcp.json');
const TOKEN = '{{SAPKIT_PLUGIN_ROOT}}';
const PLUGIN = JSON.parse(fs.readFileSync(path.join(INTERACTIVE, 'plugin-metadata.json'), 'utf8')).name;

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

if (!fs.existsSync(TOOL)) {
  console.error(`❌ 대상 부재: ${TOOL}`);
  process.exit(1);
}
if (!fs.existsSync(GENERATED_WRAPPER)) {
  console.error(`❌ 생성물 부재: ${GENERATED_WRAPPER} — 먼저 node interactive/scripts/gen-plugin-manifests.mjs`);
  process.exit(1);
}

// ── 임시 세계 ───────────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-wiremcp-'));
process.on('exit', () => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* OS에 맡긴다 */
  }
});

let homeSeq = 0;
const newHome = (label) => {
  const h = path.join(ROOT, `home-${++homeSeq}-${label}`);
  fs.mkdirSync(h, { recursive: true });
  return h;
};

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const posix = (p) => p.replace(/\\/g, '/');
const TEMPLATE = fs.readFileSync(GENERATED_WRAPPER, 'utf8');

// <home>/plugins/cache/<market>/<plugin>/<version>/adapters/codex/.mcp.json
function install(home, { market = 'agentic-sap', plugin = PLUGIN, version, content = TEMPLATE, launcher = true } = {}) {
  const root = path.join(home, 'plugins', 'cache', market, plugin, version);
  const wrapper = path.join(root, 'adapters', 'codex', '.mcp.json');
  fs.mkdirSync(path.dirname(wrapper), { recursive: true });
  fs.writeFileSync(wrapper, content, { encoding: 'utf8' });
  if (launcher) {
    fs.mkdirSync(path.join(root, 'server'), { recursive: true });
    fs.writeFileSync(path.join(root, 'server', 'launch.cjs'), '// stub\n');
  }
  return { root, wrapper };
}

function run(args, home) {
  const env = { ...process.env };
  delete env.CODEX_HOME; // 실 CODEX_HOME이 새어 들어오지 않게
  try {
    const out = execFileSync(process.execPath, [TOOL, ...args, '--codex-home', home], { encoding: 'utf8', env });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
const runJson = (args, home) => {
  const r = run([...args, '--json'], home);
  try {
    return { ...r, json: JSON.parse(r.out) };
  } catch {
    return { ...r, json: null };
  }
};

const recOf = (json, version) => json?.installations?.find((i) => i.version === version);
const allStrings = (v, acc = []) => {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, acc);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) allStrings(x, acc);
  return acc;
};

// ═══════════════════════════════════════════════════════════════════════════
// D1 · D8 — 2버전 병존 · 토큰 → 각자 자기 버전 절대경로
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD1·D8. 2버전 병존 — 토큰이 각자 자기 캐시 루트로 치환된다 (fixture = 실제 생성물)');
{
  const home = newHome('two-versions');
  const a = install(home, { version: '0.4.5' });
  const b = install(home, { version: '0.5.0' });

  const before = runJson(['status'], home);
  ok('status: 2건 발견 · 둘 다 TOKEN_PENDING', before.json?.summary?.found === 2 && before.json?.summary?.pending === 2, JSON.stringify(before.json?.summary));
  ok('status overall = TOKEN_PENDING', before.json?.overall === 'TOKEN_PENDING', before.json?.overall);

  const applied = runJson(['apply'], home);
  ok('apply exit 0', applied.code === 0, applied.out.slice(0, 200));
  ok('apply: 2건 재작성 보고', applied.json?.summary?.changed === 2, JSON.stringify(applied.json?.summary));

  for (const [ver, inst] of [
    ['0.4.5', a],
    ['0.5.0', b],
  ]) {
    const text = fs.readFileSync(inst.wrapper, 'utf8');
    let doc = null;
    try {
      doc = JSON.parse(text);
    } catch {
      /* 아래 단언이 잡는다 */
    }
    ok(`${ver}: JSON 유효`, doc !== null);
    ok(`${ver}: 토큰 0`, !text.includes(TOKEN), text.includes(TOKEN) ? '토큰 잔존' : '');
    const strings = allStrings(doc ?? {});
    const expectLaunch = `${posix(inst.root)}/server/launch.cjs`;
    const expectNodePath = `${posix(inst.root)}/server/runtime-deps/keyring/node_modules`;
    ok(`${ver}: args가 자기 버전 launch.cjs 절대경로`, strings.includes(expectLaunch), `기대 ${expectLaunch} · 실제 ${JSON.stringify(strings)}`);
    ok(`${ver}: NODE_PATH가 자기 버전 keyring 절대경로`, strings.includes(expectNodePath), `기대 ${expectNodePath}`);
    ok(`${ver}: 다른 버전 경로 미혼입`, !text.includes(ver === '0.4.5' ? '0.5.0' : '0.4.5'));
    // D6 다른 키 보존 — 생성물의 command·required가 그대로 살아 있다
    ok(`${ver}: 다른 키 보존 (command=node · required=false)`, doc?.sap?.command === 'node' && doc?.sap?.required === false, JSON.stringify(doc?.sap));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// D2 — 재실행 byte-noop
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD2. apply 재실행은 byte-noop (멱등)');
{
  const home = newHome('idempotent');
  const inst = install(home, { version: '0.4.5' });
  run(['apply'], home);
  const h1 = sha(inst.wrapper);
  const second = runJson(['apply'], home);
  const h2 = sha(inst.wrapper);
  ok('2회차 apply exit 0', second.code === 0);
  ok('2회차: 재작성 0건 보고', second.json?.summary?.changed === 0, JSON.stringify(second.json?.summary));
  ok('2회차: 파일 해시 불변', h1 === h2, `${h1.slice(0, 12)} vs ${h2.slice(0, 12)}`);
  ok('2회차 상태 = WIRED_OK', recOf(second.json, '0.4.5')?.state === 'WIRED_OK', recOf(second.json, '0.4.5')?.state);
  const third = runJson(['status'], home);
  ok('배선 후 status = WIRED_OK · 할 일 없음', third.json?.overall === 'WIRED_OK' && third.json?.summary?.wired === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// D3 — 스테일 절대경로(다른 버전) → 자기 경로로 수리
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD3. 스테일 절대경로 — 업데이트로 버전이 바뀐 뒤 자기 경로로 수리된다');
{
  const home = newHome('stale');
  // 0.5.0 wrapper가 아직 0.4.5 캐시를 가리키는 상태를 만든다 (= 업데이트 직후 잔존)
  const oldRoot = posix(path.join(home, 'plugins', 'cache', 'agentic-sap', PLUGIN, '0.4.5'));
  const staleContent = TEMPLATE.split(TOKEN).join(oldRoot);
  const inst = install(home, { version: '0.5.0', content: staleContent });

  const st = runJson(['status'], home);
  ok('status: STALE_PATH로 판정', recOf(st.json, '0.5.0')?.state === 'STALE_PATH', recOf(st.json, '0.5.0')?.state);
  ok('status: 토큰이 아님(TOKEN_PENDING 아님)', st.json?.summary?.pending === 0);

  const ap = runJson(['apply'], home);
  const text = fs.readFileSync(inst.wrapper, 'utf8');
  ok('apply exit 0', ap.code === 0);
  ok('스테일 경로 제거', !text.includes('/0.4.5/'), text);
  ok('자기 버전 경로로 수리', text.includes(`${posix(inst.root)}/server/launch.cjs`));
  ok('상태 WIRED_OK로 전이', recOf(ap.json, '0.5.0')?.state === 'WIRED_OK');
}

// ═══════════════════════════════════════════════════════════════════════════
// D4 — 깨진 JSON은 무접촉 + 오류 보고 + apply exit 1
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD4. 깨진 JSON — 건드리지 않고 오류로 보고한다');
{
  const home = newHome('broken');
  const broken = install(home, { version: '0.4.5', content: '{ "sap": { "command": "node", }\n' }); // 트레일링 콤마
  const healthy = install(home, { version: '0.5.0' });
  const h0 = sha(broken.wrapper);

  const st = runJson(['status'], home);
  ok('status: PARSE_ERROR 보고', recOf(st.json, '0.4.5')?.state === 'PARSE_ERROR', recOf(st.json, '0.4.5')?.state);
  ok('status: 오류 사유 포함', /파싱 실패/.test(recOf(st.json, '0.4.5')?.error ?? ''), recOf(st.json, '0.4.5')?.error);
  ok('status exit 0 (보고가 목적)', st.code === 0);

  const ap = runJson(['apply'], home);
  ok('apply exit 1', ap.code === 1, `code=${ap.code}`);
  ok('깨진 파일 무접촉 (해시 불변)', sha(broken.wrapper) === h0);
  ok('같은 실행에서 건강한 설치본은 배선됨', recOf(ap.json, '0.5.0')?.state === 'WIRED_OK' && !fs.readFileSync(healthy.wrapper, 'utf8').includes(TOKEN));
  ok('overall = PARSE_ERROR (가장 나쁜 상태)', ap.json?.overall === 'PARSE_ERROR', ap.json?.overall);
}

// ═══════════════════════════════════════════════════════════════════════════
// D5 — 발견 0건
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD5. 발견 0건 — status는 정상 종료한다');
{
  const home = newHome('empty');
  const st = runJson(['status'], home);
  ok('status exit 0', st.code === 0);
  ok('found=0 · overall=NOT_FOUND', st.json?.summary?.found === 0 && st.json?.overall === 'NOT_FOUND', JSON.stringify(st.json?.summary));
  const ap = runJson(['apply'], home);
  ok('apply는 대상 부재를 exit 1로 보고', ap.code === 1);
  ok('사람용 출력에 안내 있음', run(['status'], home).out.includes('설치본 0건'));
}

// ═══════════════════════════════════════════════════════════════════════════
// D6 — 구분자 · BOM · EOL · 포맷 보존
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD6. `/` 구분자 · 무BOM · EOL 보존 · 원문 포맷 보존');
{
  const home = newHome('encoding');
  // CRLF + BOM + 4-space 들여쓰기 + 사용자 추가 키
  const crlf =
    '﻿' +
    JSON.stringify(
      {
        sap: {
          command: 'node',
          args: [`${TOKEN}/server/launch.cjs`],
          env: { NODE_PATH: `${TOKEN}/server/runtime-deps/keyring/node_modules` },
          required: false,
        },
        other: { command: 'other-server', args: ['--keep-me'] },
      },
      null,
      4
    ).replace(/\n/g, '\r\n') +
    '\r\n';
  const inst = install(home, { version: '0.4.5', content: crlf });

  const st = runJson(['status'], home);
  ok('status: BOM 감지 보고', recOf(st.json, '0.4.5')?.bom === true);
  ok('status는 쓰기가 없다 (BOM 그대로)', fs.readFileSync(inst.wrapper).slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));

  run(['apply'], home);
  const buf = fs.readFileSync(inst.wrapper);
  const text = buf.toString('utf8');
  ok('무BOM으로 재작성', !buf.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), buf.slice(0, 6).toString('hex'));
  ok('CRLF 보존', text.includes('\r\n') && !/[^\r]\n/.test(text));
  ok('4-space 들여쓰기(원문 포맷) 보존', text.includes('\r\n    "sap"'), JSON.stringify(text.slice(0, 40)));
  ok('경로 구분자는 `/`만', !/[A-Za-z]:\\\\/.test(text) && !text.includes('\\\\'), text.match(/\\\\/g)?.length ?? 0);
  const doc = JSON.parse(text);
  ok('사용자 추가 서버 키 보존', doc.other?.command === 'other-server' && doc.other?.args?.[0] === '--keep-me', JSON.stringify(doc.other));
  ok('절대경로 치환됨', doc.sap.args[0] === `${posix(inst.root)}/server/launch.cjs`, doc.sap.args[0]);
}

// ═══════════════════════════════════════════════════════════════════════════
// D7 — status는 쓰기가 없다
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD7. status는 파일을 건드리지 않는다');
{
  const home = newHome('readonly');
  const inst = install(home, { version: '0.4.5' });
  const h0 = sha(inst.wrapper);
  run(['status'], home);
  run(['status', '--json'], home);
  ok('토큰 상태에서 status 2회 — 해시 불변', sha(inst.wrapper) === h0);
  ok('토큰 여전히 존재', fs.readFileSync(inst.wrapper, 'utf8').includes(TOKEN));
}

// ═══════════════════════════════════════════════════════════════════════════
// D9 — 탐색 범위: 다른 플러그인은 건드리지 않는다
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nD9. 같은 캐시의 다른 플러그인 wrapper는 무접촉');
{
  const home = newHome('scope');
  const mine = install(home, { version: '0.4.5' });
  const other = install(home, { plugin: 'not-sapkit', version: '9.9.9' });
  const h0 = sha(other.wrapper);
  const ap = runJson(['apply'], home);
  ok('발견은 1건뿐', ap.json?.summary?.found === 1, JSON.stringify(ap.json?.summary));
  ok('남의 플러그인 wrapper 해시 불변', sha(other.wrapper) === h0);
  ok('내 wrapper는 배선됨', !fs.readFileSync(mine.wrapper, 'utf8').includes(TOKEN));
}

console.log('\nD10. 같은 wrapper 안의 다른 서버·사용자 값은 경로가 같아도 무접촉');
{
  const home = newHome('owned-fields');
  const doc = JSON.parse(TEMPLATE);
  const sameLaunch = `${TOKEN}/server/launch.cjs`;
  doc.sap.env.CUSTOM_PATH = sameLaunch;
  doc.sap.notes = [sameLaunch, { [sameLaunch]: sameLaunch }];
  doc.other = { command: 'node', args: [sameLaunch], env: { ...doc.sap.env } };
  const content = JSON.stringify(doc, null, 2) + '\n';
  const inst = install(home, { version: '0.4.5', content });
  const ap = runJson(['apply'], home);
  const after = JSON.parse(fs.readFileSync(inst.wrapper, 'utf8'));
  ok('내 sap 실행 경로만 정상 배선', ap.code === 0 && after.sap.args[0] === `${posix(inst.root)}/server/launch.cjs`);
  ok('다른 서버 설정 전체 보존', JSON.stringify(after.other) === JSON.stringify(doc.other));
  ok('sap 사용자 env·중첩 값·키 보존', after.sap.env.CUSTOM_PATH === sameLaunch && JSON.stringify(after.sap.notes) === JSON.stringify(doc.sap.notes));
  ok('사용자 값의 토큰은 배선 상태 판정에서 제외', runJson(['status'], home).json?.overall === 'WIRED_OK');
}

console.log('\nD11. 실행 파일이 없는 설치본은 재작성·성공 보고 금지');
for (const alreadyWired of [false, true]) {
  const home = newHome(`missing-launcher-${alreadyWired}`);
  const inst = install(home, { version: '0.4.5', launcher: false });
  if (alreadyWired) fs.writeFileSync(inst.wrapper, TEMPLATE.split(TOKEN).join(posix(inst.root)));
  const h0 = sha(inst.wrapper);
  const st = runJson(['status'], home);
  ok(`실행 파일 부재(${alreadyWired}): INVALID_INSTALLATION`, st.code === 0 && st.json?.overall === 'INVALID_INSTALLATION');
  const ap = runJson(['apply'], home);
  ok(`실행 파일 부재(${alreadyWired}): apply exit 1 · 사유 포함`, ap.code === 1 && /launch\.cjs/.test(recOf(ap.json, '0.4.5')?.error ?? ''));
  ok(`실행 파일 부재(${alreadyWired}): 파일 무변경`, sha(inst.wrapper) === h0);
  ok(`실행 파일 부재(${alreadyWired}): 성공 안내 없음`, !/✅.*(?:배선 완료|이미 배선됨)/.test(run(['apply'], home).out));
}

console.log('\nD12. 실행 설정 구조가 잘못된 JSON은 무접촉');
for (const [label, content] of [
  ['sap 없음', JSON.stringify({ other: JSON.parse(TEMPLATE).sap })],
  ['command 없음', JSON.stringify({ sap: { args: [`${TOKEN}/server/launch.cjs`] } })],
  ['args 타입 오류', JSON.stringify({ sap: { command: 'node', args: `${TOKEN}/server/launch.cjs` } })],
  ['실행 경로 없음', JSON.stringify({ sap: { command: 'node', args: ['--version'] } })],
  ['중복 실행 경로', JSON.stringify({ sap: { command: 'node', args: [`${TOKEN}/server/launch.cjs`, `${TOKEN}/server/launch.cjs`] } })],
]) {
  const home = newHome('invalid-wrapper');
  const inst = install(home, { version: '0.4.5', content });
  const h0 = sha(inst.wrapper);
  const ap = runJson(['apply'], home);
  ok(`${label}: INVALID_INSTALLATION · exit 1`, ap.code === 1 && ap.json?.overall === 'INVALID_INSTALLATION');
  ok(`${label}: 원본 보존`, sha(inst.wrapper) === h0);
}

console.log('\nD13. 적용 대상이 없으면 완료가 아니다');
{
  const home = newHome('apply-empty');
  const ap = runJson(['apply'], home);
  ok('미설치 status exit 0 유지', runJson(['status'], home).code === 0);
  ok('미설치 apply exit 1 · NOT_FOUND', ap.code === 1 && ap.json?.overall === 'NOT_FOUND' && ap.json?.exitCode === 1);
}

// ── 결과 ───────────────────────────────────────────────────────────────────
console.log('\nD14. 배포 파일만 복사한 캐시에서 실기동 (Codex 설치·SAP 접속 없음)');
{
  const home = newHome('배포 폴더');
  const version = JSON.parse(fs.readFileSync(path.join(INTERACTIVE, 'plugin-metadata.json'), 'utf8')).version;
  const inst = install(home, { version });
  const repo = path.dirname(INTERACTIVE);
  // 실제 배포 경계 = git에 추적된 interactive/뿐. 개발용 .codex/나 사용자 설정은 제외한다.
  const shipped = execFileSync('git', ['ls-files', '-z', '--', 'interactive/'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of shipped) {
    const relative = file.slice('interactive/'.length);
    const target = path.join(inst.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repo, file), target);
  }
  const project = path.join(home, 'SAP 프로젝트');
  const profileHome = path.join(home, 'empty-profile-home');
  fs.mkdirSync(path.join(project, '.sapkit'), { recursive: true });
  fs.mkdirSync(profileHome, { recursive: true });
  fs.writeFileSync(path.join(project, '.sapkit', 'config.json'), '{"toolSurface":"readonly"}\n');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(SAP_|SAPKIT_|MCP_|CODEX_HOME$|NODE_PATH$)/.test(key)) delete env[key];
  Object.assign(env, { HOME: home, USERPROFILE: home, CODEX_HOME: home, SAPKIT_HOME_DIR: profileHome });
  const copiedTool = path.join(inst.root, 'scripts', 'codex-wire-mcp.mjs');
  const wired = JSON.parse(execFileSync(process.execPath, [copiedTool, 'apply', '--json', '--codex-home', home], { cwd: project, env, encoding: 'utf8' }));
  ok('복사본 배선 도구가 다른 cwd에서 성공', wired.overall === 'WIRED_OK' && wired.summary.changed === 1);
  const sap = JSON.parse(fs.readFileSync(inst.wrapper, 'utf8')).sap;
  ok('실행 경로가 개발 폴더가 아닌 복사본 내부', sap.args[0] === `${posix(inst.root)}/server/launch.cjs` && !sap.args[0].includes(posix(INTERACTIVE)));
  ok('개발 저장소의 Codex 훅은 배포 트리에 없음', !fs.existsSync(path.join(inst.root, '.codex', 'hooks.json')));
  const manifest = JSON.parse(fs.readFileSync(path.join(inst.root, '.codex-plugin', 'plugin.json'), 'utf8'));
  ok('배포 스킬·절차도 캐시 안에서 해석됨', fs.existsSync(path.join(inst.root, manifest.skills, 'setup', 'SKILL.md')) && fs.existsSync(path.join(inst.root, 'core', 'procedures', 'setup.md')));
  try {
    const observed = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, sap.args, { cwd: project, env: { ...env, ...sap.env } });
      let buffer = '';
      let stderr = '';
      let settled = false;
      const finish = (error, tools) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        if (error) reject(error);
        else resolve({ tools, stderr });
      };
      const timer = setTimeout(() => finish(new Error('복사본 서버 tools/list 시간 초과')), 15000);
      child.on('error', (error) => finish(error));
      child.on('exit', (code) => finish(new Error(`복사본 서버 조기 종료: ${code} ${stderr}`)));
      child.stdin.on('error', (error) => finish(error));
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let message;
          try { message = JSON.parse(line); } catch { finish(new Error('복사본 서버 stdout JSON 손상')); return; }
          if (message.error) { finish(new Error(JSON.stringify(message.error))); return; }
          if (message.id === 1) {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
          } else if (message.id === 2) finish(null, message.result?.tools ?? []);
        }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codex-package-offline-test', version: '1' } } }) + '\n');
    });
    ok('복사본 서버 initialize → tools/list 응답', observed.tools.some((tool) => tool.name === 'GetSystemInfo') && observed.tools.some((tool) => tool.name === 'GetSession'));
    ok('복사본 서버는 inspection-only (실 프로파일 없음)', /inspection-only/.test(observed.stderr));
  } catch (error) {
    ok('복사본 서버 실기동', false, error.message);
  }
  const checker = execFileSync(process.execPath, [path.join(inst.root, 'checker', 'sapkit-checker.bundle.cjs'), '--help'], { cwd: project, env, encoding: 'utf8' });
  ok('복사본 오프라인 검사기도 실행됨', /lint/.test(checker) && /analyze/.test(checker));
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) {
  console.log('\n❌ codex-wire-mcp 시험 실패');
  process.exit(1);
}
console.log('✅ 전건 통과 — 토큰 치환 · 멱등 · 스테일 수리 · 무접촉 계약 유지');
