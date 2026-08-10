/**
 * 재생 러너 공개 표면. 자체 게이트와 attended 재생 스크립트는 여기만 import 한다.
 *
 * 세 갈래가 한 관문으로 묶여 있다는 것이 이 모듈의 계약이다:
 *   `replaySequence` — 픽스처를 신 엔진에 먹여 판정한다
 *   `M1_DIVERGENCES` — 등재된 차이만 diff 대신 대체 기대 시험으로 판정한다
 *   `buildCoverage` / `renderCoverageMarkdown` — 무엇이 아직 증거가 없는지 드러낸다
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

export { buildCoverage, loadM1ToolNames, renderCoverageMarkdown } from './coverage';
export type {
  CoverageInput,
  CoverageReport,
  CoverageRow,
  DivergenceCoverageRow,
  EvidenceCell,
  EvidenceGrade,
  EvidenceStatus,
  ToolEvidenceInput,
} from './coverage';

export { InProcessTarget } from './inProcessTarget';
export type { InProcessTargetOptions } from './inProcessTarget';

// `rebind.ts`는 내보내지 않는다 — 자리표시자 되묶기는 러너 내부 기제이고,
// 밖에서 부를 일이 생기면 그때 표면에 올린다.
