/**
 * 커버리지 표 — **도구 × 증거 급**.
 *
 * 표가 답해야 하는 질문은 둘이다.
 *
 *   ① 무엇이 어느 급 증거로 통과했는가
 *   ② **무엇이 아직 증거가 없는가**
 *
 * ②가 조용히 사라지면 표가 존재할 이유가 없다. 그래서 집계는 통과를 세는 쪽이
 * 아니라 **빠진 것을 드러내는 쪽**으로 기운다: 증거 없는 도구는 따로 모아 세고,
 * 휴면 등재는 통과로 세지 않으며, 이연된 등재는 통과가 아니라 이연으로 센다.
 *
 * 증거 급은 **넷**이다.
 *
 * | 급 | 무엇 |
 * |---|---|
 * | `replay` | 재생 정규화 diff 0 |
 * | `contract` | 도구별 계약 시험 |
 * | `attended` | attended 실기 기록 |
 * | `substitute` | **의도적 차이 등재분의 대체 기대 시험** |
 *
 * 넷째 급이 없으면 그것만 가진 도구가 "증거 없음"으로 떨어진다 — 비교에서
 * 뺀 것이 곧 무증거가 되지 않게 하는 것이 장부 등재 규칙 ②인데, 표가 그
 * 규칙을 배반하는 셈이다.
 *
 * "전 표면 공통"(tool-catalog 대조 diff 0 · 게이트 · 마일스톤별 attended 확인)은
 * 도구 단위가 아니라 **표면 전체**에 걸리는 증거라 이 표의 행이 아니다. 그
 * 판정은 자체 게이트가 소유한다.
 *
 * ## 요구 증거 급과 상태 3칸
 *
 * 도구마다 **주 급이 정확히 하나**다(사다리: `Create*`·`Delete*` → attended ·
 * 실사용 호출 이력 → replay · 그 밖 → contract). 어느 도구가 어느 칸인지를
 * **여기서 정하지 않는다** — 실사용 데이터를 근거로 배정하는 것은 부르는 쪽의
 * 몫이고, 이 계산기는 그것을 입력으로 받아 셈만 한다. 입력이 없으면 사다리
 * 3(계약 시험)이다.
 *
 * **차이 장부 등재분은 급이 아니라 부가 요건이다.** 등재된 도구는 주 급에
 * *더해* 대체 기대 시험을 요구한다 — 급을 대체하지 않는다.
 *
 * 상태는 셋이고 **판정 기준은 등록점 하나다**: 등록점에 없으면 `안 지음`,
 * 있는데 요구 급이 덜 찼으면 `지음 · 증거 대기`, 다 찼으면 `증거 있음`.
 * 시험 통과·선언 일치 같은 완성 조건은 게이트가 따로 강제하며 여기 섞지
 * 않는다 — 섞으면 "시험이 깨진 등록된 도구"가 `안 지음`으로 떨어져 다음 판이
 * 같은 도구를 다시 짓는다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { M1_DIVERGENCES } from './divergences';
import type { DivergenceClassification, DivergenceEntry, DivergenceStatus } from './divergences';
import type { SequenceReplayResult, SequenceVerdict } from './types';

export type EvidenceGrade = 'replay' | 'contract' | 'attended' | 'substitute';
export type EvidenceStatus = 'pass' | 'fail' | 'none';

/**
 * 주 급 — 사다리가 고르는 하나.
 *
 * 대체 기대 시험은 **부가 요건**이라 주 급이 될 수 없다. 등재분을 비교에서
 * 빼면서 그 뺀 사실 자체를 급으로 세우면, 장부가 주 급을 대신하게 된다.
 */
export type PrimaryGrade = Exclude<EvidenceGrade, 'substitute'>;

/** 요구 급 입력이 없을 때의 기본 — 사다리 3(호출 이력도 자산 참조도 없는 꼬리). */
export const DEFAULT_PRIMARY_GRADE: PrimaryGrade = 'contract';

export type ToolStatus =
  /** 등록점(`src/tools/registry.ts`)에 없다. */
  | 'not-built'
  /** 등록점에 있다. 그러나 요구 증거 급이 아직 안 찼다. */
  | 'awaiting-evidence'
  /** 요구 증거 급이 찼다 (부가 요건이 있으면 그것까지). */
  | 'evidenced';

export interface EvidenceCell {
  readonly status: EvidenceStatus;
  /** 이 급에서 이 도구를 건드린 건수. */
  readonly count: number;
  readonly detail: string | null;
}

export interface CoverageRow {
  readonly tool: string;
  /** 판정 기준은 등록점 하나다 — 시험 통과 여부를 섞지 않는다. */
  readonly status: ToolStatus;
  /** 이 도구가 채워야 하는 주 급. 입력이 없으면 `DEFAULT_PRIMARY_GRADE`. */
  readonly requiredGrade: PrimaryGrade;
  /** 차이 장부 등재분인가 — 등재면 주 급에 **더해** 대체 기대 시험을 요구한다. */
  readonly requiresSubstitute: boolean;
  readonly replay: EvidenceCell;
  readonly contract: EvidenceCell;
  readonly attended: EvidenceCell;
  readonly substitute: EvidenceCell;
  /** 아직 통과가 없는 요구 급(주 급 + 부가 요건). 비어 있으면 요구가 다 찼다. */
  readonly missing: readonly EvidenceGrade[];
  /**
   * 어느 급에서든 pass가 하나라도 있는가.
   *
   * **요구 급 충족과는 다른 질문이다** — 요구가 재생인데 계약 시험만 통과한
   * 도구는 증거는 있고 급은 덜 찬 상태다.
   */
  readonly hasEvidence: boolean;
}

export interface DivergenceCoverageRow {
  readonly id: string;
  readonly title: string;
  readonly tool: string | null;
  readonly classification: DivergenceClassification;
  readonly status: DivergenceStatus;
  readonly evidence: string;
  readonly substituteTest: string | null;
  readonly resolvesIn: string | null;
  /** 이 항목이 판정에 불린 단계 수. */
  readonly judged: number;
  readonly passed: number;
  readonly deferred: number;
  readonly failed: number;
}

export interface CoverageReport {
  readonly tools: readonly CoverageRow[];
  /** 어느 급에서도 증거가 없는 도구. **이 목록이 이 표의 존재 이유다.** */
  readonly toolsWithoutEvidence: readonly string[];
  /** 지었으나 요구 급이 덜 찬 도구. 다음 판이 갚아야 할 빚이다. */
  readonly toolsAwaitingEvidence: readonly string[];
  /**
   * 등록점 스냅샷을 받았는가. 거짓이면 `안 지음`을 **판정하지 않은 것**이지
   * 없다는 뜻이 아니다 — 이 계산기는 등록점을 스스로 읽지 않는다.
   */
  readonly registryKnown: boolean;
  readonly sequences: readonly { readonly sequenceId: string; readonly verdict: SequenceVerdict; readonly steps: number }[];
  readonly proseNormalized: {
    readonly divergenceId: string;
    readonly total: number;
    /** 그중 엄격히 대조된 신호가 하나도 없던 건. 사실상 무증거다. */
    readonly withoutStrictSignal: number;
    readonly byTool: readonly { readonly tool: string; readonly count: number }[];
  };
  readonly divergences: readonly DivergenceCoverageRow[];
  readonly totals: {
    readonly tools: number;
    readonly withEvidence: number;
    readonly withoutEvidence: number;
    readonly notBuilt: number;
    readonly awaitingEvidence: number;
    readonly evidenced: number;
  };
}

export interface ToolEvidenceInput {
  readonly tool: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface CoverageInput {
  /** 표의 행이 될 도구 전체. `loadM1ToolNames()`가 M1 19종을 준다. */
  readonly tools: readonly string[];
  readonly replays?: readonly SequenceReplayResult[];
  readonly contractTests?: readonly ToolEvidenceInput[];
  readonly attended?: readonly ToolEvidenceInput[];
  /**
   * 장부 등재분의 **대체 기대 시험** 결과. 재생 밖에서 도는 시험(각 계층의
   * 오류 정규화 시험 등)이 이 통로로 들어온다 — 재생 중에 판정된 등재분은
   * `replays`의 `allowlisted-*` 단계에서 알아서 이 급으로 들어간다.
   */
  readonly substituteTests?: readonly ToolEvidenceInput[];
  /**
   * 등록점에 실제로 올라 있는 도구 이름. 주면 그 밖의 행은 `안 지음`이다.
   * 주지 않으면 등록 여부를 **판정하지 않는다**(행 전체를 등록된 것으로 본다) —
   * 등록점을 보지 않고 "안 지음"이라고 단정하지 않기 위해서다.
   */
  readonly registered?: readonly string[];
  /** 도구 → 주 급. 없는 도구는 `DEFAULT_PRIMARY_GRADE`. */
  readonly requiredGrades?: Readonly<Record<string, PrimaryGrade>>;
  /** 표에 실을 장부. 기본은 `M1_DIVERGENCES`. */
  readonly divergences?: readonly DivergenceEntry[];
}

const EMPTY_CELL: EvidenceCell = { status: 'none', count: 0, detail: null };

/** 같은 급 안에서 여러 건이 모일 때의 합침 — **실패가 통과를 이긴다**. */
function merge(cell: EvidenceCell, status: EvidenceStatus, detail: string | null): EvidenceCell {
  const next = cell.status === 'fail' || status === 'fail' ? 'fail' : cell.status === 'pass' ? 'pass' : status;
  return { status: next, count: cell.count + 1, detail: detail ?? cell.detail };
}

function fromInputs(inputs: readonly ToolEvidenceInput[] | undefined): Map<string, EvidenceCell> {
  const out = new Map<string, EvidenceCell>();
  for (const input of inputs ?? []) {
    out.set(input.tool, merge(out.get(input.tool) ?? EMPTY_CELL, input.passed ? 'pass' : 'fail', input.detail ?? null));
  }
  return out;
}

export function buildCoverage(input: CoverageInput): CoverageReport {
  const ledger = input.divergences ?? M1_DIVERGENCES;
  const replays = input.replays ?? [];

  const replayCells = new Map<string, EvidenceCell>();
  const substituteCells = new Map<string, EvidenceCell>();
  const proseByTool = new Map<string, number>();
  const divergenceTally = new Map<string, { judged: number; passed: number; deferred: number; failed: number }>();
  let proseTotal = 0;
  let proseWeak = 0;

  for (const result of replays) {
    for (const step of result.steps) {
      if (step.divergenceId !== null) {
        const tally = divergenceTally.get(step.divergenceId) ?? { judged: 0, passed: 0, deferred: 0, failed: 0 };
        tally.judged += 1;
        if (step.verdict === 'allowlisted-pass') tally.passed += 1;
        else if (step.verdict === 'allowlisted-deferred') tally.deferred += 1;
        else tally.failed += 1;
        divergenceTally.set(step.divergenceId, tally);
      }
      // 이연·미실행은 증거가 아니다 — pass로도 fail로도 세지 않는다.
      if (step.verdict === 'allowlisted-deferred' || step.verdict === 'not-run') continue;
      // 등재로 판정된 단계는 **diff 0이 아니다.** 재생 급에 넣으면 장부 등재가
      // 주 급을 대신하게 되므로 넷째 급으로 보낸다.
      if (step.verdict === 'allowlisted-pass' || step.verdict === 'allowlisted-fail') {
        const status: EvidenceStatus = step.verdict === 'allowlisted-pass' ? 'pass' : 'fail';
        substituteCells.set(step.tool, merge(substituteCells.get(step.tool) ?? EMPTY_CELL, status, step.detail));
        continue;
      }
      const status: EvidenceStatus = step.verdict === 'match' ? 'pass' : 'fail';
      replayCells.set(step.tool, merge(replayCells.get(step.tool) ?? EMPTY_CELL, status, step.detail));
    }
    for (const record of result.proseNormalized) {
      proseTotal += 1;
      if (!record.strictSignal) proseWeak += 1;
      proseByTool.set(record.tool, (proseByTool.get(record.tool) ?? 0) + 1);
      const tally = divergenceTally.get(record.divergenceId) ?? { judged: 0, passed: 0, deferred: 0, failed: 0 };
      tally.judged += 1;
      tally.passed += 1;
      divergenceTally.set(record.divergenceId, tally);
    }
  }

  const contractCells = fromInputs(input.contractTests);
  const attendedCells = fromInputs(input.attended);
  for (const evidence of input.substituteTests ?? []) {
    substituteCells.set(
      evidence.tool,
      merge(
        substituteCells.get(evidence.tool) ?? EMPTY_CELL,
        evidence.passed ? 'pass' : 'fail',
        evidence.detail ?? null,
      ),
    );
  }

  // 장부에 도구 이름으로 등재된 것만 부가 요건이 된다. 계층 차이(도구 null)는
  // 도구 단위 요건이 아니다. 휴면 등재도 포함한다 — 등록점에 있는데 휴면으로
  // 등재돼 있다면 장부가 낡았다는 신호이고, 요건을 빼면 그 신호가 사라진다.
  const ledgerTools = new Set(ledger.map((entry) => entry.tool).filter((name): name is string => name !== null));
  const registered = input.registered === undefined ? null : new Set(input.registered);
  const requiredGrades = input.requiredGrades ?? {};

  const tools: CoverageRow[] = [...input.tools].sort().map((tool) => {
    const cells: Readonly<Record<EvidenceGrade, EvidenceCell>> = {
      replay: replayCells.get(tool) ?? EMPTY_CELL,
      contract: contractCells.get(tool) ?? EMPTY_CELL,
      attended: attendedCells.get(tool) ?? EMPTY_CELL,
      substitute: substituteCells.get(tool) ?? EMPTY_CELL,
    };
    const requiredGrade = requiredGrades[tool] ?? DEFAULT_PRIMARY_GRADE;
    const requiresSubstitute = ledgerTools.has(tool);

    const required: EvidenceGrade[] = requiresSubstitute ? [requiredGrade, 'substitute'] : [requiredGrade];
    const missing = required.filter((grade) => cells[grade].status !== 'pass');
    const built = registered === null || registered.has(tool);

    return {
      tool,
      status: !built ? 'not-built' : missing.length === 0 ? 'evidenced' : 'awaiting-evidence',
      requiredGrade,
      requiresSubstitute,
      ...cells,
      missing,
      hasEvidence: Object.values(cells).some((cell) => cell.status === 'pass'),
    };
  });

  const toolsWithoutEvidence = tools.filter((row) => !row.hasEvidence).map((row) => row.tool);
  const toolsAwaitingEvidence = tools.filter((row) => row.status === 'awaiting-evidence').map((row) => row.tool);

  const divergences: DivergenceCoverageRow[] = ledger.map((entry) => {
    const tally = divergenceTally.get(entry.id) ?? { judged: 0, passed: 0, deferred: 0, failed: 0 };
    return {
      id: entry.id,
      title: entry.title,
      tool: entry.tool,
      classification: entry.classification,
      status: entry.status,
      evidence: entry.evidence,
      substituteTest: entry.substituteTest,
      resolvesIn: entry.resolvesIn,
      ...tally,
    };
  });

  return {
    tools,
    toolsWithoutEvidence,
    toolsAwaitingEvidence,
    registryKnown: registered !== null,
    sequences: replays.map((result) => ({
      sequenceId: result.sequenceId,
      verdict: result.verdict,
      steps: result.steps.length,
    })),
    proseNormalized: {
      divergenceId: 'D13',
      total: proseTotal,
      withoutStrictSignal: proseWeak,
      byTool: [...proseByTool.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tool, count]) => ({ tool, count })),
    },
    divergences,
    totals: {
      tools: tools.length,
      withEvidence: tools.length - toolsWithoutEvidence.length,
      withoutEvidence: toolsWithoutEvidence.length,
      notBuilt: tools.filter((row) => row.status === 'not-built').length,
      awaitingEvidence: toolsAwaitingEvidence.length,
      evidenced: tools.filter((row) => row.status === 'evidenced').length,
    },
  };
}

// ── 사람이 읽는 형태 ─────────────────────────────────────────────────────────

const CELL_MARK: Readonly<Record<EvidenceStatus, string>> = { pass: '통과', fail: '실패', none: '—' };

const GRADE_LABEL: Readonly<Record<EvidenceGrade, string>> = {
  replay: '재생 대조',
  contract: '계약 시험',
  attended: 'attended 실기',
  substitute: '대체 기대 시험',
};

const STATUS_LABEL: Readonly<Record<ToolStatus, string>> = {
  'not-built': '안 지음',
  'awaiting-evidence': '지음 · 증거 대기',
  evidenced: '증거 있음',
};

function cellText(cell: EvidenceCell): string {
  return cell.count === 0 ? CELL_MARK.none : `${CELL_MARK[cell.status]}(${cell.count})`;
}

function requiredText(row: CoverageRow): string {
  return row.requiresSubstitute ? `${GRADE_LABEL[row.requiredGrade]} + 대체` : GRADE_LABEL[row.requiredGrade];
}

export function renderCoverageMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push('# 커버리지 표 — 도구 × 증거 급');
  lines.push('');
  lines.push(
    `도구 ${report.totals.tools} · 증거 있는 도구 ${report.totals.withEvidence} · ` +
      `**증거 없는 도구 ${report.totals.withoutEvidence}**`,
  );
  lines.push(
    `상태 — 안 지음 ${report.totals.notBuilt} · **지음 · 증거 대기 ${report.totals.awaitingEvidence}** · ` +
      `증거 있음 ${report.totals.evidenced}`,
  );
  if (!report.registryKnown) {
    lines.push('');
    lines.push('> 등록점 스냅샷을 받지 않았다 — `안 지음`은 **판정하지 않았다**. 없다는 뜻이 아니다.');
  }
  lines.push('');
  lines.push('| 도구 | 상태 | 요구 급 | 재생 대조 | 계약 시험 | attended 실기 | 대체 기대 시험 | 증거 |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const row of report.tools) {
    lines.push(
      `| ${row.tool} | ${STATUS_LABEL[row.status]} | ${requiredText(row)} | ${cellText(row.replay)} | ` +
        `${cellText(row.contract)} | ${cellText(row.attended)} | ${cellText(row.substitute)} | ` +
        `${row.hasEvidence ? '있음' : '**증거 없음**'} |`,
    );
  }
  lines.push('');

  lines.push('## 증거 없는 도구');
  lines.push('');
  if (report.toolsWithoutEvidence.length === 0) {
    lines.push('없다 — 모든 도구가 적어도 한 급의 증거를 갖는다.');
  } else {
    lines.push('아래 도구는 **어느 급에서도 통과 증거가 없다**. 재생 픽스처나 계약 시험이 아직 없다는 뜻이다.');
    lines.push('');
    for (const tool of report.toolsWithoutEvidence) lines.push(`- ${tool}`);
  }
  lines.push('');

  lines.push('## 지었으나 요구 급이 덜 찬 도구');
  lines.push('');
  if (report.toolsAwaitingEvidence.length === 0) {
    lines.push('없다 — 등록점에 있는 도구는 모두 요구 급을 채웠다.');
  } else {
    lines.push('아래 도구는 **등록점에 있으나 요구 증거 급이 아직 안 찼다**. 다른 급의 증거가 있어도 대신하지 못한다.');
    lines.push('');
    for (const row of report.tools) {
      if (row.status !== 'awaiting-evidence') continue;
      lines.push(`- ${row.tool} — 요구 ${requiredText(row)} · 모자란 급 ${row.missing.map((g) => GRADE_LABEL[g]).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## 오류 산문 정규화 (D13)');
  lines.push('');
  lines.push(
    `${report.proseNormalized.divergenceId} 규칙으로 **산문 정규화 ${report.proseNormalized.total}건**을 ` +
      `느슨하게 판정했다 (그중 엄격 신호 없음 ${report.proseNormalized.withoutStrictSignal}건).`,
  );
  if (report.proseNormalized.byTool.length > 0) {
    lines.push('');
    for (const { tool, count } of report.proseNormalized.byTool) lines.push(`- ${tool} — ${count}건`);
  }
  lines.push('');

  lines.push('## 의도적 차이 장부');
  lines.push('');
  lines.push('| # | 상태 | 분류 | 도구 | 판정 | 통과 | 이연 | 실패 | 대체 기대 시험 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const row of report.divergences) {
    const status = row.status === 'dormant' ? `**휴면**(${row.resolvesIn ?? '미지정'})` : '활성';
    lines.push(
      `| ${row.id} | ${status} | ${row.classification} | ${row.tool ?? '—'} | ${row.judged} | ${row.passed} | ` +
        `${row.deferred} | ${row.failed} | ${row.substituteTest ?? '없음(축소)'} |`,
    );
  }
  lines.push('');
  lines.push('휴면 항목은 **통과로 세지 않는다** — 등재만 돼 있고 대체 기대 시험은 활성화 마일스톤이 소유한다.');
  lines.push('이연(`deferred`) 역시 통과가 아니라 **증거 없음**이다.');
  lines.push('');

  if (report.sequences.length > 0) {
    lines.push('## 재생한 시퀀스');
    lines.push('');
    lines.push('| 시퀀스 | 단계 | 판정 |');
    lines.push('|---|---|---|');
    for (const seq of report.sequences) lines.push(`| ${seq.sequenceId} | ${seq.steps} | ${seq.verdict} |`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── M1 도구 목록 ─────────────────────────────────────────────────────────────

/**
 * 구 표면 채록(`harness/old-surface/m1-tools.json`)에서 M1 도구 이름을 읽는다.
 *
 * 이름을 여기 베끼지 않는 이유는 하나 — 그 파일이 **구 엔진의 실측 기록**이고,
 * 두 벌이 되는 순간 어느 쪽이 정본인지 알 수 없어진다.
 *
 * `dist/`에서 돌 때도 닿도록 위로 훑는다. JSON은 tsc가 옮기지 않는다.
 */
export function loadM1ToolNames(catalogPath?: string): string[] {
  const resolved = catalogPath ?? findCatalog();
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as { m1?: Record<string, unknown> };
  if (parsed.m1 === undefined || typeof parsed.m1 !== 'object') {
    throw new Error(`구 표면 채록에 m1 항목이 없다: ${resolved}`);
  }
  return Object.keys(parsed.m1).sort();
}

function findCatalog(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, 'harness', 'old-surface', 'm1-tools.json');
    if (fs.existsSync(candidate)) return candidate;
    const sibling = path.join(dir, '..', 'old-surface', 'm1-tools.json');
    if (fs.existsSync(sibling)) return path.resolve(sibling);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('구 표면 채록(harness/old-surface/m1-tools.json)을 찾지 못했다.');
}
