/**
 * ABAP 프로파일러 트레이스 와이어 — 주소·메서드·헤더·본문의 복원.
 *
 * ## 어디서 읽었나
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleRuntime*.ts`)는 전부
 * `AdtRuntimeClient`/`AdtExecutor`에 위임하고 요청을 직접 조립하지 않는다. 실제
 * 와이어는 안쪽 패키지에 있다:
 *
 *  - `@babamba2/mcp-abap-adt-clients/dist/runtime/traces/profiler.js:131-417`
 *    — 경로·질의 인자·`Accept`·`Content-Type`·XML 본문 전부.
 *  - 같은 패키지 `dist/constants/contentTypes.js:115-118` — 넷의 실측값.
 *  - `dist/executors/program/ProgramExecutor.js:28-55` ·
 *    `dist/executors/class/ClassExecutor.js:30-124` — 프로파일 실행 두 갈래.
 *  - `dist/clients/AdtRuntimeClient.js:86-208` — 겉 핸들러가 부른 이름과 위
 *    함수들의 대응.
 *
 * ## 헤더
 *
 * 접속 계층은 호출자가 `Accept`를 주면 그 값이 기본값을 이긴다
 * (`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:159-166`).
 * 이 계열은 매 요청에 `Accept`를 명시하므로 아래 상수가 그대로 나간다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';

/** `dist/constants/contentTypes.js:115-118`의 실측값. */
export const ACCEPT_TRACE_XML = 'application/xml';
export const ACCEPT_TRACE_FEED = 'application/atom+xml;type=feed';
export const ACCEPT_TRACE_CALLTREE =
  'application/vnd.sap.adt.runtime.traces.abaptraces.aggcalltree+xml, application/xml';
export const CT_TRACE_PARAMETERS = 'application/xml';

/** 프로파일러 트레이스의 뿌리 경로. */
export const TRACES_PATH = '/sap/bc/adt/runtime/traces/abaptraces';
export const TRACE_PARAMETERS_PATH = `${TRACES_PATH}/parameters`;
export const TRACE_REQUESTS_PATH = `${TRACES_PATH}/requests`;

/** 프로파일 실행이 붙이는 헤더 — 구 실행기가 `Accept`와 함께 늘 싣는다. */
export const PROFILING_HEADER = { 'X-sap-adt-profiling': 'server-time' } as const;
export const ACCEPT_RUN = 'text/plain';

// ── 트레이스 ID ──────────────────────────────────────────────────────────────

/**
 * 전체 URI에서 트레이스 ID만 꺼낸다. `profiler.js:54-84`의 판단 그대로 —
 * 뿌리 경로가 보이면 그 뒤의 첫 조각을 쓰고(`/`·`?`·`#` 중 가장 먼저 오는 것에서
 * 자른다), 안 보이면 받은 값을 트림해 그대로 쓴다.
 */
export function normalizeProfilerTraceId(traceIdOrUri: unknown): string {
  if (!traceIdOrUri) throw new Error('Trace ID is required');
  const trimmed = String(traceIdOrUri).trim();
  if (trimmed === '') throw new Error('Trace ID is required');

  const marker = `${TRACES_PATH}/`;
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) {
    const rest = trimmed.slice(markerIndex + marker.length);
    let end = rest.length;
    for (const index of [rest.indexOf('/'), rest.indexOf('?'), rest.indexOf('#')]) {
      if (index >= 0 && index < end) end = index;
    }
    const id = rest.slice(0, end).trim();
    if (id) return id;
  }
  return trimmed;
}

/**
 * 생성 응답의 `Location`(또는 `Content-Location`)에서 프로파일러 URI를 꺼낸다
 * (`profiler.js:145-165`). 절대 URL이면 경로+질의만 남긴다.
 *
 * 신 엔진의 응답 헤더는 **소문자 키**로 정규화돼 있다(`src/adt/http.ts`) —
 * 구는 대소문자 두 벌을 다 뒤졌지만 여기서는 한 벌이면 충분하다.
 */
export function extractProfilerId(headers: Readonly<Record<string, string>>): string | undefined {
  const raw = headers['location'] ?? headers['content-location'];
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = raw.trim();
  if (value.startsWith('/')) return value;
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

/** `profiler.js:166`의 정규식 그대로. 16자 이상의 영숫자 조각만 트레이스 ID다. */
const TRACE_ID_RE = /\/sap\/bc\/adt\/runtime\/traces\/abaptraces\/([A-Za-z0-9]{16,})(?=\/|[?&#"'\s]|$)/g;

/**
 * 트레이스 요청 응답에서 트레이스 ID를 찾는다 — **헤더 먼저, 그다음 본문**
 * (`profiler.js:167-192`).
 */
export function extractTraceId(response: AdtResponse): string | undefined {
  for (const candidate of [response.headers['location'], response.headers['content-location']]) {
    if (typeof candidate !== 'string') continue;
    const match = [...candidate.matchAll(TRACE_ID_RE)][0];
    if (match?.[1]) return match[1];
  }
  const match = [...response.body.matchAll(TRACE_ID_RE)][0];
  return match?.[1];
}

// ── 트레이스 파라미터 ────────────────────────────────────────────────────────

/** `profiler.js:31-45`의 기본값. 아래 머리주석의 함정을 함께 읽을 것. */
export const DEFAULT_PROFILER_TRACE_PARAMETERS = {
  allMiscAbapStatements: false,
  allProceduralUnits: true,
  allInternalTableEvents: false,
  allDynproEvents: false,
  aggregate: false,
  explicitOnOff: false,
  withRfcTracing: true,
  allSystemKernelEvents: false,
  sqlTrace: true,
  allDbEvents: true,
  maxSizeForTraceFile: 30720,
  amdpTrace: true,
  maxTimeForTracing: 1800,
} as const;

export interface ProfilerTraceParameters {
  readonly description?: string | undefined;
  readonly allMiscAbapStatements?: boolean | undefined;
  readonly allProceduralUnits?: boolean | undefined;
  readonly allInternalTableEvents?: boolean | undefined;
  readonly allDynproEvents?: boolean | undefined;
  readonly aggregate?: boolean | undefined;
  readonly explicitOnOff?: boolean | undefined;
  readonly withRfcTracing?: boolean | undefined;
  readonly allSystemKernelEvents?: boolean | undefined;
  readonly sqlTrace?: boolean | undefined;
  readonly allDbEvents?: boolean | undefined;
  readonly maxSizeForTraceFile?: number | undefined;
  readonly amdpTrace?: boolean | undefined;
  readonly maxTimeForTracing?: number | undefined;
}

/**
 * 도구 인자(스네이크 케이스)를 안쪽 패키지의 옵션 이름으로 옮긴다.
 *
 * 구 핸들러 셋이 **글자 그대로 같은 표**를 각자 적어 두었다
 * (`handleRuntimeCreateProfilerTraceParameters.ts:64-79` ·
 * `handleRuntimeRunProgramWithProfiling.ts:75-90` ·
 * `handleRuntimeRunClassWithProfiling.ts:75-90`). 여기서는 한 벌만 둔다.
 *
 * **키를 빠뜨리지 않는 것이 핵심이다.** 인자가 없어도 키는 `undefined`로 실려야
 * {@link buildTraceParametersXml}의 병합이 구와 같아진다 — 그 함정의 설명은
 * 그 함수의 주석에 있다.
 */
export interface ProfilerToolArgs {
  readonly description?: string | undefined;
  readonly all_misc_abap_statements?: boolean | undefined;
  readonly all_procedural_units?: boolean | undefined;
  readonly all_internal_table_events?: boolean | undefined;
  readonly all_dynpro_events?: boolean | undefined;
  readonly aggregate?: boolean | undefined;
  readonly explicit_on_off?: boolean | undefined;
  readonly with_rfc_tracing?: boolean | undefined;
  readonly all_system_kernel_events?: boolean | undefined;
  readonly sql_trace?: boolean | undefined;
  readonly all_db_events?: boolean | undefined;
  readonly max_size_for_trace_file?: number | undefined;
  readonly amdp_trace?: boolean | undefined;
  readonly max_time_for_tracing?: number | undefined;
}

export function profilerParametersFrom(args: ProfilerToolArgs): ProfilerTraceParameters {
  return {
    description: args.description,
    allMiscAbapStatements: args.all_misc_abap_statements,
    allProceduralUnits: args.all_procedural_units,
    allInternalTableEvents: args.all_internal_table_events,
    allDynproEvents: args.all_dynpro_events,
    aggregate: args.aggregate,
    explicitOnOff: args.explicit_on_off,
    withRfcTracing: args.with_rfc_tracing,
    allSystemKernelEvents: args.all_system_kernel_events,
    sqlTrace: args.sql_trace,
    allDbEvents: args.all_db_events,
    maxSizeForTraceFile: args.max_size_for_trace_file,
    amdpTrace: args.amdp_trace,
    maxTimeForTracing: args.max_time_for_tracing,
  };
}

function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * 트레이스 파라미터 XML을 짓는다 (`profiler.js:91-130`).
 *
 * **기본값이 거의 먹지 않는다 — 그것이 구의 실동작이다.** 병합은
 * `{ ...DEFAULTS, ...options }`인데, 구 핸들러는 인자를 안 준 자리도
 * `allProceduralUnits: undefined`처럼 **키를 명시해서** 넘긴다
 * (`handleRuntimeCreateProfilerTraceParameters.ts:64-79`). 명시된 `undefined`는
 * 스프레드에서 기본값을 **덮어쓰고**, 그러면 아래 `appendBoolean`이 그 줄을
 * 통째로 건너뛴다. 즉 `description`만 준 호출이 실제로 보내는 본문은
 * `<trc:description .../>` 한 줄뿐이다. 헷갈리기 쉬운 자리라 시험이 이것을
 * 못 박아 둔다.
 *
 * 줄 순서도 구 그대로다 — `description`이 불리언 넷 뒤, `aggregate` 앞에 낀다.
 */
export function buildTraceParametersXml(options: ProfilerTraceParameters = {}): string {
  const merged: Record<string, unknown> = { ...DEFAULT_PROFILER_TRACE_PARAMETERS, ...options };

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<trc:parameters xmlns:trc="http://www.sap.com/adt/runtime/traces/abaptraces">',
  ];
  const appendBoolean = (name: string): void => {
    const value = merged[name];
    if (value === undefined) return;
    lines.push(`  <trc:${name} value="${value ? 'true' : 'false'}"/>`);
  };
  const appendNumber = (name: string): void => {
    const value = merged[name];
    if (value === undefined || Number.isNaN(value)) return;
    lines.push(`  <trc:${name} value="${Math.trunc(Number(value))}"/>`);
  };

  appendBoolean('allMiscAbapStatements');
  appendBoolean('allProceduralUnits');
  appendBoolean('allInternalTableEvents');
  appendBoolean('allDynproEvents');
  if (merged['description'] !== undefined) {
    lines.push(`  <trc:description value="${escapeXmlAttr(String(merged['description']))}"/>`);
  }
  appendBoolean('aggregate');
  appendBoolean('explicitOnOff');
  appendBoolean('withRfcTracing');
  appendBoolean('allSystemKernelEvents');
  appendBoolean('sqlTrace');
  appendBoolean('allDbEvents');
  appendNumber('maxSizeForTraceFile');
  appendBoolean('amdpTrace');
  appendNumber('maxTimeForTracing');
  lines.push('</trc:parameters>');
  return lines.join('\n');
}

/** POST `/sap/bc/adt/runtime/traces/abaptraces/parameters` (`profiler.js:131-144`). */
export function createTraceParameters(
  client: AdtClient,
  options: ProfilerTraceParameters,
): Promise<AdtResponse> {
  return client.request({
    method: 'POST',
    path: TRACE_PARAMETERS_PATH,
    body: buildTraceParametersXml(options),
    accept: ACCEPT_TRACE_XML,
    contentType: CT_TRACE_PARAMETERS,
    timeout: 'default',
  });
}

// ── 트레이스 조회 ────────────────────────────────────────────────────────────

/** `boolean → 'true'|'false'`. undefined는 질의 인자에 실리지 않는다. */
const flag = (value: boolean | undefined): string | undefined =>
  value === undefined ? undefined : value ? 'true' : 'false';

const truncated = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : String(Math.trunc(value));

export interface TraceViewOptions {
  readonly withSystemEvents?: boolean | undefined;
  readonly id?: number | undefined;
  readonly withDetails?: boolean | undefined;
  readonly autoDrillDownThreshold?: number | undefined;
}

/** GET `.../{traceId}/hitlist` (`profiler.js:201-217`). */
export function getTraceHitList(
  client: AdtClient,
  traceIdOrUri: string,
  options: TraceViewOptions,
): Promise<AdtResponse> {
  const traceId = normalizeProfilerTraceId(traceIdOrUri);
  return client.request({
    method: 'GET',
    path: `${TRACES_PATH}/${encodeURIComponent(traceId)}/hitlist`,
    params: { withSystemEvents: flag(options.withSystemEvents) },
    accept: ACCEPT_TRACE_XML,
    timeout: 'default',
  });
}

/**
 * GET `.../{traceId}/statements` (`profiler.js:226-252`).
 * 질의 인자 순서도 구 그대로다: `id` → `withDetails` → `autoDrillDownThreshold`
 * → `withSystemEvents`.
 */
export function getTraceStatements(
  client: AdtClient,
  traceIdOrUri: string,
  options: TraceViewOptions,
): Promise<AdtResponse> {
  const traceId = normalizeProfilerTraceId(traceIdOrUri);
  return client.request({
    method: 'GET',
    path: `${TRACES_PATH}/${encodeURIComponent(traceId)}/statements`,
    params: {
      id: truncated(options.id),
      withDetails: flag(options.withDetails),
      autoDrillDownThreshold: truncated(options.autoDrillDownThreshold),
      withSystemEvents: flag(options.withSystemEvents),
    },
    accept: ACCEPT_TRACE_CALLTREE,
    timeout: 'default',
  });
}

/** GET `.../{traceId}/dbAccesses` (`profiler.js:261-277`). */
export function getTraceDbAccesses(
  client: AdtClient,
  traceIdOrUri: string,
  options: TraceViewOptions,
): Promise<AdtResponse> {
  const traceId = normalizeProfilerTraceId(traceIdOrUri);
  return client.request({
    method: 'GET',
    path: `${TRACES_PATH}/${encodeURIComponent(traceId)}/dbAccesses`,
    params: { withSystemEvents: flag(options.withSystemEvents) },
    accept: ACCEPT_TRACE_XML,
    timeout: 'default',
  });
}

/** GET `/sap/bc/adt/runtime/traces/abaptraces` (`profiler.js:284-294`). */
export function listTraceFiles(client: AdtClient): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: TRACES_PATH,
    accept: ACCEPT_TRACE_XML,
    timeout: 'default',
  });
}

/** GET `.../requests` (`profiler.js:352-362`). */
export function listTraceRequests(client: AdtClient): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: TRACE_REQUESTS_PATH,
    accept: ACCEPT_TRACE_FEED,
    timeout: 'default',
  });
}

/** GET `.../requests?uri=…` (`profiler.js:370-383`). */
export function getTraceRequestsByUri(client: AdtClient, uri: string): Promise<AdtResponse> {
  if (!uri) throw new Error('URI is required');
  return client.request({
    method: 'GET',
    path: TRACE_REQUESTS_PATH,
    params: { uri },
    accept: ACCEPT_TRACE_FEED,
    timeout: 'default',
  });
}
