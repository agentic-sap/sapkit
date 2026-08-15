/**
 * `GetDataElement` — 데이터 엘리먼트 정의 한 벌.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetDataElement` · 구 소스
 * `engine/src/handlers/data_element/high/handleGetDataElement.ts:17-39`).
 * 이름·인자 이름·설명 문구·응답 형태는 바꾸지 않는다.
 *
 * 몸통과 와이어 근거는 `./internal/dataElementDomainRead`에 있다. 요점 둘:
 *  - `GET /sap/bc/adt/ddic/dataelements/{NAME}` — **`?version=`이 붙지 않는다.**
 *  - 못 읽으면 오류로 올린다(짝인 `ReadDataElement`는 삼킨다).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { DATA_ELEMENT, getDdicType } from './internal/dataElementDomainRead';

export const getDataElement = defineTool(
  {
    name: 'GetDataElement',
    description:
      'Retrieve ABAP data element definition. Supports reading active or inactive version.',
    inputSchema: {
      data_element_name: z.string().describe('Data element name (e.g., Z_MY_DATA_ELEMENT).'),
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
    targetNames: ['data_element_name'],
  },
  async (context, args) =>
    getDdicType(DATA_ELEMENT, 'GetDataElement', context, {
      name: args.data_element_name,
      version: args.version,
    }),
);
