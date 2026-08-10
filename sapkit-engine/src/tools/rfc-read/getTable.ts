/**
 * `GetTable` — ABAP 테이블 정의 읽기.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetTable` · 구 소스 `engine/src/handlers/table/high/handleGetTable.ts:17-39`).
 * 이름·인자 이름·설명 문구·응답 형태는 바꾸지 않는다.
 *
 * 몸통(두 경로)은 `./ddicRead`에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server';
import { type DdicObjectKind, readDdicObject } from './ddicRead';

const TABLE: DdicObjectKind = {
  toolName: 'GetTable',
  nameField: 'table_name',
  dataField: 'table_data',
  adtSegment: 'tables',
  noun: 'table',
  label: 'Table',
};

export const getTable = defineTool(
  {
    name: 'GetTable',
    description:
      'Retrieve ABAP table definition. Supports reading active or inactive version.',
    inputSchema: {
      table_name: z.string().describe('Table name (e.g., Z_MY_TABLE).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'read',
  },
  async (context, args) =>
    readDdicObject(TABLE, context, { name: args.table_name, version: args.version }),
);
