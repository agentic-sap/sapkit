/**
 * `GetDomain` — 도메인 정의 한 벌.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetDomain` · 구 소스
 * `engine/src/handlers/domain/high/handleGetDomain.ts:17-39`).
 * 이름·인자 이름·설명 문구·응답 형태는 바꾸지 않는다.
 *
 * 몸통과 와이어 근거는 `./internal/dataElementDomainRead`에 있다. 요점 둘:
 *  - `GET /sap/bc/adt/ddic/domains/{NAME}` — **`?version=`이 붙지 않는다.**
 *  - 못 읽으면 오류로 올린다(짝인 `ReadDomain`은 삼킨다).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { DOMAIN, getDdicType } from './internal/dataElementDomainRead';

export const getDomain = defineTool(
  {
    name: 'GetDomain',
    description: 'Retrieve ABAP domain definition. Supports reading active or inactive version.',
    inputSchema: {
      domain_name: z.string().describe('Domain name (e.g., Z_MY_DOMAIN).'),
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
    targetNames: ['domain_name'],
  },
  async (context, args) =>
    getDdicType(DOMAIN, 'GetDomain', context, {
      name: args.domain_name,
      version: args.version,
    }),
);
