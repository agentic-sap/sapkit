/**
 * 재생 대조의 판정 어휘.
 *
 * 이 파일은 **판정 결과의 형식**만 정한다. 픽스처 형식은 채록기
 * (`harness/recorder/types.ts`)가 정본이고 여기서 다시 정의하지 않는다.
 */
import type { EngineIdentity, JsonValue, RecorderTransport, SequenceStep } from '../recorder';

/**
 * 재생 대상 — 픽스처를 먹일 상대.
 *
 * 채록기의 전송 계약(`열기 · 도구 호출 · 닫기`)과 **같은 모양**이다. 일부러
 * 그렇게 뒀다: 채록에 쓴 가짜 전송(`ScriptedTransport`)을 재생 시험에서 그대로
 * 쓸 수 있고, 신 엔진을 세우는 `InProcessTarget`도 같은 구멍에 꽂힌다.
 */
export type ReplayTarget = RecorderTransport;

/** 차이 하나의 사유. */
export type DifferenceReason =
  /** 같은 자리의 값이 다르다. */
  | 'value'
  /** 같은 자리의 타입이 다르다. */
  | 'type'
  /** 픽스처에는 있는데 신 엔진 응답에 없다. */
  | 'missing'
  /** 픽스처에는 없는데 신 엔진 응답에 있다. */
  | 'extra'
  /** 한쪽만 오류다. */
  | 'error-flag'
  /** 오류 종류(코드·HTTP 상태)가 다르다. */
  | 'error-kind'
  /** SAP 유래 텍스트가 다르다. */
  | 'error-sap-text'
  /** 양쪽 다 엄격 신호가 없어 산문 정규화로 통과시킬 수 없다. */
  | 'error-prose';

/**
 * 차이 하나 — **어디가 왜 다른지**.
 *
 * `expected`는 픽스처 쪽이라 마스킹 검사를 이미 통과한 값이고, `actual`은
 * 신 엔진이 방금 낸 값이라 **그렇지 않다**. 그래서 `actual`은 채록기의 비밀
 * 검사기를 한 번 지나고, 걸리면 가려진 문구로 대체된다.
 */
export interface Difference {
  /** 대조 투영 안의 JSON 포인터. */
  readonly path: string;
  readonly reason: DifferenceReason;
  readonly expected: string;
  readonly actual: string;
}

export type StepVerdictKind =
  /** 정규화 후 동일. */
  | 'match'
  /** 등재되지 않은 차이 — 결함이다. */
  | 'mismatch'
  /** 등재 항목의 대체 기대 시험이 통과했다. */
  | 'allowlisted-pass'
  /** 등재 항목의 대체 기대 시험이 실패했다. */
  | 'allowlisted-fail'
  /** 등재됐지만 대체 기대 시험을 다른 곳이 소유한다 — **통과가 아니라 무증거**. */
  | 'allowlisted-deferred'
  /** 앞 단계에서 전송이 끊겨 도달하지 못했다. */
  | 'not-run';

/** 오류 산문을 느슨하게 판정한 건 하나 (장부 D13). */
export interface ProseNormalizedRecord {
  readonly stepIndex: number;
  readonly tool: string;
  /** 이 느슨함의 근거가 되는 등재 항목. 언제나 D13이다. */
  readonly divergenceId: string;
  /**
   * 엄격히 대조된 신호(오류 코드·HTTP 상태·SAP 유래 텍스트)가 하나라도
   * 있었는가. 이 값이 거짓인 건은 사실상 무증거이므로 커버리지 표가 따로 센다.
   */
  readonly strictSignal: boolean;
}

export interface StepResult {
  readonly index: number;
  readonly tool: string;
  readonly verdict: StepVerdictKind;
  readonly differences: readonly Difference[];
  /** 판정에 쓰인(또는 휴면이라 쓰이지 못한) 등재 항목의 id. */
  readonly divergenceId: string | null;
  readonly proseNormalized: ProseNormalizedRecord | null;
  /** 사람이 읽을 한 줄. */
  readonly detail: string | null;
}

export type SequenceVerdict =
  /** 모든 단계가 동일하거나 대체 기대 시험을 통과했다. */
  | 'pass'
  /** 등재되지 않은 차이 또는 대체 기대 시험 실패가 있다. */
  | 'fail'
  /** 실패는 없지만 **증거가 되지 못한** 단계가 있다(이연된 등재 항목). */
  | 'no-evidence';

export interface SequenceReplayResult {
  readonly sequenceId: string;
  readonly description: string;
  readonly verdict: SequenceVerdict;
  /** 픽스처를 딴 엔진. 출처이지 대조 대상이 아니다. */
  readonly recordedEngine: EngineIdentity;
  /** 방금 먹인 엔진. */
  readonly actualEngine: EngineIdentity;
  readonly steps: readonly StepResult[];
  /** 단계에 귀속되지 않는 차이 — 자리표시자 대장 등. 실패로 센다. */
  readonly sequenceDifferences: readonly Difference[];
  /** `/engine` 아래의 차이. 신 엔진은 이름부터 다르므로 **결함이 아니다**. */
  readonly provenanceDifferences: readonly Difference[];
  readonly proseNormalized: readonly ProseNormalizedRecord[];
  /** 되묶지 못한 자리표시자 등, 사람이 알아야 할 메모. */
  readonly notes: readonly string[];
  /** 전송 자체가 끊겼을 때의 사유. 없으면 null. */
  readonly transportError: string | null;
}

/** 대체 기대 시험이 보는 것. */
export interface SubstituteInput {
  readonly recorded: SequenceStep;
  readonly actual: { readonly response: JsonValue; readonly isError: boolean };
}

export interface SubstituteVerdict {
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * 대체 기대 시험 — **다르게 동작하는 쪽이 옳다는 것을 증명하는** 검사.
 *
 * 장부 「등재 규칙」 ②: 비교에서 빼는 것이 곧 무증거가 되지 않게 하는 조건이다.
 */
export type SubstituteCheck = (input: SubstituteInput) => SubstituteVerdict;
