#!/usr/bin/env node
// launch.cjs 도구면(toolSurface) 결정의 음성시험 — 설계
// docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md §7-1
// (불변식 R-DEFAULT · R-DEV · R-PORTABLE · R-IDEMPOTENT).
//
// 묻는 것은 "런처가 돌아가는가"가 아니라 **"열면 안 되는 것을 열지 않는가"**다.
// 그래서 대부분의 케이스가 `readonly`를 기대하고, `readonly,high`를 기대하는 케이스는
// 조건을 전부 갖춘 것들뿐이다.
//
// 3층으로 본다:
//   ⑴ 결정 로직 (in-process) — 순수 함수 decideExposition을 임시 fixture로 직접 호출.
//      경고 코드까지 데이터로 관측하므로 stderr 파싱이 필요 없다.
//   ⑵ 배달 경로 (subprocess) — 실 shim + 스텁 번들을 **진짜로 기동**해, 번들이
//      실제로 보는 argv와 stderr를 관측한다. "파일에 썼다"와 "읽힌다"는 다르다.
//   ⑶ 비공허 증명 — 런처를 변조하면 적합성 러너(진리표)가 red가 되는 것을 실측한다.
//      새 fixture 케이스가 장식이 아니라는 증거.
//
// SAP 무접촉 · 오프라인 · 실사용자 홈 무접촉(가짜 HOME/USERPROFILE).
// exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const LAUNCH = path.join(INTERACTIVE, 'server', 'launch.cjs');
const RUNNER = path.join(HERE, 'conformance-runtime-dir.mjs');

// 이 require 자체가 계약 시험이다: launch.cjs를 모듈로 불러도 번들이 뜨면 안 된다
// (require.main !== module). 번들이 떴다면 여기서 stdio를 잡고 멈춘다.
const require_ = createRequire(import.meta.url);
const launch = require_(LAUNCH);

let pass = 0;
let fail = 0;
const tmpRoots = [];

function ok(name) {
  console.log(`  ✅ ${name}`);
  pass++;
}
function bad(name, detail) {
  console.log(`  ❌ ${name}`);
  if (detail) console.log(String(detail).split('\n').map((l) => '       ' + l).join('\n'));
  fail++;
}
function expect(name, actual, wanted) {
  if (actual === wanted) ok(name);
  else bad(name, `기대 ${JSON.stringify(wanted)} · 실제 ${JSON.stringify(actual)}`);
}

/** 임시 프로젝트 트리. 키는 프로젝트 루트 기준 상대경로. */
function project(files = {}, dirs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-ts-'));
  tmpRoots.push(root);
  for (const d of dirs) fs.mkdirSync(path.join(root, ...d.split('/')), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

/** main()이 하는 것과 같은 순서로 결정한다 — 세대 선택 한 번, 그 세대의 config. */
function decide(root, args = []) {
  const picked = launch.selectGeneration(root);
  const envPath = typeof picked.envPath === 'string' ? picked.envPath : null;
  return launch.decideExposition({ args, cwd: root, selectedDir: picked.runtimeDir, envPath });
}

const codes = (d) => d.notices.map((n) => n.code).join(',');

const DEV_ENV = 'SAP_URL=http://dev\nSAP_CLIENT=100\nSAP_TIER=dev\n';
const QA_ENV = 'SAP_URL=http://qa\nSAP_CLIENT=100\nSAP_TIER=QA\n';
const NO_TIER_ENV = 'SAP_URL=http://mystery\nSAP_CLIENT=100\n';

// ── ⑴ 결정 로직 ────────────────────────────────────────────────────────────
console.log('⑴ 결정 로직 (in-process · 순수 함수)');

{
  // ① 설정이 아무것도 없는 새 프로젝트 = R-DEFAULT 바닥선.
  const d = decide(project({}));
  expect('① config 없음 → readonly', d.exposition, 'readonly');
  expect('①  ·· 이유 1회 고지', codes(d), 'TOOLSURFACE_DEFAULT');
}

{
  // ② 명시 readonly는 조용하다 — 결과는 기본값과 같지만 사용자가 고른 것이다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"readonly"}' }));
  expect('② toolSurface=readonly → readonly', d.exposition, 'readonly');
  expect('②  ·· 경고 없음', d.notices.length, 0);
}

{
  // ③ 두 조건(명시 선택 + DEV)이 모두 갖춰진 유일한 개방 경로.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"development"}', '.sapkit/sap.env': DEV_ENV }));
  expect('③ development + SAP_TIER=dev → readonly,high', d.exposition, 'readonly,high');
  expect('③  ·· 경고 없음', d.notices.length, 0);
  expect('③  ·· 출처는 config', d.source, 'config');
}

{
  // ④ R-DEV. QA는 조용히 축소하지 않고 이유를 남긴다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"development"}', '.sapkit/sap.env': QA_ENV }));
  expect('④ development + QA → readonly (fail-closed)', d.exposition, 'readonly');
  expect('④  ·· 코드', codes(d), 'TOOLSURFACE_FAIL_CLOSED');
  const msg = d.notices[0]?.message ?? '';
  if (msg.includes('SAP_TIER=QA')) ok('④  ·· 이유에 실제 tier가 담긴다');
  else bad('④  ·· 이유에 실제 tier가 담긴다', msg);
}

{
  // ⑤ 연결은 됐는데 tier를 못 읽는 상태 — 엔진의 UNKNOWN과 같은 fail-closed 자리.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"development"}', '.sapkit/sap.env': NO_TIER_ENV }));
  expect('⑤ development + SAP_TIER 부재 → readonly', d.exposition, 'readonly');
  expect('⑤  ·· 코드', codes(d), 'TOOLSURFACE_FAIL_CLOSED');
}

{
  // ⑤' 프로파일이 아예 없어 연결 자체가 없는 상태에서도 development는 열리지 않는다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"development"}' }));
  expect("⑤' development + sap.env 미해석 → readonly", d.exposition, 'readonly');
  expect("⑤'  ·· 코드", codes(d), 'TOOLSURFACE_FAIL_CLOSED');
}

{
  // ⑥ 오타. R-DEFAULT: 알 수 없는 값은 확장이 아니라 축소로 해석한다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"develop"}', '.sapkit/sap.env': DEV_ENV }));
  expect('⑥ 오타값 → readonly', d.exposition, 'readonly');
  expect('⑥  ·· 코드', codes(d), 'TOOLSURFACE_UNKNOWN');
}

{
  // ⑥' 문자열이 아닌 값(true)도 같은 자리로 떨어진다 — 타입 혼동으로 열리지 않는다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":true}', '.sapkit/sap.env': DEV_ENV }));
  expect("⑥' 비문자열 값 → readonly", d.exposition, 'readonly');
  expect("⑥'  ·· 코드", codes(d), 'TOOLSURFACE_UNKNOWN');
}

{
  // ⑥'' 대소문자·공백만 다른 것은 오타가 아니다 (SAP_TIER=dev를 DEV로 읽는 것과 같은 규칙).
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":" Development "}', '.sapkit/sap.env': DEV_ENV }));
  expect('⑥\'\' " Development " → readonly,high', d.exposition, 'readonly,high');
}

{
  // ⑦ 인자 우선순위. 기존 수동 등록 경로(레포 내 extract 도구가 실제로 쓴다)는
  //    검증 없이 통과하되, config와 다르면 침묵하지 않는다.
  const root = project({ '.sapkit/config.json': '{"toolSurface":"readonly"}', '.sapkit/sap.env': DEV_ENV });
  const d = decide(root, ['--exposition=readonly,high']);
  expect('⑦ 명시 인자가 config를 이긴다', d.exposition, 'readonly,high');
  expect('⑦  ·· 출처는 argv', d.source, 'argv');
  expect('⑦  ·· 고지 1회', codes(d), 'TOOLSURFACE_ARG');

  expect('⑦  ·· 인자와 config가 같으면 고지 없음', decide(root, ['--exposition=readonly']).notices.length, 0);
  // 값이 검증되지 않고 그대로 간다 = 기존 경로 호환. (번들이 자기 규칙으로 거른다.)
  expect('⑦  ·· 인자 값은 검증 없이 통과', decide(root, ['--exposition=compact']).exposition, 'compact');
  expect('⑦  ·· `--exposition v` 공백형도 인식', decide(root, ['--exposition', 'readonly,high']).exposition, 'readonly,high');
}

{
  // ⑦' QA 프로젝트에서도 명시 인자는 그대로 간다 — 이 층은 tier 게이트가 아니다.
  //     (QA write 차단의 정본은 서버 tier 게이트 §7-2다. 여기서 인자를 막으면
  //      기존 수동 등록 경로가 조용히 깨지고, 안전은 한 층도 늘지 않는다.)
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"readonly"}', '.sapkit/sap.env': QA_ENV }), [
    '--exposition=readonly,high',
  ]);
  expect("⑦' 명시 인자는 tier로 재검증하지 않는다(호환 유지)", d.exposition, 'readonly,high');
}

{
  // ⑧ 깨진 JSON은 서버를 못 뜨게 만들면 안 된다 — 축소하고 계속 간다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface": "development"', '.sapkit/sap.env': DEV_ENV }));
  expect('⑧ config JSON 깨짐 → readonly', d.exposition, 'readonly');
  expect('⑧  ·· 코드', codes(d), 'TOOLSURFACE_UNREADABLE');
}

{
  // ⑨ 기존 config.json의 다른 키는 읽지도 쓰지도 않는다 (훅이 쓰는 blocklistProfile).
  const root = project({ '.sapkit/config.json': '{"blocklistProfile":"strict"}', '.sapkit/sap.env': DEV_ENV });
  const before = fs.readFileSync(path.join(root, '.sapkit', 'config.json'), 'utf8');
  const d = decide(root);
  const after = fs.readFileSync(path.join(root, '.sapkit', 'config.json'), 'utf8');
  expect('⑨ toolSurface 키 부재 → readonly', d.exposition, 'readonly');
  expect('⑨  ·· 코드', codes(d), 'TOOLSURFACE_DEFAULT');
  expect('⑨  ·· config.json 무변경 (R-IDEMPOTENT)', after, before);
}

{
  // ⑩ 세대. legacy-only 프로젝트의 config도 그대로 읽힌다 (R-PRESERVE).
  const d = decide(project({ '.sc4sap/config.json': '{"toolSurface":"development"}', '.sc4sap/sap.env': DEV_ENV }));
  expect('⑩ .sc4sap 세대의 config도 읽는다', d.exposition, 'readonly,high');
}

{
  // ⑩' 연결을 준 세대와 다른 세대의 config는 읽지 않는다 — split-brain 방지.
  const d = decide(project({ '.sapkit/sap.env': DEV_ENV, '.sc4sap/config.json': '{"toolSurface":"development"}' }));
  expect("⑩' 다른 세대의 development는 무시된다", d.exposition, 'readonly');
}

{
  // ⑩'' 빈 .sapkit 껍데기가 연결·설정을 가진 .sc4sap을 가리면 안 된다 (R-TIE 순서).
  const d = decide(
    project({ '.sc4sap/config.json': '{"toolSurface":"development"}', '.sc4sap/sap.env': DEV_ENV }, ['.sapkit']),
  );
  expect("⑩'' 빈 .sapkit 껍데기는 legacy 설정을 가리지 않는다", d.exposition, 'readonly,high');
}

{
  // ⑩''' 기본값 안내문은 이 런처가 **실제로 읽는** config.json을 가리켜야 한다 —
  //      legacy 세대 프로젝트에 `.sapkit/config.json`을 지시하면 따라 해도 아무
  //      효과가 없다(죽은 지시 · 실사용 제보 ZUNIVAT_RAP 2026-08-03 ②).
  const root = project({ '.sc4sap/sap.env': DEV_ENV });
  const d = decide(root);
  expect("⑩''' legacy 세대 · config 부재 → 코드", codes(d), 'TOOLSURFACE_DEFAULT');
  const msg = d.notices[0]?.message ?? '';
  if (msg.includes(path.join(root, '.sc4sap', 'config.json'))) ok("⑩'''  ·· 안내가 .sc4sap/config.json을 가리킨다");
  else bad("⑩'''  ·· 안내가 .sc4sap/config.json을 가리킨다", msg);
  if (!msg.includes(`${path.sep}.sapkit${path.sep}config.json`)) ok("⑩'''  ·· .sapkit 경로를 지시하지 않는다");
  else bad("⑩'''  ·· .sapkit 경로를 지시하지 않는다", msg);

  // 키만 없는 기존 config.json이 있으면 그 파일 자체를 지시한다.
  const root2 = project({ '.sapkit/config.json': '{"blocklistProfile":"strict"}', '.sapkit/sap.env': DEV_ENV });
  const m2 = decide(root2).notices[0]?.message ?? '';
  const cfg2 = path.join(root2, '.sapkit', 'config.json');
  if (m2.lastIndexOf(cfg2) > m2.indexOf(cfg2)) ok("⑩'''  ·· 기존 config.json이 지시 대상으로 반복된다");
  else bad("⑩'''  ·· 기존 config.json이 지시 대상으로 반복된다", m2);

  // 세대 미해석(연결 없음) 프로젝트는 양쪽 후보를 함께 안내한다.
  const m0 = decide(project({})).notices[0]?.message ?? '';
  if (m0.includes('.sapkit/config.json') && m0.includes('.sc4sap/config.json')) ok("⑩'''  ·· 세대 미해석이면 양쪽 후보를 안내한다");
  else bad("⑩'''  ·· 세대 미해석이면 양쪽 후보를 안내한다", m0);
}

{
  // ⑪ 인자 정리. 번들 파서는 **첫** --exposition을 채택하므로, 빈 인자를 남긴 채
  //    뒤에 덧붙이면 번들은 "미지정"으로 읽고 자기 기본값 readonly,high를 연다.
  const d = decide(project({ '.sapkit/config.json': '{"toolSurface":"readonly"}' }), [
    '--exposition=',
    '--env-path',
    'x.env',
  ]);
  expect('⑪ 빈 --exposition= 는 명시 인자로 치지 않는다', d.exposition, 'readonly');
  expect('⑪  ·· 잔여 --exposition 0개', d.rest.filter((a) => a.startsWith('--exposition')).length, 0);
  expect('⑪  ·· 다른 인자는 보존', d.rest.join(' '), '--env-path x.env');
}

// ── ⑵ 배달 경로 ────────────────────────────────────────────────────────────
console.log('\n⑵ 배달 경로 (subprocess · 실 shim + 스텁 번들)');

// 실 shim을 그대로 복사하고 번들만 스텁으로 바꾼다. 스텁은 **진짜 번들의 파서와 같은
// 규칙**(좌→우 첫 매치)으로 argv를 읽어, shim이 실제로 무엇을 넘겼는지 관측한다.
const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-probe-'));
tmpRoots.push(probeDir);
fs.copyFileSync(LAUNCH, path.join(probeDir, 'launch.cjs'));
fs.writeFileSync(
  path.join(probeDir, 'server.bundle.cjs'),
  `const a = process.argv.slice(2);
let first = null;
let count = 0;
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith('--exposition=')) { count++; if (first === null) first = a[i].slice('--exposition='.length); }
  else if (a[i] === '--exposition') { count++; if (first === null) first = i + 1 < a.length ? a[++i] : ''; else i++; }
}
process.stdout.write(JSON.stringify({
  exposition: first, count, envPath: process.env.MCP_ENV_PATH ?? null,
}));
`,
);

function boot(cwd, args = []) {
  const env = { ...process.env };
  delete env.SAPKIT_HOME_DIR;
  delete env.SC4SAP_HOME_DIR;
  delete env.MCP_ENV_PATH;
  // 실사용자 홈 무접촉 — 이 시험은 프로젝트 로컬 sap.env만 쓴다.
  env.HOME = cwd;
  env.USERPROFILE = cwd;
  const r = spawnSync('node', [path.join(probeDir, 'launch.cjs'), ...args], { cwd, env, encoding: 'utf8' });
  let parsed = { exposition: null, count: null, envPath: null };
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    /* 스텁이 못 떴으면 아래 단언이 잡는다 */
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ...parsed };
}

{
  const r = boot(project({}));
  expect('⑫ 빈 프로젝트를 실기동하면 번들이 readonly를 본다', r.exposition, 'readonly');
  expect('⑫  ·· --exposition 인자는 정확히 1개', r.count, 1);
  expect('⑫  ·· 연결 없음 (inspection-only)', r.envPath, null);
}

{
  const root = project({ '.sapkit/config.json': '{"toolSurface":"development"}', '.sapkit/sap.env': DEV_ENV });
  const r = boot(root);
  expect('⑬ DEV + development 실기동 → 번들이 readonly,high를 본다', r.exposition, 'readonly,high');
  expect('⑬  ·· MCP_ENV_PATH가 그 sap.env를 가리킨다', r.envPath, path.join(root, '.sapkit', 'sap.env'));
}

{
  const r = boot(project({ '.sapkit/config.json': '{"toolSurface":"development"}', '.sapkit/sap.env': QA_ENV }));
  expect('⑭ QA 실기동 → 번들이 readonly를 본다', r.exposition, 'readonly');
  expect('⑭  ·· 이유가 stderr에 정확히 1회', (r.stderr.match(/TOOLSURFACE_FAIL_CLOSED/g) ?? []).length, 1);
  if (!r.stdout.includes('TOOLSURFACE')) ok('⑭  ·· 진단이 stdout(JSON-RPC 채널)을 오염시키지 않는다');
  else bad('⑭  ·· 진단이 stdout을 오염시키지 않는다', r.stdout.slice(0, 200));
}

{
  // 빈 인자를 흘려도 번들이 보는 값은 하나뿐이어야 한다 — 이것이 무너지면 번들이
  // "미지정"으로 읽고 자기 기본값(readonly,high)을 연다.
  const r = boot(project({ '.sapkit/config.json': '{"toolSurface":"readonly"}' }), ['--exposition=']);
  expect('⑮ 빈 --exposition= 를 흘려도 번들이 보는 값은 readonly', r.exposition, 'readonly');
  expect('⑮  ·· 인자 1개', r.count, 1);
}

{
  // 기존 수동 등록 경로(레포의 extract 도구가 실제로 이렇게 부른다)가 그대로 산다.
  const r = boot(project({ '.sapkit/sap.env': DEV_ENV }), ['--exposition=readonly,high']);
  expect('⑯ 명시 인자 경유 실기동 → 그대로 전달', r.exposition, 'readonly,high');
  expect('⑯  ·· 인자 1개', r.count, 1);
}

{
  // 계약 보존: 모듈로 require해도 번들은 뜨지 않는다. 이 파일 맨 위의 require가
  // 이미 그것을 증명했다(번들이 떴다면 stdio를 잡고 멈췄을 것) — 여기서는 노출된
  // 표면이 실제로 있는지를 확인한다.
  const missing = ['decideExposition', 'selectGeneration', 'readToolSurface', 'splitExpositionArgs', 'main'].filter(
    (k) => typeof launch[k] !== 'function',
  );
  if (missing.length === 0) ok('⑰ require()는 번들을 띄우지 않고 순수 함수만 노출한다');
  else bad('⑰ require()는 번들을 띄우지 않고 순수 함수만 노출한다', `누락: ${missing.join(', ')}`);
}

// ── ⑶ 비공허 증명 ──────────────────────────────────────────────────────────
// 진리표에 새로 등재한 케이스가 장식이 아님을 실측한다: 런처의 해당 분기를 지우면
// 적합성 러너가 red가 된다. (게이트 음성시험의 `--consumer-root` 패턴 재사용 —
// 없는 파일은 실물로 폴백하므로 번들 수 MB를 복사하지 않는다.)
console.log('\n⑶ 비공허 증명 (진리표 케이스 ↔ 런처 변조)');

function runRunner(caseId, extra = []) {
  try {
    return { code: 0, out: execFileSync('node', [RUNNER, '--case', caseId, ...extra], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

function mutantOverlay(replacements) {
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-mutant-'));
  tmpRoots.push(overlay);
  const dst = path.join(overlay, 'server', 'launch.cjs');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  let src = fs.readFileSync(LAUNCH, 'utf8');
  for (const [from, to] of replacements) {
    if (!src.includes(from)) throw new Error(`변조 앵커를 찾지 못했다 — 런처 구조가 바뀌었다: ${from}`);
    src = src.replace(from, to);
  }
  fs.writeFileSync(dst, src);
  return overlay;
}

function nonVacuous(label, caseId, replacements) {
  const control = runRunner(caseId);
  if (control.code !== 0) {
    bad(`${label} — 대조군(무변조)이 이미 실패한다 (${caseId})`, control.out.split('\n').slice(-15).join('\n'));
    return;
  }
  let overlay;
  try {
    overlay = mutantOverlay(replacements);
  } catch (err) {
    bad(`${label} — 변조 실패`, err.message);
    return;
  }
  const red = runRunner(caseId, ['--consumer-root', overlay]);
  if (red.code === 1 && red.out.includes('launch')) ok(`${label} — 변조하면 러너가 red (${caseId})`);
  else bad(`${label} — 변조해도 러너가 잡지 못했다 (exit ${red.code})`, red.out.split('\n').slice(-20).join('\n'));
}

nonVacuous('R-DEV tier 게이트', 'surface-development-on-qa', [
  ['  const raw = readEnvValue(envPath, "SAP_TIER");', '  const raw = "DEV"; // 변조: tier를 읽지 않는다'],
]);

nonVacuous('세대 split-brain 방지', 'surface-config-in-other-generation', [
  [
    '  const dirs = selectedDir ? [selectedDir] : [path.join(cwd, NEW_DIR), path.join(cwd, LEGACY_DIR)];',
    '  const dirs = [path.join(cwd, NEW_DIR), path.join(cwd, LEGACY_DIR)]; // 변조: 선택된 세대를 무시',
  ],
]);

nonVacuous('R-DEFAULT 바닥선(미고정 케이스 전체)', 'depth-0', [
  [
    '    return { exposition: SURFACE_READONLY, source: "default", rest, notices, surface };',
    '    return { exposition: SURFACE_DEVELOPMENT, source: "default", rest, notices, surface }; // 변조',
  ],
]);

// ── 마무리 ─────────────────────────────────────────────────────────────────
for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
