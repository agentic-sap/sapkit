/**
 * 진척 대장의 공개 표면. 생성기(`harness/render-ledger.mjs`)·게이트
 * (`gates/ledger.mjs`)·재생 러너는 여기만 import 한다.
 *
 * 세 갈래가 한 관문으로 묶여 있다는 것이 이 모듈의 계약이다:
 *   `collectLedger` — 레포 안의 파일 여덟에서 입력을 모은다
 *   `renderLedger`  — 그 입력에서 대장 글자를 **계산해** 낸다
 *   `checkLedger`   — 계산한 글자와 커밋본을 맞댄다 (손으로 고친 대장을 거부한다)
 *
 * 재생 판정 파일의 형식(`replayVerdictDocument`)도 여기로 낸다 — 그 형식이 SAP에
 * 붙는 스크립트 안에 있으면 영영 시험되지 않기 때문이다.
 */
export { LEDGER_PATH, collectLedger, findEngineRoot, loadSurfaceToolNames } from './collect';
export type { CollectOptions, DelegationSummary, LedgerModel, LedgerSource, ToolFacts } from './collect';

export { scanDelegation } from './delegation';
export type { DelegationKind, DelegationScan } from './delegation';

export { BUILD_PLAN_FORMAT_VERSION, BUILD_PLAN_PATH, bundleOf, loadBuildPlan, parseBuildPlan, requiredGradesFrom } from './plan';
export type { BuildPlan, PlanBundle, PlanEntry } from './plan';

export {
  CONTRACT_RESULTS_PATH,
  REPLAY_VERDICT_DIR,
  REPLAY_VERDICT_FORMAT_VERSION,
  attendedEvidenceFromFixtures,
  contractEvidenceFromJest,
  findContractTestFiles,
  loadReplayVerdicts,
  parseReplayVerdict,
  replayVerdictDocument,
  replaysFromVerdicts,
  substituteEvidenceFromLedger,
  toolsInFixtures,
} from './evidence';
export type { ReplayVerdictDocument, ReplayVerdictStep } from './evidence';

export { checkLedger, renderLedger } from './render';
export type { LedgerCheck } from './render';
