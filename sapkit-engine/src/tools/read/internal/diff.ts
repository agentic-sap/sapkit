/**
 * 줄 단위 통합 diff — 의존성 없는 LCS 계산.
 *
 * ABAP 소스 두 벌은 대개 대부분이 같으므로, 공통 앞머리·꼬리를 먼저 잘라 내고
 * **달라지는 가운데 토막에만** O(N*M) 표를 잡는다. 그래도 표가 커질 수 있어
 * 셀 수에 상한({@link MAX_DIFF_CELLS})을 두고, 넘으면 diff 대신 "너무 크다"를
 * 정직하게 돌려준다 — 조용히 잘린 diff를 주지 않는다.
 */

export type DiffOpType = 'equal' | 'add' | 'remove';

export interface DiffOp {
  type: DiffOpType;
  line: string;
  oldPos: number;
  newPos: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  ops: DiffOp[];
}

export interface UnifiedDiffResult {
  identical: boolean;
  diff: string;
  stats: { added: number; removed: number; hunks: number };
}

export interface UnifiedDiffTooLargeResult {
  identical: false;
  too_large: true;
  reason: string;
  stats: { old_lines: number; new_lines: number };
}

export type UnifiedDiffOutcome = UnifiedDiffResult | UnifiedDiffTooLargeResult;

/** 다듬은 뒤의 LCS 표 셀 수 상한 — 대략 2000x2000. */
export const MAX_DIFF_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split(/\r\n|\r|\n/);
}

function commonPrefixLength(a: readonly string[], b: readonly string[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffixLength(
  a: readonly string[],
  b: readonly string[],
  prefixLength: number,
): number {
  const max = Math.min(a.length, b.length) - prefixLength;
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

export function diffLines(oldLines: readonly string[], newLines: readonly string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const width = m + 1;

  // dp[i*width + j] = LCS(oldLines[i:], newLines[j:])의 길이.
  // 2차원 배열 대신 평평한 표를 쓰는 것은 행마다 새 배열을 잡지 않기 위해서다.
  const dp = new Int32Array((n + 1) * width);
  const at = (i: number, j: number): number => dp[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        oldLines[i] === newLines[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const ops: DiffOp[] = [];
  let oldPos = 1;
  let newPos = 1;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const oldLine = oldLines[i] ?? '';
    const newLine = newLines[j] ?? '';
    if (oldLine === newLine) {
      ops.push({ type: 'equal', line: oldLine, oldPos, newPos });
      i += 1;
      j += 1;
      oldPos += 1;
      newPos += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      ops.push({ type: 'remove', line: oldLine, oldPos, newPos });
      i += 1;
      oldPos += 1;
    } else {
      ops.push({ type: 'add', line: newLine, oldPos, newPos });
      j += 1;
      newPos += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'remove', line: oldLines[i] ?? '', oldPos, newPos });
    i += 1;
    oldPos += 1;
  }
  while (j < m) {
    ops.push({ type: 'add', line: newLines[j] ?? '', oldPos, newPos });
    j += 1;
    newPos += 1;
  }
  return ops;
}

/** 변경 자리를 문맥만큼 부풀린 뒤 이어지는 구간을 한 hunk로 묶는다. */
export function buildHunks(ops: readonly DiffOp[], contextLines: number): DiffHunk[] {
  const n = ops.length;
  const included = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n; k += 1) {
    if (ops[k]?.type === 'equal') continue;
    const lo = Math.max(0, k - contextLines);
    const hi = Math.min(n - 1, k + contextLines);
    for (let x = lo; x <= hi; x += 1) included[x] = true;
  }

  const hunks: DiffHunk[] = [];
  let k = 0;
  while (k < n) {
    if (!included[k]) {
      k += 1;
      continue;
    }
    const start = k;
    while (k < n && included[k]) k += 1;
    const hunkOps = ops.slice(start, k);
    const first = hunkOps[0];
    if (!first) continue;
    hunks.push({
      oldStart: first.oldPos,
      oldLines: hunkOps.filter((op) => op.type !== 'add').length,
      newStart: first.newPos,
      newLines: hunkOps.filter((op) => op.type !== 'remove').length,
      ops: hunkOps,
    });
  }
  return hunks;
}

function formatRange(start: number, count: number): string {
  if (count === 0) return `${Math.max(0, start - 1)},0`;
  if (count === 1) return `${start}`;
  return `${start},${count}`;
}

function formatHunk(hunk: DiffHunk): string {
  const header =
    `@@ -${formatRange(hunk.oldStart, hunk.oldLines)}` +
    ` +${formatRange(hunk.newStart, hunk.newLines)} @@`;
  const body = hunk.ops.map((op) => {
    const prefix = op.type === 'equal' ? ' ' : op.type === 'remove' ? '-' : '+';
    return `${prefix}${op.line}`;
  });
  return [header, ...body].join('\n');
}

export function computeUnifiedDiff(
  oldText: string,
  newText: string,
  options: { contextLines?: number; oldLabel?: string; newLabel?: string } = {},
): UnifiedDiffOutcome {
  const contextLines = Math.max(0, options.contextLines ?? 3);
  const oldLabel = options.oldLabel ?? 'a';
  const newLabel = options.newLabel ?? 'b';

  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  const prefixLength = commonPrefixLength(oldLines, newLines);
  const suffixLength = commonSuffixLength(oldLines, newLines, prefixLength);
  const midOld = oldLines.slice(prefixLength, oldLines.length - suffixLength);
  const midNew = newLines.slice(prefixLength, newLines.length - suffixLength);

  if (midOld.length * midNew.length > MAX_DIFF_CELLS) {
    return {
      identical: false,
      too_large: true,
      reason:
        `Diff too large to compute: ${oldLines.length} old line(s) vs ${newLines.length} new line(s) ` +
        `(${midOld.length}x${midNew.length} remain after trimming ${prefixLength} common leading and ` +
        `${suffixLength} common trailing line(s), exceeding the ${MAX_DIFF_CELLS}-cell limit).`,
      stats: { old_lines: oldLines.length, new_lines: newLines.length },
    };
  }

  const ops: DiffOp[] = [];
  for (let k = 0; k < prefixLength; k += 1) {
    ops.push({ type: 'equal', line: oldLines[k] ?? '', oldPos: k + 1, newPos: k + 1 });
  }
  for (const op of diffLines(midOld, midNew)) {
    ops.push({
      type: op.type,
      line: op.line,
      oldPos: op.oldPos + prefixLength,
      newPos: op.newPos + prefixLength,
    });
  }
  for (let k = 0; k < suffixLength; k += 1) {
    const oldIndex = oldLines.length - suffixLength + k;
    const newIndex = newLines.length - suffixLength + k;
    ops.push({
      type: 'equal',
      line: oldLines[oldIndex] ?? '',
      oldPos: oldIndex + 1,
      newPos: newIndex + 1,
    });
  }

  const added = ops.filter((op) => op.type === 'add').length;
  const removed = ops.filter((op) => op.type === 'remove').length;

  if (added === 0 && removed === 0) {
    return { identical: true, diff: '', stats: { added: 0, removed: 0, hunks: 0 } };
  }

  const hunks = buildHunks(ops, contextLines);
  return {
    identical: false,
    diff: [`--- ${oldLabel}`, `+++ ${newLabel}`, ...hunks.map(formatHunk)].join('\n'),
    stats: { added, removed, hunks: hunks.length },
  };
}
