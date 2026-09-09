/**
 * `ReadBehaviorImplementation` — BIMP 클래스의 소스와 메타데이터.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ReadBehaviorImplementation` · 구 소스
 * `engine/src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts:9-30`).
 *
 * 짝인 `GetBehaviorImplementation`과 같은 오브젝트를 읽지만 같은 도구가 아니다 —
 * `readonly/`에 살고, GET을 두 번 보내며, 실패를 삼킨다.
 *
 * BDEF 쪽 짝과 다른 자리 하나: **메타데이터 요청에 질의 인자가 하나도 붙지
 * 않는다**(`AdtUtils.js:269-292` — 호출자가 `options`를 주지 않으므로
 * `version`도 `withLongPolling`도 없다). BDEF는 같은 자리에서
 * `?version=inactive`가 붙는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { BEHAVIOR_IMPLEMENTATION, readBehavior } from './internal/behaviorRead';

export const readBehaviorImplementation = defineTool(
  {
    name: 'ReadBehaviorImplementation',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json` · D-147 이정표).
    description:
      '[read-only] Read ABAP behavior implementation source code and metadata (package, responsible, description, etc.).' +
      " Returns the class main source only — the lhc_*/lsc_* handler classes live in the implementations include (CCIMP), which is read with GetLocalTypes (and written with UpdateBehaviorImplementation's implementation_code). GetLocalTypes is exposed on the development tool surface (toolSurface: development), not on readonly.",
    inputSchema: {
      behavior_implementation_name: z
        .string()
        .describe('Behavior implementation name (e.g., ZBP_MY_CLASS).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['behavior_implementation_name'],
  },
  async (context, args) =>
    readBehavior(BEHAVIOR_IMPLEMENTATION, context, {
      name: args.behavior_implementation_name,
      version: args.version,
    }),
);
