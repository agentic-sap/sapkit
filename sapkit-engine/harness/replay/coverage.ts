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
 * 증거 급은 spec §2.5:
 *
 * | 표면 | 증거 |
 * |---|---|
 * | 실사용 표면 | 녹화-재생 대조 (`replay`) |
 * | 미사용 표면 | 도구별 계약 시험 (`contract`) + 대표 건 attended 실기 (`attended`) |
 * | 전 표면 공통 | tool-catalog 대조 diff 0 · 게이트 · 마일스톤별 attended 확인 |
 *
 * 마지막 줄(전 표면 공통)은 도구 단위가 아니라 **표면 전체**에 걸리는 증거라
 * 이 표의 행이 아니다. 그 판정은 자체 게이트가 소유한다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { M1_DIVERGENCES } from './divergences';
import type { DivergenceClassification, DivergenceEntry, DivergenceStatus } from './divergences';
import type { SequenceReplayResult, SequenceVerdict } from './types';

export type EvidenceGrade = 'replay' | 'contract' | 'attended';
export type EvidenceStatus = 'pass' | 'fail' | 'none';

export interface EvidenceCell {
  readonly status: EvidenceStatus;
  /** 이 급에서 이 도구를 건드린 건수. */
  readonly count: number;
  readonly detail: string | null;
}

export interface CoverageRow {
  readonly tool: string;
  readonly replay: EvidenceCell;
  readonly contract: EvidenceCell;
  readonly attended: EvidenceCell;
  /** 어느 급에서든 pass가 하나라도 있는가. */
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
  readonly sequences: readonly { readonly sequenceId: string; readonly verdict: SequenceVerdict; readonly steps: number }[];
  readonly proseNormalized: {
    readonly divergenceId: string;
    readonly total: number;
    /** 그중 엄격히 대조된 신호가 하나도 없던 건. 사실상 무증거다. */
    readonly withoutStrictSignal: number;
    readonly byTool: readonly { readonly tool: string; readonly count: number }[];
  };
  readonly divergences: readonly DivergenceCoverageRow[];
  readonly totals: { readonly tools: number; readonly withEvidence: number; readonly withoutEvidence: number };
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
      const status: EvidenceStatus =
        step.verdict === 'match' || step.verdict === 'allowlisted-pass' ? 'pass' : 'fail';
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

  const tools: CoverageRow[] = [...input.tools].sort().map((tool) => {
    const replay = replayCells.get(tool) ?? EMPTY_CELL;
    const contract = contractCells.get(tool) ?? EMPTY_CELL;
    const attended = attendedCells.get(tool) ?? EMPTY_CELL;
    return {
      tool,
      replay,
      contract,
      attended,
      hasEvidence: [replay, contract, attended].some((cell) => cell.status === 'pass'),
    };
  });

  const toolsWithoutEvidence = tools.filter((row) => !row.hasEvidence).map((row) => row.tool);

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
    },
  };
}

// ── 사람이 읽는 형태 ─────────────────────────────────────────────────────────

const CELL_MARK: Readonly<Record<EvidenceStatus, string>> = { pass: '통과', fail: '실패', none: '—' };

function cellText(cell: EvidenceCell): string {
  return cell.count === 0 ? CELL_MARK.none : `${CELL_MARK[cell.status]}(${cell.count})`;
}

export function renderCoverageMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push('# 커버리지 표 — 도구 × 증거 급');
  lines.push('');
  lines.push(
    `도구 ${report.totals.tools} · 증거 있는 도구 ${report.totals.withEvidence} · ` +
      `**증거 없는 도구 ${report.totals.withoutEvidence}**`,
  );
  lines.push('');
  lines.push('| 도구 | 재생 대조 | 계약 시험 | attended 실기 | 증거 |');
  lines.push('|---|---|---|---|---|');
  for (const row of report.tools) {
    lines.push(
      `| ${row.tool} | ${cellText(row.replay)} | ${cellText(row.contract)} | ${cellText(row.attended)} | ` +
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
