#!/usr/bin/env node
// test-hook-decisions.mjs — 안전 훅 4종의 **stdin→판정** 채록 시험.
//
// ───────────────────────────── 무엇을 지키는가 ──────────────────────────────
// 이 레포에는 훅의 **판정 로직**을 재는 시험이 없었다 — `test-hook-switch.mjs`는
// 설치·제거 메커니즘만 재고, 「어떤 페이로드에 어떤 판정이 나오는가」는 아무도 재지
// 않았다. 이 러너가 그 공백을 메꾼다: 훅을 자식 프로세스로 띄워 stdin에 PreToolUse
// JSON을 넣고 stdout 판정(JSON, 또는 무출력 = 허용)을 단언한다.
//
// 기대값은 **현행 훅의 실측 판정을 채록한 것**이고 러너 안에 하드코딩된다(외부 픽스처
// 파일 없음). 그래서 훅을 재구현해도 같은 러너가 그대로 회귀 기준이 된다 — 기대값이
// 깨지면 재구현이 판정을 옮긴 것이므로, 의도한 변경이면 여기서 함께 고쳐야 한다.
//
// 대상 4종 (PreToolUse에서 판정을 내는 훅):
//   block-forbidden-tables.mjs           fail CLOSED — deny / warn은 ask
//   tier-readonly-guard.mjs              fail CLOSED — tier 미해석도 deny
//   prefer-sqlquery-explicit-fields.mjs  fail OPEN   — 파싱 실패는 통과(비대칭이 설계)
//   transport-validator.mjs              advisory    — additionalContext, 차단 없음
// 범위 밖: `offline-code-analysis.mjs`(PostToolUse · 검사기 번들 기동) ·
//          `syntax-checker.mjs`(PostToolUseFailure) · `install-hooks.mjs`(설치기).
//
// ─────────────────────────────── 격리 ──────────────────────────────────────
// 훅이 읽는 런타임 상태를 전부 임시 세계로 고정해 머신 상태와 무관하게 만든다.
//  · cwd = 임시 프로젝트 fixture. 두 fail-closed 훅은 cwd에서 위로 걸어 `.sapkit`을
//    찾으므로 **cwd가 곧 정책 입력**이다. 모든 fixture의 `.sapkit`은 profile state를
//    최소 하나 갖는다(config.json ‖ sap.env ‖ active-profile.txt) — profile-resolve의
//    walk가 "state 있는 첫 후보"를 고르므로, state가 없으면 상위 조상(예: 실 사용자
//    홈)의 `.sapkit`을 집어 시험이 머신 의존이 된다.
//  · SAPKIT_HOME_DIR = 임시 프로파일 홈(tier-readonly-guard의 sap.env 출처).
//    HOME/USERPROFILE도 임시 홈으로 덮어 homedir() 폴백까지 막는다.
//  · stdin은 Node `child_process`로 직접 write한다 — PowerShell 파이프는 BOM을 붙여
//    모든 훅을 파싱 실패 경로로만 떨어뜨린다(= fail-closed만 측정되는 함정).
//
// 사용: node interactive/scripts/test-hook-decisions.mjs [--verbose]
// exit 0 통과 / 1 실패

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const HOOKS_DIR = path.join(INTERACTIVE, 'adapters', 'claude', 'hooks');

const HOOK = {
  tables: 'block-forbidden-tables.mjs',
  tier: 'tier-readonly-guard.mjs',
  fields: 'prefer-sqlquery-explicit-fields.mjs',
  transport: 'transport-validator.mjs',
};

const VERBOSE = process.argv.includes('--verbose');

for (const file of Object.values(HOOK)) {
  if (!fs.existsSync(path.join(HOOKS_DIR, file))) {
    console.error(`❌ 훅 부재: ${path.join(HOOKS_DIR, file)}`);
    process.exit(1);
  }
}

// ── 임시 세계 ───────────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-hookdec-'));
process.on('exit', () => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* OS에 맡긴다 */
  }
});

const mk = (p) => {
  fs.mkdirSync(p, { recursive: true });
  return p;
};

const FAKE_HOME = mk(path.join(ROOT, 'home'));
const PROFILE_HOME = mk(path.join(ROOT, 'sapkit-home'));
const MISSING_HOME = path.join(ROOT, 'sapkit-home-does-not-exist');

// 프로젝트 fixture: `<ROOT>/proj/<name>/.sapkit/<파일들>`.
// 파일 목록이 비면 안 된다 — profile state 없는 `.sapkit`은 상위 조상으로 새어나간다.
function project(name, files) {
  const dir = mk(path.join(ROOT, 'proj', name));
  const runtime = mk(path.join(dir, '.sapkit'));
  for (const [rel, text] of Object.entries(files)) fs.writeFileSync(path.join(runtime, rel), text, 'utf8');
  return dir;
}

const cfg = (profile) => `${JSON.stringify({ blocklistProfile: profile }, null, 2)}\n`;
const sapEnv = (tier) => `# fixture — 접속 정보 아님\nSAP_URL=https://example.invalid\nSAP_TIER=${tier}\n`;

const FIX = {
  // block-forbidden-tables — 프로파일별
  minimal: project('bft-minimal', { 'config.json': cfg('minimal') }),
  standard: project('bft-standard', { 'config.json': cfg('standard') }),
  strict: project('bft-strict', { 'config.json': cfg('strict') }),
  custom: project('bft-custom', {
    'config.json': cfg('custom'),
    'blocklist-custom.txt': '# 사용자 전용 목록\nZMYSECRET\nZWILD_*\n',
  }),
  extend: project('bft-extend', {
    'config.json': cfg('minimal'),
    'blocklist-extend.txt': '# 사용자 추가\nMARA\n',
  }),
  // config.json 없음 → 기본값 strict. sap.env는 walk를 level 0에 고정하기 위한 state.
  noconfig: project('bft-noconfig', { 'sap.env': sapEnv('dev') }),

  // tier-readonly-guard — alias 포인터별
  dev: project('tier-dev', { 'active-profile.txt': 'dev\n' }),
  qa: project('tier-qa', { 'active-profile.txt': 'qa\n' }),
  prd: project('tier-prd', { 'active-profile.txt': 'prd\n' }),
  weird: project('tier-weird', { 'active-profile.txt': 'weird\n' }),
  // 포인터도 sap.env도 없음 → tier 미해석. config.json은 level 0 고정용.
  notier: project('tier-notier', { 'config.json': cfg('strict') }),
  // 단일 프로파일(구 레이아웃) 폴백 — `<runtime>/sap.env`를 직접 읽는다.
  legacy: project('tier-legacy', { 'sap.env': sapEnv('dev') }),

  // 런타임 상태를 전혀 읽지 않는 훅용 중립 cwd
  neutral: mk(path.join(ROOT, 'neutral')),
};

for (const [alias, tier] of [['dev', 'dev'], ['qa', 'QA'], ['prd', 'prd'], ['weird', 'SANDBOX']]) {
  const dir = mk(path.join(PROFILE_HOME, 'profiles', alias));
  fs.writeFileSync(path.join(dir, 'sap.env'), sapEnv(tier), 'utf8');
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const T = (name) => `mcp__plugin_sapkit_sap__${name}`;

function payload(tool, input) {
  return JSON.stringify({
    session_id: 'hook-decisions-test',
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: input ?? {},
  });
}

function runHook(hookFile, { cwd, raw, env }) {
  const childEnv = {
    ...process.env,
    HOME: FAKE_HOME,
    USERPROFILE: FAKE_HOME,
    SAPKIT_HOME_DIR: PROFILE_HOME,
    ...(env ?? {}),
  };
  const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, hookFile)], {
    cwd,
    input: raw,
    encoding: 'utf8',
    env: childEnv,
    timeout: 30000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// 판정 어휘: allow(무출력) · deny · ask · advise(additionalContext) ·
// silent(continue+suppressOutput) · unparseable/other(계약 위반).
function decisionOf(stdout) {
  const text = stdout.trim();
  if (text === '') return { decision: 'allow', reason: '', event: null };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { decision: 'unparseable', reason: text.slice(0, 200), event: null };
  }
  const h = obj.hookSpecificOutput ?? {};
  const event = h.hookEventName ?? null;
  if (typeof h.permissionDecision === 'string') {
    return { decision: h.permissionDecision, reason: String(h.permissionDecisionReason ?? ''), event };
  }
  if (typeof h.additionalContext === 'string') {
    return { decision: 'advise', reason: h.additionalContext, event };
  }
  if (obj.continue === true && obj.suppressOutput === true) return { decision: 'silent', reason: '', event };
  return { decision: 'other', reason: text.slice(0, 200), event };
}

// ── 채록 = 기대값 (현행 훅 실측) ────────────────────────────────────────────
// c(hook, 이름, cwd, tool, input, expect, includes) — includes는 판정 이유에
// 반드시 들어 있어야 하는 문자열. raw/env는 특수 케이스용 덮어쓰기.
const CASES = [
  // ══ block-forbidden-tables — 직격 테이블 ══
  { hook: 'tables', name: '직격 BNKA (minimal) → deny', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'BNKA' }, expect: 'deny', includes: ['BNKA', 'profile: minimal', 'row extraction denied'] },
  { hook: 'tables', name: '직격 PA0008 급여 (minimal) → deny', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'PA0008' }, expect: 'deny', includes: ['PA0008'] },
  { hook: 'tables', name: '직격 USR02 암호해시 (minimal) → deny', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'USR02' }, expect: 'deny', includes: ['USR02'] },
  { hook: 'tables', name: '소문자 입력도 정규화되어 deny (usr02)', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'usr02' }, expect: 'deny', includes: ['USR02'] },
  { hook: 'tables', name: '패턴 A### 매치 (A123) → deny', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'A123' }, expect: 'deny', includes: ['A123'] },
  { hook: 'tables', name: '패턴 경계 (A12 — 자릿수 부족) → allow', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'A12' }, expect: 'allow' },
  { hook: 'tables', name: '비등재 MARA → allow', cwd: FIX.strict, tool: T('GetTableContents'), input: { table_name: 'MARA' }, expect: 'allow' },

  // ══ block-forbidden-tables — SQL 추출 ══
  { hook: 'tables', name: 'SQL FROM 추출 (BNKA) → deny', cwd: FIX.strict, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT bankl, banka FROM BNKA UP TO 10 ROWS' }, expect: 'deny', includes: ['BNKA'] },
  { hook: 'tables', name: 'SQL JOIN 추출 (MARA JOIN USR02) → deny', cwd: FIX.strict, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT a~matnr FROM MARA AS a JOIN USR02 AS u ON u~bname = a~ernam' }, expect: 'deny', includes: ['USR02'] },
  { hook: 'tables', name: 'SQL 콤마 다중 FROM (MARA, BNKA) → deny', cwd: FIX.strict, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT * FROM MARA, BNKA' }, expect: 'deny', includes: ['BNKA'] },
  { hook: 'tables', name: 'SQL 주석 은닉 (FROM /* c */ BNKA) → deny', cwd: FIX.strict, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT bankl FROM /* 위장 */ BNKA' }, expect: 'deny', includes: ['BNKA'] },
  { hook: 'tables', name: '집계도 예외 없음 (COUNT(*) FROM PA0008) → deny', cwd: FIX.strict, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT COUNT(*) FROM PA0008' }, expect: 'deny', includes: ['PA0008'] },
  { hook: 'tables', name: '동적 테이블 참조 (FROM (lv_tab)) → ask', cwd: FIX.strict, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT carrid FROM (lv_tabname) WHERE mandt = @sy-mandt' }, expect: 'ask', includes: ['could not identify the target table'] },

  // ══ block-forbidden-tables — 프로파일 경계 ══
  { hook: 'tables', name: '경계: VBRK(standard 등급)은 minimal에서 allow', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'VBRK' }, expect: 'allow' },
  { hook: 'tables', name: '경계: VBRK는 standard에서 warn → ask', cwd: FIX.standard, tool: T('GetTableContents'), input: { table_name: 'VBRK' }, expect: 'ask', includes: ['VBRK', 'Protected Business Data', 'profile: standard'] },
  { hook: 'tables', name: '경계: BALDAT(strict 등급)은 minimal에서 allow', cwd: FIX.minimal, tool: T('GetTableContents'), input: { table_name: 'BALDAT' }, expect: 'allow' },
  { hook: 'tables', name: '경계: BALDAT는 strict에서 deny', cwd: FIX.strict, tool: T('GetTableContents'), input: { table_name: 'BALDAT' }, expect: 'deny', includes: ['BALDAT', 'profile: strict'] },
  { hook: 'tables', name: 'config.json 없음 → 기본값 strict (BALDAT deny)', cwd: FIX.noconfig, tool: T('GetTableContents'), input: { table_name: 'BALDAT' }, expect: 'deny', includes: ['profile: strict'] },
  { hook: 'tables', name: 'custom은 빌트인을 무시한다 (BNKA allow)', cwd: FIX.custom, tool: T('GetTableContents'), input: { table_name: 'BNKA' }, expect: 'allow' },
  { hook: 'tables', name: 'custom 목록 직격 (ZMYSECRET) → deny', cwd: FIX.custom, tool: T('GetTableContents'), input: { table_name: 'ZMYSECRET' }, expect: 'deny', includes: ['ZMYSECRET', 'profile: custom', 'User Custom'] },
  { hook: 'tables', name: 'custom 목록 와일드카드 (ZWILD_ABC) → deny', cwd: FIX.custom, tool: T('GetTableContents'), input: { table_name: 'ZWILD_ABC' }, expect: 'deny', includes: ['ZWILD_ABC'] },
  { hook: 'tables', name: 'extend 목록이 minimal에 얹힌다 (MARA) → deny', cwd: FIX.extend, tool: T('GetTableContents'), input: { table_name: 'MARA' }, expect: 'deny', includes: ['MARA', 'User Extended'] },

  // ══ block-forbidden-tables — 실패 모드 · 범위 ══
  { hook: 'tables', name: '빈 stdin → fail-closed deny', cwd: FIX.strict, raw: '', expect: 'deny', includes: ['empty hook payload', 'fails closed'] },
  { hook: 'tables', name: '파싱 실패 → fail-closed deny', cwd: FIX.strict, raw: '{ "tool_name": ', expect: 'deny', includes: ['could not parse hook payload', 'fails closed'] },
  { hook: 'tables', name: '범위 밖 도구(GetObjectInfo)는 판정하지 않는다', cwd: FIX.strict, tool: T('GetObjectInfo'), input: { table_name: 'BNKA' }, expect: 'allow' },

  // ══ tier-readonly-guard — DEV 통과 ══
  { hook: 'tier', name: 'DEV: CreateClass → allow', cwd: FIX.dev, tool: T('CreateClass'), input: { name: 'ZCL_X' }, expect: 'allow' },
  { hook: 'tier', name: 'DEV: ActivateObjects → allow', cwd: FIX.dev, tool: T('ActivateObjects'), input: {}, expect: 'allow' },
  { hook: 'tier', name: 'DEV: RunUnitTest → allow', cwd: FIX.dev, tool: T('RunUnitTest'), input: {}, expect: 'allow' },
  { hook: 'tier', name: 'DEV: RuntimeRunProgramWithProfiling → allow', cwd: FIX.dev, tool: T('RuntimeRunProgramWithProfiling'), input: {}, expect: 'allow' },
  { hook: 'tier', name: '구 단일 프로파일(.sapkit/sap.env=dev): CreateClass → allow', cwd: FIX.legacy, tool: T('CreateClass'), input: {}, expect: 'allow' },

  // ══ tier-readonly-guard — QA: mutation prefix 7계열 ══
  { hook: 'tier', name: 'QA: Create* → deny', cwd: FIX.qa, tool: T('CreateClass'), input: {}, expect: 'deny', includes: ['CreateClass mutates SAP objects', 'only DEV profiles may mutate'] },
  { hook: 'tier', name: 'QA: Update* → deny', cwd: FIX.qa, tool: T('UpdateProgram'), input: {}, expect: 'deny', includes: ['UpdateProgram mutates SAP objects'] },
  { hook: 'tier', name: 'QA: Delete* → deny', cwd: FIX.qa, tool: T('DeleteInclude'), input: {}, expect: 'deny', includes: ['DeleteInclude mutates SAP objects'] },
  { hook: 'tier', name: 'QA: Activate* → deny', cwd: FIX.qa, tool: T('ActivateObjects'), input: {}, expect: 'deny', includes: ['ActivateObjects mutates SAP objects'] },
  { hook: 'tier', name: 'QA: Patch* → deny', cwd: FIX.qa, tool: T('PatchGuiStatus'), input: {}, expect: 'deny', includes: ['PatchGuiStatus mutates SAP objects'] },
  { hook: 'tier', name: 'QA: Release* → deny', cwd: FIX.qa, tool: T('ReleaseTransport'), input: {}, expect: 'deny', includes: ['ReleaseTransport mutates SAP objects'] },
  { hook: 'tier', name: 'QA: Write* → deny', cwd: FIX.qa, tool: T('WriteTextElementsBulk'), input: {}, expect: 'deny', includes: ['WriteTextElementsBulk mutates SAP objects'] },

  // ══ tier-readonly-guard — 실행 4종 · QA 예외 ══
  { hook: 'tier', name: 'QA: RunUnitTest는 예외 → allow', cwd: FIX.qa, tool: T('RunUnitTest'), input: {}, expect: 'allow' },
  { hook: 'tier', name: 'QA: RuntimeRunProgramWithProfiling → deny', cwd: FIX.qa, tool: T('RuntimeRunProgramWithProfiling'), input: {}, expect: 'deny', includes: ['executes ABAP code on the server and is blocked on QA'] },
  { hook: 'tier', name: 'QA: RuntimeRunClassWithProfiling → deny', cwd: FIX.qa, tool: T('RuntimeRunClassWithProfiling'), input: {}, expect: 'deny', includes: ['executes ABAP code on the server and is blocked on QA'] },
  { hook: 'tier', name: 'QA: RuntimeCreateProfilerTraceParameters → deny', cwd: FIX.qa, tool: T('RuntimeCreateProfilerTraceParameters'), input: {}, expect: 'deny', includes: ['executes ABAP code on the server and is blocked on QA'] },

  // ══ tier-readonly-guard — PRD 전부 차단 ══
  { hook: 'tier', name: 'PRD: CreateClass → deny', cwd: FIX.prd, tool: T('CreateClass'), input: {}, expect: 'deny', includes: ['only DEV profiles may mutate'] },
  { hook: 'tier', name: 'PRD: RunUnitTest도 deny (QA 예외는 PRD에 없다)', cwd: FIX.prd, tool: T('RunUnitTest'), input: {}, expect: 'deny', includes: ['blocked on PRD'] },
  { hook: 'tier', name: 'PRD: RuntimeRunClassWithProfiling → deny', cwd: FIX.prd, tool: T('RuntimeRunClassWithProfiling'), input: {}, expect: 'deny', includes: ['blocked on PRD'] },

  // ══ tier-readonly-guard — 예외 · 미해석 · 실패 모드 ══
  { hook: 'tier', name: 'ReloadProfile은 PRD에서도 예외 → allow', cwd: FIX.prd, tool: T('ReloadProfile'), input: {}, expect: 'allow' },
  { hook: 'tier', name: 'ReloadProfile은 QA에서도 예외 → allow', cwd: FIX.qa, tool: T('ReloadProfile'), input: {}, expect: 'allow' },
  { hook: 'tier', name: 'tier 미해석(포인터·sap.env 없음) → deny', cwd: FIX.notier, tool: T('CreateClass'), input: {}, expect: 'deny', includes: ['requires a resolved SAP tier', 'Profile not configured'] },
  { hook: 'tier', name: 'SAP_TIER 비정규값(SANDBOX) → 미해석 deny', cwd: FIX.weird, tool: T('CreateClass'), input: {}, expect: 'deny', includes: ['requires a resolved SAP tier'] },
  { hook: 'tier', name: 'SAPKIT_HOME_DIR가 없는 경로 → ENV_INVALID deny', cwd: FIX.dev, tool: T('CreateClass'), input: {}, env: { SAPKIT_HOME_DIR: MISSING_HOME }, expect: 'deny', includes: ['ENV_INVALID', 'requires a resolved SAP tier'] },
  { hook: 'tier', name: 'mcp 접두 없는 짧은 이름도 판정한다 (CreateClass)', cwd: FIX.qa, tool: 'CreateClass', input: {}, expect: 'deny', includes: ['CreateClass mutates SAP objects'] },
  { hook: 'tier', name: '범위 밖 도구(ReadClass)는 판정하지 않는다', cwd: FIX.qa, tool: T('ReadClass'), input: {}, expect: 'allow' },
  { hook: 'tier', name: '빈 stdin → fail-closed deny', cwd: FIX.qa, raw: '', expect: 'deny', includes: ['empty hook payload', 'fails closed'] },
  { hook: 'tier', name: '파싱 실패 → fail-closed deny', cwd: FIX.qa, raw: '{ "tool_name": ', expect: 'deny', includes: ['could not parse hook payload', 'fails closed'] },

  // ══ prefer-sqlquery-explicit-fields ══
  { hook: 'fields', name: 'GetTableContents → ask (전 컬럼 조회)', cwd: FIX.neutral, tool: T('GetTableContents'), input: { table_name: 'MARA' }, expect: 'ask', includes: ['credit-saving guard', 'GetTableContents(MARA)'] },
  { hook: 'fields', name: 'SELECT * → ask', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT * FROM MARA UP TO 10 ROWS' }, expect: 'ask', includes: ['Query uses SELECT *'] },
  { hook: 'fields', name: 'SELECT DISTINCT * → ask (수식어 통과)', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT DISTINCT * FROM MARA' }, expect: 'ask', includes: ['Query uses SELECT *'] },
  { hook: 'fields', name: 'SELECT mara.* → ask (테이블 접두 별표)', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT mara.* FROM MARA' }, expect: 'ask', includes: ['Query uses SELECT *'] },
  { hook: 'fields', name: 'SELECT *, mandt → ask (콤마 분기)', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT *, mandt FROM MARA' }, expect: 'ask', includes: ['Query uses SELECT *'] },
  { hook: 'fields', name: '집계 전용 COUNT(*) → allow', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT COUNT(*) FROM MARA' }, expect: 'allow' },
  { hook: 'fields', name: '집계 전용 SUM(...) AS 별칭 → allow', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT SUM(netwr) AS total FROM VBAK' }, expect: 'allow' },
  { hook: 'fields', name: '명시 필드 SELECT → allow', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT matnr, mtart FROM MARA UP TO 10 ROWS' }, expect: 'allow' },
  // 채록된 공백: ABAP 별칭 표기 `t~*`는 별표 탐지 정규식(점 표기만 본다)에 걸리지 않는다.
  // 재구현이 이 구멍을 메우면 이 기대값을 의도적으로 갱신해야 한다.
  { hook: 'fields', name: '채록된 공백: ABAP `t~*`는 탐지되지 않아 allow', cwd: FIX.neutral, tool: T('GetSqlQuery'), input: { sql_query: 'SELECT t~* FROM MARA AS t' }, expect: 'allow' },
  { hook: 'fields', name: '범위 밖 도구(ReadTable) → allow', cwd: FIX.neutral, tool: T('ReadTable'), input: { table_name: 'MARA' }, expect: 'allow' },
  { hook: 'fields', name: '빈 stdin → fail-OPEN allow (비대칭)', cwd: FIX.neutral, raw: '', expect: 'allow' },
  { hook: 'fields', name: '파싱 실패 → fail-OPEN allow (비대칭)', cwd: FIX.neutral, raw: '{ "tool_name": ', expect: 'allow' },

  // ══ transport-validator (advisory — 차단하지 않는다) ══
  { hook: 'transport', name: 'CreateClass에 transport 없음 → advise', cwd: FIX.neutral, tool: T('CreateClass'), input: { name: 'ZCL_TEST', package_name: 'ZTEST' }, expect: 'advise', includes: ['TRANSPORT CHECK', 'creating', 'ZCL_TEST'] },
  { hook: 'transport', name: 'UpdateProgram에 transport 없음 → advise(updating)', cwd: FIX.neutral, tool: T('UpdateProgram'), input: { name: 'ZPROG', package_name: 'ZTEST' }, expect: 'advise', includes: ['updating', 'ZPROG'] },
  { hook: 'transport', name: 'transport 지정 → silent', cwd: FIX.neutral, tool: T('CreateClass'), input: { name: 'ZCL_TEST', package_name: 'ZTEST', transport: 'DEVK900123' }, expect: 'silent' },
  { hook: 'transport', name: '$TMP 로컬 패키지 → silent', cwd: FIX.neutral, tool: T('CreateClass'), input: { name: 'ZCL_TEST', package_name: '$TMP' }, expect: 'silent' },
  { hook: 'transport', name: '남의 MCP 서버 동명 도구 → silent (namespace 가드)', cwd: FIX.neutral, tool: 'mcp__other_server__CreateClass', input: { name: 'X' }, expect: 'silent' },
  { hook: 'transport', name: 'mcp 접두 없는 짧은 이름 → silent (채록)', cwd: FIX.neutral, tool: 'CreateClass', input: { name: 'X' }, expect: 'silent' },
  { hook: 'transport', name: '범위 밖 도구(ReadClass) → silent', cwd: FIX.neutral, tool: T('ReadClass'), input: {}, expect: 'silent' },
  { hook: 'transport', name: '빈 stdin → silent', cwd: FIX.neutral, raw: '', expect: 'silent' },
  { hook: 'transport', name: '파싱 실패 → silent (advisory는 차단하지 않는다)', cwd: FIX.neutral, raw: '{ "tool_name": ', expect: 'silent' },
];

// ── 채점 ────────────────────────────────────────────────────────────────────
const SECTIONS = [
  ['tables', 'block-forbidden-tables.mjs — fail CLOSED (프로파일별 테이블 차단)'],
  ['tier', 'tier-readonly-guard.mjs — fail CLOSED (DEV 외 mutation·실행 차단)'],
  ['fields', 'prefer-sqlquery-explicit-fields.mjs — fail OPEN (비용 조언)'],
  ['transport', 'transport-validator.mjs — advisory (이송 누락 상기)'],
];

const firstLine = (s) => String(s).split('\n').find((l) => l.trim() !== '') ?? '';
const tally = new Map(SECTIONS.map(([k]) => [k, { total: 0, pass: 0 }]));
let pass = 0;
let fail = 0;

console.log('훅 판정 채록 시험 — 안전 훅 4종의 stdin→판정\n');
console.log(`격리: cwd=임시 fixture · SAPKIT_HOME_DIR=${path.basename(PROFILE_HOME)} (임시) · stdin=직접 write\n`);

for (const [key, title] of SECTIONS) {
  const cases = CASES.filter((c) => c.hook === key);
  console.log(`${title}  (${cases.length}건)`);
  for (const c of cases) {
    const raw = c.raw !== undefined ? c.raw : payload(c.tool, c.input);
    const run = runHook(HOOK[key], { cwd: c.cwd, raw, env: c.env });
    const got = decisionOf(run.stdout);
    const missing = (c.includes ?? []).filter((needle) => !got.reason.includes(needle));
    const eventOk = got.decision === 'allow' || got.decision === 'silent' || got.event === 'PreToolUse';
    const okStatus = run.status === 0;
    const good = okStatus && got.decision === c.expect && missing.length === 0 && eventOk;

    const t = tally.get(key);
    t.total += 1;
    if (good) {
      t.pass += 1;
      pass += 1;
      console.log(`  ✅ ${c.name}`);
      if (VERBOSE) console.log(`       ${got.decision} · ${firstLine(got.reason) || '(이유 없음)'}`);
    } else {
      fail += 1;
      console.log(`  ❌ ${c.name}`);
      console.log(`       기대: ${c.expect}${(c.includes ?? []).length ? ` / 포함 ${JSON.stringify(c.includes)}` : ''}`);
      console.log(`       실제: ${got.decision}${got.reason ? ` / ${firstLine(got.reason)}` : ' / (무출력)'}`);
      if (!okStatus) console.log(`       exit=${run.status} stderr=${firstLine(run.stderr)}`);
      if (missing.length) console.log(`       이유에 없는 문자열: ${JSON.stringify(missing)}`);
      if (!eventOk) console.log(`       hookEventName=${got.event} (PreToolUse 여야 한다)`);
      console.log(`       cwd=${path.basename(c.cwd)} payload=${raw.slice(0, 160)}`);
    }
  }
  console.log('');
}

// ── 보고 ────────────────────────────────────────────────────────────────────
const perHook = SECTIONS.map(([k]) => `${HOOK[k].replace('.mjs', '')} ${tally.get(k).pass}/${tally.get(k).total}`).join(' · ');
console.log(`훅별: ${perHook}`);
console.log(`총 ${pass + fail}건 · PASS ${pass} · FAIL ${fail}`);
if (fail) {
  console.log('\n❌ 훅 판정이 채록과 다르다 — 훅 판정 로직이 옮겨졌거나(회귀) 기대값 갱신이 빠졌다.');
  process.exit(1);
}
console.log('✅ 훅 판정 채록 일치 — fail-closed 2종 · fail-open 1종 · advisory 1종');
