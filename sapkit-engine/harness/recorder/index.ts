/**
 * 채록기 공개 표면. 재생 러너와 녹화 스크립트는 여기만 import 한다.
 *
 * 형식·정규화·마스킹·저장이 한 관문으로 묶여 있다는 것이 이 모듈의 계약이다:
 * `recordSequence`가 정규화까지 끝낸 픽스처를 돌려주고, `saveSequenceFixture`가
 * 마스킹 검사를 통과한 것만 파일로 내보낸다.
 */
export {
  FIXTURE_FORMAT_VERSION,
  PLACEHOLDER_PREFIX,
  SEQUENCE_ID_RE,
  findPlaceholders,
  isPlaceholder,
  parsePlaceholder,
} from './types';
export type {
  EngineIdentity,
  JsonValue,
  NormalizationKind,
  PlaceholderBinding,
  SequenceFixture,
  SequenceStep,
} from './types';

export { Normalizer, keyKind, normalizeFixture } from './normalize';

export { MaskingRejection, assertMasked, scanForSecrets } from './masking';
export type { MaskingOptions, MaskingRuleId, MaskingViolation } from './masking';

export { FixtureFormatError, parseFixture, recordSequence, saveSequenceFixture, serializeFixture } from './record';
export type {
  CapturedResponse,
  FixtureWriter,
  RecorderTransport,
  RecordingStepSpec,
  SaveOptions,
  SequenceSpec,
  TransportHandshake,
} from './record';

export { ChildProcessTransport, JsonRpcError } from './childProcessTransport';
export type { ChildProcessTransportOptions } from './childProcessTransport';

export { ScriptedTransport } from './scriptedTransport';
export type { ScriptedResponse, ScriptedTransportOptions } from './scriptedTransport';
