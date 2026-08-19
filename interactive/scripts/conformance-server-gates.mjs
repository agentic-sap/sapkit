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
// · 상속 env의 `SAP_*` `MCP_*` `SAPKIT_*`를 **전부 제거**하고 자식을 띄운다.
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
// ─────────────────── 옛 격차 둘은 **둘 다 닫혔다** ──────────────────────────
// 최초 실측(2026-08-02)에서 §7-2가 요구하는 것 중 둘이 성립하지 않았고, 이 러너는
// 그 실체를 「기록된 격차」로 고정한 채 돌았다. 지금은 둘 다 정식 단언이다.
//
//   GAP-1 — **해소 (엔진 4.14.1 · 2026-08-02)**. `readonlyGuard.guardTool()`이
//     `BaseHandlerGroup.registerToolOnServer()`에만 걸려 있었는데 어떤 서버도 그
//     경로로 도구를 등록하지 않는다 — stdio/SSE/HTTP은 전부
//     `BaseMcpServer.registerHandlers()`를 거치고 그 래퍼는 guardTool을 부르지
//     않았다. 그래서 QA·PRD·tier 미해석 어느 쪽이든 CreateProgram/UpdateClass/
//     RuntimeRunClassWithProfiling이 SAP까지 디스패치됐다. 같은 guardTool을 그 래퍼의
//     `getConnection()` **앞에** 배선해 수리했고, A1~A4b가 TIER_BLOCKED를 요구하는
//     단언이 됐다. A5(DEV 통과)는 과수리 역검증으로 남는다 — 게이트가 DEV까지 막으면
//     제품이 죽는다.
//
//   GAP-2 — **해소 (판7-b 교체 · 2026-08-19 · D-095)**. 구 번들은 기동 시
//     `applyProfile()`이 `SAP_ENV_KEYS_TO_CLEAR`로 `MCP_BLOCKLIST_PROFILE` ·
//     `MCP_BLOCKLIST_EXTEND` · `MCP_ALLOW_TABLE`를 process.env에서 **지운 뒤**
//     프로파일 파일 값만 다시 채웠다. 그래서 세 노브의 유일한 유효 통로가 활성
//     프로파일 `sap.env`였고, `.mcp.json`의 `env`나 셸 export는 조용히 무시됐다.
//     자체 저작 엔진은 그 통로를 살리되 **방향을 가른다** — 프로세스 env는 **조일
//     수는 있어도 풀 수는 없다**(장부 D6 + 판7-b 회수 · 결정 D-096). 아래
//     B2p·B2p2·B2p3·B2p4가 그 규칙 넷을 각각 단언한다.
//
//     ⚠ 처음 판7-b는 「두 통로가 다 살고 충돌 시 프로파일이 이긴다」로 닫았다가
//     독립 리뷰에서 **되돌렸다**: 그 병합은 프로파일이 **그 키를 실제로 적었을 때만**
//     이기는데 제품 마법사가 셋 중 하나만 쓰므로, 마법사가 만든 프로파일은
//     `MCP_ALLOW_TABLE`을 막지 못했고 실측에서 보호 테이블이 나갔다.
//
// **그래서 이 파일에는 「기록된 격차」 기구가 없다.** 남은 격차가 없기 때문이지
// 그런 상태를 표현할 수 없어서가 아니다 — 필요해지면 git 이력에서 그 기구를 도로
// 꺼낼 수 있다(`checkRecordedGap` · GAP 배너 · 승격 안내).
//
// ─────────────────────────────── 사용 ──────────────────────────────────────
//   node interactive/scripts/conformance-server-gates.mjs [--target=<이름>] [--verbose]
//   exit 0 = 전 단언 통과(격차는 기록된 대로) · exit 1 = 단언 실패
//
//   `--target`은 **이름표**다 — 이름 하나가 기동 파일·NODE_PATH·내장 문자열 검사
//   범위를 한 묶음으로 정한다(경로를 직접 받는 인자는 두지 않는다: 묶음의 나머지를
//   전달할 길이 없어 인자만 넷으로 불어난다). 이름은 둘이다:
//
//     `bundle` (기본) — 제품이 싣는 **단일 파일** `interactive/server/server.bundle.cjs`
//     `engine`        — 그 파일을 만든 소스의 tsc 산출물 `sapkit-engine/dist`
//
//   **판7-b(D-095) 이후 둘은 같은 엔진이다.** 그래서 이 인자는 이제 「구 vs 신」이
//   아니라 「번들 vs 소스」를 가른다 — 번들링이 안전 집행을 떨어뜨리지 않았는지가
//   그 질문이고, 둘의 판정이 갈리면 번들러를 의심할 자리다. (교체 전에는 이 인자가
//   구 번들과 신 엔진을 갈랐고, 그때 무인자 출력의 불변이 「구 부품 무접촉」의 기계
//   증명이었다. 교체가 그 증명의 목적을 소멸시켰다.) 없는 이름이면 즉시 exit 1.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.resolve(HERE, '..');
const REPO = path.resolve(INTERACTIVE, '..');

const BUNDLE_ENTRY = path.join(INTERACTIVE, 'server', 'server.bundle.cjs');
const ENGINE_DIST = path.join(REPO, 'sapkit-engine', 'dist');

// ── 대상표 — 이름 하나 = 묶음 하나 ──────────────────────────────────────────
// 기동 파일 · NODE_PATH(런타임 의존) · 내장 문자열 검사 범위 · 헤더 표기가 한
// 이름에 딸려 온다. `bundle` 줄의 값은 대상 인자가 없던 시절의 상수 그대로다.
const TARGETS = {
  bundle: {
    noun: '번들', // 부재 메시지의 주어
    header: '번들   ', // 헤더 정렬용 — 콜론 앞까지
    entry: BUNDLE_ENTRY,
    nodePath: path.join(INTERACTIVE, 'server', 'runtime-deps', 'keyring', 'node_modules'),
    // 단일 파일 배포물: 텍스트 하나만 본다.
    embedded: { kind: 'file', root: BUNDLE_ENTRY, what: '번들' },
    // keyring 런타임 의존은 레포에 추적돼 늘 있다 — 부재를 별도로 물을 이유가 없다.
    requireNodePath: false,
    buildHint: null,
  },
  engine: {
    noun: '엔진 산출물',
    header: '엔진   ',
    entry: path.join(ENGINE_DIST, 'src', 'server', 'entry.js'),
    nodePath: path.join(REPO, 'sapkit-engine', 'node_modules'),
    // 다중 파일 배포물: dist/ 트리를 훑는다.
    embedded: { kind: 'tree', root: ENGINE_DIST, what: 'dist/ 트리' },
    // dist/·node_modules는 git에 추적되지 않는다 — 부재는 "안 지었다"는 뜻이므로
    // 조용히 통과시키지 않고 빌드 안내와 함께 즉시 끊는다.
    requireNodePath: true,
    buildHint: 'sapkit-engine/ 에서 `npm ci && npm run build`를 돌려 dist/·node_modules를 만든 뒤 다시 실행할 것.',
  },
};
const DEFAULT_TARGET = 'bundle';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
let targetName = DEFAULT_TARGET;
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--target=')) targetName = argv[i].slice('--target='.length);
  else if (argv[i] === '--target') targetName = argv[++i] ?? '';
}
// hasOwn으로 받는다 — TARGETS['constructor'] 같은 프로토타입 상속 값이 대상으로
// 통과하면 없는 이름이 조용히 살아난다.
if (!Object.hasOwn(TARGETS, targetName)) {
  console.error(`❌ 알 수 없는 대상 이름: ${JSON.stringify(targetName)}`);
  console.error(`   유효한 이름: ${Object.keys(TARGETS).join(' · ')} (기본 ${DEFAULT_TARGET})`);
  process.exit(1);
}
const TARGET = TARGETS[targetName];
const ENTRY = TARGET.entry;
const RUNTIME_DEPS = TARGET.nodePath;

const SPAWN_TIMEOUT_MS = 20000;
// 아무도 bind할 수 없는(권한) · 아무도 bind하지 않는 루프백 포트. "디스패치되면
// 즉시 실패"를 보장하는 것이 요점이다.
const DEAD_URL = 'http://127.0.0.1:1';
const ALIAS = 'conformance';

if (!fs.existsSync(ENTRY)) {
  console.error(`❌ ${TARGET.noun} 부재: ${ENTRY}`);
  if (TARGET.buildHint) console.error(`   ${TARGET.buildHint}`);
  process.exit(1);
}
if (TARGET.requireNodePath && !fs.existsSync(RUNTIME_DEPS)) {
  console.error(`❌ 런타임 의존 부재: ${RUNTIME_DEPS}`);
  if (TARGET.buildHint) console.error(`   ${TARGET.buildHint}`);
  process.exit(1);
}

// ── 배포물 내장 문자열 검사 (B0의 재료) ─────────────────────────────────────
// 묻는 것은 하나다: **보호 테이블 이름이 배포물 자체에 들어 있는가** = 바깥에서
// 주입된 목록이 아닌가. 대상의 모양만 다르다 — 구 번들은 단일 파일, 신 엔진은
// 여러 파일이 든 dist/ 트리. 실호출 거부(B1)로 대체할 수 없다: 주입된 목록으로도
// B1은 통과하므로 그 순간 이 질문 자체가 사라진다.
const PROTECTED_TABLES = ['BNKA', 'KNA1', 'VBRK', 'BALDAT'];

/** 디렉터리를 재귀로 훑어 JS 산출물 경로를 모은다. */
function jsFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesUnder(p));
    else if (entry.isFile() && /\.(js|cjs|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** 대상 배포물에 리터럴로 존재하는 보호 테이블 이름 (+훑은 파일 수 — 공허한 통과 방지). */
function scanEmbeddedTables() {
  const files = TARGET.embedded.kind === 'file' ? [TARGET.embedded.root] : jsFilesUnder(TARGET.embedded.root);
  const found = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const t of PROTECTED_TABLES) {
      if (text.includes(`"${t}"`) || text.includes(`'${t}'`)) found.add(t);
    }
  }
  return { found: PROTECTED_TABLES.filter((t) => found.has(t)), scanned: files.length };
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
    if (/^(SAP_|MCP_|SAPKIT_)/.test(k)) continue;
    env[k] = v;
  }
  env.NODE_PATH = RUNTIME_DEPS;
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
    const child = spawn(process.execPath, [ENTRY, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
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
  // D18: 무접속 거부 어휘 2종 병기 — 구 번들 `Basic authentication requires SAP_CLIENT` · 신 엔진 `ERR_NO_CONNECTION`. 구 문구는 구 번들이 현역인 동안 유지한다.
  if (/Basic authentication requires SAP_CLIENT|ERR_NO_CONNECTION/.test(t)) return 'NO_CONNECTION';
  if (/Input validation error/.test(t)) return 'SCHEMA_ERROR';
  if (/Tool .* not found/.test(t)) return 'TOOL_ABSENT';
  return `OTHER(${t.replace(/\s+/g, ' ').slice(0, 120)})`;
}

function verdicts(run, calls) {
  return calls.map((_, i) => verdictOf(run.responses.get(i)));
}

// ── 단언 기록 ───────────────────────────────────────────────────────────────
const rows = [];
let failCount = 0;

function record(id, title, status, evidence) {
  rows.push({ id, title, status, evidence });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${id} ${title}`);
  console.log(`       ${evidence}`);
  if (status === 'FAIL') failCount++;
}

/** 순수 단언 — 설계가 요구하는 값이 실제로 관측되는 항목. */
function check(id, title, ok, evidence) {
  record(id, title, ok ? 'PASS' : 'FAIL', evidence);
  return ok;
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
console.log(`  ${TARGET.header}: ${path.relative(process.cwd(), ENTRY) || ENTRY}`);
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
      // 증거는 **관측한 줄을 그대로** 싣는다. 전에는 구 번들 문구가 상수로 박혀 있었는데
      // (`Active sc4sap profile: …`), 판정은 정규식 `tier=UNKNOWN` 하나라 신 엔진을 겨누면
      // **낸 적 없는 문구를 관측했다고 적는** 상태가 된다 — 판정이 아니라 증거가 틀린다.
      sawUnknown
        ? `stderr: "${(run.stderr.split(String.fromCharCode(10)).find((l) => /tier=UNKNOWN/.test(l)) ?? '').trim()}"`
        : `stderr에 tier=UNKNOWN 없음: ${run.stderr.split(String.fromCharCode(10))[0]}`);
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

{
  // B1 + B4 — 노브 전무 = 기본 프로파일. 보호 테이블(BNKA=deny층, VBRK=ask층)은
  // 서버 내장 목록에서 골랐고, 배포물 문자열 존재와 실호출 거부로 이중 확인한다.
  const { found: embedded, scanned } = scanEmbeddedTables();
  // 트리 대상은 훑은 파일 수를 함께 남긴다 — 0개를 훑고 통과하는 일이 없도록.
  const scanNote = TARGET.embedded.kind === 'tree' ? ` (파일 ${scanned}개 훑음)` : '';
  check('B0', `보호 테이블이 ${TARGET.embedded.what}에 내장돼 있다 (문자열 확인)`, embedded.length === PROTECTED_TABLES.length,
    `${TARGET.embedded.what} 내 발견: ${embedded.join(', ') || '(없음)'}${scanNote}`);

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
  // B2p·B2p2·B2p3·B2p4 — 같은 노브를 **서버 프로세스 env**로 주면?
  //
  // 구 번들에서는 "안 든다"였다(옛 GAP-2). 자체 저작 엔진은 그 격차를 닫되 **방향을
  // 가른다** — `resolveSafetyEnv`가 노브마다 다르게 합성한다:
  //
  //     MCP_ALLOW_TABLE        푼다   → 활성 프로파일 파일만
  //     MCP_BLOCKLIST_PROFILE  양방향 → 프로파일이 바닥 · 프로세스 env는 올릴 때만
  //     MCP_BLOCKLIST_EXTEND   조인다 → 두 통로 합집합
  //
  // **왜 그렇게 갈랐는지가 이 넷의 존재 이유다.** 단순 병합(`{...proc, ...profile}`)은
  // 「프로파일이 이긴다」로 읽히지만 **프로파일이 그 키를 실제로 적었을 때만** 이기고,
  // 제품 마법사(`interactive/scripts/setup-state.mjs` ENV_KEYS)는 셋 중 하나만 쓴다.
  // 그래서 마법사가 만든 프로파일은 `MCP_ALLOW_TABLE`을 막지 못했고, 실측에서 보호
  // 테이블이 나갔다. D-043의 소유자 머신 예외가 이 바닥선에 기대므로 가벼운 자리가 아니다.
  // 결정 기록 D-096 · 장부 D6의 방향 변경.

  // ① 푸는 시도가 프로세스 env로는 통하지 않는다 — **프로파일이 그 키에 침묵해도**.
  //    이것이 실측으로 새 나갔던 바로 그 모양이다.
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'BNKA', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'KNA1', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-procenv-loosen', { tier: 'DEV' }); // 프로파일에 blocklist 키 없음
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx, { MCP_BLOCKLIST_PROFILE: 'off', MCP_ALLOW_TABLE: 'BNKA' }),
    args: ['--exposition=readonly'],
    calls,
  });
  if (guardRun('B2p', run)) {
    const v = verdicts(run, calls);
    check('B2p', '푸는 노브를 프로세스 env로 줘도 바닥선이 안 내려간다 (프로파일 침묵 시에도)',
      v[0] === 'BLOCKLIST_DENY' && v[1] === 'BLOCKLIST_DENY',
      `프로파일에 blocklist 키 없음 · 프로세스 env PROFILE=off·ALLOW_TABLE=BNKA → BNKA=${v[0]} · KNA1=${v[1]}`);
  }
}
{
  // ② 조이는 통로는 산다 — 옛 GAP-2가 요구한 수리가 방향을 좁힌 뒤에도 남아 있다.
  //    목록 밖이 나가야 「전부 막는 서버」가 우연히 통과하지 못한다.
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_SECRET', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_FREE', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-procenv-tighten', { tier: 'DEV' });
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx, { MCP_BLOCKLIST_EXTEND: 'ZSAPKIT_SECRET' }),
    args: ['--exposition=readonly'],
    calls,
  });
  if (guardRun('B2p2', run)) {
    const v = verdicts(run, calls);
    check('B2p2', '조이는 노브(EXTEND)는 프로세스 env로 든다 — 실제로 조인다',
      v[0] === 'BLOCKLIST_DENY' && v[1] === 'REACHED_SAP',
      `EXTEND=ZSAPKIT_SECRET만 프로세스 env로 주입 → ZSAPKIT_SECRET=${v[0]} · 목록 밖 ZSAPKIT_FREE=${v[1]}`);
  }
}
{
  // ③ 여는 권한은 **파일에만** 있다. 파일이 연 것은 열리고, 프로세스 env가 열려 한
  //    다른 테이블은 열리지 않는다 — 같은 실행에서 둘을 함께 본다.
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'BNKA', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'KNA1', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-allow-owner', { tier: 'DEV', profileEnv: ['MCP_ALLOW_TABLE=BNKA'] });
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx, { MCP_ALLOW_TABLE: 'KNA1' }),
    args: ['--exposition=readonly'],
    calls,
  });
  if (guardRun('B2p3', run)) {
    const v = verdicts(run, calls);
    check('B2p3', '여는 권한은 활성 프로파일 파일에만 있다 (파일 BNKA 열림 · 프로세스 env KNA1 안 열림)',
      v[0] === 'REACHED_SAP' && v[1] === 'BLOCKLIST_DENY',
      `프로파일 sap.env ALLOW_TABLE=BNKA · 프로세스 env ALLOW_TABLE=KNA1 → BNKA=${v[0]} · KNA1=${v[1]}`);
  }
}
{
  // ④ 조이는 목록은 합집합 — 어느 쪽도 상대를 지우지 못한다. 단순 병합이었다면
  //    프로파일 값이 프로세스 값을 통째로 덮어 ZSAPKIT_SECRET이 나갔을 자리다.
  const calls = [
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_SECRET', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_OTHER', max_rows: 1 } },
    { tool: 'GetTableContents', args: { table_name: 'ZSAPKIT_FREE', max_rows: 1 } },
  ];
  const fx = makeFixture('bl-extend-union', { tier: 'DEV', profileEnv: ['MCP_BLOCKLIST_EXTEND=ZSAPKIT_OTHER'] });
  const run = await callServer({
    cwd: fx.project,
    env: connectedEnv(fx, { MCP_BLOCKLIST_EXTEND: 'ZSAPKIT_SECRET' }),
    args: ['--exposition=readonly'],
    calls,
  });
  if (guardRun('B2p4', run)) {
    const v = verdicts(run, calls);
    check('B2p4', 'EXTEND는 두 통로의 합집합 — 어느 쪽도 상대를 지우지 않는다',
      v[0] === 'BLOCKLIST_DENY' && v[1] === 'BLOCKLIST_DENY' && v[2] === 'REACHED_SAP',
      `프로파일 EXTEND=ZSAPKIT_OTHER · 프로세스 env EXTEND=ZSAPKIT_SECRET → 프로세스분=${v[0]} · 프로파일분=${v[1]} · 목록 밖=${v[2]}`);
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
    // 문구는 **관측한 것을 적는다.** 전에는 구 번들 문구가 상수로 박혀 있었는데,
    // 판정(verdictOf)은 D18 alternation으로 구·신 두 어휘를 모두 받으므로 신 엔진을
    // 겨누면 **낸 적 없는 문구를 관측했다고 적는** 상태가 됐다(대상 인자가 생기기
    // 전에는 구 번들만 검사해서 드러나지 않던 자리다). 판정이 아니라 증거가 틀리는
    // 것이고, 증거가 틀리면 초록의 의미가 바뀐다.
    const c1Text = textOf(run.responses.get(0));
    const wording = /Basic authentication requires SAP_CLIENT/.test(c1Text)
      ? 'Basic authentication requires SAP_CLIENT to be provided'
      : /ERR_NO_CONNECTION/.test(c1Text)
        ? 'ERR_NO_CONNECTION'
        : '(등재된 두 어휘 중 어느 것도 아님)';
    check('C1', '연결 필요 도구 호출 → 정직한 실패 (침묵 성공·mock 성공 아님)',
      allError && v.every((x) => x === 'NO_CONNECTION'),
      `2종 관측=${v.join(', ')} · isError=${allError} · 문구 "${wording}"`);
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────────────');
const passN = rows.filter((r) => r.status === 'PASS').length;
console.log(`총 ${rows.length}건 · PASS ${passN} · FAIL ${failCount}`);

if (VERBOSE) {
  console.log('\n[verbose] 단언 표');
  for (const r of rows) console.log(`  ${r.status.padEnd(4)} ${r.id.padEnd(6)} ${r.title} :: ${r.evidence}`);
}

if (failCount) {
  console.log(`\n❌ 서버 게이트 적합성 실패 ${failCount}건`);
  process.exit(1);
}
console.log('\n✅ 서버 게이트 적합성 통과 — tier 집행(QA·PRD·미해석 fail-closed, DEV 통과)·blocklist 집행·ask 왕복·inspection-only 정직 실패 고정 — 잔여 격차 0');
