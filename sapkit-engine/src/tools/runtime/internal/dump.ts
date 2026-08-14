/**
 * 덤프 한 건을 읽는 와이어 — `RuntimeGetDumpById`와 `RuntimeAnalyzeDump`가 함께 쓴다.
 *
 * 두 구 핸들러 모두 `runtimeClient.getRuntimeDumpById(dump_id, { view })` 하나만
 * 부르고(`handleRuntimeGetDumpById.ts:117-119` · `handleRuntimeAnalyzeDump.ts:113-115`),
 * 요청은 `@babamba2/mcp-abap-adt-clients/dist/runtime/dumps/read.js:77-94`가 조립한다:
 *
 * | view | 경로 | Accept |
 * |---|---|---|
 * | `default` | `/sap/bc/adt/runtime/dump/{id}` | `application/vnd.sap.adt.runtime.dump.v1+xml` |
 * | `summary` | `…/{id}/summary` | `text/html` |
 * | `formatted` | `…/{id}/formatted` | `text/plain` |
 *
 * 덤프 ID는 **URL 인코딩하지 않는다** — 구 `normalizeDumpId`는 트림만 하고
 * `/`가 들어 있으면 아예 거부한다(`read.js:16-25`). 그 거부가 경로 조작의
 * 방어선이라 여기서도 그대로 둔다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';

export const DUMP_PATH = '/sap/bc/adt/runtime/dump';

export type DumpView = 'default' | 'summary' | 'formatted';

export const ACCEPT_DUMP_DEFAULT = 'application/vnd.sap.adt.runtime.dump.v1+xml';
export const ACCEPT_DUMP_SUMMARY = 'text/html';
export const ACCEPT_DUMP_FORMATTED = 'text/plain';

/** `read.js:16-25` 그대로 — 빈 값과 `/` 포함을 거부한다. */
export function normalizeDumpId(dumpId: string | undefined): string {
  const normalized = dumpId?.trim();
  if (!normalized) throw new Error('Runtime dump ID is required');
  if (normalized.includes('/')) throw new Error('Runtime dump ID must not contain "/"');
  return normalized;
}

export function getRuntimeDumpById(
  client: AdtClient,
  dumpId: string,
  view: DumpView,
): Promise<AdtResponse> {
  const normalized = normalizeDumpId(dumpId);
  const suffix = view === 'summary' ? '/summary' : view === 'formatted' ? '/formatted' : '';
  const accept =
    view === 'summary'
      ? ACCEPT_DUMP_SUMMARY
      : view === 'formatted'
        ? ACCEPT_DUMP_FORMATTED
        : ACCEPT_DUMP_DEFAULT;

  return client.request({
    method: 'GET',
    path: `${DUMP_PATH}/${normalized}${suffix}`,
    accept,
    timeout: 'default',
  });
}
