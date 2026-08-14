/**
 * `ReadDataElement` — 데이터 엘리먼트의 정의와 메타데이터.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ReadDataElement` · 구 소스
 * `engine/src/handlers/data_element/readonly/handleReadDataElement.ts:9-30`).
 *
 * 짝인 `GetDataElement`와 **같은 오브젝트를 읽지만 같은 도구가 아니다.** 구
 * 트리에서 이쪽은 `readonly/`에 살고(그래서 `sets: ['readonly']`), ECC 우회로가
 * 없으며, `read` + `readMetadata`로 **GET을 두 번** 보내고, 어느 쪽이 실패해도
 * `success: true`로 답한다. 차이의 실측 근거는
 * `./internal/dataElementDomainRead`의 머리주석 표에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { DATA_ELEMENT, readDdicType } from './internal/dataElementDomainRead';

export const readDataElement = defineTool(
  {
    name: 'ReadDataElement',
    description:
      '[read-only] Read ABAP data element definition and metadata (package, responsible, description, etc.).',
    inputSchema: {
      data_element_name: z.string().describe('Data element name (e.g., Z_MY_DATA_ELEMENT).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['data_element_name'],
  },
  async (context, args) =>
    readDdicType(DATA_ELEMENT, context, {
      name: args.data_element_name,
      version: args.version,
    }),
);
