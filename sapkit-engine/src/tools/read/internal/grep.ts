/**
 * 소스 텍스트 정규식 훑기 — 네트워크와 무관한 순수 계산.
 *
 * 상한 둘이 계약의 일부다: 오브젝트 하나당 훑는 줄 수 상한
 * ({@link MAX_LINES_PER_OBJECT})과, 호출 전체에 공유되는 결과 수 상한이다.
 * 앞의 것은 병적인 정규식·거대 소스에 대한 방어이고(그래서 타임아웃이 없다),
 * 뒤의 것만 호출자의 `max_results` 예산을 소모한다 — 둘을 뭉치면 "잘렸다"가
 * 무엇을 뜻하는지 알 수 없게 된다.
 */

import { ToolArgumentError } from './results';

/** 오브젝트 하나에서 훑는 줄 수 상한. */
export const MAX_LINES_PER_OBJECT = 20000;

/** 일치 앞뒤로 붙일 수 있는 문맥 줄 수 상한. */
export const MAX_CONTEXT_LINES = 5;

export interface GrepMatch {
  line: number;
  text: string;
  context_before: string[];
  context_after: string[];
}

export interface ObjectGrepInput {
  object_type: string;
  object_name: string;
  /** 소스 텍스트. 가져오지 못했으면 null. */
  source: string | null;
  /** 가져오지 못한 이유. `source: null`과 짝으로 온다. */
  skip_reason?: string;
}

export interface ObjectGrepResult {
  object_type: string;
  object_name: string;
  matches: GrepMatch[];
  truncated_object?: boolean;
}

export interface GrepAggregateResult {
  total_matches: number;
  truncated: boolean;
  results: ObjectGrepResult[];
  skipped: Array<{ object: string; reason: string }>;
}

/** 빈 문자열·잘못된 정규식은 인자 오류다(구와 같은 문구). */
export function compileGrepRegex(pattern: string, caseInsensitive = false): RegExp {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new ToolArgumentError('pattern must be a non-empty string');
  }
  try {
    return new RegExp(pattern, caseInsensitive ? 'i' : '');
  } catch (error) {
    throw new ToolArgumentError(
      `Invalid regex pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface GrepTextResult {
  matches: GrepMatch[];
  matchLimitReached: boolean;
  lineCapReached: boolean;
}

export function grepText(
  sourceText: string,
  regex: RegExp,
  contextLines: number,
  maxMatches: number,
): GrepTextResult {
  const lines = sourceText.split(/\r\n|\r|\n/);
  const clampedContext = Math.max(0, Math.min(contextLines, MAX_CONTEXT_LINES));
  const scanLimit = Math.min(lines.length, MAX_LINES_PER_OBJECT);

  const matches: GrepMatch[] = [];
  let matchLimitReached = false;

  for (let i = 0; i < scanLimit; i += 1) {
    if (maxMatches <= 0 || matches.length >= maxMatches) {
      matchLimitReached = true;
      break;
    }
    const line = lines[i] ?? '';
    if (!regex.test(line)) continue;
    matches.push({
      line: i + 1,
      text: line,
      context_before:
        clampedContext > 0 ? lines.slice(Math.max(0, i - clampedContext), i) : [],
      context_after:
        clampedContext > 0
          ? lines.slice(i + 1, Math.min(lines.length, i + 1 + clampedContext))
          : [],
    });
  }

  return { matches, matchLimitReached, lineCapReached: scanLimit < lines.length };
}

/**
 * 이미 받아 둔 소스 여러 벌을 한 예산 아래에서 훑는다.
 *
 * 예산이 바닥난 뒤의 오브젝트는 훑지 않고 `skipped`에 이유와 함께 남는다 —
 * 조용히 빠지면 "일치가 없다"와 구별되지 않는다.
 */
export function aggregateGrepResults(
  objects: readonly ObjectGrepInput[],
  regex: RegExp,
  options: { context_lines?: number; max_results?: number } = {},
): GrepAggregateResult {
  const contextLines = Math.max(0, Math.min(options.context_lines ?? 0, MAX_CONTEXT_LINES));
  const maxResults = options.max_results ?? 100;

  const results: ObjectGrepResult[] = [];
  const skipped: Array<{ object: string; reason: string }> = [];
  let total = 0;
  let truncated = false;

  for (const object of objects) {
    const label = `${object.object_type} ${object.object_name}`;
    if (object.skip_reason || object.source == null) {
      skipped.push({ object: label, reason: object.skip_reason ?? 'Source not available' });
      continue;
    }
    if (total >= maxResults) {
      truncated = true;
      skipped.push({ object: label, reason: 'max_results reached; object not scanned' });
      continue;
    }

    const { matches, matchLimitReached, lineCapReached } = grepText(
      object.source,
      regex,
      contextLines,
      maxResults - total,
    );

    if (matches.length > 0) {
      const entry: ObjectGrepResult = {
        object_type: object.object_type,
        object_name: object.object_name,
        matches,
      };
      if (lineCapReached) entry.truncated_object = true;
      results.push(entry);
      total += matches.length;
    } else if (lineCapReached) {
      skipped.push({
        object: label,
        reason: `object exceeds the ${MAX_LINES_PER_OBJECT}-line scan cap; no matches found in the scanned portion`,
      });
    }

    if (matchLimitReached) truncated = true;
  }

  return { total_matches: total, truncated, results, skipped };
}

/** 상한을 둔 동시 실행. 결과는 호출자가 인덱스로 받아 순서를 지킨다. */
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, runNext));
}
