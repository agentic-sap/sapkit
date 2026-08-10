/**
 * 재생 러너 — **"같은가?"를 판정하는 자리**.
 *
 * 픽스처의 시퀀스를 신 엔진에 **같은 순서로** 먹이고, 채록기의 정규화를 지난
 * 뒤 diff 0인지 본다. 판정 쪽에서 정규화 규칙이 갈라지면 대조 자체가 의미를
 * 잃으므로 `normalizeFixture`를 그대로 쓴다.
 *
 * ## 세 경로
 *
 * | 경로 | 언제 | 판정 |
 * |---|---|---|
 * | 통과 | 정규화 후 동일 | `match` |
 * | 불일치 | 다른데 등재가 없다 | `mismatch` — **결함** |
 * | allowlist | 다른데 등재가 있다 | 대체 기대 시험이 판정 |
 *
 * ## 무엇을 비교하지 않는가
 *
 * - `recordedAt` — 채록의 출처이지 엔진이 낸 응답이 아니다. 정본은 채록기의
 *   `REPLAY_METADATA_POINTERS`이고 `comparableFixture()`가 그 투영을 준다.
 * - `/engine` — 신 엔진은 이름부터 다르다(`mcp-abap-adt` → `sapkit-engine`).
 *   여기가 같기를 요구하면 모든 재생이 실패한다. **출처로 보고하되 결함으로
 *   세지 않는다.** (`REPLAY_METADATA_POINTERS`에는 아직 없다 — 그 목록을
 *   넓히는 판단은 채록기 소유다.)
 *
 * `sequenceId`·`description`·`formatVersion`은 픽스처에서 그대로 옮겨 담으므로
 * 애초에 다를 수 없다. 그래도 투영째 견주는 이유는, 나중에 형식이 늘었을 때
 * **새 필드가 조용히 대조 밖에 놓이지 않게** 하기 위해서다.
 */
import { comparableFixture } from '../recorder/types';
import { FIXTURE_FORMAT_VERSION, normalizeFixture } from '../recorder';
import type { EngineIdentity, JsonValue, SequenceFixture, SequenceStep } from '../recorder';
import { diffJson } from './diff';
import { M1_DIVERGENCES, collectText, divergencesFor } from './divergences';
import type { DivergenceEntry } from './divergences';
import { compareErrorSignatures, errorSignature, summarizeSignature } from './errorSignature';
import type { ErrorSignatureRules } from './errorSignature';
import { renderActual, renderExpected } from './diff';
import { learnBindings, substitutePlaceholders } from './rebind';
import type { LiveBindings } from './rebind';
import type {
  Difference,
  ProseNormalizedRecord,
  ReplayTarget,
  SequenceReplayResult,
  SequenceVerdict,
  StepResult,
  StepVerdictKind,
} from './types';

export interface ReplayOptions {
  /** 판정에 쓸 의도적 차이 목록. 기본은 `M1_DIVERGENCES`. */
  readonly divergences?: readonly DivergenceEntry[];
  /** 보고서에 실을 값의 길이 상한. */
  readonly maxValueChars?: number;
  /** 오류 서명 규칙에 덧붙일 것. */
  readonly errorRules?: ErrorSignatureRules;
}

/** 살아 있는 쪽에서 모은 한 단계. */
interface LiveStep {
  readonly step: SequenceStep;
  /** 되묶지 못한 자리표시자. */
  readonly unbound: readonly string[];
}

const EMPTY_ENGINE: EngineIdentity = { name: '(unknown)', version: '(unknown)', protocolVersion: null, exposition: '' };

function asArgs(value: JsonValue, index: number): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`steps[${index}].args가 객체가 아니다 — 채록기 계약은 인자를 객체로 둔다.`);
  }
  return value as Record<string, JsonValue>;
}

/**
 * 픽스처 껍데기 하나 — 단계만 갈아 끼우며 정규화에 태운다.
 *
 * `recordedAt`은 **이번 재생 시각**이지 채록 시각이 아니다. 픽스처 쪽 값을
 * 베껴 넣으면 두 값이 늘 같아져 "대조에서 뺐다"는 사실이 시험으로 증명되지
 * 않는다 — 빼는 것이 진짜인지는 값이 다를 때만 드러난다.
 */
function shell(
  fixture: SequenceFixture,
  engine: EngineIdentity,
  steps: readonly SequenceStep[],
  recordedAt: string,
): SequenceFixture {
  return {
    formatVersion: FIXTURE_FORMAT_VERSION,
    sequenceId: fixture.sequenceId,
    description: fixture.description,
    engine,
    recordedAt,
    steps,
    placeholders: [],
  };
}

/**
 * 시퀀스를 순서대로 먹인다.
 *
 * 한 단계가 끝날 때마다 **지금까지의 살아 있는 시퀀스를 통째로 정규화해**
 * 방금 단계의 대응을 배운다. 정규화는 순서에 따라 번호를 매기므로, 앞 단계의
 * 결과는 뒤 단계가 늘어나도 흔들리지 않는다. 이 방식이라야 정규화 규칙을
 * 판정 쪽에서 다시 구현하지 않는다.
 */
async function feed(
  fixture: SequenceFixture,
  target: ReplayTarget,
  engine: EngineIdentity,
  replayedAt: string,
): Promise<{ steps: LiveStep[]; transportError: string | null }> {
  const bindings: LiveBindings = new Map();
  const live: SequenceStep[] = [];
  const out: LiveStep[] = [];

  for (const recordedStep of fixture.steps) {
    const unbound = new Set<string>();
    const sentArgs = substitutePlaceholders(recordedStep.args, bindings, unbound);
    let captured;
    try {
      captured = await target.callTool(recordedStep.tool, asArgs(sentArgs, recordedStep.index));
    } catch (err) {
      return { steps: out, transportError: err instanceof Error ? err.message : String(err) };
    }

    const liveStep: SequenceStep = {
      index: live.length,
      tool: recordedStep.tool,
      args: sentArgs,
      response: captured.payload,
      isError: captured.isError,
      // 메모는 사람이 쓴 것이지 엔진이 낸 것이 아니다 — 그대로 옮긴다.
      note: recordedStep.note,
    };
    live.push(liveStep);
    out.push({ step: liveStep, unbound: [...unbound] });

    const normalized = normalizeFixture(shell(fixture, engine, live, replayedAt));
    const justNormalized = normalized.steps[live.length - 1];
    if (justNormalized !== undefined) {
      learnBindings(liveStep.args, justNormalized.args, bindings);
      learnBindings(liveStep.response, justNormalized.response, bindings);
    }
  }
  return { steps: out, transportError: null };
}

/** `/steps/<i>/...` 에서 i를 읽는다. 단계에 귀속되지 않으면 null. */
function stepIndexOf(path: string): number | null {
  const matched = /^\/steps\/(\d+)(?:\/|$)/.exec(path);
  if (matched === null) return null;
  const digits = matched[1];
  return digits === undefined ? null : Number(digits);
}

interface ErrorOutcome {
  readonly differences: Difference[];
  readonly proseNormalized: ProseNormalizedRecord | null;
}

/** 장부 D13의 오류 대조. 구조 diff를 대신한다. */
function compareErrorStep(
  recorded: SequenceStep,
  actual: SequenceStep,
  rules: ErrorSignatureRules,
  maxValueChars: number | undefined,
): ErrorOutcome {
  const path = `/steps/${recorded.index}/response`;
  if (recorded.isError !== actual.isError) {
    return {
      differences: [
        {
          path: `/steps/${recorded.index}/isError`,
          reason: 'error-flag',
          expected: renderExpected(recorded.isError, { ...(maxValueChars !== undefined ? { maxValueChars } : {}) }),
          actual: renderActual(actual.isError, {
            tool: actual.tool,
            ...(maxValueChars !== undefined ? { maxValueChars } : {}),
          }),
        },
      ],
      proseNormalized: null,
    };
  }

  const recordedSignature = errorSignature(collectText(recorded.response), rules);
  const actualSignature = errorSignature(collectText(actual.response), rules);
  const outcome = compareErrorSignatures(recordedSignature, actualSignature);

  if (!outcome.ok) {
    return {
      differences: [
        {
          path,
          reason: outcome.reason ?? 'error-kind',
          expected: summarizeSignature(recordedSignature),
          // 서명 요약도 살아 있는 쪽에서 온 값이다 — 비밀 검사를 지난다.
          actual: renderActual(summarizeSignature(actualSignature), {
            tool: actual.tool,
            ...(maxValueChars !== undefined ? { maxValueChars } : {}),
          }),
        },
      ],
      proseNormalized: null,
    };
  }
  return {
    differences: [],
    proseNormalized: outcome.proseNormalized
      ? {
          stepIndex: recorded.index,
          tool: recorded.tool,
          divergenceId: 'D13',
          strictSignal: outcome.strictSignal,
        }
      : null,
  };
}

/** 차이가 난 단계를 장부에 비춰 본다. */
function judgeWithLedger(
  ledger: readonly DivergenceEntry[],
  recorded: SequenceStep,
  actual: SequenceStep,
): { verdict: StepVerdictKind; divergenceId: string | null; detail: string | null } {
  const matches = divergencesFor(ledger, recorded);
  const active = matches.find((entry) => entry.status === 'active');

  if (active !== undefined) {
    if (active.check === null) {
      return {
        verdict: 'allowlisted-deferred',
        divergenceId: active.id,
        detail:
          `${active.id} 등재 — 대체 기대 시험을 여기서 돌리지 않는다: ${active.substituteTest ?? '(미지정)'}. ` +
          '비교에서 뺐으나 증거는 아직 없다.',
      };
    }
    const verdict = active.check({ recorded, actual: { response: actual.response, isError: actual.isError } });
    return {
      verdict: verdict.ok ? 'allowlisted-pass' : 'allowlisted-fail',
      divergenceId: active.id,
      detail: `${active.id} — ${verdict.detail}`,
    };
  }

  const dormant = matches.find((entry) => entry.status === 'dormant');
  if (dormant !== undefined) {
    // 휴면 항목이 걸린 자리에서 실제로 차이가 났다면, 그 도구가 이미 존재한다는
    // 뜻이다. 면제하면 장부가 낡았다는 신호가 사라진다.
    return {
      verdict: 'mismatch',
      divergenceId: dormant.id,
      detail:
        `${dormant.id}이(가) 이 도구에 휴면으로 등재돼 있으나 M1에서 활성이 아니다 — 면제하지 않는다. ` +
        `활성화 자리: ${dormant.resolvesIn ?? '(미지정)'}. 차이가 실재하면 장부를 갱신하라.`,
    };
  }

  return { verdict: 'mismatch', divergenceId: null, detail: null };
}

/**
 * 픽스처 하나를 재생해 판정한다.
 *
 * 대상은 **반드시 닫는다** — 도중에 무엇이 터져도.
 */
export async function replaySequence(
  fixture: SequenceFixture,
  target: ReplayTarget,
  options: ReplayOptions = {},
): Promise<SequenceReplayResult> {
  const ledger = options.divergences ?? M1_DIVERGENCES;
  const rules = options.errorRules ?? {};
  const maxValueChars = options.maxValueChars;
  const recorded = normalizeFixture(fixture);
  const replayedAt = new Date().toISOString();

  let actualEngine: EngineIdentity = EMPTY_ENGINE;
  let fed: { steps: LiveStep[]; transportError: string | null };
  try {
    const handshake = await target.open();
    actualEngine = {
      name: handshake.serverName,
      version: handshake.serverVersion,
      protocolVersion: handshake.protocolVersion,
      exposition: handshake.exposition,
    };
    fed = await feed(recorded, target, actualEngine, replayedAt);
  } catch (err) {
    fed = { steps: [], transportError: err instanceof Error ? err.message : String(err) };
  } finally {
    await target.close();
  }

  const live = normalizeFixture(shell(recorded, actualEngine, fed.steps.map((s) => s.step), replayedAt));
  const differences = diffJson(
    comparableFixture(recorded) as unknown as JsonValue,
    comparableFixture(live) as unknown as JsonValue,
    { ...(maxValueChars !== undefined ? { maxValueChars } : {}) },
  );

  const provenanceDifferences = differences.filter((d) => d.path.startsWith('/engine'));
  const rest = differences.filter((d) => !d.path.startsWith('/engine'));
  const byStep = new Map<number, Difference[]>();
  const sequenceDifferences: Difference[] = [];
  for (const difference of rest) {
    const index = stepIndexOf(difference.path);
    if (index === null) {
      sequenceDifferences.push(difference);
      continue;
    }
    const bucket = byStep.get(index) ?? [];
    bucket.push(difference);
    byStep.set(index, bucket);
  }

  const proseNormalized: ProseNormalizedRecord[] = [];
  const notes: string[] = [];
  const steps: StepResult[] = recorded.steps.map((recordedStep, index) => {
    const liveStep = live.steps[index];
    const rawLive = fed.steps[index];
    if (liveStep === undefined || rawLive === undefined) {
      return {
        index,
        tool: recordedStep.tool,
        verdict: 'not-run' as const,
        differences: [],
        divergenceId: null,
        proseNormalized: null,
        detail: '전송이 끊겨 이 단계는 돌지 않았다.',
      };
    }
    if (rawLive.unbound.length > 0) {
      notes.push(
        `steps/${index} (${recordedStep.tool}) — 되묶지 못한 자리표시자 ${rawLive.unbound.join(', ')}: ` +
          '원본이 픽스처에 없어 자리표시자 그대로 보냈다. 이 자리의 대조는 신뢰하지 마라.',
      );
    }

    // 오류 응답은 D13 규칙이 응답 대조를 대신한다.
    const isErrorStep = recordedStep.isError || liveStep.isError;
    let differencesForStep = byStep.get(index) ?? [];
    if (isErrorStep) {
      differencesForStep = differencesForStep.filter(
        (d) => !d.path.startsWith(`/steps/${index}/response`) && d.path !== `/steps/${index}/isError`,
      );
      const outcome = compareErrorStep(recordedStep, liveStep, rules, maxValueChars);
      differencesForStep = [...outcome.differences, ...differencesForStep];
      if (outcome.proseNormalized !== null) proseNormalized.push(outcome.proseNormalized);
    }

    if (differencesForStep.length === 0) {
      return {
        index,
        tool: recordedStep.tool,
        verdict: 'match' as const,
        differences: [],
        divergenceId: null,
        proseNormalized: proseNormalized.find((p) => p.stepIndex === index) ?? null,
        detail: null,
      };
    }

    const judged = judgeWithLedger(ledger, recordedStep, liveStep);
    return {
      index,
      tool: recordedStep.tool,
      verdict: judged.verdict,
      // 등재로 판정한 단계는 차이를 판정 근거로 쓰지 않는다 — 그래도 사람이 볼
      // 수 있게 남긴다. 결함으로 세는 것은 verdict 쪽이다.
      differences: differencesForStep,
      divergenceId: judged.divergenceId,
      // 오류 서명은 통과했는데 인자 쪽이 달라 여기까지 온 경우가 있다. 그때도
      // 산문 정규화는 실제로 일어났으므로 단계에도 그대로 남긴다 — 시퀀스
      // 집계와 단계 기록이 어긋나면 커버리지 표를 되짚을 수 없다.
      proseNormalized: proseNormalized.find((p) => p.stepIndex === index) ?? null,
      detail: judged.detail,
    };
  });

  return {
    sequenceId: recorded.sequenceId,
    description: recorded.description,
    verdict: verdictOf(steps, sequenceDifferences, fed.transportError),
    recordedEngine: recorded.engine,
    actualEngine,
    steps,
    sequenceDifferences,
    provenanceDifferences,
    proseNormalized,
    notes,
    transportError: fed.transportError,
  };
}

/**
 * 단계에서 **파생된** 자리.
 *
 * `placeholders`는 정규화기가 단계를 훑으며 만든 요약이다. 단계가 모두 같으면
 * 이 목록도 같을 수밖에 없고, 반대로 여기가 다르면 단계 어딘가가 이미 다르다.
 * 그래서 판정에 다시 세우면 같은 결함을 두 번 세는 셈이고, 무엇보다 **등재된
 * 차이를 면제할 길이 막힌다**(등재 항목이 새 토큰을 하나 만들면 시퀀스가
 * 통째로 실패한다). 보고에는 남기되 판정에서는 뺀다.
 */
const DERIVED_PATH = /^\/placeholders(?:\/|$)/;

function verdictOf(
  steps: readonly StepResult[],
  sequenceDifferences: readonly Difference[],
  transportError: string | null,
): SequenceVerdict {
  if (transportError !== null) return 'fail';
  // 파생이 아닌 시퀀스 차이는 형식이 늘었는데 대조가 따라가지 못했다는 뜻이다.
  if (sequenceDifferences.some((d) => !DERIVED_PATH.test(d.path))) return 'fail';
  if (steps.some((s) => s.verdict === 'mismatch' || s.verdict === 'allowlisted-fail' || s.verdict === 'not-run')) {
    return 'fail';
  }
  if (steps.some((s) => s.verdict === 'allowlisted-deferred')) return 'no-evidence';
  return 'pass';
}
