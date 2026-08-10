/**
 * `GetStructure` — ABAP 구조 정의 읽기.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetStructure` · 구 소스
 * `engine/src/handlers/structure/high/handleGetStructure.ts:14-36`).
 *
 * ECC 우회로는 `GetTable`과 **같은 함수모듈 하나**를 부른다 —
 * `ZMCP_ADT_DDIC_TABL_READ`가 TABCLASS로 투명 테이블과 구조를 갈라 처리한다.
 * 몸통(두 경로)은 `./ddicRead`에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server';
import { type DdicObjectKind, readDdicObject } from './ddicRead';

const STRUCTURE: DdicObjectKind = {
  toolName: 'GetStructure',
  nameField: 'structure_name',
  dataField: 'structure_data',
  adtSegment: 'structures',
  noun: 'structure',
  label: 'Structure',
};

export const getStructure = defineTool(
  {
    name: 'GetStructure',
    description:
      'Retrieve ABAP structure definition. Supports reading active or inactive version.',
    inputSchema: {
      structure_name: z.string().describe('Structure name (e.g., Z_MY_STRUCTURE).'),
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
    readDdicObject(STRUCTURE, context, { name: args.structure_name, version: args.version }),
);
