/**
 * 재생 러너 공개 표면. 자체 게이트와 attended 재생 스크립트는 여기만 import 한다.
 *
 * 세 갈래가 한 관문으로 묶여 있다는 것이 이 모듈의 계약이다:
 *   `replaySequence` — 픽스처를 신 엔진에 먹여 판정한다
 *   `M1_DIVERGENCES` — 등재된 차이만 diff 대신 대체 기대 시험으로 판정한다
 *   `buildCoverage` / `renderCoverageMarkdown` — 무엇이 아직 증거가 없는지 드러낸다
 *
 * 표에 무엇을 먹일지 모으는 배선(`evidenceInputs.ts`)도 여기로 낸다 — 그 배선이
 * SAP에 붙는 스크립트 안에 있으면 영영 시험되지 않기 때문이다.
 */
export type {
  Difference,
  DifferenceReason,
  ProseNormalizedRecord,
  ReplayTarget,
  SequenceReplayResult,
  SequenceVerdict,
  StepResult,
  StepVerdictKind,
  SubstituteCheck,
  SubstituteInput,
  SubstituteVerdict,
} from './types';

export { replaySequence } from './replay';
export type { ReplayOptions } from './replay';

export { DEFAULT_MAX_VALUE_CHARS, diffJson, formatDifference, renderActual, renderExpected } from './diff';
export type { DiffOptions, RenderOptions } from './diff';

export { compareErrorSignatures, errorSignature, summarizeSignature } from './errorSignature';
export type { ErrorSignature, ErrorSignatureComparison, ErrorSignatureRules } from './errorSignature';

export {
  LedgerError,
  M1_DIVERGENCES,
  assertLedgerWellFormed,
  collectText,
  divergencesFor,
  withSubstituteChecks,
} from './divergences';
export type { DivergenceClassification, DivergenceEntry, DivergenceStatus } from './divergences';

export { DEFAULT_PRIMARY_GRADE, buildCoverage, loadCapturedToolNames, renderCoverageMarkdown } from './coverage';
export type {
  CoverageInput,
  CoverageReport,
  CoverageRow,
  DivergenceCoverageRow,
  EvidenceCell,
  EvidenceGrade,
  EvidenceStatus,
  PrimaryGrade,
  ToolEvidenceInput,
  ToolStatus,
} from './coverage';

export { attendedEvidenceFromReplays, parseContractEvidence } from './evidenceInputs';

// 전량 재생의 수집 단위와 거부 판정. `.mjs` 안에 두면 jest가 못 잡는 자리다.
export { TRANSPORT_TOOLS, batchRefusal, collectFixtureFiles } from './batch';

export { InProcessTarget } from './inProcessTarget';
export type { InProcessTargetOptions } from './inProcessTarget';

// `rebind.ts`는 내보내지 않는다 — 자리표시자 되묶기는 러너 내부 기제이고,
// 밖에서 부를 일이 생기면 그때 표면에 올린다.
