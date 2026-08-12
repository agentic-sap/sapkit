/**
 * 실데이터 도구 시험의 공용 fixture.
 *
 * 실 SAP도 자식 프로세스도 쓰지 않는다. 접속 계층은 주입된 가짜이고, 표에 실리는
 * 값은 전부 **지어낸 것**이다 — 실 테이블 이름을 쓰더라도 값은 가짜다
 * (`.dryforge/handoff.md` 하드 게이트 4).
 */

import type { AdtClient, AdtRequestOptions, AdtResponse } from '../../../adt';
import type { ResolvedProfile } from '../../../contracts';
import { NOOP_LOGGER } from '../../../server';
import type { ToolContext } from '../../../server';

/** 가짜 접속 하나가 주고받은 것 전부. */
export interface FakeAdt {
  /** 이 클라이언트가 받은 요청들 — 발송 내용 단언의 대상. */
  readonly requests: AdtRequestOptions[];
  /** `getConnection()`이 몇 번 접속을 얻어냈는지. */
  readonly connections: { count: number };
  readonly context: ToolContext;
}

export type Responder = (
  options: AdtRequestOptions,
  attempt: number,
) => AdtResponse | Promise<AdtResponse>;

export function okResponse(body: string, status = 200): AdtResponse {
  return { status, headers: { 'content-type': 'application/xml' }, body };
}

/** 접속을 만들지 않는 가짜 ADT 클라이언트 + 그것을 물린 도구 컨텍스트. */
export function fakeAdt(respond: Responder): FakeAdt {
  const requests: AdtRequestOptions[] = [];
  const connections = { count: 0 };

  const client = {
    async request(options: AdtRequestOptions): Promise<AdtResponse> {
      requests.push(options);
      return respond(options, requests.length);
    },
  } as unknown as AdtClient;

  const profile: ResolvedProfile = {
    connection: {
      baseUrl: 'http://127.0.0.1:1',
      username: 'FIXTURE',
      password: 'fixture-not-a-secret',
      client: '100',
      rejectUnauthorized: true,
      timeouts: { default: 45000, csrf: 15000, long: 60000 },
    },
    tier: 'DEV',
    systemType: 'onprem',
    sapVersion: null,
    envPath: null,
    alias: null,
    diagnostics: [],
  };

  const context: ToolContext = {
    async getConnection(): Promise<AdtClient> {
      connections.count += 1;
      return client;
    },
    profile,
    logger: NOOP_LOGGER,
    env: {},
  };

  return { requests, connections, context };
}

// ── Data Preview XML 조립 (전부 지어낸 값) ──────────────────────────────────

export interface FixtureColumn {
  readonly name: string;
  readonly type?: string;
  readonly length?: number;
  readonly description?: string;
  /** null = self-closing `<data/>` (nil). */
  readonly cells: ReadonlyArray<string | null>;
}

export function dataPreviewXml(options: {
  readonly totalRows?: number | null;
  readonly executionTime?: number | null;
  readonly columns: readonly FixtureColumn[];
}): string {
  const head = ['<?xml version="1.0" encoding="utf-8"?>'];
  head.push('<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/datapreview">');
  if (options.totalRows !== null && options.totalRows !== undefined) {
    head.push(`<dataPreview:totalRows>${options.totalRows}</dataPreview:totalRows>`);
  }
  if (options.executionTime !== null && options.executionTime !== undefined) {
    head.push(
      `<dataPreview:queryExecutionTime>${options.executionTime}</dataPreview:queryExecutionTime>`,
    );
  }
  for (const column of options.columns) {
    const attributes = [
      `dataPreview:name="${column.name}"`,
      `dataPreview:type="${column.type ?? 'C'}"`,
      `dataPreview:description="${column.description ?? `${column.name} description`}"`,
    ];
    if (column.length !== undefined) attributes.push(`dataPreview:length="${column.length}"`);
    head.push('<dataPreview:columns>');
    head.push(`<dataPreview:metadata ${attributes.join(' ')}/>`);
    head.push('<dataPreview:dataSet>');
    for (const cell of column.cells) {
      head.push(
        cell === null
          ? '<dataPreview:data/>'
          : `<dataPreview:data>${cell}</dataPreview:data>`,
      );
    }
    head.push('</dataPreview:dataSet>');
    head.push('</dataPreview:columns>');
  }
  head.push('</dataPreview:tableData>');
  return head.join('');
}

/** 지어낸 전표 번호 N개 — 마스킹 검사에 걸릴 실데이터가 아니다. */
export function fakeDocumentNumbers(count: number, from = 1): string[] {
  return Array.from({ length: count }, (_, index) =>
    String(9000000000 + from + index),
  );
}

/** `SELECT a, b, ... FROM zdemo_docs WHERE ...` — 넓은 SELECT 목록을 만든다. */
export function wideSelect(columnCount: number, where: string): string {
  const fields = Array.from({ length: columnCount }, (_, index) => `zfield${index + 1}`);
  return `SELECT belnr, ${fields.join(', ')} FROM zdemo_docs WHERE ${where}`;
}
