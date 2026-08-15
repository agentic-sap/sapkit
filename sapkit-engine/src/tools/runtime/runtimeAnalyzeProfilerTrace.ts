/**
 * RuntimeAnalyzeProfilerTrace — 트레이스 뷰를 읽고 상위 몇 줄로 요약한다.
 *
 * 요청은 `RuntimeGetProfilerTraceData`와 같은 세 갈래이되 **statements 뷰에도
 * `withSystemEvents`만 넘긴다** — 구가 그렇게 좁혔다
 * (`engine/src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts:136-153`).
 * 와이어의 근거는 `internal/traces.ts` 머리주석 참조.
 *
 * ## 요약기(`pickTopEntries`)를 그대로 옮긴 이유
 *
 * 구는 payload를 재귀로 훑어 **숫자 값이 하나라도 있는 객체**를 후보 줄로 삼고
 * (`:74-76`), 정해진 순위 키 목록에서 **처음 발견된 숫자**로 내림차순 정렬한 뒤
 * (`:78-98`), 상위 N개를 **스칼라 필드만 남겨** 접는다(`:100-115`). 순위 키가
 * 하나도 없으면 0점이라 원래 순서가 유지된다(`Array#sort`는 안정 정렬).
 * `total_records`는 잘라 낸 뒤의 수가 아니라 **후보 줄 전체의 수**다.
 *
 * `top`은 `Math.max(1, top)`으로 하한이 1이다 — 0이나 음수를 줘도 한 줄은 나온다.
 * 인자를 안 주면 10이고, 그 기본값은 **발행 스키마가 아니라 핸들러 코드**에 있다
 * (`:156` — `args.top ?? 10`). 채록본에도 `default`가 없으므로 선언에 달지 않는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { parseRuntimePayload } from './internal/payload';
import { okJson, returnError } from './internal/results';
import { getTraceDbAccesses, getTraceHitList, getTraceStatements } from './internal/traces';

/** `:78-88` — 앞에 있는 키가 이긴다. */
const RANKING_KEYS = [
  'grossTime',
  'gross_time',
  'netTime',
  'net_time',
  'duration',
  'runtime',
  'calls',
  'count',
  'hits',
] as const;

function collectObjects(value: unknown, acc: Record<string, unknown>[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, acc);
    return;
  }
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    acc.push(item);
    for (const nested of Object.values(item)) collectObjects(nested, acc);
  }
}

function rankValue(item: Record<string, unknown>): number {
  for (const key of RANKING_KEYS) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

export interface TraceSummary {
  readonly total_records: number;
  readonly top_records: ReadonlyArray<Record<string, unknown>>;
}

export function pickTopEntries(payload: unknown, top: number): TraceSummary {
  const objects: Record<string, unknown>[] = [];
  collectObjects(payload, objects);

  const candidates = objects.filter((item) =>
    Object.values(item).some((value) => typeof value === 'number'),
  );

  const topRecords = [...candidates]
    .sort((a, b) => rankValue(b) - rankValue(a))
    .slice(0, Math.max(1, top))
    .map((item) => {
      const compact: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          compact[key] = value;
        }
      }
      return compact;
    });

  return { total_records: candidates.length, top_records: topRecords };
}

export const runtimeAnalyzeProfilerTrace = defineTool(
  {
    name: 'RuntimeAnalyzeProfilerTrace',
    description:
      '[runtime] Read profiler trace view and return compact analysis summary (totals + top entries).',
    inputSchema: {
      trace_id_or_uri: z.string().describe('Profiler trace ID or full trace URI.'),
      view: z.enum(['hitlist', 'statements', 'db_accesses']).default('hitlist'),
      top: z.number().describe('Number of top rows for summary. Default: 10.').optional(),
      with_system_events: z.boolean().describe('Include system events.').optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.trace_id_or_uri) throw new Error('Parameter "trace_id_or_uri" is required');

      const view = args.view ?? 'hitlist';
      const client = await context.getConnection();
      const options = { withSystemEvents: args.with_system_events };
      const response =
        view === 'hitlist'
          ? await getTraceHitList(client, args.trace_id_or_uri, options)
          : view === 'statements'
            ? await getTraceStatements(client, args.trace_id_or_uri, options)
            : await getTraceDbAccesses(client, args.trace_id_or_uri, options);

      const payload = parseRuntimePayload(response.body);

      return okJson({
        success: true,
        trace_id_or_uri: args.trace_id_or_uri,
        view,
        status: response.status,
        summary: pickTopEntries(payload, args.top ?? 10),
        payload,
      });
    } catch (error) {
      context.logger.error(`Error analyzing profiler trace: ${String(error)}`);
      return returnError(error);
    }
  },
);
