/**
 * C1 녹화 진입점 — 시나리오 하나를 **구 번들**에 태워 픽스처로 남긴다.
 *
 * 이 스크립트는 조립기다. 정규화·마스킹·저장은 전부 `harness/recorder/`가
 * 소유하고, 여기서는 ⓐ 무엇을 태울지 고르고 ⓑ 태우기 전후로 **녹화가 반쪽이
 * 아닌지** 확인할 뿐이다. 판정 규칙을 여기 다시 구현하지 않는다.
 *
 * **attended 전용.** 실 SAP에 접속하고, 시나리오에 따라 P3 write가 실제로
 * 일어난다. 배치·서브에이전트 무인 실행 금지.
 *
 * PowerShell로 실행할 것 — 자식 프로세스를 띄운다.
 *
 *   node harness/record-attended.mjs --scenario=<id> --env-path=<sap.env>
 *   node harness/record-attended.mjs --scenario=<id> --dry-run   # 접속 없이 시나리오만 검사
 *
 * | 인자 | 기본값 | 뜻 |
 * |---|---|---|
 * | `--scenario` | (필수) | `harness/scenarios/<id>.json` 의 id, 또는 파일 경로 |
 * | `--env-path` | (dry-run 아니면 필수) | 접속을 실체화할 `sap.env`. tier=DEV여야 write 표면이 열린다 |
 * | `--exposition` | `readonly,high` | 구 번들에 넘길 도구 표면. `readonly`면 write 도구가 안 뜬다 |
 * | `--out` | `fixtures/` | 픽스처를 떨굴 디렉터리 |
 * | `--node-path` | 레포의 `runtime-deps/keyring/node_modules` | 구 번들이 keyring을 찾는 `NODE_PATH` |
 * | `--dry-run` | 꺼짐 | 접속·기동 없이 시나리오 형식만 검사하고 끝낸다 |
 * | `--force` | 꺼짐 | 같은 이름의 픽스처를 덮어쓴다 |
 * | `--allow-all-errors` | 꺼짐 | 전 단계가 오류여도 저장한다(오류 경로만 노린 시나리오용) |
 * | `--allow-standard-source` | 꺼짐 | 고객 객체(Z·Y) 제한을 푼다. **그 픽스처는 커밋하지 말 것** |
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuthFailureAbort, abortOnAuthFailure } from './auth-guard.mjs';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const DIST = here('../dist/harness/recorder/index.js');
const BUNDLE = here('../../interactive/server/server.bundle.cjs');
const SCENARIO_DIR = here('./scenarios');
const DEFAULT_OUT = here('../fixtures');
/**
 * 구 번들의 **선택 의존성**(`@napi-rs/keyring`)이 사는 곳. 제품 게이트
 * (`interactive/scripts/smoke-mcp.mjs:74`)가 쓰는 것과 같은 경로다.
 *
 * 프로파일의 `SAP_PASSWORD`가 `keychain:<service>/<account>` 참조면 번들은 이
 * 모듈로 OS 키체인에서 실제 비밀번호를 꺼낸다. 이 경로를 안 물리면 해석이
 * 실패해 녹화가 인증 오류로 무너진다 — 원인이 드러나지 않는 자리라 기본으로 문다.
 */
const KEYRING_NODE_PATH = here('../../interactive/server/runtime-deps/keyring/node_modules');

/** 구 번들이 무접속일 때 내는 문구. 이게 응답에 있으면 녹화는 반쪽이다. */
const NO_CONNECTION_MARK = 'Basic authentication requires SAP_CLIENT';
/** 신 엔진의 MCP serverInfo 이름. 이게 잡히면 대조 대상을 잘못 태운 것이다. */
const NEW_ENGINE_NAME = 'sapkit-engine';

// ── 인자 ─────────────────────────────────────────────────────────────────────

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

function die(message, ...detail) {
  console.error(`❌ ${message}`);
  for (const d of detail) console.error(`   · ${d}`);
  process.exit(1);
}

// ── 선행 확인 ────────────────────────────────────────────────────────────────

/**
 * 시나리오를 읽고 **형식만** 확인한다. 인자 값이 실제로 맞는지는 SAP만 안다 —
 * 여기서 잡는 것은 태우기 전에 잡을 수 있는 것뿐이다.
 */
function loadScenario(spec, SEQUENCE_ID_RE) {
  const file = spec.includes('/') || spec.includes('\\') || spec.endsWith('.json')
    ? path.resolve(spec)
    : path.join(SCENARIO_DIR, `${spec}.json`);
  if (!fs.existsSync(file)) {
    const available = fs.existsSync(SCENARIO_DIR)
      ? fs.readdirSync(SCENARIO_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
      : [];
    die(
      `시나리오가 없다: ${file}`,
      available.length ? `있는 것: ${available.join(', ')}` : `${SCENARIO_DIR} 에 .json 이 하나도 없다`,
    );
  }

  let scenario;
  try {
    scenario = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    die(`시나리오가 JSON으로 읽히지 않는다: ${file}`, err.message);
  }

  const problems = [];
  if (typeof scenario.sequenceId !== 'string' || !SEQUENCE_ID_RE.test(scenario.sequenceId)) {
    problems.push(`sequenceId가 파일 이름으로 안전하지 않다 (${SEQUENCE_ID_RE}): ${JSON.stringify(scenario.sequenceId)}`);
  }
  if (typeof scenario.description !== 'string' || scenario.description.trim() === '') {
    problems.push('description이 비어 있다 — 이 시퀀스가 왜 있는지 픽스처에 남아야 한다.');
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    problems.push('steps가 비어 있지 않은 배열이어야 한다.');
  } else {
    scenario.steps.forEach((step, i) => {
      if (typeof step?.tool !== 'string' || step.tool === '') problems.push(`steps[${i}].tool이 비어 있다.`);
      if (step?.args === null || typeof step?.args !== 'object' || Array.isArray(step?.args)) {
        problems.push(`steps[${i}].args가 객체가 아니다 — 채록기 계약은 인자를 객체로 둔다.`);
      }
      if (step?.note !== undefined && typeof step.note !== 'string') {
        problems.push(`steps[${i}].note는 문자열이어야 한다.`);
      }
    });
  }
  if (problems.length) die(`시나리오 형식 오류 — ${path.basename(file)}`, ...problems);

  return { file, scenario };
}

/**
 * **대상이 고객 객체여야 하는 도구**와, 그 이름을 뽑는 함수.
 *
 * 두 부류가 같은 제약을 진다.
 *  ⓐ 응답에 **원본 소스를 싣는** 도구 — 표준 객체를 담으면 이 레포가 재배포권을
 *     갖지 않은 자산이 공개 레포에 박힌다.
 *  ⓑ **SAP을 바꾸는** 도구 — P3는 DEV 연습 자리(전용 패키지 또는 `$TMP`)
 *     안에서만이다. 여기 있으면 **실 SAP 호출 전에** 판정된다. 사후에 걸러 봐야
 *     write는 이미 일어난 뒤다(4차 리뷰 지적).
 *
 * **여기서 검사하는 것은 이름의 네임스페이스뿐이고 `package_name`은 보지 않는다.**
 * 연습 자리를 벗어난 write를 기계가 막지는 못한다 — 시나리오 작성자의 책임이다.
 *
 * 인자 하나로 끝나지 않는 도구가 있다 — 배열을 받는 것도, 이름 인자가 둘인 것도
 * 있다. 그래서 값은 문자열이 아니라 **이름 배열을 뽑는 함수**다. 인자 이름은
 * 전부 `old-surface/m1-tools.json`(구 번들 발행 선언)에서 확인한 것이며 추측이
 * 없다 — 두 배열 도구의 원소 키가 서로 다르다(`object_name` vs `name`).
 */
const CUSTOMER_OBJECT_TOOLS = {
  // ⓐ 소스를 돌려주는 것
  GetClass: (a) => [a?.class_name],
  GetProgram: (a) => [a?.program_name],
  GetInclude: (a) => [a?.include_name],
  GetFunctionModule: (a) => [a?.function_module_name],
  GetTable: (a) => [a?.table_name],
  GetStructure: (a) => [a?.structure_name],
  GrepObjects: (a) => (Array.isArray(a?.objects) ? a.objects.map((o) => o?.object_name ?? o) : [a?.objects]),
  GetSourceDiff: (a) => [a?.object_name_a, a?.object_name_b],
  // ⓑ SAP을 바꾸는 것
  CreateProgram: (a) => [a?.program_name],
  CreateInclude: (a) => [a?.include_name, a?.main_program],
  UpdateProgram: (a) => [a?.program_name],
  UpdateInclude: (a) => [a?.include_name, a?.main_program],
  UpdateClass: (a) => [a?.class_name],
  UpdateSourceByPatch: (a) => [a?.object_name],
  ActivateObjects: (a) => (Array.isArray(a?.objects) ? a.objects.map((o) => o?.name ?? o) : [a?.objects]),
};

/**
 * ABAP 원본이 실렸는지 보는 거친 표지. 목록 밖 도구를 위한 백스톱용이다.
 *
 * **선행 경계(`\b`)에 기대지 않는다.** 검사는 `JSON.stringify` 결과 위에서
 * 도는데, 거기서 줄바꿈은 역슬래시와 `n` 두 글자가 된다. `n`은 단어 문자라
 * 줄 첫머리의 `ENDCLASS`는 `\bEND`의 경계가 성립하지 않는다 — 그래서 첫 판은
 * **들여쓴 것만 잡고 0열은 놓쳤다.** SAP이 돌려주는 표준 소스가 정확히 0열
 * + CRLF 형태라 노리던 것을 통째로 놓치고 있었다(4차 리뷰 지적).
 * 대신 ABAP 문장의 마침표를 후행 경계로 쓴다.
 */
const ABAP_SOURCE_MARK = /END(CLASS|METHOD|FORM|FUNCTION|MODULE)\s*\./i;

/** 고객 네임스페이스인가. `/NAMESPACE/ZFOO` 같은 등록 네임스페이스도 허용한다. */
function isCustomerObject(name) {
  const bare = String(name ?? '').trim().replace(/^\/[^/]+\//, '');
  return /^[ZY]/i.test(bare);
}

function checkSourceNamespace(scenario, { allowStandardSource }) {
  if (allowStandardSource) return [];
  const offenders = [];
  for (const [i, step] of scenario.steps.entries()) {
    const extract = CUSTOMER_OBJECT_TOOLS[step.tool];
    if (extract === undefined) continue;

    // 선택 인자는 없을 수 있다(`UpdateInclude.main_program` 등) — 없는 것을
    // 위반으로 세지 않는다. 대신 **하나도 못 뽑았으면** 막는다: 인자 이름이
    // 어긋났거나 비어 있다는 뜻이고, 그 상태로 태우면 무엇을 겨눴는지 모른 채
    // 실 SAP에 나간다(fail-closed).
    const names = extract(step.args).filter((n) => n !== undefined && n !== null);
    if (names.length === 0) {
      offenders.push(`steps[${i}] ${step.tool} — 대상 객체 이름을 하나도 찾지 못했다 (인자 이름 확인)`);
      continue;
    }
    for (const objectName of names) {
      if (!isCustomerObject(objectName)) {
        offenders.push(`steps[${i}] ${step.tool} → ${JSON.stringify(objectName)}`);
      }
    }
  }
  return offenders;
}

/**
 * 사전 검사의 백스톱 — **목록에 없는 도구**가 원본 소스를 실어 왔는지 본다.
 *
 * `checkSourceNamespace`는 시나리오의 인자만, 그것도 위 목록의 도구만 본다.
 * 목록에 없는 도구가 소스를 돌려주면 조용히 통과한다. 그래서 채록이 끝난 뒤
 * 한 번 더 훑는다. 목록에 있는 도구는 이미 Z·Y로 제한됐으므로 건너뛴다.
 *
 * **응답과 인자 양쪽을 본다** — 소스가 들어오는 자리가 응답만은 아니다.
 * `CheckSyntax`는 `source_code` 인자를 받고 목록 밖이라, 표준 객체 소스를
 * 거기 붙이면 그대로 픽스처에 실린다(3차 리뷰 지적).
 */
function detectUnguardedSource(fixture, { allowStandardSource }) {
  if (allowStandardSource) return [];
  return fixture.steps
    .filter((s) => CUSTOMER_OBJECT_TOOLS[s.tool] === undefined)
    .filter((s) => ABAP_SOURCE_MARK.test(JSON.stringify(s.response)) || ABAP_SOURCE_MARK.test(JSON.stringify(s.args)))
    .map(
      (s) =>
        `steps[${s.index}] ${s.tool} — 인자나 응답에 ABAP 원본으로 보이는 것이 있는데 이 도구는 ` +
        '네임스페이스 검사 목록에 없다. 목록에 더하거나 대상을 Z 객체로 바꿔라.',
    );
}

/**
 * 녹화가 **반쪽인지** 본다. capture.mjs가 표면 채록에 대해 하는 것과 같은
 * 자리다 — 조용히 강등된 증거를 커밋하면 신 엔진이 맞추는 기준 자체가 틀어진다.
 */
function detectDegradation(fixture, { allowAllErrors }) {
  const problems = [];

  const text = JSON.stringify(fixture.steps);
  if (text.includes(NO_CONNECTION_MARK)) {
    problems.push(
      `응답에 무접속 문구가 있다 ("${NO_CONNECTION_MARK}…") — 구 번들이 SAP에 붙지 못했다. ` +
        '--env-path가 가리키는 sap.env와 프로파일 홈을 확인해라. (이 문구는 원인을 SAP_CLIENT로 ' +
        '잘못 말한다 — 실제로는 프로파일이 안 잡힌 것이다.)',
    );
  }
  if (fixture.engine.name === NEW_ENGINE_NAME) {
    problems.push(`신 엔진(${NEW_ENGINE_NAME})을 채록했다 — 대조 기준이 되어야 할 구 번들이 아니다.`);
  }
  if (!allowAllErrors && fixture.steps.every((s) => s.isError)) {
    problems.push(
      '전 단계가 오류다 — 강등의 전형적 징후다. 오류 경로만 노린 시나리오라면 --allow-all-errors 를 붙여라.',
    );
  }

  return problems;
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const dryRun = args.flags.has('dry-run');

if (!fs.existsSync(DIST)) {
  die(
    `빌드 산출물이 없다: ${DIST}`,
    '`npm run build`를 먼저 돌려라 — 이 스크립트는 소스가 아니라 산출물을 태운다.',
  );
}
const recorder = require(DIST);

const scenarioArg = args.values.get('scenario');
if (!scenarioArg) die('--scenario 가 필요하다.', '예: --scenario=zdemo-program-create-activate');
const { file: scenarioFile, scenario } = loadScenario(scenarioArg, recorder.SEQUENCE_ID_RE);

const outDir = args.values.get('out') ? path.resolve(args.values.get('out')) : DEFAULT_OUT;
const outFile = path.join(outDir, `${scenario.sequenceId}.json`);
const exposition = args.values.get('exposition') ?? 'readonly,high';
const envPath = args.values.get('env-path');

// 덮어쓰기 확인은 **실제로 쓰는 경로에서만** 한다. dry-run은 아무것도 쓰지
// 않으므로 여기서 막으면 이미 채록한 시퀀스의 형식 검사가 영영 불가능해진다.
if (!dryRun && fs.existsSync(outFile) && !args.flags.has('force')) {
  die(`픽스처가 이미 있다: ${outFile}`, '덮어쓰려면 --force. 픽스처는 증거라 조용히 갈아치우지 않는다.');
}

// 태우기 **전에** 막는다 — 찍고 나서 버리면 실 SAP 호출은 이미 나간 뒤다.
const standardSource = checkSourceNamespace(scenario, {
  allowStandardSource: args.flags.has('allow-standard-source'),
});
if (standardSource.length) {
  die(
    '대상이 고객 객체(Z·Y)가 아니다 — 소스 채록은 커밋 대상이고 write는 연습 자리 밖으로 나가면 안 된다.',
    ...standardSource,
    'DEV 연습 자리(전용 패키지 또는 $TMP)의 Z 객체를 가리켜라. 표준 객체 소스는 이 레포가 재배포할 권리가 없다.',
    '정말 필요하고 커밋하지 않을 것이라면 --allow-standard-source.',
  );
}

if (dryRun) {
  console.log(`✅ 시나리오 형식 통과 — ${path.basename(scenarioFile)}`);
  console.log(`   sequenceId : ${scenario.sequenceId}`);
  console.log(`   단계       : ${scenario.steps.length}건 [${scenario.steps.map((s) => s.tool).join(' → ')}]`);
  console.log(`   저장 예정   : ${outFile}`);
  console.log(`   exposition : ${exposition}`);
  console.log('   (dry-run — 구 번들을 띄우지도, SAP에 붙지도 않았다.)');
  process.exit(0);
}

if (!envPath) {
  die(
    '--env-path 가 없다 — 접속 없이 녹화하면 무접속 거부만 담긴 쓸모없는 픽스처가 나온다.',
    '활성 프로파일의 sap.env 경로를 줘라 (예: --env-path=C:/Users/<you>/.sapkit/profiles/KR-DEV/sap.env).',
    '형식만 확인할 거라면 --dry-run.',
  );
}
if (!fs.existsSync(envPath)) die(`--env-path 가 가리키는 파일이 없다: ${envPath}`);
if (!fs.existsSync(BUNDLE)) die(`구 번들이 없다: ${BUNDLE}`);

console.log(`▶ 녹화 시작 — ${scenario.sequenceId} (${scenario.steps.length}단계, exposition=${exposition})`);
console.log('  attended 구간이다. 실 SAP에 붙고, 시나리오에 write가 있으면 실제로 바뀐다.');

const nodePath = args.values.get('node-path') ?? (fs.existsSync(KEYRING_NODE_PATH) ? KEYRING_NODE_PATH : undefined);
if (nodePath === undefined) {
  console.warn(
    `⚠️ keyring 의존성 경로가 없다 (${KEYRING_NODE_PATH}) — 프로파일이 keychain: 참조를 쓰면 인증이 실패한다. --node-path 로 지정할 수 있다.`,
  );
}

const transport = new recorder.ChildProcessTransport({
  bundlePath: BUNDLE,
  exposition,
  envPath,
  nodePath,
  onStderr: (chunk) => process.stderr.write(`  [구 번들] ${chunk}`),
});

let fixture;
try {
  fixture = await recorder.recordSequence(
    {
      sequenceId: scenario.sequenceId,
      description: scenario.description,
      steps: scenario.steps.map((s) => ({ tool: s.tool, args: s.args, note: s.note })),
    },
    abortOnAuthFailure(transport),
  );
} catch (err) {
  if (err instanceof AuthFailureAbort) die(err.message);
  die('녹화 중 전송이 끊겼다.', err?.stack ?? String(err));
}

console.log(`  받은 단계 ${fixture.steps.length}/${scenario.steps.length} · 엔진 ${fixture.engine.name} ${fixture.engine.version}`);

const problems = [
  ...detectDegradation(fixture, { allowAllErrors: args.flags.has('allow-all-errors') }),
  ...detectUnguardedSource(fixture, { allowStandardSource: args.flags.has('allow-standard-source') }),
];
if (problems.length) {
  console.error('❌ 녹화를 저장하지 않는다.');
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}

// 마스킹은 여기서 판정하지 않는다 — `saveSequenceFixture`가 쓰기 직전에 돌리고,
// 위반이 하나라도 있으면 파일에 손대지 않은 채 던진다. 그 관문이 정본이다.
try {
  recorder.saveSequenceFixture(fixture, outFile);
} catch (err) {
  if (err instanceof recorder.MaskingRejection) {
    console.error('❌ 마스킹 검사에서 거부됐다 — 파일은 만들어지지 않았다.');
    console.error(`   ${err.message}`);
    console.error('   시나리오가 실데이터·실호스트·자격증명에 닿았다는 뜻이다. 대상을 데모로 바꿔라.');
    process.exit(1);
  }
  die('픽스처 저장 실패.', err?.stack ?? String(err));
}

console.log(`✅ 픽스처 저장 — ${outFile}`);
console.log(`   자리표시자 ${fixture.placeholders.length}종 [${fixture.placeholders.map((p) => p.kind).join(', ') || '없음'}]`);
console.log('   다음: node harness/replay-attended.mjs --env-path=… (C2 재생 판정 — 이것도 SAP 접속이 필요하다)');
process.exit(0);
