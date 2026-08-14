/**
 * `GetBehaviorImplementation` — RAP 동작 구현(BIMP) 클래스의 소스 한 벌.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetBehaviorImplementation` · 구 소스
 * `engine/src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts:16-39`).
 *
 * **BIMP는 클래스다.** 짝인 BDEF와 달리 주소가 `/sap/bc/adt/oo/classes/…`이고,
 * 이름은 **인코딩만 하고 대소문자를 그대로** 쓴다(`AdtUtils.js:743-748` —
 * 쓰기 쪽은 같은 이름을 소문자로 쓴다. 접어 합치면 안 되는 자리다).
 *
 * 몸통과 와이어 근거는 `./internal/behaviorRead`에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { BEHAVIOR_IMPLEMENTATION, getBehavior } from './internal/behaviorRead';

export const getBehaviorImplementation = defineTool(
  {
    name: 'GetBehaviorImplementation',
    description:
      'Retrieve ABAP behavior implementation definition. Supports reading active or inactive version.',
    inputSchema: {
      behavior_implementation_name: z
        .string()
        .describe('BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).'),
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
    targetNames: ['behavior_implementation_name'],
  },
  async (context, args) =>
    getBehavior(BEHAVIOR_IMPLEMENTATION, 'GetBehaviorImplementation', context, {
      name: args.behavior_implementation_name,
      version: args.version,
    }),
);
