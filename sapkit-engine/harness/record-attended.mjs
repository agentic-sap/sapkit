/**
 * C1 녹화 진입점 — 시나리오 하나를 **제품 번들**에 태워 픽스처로 남긴다.
 *
 * 태우는 것은 `interactive/server/server.bundle.cjs`이고, 판7-b(D-095) 교체 뒤
 * 그 번들은 **자체 저작 엔진 `sapkit-engine`**이다. 구 포크(`engine/`)가 아니다.
 *
 * 이 스크립트는 조립기다. 정규화·마스킹·저장은 전부 `harness/recorder/`가
 * 소유하고, 저장 자리·강등 판정은 `harness/attended-guard.mjs`가 소유한다.
 * 여기서는 ⓐ 무엇을 태울지 고르고 ⓑ 그 판정들을 제자리에 부를 뿐이다 —
 * 판정 규칙을 여기 다시 구현하지 않는다.
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
 * | `--exposition` | `readonly,high` | 번들에 넘길 도구 표면. `readonly`면 write 도구가 안 뜬다 |
 * | `--out` | `fixtures/attended-only/` | 픽스처를 떨굴 디렉터리. **상대 경로는 cwd가 아니라 `sapkit-engine/` 루트 기준**으로 푼다(절대 경로는 준 대로) — 어느 cwd에서 돌려도 `--out=fixtures/attended-only`가 같은 자리를 가리킨다 |
 * | `--node-path` | 레포의 `runtime-deps/keyring/node_modules` | 번들이 keyring을 찾는 `NODE_PATH` |
 * | `--dry-run` | 꺼짐 | 접속·기동 없이 시나리오 형식만 검사하고 끝낸다 |
 * | `--force` | 꺼짐 | 같은 이름의 픽스처를 덮어쓴다 |
 * | `--allow-all-errors` | 꺼짐 | 전 단계가 오류여도 저장한다(오류 경로만 노린 시나리오용) |
 * | `--allow-standard-source` | 꺼짐 | 고객 객체(Z·Y) 제한을 푼다. **그 픽스처는 커밋하지 말 것** |
 *
 * 저장 자리에 따라 판정이 갈린다(`attended-guard.mjs` 머리주석의 3분기):
 * `fixtures/attended-only/`는 **제품 엔진 이름을 요구**하고, 재생 기준선
 * `fixtures/`는 **무조건 거부**하며(자기 대조), 그 밖의 자리는 막지 않되
 * 커밋 대상이 아님을 알린다.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuthFailureAbort, abortOnAuthFailure } from './auth-guard.mjs';
import {
  classifyOutDir,
  detectDegradation,
  outDirNotices,
  outDirRefusal,
  resolveOutDir,
} from './attended-guard.mjs';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const DIST = here('../dist/harness/recorder/index.js');
/**
 * 대상 검사. 무엇을 검사할지는 **도구 선언**(`SapToolDefinition.targetNames`)에서
 * 오고, 이 모듈이 그 선언을 읽어 검사기를 만든다 — 여기 이름 표를 다시 두지 않는다.
 */
const GUARD_DIST = here('../dist/harness/targetGuard.js');
const BUNDLE = here('../../interactive/server/server.bundle.cjs');
const SCENARIO_DIR = here('./scenarios');
/**
 * 제품 번들의 **선택 의존성**(`@napi-rs/keyring`)이 사는 곳. 제품 게이트
 * (`interactive/scripts/smoke-mcp.mjs:74`)가 쓰는 것과 같은 경로다.
 *
 * 프로파일의 `SAP_PASSWORD`가 `keychain:<service>/<account>` 참조면 번들은 이
 * 모듈로 OS 키체인에서 실제 비밀번호를 꺼낸다. 이 경로를 안 물리면 해석이
 * 실패해 녹화가 인증 오류로 무너진다 — 원인이 드러나지 않는 자리라 기본으로 문다.
 */
const KEYRING_NODE_PATH = here('../../interactive/server/runtime-deps/keyring/node_modules');

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

/**
 * 저장 거부는 **SAP 호출이 전부 나간 뒤**에 돈다. 그 둘을 같은 것으로 읽으면
 * 실제로 바뀐 DEV 객체를 없던 일로 여기게 된다 — 그래서 거부문에 늘 붙인다.
 */
const SAP_ALREADY_RAN =
  '   ⚠ 저장이 안 됐다는 것은 SAP이 안 바뀌었다는 뜻이 아니다 — 이 판정은 시퀀스가 다 나간 뒤에 돈다. ' +
  '시나리오에 write가 있었다면 그 변경은 이미 SAP에 있다.';

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

// ── 본체 ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const dryRun = args.flags.has('dry-run');

for (const artifact of [DIST, GUARD_DIST]) {
  if (fs.existsSync(artifact)) continue;
  die(
    `빌드 산출물이 없다: ${artifact}`,
    '`npm run build`를 먼저 돌려라 — 이 스크립트는 소스가 아니라 산출물을 태운다.',
  );
}
const recorder = require(DIST);
// 대상 검사는 도구 선언에서 온다. 검사기가 비면 사전 검사가 통째로 무력해지므로
// 여기서 fail-closed로 막는다 — 조용히 "검사할 것이 없다"로 넘어가지 않는다.
const guard = require(GUARD_DIST);
if (Object.keys(guard.TARGET_NAME_EXTRACTORS).length === 0) {
  die(
    '대상-이름 선언을 가진 도구가 하나도 없다 — 사전 검사가 아무것도 막지 못한다.',
    '`npm run build`가 최신인지, 도구 정의의 targetNames가 지워지지 않았는지 확인해라.',
  );
}

const scenarioArg = args.values.get('scenario');
if (!scenarioArg) die('--scenario 가 필요하다.', '예: --scenario=zdemo-program-create-activate');
const { file: scenarioFile, scenario } = loadScenario(scenarioArg, recorder.SEQUENCE_ID_RE);

// 상대 경로는 **엔진 루트 기준**으로 푼다(`attended-guard.mjs`). cwd 기준이면
// 레포 루트에서 `--out=fixtures/attended-only`가 `<repo>/fixtures/…`라는 엉뚱한
// 자리를 새로 만들고, 그 자리는 3분기상 「그 밖」이라 거부 없이 증거가 딴 데 쌓인다.
const outDir = resolveOutDir(args.values.get('out'));
const outDirKind = classifyOutDir(outDir);
const outFile = path.join(outDir, `${scenario.sequenceId}.json`);
const exposition = args.values.get('exposition') ?? 'readonly,high';
const envPath = args.values.get('env-path');

// 저장 자리 거부는 **태우기 전에** 판정한다. 같은 판정이 저장 직전에도 한 번 더
// 돌지만(`detectDegradation`), 그때는 SAP 호출이 전부 나간 뒤다 — 「저장이 안 됐다」는
// 「SAP이 안 바뀌었다」가 아니다. 자리 판정은 엔진 이름과 무관해 여기서 이미 성립한다.
const outRefusal = outDirRefusal(outDir);
if (outRefusal) die('저장 자리가 증거의 자리가 아니다 — 녹화를 시작하지 않는다.', outRefusal);

// 막지는 않되 알린다 — 「그 밖의 자리」는 정당한 쓰임이지만 커밋 대상이 아니다.
for (const notice of outDirNotices(outDir)) console.warn(`⚠️ ${notice}`);

// 덮어쓰기 확인은 **실제로 쓰는 경로에서만** 한다. dry-run은 아무것도 쓰지
// 않으므로 여기서 막으면 이미 채록한 시퀀스의 형식 검사가 영영 불가능해진다.
if (!dryRun && fs.existsSync(outFile) && !args.flags.has('force')) {
  die(`픽스처가 이미 있다: ${outFile}`, '덮어쓰려면 --force. 픽스처는 증거라 조용히 갈아치우지 않는다.');
}

// 태우기 **전에** 막는다 — 찍고 나서 버리면 실 SAP 호출은 이미 나간 뒤다.
const standardSource = guard.checkSourceNamespace(scenario, {
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
  console.log(
    `   저장 자리   : ${outDirKind}` +
      (outDirKind === 'attended-only' ? ' (제품 엔진 이름을 요구한다)' : ''),
  );
  console.log(`   exposition : ${exposition}`);
  console.log(
    `   대상 검사   : 대상-이름을 선언한 도구 ${Object.keys(guard.TARGET_NAME_EXTRACTORS).length}종 ` +
      '(선언 없는 도구는 사후 백스톱)',
  );
  console.log('   (dry-run — 제품 번들을 띄우지도, SAP에 붙지도 않았다.)');
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
if (!fs.existsSync(BUNDLE)) die(`제품 번들이 없다: ${BUNDLE}`);

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
  onStderr: (chunk) => process.stderr.write(`  [제품 번들] ${chunk}`),
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

// 판정 자체가 서지 못하면(무접속 어휘 정본을 못 읽는 등) **판정 없이 저장하지 않는다.**
let problems;
try {
  problems = [
    ...detectDegradation(fixture, { allowAllErrors: args.flags.has('allow-all-errors'), outDir }),
    ...guard.detectUnguardedSource(fixture, { allowStandardSource: args.flags.has('allow-standard-source') }),
  ];
} catch (err) {
  console.error('❌ 녹화를 저장하지 않는다 — 강등 판정을 세우지 못했다.');
  console.error(`   ${err?.message ?? String(err)}`);
  console.error(SAP_ALREADY_RAN);
  process.exit(1);
}
if (problems.length) {
  console.error('❌ 녹화를 저장하지 않는다.');
  for (const p of problems) console.error(`   · ${p}`);
  console.error(SAP_ALREADY_RAN);
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
