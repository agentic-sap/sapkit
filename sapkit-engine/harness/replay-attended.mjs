/**
 * C2 재생 판정 진입점 — 픽스처를 **신 엔진**에 같은 순서로 먹이고 판정한다.
 *
 * 이 스크립트는 조립기다. 대조·등재 판정·커버리지 산출은 전부
 * `harness/replay/`가 소유한다. 여기서는 ⓐ 무엇을 먹일지 모으고 ⓑ 판정을
 * 사람이 읽는 모양으로 내놓고 ⓒ 종료 코드로 못박을 뿐이다.
 *
 * **attended 전용.** 신 엔진이 픽스처의 요청을 실제로 수행하므로 SAP에
 * 접속한다 — 재생은 응답을 흉내 내는 것이 아니라 같은 질문을 다시 던지는
 * 것이다. 픽스처에 write 단계가 있으면 그 write가 **다시 일어난다**.
 * 배치·서브에이전트 무인 실행 금지 — spec §2.6.
 *
 * PowerShell로 실행할 것 — 신 엔진은 같은 프로세스에 세우지만(이 머신의 자식
 * 프로세스 수거 함정) 실행 습관을 게이트와 맞춰 둔다.
 *
 *   node harness/replay-attended.mjs --env-path=<sap.env>
 *   node harness/replay-attended.mjs --env-path=<sap.env> --fixture=<경로>
 *
 * | 인자 | 기본값 | 뜻 |
 * |---|---|---|
 * | `--env-path` | (필수) | 신 엔진이 붙을 `sap.env`. 녹화 때와 **같은 시스템**이어야 한다 |
 * | `--fixture` | `fixtures/` **아래 전부**(재귀 · 거부분 제외) | 특정 픽스처 하나만 재생. **거부 판정을 지나간다** |
 * | `--node-path` | 레포의 `runtime-deps/keyring/node_modules` | 신 엔진이 keyring을 찾는 `NODE_PATH` |
 * | `--out` | (없음) | 커버리지 표를 이 경로에 마크다운으로 쓴다 |
 * | `--contract-tests` | (없음) | 계약 시험 증거 JSON — `[{ "tool": …, "passed": … }, …]`. 시험을 여기서 돌리지 않고 결과를 **받는다** |
 * | `--verdict-dir` | `evidence/replay` | **커밋되는 재생 판정 파일**을 쓸 자리. `--no-verdict`로 끈다 |
 * | `--exposition` | 픽스처에 적힌 값 | 픽스처의 기록을 덮어쓴다. 어긋나면 표면이 갈려 대조가 무의미해진다 |
 *
 * **판정은 파일로 남는다.** 예전에는 판정이 표준출력과 호출자가 지정한 `--out`
 * 으로만 나가서, 재생이 돌았다는 사실이 레포에 남지 않았다 — 진척 대장은 그런
 * 증거를 **미기록**으로 셀 수밖에 없다. 이제 시퀀스마다 판정 파일 한 장이
 * `evidence/replay/<시퀀스>.json`에 떨어지고, 그 파일이 대장의 재생 열을 채운다.
 * 형식의 정본은 `harness/ledger/evidence.ts`다.
 *
 * **수집은 `fixtures/` 아래를 재귀로 훑는다.** 옛 수집은 최상위만 봤고, 그것이
 * 요구 급 산식의 배정 단위(재귀)와 어긋나 **「요구 급은 재생인데 재생 대상이 될
 * 수 없는」 도구 18종**을 만들었다(D-122 ⑵). 무엇을 모으고 무엇을 빼는지의
 * 판정은 `harness/replay/batch.ts`가 소유한다 — 여기 다시 구현하지 않는다.
 * 전량 재생에서 빠진 시퀀스는 **이유와 함께 화면에 적힌다**(조용히 사라지지
 * 않는다). 빠진 것도 `--fixture`로 명시하면 돈다.
 *
 * 종료 코드: 0 = 전건 pass · 1 = fail 또는 **no-evidence**.
 * 무증거는 통과가 아니다 — 비교에서 뺀 것이 곧 통과가 되지 않게 하는 것이
 * 장부 등재 규칙 ②다.
 */
import Module, { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuthFailureAbort, abortOnAuthFailure, isAuthAbortMessage } from './auth-guard.mjs';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const DIST_REPLAY = here('../dist/harness/replay/index.js');
const DIST_RECORDER = here('../dist/harness/recorder/index.js');
const DIST_SERVER = here('../dist/src/server/index.js');
const DIST_LEDGER = here('../dist/harness/ledger/index.js');
const DIST_REGISTRY = here('../dist/src/tools/registry.js');
const FIXTURE_DIR = here('../fixtures');
const CATALOG = here('./old-surface/m1-tools.json');
/**
 * 신 엔진의 **선택 의존성**(`@napi-rs/keyring`)이 사는 곳. 녹화 쪽
 * (`record-attended.mjs`)이 무는 것과 **같은 경로**다.
 *
 * 프로파일의 `SAP_PASSWORD`가 `keychain:<service>/<account>` 참조면 엔진은 이
 * 모듈로 OS 키체인에서 실제 비밀번호를 꺼낸다. 이 경로를 안 물리면 해석이
 * 실패해 재생이 인증 오류로 무너진다 — 원인이 드러나지 않는 자리라 기본으로 문다.
 *
 * **녹화에는 있고 재생에는 없었다**(D-122 ⑤). 녹화는 번들을 자식 프로세스로
 * 띄우므로 `NODE_PATH`를 env에 실어 보내면 그만이지만, 재생은 신 엔진을 **같은
 * 프로세스**에 세운다(`InProcessTarget`) — 이미 뜬 프로세스에서는 `NODE_PATH`를
 * 넣는 것만으로 해석 경로가 바뀌지 않아 `Module._initPaths()`가 그 값을 다시
 * 읽게 해야 한다. 그 한 걸음이 빠져 배선이 통째로 없었다.
 */
const KEYRING_NODE_PATH = here('../../interactive/server/runtime-deps/keyring/node_modules');

function die(message, ...detail) {
  console.error(`❌ ${message}`);
  for (const d of detail) console.error(`   · ${d}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { flags: new Set(), values: new Map() };
  for (const arg of argv) {
    if (!arg.startsWith('--')) die(`알 수 없는 인자: ${arg}`);
    const eq = arg.indexOf('=');
    if (eq < 0) out.flags.add(arg.slice(2));
    else out.values.set(arg.slice(2, eq), arg.slice(eq + 1));
  }
  return out;
}

const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-replay-'));
  tempDirs.push(dir);
  return dir;
}
function cleanup() {
  while (tempDirs.length) {
    try {
      fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패는 판정이 아니다.
    }
  }
}

// ── 선행 확인 ────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

// keyring 해석 경로는 **엔진을 세우기 전에** 문다. 해석은 늦게(참조를 실제로
// 만났을 때) 일어나지만, 그때 고치려면 이미 접속을 만들려던 뒤다.
const nodePath = args.values.get('node-path') ?? (fs.existsSync(KEYRING_NODE_PATH) ? KEYRING_NODE_PATH : undefined);
if (nodePath === undefined) {
  console.warn(
    `⚠️ keyring 의존성 경로가 없다 (${KEYRING_NODE_PATH}) — 프로파일이 keychain: 참조를 쓰면 인증이 실패한다. --node-path 로 지정할 수 있다.`,
  );
} else {
  process.env.NODE_PATH = nodePath;
  // 같은 프로세스에 엔진을 세우므로 env만으로는 아무 일도 일어나지 않는다.
  // `_initPaths()`가 `NODE_PATH`를 다시 읽어 `Module.globalPaths`를 세운다.
  Module._initPaths();
  console.log(`  keyring 해석 경로 — NODE_PATH=${nodePath}`);
}

for (const [label, p] of [
  ['재생 러너', DIST_REPLAY],
  ['채록기', DIST_RECORDER],
  ['서버 코어', DIST_SERVER],
  ['대장', DIST_LEDGER],
  ['등록점', DIST_REGISTRY],
]) {
  if (!fs.existsSync(p)) {
    die(`빌드 산출물이 없다 (${label}): ${p}`, '`npm run build`를 먼저 돌려라.');
  }
}
const replay = require(DIST_REPLAY);
const recorder = require(DIST_RECORDER);
const server = require(DIST_SERVER);
const ledger = require(DIST_LEDGER);
const { TOOL_REGISTRY } = require(DIST_REGISTRY);

const envPath = args.values.get('env-path');
if (!envPath) {
  die(
    '--env-path 가 없다 — 재생은 신 엔진이 SAP에 같은 질문을 다시 던지는 일이라 접속이 필요하다.',
    '녹화 때 쓴 것과 **같은 시스템**의 sap.env를 줘라. 다른 시스템이면 응답이 달라 대조가 무의미하다.',
  );
}
if (!fs.existsSync(envPath)) die(`--env-path 가 가리키는 파일이 없다: ${envPath}`);

// 없는 파일을 가리켰다면 SAP에 붙기 **전에** 끊는다 — 재생을 다 돌린 뒤
// 표를 쓰다가 죽으면 접속만 태우고 증거는 못 남긴다.
const contractTestsPath = args.values.get('contract-tests')
  ? path.resolve(args.values.get('contract-tests'))
  : null;
if (contractTestsPath !== null && !fs.existsSync(contractTestsPath)) {
  die(`--contract-tests 가 가리키는 파일이 없다: ${contractTestsPath}`);
}

// 판정 파일의 자리도 SAP에 붙기 **전에** 정한다. 재생을 다 태운 뒤 쓸 곳이
// 없어 죽으면 접속만 태우고 증거는 못 남긴다.
const verdictDir = args.flags.has('no-verdict')
  ? null
  : path.resolve(args.values.get('verdict-dir') ?? here(`../${ledger.REPLAY_VERDICT_DIR}`));
if (verdictDir !== null) fs.mkdirSync(verdictDir, { recursive: true });

// 수집 단위는 요구 급의 배정 단위와 같아야 한다 — 재귀다. 무엇을 빼는지의
// 판정은 `harness/replay/batch.ts`가 소유하고 여기서는 부르기만 한다.
const explicitFixture = args.values.get('fixture');
const collected = explicitFixture ? [path.resolve(explicitFixture)] : replay.collectFixtureFiles(FIXTURE_DIR);

/** 픽스처가 태우는 도구 이름. 형식 오류는 아래 본 경로가 제대로 보고한다. */
function toolsOf(file) {
  try {
    return (JSON.parse(fs.readFileSync(file, 'utf8')).steps ?? [])
      .map((s) => s?.tool)
      .filter((t) => typeof t === 'string');
  } catch {
    return [];
  }
}

// 한 건을 명시했으면 그 사람이 이미 정한 것이다 — 거부 판정은 **전량 재생에만**
// 건다(실데이터 관문이 열어 둔 문과 같은 모양).
const refusals = explicitFixture
  ? []
  : collected.map((file) => [file, replay.batchRefusal(toolsOf(file))]).filter(([, reason]) => reason !== null);
const fixtureFiles = collected.filter((file) => !refusals.some(([f]) => f === file));

if (refusals.length > 0) {
  // 조용히 빼지 않는다 — 빠진 것이 보이지 않으면 다음 사람이 「왜 이 도구는
  // 영영 재생 증거가 없나」를 다시 발견하게 된다.
  console.log(`전량 재생에서 뺀 시퀀스 ${refusals.length}건 (한 건씩 --fixture=<경로> 로는 돈다):`);
  for (const [file, reason] of refusals) console.log(`   · ${path.basename(file)} — ${reason}`);
}

// 생애주기 시퀀스가 섞였다는 것을 **태우기 전에** 말한다. 기준선 픽스처는
// 있는 객체를 고치지만, 이쪽은 만들었다 지운다 — 같은 "write가 다시 일어난다"라도
// 무게가 다르고, 그 차이를 사람이 시작 전에 알아야 한다.
const lifecycle = fixtureFiles.filter((file) => path.basename(path.dirname(file)) === 'attended-only');
if (lifecycle.length > 0) {
  console.log(
    `⚠️ attended 실기 시퀀스 ${lifecycle.length}건이 전량 재생에 들어 있다 — 이들은 DEV에서 객체를 ` +
      '**만들었다 지운다**(생성 → 태움 → 삭제). 대상 이름이 시스템에 남아 있으면 첫 생성이 실패한다.',
  );
  for (const file of lifecycle) console.log(`   · ${path.basename(file)}`);
}

if (fixtureFiles.length === 0) {
  // 픽스처 0건은 "통과"가 아니라 **무증거**다. 조용히 0을 세고 성공을 내면
  // 재생 대조가 있었다는 착각만 남는다.
  console.error('❌ 재생할 픽스처가 없다 — 이것은 통과가 아니라 무증거다.');
  console.error(
    refusals.length > 0
      ? `   · ${FIXTURE_DIR} 아래에서 모은 것이 전부 위 이유로 빠졌다.`
      : `   · ${FIXTURE_DIR} 가 비어 있다.`,
  );
  console.error('   · 먼저 C1 녹화를 해라: node harness/record-attended.mjs --scenario=<id> --env-path=…');
  process.exit(1);
}

// ── P2 사전 확인 ─────────────────────────────────────────────────────────────
// 재생은 픽스처의 단계를 **SAP에 다시 던진다.** 실데이터 도구가 섞여 있으면
// 기본값(`fixtures/` 전량)이 곧 실데이터 추출의 배치 실행이 된다 — CLAUDE.md
// 안전 규칙은 소유자 머신 예외(D-043) 아래서도 배치를 금지한다. 그래서
// 실데이터 픽스처는 **한 건씩 명시**하게 하거나 명시적 동의를 요구한다.
const ROW_DATA_TOOLS = new Set(['GetSqlQuery', 'GetTableContents']);

const rowDataFixtures = fixtureFiles.filter((file) => toolsOf(file).some((tool) => ROW_DATA_TOOLS.has(tool)));

if (rowDataFixtures.length > 0 && !explicitFixture && !args.flags.has('allow-row-data')) {
  die(
    `실데이터 도구가 섞인 픽스처 ${rowDataFixtures.length}건을 한 번에 재생하려 한다 — 배치 실행은 금지다(P2).`,
    ...rowDataFixtures.map((f) => path.basename(f)),
    '한 건씩 --fixture=<경로> 로 돌려라. 범위·필드·행 상한을 확인했다면 --allow-row-data.',
  );
}

// ── 재생 ─────────────────────────────────────────────────────────────────────

const results = [];
try {
  for (const file of fixtureFiles) {
    let fixture;
    try {
      fixture = recorder.parseFixture(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      die(`픽스처를 읽지 못했다: ${file}`, err.message);
    }

    const exposition = args.values.get('exposition') ?? fixture.engine.exposition;
    // 셰임이 하는 그대로 — argv 꼬리에 `--exposition` 하나, 접속은 `MCP_ENV_PATH`.
    // cwd·homedir을 임시 디렉터리로 두어 주변 프로파일이 조용히 끼어들지 못하게 한다.
    const startup = server.resolveStartup({
      argv: ['node', 'entry', `--exposition=${exposition}`],
      env: { MCP_ENV_PATH: envPath },
      cwd: tempDir(),
      homedir: tempDir(),
    });

    // 신 엔진의 기동 진단(KEYCHAIN_* · ERR_NO_CONNECTION 사유)을 버리지 않는다.
    // 원인이 보이지 않아 난 사고를 고치면서 원인 표시를 끄면 안 된다.
    const engineDiagnostics = [];
    const target = new replay.InProcessTarget({ startup, stderr: (line) => engineDiagnostics.push(line) });
    console.log(`▶ 재생 — ${fixture.sequenceId} (${fixture.steps.length}단계, exposition=${exposition})`);
    let result;
    try {
      // 인증 실패는 대조 대상이 아니라 사고다 — 첫 건에서 끊는다.
      // 계속 태우면 같은 자격증명으로 실패 로그온이 쌓여 계정이 잠긴다.
      result = await replay.replaySequence(fixture, abortOnAuthFailure(target));
    } catch (err) {
      if (err instanceof AuthFailureAbort) die(err.message, ...engineDiagnostics);
      throw err;
    }

    // 재생 러너는 `callTool`의 throw를 `transportError` 문자열로 접는다
    // (`harness/replay/replay.ts:121-125`). 그래서 위 catch만으로는 중단이
    // 밖으로 나오지 않는다 — 문자열에서 되알아보고 **루프를 끊는다**.
    // 끊지 않으면 다음 픽스처가 새 접속을 열어 같은 자격증명으로 다시
    // 로그온하고, 픽스처 N건이 실패 로그온 N건이 된다.
    if (isAuthAbortMessage(result.transportError)) {
      die(result.transportError, ...engineDiagnostics);
    }
    results.push(result);
    if (engineDiagnostics.length) {
      for (const line of engineDiagnostics) console.log(`     [신 엔진] ${line}`);
    }

    const bad = result.steps.filter((s) => s.verdict === 'mismatch' || s.verdict === 'allowlisted-fail');
    const deferred = result.steps.filter((s) => s.verdict === 'allowlisted-deferred');
    const mark = result.verdict === 'pass' ? '✅' : result.verdict === 'fail' ? '❌' : '⚠️';
    console.log(`  ${mark} ${result.verdict} — 단계 ${result.steps.length}건 · 결함 ${bad.length}건 · 이연 ${deferred.length}건`);

    if (result.transportError) console.log(`     전송 오류: ${result.transportError}`);
    for (const s of bad) {
      console.log(`     · [${s.index}] ${s.tool} — ${s.verdict}${s.divergenceId ? ` (${s.divergenceId})` : ''}`);
      if (s.detail) console.log(`       ${s.detail}`);
      for (const d of s.differences.slice(0, 3)) console.log(`       ${replay.formatDifference(d)}`);
    }
    for (const s of deferred) {
      console.log(`     · [${s.index}] ${s.tool} — 이연 (${s.divergenceId}) — 통과가 아니라 무증거다`);
    }
    for (const d of result.sequenceDifferences) console.log(`     · 시퀀스 차이: ${replay.formatDifference(d)}`);
    for (const n of result.notes) console.log(`     · 메모: ${n}`);
  }
} finally {
  cleanup();
}

// ── 판정 파일 ────────────────────────────────────────────────────────────────
// 표준출력은 세션이 끝나면 사라진다. 레포에 남는 판정 파일만이 다음 판의
// 진척 대장에서 증거로 잡힌다 — 문서에 적힌 "재생 증거 N종"은 잡히지 않는다.
if (verdictDir !== null) {
  const at = new Date().toISOString();
  for (const result of results) {
    const file = path.join(verdictDir, `${result.sequenceId}.json`);
    const document = ledger.replayVerdictDocument(result, at);
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`재생 판정 → ${file}`);
  }
  console.log('   · 이 파일을 커밋해야 진척 대장의 재생 열이 「미기록」에서 벗어난다.');
}

// ── 커버리지 표 ──────────────────────────────────────────────────────────────

// 재생 실행 자체가 신 엔진의 attended 실기다 — 같은 질문을 사람 입회 아래 SAP에
// 다시 던졌다. 그 사실을 표에 넘기지 않으면 실기 기록이 있어도 "증거 없음"에
// 영원히 남는다. 계약 시험은 여기서 돌리지 않고 결과를 받는다.
const contractTests = contractTestsPath
  ? replay.parseContractEvidence(fs.readFileSync(contractTestsPath, 'utf8'), path.basename(contractTestsPath))
  : [];

// 표의 행은 표면 **186종 전량**이다. 예전에는 M1 19종만 실었고, 그때는 19종이
// 곧 등록점이라 「지음」 판정이 필요 없었다. 이제 행이 채록본 전량이므로
// 등록점을 함께 넘긴다 — 넘기지 않으면 계산기가 등록 여부를 판정하지 않아
// 아직 안 지은 도구까지 「지음」으로 실린다.
const report = replay.buildCoverage({
  tools: replay.loadCapturedToolNames(CATALOG),
  registered: TOOL_REGISTRY.map((tool) => tool.definition.name),
  replays: results,
  attended: replay.attendedEvidenceFromReplays(results),
  contractTests,
});
const markdown = replay.renderCoverageMarkdown(report);

const outPath = args.values.get('out');
if (outPath) {
  fs.writeFileSync(path.resolve(outPath), markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
  console.log(`\n커버리지 표 → ${path.resolve(outPath)}`);
} else {
  console.log(`\n${markdown}`);
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => r.verdict === 'fail');
const noEvidence = results.filter((r) => r.verdict === 'no-evidence');

console.log('');
if (failed.length === 0 && noEvidence.length === 0) {
  console.log(`✅ 재생 대조 전건 통과 — 시퀀스 ${results.length}건`);
  process.exit(0);
}
if (failed.length) console.error(`❌ 재생 대조 실패 — ${failed.map((r) => r.sequenceId).join(', ')}`);
if (noEvidence.length) {
  console.error(`⚠️ 무증거 — ${noEvidence.map((r) => r.sequenceId).join(', ')}`);
  console.error('   이연된 등재 항목이 있다. 대체 기대 시험이 붙기 전까지 이 시퀀스는 증거가 아니다.');
}
process.exit(1);
