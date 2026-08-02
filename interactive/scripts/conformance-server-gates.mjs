#!/usr/bin/env node
// conformance-server-gates.mjs — **서버 자체** 안전 게이트 적합성 시험.
// 설계 정본: docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md
//            §7-2(필수 안전은 서버 안에 둔다) · §7-4(훅 없는 기본 상태의 정직 표) ·
//            §14-1(CI 단언 목록) · §14-3(출시 불가 조건)
//
// ───────────────────────── 왜 이 시험이 존재하는가 ──────────────────────────
// v2 설계는 클라이언트 훅을 **기본 0개**로 내린다(§7-4). 그 순간 안전의 정본은
// 서버 번들의 자체 게이트 하나뿐이 된다(설계 불변식 R-RUNTIME). 훅이 없는 상태에서
// QA/PRD write나 테이블 blocklist가 우회되면 그것은 §14-3의 **출시 불가 조건**이다.
// 그 사실을 문장이 아니라 **실기동 호출**로 박제하는 것이 이 러너다.
//
// smoke-mcp.mjs와 역할이 다르다 — 그쪽은 tools/list의 **이름 집합**을 고정한다(무엇이
// 보이는가). 이 러너는 그다음 질문을 본다: **보이는 도구를 실제로 호출하면 서버가
// 막는가.** 둘 다 있어야 표면과 집행이 동시에 고정된다.
//
// ───────────────────────── 무접촉·무유출 보장 ───────────────────────────────
// · 임시 HOME/USERPROFILE + 임시 프로젝트 fixture만 쓴다. 사용자 실물 홈의 런타임
//   디렉터리(신·구 두 세대 모두)와 실 프로파일은 읽지도 쓰지도 않는다.
// · 상속 env의 `SAP_*` `MCP_*` `SAPKIT_*` `SC4SAP_*`를 **전부 제거**하고 자식을 띄운다.
//   소유자 머신의 실 노브(D-043 · 실데이터 차단 2층 노브)가 결과를 오염시키면 이
//   시험은 그 머신에서만 초록인 장식이 된다.
// · fixture의 `SAP_URL`은 `http://127.0.0.1:1`이다. 아무도 listen하지 않는 루프백
//   포트라 **호출이 디스패치되면 즉시 ECONNREFUSED**로 끝난다. 덕분에 실 SAP 없이도
//   "게이트가 막았다"와 "게이트를 통과해 SAP로 나갔다"를 구별할 수 있고, 패킷은
//   루프백 밖으로 한 바이트도 나가지 않는다. 비밀번호 자리에는 진짜 비밀이 없다.
// · `server/launch.cjs`를 경유하지 않고 번들을 직접 띄운다. 런처가 하는 일(활성
//   프로파일의 sap.env를 찾아 `MCP_ENV_PATH`로 넘김)은 fixture가 직접 재현한다 —
//   시험 대상은 런처가 아니라 **번들의 게이트**이기 때문이다.
//
// ──────────────── 이 러너는 관측이지 수리가 아니다 (GAP-2 잔존) ─────────────
// 최초 실측(2026-08-02)에서 §7-2가 요구하는 것 중 **둘이 성립하지 않았다**(GAP-1 ·
// GAP-2). GAP-1은 엔진 4.14.1에서 수리됐고 A1·A2·A3·A4a·A4b는 기록된 격차에서
// **정식 단언으로 승격**됐다(아래 `check` 호출 — 이제 TIER_BLOCKED가 아니면 FAIL).
// GAP-2는 남아 있고, 그 수리는 별건의 결정이다(§7-2 "server-side 검증이 하나라도
// 빠지면 … 런타임을 수리한 뒤 출시"). 남은 격차는 **실체 그대로 고정하되** 매 실행
// `⚠ GAP` 배너로 드러낸다. 판정 규칙:
//   · 관측 == 기록된 실체  → PASS (격차 배너)
//   · 관측 == 설계가 요구하는 값 → PASS + "기대를 승격하라" 고지 (개선을 회귀로
//     취급하지 않는다 — 고쳐지면 이 파일의 `recorded`를 `want`로 올리고 배너를 지운다)
//   · 그 밖의 값 → FAIL
//
//   GAP-1 — **해소됨** (엔진 4.14.1 · `engine/UPSTREAM-FIX-HANDOFF.md` §19).
//     `readonlyGuard.guardTool()`이 `BaseHandlerGroup.registerToolOnServer()`에만
//     걸려 있었는데, 어떤 서버도 그 경로로 도구를 등록하지 않는다 — stdio/SSE/HTTP은
//     전부 `BaseMcpServer.registerHandlers()`를 거치고 그 래퍼는 guardTool을 부르지
//     않았다. 그래서 QA·PRD·tier 미해석 어느 쪽이든 CreateProgram/UpdateClass/
//     RuntimeRunClassWithProfiling이 ECONNREFUSED까지 도달했다(= SAP로 디스패치).
//     같은 guardTool을 그 래퍼의 `getConnection()` **앞에** 배선해 수리했다(정책·분류
//     불변). A1~A4b는 TIER_BLOCKED를 요구하는 단언이 됐고, A5(DEV 통과)는 과수리
//     역검증으로 그대로 남는다 — 게이트가 DEV까지 막으면 제품이 죽는다.
//
//   GAP-2 — **blocklist env 노브가 서버 프로세스 env로는 전달되지 않는다.**
//     기동 시 `activateProfile()` → `applyProfile()`이 `SAP_ENV_KEYS_TO_CLEAR`에
//     담긴 `MCP_BLOCKLIST_PROFILE` · `MCP_BLOCKLIST_EXTEND` · `MCP_ALLOW_TABLE`를
//     **process.env에서 지운 뒤** 프로파일 파일의 값만 다시 채운다. 프로파일이 없어
//     빈 껍데기가 로드되는 경우에도 삭제는 그대로 일어난다. 결과적으로 세 노브의
//     **유일하게 작동하는 전달 경로는 활성 프로파일의 `sap.env` 안**이다. MCP 서버
//     정의(.mcp.json의 `env`)나 셸 export로 준 값은 조용히 무시된다.
//
// ─────────────────────────────── 사용 ──────────────────────────────────────
//   node interactive/scripts/conformance-server-gates.mjs [--verbose]
//   exit 0 = 전 단언 통과(격차는 기록된 대로) · exit 1 = 단언 실패

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const BUNDLE = path.join(INTERACTIVE, 'server', 'server.bundle.cjs');
const KEYRING = path.join(INTERACTIVE, 'server', 'runtime-deps', 'keyring', 'node_modules');

const VERBOSE = process.argv.includes('--verbose');
const SPAWN_TIMEOUT_MS = 20000;
// 아무도 bind할 수 없는(권한) · 아무도 bind하지 않는 루프백 포트. "디스패치되면
// 즉시 실패"를 보장하는 것이 요점이다.
const DEAD_URL = 'http://127.0.0.1:1';
const ALIAS = 'conformance';

if (!fs.existsSync(BUNDLE)) {
  console.error(`❌ 번들 부재: ${BUNDLE}`);
  process.exit(1);
}

// ── 격리된 임시 세계 ────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-gates-'));
const FAKE_HOME = path.join(ROOT, 'home');
fs.mkdirSync(FAKE_HOME, { recursive: true });

/** 살아 있는 자식들. 어떤 종료 경로로도 잔존 프로세스를 남기지 않기 위한 대장. */
const live = new Set();
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const child of live) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* 이미 죽었으면 무시 */
    }
  }
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 잠긴 파일은 OS에 맡긴다 */
  }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

// ── 자식 env ────────────────────────────────────────────────────────────────
function childEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    // 실사용자 프로파일·노브 차단. 이걸 빼면 소유자 머신 전용 초록이 된다.
    if (/^(SAP_|MCP_|SAPKIT_|SC4SAP_)/.test(k)) continue;
    env[k] = v;
  }
  env.NODE_PATH = KEYRING;
  env.HOME = FAKE_HOME; // POSIX os.homedir()
  env.USERPROFILE = FAKE_HOME; // win32 os.homedir()
  return { ...env, ...extra };
}

// ── fixture: 프로젝트(.sapkit 포인터) + 임시 홈의 프로파일 sap.env ──────────
function makeFixture(name, { tier, profileEnv = [] } = {}) {
  const home = path.join(ROOT, `h-${name}`);
  const profileDir = path.join(home, 'profiles', ALIAS);
  fs.mkdirSync(profileDir, { recursive: true });
  const envPath = path.join(profileDir, 'sap.env');
  fs.writeFileSync(
    envPath,
    [
      `SAP_URL=${DEAD_URL}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=conformance',
      // 진짜 비밀이 아니다. keychain: 접두어가 아니므로 OS 키체인도 건드리지 않는다.
      'SAP_PASSWORD=not-a-secret',
      'SAP_SYSTEM_TYPE=onprem',
      ...(tier ? [`SAP_TIER=${tier}`] : []),
      ...profileEnv,
    ].join('\n') + '\n',
  );

  const project = path.join(ROOT, `p-${name}`);
  fs.mkdirSync(path.join(project, '.sapkit'), { recursive: true });
  fs.writeFileSync(path.join(project, '.sapkit', 'active-profile.txt'), `${ALIAS}\n`);
  return { home, project, envPath };
}

/** 프로파일이 아예 없는 cwd — inspection-only 관측용. */
function makeBareProject(name) {
  const project = path.join(ROOT, `bare-${name}`);
  fs.mkdirSync(project, { recursive: true });
  return project;
}

/** launch.cjs가 하는 일(활성 프로파일 → MCP_ENV_PATH)을 fixture로 재현한 env. */
function connectedEnv(fx, extra = {}) {
  return childEnv({ SAPKIT_HOME_DIR: fx.home, MCP_ENV_PATH: fx.envPath, ...extra });
}

// ── 서버 실기동 ─────────────────────────────────────────────────────────────
// initialize → tools/list → tools/call*. 응답을 다 받으면 종료시키고, 프로세스가
// 실제로 사라진 뒤에 resolve한다(다음 spawn 전 잔존 0).
function callServer({ cwd, env, args = [], calls = [] }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUNDLE, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    live.add(child);

    let buf = '';
    let stderr = '';
    let tools = null;
    let error = null;
    const responses = new Map();
    let resolved = false;
    let hardTimer = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
      live.delete(child);
      resolve({ tools, responses, stderr, error });
    };

    const shutdown = () => {
      clearTimeout(softTimer);
      try {
        child.kill();
      } catch {
        /* 이미 죽음 */
      }
      // TERM을 무시하면 KILL. 그래도 close가 안 오면 강제 resolve한다.
      // 여기 타이머들은 **unref하지 않는다** — unref하면 이벤트 루프가 비어
      // 최상위 await가 미해결인 채 프로세스가 조용히 끝날 수 있다(exit 13).
      hardTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* noop */
        }
        setTimeout(finish, 500);
      }, 2000);
      if (child.exitCode !== null || child.signalCode !== null) finish();
      else child.once('close', finish);
    };

    const softTimer = setTimeout(() => {
      error = `TIMEOUT (${SPAWN_TIMEOUT_MS}ms) — 서버가 응답하지 않음`;
      shutdown();
    }, SPAWN_TIMEOUT_MS);

    child.on('error', (e) => {
      error = `spawn 실패: ${e.message}`;
      shutdown();
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('exit', (code) => {
      // tools/list 전에 죽었으면 20초를 기다릴 이유가 없다 — 즉시 실패로 접는다.
      if (!resolved && tools === null) {
        error = `서버가 tools/list 전에 exit ${code}${stderr ? `: ${stderr.trim().split('\n')[0]}` : ''}`;
        shutdown();
      }
    });

    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
        } else if (msg.id === 2) {
          tools = (msg.result?.tools ?? []).map((t) => t.name);
          if (!calls.length) return shutdown();
          calls.forEach((c, i) =>
            child.stdin.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 100 + i,
                method: 'tools/call',
                params: { name: c.tool, arguments: c.args ?? {} },
              }) + '\n',
            ),
          );
        } else if (typeof msg.id === 'number' && msg.id >= 100) {
          responses.set(msg.id - 100, msg);
          // stderr 감사줄(AUDIT)이 응답 직후에 도착할 수 있어 잠깐 여유를 준다.
          if (responses.size === calls.length) setTimeout(shutdown, 250);
        }
      }
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'server-gate-conformance', version: '0' },
        },
      }) + '\n',
    );
  });
}

// ── 응답 → 판정어휘 ────────────────────────────────────────────────────────
function textOf(msg) {
  if (!msg) return '';
  if (msg.error) return String(msg.error.message ?? '');
  return (msg.result?.content ?? [])
    .map((c) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
    .join('\n');
}

/**
 * 하나의 tools/call 결과를 어휘 하나로 접는다.
 *   TIER_BLOCKED    tier 게이트가 거부 (설계 §7-2 ①②가 요구하는 값)
 *   BLOCKLIST_DENY  테이블 blocklist 하드 거부
 *   BLOCKLIST_ASK   ask층 — acknowledge_risk 재호출 요구
 *   REACHED_SAP     **게이트를 통과해 SAP로 디스패치됨** (죽은 루프백이라 ECONNREFUSED)
 *   NO_CONNECTION   연결 자체가 구성되지 않음(inspection-only의 정직한 실패)
 *   SCHEMA_ERROR    인자 스키마 위반 — 시험 fixture 쪽 실수 신호
 *   TOOL_ABSENT     그 exposition에 도구가 없음 — 단언이 공허해졌다는 신호
 */
function verdictOf(msg) {
  const t = textOf(msg);
  if (/ERR_READONLY_TIER/.test(t)) return 'TIER_BLOCKED';
  if (/row extraction refused/.test(t)) return 'BLOCKLIST_DENY';
  if (/user confirmation required for row extraction/.test(t)) return 'BLOCKLIST_ASK';
  if (/ECONNREFUSED/.test(t)) return 'REACHED_SAP';
  if (/Basic authentication requires SAP_CLIENT/.test(t)) return 'NO_CONNECTION';
  if (/Input validation error/.test(t)) return 'SCHEMA_ERROR';
  if (/Tool .* not found/.test(t)) return 'TOOL_ABSENT';
  return `OTHER(${t.replace(/\s+/g, ' ').slice(0, 120)})`;
}

function verdicts(run, calls) {
  return calls.map((_, i) => verdictOf(run.responses.get(i)));
}

// ── 단언 기록 ───────────────────────────────────────────────────────────────
const rows = [];
const gaps = [];
const promotions = [];
let failCount = 0;

function record(id, title, status, evidence) {
  rows.push({ id, title, status, evidence });
  const icon = status === 'PASS' ? '✅' : status === 'GAP' ? '⚠️' : '❌';
  console.log(`  ${icon} ${id} ${title}`);
  console.log(`       ${evidence}`);
  if (status === 'FAIL') failCount++;
}

/** 순수 단언 — 설계가 요구하는 값이 실제로 관측되는 항목. */
function check(id, title, ok, evidence) {
  record(id, title, ok ? 'PASS' : 'FAIL', evidence);
  return ok;
}

/**
 * 격차가 기록된 단언. `want`는 설계가 요구하는 값, `recorded`는 2026-08-02 실측값.
 * 관측이 want면 개선이므로 통과시키되 승격을 요구하고, recorded면 통과시키되 격차를
 * 배너에 싣는다. 셋 중 아무것도 아니면 실패 — 제3의 변화는 재검토 대상이다.
 */
function checkRecordedGap(id, title, { measured, want, recorded, gapNote, evidence }) {
  const norm = (v) => (Array.isArray(v) ? v.join(',') : String(v));
  const m = norm(measured);
  if (m === norm(want)) {
    record(id, title, 'PASS', `${evidence} — 관측=${m} (설계 요구값)`);
    promotions.push(`${id}: 관측이 설계 요구값(${norm(want)})으로 개선됐다 — 이 파일의 recorded를 want로 승격하고 격차 주석을 지울 것.`);
    return true;
  }
  if (m === norm(recorded)) {
    record(id, title, 'GAP', `${evidence} — 관측=${m} · 설계 요구=${norm(want)} (기록된 격차)`);
    gaps.push(`${id} ${title}: 관측=${m} · 설계 요구=${norm(want)}. ${gapNote}`);
    return true;
  }
  record(id, title, 'FAIL', `${evidence} — 관측=${m}; 기대는 ${norm(want)}(설계) 또는 ${norm(recorded)}(기록된 격차)`);
  return false;
}

function guardRun(id, run) {
  if (run.error) {
    record(id, '(서버 기동)', 'FAIL', run.error);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('서버 자체 안전 게이트 적합성 (설계 §7-2 · §14-1)');
console.log(`  번들   : ${path.relative(process.cwd(), BUNDLE) || BUNDLE}`);
console.log(`  임시世 : ${ROOT}`);
console.log(`  대상 SAP: ${DEAD_URL} (죽은 루프백 — 디스패치되면 즉시 ECONNREFUSED)\n`);

// ── A. tier 게이트 (fail-closed) ────────────────────────────────────────────
// 설계 §7-2 ①② — QA/PRD write·실행 차단 · tier 미해석 시 write fail-closed.
// exposition은 일부러 `readonly,high`(= §7-1의 development 도구면)로 연다:
// "development로 띄워도 tier가 막는다"가 요구사항이기 때문이다.
console.log('A. tier 게이트 (fail-closed · exposition=readonly,high)');

const WRITE_CALLS = [
  { tool: 'CreateProgram', args: { program_name: 'ZSAPKIT_GATE_PROBE', description: 'conformance', package_name: '$TMP' } },
  { tool: 'UpdateClass', args: { class_name: 'ZCL_SAPKIT_GATE_PROBE', source_code: 'CLASS zcl_x DEFINITION.' } },
  { tool: 'RuntimeRunClassWithProfiling', args: { class_name: 'ZCL_SAPKIT_GATE_PROBE' } },
  { tool: 'RuntimeCreateProfilerTraceParameters', args: { description: 'conformance' } },
];
const WRITE_LABELS = ['CreateProgram', 'UpdateClass', 'RuntimeRunClassWithProfiling', 'RuntimeCreateProfilerTraceParameters'];

async function tierCase(id, label, tier, callIdx) {
  const fx = makeFixture(`tier-${label}`, { tier });
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx),
    args: ['--exposition=readonly,high'],
    calls: WRITE_CALLS,
  });
  if (!guardRun(id, run)) return { run, v: [] };
  // 단언이 공허하지 않은지: 대상 도구가 실제로 노출돼 있어야 한다.
  const missing = callIdx.map((i) => WRITE_LABELS[i]).filter((n) => !run.tools.includes(n));
  if (missing.length) {
    record(id, label, 'FAIL', `도구 미노출로 단언이 공허함: ${missing.join(', ')} (tools=${run.tools.length})`);
    return { run, v: [] };
  }
  return { run, v: verdicts(run, WRITE_CALLS) };
}

{
  const { v } = await tierCase('A1', 'SAP_TIER=QA → write 거부', 'QA', [0, 1]);
  if (v.length) {
    check('A1', 'SAP_TIER=QA → write 도구 거부', v[0] === 'TIER_BLOCKED' && v[1] === 'TIER_BLOCKED',
      `QA 프로파일 · CreateProgram=${v[0]} · UpdateClass=${v[1]} (요구=TIER_BLOCKED — 거부 문구 ERR_READONLY_TIER)`);
    check('A4a', 'SAP_TIER=QA → 실행 2종 거부', v[2] === 'TIER_BLOCKED' && v[3] === 'TIER_BLOCKED',
      `QA 프로파일 · RuntimeRunClassWithProfiling=${v[2]} · RuntimeCreateProfilerTraceParameters=${v[3]}`);
  }
}
{
  const { v } = await tierCase('A2', 'SAP_TIER=PRD → write 거부', 'PRD', [0, 1]);
  if (v.length) {
    check('A2', 'SAP_TIER=PRD → write 도구 거부', v[0] === 'TIER_BLOCKED' && v[1] === 'TIER_BLOCKED',
      `PRD 프로파일 · CreateProgram=${v[0]} · UpdateClass=${v[1]}`);
    check('A4b', 'SAP_TIER=PRD → 실행 2종 거부', v[2] === 'TIER_BLOCKED' && v[3] === 'TIER_BLOCKED',
      `PRD 프로파일 · RuntimeRunClassWithProfiling=${v[2]} · RuntimeCreateProfilerTraceParameters=${v[3]}`);
  }
}
{
  // sap.env는 있으나 SAP_TIER 키가 없다 → profile.ts가 'UNKNOWN'으로 fail-closed 판정
  // (stderr에 tier=UNKNOWN이 찍히는 것으로 판정 자체는 확인된다).
  const fx = makeFixture('tier-none', {});
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx),
    args: ['--exposition=readonly,high'],
    calls: WRITE_CALLS,
  });
  if (guardRun('A3', run)) {
    const v = verdicts(run, WRITE_CALLS);
    const sawUnknown = /tier=UNKNOWN/.test(run.stderr);
    check('A3-tier', 'SAP_TIER 부재 → 프로파일 로더가 UNKNOWN으로 fail-closed 판정', sawUnknown,
      sawUnknown ? 'stderr: "Active sc4sap profile: … (tier=UNKNOWN, readonly=true)"' : `stderr에 tier=UNKNOWN 없음: ${run.stderr.split('\n')[0]}`);
    check('A3', 'SAP_TIER 부재 → write fail-closed', v[0] === 'TIER_BLOCKED' && v[1] === 'TIER_BLOCKED',
      `SAP_TIER 키 없는 sap.env · CreateProgram=${v[0]} · UpdateClass=${v[1]} (판정 UNKNOWN이 실제로 소비된다)`);
  }
}
{
  // A5 — 과수리 역검증: DEV에서는 tier가 거부 사유가 아니다. GAP-1 수리(4.14.1)로
  // A1~A4b가 TIER_BLOCKED를 요구하게 된 지금이야말로 이 단언이 값을 한다 —
  // 게이트가 DEV까지 막으면 제품이 죽는다.
  const fx = makeFixture('tier-dev', { tier: 'DEV' });
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx),
    args: ['--exposition=readonly,high'],
    calls: WRITE_CALLS,
  });
  if (guardRun('A5', run)) {
    const v = verdicts(run, WRITE_CALLS);
    const anyTier = v.includes('TIER_BLOCKED');
    check('A5', 'SAP_TIER=DEV → 거부 사유가 tier가 아님 (게이트가 DEV를 막지 않는다)', !anyTier && v.every((x) => x === 'REACHED_SAP'),
      `DEV 프로파일 · 4종 관측=${v.join(',')} · TIER_BLOCKED 0건`);
  }
}

// ── B. 테이블 blocklist ─────────────────────────────────────────────────────
// 설계 §7-2 ③ — 기본 프로파일 standard · env 노브 3종 · ask층 acknowledge_risk.
console.log('\nB. 테이블 blocklist (exposition=readonly)');

const GAP2_NOTE =
  'applyProfile()이 SAP_ENV_KEYS_TO_CLEAR로 세 노브를 process.env에서 지운 뒤 프로파일 파일 값만 다시 채운다 — 서버 프로세스 env(.mcp.json env·셸 export)로 준 값은 조용히 무시된다. 유일한 유효 전달 경로 = 활성 프로파일 sap.env.';

{
  // B1 + B4 — 노브 전무 = 기본 프로파일. 보호 테이블(BNKA=deny층, VBRK=ask층)은
  // 서버 내장 목록에서 골랐고, 번들 문자열 존재와 실호출 거부로 이중 확인한다.
  const bundleText = fs.readFileSync(BUNDLE, 'utf8');
  const embedded = ['BNKA', 'KNA1', 'VBRK', 'BALDAT'].filter((t) => bundleText.includes(`"${t}"`) || bundleText.includes(`'${t}'`));
  check('B0', '보호 테이블이 번들에 내장돼 있다 (문자열 확인)', embedded.length === 4,
    `번들 내 발견: ${embedded.join(', ') || '(없음)'}`);

  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'BNKA', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'VBRK', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'VBRK', max_rows: 1, acknowledge_risk: true } },
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_FREE', max_rows: 1 } },
    { tool: 'GetSqlQuery', args: { sql_query: 'SELECT * FROM KNA1', max_rows: 1 } },
    { tool: 'GetSqlQuery', args: { sql_query: 'SELECT * FROM VBRK', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-default', { tier: 'DEV' });
  const run = await callServer({ cwd: fx.project, env: connectedEnv(fx), args: ['--exposition=readonly'], calls });
  if (guardRun('B1', run)) {
    const v = verdicts(run, calls);
    check('B1', '기본(노브 전무) = standard — 보호 테이블 GetTableContents 거부', v[0] === 'BLOCKLIST_DENY' && v[4] === 'BLOCKLIST_DENY',
      `BNKA=${v[0]} · SQL FROM KNA1=${v[4]} (거부 문구 "blocklist (profile: standard) — row extraction refused")`);
    check('B1b', 'blocklist는 **연결 전에** 발화한다 (비보호 테이블만 SAP로 나간다)', v[0] === 'BLOCKLIST_DENY' && v[3] === 'REACHED_SAP',
      `BNKA=${v[0]}(네트워크 미도달) · ZSAPKIT_FREE=${v[3]}(ECONNREFUSED = 디스패치됨)`);
    check('B4', 'ask층 acknowledge_risk 왕복 — 미신고 거부 · 동봉 통과', v[1] === 'BLOCKLIST_ASK' && v[2] === 'REACHED_SAP' && v[5] === 'BLOCKLIST_ASK',
      `VBRK 미신고=${v[1]} · VBRK+acknowledge_risk=${v[2]} · SQL VBRK 미신고=${v[5]}`);
    check('B4b', 'acknowledge_risk 통과는 stderr에 감사 기록을 남긴다', /AUDIT: user-acknowledged GetTableContents on VBRK/.test(run.stderr),
      `stderr: ${(run.stderr.split('\n').find((l) => /AUDIT/.test(l)) ?? '(AUDIT 줄 없음)').trim()}`);
  }
}
{
  // B2·B3 — 노브가 실제로 듣는 유일한 경로(활성 프로파일 sap.env).
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_SECRET', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'ZPSAPKIT', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_FREE', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'BNKA', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'KNA1', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-knobs', {
    tier: 'DEV',
    profileEnv: ['MCP_BLOCKLIST_EXTEND=ZSAPKIT_SECRET,ZP*', 'MCP_ALLOW_TABLE=BNKA'],
  });
  const run = await callServer({ cwd: fx.project, env: connectedEnv(fx), args: ['--exposition=readonly'], calls });
  if (guardRun('B2', run)) {
    const v = verdicts(run, calls);
    check('B2', 'MCP_BLOCKLIST_EXTEND(프로파일 sap.env) — 추가 테이블·와일드카드 거부', v[0] === 'BLOCKLIST_DENY' && v[1] === 'BLOCKLIST_DENY' && v[2] === 'REACHED_SAP',
      `ZSAPKIT_SECRET=${v[0]} · ZPSAPKIT(ZP* 패턴)=${v[1]} · 목록 밖 ZSAPKIT_FREE=${v[2]}`);
    check('B3', 'MCP_ALLOW_TABLE(프로파일 sap.env) — 지정 테이블만 오버라이드', v[3] === 'REACHED_SAP' && v[4] === 'BLOCKLIST_DENY',
      `BNKA(허용)=${v[3]} · KNA1(여전히 차단)=${v[4]}`);
    check('B3b', 'MCP_ALLOW_TABLE 우회는 stderr 감사 기록을 남긴다', /AUDIT: MCP_ALLOW_TABLE bypass for BNKA/.test(run.stderr),
      `stderr: ${(run.stderr.split('\n').find((l) => /ALLOW_TABLE bypass/.test(l)) ?? '(AUDIT 줄 없음)').trim()}`);
  }
}
{
  // B2'·B3' — 같은 노브를 **서버 프로세스 env**로 주면? (GAP-2)
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'BNKA', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_SECRET', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-procenv', { tier: 'DEV' });
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx, {
      MCP_BLOCKLIST_PROFILE: 'off',
      MCP_BLOCKLIST_EXTEND: 'ZSAPKIT_SECRET',
      MCP_ALLOW_TABLE: 'BNKA',
    }),
    args: ['--exposition=readonly'],
    calls,
  });
  if (guardRun('B2p', run)) {
    const v = verdicts(run, calls);
    checkRecordedGap('B2p', 'blocklist 노브를 서버 프로세스 env로 전달', {
      measured: [v[0], v[1]],
      // 설계 §7-2 ③의 평문 독해: env 노브면 프로세스 env로 들어야 한다.
      want: ['REACHED_SAP', 'BLOCKLIST_DENY'],
      // 실측: 세 노브 전부 무시 → 기본 standard 그대로.
      recorded: ['BLOCKLIST_DENY', 'REACHED_SAP'],
      gapNote: GAP2_NOTE,
      evidence: 'PROFILE=off·ALLOW_TABLE=BNKA·EXTEND=ZSAPKIT_SECRET를 프로세스 env로 주입 → BNKA/ZSAPKIT_SECRET',
    });
  }
}
{
  // B5 — 지원 프로파일 값. tableBlocklist.readProfile()이 인식하는 값만 단언한다:
  // minimal | standard | strict | off, 그 밖은 standard로 폴백.
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'BNKA', max_rows: 1 } }, // minimal층 deny
    { tool: 'GetTableContents', args: { table_name: 'VBRK', max_rows: 1 } }, // standard층 ask
    { tool: 'GetTableContents', args: { table_name: 'BALDAT', max_rows: 1 } }, // strict층 deny
  ];
  const seen = {};
  for (const value of ['off', 'minimal', 'strict', 'bogus-value']) {
    const fx = makeFixture(`bl-${value}`, { tier: 'DEV', profileEnv: [`MCP_BLOCKLIST_PROFILE=${value}`] });
    const run = await callServer({ cwd: fx.project, env: connectedEnv(fx), args: ['--exposition=readonly'], calls });
    if (!guardRun(`B5(${value})`, run)) continue;
    seen[value] = verdicts(run, calls);
  }
  check('B5a', 'MCP_BLOCKLIST_PROFILE=off — 가드 전면 해제(지원되는 값)',
    seen.off?.join(',') === 'REACHED_SAP,REACHED_SAP,REACHED_SAP',
    `off → BNKA/VBRK/BALDAT = ${seen.off?.join(', ') ?? '(미측정)'}`);
  check('B5b', 'MCP_BLOCKLIST_PROFILE=minimal — minimal층만 차단',
    seen.minimal?.[0] === 'BLOCKLIST_DENY' && seen.minimal?.[1] === 'REACHED_SAP' && seen.minimal?.[2] === 'REACHED_SAP',
    `minimal → BNKA=${seen.minimal?.[0]} · VBRK(standard층)=${seen.minimal?.[1]} · BALDAT(strict층)=${seen.minimal?.[2]}`);
  check('B5c', 'MCP_BLOCKLIST_PROFILE=strict — strict층까지 차단',
    seen.strict?.[0] === 'BLOCKLIST_DENY' && seen.strict?.[1] === 'BLOCKLIST_ASK' && seen.strict?.[2] === 'BLOCKLIST_DENY',
    `strict → BNKA=${seen.strict?.[0]} · VBRK=${seen.strict?.[1]} · BALDAT=${seen.strict?.[2]}`);
  check('B5d', '미지원 값은 조용히 열지 않고 standard로 폴백 (fail-safe)',
    seen['bogus-value']?.[0] === 'BLOCKLIST_DENY' && seen['bogus-value']?.[1] === 'BLOCKLIST_ASK' && seen['bogus-value']?.[2] === 'REACHED_SAP',
    `"bogus-value" → BNKA=${seen['bogus-value']?.[0]} · VBRK=${seen['bogus-value']?.[1]} · BALDAT=${seen['bogus-value']?.[2]} (= standard와 동일)`);
}

// ── C. inspection-only 정직 실패 ────────────────────────────────────────────
// 설계 §7-2 ④ · §2-2 ② — 프로파일이 없으면 오류 대신 inspection-only로 시작하되,
// 연결이 필요한 호출은 **정직하게 실패**해야 한다(침묵 성공·mock 성공 금지).
console.log('\nC. inspection-only 정직 실패');
{
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_FREE', max_rows: 1 } },
    { tool: 'GetSqlQuery', args: { sql_query: 'SELECT * FROM ZSAPKIT_FREE', max_rows: 1 } },
  ];
  const run = await callServer({
    cwd: makeBareProject('inspection'),
    env: childEnv(), // MCP_ENV_PATH 없음 · 프로파일 없음
    args: ['--exposition=readonly'],
    calls,
  });
  if (guardRun('C1', run)) {
    const v = verdicts(run, calls);
    const allError = calls.every((_, i) => run.responses.get(i)?.result?.isError === true);
    check('C1a', '프로파일 전무 → initialize·tools/list는 성공', Array.isArray(run.tools) && run.tools.length > 0,
      `tools/list = ${run.tools?.length}개 · stderr "Starting in inspection-only mode"=${/inspection-only mode/.test(run.stderr)}`);
    check('C1', '연결 필요 도구 호출 → 정직한 실패 (침묵 성공·mock 성공 아님)',
      allError && v.every((x) => x === 'NO_CONNECTION'),
      `2종 관측=${v.join(', ')} · isError=${allError} · 문구 "Basic authentication requires SAP_CLIENT to be provided"`);
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────────────');
const passN = rows.filter((r) => r.status === 'PASS').length;
const gapN = rows.filter((r) => r.status === 'GAP').length;
console.log(`총 ${rows.length}건 · PASS ${passN} · 기록된 격차 ${gapN} · FAIL ${failCount}`);

if (gaps.length) {
  console.log('\n⚠ 기록된 격차 (설계 §7-2 요구 ↔ 번들 실체) — 수리는 별건 결정:');
  for (const g of gaps) console.log(`  · ${g}`);
  console.log('  → 설계 §14-3 "출시 불가 조건"에 해당한다. 이 러너는 실체를 고정할 뿐 수리하지 않는다.');
}
if (promotions.length) {
  console.log('\nℹ 격차 해소 감지 — 기대값을 승격할 것:');
  for (const p of promotions) console.log(`  · ${p}`);
}
if (VERBOSE) {
  console.log('\n[verbose] 단언 표');
  for (const r of rows) console.log(`  ${r.status.padEnd(4)} ${r.id.padEnd(6)} ${r.title} :: ${r.evidence}`);
}

if (failCount) {
  console.log(`\n❌ 서버 게이트 적합성 실패 ${failCount}건`);
  process.exit(1);
}
console.log('\n✅ 서버 게이트 적합성 통과 — tier 집행(QA·PRD·미해석 fail-closed, DEV 통과)·blocklist 집행·ask 왕복·inspection-only 정직 실패 고정, 잔여 격차는 기록됨');
