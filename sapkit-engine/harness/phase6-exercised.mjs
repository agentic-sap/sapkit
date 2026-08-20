/**
 * 얼린 관측 뽑기 — `harness/phase6-exercised.json`을 **한 번 뽑아 얼린다.**
 *
 *   node harness/phase6-exercised.mjs           # 지금 픽스처를 훑어 파일에 쓴다 (= 다시 얼린다)
 *   node harness/phase6-exercised.mjs --check   # 지금 픽스처와 얼린 관측이 갈라졌는지 **알려만 준다**
 *   node harness/phase6-exercised.mjs --stdout  # 파일을 건드리지 않고 화면에 낸다
 *
 * **SAP에 붙지 않는다.** 입력은 레포 안의 `fixtures/` 아래 `*.json` 뿐이다.
 *
 * ## 왜 손으로 채우지 않고, 왜 매번 다시 훑지도 않는가
 *
 * 손으로 채우면 다음 사람이 **재현하지 못한다** — 78이라는 수가 어디서 나왔는지
 * 아무도 모른 채 계획의 근거가 된다. 그래서 뽑는 일을 스크립트로 둔다.
 *
 * 반대로 산식(`harness/build-plan.mjs`)이 매 실행마다 `fixtures/`를 다시 훑으면
 * **증거를 못 만들수록 요구가 저절로 낮아지는 자기충족 구조**가 된다. 픽스처를
 * 지우는 것만으로 그 도구의 요구 급이 조용히 내려가고, 대장은 아무 일도 없었던
 * 것처럼 초록이다. 그래서 산식은 이 파일만 읽고, 이 스크립트를 **부르는 일**이
 * 곧 「다시 얼린다」는 사람의 판단이다. 그 판단은 커밋에 남는다.
 *
 * ## `--check`가 자동으로 다시 얼리지 않는 이유
 *
 * 갈라짐을 발견했을 때 자동으로 다시 얼리면 위의 자기충족이 그대로 돌아온다.
 * 그래서 `--check`는 **판정만** 한다. 갈라짐에는 방향이 있고, 출력이 그 방향을
 * 나눠 적는다:
 *
 * - **는 쪽**(픽스처에 있는데 얼린 목록에 없다) — 새 실기가 붙었다. 다시 얼리면
 *   요구가 **올라간다**. 안전한 방향이다.
 * - **주는 쪽**(얼린 목록에 있는데 픽스처에 없다) — 픽스처가 사라졌다. 다시
 *   얼리면 요구가 **내려간다**. 이 방향은 새 D-결정 없이 집행하지 않는다.
 *
 * 이 스크립트는 `npm run gates`에 **걸지 않았다.** 게이트로 걸면 다음 판이
 * 픽스처를 더할 때마다 빨개지고, 빨간 게이트를 끄는 가장 쉬운 길이 「다시
 * 얼리기」다 — 그 길을 상시로 열어 두는 것이 곧 자기충족이다. 판을 닫을 때
 * 사람이 쳐 보는 명령으로 둔다.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const ENGINE_ROOT = path.resolve(here('..'));
const FIXTURES = path.join(ENGINE_ROOT, 'fixtures');
const SURFACE = path.join(ENGINE_ROOT, 'harness', 'old-surface', 'm1-tools.json');
const TARGET = path.join(ENGINE_ROOT, 'harness', 'phase6-exercised.json');

const SCHEMA = 'sapkit-phase6-exercised/1';

/** 사람이 읽을 머리말. 파일만 보고도 왜 얼렸는지·언제 다시 뽑는지 알게 한다. */
const NOTE =
  '얼린 관측이다. 「판6이 끝나는 시점까지 레포 안 픽스처가 실제로 건드린 도구」의 전량이고, ' +
  '요구 증거 급 산식(harness/build-plan.mjs 산식 5)이 이 목록만 읽는다. ' +
  '산식이 매 실행마다 fixtures/를 다시 훑으면 증거를 못 만들수록 요구가 저절로 낮아지는 ' +
  '자기충족 구조가 되기 때문에, 관측을 한 번 뽑아 여기 얼린다. 도구 이름과 집계 수치만 담는다.';

const REFREEZE =
  '다시 뽑는 것은 사람의 판단이고 커밋에 남는다 — `node harness/phase6-exercised.mjs`. ' +
  '뽑을 자리는 「판이 새 실기로 픽스처를 늘렸을 때」다(요구가 올라간다). ' +
  '픽스처가 줄어서 목록이 짧아지는 방향은 요구를 내리는 방향이므로 새 D-결정 없이 집행하지 않는다. ' +
  '갈라졌는지만 보려면 `node harness/phase6-exercised.mjs --check`.';

const WINDOW = {
  phases: ['판6.1', '판6.2', '판6.3'],
  basis:
    '판6 구간에 커밋된 재생 기준선(fixtures/*.json)과 attended 실기 기록(fixtures/attended-only/*.json)을 ' +
    '통틀어 훑는다. 판6 이전 채록분도 여기 포함된다 — 질문이 「언제 찍었나」가 아니라 ' +
    '「지금 이 도구를 태우는 픽스처가 레포에 있는가」이기 때문이다.',
};

// ── 훑기 ─────────────────────────────────────────────────────────────────────

function walkJson(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function scan() {
  if (!fs.existsSync(FIXTURES)) {
    console.error(`❌ 픽스처 디렉터리가 없다: ${FIXTURES}`);
    process.exit(2);
  }
  const files = walkJson(FIXTURES).sort();
  const tools = new Set();
  let steps = 0;
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const step of parsed.steps ?? []) {
      if (typeof step?.tool !== 'string') continue;
      tools.add(step.tool);
      steps += 1;
    }
  }

  // 표면 밖 이름이 섞이면 그건 픽스처가 아니라 이 스크립트가 틀린 것이다.
  const surface = new Set(Object.keys(JSON.parse(fs.readFileSync(SURFACE, 'utf8')).tools ?? {}));
  const outside = [...tools].filter((tool) => !surface.has(tool)).sort();
  if (outside.length > 0) {
    console.error(`❌ 픽스처가 표면 186종 밖의 이름을 태운다 ${outside.length}종: ${outside.join(', ')}`);
    process.exit(1);
  }

  return { files, tools: [...tools].sort(), steps };
}

function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ENGINE_ROOT, encoding: 'utf8' }).trim();
  } catch {
    console.error('❌ `git rev-parse HEAD` 가 실패했다 — 얼린 관측에 좌표 없이 쓰지 않는다.');
    process.exit(2);
  }
}

function render(scanned) {
  const doc = {
    schema: SCHEMA,
    _note: NOTE,
    _refreeze: REFREEZE,
    window: WINDOW,
    source: {
      kind: 'repo-fixture-scan',
      roots: ['fixtures/*.json', 'fixtures/attended-only/*.json'],
      basis: '픽스처 파일의 `steps[].tool` 을 재귀로 훑어 이름을 모은다',
      fixtureFiles: scanned.files.length,
      steps: scanned.steps,
    },
    capturedAt: new Date().toISOString().slice(0, 10),
    capturedCommit: headCommit(),
    totals: { tools: scanned.tools.length },
    tools: scanned.tools,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

const CHECK = process.argv.includes('--check');
const STDOUT = process.argv.includes('--stdout');

if (CHECK) {
  if (!fs.existsSync(TARGET)) {
    console.error(`❌ 얼린 관측이 없다: ${TARGET}`);
    console.error('   · `node harness/phase6-exercised.mjs` 로 뽑아라.');
    process.exit(1);
  }
  const frozen = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  const now = new Set(scan().tools);
  const was = new Set(frozen.tools ?? []);

  const grew = [...now].filter((tool) => !was.has(tool)).sort();
  const shrank = [...was].filter((tool) => !now.has(tool)).sort();

  console.log(`얼린 관측 ${was.size}종 (${frozen.capturedAt} · ${String(frozen.capturedCommit).slice(0, 12)})`);
  console.log(`지금 픽스처 ${now.size}종`);

  if (grew.length === 0 && shrank.length === 0) {
    console.log('✅ 갈라지지 않았다 — 얼린 관측이 지금 픽스처와 같다.');
    process.exit(0);
  }
  if (grew.length > 0) {
    console.error(`\n▲ 는 쪽 ${grew.length}종 — 픽스처에 있는데 얼린 목록에 없다 (다시 얼리면 요구가 올라간다):`);
    console.error(`   ${grew.join(', ')}`);
  }
  if (shrank.length > 0) {
    console.error(`\n▼ 주는 쪽 ${shrank.length}종 — 얼린 목록에 있는데 픽스처에 없다 (다시 얼리면 요구가 내려간다):`);
    console.error(`   ${shrank.join(', ')}`);
    console.error('   · 이 방향은 새 D-결정 없이 집행하지 않는다.');
  }
  console.error('\n❌ 갈라졌다. **자동으로 다시 얼리지 않는다** — 다시 얼릴지는 사람이 정한다.');
  process.exit(1);
}

const scanned = scan();
const rendered = render(scanned);

if (STDOUT) {
  process.stdout.write(rendered);
  process.exit(0);
}

fs.writeFileSync(TARGET, rendered, 'utf8');
console.log(`얼린 관측 → ${TARGET}`);
console.log(`   · 픽스처 ${scanned.files.length}파일 · 단계 ${scanned.steps} · 도구 ${scanned.tools.length}종`);
