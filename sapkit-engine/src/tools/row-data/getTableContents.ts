/**
 * `GetTableContents` — ADT **DDIC** Data Preview로 표 한 장을 SE16처럼 꺼낸다.
 *
 * `GetSqlQuery`와 함께 **실 업무 데이터를 꺼내는 2종** 중 하나다
 * (`src/safety/rowData.ts`의 `ROW_DATA_TOOLS`). 그래서 이 파일에서 **하지 않는
 * 일**이 하는 일만큼 중요하다:
 *
 * - **블록리스트·tier·승인 판정을 다시 하지 않는다.** 구 핸들러는 이 판정을
 *   자기 안에서 했지만(`handleGetTableContents.ts:45-68`), 신 엔진은 그것을
 *   서버 코어의 상시 게이트로 올렸다(`src/server/gates.ts` →
 *   `src/safety/rowData.ts`). 노출로는 막히지 않는 도구이므로 게이트는 프로파일과
 *   무관하게 **모든 호출**에 선다. 핸들러가 같은 판정을 또 하면 이중 감사가 되고
 *   문구가 갈린다.
 * - **접속을 미리 얻지 않는다.** `context.getConnection()`은 게이트를 지난 뒤에만
 *   불리고, 거부된 호출은 여기까지 오지 않는다 — "거부 시 접속 시도 0회"의 근거가
 *   이 한 줄이다.
 * - **인자 이름을 바꾸지 않는다.** 게이트는 인자를 **이름으로** 읽는다
 *   (`src/server/gates.ts`의 `ROW_DATA_ARGS` — `table_name` · `acknowledge_risk`).
 *   개명하면 게이트가 판정할 것을 못 찾고 fail-closed로 떨어진다.
 *
 * ## 와이어 근거 (구 구현까지 읽어 복원)
 *
 * 겉 핸들러 `engine/src/handlers/table/readonly/handleGetTableContents.ts:72-75`가
 * `client.getUtils().getTableContents(...)`로 내려가고, 그 실체는
 * `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/shared/tableContents.js`다.
 * 거기서 확인한 것이 이 모듈이 조립하는 전부다:
 *
 *  - `tableContents.js:57` — 테이블 이름을 **대문자로** 올려 쓴다.
 *  - `tableContents.js:21-44` (`getColumnNames`) — 먼저
 *    `GET /sap/bc/adt/datapreview/ddic/{이름}/metadata`를 물어 응답에서
 *    `dataPreview:name="…"`를 전부 긁어 **열 목록**을 만든다. 열이 하나도 없으면
 *    미리보기를 보내지 않고 실패한다(`:60-62`).
 *  - `tableContents.js:64-65` — 질의는 Eclipse ADT와 같은 `TABLE~FIELD` 문법으로
 *    짓는다: `SELECT T~F1, T~F2 FROM T`.
 *  - `tableContents.js:66-76` — 본 요청은
 *    `POST /sap/bc/adt/datapreview/ddic?rowNumber=…&ddicEntityName=…`이고, 본문이
 *    그 질의, `Content-Type: text/plain`(**`charset` 없음** — freestyle 쪽과
 *    다르다), Accept는 `ACCEPT_DATA_PREVIEW`
 *    (`dist/constants/contentTypes.js:58`), 타임아웃은 `long`이다.
 *
 * 두 왕복의 Accept는 같은 값이고, 그 값은 `GetSqlQuery`가 freestyle에 쓰는 것과도
 * 같다 — 그래서 `./dataPreview.ts`의 파서를 그대로 쓴다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 axios가 파싱해 둔 `response.data`를 넘겼고 여기서는 문자열 `body`를
 * 넘긴다. 파싱 진입점만 다르고 결과는 같다.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { parseDataPreviewXml } from './dataPreview';

/** DDIC Data Preview의 뿌리. freestyle(`/datapreview/freestyle`)과 다른 경로다. */
const DDIC_PREVIEW_PATH = '/sap/bc/adt/datapreview/ddic';

/** `dist/constants/contentTypes.js:58` — `ACCEPT_DATA_PREVIEW`. */
const DATA_PREVIEW_ACCEPT = 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml';

/**
 * `tableContents.js:73` — **`charset`이 붙지 않는다.** freestyle 쪽
 * (`text/plain; charset=utf-8`)과 값이 다르므로 접어 쓰지 않는다.
 */
const DDIC_PREVIEW_CONTENT_TYPE = 'text/plain';

/** 구 번들이 실제로 발행하던 문구 그대로 — `harness/old-surface/m1-tools.json`. */
const DESCRIPTION =
  '[read-only] Retrieve contents (data preview) of an ABAP database table or CDS view. ' +
  'Returns rows of data like SE16/SE16N.';

const ACKNOWLEDGE_RISK_DESCRIPTION =
  "Set to true ONLY after the user has explicitly authorized row extraction from an 'ask'-tier " +
  'protected table. The approval is logged to stderr for audit. Has no effect on ' +
  "'deny'-tier tables.";

/** `getColumnNames`가 응답에서 열 이름을 긁는 그 정규식(`tableContents.js:34-41`). */
const COLUMN_NAME = /dataPreview:name="([^"]+)"/g;

function readColumnNames(xml: string): string[] {
  const names: string[] = [];
  for (const match of xml.matchAll(COLUMN_NAME)) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

export const getTableContents = defineTool(
  {
    name: 'GetTableContents',
    description: DESCRIPTION,
    inputSchema: {
      table_name: z.string().describe('Name of the ABAP table'),
      max_rows: z.number().describe('Maximum number of rows to retrieve').optional(),
      acknowledge_risk: z.boolean().describe(ACKNOWLEDGE_RISK_DESCRIPTION).optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'row-data',
    targetNames: ['table_name'],
  },
  async (context, args) => {
    const { logger } = context;
    try {
      if (!args.table_name) {
        // 구 `handleGetTableContents.ts:38-40`. 이 거부는 접속보다 먼저다.
        throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
      }

      const rawName = args.table_name;
      const maxRows = args.max_rows || 100;
      const tableName = rawName.toUpperCase();

      logger.info(`Reading table contents: ${rawName} (max_rows=${maxRows})`);

      const client = await context.getConnection();

      // ① 열 목록 — Eclipse ADT가 하는 것과 같은 선행 조회.
      const metadata = await client.request({
        method: 'GET',
        path: `${DDIC_PREVIEW_PATH}/${encodeURIComponent(tableName)}/metadata`,
        accept: DATA_PREVIEW_ACCEPT,
        timeout: 'default',
      });
      const fields = readColumnNames(metadata.body);
      if (fields.length === 0) {
        // 열을 모르면 질의를 지을 수 없다. 여기서 멈추고 미리보기를 보내지 않는다.
        throw new Error('Could not retrieve column names from table metadata');
      }

      // ② 미리보기 — `TABLE~FIELD` 문법.
      const sqlQuery = `SELECT ${fields.map((field) => `${tableName}~${field}`).join(', ')} FROM ${tableName}`;
      const response = await client.request({
        method: 'POST',
        path: DDIC_PREVIEW_PATH,
        params: { rowNumber: maxRows, ddicEntityName: tableName },
        body: sqlQuery,
        contentType: DDIC_PREVIEW_CONTENT_TYPE,
        accept: DATA_PREVIEW_ACCEPT,
        timeout: 'long',
      });

      if (response.status !== 200 || !response.body) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read table contents. Status: ${response.status}`,
        );
      }

      // 구는 응답에 **인자 그대로의** 자리표시 질의를 싣는다(`:80-85` —
      // 대문자로 올린 이름이 아니라 `args.table_name`이다). 응답 형태는
      // `GetSqlQuery`와 같은 표이므로 파서도 같은 것을 쓴다.
      const parsed = parseDataPreviewXml(response.body, `SELECT * FROM ${rawName}`, maxRows, logger);

      return {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
      };
    } catch (error) {
      logger.error(`Failed to read table contents: ${String(error)}`);
      // 구 계약: 오류도 MCP 규약대로 text 콘텐츠 한 장으로 돌려준다
      // (`handleGetTableContents.ts:106-117`).
      return { isError: true, content: [{ type: 'text', text: `ADT error: ${String(error)}` }] };
    }
  },
);
