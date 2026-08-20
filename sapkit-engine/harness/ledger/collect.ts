/**
 * 대장의 입력을 모은다 — **입력이 무엇인지 못 박는 자리.**
 *
 * "등록점과 채록본에서 계산한다"만으로는 증거 열을 채울 수 없다. 등록점에도
 * 채록본에도 증거는 없기 때문이다. 그래서 입력을 아홉으로 벌려 적고, 각각이
 * 레포 안의 **어느 파일**인지와 **지금 있는지**를 대장에 그대로 싣는다.
 *
 * | 열 | 입력 |
 * |---|---|
 * | 도구 이름 · 전체 목록 | `harness/old-surface/m1-tools.json` 의 `tools` (186종) |
 * | 상태의 `지음` 여부 | `src/tools/registry.ts` 등록점 |
 * | 묶음 · 제작 순서 · 요구 급 · **인하 표시** | `harness/build-plan.json` (뒤 작업이 산출 — 없으면 「미정」) |
 * | 인하의 근거 | `harness/phase6-exercised.json` (얼린 관측 — 계획이 이미 반영해 온다) |
 * | 증거 · attended | `fixtures/attended-only/*.json` |
 * | 증거 · replay | 커밋된 재생 픽스처 + 커밋된 재생 판정 파일 |
 * | 증거 · contract | 도구별 계약 시험 파일의 존재 + 최근 실행 결과 파일 |
 * | 증거 · 대체 기대 시험 | 차이 장부 등재분이 지목하는 시험 파일의 실재 |
 * | 위임형 여부 | 구 핸들러가 `@babamba2/*`를 참조하는가 |
 *
 * 상태 3칸의 계산은 `harness/replay/coverage.ts`가 소유한다. 여기서 다시 짜지
 * 않는다 — **판정 기준은 등록점 하나**라는 규칙이 거기 한 곳에만 있어야 한다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { TOOL_REGISTRY } from '../../src/tools/registry';
import { M1_DIVERGENCES } from '../replay/divergences';
import { buildCoverage } from '../replay/coverage';
import { parseContractEvidence } from '../replay/evidenceInputs';
import type { CoverageReport, PrimaryGrade } from '../replay/coverage';
import {
  CONTRACT_RESULTS_PATH,
  REPLAY_VERDICT_DIR,
  attendedEvidenceFromFixtures,
  findContractTestFiles,
  loadReplayVerdicts,
  replaysFromVerdicts,
  substituteEvidenceFromLedger,
  toolsInFixtures,
} from './evidence';
import { scanDelegation } from './delegation';
import type { DelegationKind } from './delegation';
import { PHASE6_EXERCISED_PATH, loadPhase6Exercised } from './grade';
import { BUILD_PLAN_PATH, bundleOf, loadBuildPlan, requiredGradesFrom } from './plan';
import type { BuildPlan, PlanBundle } from './plan';

/** 대장 파일의 자리 — `sapkit-engine/` 기준. */
export const LEDGER_PATH = 'TOOL-LEDGER.md';

export interface ToolFacts {
  /** 커밋된 재생 픽스처가 이 도구를 건드리는가. 판정 파일과는 다른 질문이다. */
  readonly hasReplayFixture: boolean;
  /** 도구별 계약 시험 파일이 있는가. 실행 결과와는 다른 질문이다. */
  readonly contractTestFile: string | null;
  /**
   * 구 도구가 `@babamba2/*`에 기대는 깊이 — 직접 / 공용 헬퍼 경유 / 없음.
   * `null` = 구 소스가 없어 **판정하지 않았다**(없다는 뜻이 아니다).
   */
  readonly delegated: DelegationKind | null;
  readonly bundle: PlanBundle | null;
  /**
   * 요구 급을 **낮춘 흔적** — 인하 전의 급. 인하가 아니면 `null`.
   *
   * 이 칸이 없으면 대장은 인하분을 「원래 계약 시험이었구나」로 보이게 한다.
   * 증거가 는 것과 요구가 내려간 것은 다른 사실이고, 대장은 그 둘을 섞지 않는다.
   */
  readonly downgradedFrom: PrimaryGrade | null;
}

export interface LedgerSource {
  readonly label: string;
  readonly path: string;
  readonly present: boolean;
  readonly detail: string;
}

/**
 * 위임형 열의 총계 — **46과 161이 어긋나 보이는 것을 화해시키는 수들.**
 *
 * 둘은 단위가 다르다. `directHandlerFiles`는 **파일 수**이고 `direct`는 **이
 * 표면 안의 도구 수**다. 이 구분을 대장에 적어 두지 않으면 다음 세션이 "수가
 * 안 맞는다"로 시간을 쓴다.
 */
export interface DelegationSummary {
  /** 구 소스를 읽어 판정했는가. 거짓이면 전량 「미상」이다. */
  readonly known: boolean;
  readonly direct: number;
  readonly indirect: number;
  readonly none: number;
  /** 핸들러 파일 중 `@babamba2`를 직접 쓰는 **파일** 수. */
  readonly directHandlerFiles: number;
  /** 그중 타입이 아니라 **값**으로 쓰는 파일 수. */
  readonly directValueHandlerFiles: number;
  /** 그중 이 표면의 도구 선언이 아닌 파일 수 — 표면 밖 이름이거나 선언이 없는 파일. */
  readonly filesOutsideSurface: number;
  /**
   * 위임으로 셌지만 **타입 경로로만** 닿는 도구 수.
   *
   * 이 수가 0이면 「없음 0」은 계산이 성긴 탓이 아니라 실제로 전량이 남의
   * 런타임 코드를 돌린다는 뜻이다. 0이 아니면 그만큼은 컴파일 타임 의존이다.
   */
  readonly typeOnlyReach: number;
  /** import를 따라간 범위의 소스 파일 수. */
  readonly sourceFiles: number;
}

/**
 * 요구 급 인하(D-092 ⓐ)의 총계 — **인하 전 수치를 함께 갖는다.**
 *
 * 인하 뒤의 「증거 있음」만 실으면 그 수가 증거를 만들어 얻은 것처럼 읽힌다.
 * 인하 전이었다면 몇이었는지를 나란히 적어야 「요구가 내려갔다」가 드러난다.
 */
export interface DowngradeSummary {
  /** 인하된 도구 수. */
  readonly count: number;
  /** 인하가 없었다면(원래 급 그대로였다면) 나왔을 수치. */
  readonly awaitingEvidenceBefore: number;
  readonly evidencedBefore: number;
}

export interface LedgerModel {
  readonly coverage: CoverageReport;
  readonly plan: BuildPlan | null;
  readonly facts: ReadonlyMap<string, ToolFacts>;
  readonly sources: readonly LedgerSource[];
  readonly delegation: DelegationSummary;
  /** 인하가 0종이거나 계획이 없으면 `null`. */
  readonly downgrade: DowngradeSummary | null;
}

export interface CollectOptions {
  readonly engineRoot?: string;
  readonly repoRoot?: string;
  readonly catalogPath?: string;
  readonly planPath?: string;
  readonly replayVerdictDir?: string;
  readonly contractResultsPath?: string;
  readonly fixtureDir?: string;
  readonly attendedDir?: string;
  readonly toolsDir?: string;
  readonly oldHandlersDir?: string;
  /** 위임 사슬을 따라갈 범위. 기본은 `oldHandlersDir`의 부모(= `engine/src`). */
  readonly oldSrcRoot?: string;
  /** 등록점 스냅샷을 갈아끼운다. 시험이 상태 판정을 좁혀 보기 위한 구멍이다. */
  readonly registered?: readonly string[];
}

/** `sapkit-engine/`을 찾는다 — 소스(`harness/ledger`)에서도 산출물(`dist/harness/ledger`)에서도 닿게. */
export function findEngineRoot(from: string = __dirname): string {
  let dir = from;
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(dir, 'harness', 'old-surface', 'm1-tools.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('sapkit-engine 루트를 찾지 못했다 (harness/old-surface/m1-tools.json 기준).');
}

/** 구 번들 표면 채록본의 **전량 선언**에서 도구 이름을 읽는다. `m1` 19종이 아니라 186종이다. */
export function loadSurfaceToolNames(catalogPath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { tools?: Record<string, unknown> };
  if (parsed.tools === undefined || typeof parsed.tools !== 'object') {
    throw new Error(`구 표면 채록본에 tools(전량 선언)가 없다: ${catalogPath}`);
  }
  return Object.keys(parsed.tools).sort();
}

const show = (engineRoot: string, target: string): string =>
  path.relative(engineRoot, target).split(path.sep).join('/');

export function collectLedger(options: CollectOptions = {}): LedgerModel {
  const engineRoot = options.engineRoot ?? findEngineRoot();
  const repoRoot = options.repoRoot ?? path.resolve(engineRoot, '..');

  const catalogPath = options.catalogPath ?? path.join(engineRoot, 'harness', 'old-surface', 'm1-tools.json');
  const planPath = options.planPath ?? path.join(engineRoot, BUILD_PLAN_PATH);
  const verdictDir = options.replayVerdictDir ?? path.join(engineRoot, REPLAY_VERDICT_DIR);
  const contractPath = options.contractResultsPath ?? path.join(engineRoot, CONTRACT_RESULTS_PATH);
  const fixtureDir = options.fixtureDir ?? path.join(engineRoot, 'fixtures');
  const attendedDir = options.attendedDir ?? path.join(engineRoot, 'fixtures', 'attended-only');
  const toolsDir = options.toolsDir ?? path.join(engineRoot, 'src', 'tools');
  const handlersDir = options.oldHandlersDir ?? path.join(repoRoot, 'engine', 'src', 'handlers');

  const tools = loadSurfaceToolNames(catalogPath);
  const registered = options.registered ?? TOOL_REGISTRY.map((tool) => tool.definition.name);
  const plan = loadBuildPlan(planPath);

  const verdicts = loadReplayVerdicts(verdictDir);
  const attended = attendedEvidenceFromFixtures(attendedDir);
  const contractTestFiles = findContractTestFiles(toolsDir, tools, engineRoot);
  const contractTests = fs.existsSync(contractPath)
    ? parseContractEvidence(fs.readFileSync(contractPath, 'utf8'), show(engineRoot, contractPath))
    : [];
  const substituteTests = substituteEvidenceFromLedger(M1_DIVERGENCES, repoRoot);

  const evidenceInput = {
    tools,
    replays: replaysFromVerdicts(verdicts),
    attended,
    contractTests,
    substituteTests,
    registered,
  };

  const coverage = buildCoverage({
    ...evidenceInput,
    ...(plan === null ? {} : { requiredGrades: requiredGradesFrom(plan) }),
  });

  // 인하 전이었다면 어땠을지를 **같은 증거로 한 번 더** 센다. 증거는 그대로 두고
  // 요구만 되돌리는 셈이라, 두 수의 차이는 정확히 「요구가 내려간 몫」이다.
  const downgraded = plan === null ? [] : Object.entries(plan.tools).filter(([, e]) => e.downgradedFrom !== null);
  const downgrade: DowngradeSummary | null =
    plan === null || downgraded.length === 0
      ? null
      : (() => {
          const before: Record<string, PrimaryGrade> = requiredGradesFrom(plan);
          for (const [tool, entry] of downgraded) {
            if (entry.downgradedFrom !== null) before[tool] = entry.downgradedFrom;
          }
          const was = buildCoverage({ ...evidenceInput, requiredGrades: before });
          return {
            count: downgraded.length,
            awaitingEvidenceBefore: was.totals.awaitingEvidence,
            evidencedBefore: was.totals.evidenced,
          };
        })();

  // 얼린 관측의 **종수**만 읽는다 — 판정에는 쓰지 않는다(그건 계획이 이미 반영해 온다).
  // 여기서 던지지 않는 이유: 이 자리는 입력 표를 그리는 서술이고, 얼린 관측이 없을 때
  // 인하가 조용히 사라지는 것을 막는 fail-closed는 `grade.ts`가 소유한다. 대장이 그
  // 자리에서 한 번 더 던지면 「입력이 없다」를 보여 줄 기회조차 사라진다.
  const exercisedCount = ((): number | null => {
    const file = path.join(engineRoot, PHASE6_EXERCISED_PATH);
    if (!fs.existsSync(file)) return null;
    try {
      return loadPhase6Exercised(file).tools.size;
    } catch {
      return null;
    }
  })();

  const fixtureTools = toolsInFixtures(fixtureDir);
  const scan = scanDelegation(handlersDir, options.oldSrcRoot);
  const facts = new Map<string, ToolFacts>(
    tools.map((tool) => [
      tool,
      {
        hasReplayFixture: fixtureTools.has(tool),
        contractTestFile: contractTestFiles.get(tool) ?? null,
        delegated: scan.byTool.get(tool) ?? null,
        bundle: bundleOf(plan, tool),
        downgradedFrom: plan?.tools[tool]?.downgradedFrom ?? null,
      },
    ]),
  );

  const countKind = (kind: DelegationKind): number =>
    tools.filter((tool) => scan.byTool.get(tool) === kind).length;
  const delegation: DelegationSummary = {
    known: scan.byTool.size > 0,
    direct: countKind('direct'),
    indirect: countKind('indirect'),
    none: countKind('none'),
    directHandlerFiles: scan.directHandlerFiles,
    directValueHandlerFiles: scan.directValueHandlerFiles,
    filesOutsideSurface: scan.directHandlerFiles - countKind('direct'),
    typeOnlyReach: tools.filter(
      (tool) => scan.byTool.get(tool) !== 'none' && scan.byToolValue.get(tool) === 'none',
    ).length,
    sourceFiles: scan.sourceFiles,
  };

  const sources: LedgerSource[] = [
    {
      label: '도구 전체 목록',
      path: show(engineRoot, catalogPath),
      present: true,
      detail: `${tools.length}종 — 구 번들 표면 채록본의 전량 선언`,
    },
    {
      label: '등록점 (`지음` 판정)',
      path: 'src/tools/registry.ts',
      present: true,
      detail: `${registered.length}종 등재`,
    },
    {
      label: '제작 계획 (묶음·순서·요구 급)',
      path: show(engineRoot, planPath),
      present: plan !== null,
      detail:
        plan === null
          ? '묶음·순서·요구 급을 「미정」으로 낸다 (요구 급은 계산기 기본값 = 계약 시험)'
          : `묶음 ${plan.bundles.length} · 배정된 도구 ${Object.keys(plan.tools).length}종 · ` +
            `요구 급 인하 ${downgrade?.count ?? 0}종`,
    },
    {
      label: '얼린 관측 (인하의 근거)',
      path: PHASE6_EXERCISED_PATH,
      present: exercisedCount !== null,
      detail:
        (exercisedCount === null ? '' : `${exercisedCount}종 — **`) +
        (exercisedCount === null ? '' : '`fixtures/` 아래를 재귀로 훑은 수**다(아래 「재생 픽스처」 행과 단위가 다르다 — 그 행은 최상위만 본다). ') +
        '판6까지 픽스처가 실제로 태운 도구 목록. 산식이 매 실행마다 `fixtures/`를 다시 훑으면 ' +
        '증거를 못 만들수록 요구가 저절로 낮아지므로, 한 번 뽑아 얼린 것만 읽는다',
    },
    {
      label: '재생 판정 파일',
      path: `${show(engineRoot, verdictDir)}/*.json`,
      present: verdicts.length > 0,
      detail:
        verdicts.length > 0
          ? `${verdicts.length}건`
          : '재생 증거는 전량 「미기록」. 러너가 판정을 이 경로에 쓰도록 배선돼 있고, 채우는 것은 다음 attended 세션이다',
    },
    {
      label: '재생 픽스처',
      path: `${show(engineRoot, fixtureDir)}/*.json`,
      present: fixtureTools.size > 0,
      detail:
        `${fixtureTools.size}종의 도구를 건드린다 — 픽스처만으로는 증거가 아니다. ` +
        '⚠ **이 수는 최상위 `fixtures/*.json`만 센 것**이고 하위(`attended-only/`)를 세지 않는다 — ' +
        '재생은 그 자리를 수집하지 않기 때문이다. 위 「얼린 관측」의 수와 **단위가 달라** 서로 안 맞는 것이 정상이다',
    },
    {
      label: 'attended 실기 기록',
      path: `${show(engineRoot, attendedDir)}/*.json`,
      present: attended.length > 0,
      detail: attended.length > 0 ? `${attended.length}단계` : '재생할 수 없는 시퀀스의 실기 기록이 아직 없다',
    },
    {
      label: '계약 시험 결과',
      path: show(engineRoot, contractPath),
      present: contractTests.length > 0,
      detail:
        contractTests.length > 0
          ? `${contractTests.length}종`
          : '계약 증거는 전량 「미기록」. `npm run test:report` → `npm run evidence:contract` 로 만든다',
    },
    {
      label: '계약 시험 파일',
      path: 'src/tools/**/__tests__/<도구>.test.ts',
      present: contractTestFiles.size > 0,
      detail: `${contractTestFiles.size}종에 시험 파일이 있다 — 있음이 곧 통과는 아니다`,
    },
    {
      label: '대체 기대 시험',
      path: 'harness/replay/divergences.ts 의 substituteTest 경로',
      present: substituteTests.length > 0,
      detail:
        substituteTests.length > 0
          ? `${substituteTests.length}종에 실재하는 시험 파일이 있다`
          : '도구 단위 등재분(D1·D2·D3)의 대체 기대 시험은 아직 산문뿐이다',
    },
    {
      label: '위임형 판정',
      path: `${show(engineRoot, handlersDir)}/**`,
      present: delegation.known,
      detail: delegation.known
        ? `소스 ${delegation.sourceFiles}파일을 상대 import까지 따라가 판정 — ` +
          `직접 ${delegation.direct} · 간접 ${delegation.indirect} · 없음 ${delegation.none}`
        : '위임형 여부를 「미상」으로 낸다',
    },
  ];

  return { coverage, plan, facts, sources, delegation, downgrade };
}
