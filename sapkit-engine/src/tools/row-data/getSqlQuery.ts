/**
 * `GetSqlQuery` — ADT Data Preview freestyle로 SELECT를 돌려 표를 돌려준다.
 *
 * M1에서 **실 업무 데이터를 꺼내는 유일한 도구**다. 그래서 이 파일에서 하지 않는
 * 일이 하는 일만큼 중요하다:
 *
 * - **블록리스트·tier·승인 판정을 다시 하지 않는다.** 실데이터 2종은 노출로
 *   막히지 않으므로 서버 코어가 모든 호출에 대해 상시 게이트를 건다
 *   (`src/server/gates.ts` → `src/safety/rowData.ts`). 핸들러가 같은 판정을 또
 *   하면 이중 감사가 되고 문구가 갈린다. 게이트는 인자를 **이름으로** 읽으므로
 *   (`sql_query` · `acknowledge_risk`) 인자 이름은 바꾸지 않는다.
 * - **접속을 미리 얻지 않는다.** `context.getConnection()`은 게이트를 지난 뒤에만
 *   불리고, 거부된 호출은 여기까지 오지 않는다.
 *
 * 하는 일 중 구와 다른 것은 하나뿐이고 그것은 등재된 의도적 차이다 —
 * **13-9 수리**(`harness/DIVERGENCES.md` D1): 돌아온 표가 자기 질의의 WHERE를
 * 지키지 않으면 그 표를 성공으로 내주지 않는다. 근거와 판정 규칙은
 * `./wherePredicate.ts` 머리말에 있다.
 *
 * 그 밖의 계약(이름 · 인자 이름 · 엔드포인트 · 산발 400 1회 재시도 · 응답 형태)은
 * 구 엔진 그대로다.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtResponse } from '../../adt';
import { defineTool } from '../../server';
import { type SqlQueryResponse, parseDataPreviewXml } from './dataPreview';
import { type WhereVerification, verifyWherePredicate } from './wherePredicate';

const FREESTYLE_PATH = '/sap/bc/adt/datapreview/freestyle';
const FREESTYLE_CONTENT_TYPE = 'text/plain; charset=utf-8';
const FREESTYLE_ACCEPT = 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml';

/** 구 번들이 실제로 발행하던 문구 그대로 — `harness/old-surface/m1-tools.json`. */
const DESCRIPTION =
  '[read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT ' +
  'Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries. Empty ' +
  'cells (including self-closing XML cells) are preserved as null in row order. Complex ' +
  'statements (e.g. 4-way joins, long IN lists) can fail with HTTP 400 — shorten table aliases ' +
  'or replace a long IN list with a BETWEEN range; a sporadic 400 (e.g. under concurrent calls) ' +
  'is retried once automatically. The response also reports returned_row_count (rows actually ' +
  'parsed), truncated (true when the row_number cap was hit or the server total exceeds it), ' +
  'and server_total_rows (server-reported total when the XML provides it).';

const ACKNOWLEDGE_RISK_DESCRIPTION =
  "Set to true ONLY after the user has explicitly authorized row extraction from an 'ask'-tier " +
  'protected table. The approval is logged to stderr for audit. Has no effect on ' +
  "'deny'-tier tables.";

/**
 * Data Preview freestyle 엔드포인트는 복잡하거나 동시에 몰린 질의에 산발적으로
 * 400을 낸다 — 즉시 다시 보내면 성공한다. 되미는 것은 **400뿐이고 한 번뿐**이다.
 */
function isSporadic400(error: unknown): boolean {
  return error instanceof AdtError && error.status === 400;
}

/**
 * 술어를 무시한 표를 **거부하는** 보고.
 *
 * 행 값은 싣지 않는다. 필터를 무시한 결과는 부분적으로 맞는 답이 아니라 통째로
 * 틀린 답이고, 진단한다며 그 값을 다시 내보내면 거부가 무의미해진다. 대신 응답
 * 안에 있던 징후 셋을 그대로 보여 준다(HANDOFF §6 13-9의 감별법).
 */
function predicateIgnoredReport(
  parsed: SqlQueryResponse,
  verdict: Extract<WhereVerification, { kind: 'violated' }>,
): string {
  return [
    'ERR_SQLQUERY_PREDICATE_IGNORED: the rows the server returned do not satisfy this query’s ' +
      'own WHERE clause, so the result does not answer the question that was asked. The rows ' +
      'are withheld.',
    `  violated term : ${verdict.term}`,
    `  first bad row : #${verdict.rowIndex + 1} (column ${verdict.column})`,
    `  tells in this response: returned_row_count=${parsed.returned_row_count} · ` +
      `truncated=${parsed.truncated} · execution_time=${parsed.execution_time} · ` +
      `server_total_rows=${parsed.server_total_rows ?? 'n/a'}`,
    'This is engine backlog 13-9: past a wide SELECT list (measured boundary between 18 and 28 ' +
      'columns) the ADT Data Preview freestyle endpoint can drop the WHERE clause entirely and ' +
      'still answer with a normal-looking table. Re-run with a narrower SELECT list (~15 columns ' +
      'or fewer, key fields first) and fetch the remaining fields in a second, key-joined query.',
  ].join('\n');
}

export const getSqlQuery = defineTool(
  {
    name: 'GetSqlQuery',
    description: DESCRIPTION,
    inputSchema: {
      sql_query: z.string().describe('SQL query to execute'),
      row_number: z.number().describe('[read-only] Maximum number of rows to return').default(100),
      acknowledge_risk: z.boolean().describe(ACKNOWLEDGE_RISK_DESCRIPTION).optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'row-data',
  },
  async (context, args) => {
    const { logger } = context;
    try {
      const sqlQuery = args.sql_query;
      if (!sqlQuery) throw new McpError(ErrorCode.InvalidParams, 'SQL query is required');
      const rowNumber = args.row_number || 100;

      const client = await context.getConnection();
      const send = (): Promise<AdtResponse> =>
        client.request({
          method: 'POST',
          path: FREESTYLE_PATH,
          params: { rowNumber },
          body: sqlQuery,
          contentType: FREESTYLE_CONTENT_TYPE,
          accept: FREESTYLE_ACCEPT,
          timeout: 'long',
        });

      let response: AdtResponse;
      try {
        response = await send();
      } catch (error) {
        if (!isSporadic400(error)) throw error;
        logger.warn('GetSqlQuery: HTTP 400 on first attempt — retrying once');
        response = await send();
      }

      if (response.status !== 200 || !response.body) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to execute SQL query. Status: ${response.status}`,
        );
      }

      const parsed = parseDataPreviewXml(response.body, sqlQuery, rowNumber, logger);

      const predicate = verifyWherePredicate(sqlQuery, parsed.rows);
      if (predicate.kind === 'violated') {
        logger.warn(
          `GetSqlQuery: withholding a table that ignores its own predicate (${predicate.term})`,
        );
        return {
          isError: true,
          content: [{ type: 'text', text: predicateIgnoredReport(parsed, predicate) }],
        };
      }

      return {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
      };
    } catch (error) {
      logger.error(`GetSqlQuery failed: ${String(error)}`);
      // 구 계약: 오류도 MCP 규약대로 text 콘텐츠 한 장으로 돌려준다.
      return { isError: true, content: [{ type: 'text', text: `ADT error: ${String(error)}` }] };
    }
  },
);
