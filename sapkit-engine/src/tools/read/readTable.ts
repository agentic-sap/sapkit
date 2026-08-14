/**
 * `ReadTable` — 테이블 하나의 **정의(DDL)와 메타데이터**를 읽는다.
 *
 * 행 데이터를 꺼내지 않는다. 행은 `GetTableContents`의 몫이고 그쪽은 상시
 * 게이트를 지난다 — 이 도구는 스키마만 보므로 `kind: 'read'`다. 같은 테이블을
 * RFC 통로로 읽는 `GetTable`과는 **다른 도구**이며(그쪽은 `sets: ['high']`),
 * 이쪽은 ADT 통로의 readonly 표면에 있다.
 *
 * 흐름과 와이어 근거는 `./internal/tableStructureRead.ts` 머리말에 있다 —
 * 구 핸들러 `engine/src/handlers/table/readonly/handleReadTable.ts`와
 * 벤더 `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js`까지 읽어
 * 복원했다. 요점 하나만 여기 옮겨 둔다: **소스 조회와 메타데이터 조회는 서로
 * 독립**이고, 한쪽이 실패해도 그 자리를 `null`로 둔 채 성공으로 답한다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { TABLE_READ, readDdicSourceAndMetadata } from './internal/tableStructureRead';

export const readTable = defineTool(
  {
    name: 'ReadTable',
    description:
      '[read-only] Read ABAP table definition and metadata (package, responsible, description, etc.).',
    inputSchema: {
      table_name: z.string().describe('Table name (e.g., Z_MY_TABLE).'),
      version: z
        .enum(['active', 'inactive'])
        .describe('Version to read: "active" (default) or "inactive".')
        .default('active'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['table_name'],
  },
  (context, args) =>
    readDdicSourceAndMetadata(TABLE_READ, context, {
      name: args.table_name,
      version: args.version,
    }),
);
