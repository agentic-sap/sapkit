// 구 번들의 tools/list를 오프라인(무접속)으로 채록해 **표면 계약의 기계 판독 정본**을
// 만든다. 담는 것은 두 가지다 — 186종 **전량의 발행 선언**(이름·설명·inputSchema·
// execution)과, **4개 노출 조건 각각의 이름 집합**.
//
// 왜 이름 집합까지 저장하는가. 예전에는 조건별 **수**만 세고 이름은 어디에도 남기지
// 않았다. 그래서 "연결+readonly = 74"라는 수는 있는데 그 74종이 무엇인지는 아무도
// 몰랐고, 새 도구 하나가 그 집합에 들어가야 하는지 아닌지를 기계가 판정할 수 없었다.
// 수는 우연히 맞을 수 있지만 이름 집합은 그러지 못한다.
//
// SAP에 접속하지 않는다 — 물리는 프로파일이 존재하지 않는 호스트를 가리키고,
// tools/list는 등록된 선언을 그대로 돌려줄 뿐이기 때문이다. 구 번들은 실행만
// 하고 수정하지 않는다.
//
// **산출 파일명이 `m1-tools.json`인 채로 186종을 담는다 — 이름이 내용보다 좁다.**
// 그래도 바꾸지 않는다. 이 경로를 직접 지목하는 곳이 이미 여럿이기 때문이다:
// CI의 표류 확인(`.github/workflows/offline-gates.yml`) · `gates/surface.mjs` ·
// `harness/replay/coverage.ts` · `harness/replay-attended.mjs`, 그리고 네 벌의
// 계약 시험(`src/tools/**/__tests__`). 이름을 바꾸면 그 전부가 조용히 헛돈다 —
// 특히 CI는 `git diff --exit-code -- harness/old-surface/m1-tools.json`으로 표류를
// 보는데, **없어진 파일이 안 바뀐 것**과 구분하지 못해 초록으로 지나간다. 이름과
// 내용의 어긋남은 이 머리주석과 README, 그리고 산출물 첫 키(`_`)로 처리한다.
//
// PowerShell로 실행할 것 — 자식 프로세스를 띄운다.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

// **구 번들의 위치는 더 이상 제품 경로가 아니다.**
//
// 판7-b(D-095)가 `interactive/server/server.bundle.cjs`를 자체 저작 엔진 번들로
// 교체했다. 그 경로를 계속 가리키면 이 채록기는 **신 엔진으로 「구 번들」 채록본을
// 덮어쓰게** 되고, 그 순간 신 엔진이 맞추는 기준이 자기 자신이 되어 표면 게이트가
// 뜻을 잃는다. 그래서 롤백 소스에서 직접 빌드한 산출물을 가리킨다:
//
//   cd engine && npm install && npm run build:bundle   → engine/dist/server.bundle.cjs
//
// 그 산출물은 `.gitignore` 대상이라 신선한 체크아웃에는 없다. **없으면 조용히 넘어가지
// 않고 멈춘다** — "채록을 안 했다"와 "채록이 같았다"를 구별 못 하는 것이 이 스크립트가
// 가장 하지 말아야 할 일이다.
//
// ⚠ 이 스크립트는 **상시 게이트가 아니다.** 교체 전에는 CI가 매 푸시 이것을 돌려
// `git diff --exit-code`로 채록본 표류를 봤는데, 그 질문("구 번들이 여전히 이렇게
// 발행하는가")은 구 번들이 현역일 때만 뜻이 있었다. 지금 `engine/`은 아무도 고치지
// 않는 롤백 자산이므로 그 대조는 동어반복이고, CI에서 내렸다. 채록본은
// `sapkit-cli/fixtures/baseline/`과 같은 지위 — **되뜰 수 없는 기준의 잔존 형태**이고,
// 그것을 지키는 것은 `gates/surface.mjs`다.
const BUNDLE = here('../../../engine/dist/server.bundle.cjs');
const OUT = here('./m1-tools.json');

if (!existsSync(BUNDLE)) {
  console.error(`[capture] 구 번들이 없다: ${BUNDLE}`);
  console.error('        롤백 소스에서 먼저 지어라 — cd engine && npm install && npm run build:bundle');
  console.error('        (판7-b 이후 제품 경로의 번들은 신 엔진이다. 그것으로 채록하면 기준이 자기 자신이 된다.)');
  process.exit(2);
}

const M1 = [
  'SearchObject', 'GetInclude', 'GetClass', 'GetProgram', 'GetFunctionModule',
  'GetInactiveObjects', 'GrepObjects', 'CheckSyntax', 'GetSourceDiff',
  'CreateProgram', 'CreateInclude', 'UpdateProgram', 'UpdateInclude',
  'UpdateClass', 'UpdateSourceByPatch', 'ActivateObjects',
  'GetTable', 'GetStructure', 'GetSqlQuery',
];

/**
 * 채록할 4개 노출 조건과 **기대 수**.
 *
 * 기대 수를 여기 못 박아 두는 것이 강등 감지의 뼈대다. 하나라도 어긋나면
 * 기존 채록본을 덮어쓰지 않고 실패한다 — 조용히 줄어든 채록본을 커밋하면
 * 신 엔진이 맞추는 기준 자체가 틀어지기 때문이다.
 *
 * 구 번들이 **의도적으로** 바뀌어 수가 달라졌다면, 그때는 이 상수를 사람이
 * 고치고 무엇이 왜 바뀌었는지 커밋 메시지에 남긴다. 자동으로 따라가지 않는다.
 */
const RUNS = [
  { key: 'connected_default', exposition: 'readonly,high', withProfile: true, expected: 186 },
  { key: 'noProfile_default', exposition: 'readonly,high', withProfile: false, expected: 155 },
  { key: 'connected_readonly', exposition: 'readonly', withProfile: true, expected: 74 },
  { key: 'noProfile_readonly', exposition: 'readonly', withProfile: false, expected: 65 },
];

/** 전량 선언을 뜨는 기준 판 — 가장 넓은 조건이어야 한다. */
const SUPERSET = 'connected_default';

/** 한 선언이 표면 계약으로 성립하려면 있어야 하는 필드. */
const DECLARATION_FIELDS = ['name', 'description', 'inputSchema', 'execution'];

/**
 * 가짜 프로파일은 **실행 시점에 임시 디렉터리로 직접 쓴다.**
 *
 * 파일로 커밋해 두면 `*.env` 무시 규칙에 걸려 신선한 체크아웃에는 없고, 그러면
 * 이 스크립트가 조용히 무프로파일 채록으로 강등된다 — 연결 시에만 뜨는 31종이
 * 통째로 빠진 채로. 자족화가 그 함정을 없앤다.
 *
 * 값은 전부 명백한 가짜다: 존재하지 않는 호스트와 비밀 아닌 문자열.
 */
function writeFakeProfile(dir) {
  const file = path.join(dir, 'sap.env');
  writeFileSync(
    file,
    [
      'SAP_URL=https://sap.example.test:44300',
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=surface-capture',
      'SAP_PASSWORD=not-a-secret',
      'SAP_TIER=DEV',
      'SAP_SYSTEM_TYPE=onprem',
      '',
    ].join('\n'),
    'utf8',
  );
  return file;
}

const workDir = mkdtempSync(path.join(os.tmpdir(), 'sapkit-surface-'));
const FAKE_ENV = writeFakeProfile(workDir);

/**
 * 한 번의 기동에서 tools/list 한 판을 받아 온다.
 * @param exposition `--exposition`으로 넘길 값
 * @param withProfile 가짜 프로파일(`SAP_SYSTEM_TYPE=onprem`)을 물릴지 여부.
 *   물리지 않으면 배포 축이 기본값 cloud가 되어 노출 집합이 줄어든다.
 */
function ask(exposition, withProfile) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
    }
    if (withProfile) env.MCP_ENV_PATH = FAKE_ENV;

    const child = spawn(process.execPath, [BUNDLE, `--exposition=${exposition}`], {
      env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          resolve(msg);
        }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'surface-capture', version: '0' },
      },
    })}\n`);
    setTimeout(() => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    }, 1500);
  });
}

const responses = await Promise.all(RUNS.map((r) => ask(r.exposition, r.withProfile)));

const problems = [];

/** 응답 한 판을 이름 오름차순 도구 배열로 편다. 응답이 깨졌으면 빈 배열이다. */
function toolsOf(response, key) {
  const listed = response?.result?.tools;
  if (!Array.isArray(listed)) {
    problems.push(
      `${key}: 응답에 tools 배열이 없다 — ${JSON.stringify(response?.error ?? response).slice(0, 200)}`,
    );
    return [];
  }
  return [...listed].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const perRun = new Map();
for (const [i, run] of RUNS.entries()) {
  const listed = toolsOf(responses[i], run.key);
  perRun.set(run.key, { run, listed, names: listed.map((t) => t.name) });
}

// ── 전량 선언 (기준 판) ──────────────────────────────────────────────────────
const superset = perRun.get(SUPERSET);
const tools = {};
for (const t of superset.listed) tools[t.name] = t;

// ── 4개 조건의 이름 집합 ─────────────────────────────────────────────────────
const exposures = {};
const counts = {};
for (const run of RUNS) {
  const { names } = perRun.get(run.key);
  exposures[run.key] = {
    exposition: run.exposition,
    profile: run.withProfile ? 'onprem' : null,
    count: names.length,
    names,
  };
  counts[run.key] = names.length;
}

const supersetNames = new Set(exposures[SUPERSET].names);
const noProfileNames = new Set(exposures.noProfile_default.names);

const connectedOnly = exposures[SUPERSET].names.filter((n) => !noProfileNames.has(n));
const m1Missing = M1.filter((n) => !(n in tools));

const m1 = {};
for (const n of M1) m1[n] = tools[n] ?? null;

const report = {
  _: [
    '구 번들이 tools/list로 발행하는 선언 그대로. 손으로 고치지 말 것 — capture.mjs를 다시 돌린다.',
    '파일명은 `m1-tools.json`이지만 담는 것은 M1 19종이 아니라 **186종 전량**이다.',
    '이름을 안 바꾸는 이유는 CI 표류 확인과 하네스·게이트·계약 시험이 이 경로를 직접 지목하기 때문이다 (capture.mjs 머리주석 참조).',
    '`tools` = 전량 선언(가장 넓은 조건에서 뜬 것) · `exposures` = 4개 노출 조건 각각의 이름 집합 · `m1` = 그중 M1 19종만 추린 옛 키(소비자 호환).',
  ],
  counts,
  exposures,
  connectedOnly,
  m1Missing,
  m1,
  tools,
};

rmSync(workDir, { recursive: true, force: true });

// ── 강등 감지 — 채록이 반쪽이면 **덮어쓰지 않고 실패한다.** ──────────────────
// 조용히 줄어든 채록본을 커밋하면 신 엔진이 맞추는 기준 자체가 틀어진다.
for (const run of RUNS) {
  const actual = counts[run.key];
  if (actual !== run.expected) {
    problems.push(
      `${run.key}(${run.exposition}${run.withProfile ? ' + onprem 프로파일' : ' + 무프로파일'}): ` +
        `기대 ${run.expected}종인데 ${actual}종이 나왔다.`,
    );
  }
}
if (m1Missing.length > 0) {
  problems.push(
    `M1 ${m1Missing.length}종이 표면에 없다 [${m1Missing.join(', ')}] — ` +
      '프로파일이 먹지 않아 무프로파일 채록으로 강등된 모양이다.',
  );
}
if (connectedOnly.length === 0) {
  problems.push(
    '프로파일 유무로 표면이 갈리지 않았다 — 연결 시에만 뜨는 도구가 0종이다. ' +
      '가짜 프로파일이 서버에 닿지 않았다는 뜻이다.',
  );
}
// 좁은 조건에만 있고 가장 넓은 조건에는 없는 이름이 있다면, `tools`는 전량이 아니다.
for (const run of RUNS) {
  const stray = exposures[run.key].names.filter((n) => !supersetNames.has(n));
  if (stray.length > 0) {
    problems.push(
      `${run.key}에만 있고 기준 판(${SUPERSET})에는 없는 도구 ${stray.length}종 ` +
        `[${stray.slice(0, 5).join(', ')}${stray.length > 5 ? ', …' : ''}] — ` +
        '기준 판이 전량이 아니므로 선언 채록이 반쪽이다.',
    );
  }
}
// 선언이 네 필드를 다 갖췄는가 — 이름만 있는 껍데기는 계약 대조에 쓸 수 없다.
{
  const thin = [];
  for (const [name, tool] of Object.entries(tools)) {
    const missing = DECLARATION_FIELDS.filter((f) => tool[f] === undefined || tool[f] === null);
    if (missing.length > 0) thin.push(`${name}(${missing.join('·')} 없음)`);
  }
  if (thin.length > 0) {
    problems.push(
      `선언 ${thin.length}종이 필드를 갖추지 못했다 ` +
        `[${thin.slice(0, 5).join(', ')}${thin.length > 5 ? ', …' : ''}].`,
    );
  }
}

if (problems.length > 0) {
  console.error('❌ 표면 채록 실패 — 기존 채록본을 그대로 둔다.');
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  counts: report.counts,
  toolsCaptured: Object.keys(tools).length,
  connectedOnlyCount: connectedOnly.length,
  m1Missing: report.m1Missing,
}, null, 2));
process.exit(0);
