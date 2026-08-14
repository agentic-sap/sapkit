/**
 * 커버리지 입력을 모으는 자리 — **증거를 표에 닿게 하는 배선**.
 *
 * `buildCoverage`는 네 급을 진작 받게 돼 있었는데 부르는 쪽이 재생 결과만
 * 넘겨서, 실기 기록이 있어도 표의 "증거 없음"에 영원히 남았다. 그 배선을
 * 스크립트 안에 두지 않고 여기로 뽑은 이유는 하나 —
 * **`harness/replay-attended.mjs`는 SAP에 붙으므로 시험이 돌릴 수 없다.**
 * 배선이 스크립트 안에 있으면 그 배선은 영영 시험되지 않는다.
 */
import type { ToolEvidenceInput } from './coverage';
import type { SequenceReplayResult } from './types';

/**
 * 재생 실행에서 attended 실기 증거를 뽑는다.
 *
 * **재생 실행 자체가 신 엔진의 attended 실기다** — 재생은 응답을 흉내 내는
 * 것이 아니라 같은 질문을 사람 입회 아래 SAP에 다시 던지는 일이기 때문이다
 * (`harness/replay-attended.mjs` 머리말). 그래서 돌아간 단계 하나하나가
 * "이 도구를 실기로 태웠다"는 기록이 된다.
 *
 * - 돌지 못한 단계(`not-run`)는 증거가 아니다 — 앞에서 전송이 끊겼다.
 * - 결함으로 판정된 단계(`mismatch`·`allowlisted-fail`)는 **실기 실패**다.
 *   태우긴 했는데 신 엔진이 틀리게 답했다.
 * - 이연(`allowlisted-deferred`)은 재생 급에서는 무증거지만 실기로는 돌았다 —
 *   등재로 *비교*를 뺀 것이지 *실행*을 뺀 것이 아니다.
 */
export function attendedEvidenceFromReplays(results: readonly SequenceReplayResult[]): ToolEvidenceInput[] {
  const out: ToolEvidenceInput[] = [];
  for (const result of results) {
    for (const step of result.steps) {
      if (step.verdict === 'not-run') continue;
      out.push({
        tool: step.tool,
        passed: step.verdict !== 'mismatch' && step.verdict !== 'allowlisted-fail',
        detail: `${result.sequenceId} #${step.index}`,
      });
    }
  }
  return out;
}

/**
 * 계약 시험 증거를 읽는다 — `[{ "tool": "GetClass", "passed": true }, …]`.
 *
 * 시험을 여기서 돌리지 않는다. 어느 도구의 계약 시험이 통과했는지는 시험
 * 러너가 아는 사실이고, 이 계산기는 그 사실을 **받아** 셈만 한다. 형식이
 * 어긋나면 조용히 빈 배열로 넘기지 않고 던진다 — 증거가 사라진 것을 통과로
 * 읽는 것이 이 표가 막으려는 바로 그 일이다.
 */
export function parseContractEvidence(text: string, source: string): ToolEvidenceInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`계약 시험 증거를 JSON으로 읽지 못했다 (${source}): ${err instanceof Error ? err.message : err}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`계약 시험 증거는 배열이어야 한다 (${source}) — [{ "tool": …, "passed": … }, …]`);
  }

  return parsed.map((entry, index) => {
    const at = `${source}[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`계약 시험 증거 항목이 객체가 아니다: ${at}`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record['tool'] !== 'string' || record['tool'].trim() === '') {
      throw new Error(`계약 시험 증거에 tool 이름이 없다: ${at}`);
    }
    if (typeof record['passed'] !== 'boolean') {
      throw new Error(`계약 시험 증거에 passed(불리언)가 없다: ${at} — 통과 여부를 짐작하지 않는다.`);
    }
    const detail = record['detail'];
    if (detail !== undefined && typeof detail !== 'string') {
      throw new Error(`계약 시험 증거의 detail이 문자열이 아니다: ${at}`);
    }
    return {
      tool: record['tool'],
      passed: record['passed'],
      ...(detail === undefined ? {} : { detail }),
    };
  });
}
