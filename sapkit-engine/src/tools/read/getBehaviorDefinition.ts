/**
 * `GetBehaviorDefinition` — RAP 동작 정의(BDEF)의 소스 한 벌.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetBehaviorDefinition` · 구 소스
 * `engine/src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts:16-38`).
 * 이름·인자 이름·설명 문구·응답 형태는 바꾸지 않는다.
 *
 * 몸통과 와이어 근거는 `./internal/behaviorRead`에 있다. 요점 셋:
 *  - `GET /sap/bc/adt/bo/behaviordefinitions/{소문자 이름}/source/main?version=…`
 *    — **이름을 인코딩하지 않고 소문자로만 쓴다**(벤더 `read.js:61`).
 *  - 짝인 `ReadBehaviorDefinition`과 달리 **GET 한 번**이고, 못 읽으면 오류다.
 *  - `version`은 **와이어에 실린다**(같은 `Get*` 계열이라도 도메인·데이터
 *    엘리먼트는 안 실린다 — 접어 합치면 안 되는 이유가 이것이다).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { BEHAVIOR_DEFINITION, getBehavior } from './internal/behaviorRead';

export const getBehaviorDefinition = defineTool(
  {
    name: 'GetBehaviorDefinition',
    description:
      'Retrieve ABAP behavior definition definition. Supports reading active or inactive version.',
    inputSchema: {
      behavior_definition_name: z
        .string()
        .describe('BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).'),
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
    targetNames: ['behavior_definition_name'],
  },
  async (context, args) =>
    getBehavior(BEHAVIOR_DEFINITION, 'GetBehaviorDefinition', context, {
      name: args.behavior_definition_name,
      version: args.version,
    }),
);
