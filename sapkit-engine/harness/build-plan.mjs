/**
 * 제작 계획 산출기 — `harness/build-plan.json`을 **계산해 만든다.**
 *
 * 묶음·제작 순서·요구 증거 급은 사람이 정해 레포에 싣는 판단이지만, 그 판단을
 * **손으로 적으면 다음 판이 재현하지 못한다.** 그래서 판단을 산식으로 적고
 * 산식을 여기 둔다. 사람이 정한 것은 아래 세 표(횡단 집합 · 폴더→묶음 · 제목)
 * 뿐이고 나머지는 전부 레포 안의 데이터에서 나온다.
 *
 *   node harness/build-plan.mjs           # 계산해 파일에 쓴다
 *   node harness/build-plan.mjs --check   # 커밋본과 대조만 한다 (다르면 exit 1)
 *   node harness/build-plan.mjs --stdout  # 파일을 건드리지 않고 화면에 낸다
 *
 * **SAP에 붙지 않는다.** 입력은 전부 레포 안의 파일이다.
 * 사람이 읽을 근거와 묶음 편성표는 `harness/BUILD-PLAN.md`가 갖는다.
 *
 * ## 입력
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 도구 186종 정본 | `harness/old-surface/m1-tools.json` 의 `tools` |
 * | 호출 횟수 · 꼬리 49종 · 클래스 | `harness/usage-census.json` |
 * | 픽스처가 실제로 태운 도구 | `harness/phase6-exercised.json` (**얼린 관측**) |
 * | 오브젝트 종류(묶음의 단위) | `../engine/src/handlers/**` 의 `TOOL_DEFINITION` 이름 |
 *
 * 구 핸들러 트리는 **읽기만 한다.**
 *
 * 사다리 판정 자체는 `harness/ledger/grade.ts`가 소유한다 — `.mjs` 안에 있는
 * 판정은 jest가 못 잡고, 사다리는 조용히 틀리면 대장 전체가 조용히 틀리는
 * 자리이기 때문이다. 그래서 이 스크립트는 **`npm run build` 뒤에** 돈다.
 *
 * ## 산식 (spec §4.4 · §4.4.2 · §3.3)
 *
 * 1. **묶음** — 도구가 선언된 구 핸들러 **최상위 폴더**가 기본 묶음이다. 세 곳만
 *    사람이 고쳐 잡는다(아래 `FOLDER_TO_BUNDLE` 주석 참조).
 * 2. **꼬리 우선** — 실사용 축의 꼬리 49종은 원래 묶음에서 빼내 `tail` 묶음으로
 *    모은다. 이 규칙이 다른 모든 배정보다 앞선다.
 * 3. **runtime 분리** — `system/` 안에 사는 runtime 클래스 도구는 `runtime`
 *    묶음으로 뗀다. tier 게이트가 걸리고 성격이 달라 함께 두면 "186종이 정확히
 *    한 묶음"이 성립하지 않는다.
 * 4. **순서** — ⓐ 횡단 묶음이 오브젝트 묶음보다 앞 ⓑ `tail`이 맨 뒤. 그 두 칸
 *    안에서는 **묶음에 속한 도구들의 실사용 호출 횟수 합**의 내림차순이고,
 *    같으면 도구 수 내림차순, 그래도 같으면 묶음 id 오름차순이다.
 * 5. **요구 급** — 사다리에서 **높은 것이 이긴다**:
 *    ① `Create*`·`Delete*` → `attended` (재생은 원리상 불가)
 *    ② 호출 횟수 > 0 **이고** 얼린 관측(`harness/phase6-exercised.json`)에 있으면 → `replay`
 *    ②' 호출 횟수 > 0 인데 얼린 관측에 **없으면** → `contract` · `downgradedFrom: "replay"`
 *       — **인하**다(D-092 ⓐ: 판6이 끝나는 시점까지 한 번도 쓰이지 않은 재생 대상은
 *       계약 시험 급으로 내린다). 인하는 증거를 만든 것이 아니라 요구를 낮춘 것이므로
 *       그 사실이 `build-plan.json`에 남아야 한다.
 *    ③ 그 밖 (호출 0) → `contract` — **인하가 아니다.** ②'와 결과가 같아도 다른 사실이라
 *       `downgradedFrom`으로 구별한다.
 *    `substitute`(대체 기대 시험)는 급이 아니라 부가 요건이라 여기 적지 않는다 —
 *    차이 장부 등재분에 대해 대장이 자동으로 붙인다.
 *
 *    ②의 「얼린 관측」을 매 실행마다 `fixtures/`를 다시 훑어 대신하지 않는다.
 *    그러면 **증거를 못 만들수록 요구가 저절로 낮아지는 자기충족 구조**가 된다.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const DIST_LEDGER = here('../dist/harness/ledger/index.js');
if (!fs.existsSync(DIST_LEDGER)) {
  console.error(`❌ 빌드 산출물이 없다: ${DIST_LEDGER}`);
  console.error('   · 사다리 판정은 `harness/ledger/grade.ts`가 소유한다 — `npm run build`를 먼저 돌려라.');
  process.exit(2);
}
const { PHASE6_EXERCISED_PATH, gradeOf, loadPhase6Exercised } = require(DIST_LEDGER);

const ENGINE_ROOT = path.resolve(here('..'));
const REPO_ROOT = path.resolve(ENGINE_ROOT, '..');
const SURFACE = path.join(ENGINE_ROOT, 'harness', 'old-surface', 'm1-tools.json');
const CENSUS = path.join(ENGINE_ROOT, 'harness', 'usage-census.json');
const EXERCISED = path.join(ENGINE_ROOT, PHASE6_EXERCISED_PATH);
const HANDLERS = path.join(REPO_ROOT, 'engine', 'src', 'handlers');
const TARGET = path.join(ENGINE_ROOT, 'harness', 'build-plan.json');

/**
 * 횡단 묶음 — 오브젝트가 아니라 기능이다. 오브젝트 묶음이 이들을 참조하므로
 * **먼저 짓는다**(spec §4.4).
 *
 * `compact`는 구 트리에서 넷째 횡단 폴더지만 **이 표면에 도구가 하나도 없다** —
 * 거기 선언된 22종은 `Handler*`로 시작하는 compact 표면이고 186종 밖이다.
 * 그래서 빈 묶음을 세우지 않는다. 근거는 `BUILD-PLAN.md` §2.
 */
const CROSSCUTTING = new Set(['system', 'common', 'search', 'runtime']);

/**
 * 폴더 → 묶음. 적지 않은 폴더는 이름을 그대로(밑줄→하이픈) 쓴다.
 *
 * 사람이 고쳐 잡은 곳은 셋뿐이고, 이유는 모두 하나다 — **구 폴더가 오브젝트
 * 종류가 아니라 동사로 갈려 있다.** spec이 못 박은 묶음의 단위는 오브젝트
 * 종류이므로 그쪽을 따른다.
 *
 * - `ddlx` → `metadata-extension` — 같은 오브젝트(DDLX = 메타데이터 확장)인데
 *   쓰기 2종만 따로 산다. 나누면 한 오브젝트를 두 순서에 걸쳐 짓게 된다.
 * - `function` → 도구 이름으로 갈라 `function-group` / `function-module` —
 *   이 폴더는 함수그룹·함수모듈 **양쪽의 쓰기**를 함께 담은 동사 폴더다.
 */
const FOLDER_TO_BUNDLE = {
  ddlx: 'metadata-extension',
  metadata_extension: 'metadata-extension',
  function: (tool) => (/FunctionGroup$/.test(tool) ? 'function-group' : 'function-module'),
  function_group: 'function-group',
  function_module: 'function-module',
};

/** 묶음 제목. 여기 없는 id는 산출을 멈춘다 — 이름 없는 묶음을 내지 않는다. */
const TITLES = {
  system: '시스템·공통 조회',
  search: '검색',
  common: '공통 편집·활성',
  runtime: '런타임 — 덤프·프로파일러·시스템 메시지',
  include: '인클루드',
  class: '클래스',
  table: '테이블',
  program: '프로그램',
  'function-module': '함수모듈',
  structure: '구조체',
  view: '뷰',
  'unit-test': '단위시험',
  'behavior-definition': '동작 정의 (BDEF)',
  'data-element': '데이터 엘리먼트',
  'service-binding': '서비스 바인딩',
  domain: '도메인',
  transport: '트랜스포트',
  'metadata-extension': '메타데이터 확장 (DDLX)',
  'gui-status': 'GUI 상태',
  'text-element': '텍스트 엘리먼트',
  atc: 'ATC',
  package: '패키지',
  screen: '화면',
  'service-definition': '서비스 정의',
  'behavior-implementation': '동작 구현 (BIMP)',
  'function-group': '함수그룹',
  interface: '인터페이스',
  enhancement: '인핸스먼트',
  tail: '꼬리 — 호출·참조 양쪽 0',
};

const TAIL_BUNDLE = 'tail';

// ── 구 핸들러 트리에서 오브젝트 종류를 읽는다 (읽기 전용) ────────────────────

const TOOL_NAME = /export const TOOL_DEFINITION[^{]*=\s*{\s*name:\s*['"]([^'"]+)['"]/;

function walkTypeScript(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTypeScript(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function folderByTool() {
  if (!fs.existsSync(HANDLERS)) {
    console.error(`❌ 구 핸들러 트리가 없다: ${HANDLERS}`);
    console.error('   · 오브젝트 종류의 근거가 없으면 묶음을 짐작하지 않는다.');
    process.exit(2);
  }
  const map = new Map();
  for (const file of walkTypeScript(HANDLERS)) {
    const hit = TOOL_NAME.exec(fs.readFileSync(file, 'utf8'));
    if (hit === null) continue;
    const rel = path.relative(HANDLERS, file).split(path.sep);
    map.set(hit[1], rel.length > 1 ? rel[0] : '(root)');
  }
  return map;
}

// ── 산출 ─────────────────────────────────────────────────────────────────────

function bail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function bundleIdOf(tool, folder, census) {
  if (census.tailSet.has(tool)) return TAIL_BUNDLE;
  if (folder === 'system' && census.classOf[tool] === 'runtime') return 'runtime';
  const mapped = FOLDER_TO_BUNDLE[folder];
  if (typeof mapped === 'function') return mapped(tool);
  if (typeof mapped === 'string') return mapped;
  return folder.replace(/_/g, '-');
}

function buildPlan() {
  const surface = Object.keys(JSON.parse(fs.readFileSync(SURFACE, 'utf8')).tools ?? {}).sort();
  if (surface.length === 0) bail(`표면 채록본에 tools(전량 선언)가 없다: ${SURFACE}`);

  const raw = JSON.parse(fs.readFileSync(CENSUS, 'utf8'));
  const census = { counts: raw.counts, classOf: raw.classOf, tailSet: new Set(raw.tail) };

  // 얼린 관측이 없거나 깨졌으면 **던진다**(fail-closed). 조용히 인하 없이 넘어가면
  // 인하 전의 계획이 다시 쓰이고, 그 파일을 읽는 사람은 인하가 집행된 줄 안다.
  let exercised;
  try {
    exercised = loadPhase6Exercised(EXERCISED);
  } catch (error) {
    console.error(`❌ ${error?.message ?? String(error)}`);
    process.exit(2);
  }

  const folders = folderByTool();

  const missing = surface.filter((tool) => !folders.has(tool));
  if (missing.length > 0) bail(`구 핸들러 트리에서 오브젝트 종류를 못 찾은 도구 ${missing.length}종: ${missing.join(', ')}`);

  const members = new Map();
  const tools = {};
  for (const tool of surface) {
    const id = bundleIdOf(tool, folders.get(tool), census);
    if (TITLES[id] === undefined) bail(`묶음 제목이 없다: ${id} (도구 ${tool})`);
    if (!members.has(id)) members.set(id, []);
    members.get(id).push(tool);
    const verdict = gradeOf(tool, census.counts[tool] ?? 0, exercised.tools);
    tools[tool] = {
      bundle: id,
      requiredGrade: verdict.grade,
      ...(verdict.downgradedFrom === null ? {} : { downgradedFrom: verdict.downgradedFrom }),
    };
  }

  // 순서 — 횡단 먼저, 꼬리 맨 뒤, 그 안에서는 호출 합 내림차순.
  const rank = (id) => (id === TAIL_BUNDLE ? 2 : CROSSCUTTING.has(id) ? 0 : 1);
  const callsOf = (id) => members.get(id).reduce((sum, tool) => sum + (census.counts[tool] ?? 0), 0);

  const ordered = [...members.keys()].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const byCalls = callsOf(b) - callsOf(a);
    if (byCalls !== 0) return byCalls;
    const bySize = members.get(b).length - members.get(a).length;
    if (bySize !== 0) return bySize;
    return a.localeCompare(b);
  });

  const bundles = ordered.map((id, index) => ({ id, title: TITLES[id], order: index + 1 }));

  return {
    plan: { formatVersion: 1, bundles, tools },
    members,
    census,
    exercised,
    callsOf,
  };
}

// ── 검산 — 계획서가 못 박은 기준 넷 ─────────────────────────────────────────

function verify({ plan, members, census, exercised }) {
  const problems = [];
  const surfaceCount = Object.keys(plan.tools).length;
  if (surfaceCount !== 186) problems.push(`도구가 186종이 아니다: ${surfaceCount}`);

  const assigned = [...members.values()].reduce((sum, list) => sum + list.length, 0);
  if (assigned !== surfaceCount) problems.push(`묶음 배정 합이 도구 수와 다르다: ${assigned} ≠ ${surfaceCount}`);

  const last = plan.bundles.reduce((max, b) => (b.order > max.order ? b : max), plan.bundles[0]);
  if (last.id !== TAIL_BUNDLE) problems.push(`마지막 묶음이 꼬리가 아니다: ${last.id}`);

  const tail = census.tailSet;
  const inTail = new Set(members.get(TAIL_BUNDLE) ?? []);
  if (inTail.size !== 49) problems.push(`꼬리 묶음이 49종이 아니다: ${inTail.size}`);
  for (const tool of tail) if (!inTail.has(tool)) problems.push(`꼬리인데 꼬리 묶음 밖이다: ${tool}`);
  for (const tool of inTail) if (!tail.has(tool)) problems.push(`꼬리가 아닌데 꼬리 묶음 안이다: ${tool}`);

  const deletes = Object.keys(plan.tools).filter((t) => t.startsWith('Delete'));
  if (deletes.length !== 25) problems.push(`Delete* 가 25종이 아니다: ${deletes.length}`);
  for (const tool of deletes) if (!inTail.has(tool)) problems.push(`Delete* 인데 꼬리 묶음 밖이다: ${tool}`);

  const orderOf = new Map(plan.bundles.map((b) => [b.id, b.order]));
  const crossMax = Math.max(...[...CROSSCUTTING].filter((id) => orderOf.has(id)).map((id) => orderOf.get(id)));
  const objectMin = Math.min(
    ...plan.bundles.filter((b) => !CROSSCUTTING.has(b.id) && b.id !== TAIL_BUNDLE).map((b) => b.order),
  );
  if (!(crossMax < objectMin)) problems.push(`횡단 묶음이 오브젝트 묶음보다 앞이 아니다: ${crossMax} ≮ ${objectMin}`);

  for (const [tool, entry] of Object.entries(plan.tools)) {
    const want = gradeOf(tool, census.counts[tool] ?? 0, exercised.tools);
    if (entry.requiredGrade !== want.grade) {
      problems.push(`요구 급이 사다리와 다르다: ${tool} — ${entry.requiredGrade} ≠ ${want.grade}`);
    }
    if ((entry.downgradedFrom ?? null) !== want.downgradedFrom) {
      problems.push(
        `인하 표시가 사다리와 다르다: ${tool} — ${JSON.stringify(entry.downgradedFrom ?? null)} ≠ ` +
          `${JSON.stringify(want.downgradedFrom)}`,
      );
    }
    if (entry.requiredGrade === 'substitute') problems.push(`substitute 는 주 급이 아니다: ${tool}`);
  }

  // 인하는 **호출 이력이 있는데 얼린 관측 밖**인 도구에만 붙는다. 이 단언이
  // 없으면 얼린 관측이 통째로 비어도 "사다리대로다"라며 전량 인하가 지나간다.
  const downgraded = Object.entries(plan.tools).filter(([, entry]) => (entry.downgradedFrom ?? null) !== null);
  for (const [tool, entry] of downgraded) {
    if (entry.downgradedFrom !== 'replay') problems.push(`인하 전 급이 재생이 아니다: ${tool} — ${entry.downgradedFrom}`);
    if ((census.counts[tool] ?? 0) <= 0) problems.push(`실호출이 없는데 인하로 적혔다: ${tool}`);
    if (exercised.tools.has(tool)) problems.push(`얼린 관측 안인데 인하로 적혔다: ${tool}`);
  }

  return problems;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

/** 급 분포 한 줄. **인하 수를 여기 실어야** 조용히 사라지지 않는다. */
function gradeLine({ plan, exercised }) {
  const entries = Object.values(plan.tools);
  const count = (grade) => entries.filter((e) => e.requiredGrade === grade).length;
  const downgraded = entries.filter((e) => e.downgradedFrom !== undefined).length;
  return (
    `요구 급 — 재생 ${count('replay')} · attended ${count('attended')} · 계약 ${count('contract')} ` +
    `(그중 인하 ${downgraded}종 · 얼린 관측 ${exercised.tools.size}종 @ ${exercised.capturedAt})`
  );
}

const CHECK = process.argv.includes('--check');
const STDOUT = process.argv.includes('--stdout');

const built = buildPlan();
const problems = verify(built);
if (problems.length > 0) {
  console.error('❌ 제작 계획이 계획서의 검증 기준을 어긴다:');
  for (const problem of problems) console.error(`   · ${problem}`);
  process.exit(1);
}

const rendered = `${JSON.stringify(built.plan, null, 2)}\n`;

if (STDOUT) {
  process.stdout.write(rendered);
  process.exit(0);
}

if (CHECK) {
  const committed = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n') : null;
  if (committed === null) {
    console.error('❌ 커밋된 제작 계획이 없다 — `node harness/build-plan.mjs`로 만들어라.');
    process.exit(1);
  }
  if (committed !== rendered) {
    console.error('❌ 제작 계획이 산식과 다르다 — 손으로 고쳤다면 되돌리고, 입력이 바뀐 것이면 다시 만들어 커밋해라.');
    process.exit(1);
  }
  console.log('✅ 제작 계획이 산식과 일치한다 — harness/build-plan.json');
  console.log(`   · 묶음 ${built.plan.bundles.length} · 도구 ${Object.keys(built.plan.tools).length}종 · 검증 기준 4종 통과`);
  console.log(`   · ${gradeLine(built)}`);
  process.exit(0);
}

fs.writeFileSync(TARGET, rendered, 'utf8');
console.log(`제작 계획 → ${TARGET}`);
console.log(`   · 묶음 ${built.plan.bundles.length} · 도구 ${Object.keys(built.plan.tools).length}종`);
console.log(`   · ${gradeLine(built)}`);
for (const bundle of built.plan.bundles) {
  const list = built.members.get(bundle.id);
  console.log(
    `   ${String(bundle.order).padStart(2)} ${bundle.id.padEnd(24)} ${String(list.length).padStart(3)}종 · ` +
      `호출 ${built.callsOf(bundle.id)}`,
  );
}
