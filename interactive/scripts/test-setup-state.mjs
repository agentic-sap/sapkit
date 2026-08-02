#!/usr/bin/env node
// setup-state.mjs 시험 — §8-2 계약이 '통과만 하는 장식'이 아님을 증명한다.
// 음성시험(비밀 필드 거부·깨진 JSON 거부·기존 값 무접촉·계획 어긋남 거부)을 포함한다.
//
// 완전 격리: 홈은 `SAPKIT_HOME_DIR` + `HOME`/`USERPROFILE` 스텁으로 임시 디렉터리에
// 가둔다 — 사용자 실제 홈(`~/.sapkit`, 구 세대 홈)은 읽지도 쓰지도 않는다. 계획 파일은
// 프로젝트/홈 **밖**에 두어 "쓰기 없음" 스냅샷 대조를 오염시키지 않는다.
//
// exit 0 전 시나리오 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'setup-state.mjs');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-state-test-'));
const HOME_STUB = path.join(ROOT, 'home-stub');
const PLANS = path.join(ROOT, 'plans');
fs.mkdirSync(HOME_STUB, { recursive: true });
fs.mkdirSync(PLANS, { recursive: true });

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}`);
    if (detail !== undefined) console.log(`       ${detail}`);
    fail++;
  }
}

// ── 러너 ────────────────────────────────────────────────────────────────────
function run(args, env = {}) {
  const base = { ...process.env };
  delete base.SAPKIT_HOME_DIR;
  delete base.SC4SAP_HOME_DIR;
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...base, HOME: HOME_STUB, USERPROFILE: HOME_STUB, ...env },
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* --json 없이 부른 경우 */
  }
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', json };
}

let caseNo = 0;
function newCase(title) {
  caseNo++;
  console.log(`\n${caseNo}. ${title}`);
  const dir = path.join(ROOT, `case-${caseNo}`);
  const project = path.join(dir, 'project');
  const home = path.join(dir, 'home');
  fs.mkdirSync(project, { recursive: true });
  return { project, home, env: { SAPKIT_HOME_DIR: home } };
}

// ── 파일 유틸 ───────────────────────────────────────────────────────────────
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function snapshot(...roots) {
  const out = new Map();
  for (const root of roots) {
    (function walk(dir) {
      let ents;
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else out.set(abs, sha(fs.readFileSync(abs)));
      }
    })(root);
  }
  return out;
}
function sameSnapshot(a, b) {
  if (a.size !== b.size) return `파일 수 ${a.size} → ${b.size}`;
  for (const [k, v] of a) {
    if (!b.has(k)) return `사라짐: ${k}`;
    if (b.get(k) !== v) return `내용 변경: ${k}`;
  }
  return null;
}
function writeInput(name, obj) {
  const p = path.join(PLANS, `${name}.input.json`);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  return p;
}
function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/** plan --out → apply. 계획 파일은 프로젝트/홈 밖(PLANS)에 둔다. */
function planApply(c, name, input) {
  const inputFile = writeInput(name, input);
  const planFile = path.join(PLANS, `${name}.plan.json`);
  const plan = run(['plan', '--project', c.project, '--input', inputFile, '--out', planFile, '--json'], c.env);
  if (plan.code !== 0) return { plan, apply: null };
  const apply = run(['apply', '--project', c.project, '--plan', planFile, '--json'], c.env);
  return { plan, apply, planFile, inputFile };
}

const BASE_INPUT = {
  profile: {
    alias: 'KR-DEV',
    env: {
      SAP_URL: 'https://sap.example.test:44300',
      SAP_CLIENT: '100',
      SAP_USERNAME: 'DEVUSER',
      SAP_TIER: 'DEV',
      SAP_ACTIVE_MODULES: 'FI,CO',
      MCP_BLOCKLIST_PROFILE: 'standard',
    },
  },
  project: { activeProfile: 'KR-DEV', config: { sapVersion: 'S4', abapRelease: '758', toolSurface: 'readonly' } },
};

console.log('setup-state 계약 시험 (status/plan/apply/verify)');

// ── ① 빈 프로젝트 status ────────────────────────────────────────────────────
{
  const c = newCase('빈 프로젝트 status → 구조적 JSON · 쓰기 0');
  const before = snapshot(c.project, c.home);
  const r = run(['status', '--project', c.project, '--json'], c.env);
  check('exit 0', r.code === 0, `실제 exit ${r.code} / ${r.stderr.trim()}`);
  check('JSON 파싱 가능', r.json !== null, r.stdout.slice(0, 120));
  check('runtimeDir = <project>/.sapkit', r.json?.runtimeDir === path.join(c.project, '.sapkit'), r.json?.runtimeDir);
  check('runtimeGeneration = sapkit', r.json?.runtimeGeneration === 'sapkit');
  check('활성 프로파일 없음', r.json?.activeProfile?.alias === null);
  check('config 없음', r.json?.config?.exists === false);
  check('클라이언트 3종 boolean 보고', ['claude', 'codex', 'antigravity'].every((k) => typeof r.json?.clients?.[k] === 'boolean'), JSON.stringify(r.json?.clients));
  check('범위 밖 항목은 보고만(훅·vsp·권한)', typeof r.json?.outOfScope?.hooksInstaller === 'boolean');
  check('status 는 아무것도 쓰지 않는다', sameSnapshot(before, snapshot(c.project, c.home)) === null);
}

// ── ② plan → apply 첫 실행 ──────────────────────────────────────────────────
const firstRun = (() => {
  const c = newCase('plan → apply 첫 실행 → 기대 파일 3종 생성');
  const { plan, apply } = planApply(c, 'first', BASE_INPUT);
  check('plan exit 0', plan.code === 0, plan.stderr.trim());
  check('plan 이 3개 action 을 낸다', plan.json?.actions?.length === 3, JSON.stringify(plan.json?.actions?.map((a) => a.kind)));
  check('plan action 은 전부 create', plan.json?.actions?.every((a) => a.op === 'create'), JSON.stringify(plan.json?.actions?.map((a) => a.op)));
  check('plan 에 절대경로가 담긴다', plan.json?.actions?.every((a) => path.isAbsolute(a.target)));
  check('plan restartRequired = true', plan.json?.restartRequired === true);
  check('apply exit 0', apply.code === 0, apply.stderr.trim());

  const envFile = path.join(c.home, 'profiles', 'KR-DEV', 'sap.env');
  const pointer = path.join(c.project, '.sapkit', 'active-profile.txt');
  const config = path.join(c.project, '.sapkit', 'config.json');
  check('sap.env 생성', fs.existsSync(envFile), envFile);
  check('active-profile.txt 생성', fs.existsSync(pointer));
  check('config.json 생성', fs.existsSync(config));

  const envText = fs.existsSync(envFile) ? read(envFile) : '';
  check('sap.env 에 SAP_PASSWORD= 빈 줄', /^SAP_PASSWORD=$/m.test(envText), JSON.stringify(envText));
  check('sap.env 에 비밀번호 값 없음', !/^SAP_PASSWORD=.+$/m.test(envText));
  check('sap.env 에 입력한 비-비밀 필드 기입', envText.includes('SAP_URL=https://sap.example.test:44300') && envText.includes('SAP_TIER=DEV'));
  check('sap.env 신규 파일 EOL = LF', envText.length > 0 && !envText.includes('\r'));
  check('active-profile.txt = 별칭 한 줄', read(pointer) === 'KR-DEV\n', JSON.stringify(fs.existsSync(pointer) ? read(pointer) : null));
  check('config.json 2-space·무BOM·LF', read(config) === '{\n  "sapVersion": "S4",\n  "abapRelease": "758",\n  "toolSurface": "readonly"\n}\n', JSON.stringify(read(config)));
  return c;
})();

// ── ③ 재실행 byte diff 0 ────────────────────────────────────────────────────
{
  caseNo++;
  console.log(`\n${caseNo}. 같은 입력 재실행 → byte diff 0 (전 파일 sha 대조)`);
  const c = firstRun;
  const before = snapshot(c.project, c.home);
  const { plan, apply } = planApply(c, 'second', BASE_INPUT);
  check('2회차 plan exit 0', plan.code === 0, plan.stderr.trim());
  check('2회차 plan 은 전부 noop', plan.json?.actions?.every((a) => a.op === 'noop'), JSON.stringify(plan.json?.actions?.map((a) => a.op)));
  check('2회차 plan restartRequired = false', plan.json?.restartRequired === false);
  check('2회차 apply exit 0', apply.code === 0, apply.stderr.trim());
  check('2회차 apply 가 쓴 파일 0건', apply.json?.applied?.length === 0, JSON.stringify(apply.json?.applied));
  const diff = sameSnapshot(before, snapshot(c.project, c.home));
  check('전 파일 sha 동일 (byte diff 0)', diff === null, diff);
}

// ── ④ 알 수 없는 키·키 순서 보존 ────────────────────────────────────────────
{
  const c = newCase('기존 config.json 의 알 수 없는 키·키 순서 보존');
  const dir = path.join(c.project, '.sapkit');
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(
    config,
    '{\n  "zzzCustom": { "keep": true },\n  "sapVersion": "ECC",\n  "blocklistProfile": "strict"\n}\n',
    'utf8',
  );
  const { plan, apply } = planApply(c, 'preserve', { project: { config: { sapVersion: 'S4', toolSurface: 'readonly' } } });
  check('plan exit 0', plan.code === 0, plan.stderr.trim());
  check('변경 필드는 sapVersion·toolSurface 뿐', JSON.stringify(plan.json?.actions?.[0]?.fields) === JSON.stringify(['sapVersion', 'toolSurface']), JSON.stringify(plan.json?.actions?.[0]?.fields));
  check('plan 이 보존할 알 수 없는 키를 보고', JSON.stringify(plan.json?.actions?.[0]?.preservedUnknownKeys) === JSON.stringify(['zzzCustom']), JSON.stringify(plan.json?.actions?.[0]?.preservedUnknownKeys));
  check('apply exit 0', apply.code === 0, apply.stderr.trim());
  const after = JSON.parse(read(config));
  check('알 수 없는 키 값 보존', JSON.stringify(after.zzzCustom) === JSON.stringify({ keep: true }));
  check('기존 설정(blocklistProfile) 보존', after.blocklistProfile === 'strict');
  check('요청 필드만 갱신', after.sapVersion === 'S4');
  check('키 순서 보존 + 새 키는 뒤에', JSON.stringify(Object.keys(after)) === JSON.stringify(['zzzCustom', 'sapVersion', 'blocklistProfile', 'toolSurface']), JSON.stringify(Object.keys(after)));
}

// ── ⑤ 깨진 JSON 거부 ────────────────────────────────────────────────────────
{
  const c = newCase('깨진 config.json → BLOCKED · 기존 파일 무접촉 (음성)');
  const dir = path.join(c.project, '.sapkit');
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, '{ "sapVersion": "S4",,, broken\n', 'utf8');
  const before = snapshot(c.project, c.home);
  const inputFile = writeInput('broken', { project: { config: { toolSurface: 'readonly' } } });
  const r = run(['plan', '--project', c.project, '--input', inputFile, '--json'], c.env);
  check('exit 1', r.code === 1, `실제 exit ${r.code}`);
  check('status = BLOCKED', r.json?.status === 'BLOCKED', r.json?.status);
  check('action 0건', r.json?.actions?.length === 0);
  check('오류에 대상 경로 명시', (r.json?.errors ?? []).some((e) => e.includes('config.json')), JSON.stringify(r.json?.errors));
  check('기존 파일 무접촉', sameSnapshot(before, snapshot(c.project, c.home)) === null);
}

// ── ⑥ 입력의 비밀 필드 거부 ─────────────────────────────────────────────────
{
  const c = newCase('입력에 password/secret/token 필드 → 거부 (음성)');
  const before = snapshot(c.project, c.home);
  const cases = [
    ['profile.env.SAP_PASSWORD', { profile: { alias: 'KR-DEV', env: { SAP_PASSWORD: 'hunter2' } } }],
    ['최상위 password', { password: 'hunter2', project: { config: { toolSurface: 'readonly' } } }],
    ['중첩 apiToken', { project: { config: { toolSurface: 'readonly' }, activeProfile: 'A' }, profile: { alias: 'A', env: {}, apiToken: 'x' } }],
    ['config 안 clientSecret', { project: { config: { clientSecret: 'x' } } }],
  ];
  for (const [label, obj] of cases) {
    const f = writeInput(`secret-${label.replace(/[^a-z]/gi, '')}`, obj);
    const r = run(['plan', '--project', c.project, '--input', f, '--json'], c.env);
    check(`${label} → exit 1 · BLOCKED`, r.code === 1 && r.json?.status === 'BLOCKED', `exit ${r.code} / ${JSON.stringify(r.json?.errors)}`);
    check(`${label} → 비밀 필드를 이유로 명시`, (r.json?.errors ?? []).some((e) => e.includes('비밀')), JSON.stringify(r.json?.errors));
  }
  check('거부 뒤에도 파일 시스템 무변화', sameSnapshot(before, snapshot(c.project, c.home)) === null);
}

// ── ⑦ 기존 sap.env 값 보존 ──────────────────────────────────────────────────
{
  const c = newCase('기존 sap.env 값 보존 — 비밀번호·기존 값 무접촉 (음성)');
  const profileDir = path.join(c.home, 'profiles', 'KR-DEV');
  fs.mkdirSync(profileDir, { recursive: true });
  const envFile = path.join(profileDir, 'sap.env');
  fs.writeFileSync(envFile, '# 사람이 쓴 주석\nSAP_URL=https://old.example.test\nSAP_PASSWORD=super-secret-value\n', 'utf8');
  const beforeSha = sha(fs.readFileSync(envFile));

  // (a) 기존 값과 충돌하는 입력만 → 아무것도 쓰지 않는다
  const conflictOnly = planApply(c, 'env-conflict', { profile: { alias: 'KR-DEV', env: { SAP_URL: 'https://new.example.test' } } });
  check('충돌만 있는 계획은 noop', conflictOnly.plan.json?.actions?.[0]?.op === 'noop', JSON.stringify(conflictOnly.plan.json?.actions?.[0]));
  check('충돌 키를 이름으로 보고', JSON.stringify(conflictOnly.plan.json?.actions?.[0]?.conflicts) === JSON.stringify(['SAP_URL']), JSON.stringify(conflictOnly.plan.json?.actions?.[0]?.conflicts));
  check('apply 후에도 sap.env 무접촉', sha(fs.readFileSync(envFile)) === beforeSha);

  // (b) 없는 키 추가 + 충돌 키 보존을 한 번에
  const mixed = planApply(c, 'env-mixed', { profile: { alias: 'KR-DEV', env: { SAP_URL: 'https://new.example.test', SAP_CLIENT: '100', SAP_TIER: 'DEV' } } });
  check('없는 키만 필드로 잡힌다', JSON.stringify(mixed.plan.json?.actions?.[0]?.fields) === JSON.stringify(['SAP_CLIENT', 'SAP_TIER']), JSON.stringify(mixed.plan.json?.actions?.[0]?.fields));
  check('apply exit 0', mixed.apply.code === 0, mixed.apply.stderr.trim());
  const after = read(envFile);
  check('기존 비밀번호 값 그대로', after.includes('SAP_PASSWORD=super-secret-value'));
  check('기존 SAP_URL 값 그대로', after.includes('SAP_URL=https://old.example.test') && !after.includes('new.example.test'));
  check('주석 보존', after.startsWith('# 사람이 쓴 주석'));
  check('없던 키만 덧붙음', after.includes('SAP_CLIENT=100') && after.includes('SAP_TIER=DEV'));

  // (c) 어느 출력에도 비밀값이 없다
  const outs = [
    run(['status', '--project', c.project, '--json'], c.env),
    run(['verify', '--project', c.project, '--client', 'auto', '--json'], c.env),
    conflictOnly.plan,
    mixed.apply,
  ];
  const leaked = outs.filter((o) => (o.stdout + o.stderr).includes('super-secret-value') || (o.stdout + o.stderr).includes('old.example.test'));
  check('status/verify/plan/apply 출력에 비밀값·기존 값 노출 0', leaked.length === 0, `${leaked.length}건 누출`);
}

// ── ⑧ plan 단독은 파일 시스템 무변화 ────────────────────────────────────────
{
  const c = newCase('apply 없이 plan 만으로는 파일 시스템 무변화');
  const before = snapshot(c.project, c.home);
  const inputFile = writeInput('plan-only', BASE_INPUT);
  const r = run(['plan', '--project', c.project, '--input', inputFile, '--json'], c.env);
  check('plan exit 0', r.code === 0, r.stderr.trim());
  check('plan 이 create 3건을 예고', r.json?.actions?.filter((a) => a.op === 'create').length === 3);
  const diff = sameSnapshot(before, snapshot(c.project, c.home));
  check('프로젝트·홈 무변화', diff === null, diff);
  check('홈 프로파일 디렉터리도 안 만든다', !fs.existsSync(path.join(c.home, 'profiles')));
  check('plan 출력에 비밀 없음(입력에 비밀이 없으므로 자명)', !r.stdout.includes('SAP_PASSWORD='));
}

// ── ⑨ verify 상태 판정 ──────────────────────────────────────────────────────
{
  const c = newCase('verify 종료 상태 판정 (§8-3 enum)');
  const v0 = run(['verify', '--project', c.project, '--client', 'auto', '--json'], c.env);
  check('프로파일 없음 → READY_INSPECTION', v0.json?.state === 'READY_INSPECTION', v0.json?.state);
  check('exit 0 (실패 아님)', v0.code === 0);
  check('SAP 실연결은 검사하지 않음을 명시', v0.json?.sapConnectionChecked === false);

  planApply(c, 'verify-base', BASE_INPUT);
  const v1 = run(['verify', '--project', c.project, '--json'], c.env);
  check('비밀번호 빈 채 프로파일만 → READY_INSPECTION', v1.json?.state === 'READY_INSPECTION', `${v1.json?.state} / ${JSON.stringify(v1.json?.reasons)}`);

  // 사람이 비밀번호를 채운 뒤 (이 도구가 하지 않는 일)
  const envFile = path.join(c.home, 'profiles', 'KR-DEV', 'sap.env');
  fs.writeFileSync(envFile, read(envFile).replace('SAP_PASSWORD=', 'SAP_PASSWORD=filled-by-human'), 'utf8');
  const v2 = run(['verify', '--project', c.project, '--json'], c.env);
  check('비밀번호 기입 + toolSurface readonly → READY_READONLY', v2.json?.state === 'READY_READONLY', `${v2.json?.state} / ${JSON.stringify(v2.json?.reasons)}`);

  const v3 = run(['verify', '--project', c.project, '--restart-pending', '--json'], c.env);
  check('--restart-pending → RESTART_REQUIRED', v3.json?.state === 'RESTART_REQUIRED', v3.json?.state);

  planApply(c, 'verify-dev', { project: { config: { toolSurface: 'development' } } });
  const v4 = run(['verify', '--project', c.project, '--json'], c.env);
  check('development + SAP_TIER=DEV → READY_DEVELOPMENT', v4.json?.state === 'READY_DEVELOPMENT', `${v4.json?.state} / ${JSON.stringify(v4.json?.reasons)}`);

  fs.writeFileSync(envFile, read(envFile).replace('SAP_TIER=DEV', 'SAP_TIER=QA'), 'utf8');
  const v5 = run(['verify', '--project', c.project, '--json'], c.env);
  check('development + QA → READY_READONLY 로 축소(fail-closed)', v5.json?.state === 'READY_READONLY', `${v5.json?.state} / ${JSON.stringify(v5.json?.reasons)}`);

  // 포인터가 없는 프로파일을 가리키면 BLOCKED
  fs.writeFileSync(path.join(c.project, '.sapkit', 'active-profile.txt'), 'NO-SUCH-PROFILE\n', 'utf8');
  const v6 = run(['verify', '--project', c.project, '--json'], c.env);
  check('없는 프로파일 포인터 → BLOCKED · exit 1', v6.json?.state === 'BLOCKED' && v6.code === 1, `${v6.json?.state} / exit ${v6.code}`);
}

// ── ⑩ 홈 격리 ──────────────────────────────────────────────────────────────
{
  const c = newCase('홈 격리 — SAPKIT_HOME_DIR 만 쓰고 사용자 실제 홈은 무접촉');
  const realHome = path.join(HOME_STUB, '.sapkit');
  const legacyHome = path.join(HOME_STUB, '.sc4sap');
  fs.mkdirSync(legacyHome, { recursive: true });
  const beforeStub = snapshot(HOME_STUB);
  planApply(c, 'home-isolated', BASE_INPUT);
  check('프로파일은 SAPKIT_HOME_DIR 밑에만 생긴다', fs.existsSync(path.join(c.home, 'profiles', 'KR-DEV', 'sap.env')));
  check('~/.sapkit 을 만들지 않는다', !fs.existsSync(realHome));
  check('구 세대 홈 무접촉', sameSnapshot(beforeStub, snapshot(HOME_STUB)) === null);

  const st = run(['status', '--project', c.project, '--json'], c.env);
  check('status 가 구 세대 홈 존재를 보고만 한다', st.json?.legacy?.home?.homeDir === legacyHome, JSON.stringify(st.json?.legacy?.home));
  check('구 세대 이행은 사람 몫임을 안내', (st.json?.legacy?.note ?? '').includes('migrate-runtime-dir.mjs'));
  fs.rmSync(legacyHome, { recursive: true, force: true });
}

// ── ⑪ legacy 프로젝트: 그 자리를 쓰고 평행 .sapkit 을 만들지 않는다 ─────────
{
  const c = newCase('legacy 프로젝트 → 기존 디렉터리에 쓰고 평행 신 디렉터리 미생성 (R-LEGACY)');
  const legacyDir = path.join(c.project, '.sc4sap');
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'active-profile.txt'), 'KR-DEV\n', 'utf8');

  const st = run(['status', '--project', c.project, '--json'], c.env);
  check('runtimeGeneration = sc4sap', st.json?.runtimeGeneration === 'sc4sap', st.json?.runtimeGeneration);
  check('legacy 프로젝트로 보고', st.json?.legacy?.projectIsLegacyOnly === true);

  const { plan, apply } = planApply(c, 'legacy-project', { project: { config: { toolSurface: 'readonly' } } });
  check('대상 경로가 기존 디렉터리', plan.json?.actions?.[0]?.target === path.join(legacyDir, 'config.json'), plan.json?.actions?.[0]?.target);
  check('apply exit 0', apply.code === 0, apply.stderr.trim());
  check('평행 신 디렉터리를 만들지 않는다', !fs.existsSync(path.join(c.project, '.sapkit')));
  check('기존 디렉터리에 config.json 생성', fs.existsSync(path.join(legacyDir, 'config.json')));
}

// ── ⑫ EOL 보존 ─────────────────────────────────────────────────────────────
{
  const c = newCase('기존 파일의 EOL 보존 (CRLF 유지 · 무BOM)');
  const dir = path.join(c.project, '.sapkit');
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, '{\r\n  "sapVersion": "ECC"\r\n}\r\n', 'utf8');
  const profileDir = path.join(c.home, 'profiles', 'KR-DEV');
  fs.mkdirSync(profileDir, { recursive: true });
  const envFile = path.join(profileDir, 'sap.env');
  fs.writeFileSync(envFile, 'SAP_URL=https://crlf.example.test\r\n', 'utf8');

  const { apply } = planApply(c, 'eol', {
    profile: { alias: 'KR-DEV', env: { SAP_CLIENT: '200' } },
    project: { config: { toolSurface: 'readonly' } },
  });
  check('apply exit 0', apply.code === 0, apply.stderr.trim());
  const cfg = fs.readFileSync(config);
  check('config.json CRLF 보존', cfg.toString('utf8').includes('\r\n') && !/[^\r]\n/.test(cfg.toString('utf8')), JSON.stringify(cfg.toString('utf8')));
  check('config.json BOM 없음', cfg[0] !== 0xef);
  check('config.json 내용 갱신', JSON.parse(cfg.toString('utf8')).toolSurface === 'readonly');
  const envText = read(envFile);
  check('sap.env CRLF 보존', envText.includes('\r\n') && !/[^\r]\n/.test(envText), JSON.stringify(envText));
  check('sap.env 에 새 키 추가 + 비밀 빈 줄', envText.includes('SAP_CLIENT=200') && /SAP_PASSWORD=\r\n/.test(envText), JSON.stringify(envText));
}

// ── ⑬ 계획 어긋남 거부 ──────────────────────────────────────────────────────
{
  const c = newCase('계획 수립 이후 디스크가 바뀌면 apply 거부 (음성)');
  const inputFile = writeInput('drift', BASE_INPUT);
  const planFile = path.join(PLANS, 'drift.plan.json');
  const plan = run(['plan', '--project', c.project, '--input', inputFile, '--out', planFile, '--json'], c.env);
  check('plan exit 0', plan.code === 0, plan.stderr.trim());
  // 사람이 그 사이 config.json 을 직접 만들어 버린 상황
  fs.mkdirSync(path.join(c.project, '.sapkit'), { recursive: true });
  fs.writeFileSync(path.join(c.project, '.sapkit', 'config.json'), '{\n  "sapVersion": "S4",\n  "abapRelease": "758",\n  "toolSurface": "readonly"\n}\n', 'utf8');
  const before = snapshot(c.project, c.home);
  const apply = run(['apply', '--project', c.project, '--plan', planFile, '--json'], c.env);
  check('apply exit 1 · BLOCKED', apply.code === 1 && apply.json?.status === 'BLOCKED', `exit ${apply.code} / ${apply.json?.status}`);
  check('아무것도 쓰지 않음', sameSnapshot(before, snapshot(c.project, c.home)) === null);
  check('사람에게 재계획을 요구', (apply.json?.errors ?? []).some((e) => e.includes('plan')), JSON.stringify(apply.json?.errors));

  // 다른 프로젝트의 계획을 먹이면 거부
  const other = path.join(ROOT, `case-${caseNo}-other`);
  fs.mkdirSync(other, { recursive: true });
  const wrong = run(['apply', '--project', other, '--plan', planFile, '--json'], c.env);
  check('다른 프로젝트의 계획 거부 (exit 2)', wrong.code === 2, `exit ${wrong.code}`);
}

// ── ⑭ 구 세대 홈 env 만 설정된 머신 → 프로파일 쓰기 거부 ────────────────────
{
  const c = newCase('SC4SAP_HOME_DIR 만 설정 → 프로파일 쓰기 BLOCKED (보이지 않는 성공 방지)');
  const legacyEnvHome = path.join(c.home, 'legacy-home');
  fs.mkdirSync(legacyEnvHome, { recursive: true });
  const env = { SC4SAP_HOME_DIR: legacyEnvHome };
  const before = snapshot(c.project, c.home, HOME_STUB);
  const inputFile = writeInput('legacy-env', BASE_INPUT);
  const r = run(['plan', '--project', c.project, '--input', inputFile, '--json'], env);
  check('exit 1 · BLOCKED', r.code === 1 && r.json?.status === 'BLOCKED', `exit ${r.code} / ${r.json?.status}`);
  check('이유에 구 env 이름과 처방', (r.json?.errors ?? []).some((e) => e.includes('SC4SAP_HOME_DIR') && e.includes('SAPKIT_HOME_DIR')), JSON.stringify(r.json?.errors));
  check('무변화', sameSnapshot(before, snapshot(c.project, c.home, HOME_STUB)) === null);

  // 프로파일을 요구하지 않는 계획은 통과해야 한다(홈 무관)
  const projOnly = writeInput('legacy-env-projonly', { project: { config: { toolSurface: 'readonly' } } });
  const r2 = run(['plan', '--project', c.project, '--input', projOnly, '--json'], env);
  check('프로젝트 전용 계획은 홈과 무관하게 통과', r2.code === 0 && r2.json?.actions?.length === 1, `exit ${r2.code} / ${JSON.stringify(r2.json?.errors)}`);
}

// ── ⑮ 입력 스키마 음성시험 ──────────────────────────────────────────────────
{
  const c = newCase('입력 스키마 음성시험 — 별칭 경로 주입·알 수 없는 키·잘못된 enum');
  const before = snapshot(c.project, c.home);
  const negatives = [
    ['별칭에 경로 구분자', { profile: { alias: '../evil', env: {} } }],
    ['별칭이 상대경로 점', { profile: { alias: '..', env: {} } }],
    ['알 수 없는 env 키', { profile: { alias: 'A', env: { SAP_WHATEVER: 'x' } } }],
    ['알 수 없는 config 키', { project: { config: { unknownField: 'x' } } }],
    ['toolSurface enum 위반', { project: { config: { toolSurface: 'write' } } }],
    ['알 수 없는 최상위 키', { extra: 1, project: { config: { toolSurface: 'readonly' } } }],
    ['적용할 것이 없음', {}],
  ];
  for (const [label, obj] of negatives) {
    const f = writeInput(`neg-${label.replace(/[^a-z]/gi, '')}`, obj);
    const r = run(['plan', '--project', c.project, '--input', f, '--json'], c.env);
    check(`${label} → exit 1 · BLOCKED`, r.code === 1 && r.json?.status === 'BLOCKED', `exit ${r.code} / ${JSON.stringify(r.json?.errors)}`);
  }
  const bad = path.join(PLANS, 'not-json.json');
  fs.writeFileSync(bad, 'not json at all', 'utf8');
  const r = run(['plan', '--project', c.project, '--input', bad, '--json'], c.env);
  check('입력 파일 자체가 JSON 아님 → exit 2', r.code === 2, `exit ${r.code}`);
  const missing = run(['plan', '--project', c.project, '--json'], c.env);
  check('--input 누락 → exit 2', missing.code === 2, `exit ${missing.code}`);
  const noProject = run(['status', '--json'], c.env);
  check('--project 누락 → exit 2 (cwd 로 넘어가지 않는다)', noProject.code === 2, `exit ${noProject.code}`);
  check('음성시험 뒤 무변화', sameSnapshot(before, snapshot(c.project, c.home)) === null);
}

// ── ⑯ 사람용 텍스트 출력 ────────────────────────────────────────────────────
{
  const c = newCase('--json 없으면 사람용 텍스트 (기계 파싱용 JSON 아님)');
  const r = run(['status', '--project', c.project], c.env);
  check('exit 0', r.code === 0, r.stderr.trim());
  check('JSON 이 아니다', (() => { try { JSON.parse(r.stdout); return false; } catch { return true; } })());
  check('핵심 사실을 사람 말로 담는다', r.stdout.includes('런타임 디렉터리') && r.stdout.includes('클라이언트'), r.stdout.slice(0, 200));
}

// ── ⑰ 그림자 프로파일 경고 ─────────────────────────────────────────────────
{
  const c = newCase('구 세대 홈에 같은 별칭이 있으면 계획이 경고한다 (그림자 프로파일)');
  const stub = path.join(ROOT, `case-${caseNo}-home`);
  const legacyTwin = path.join(stub, '.sc4sap', 'profiles', 'KR-DEV');
  fs.mkdirSync(legacyTwin, { recursive: true });
  fs.writeFileSync(path.join(legacyTwin, 'sap.env'), 'SAP_URL=https://live.example.test\nSAP_PASSWORD=live\n', 'utf8');
  const env = { HOME: stub, USERPROFILE: stub }; // SAPKIT_HOME_DIR 없음 → 기본 홈 사용
  const before = snapshot(stub, c.project);
  const inputFile = writeInput('shadow', BASE_INPUT);
  const r = run(['plan', '--project', c.project, '--input', inputFile, '--json'], env);
  check('plan exit 0 (막지는 않는다)', r.code === 0, r.stderr.trim());
  check('대상은 신 세대 홈', r.json?.actions?.[0]?.target === path.join(stub, '.sapkit', 'profiles', 'KR-DEV', 'sap.env'), r.json?.actions?.[0]?.target);
  check('구 세대 쌍둥이를 경고', (r.json?.warnings ?? []).some((w) => w.includes(path.join(stub, '.sc4sap'))), JSON.stringify(r.json?.warnings));
  check('경고 단계에서도 쓰기 0', sameSnapshot(before, snapshot(stub, c.project)) === null);
  check('구 세대 프로파일 무접촉', read(path.join(legacyTwin, 'sap.env')).includes('SAP_PASSWORD=live'));
}

// ── 정리 ────────────────────────────────────────────────────────────────────
try {
  fs.rmSync(ROOT, { recursive: true, force: true });
} catch {
  /* 임시 디렉터리 정리 실패는 판정에 영향을 주지 않는다 */
}

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
