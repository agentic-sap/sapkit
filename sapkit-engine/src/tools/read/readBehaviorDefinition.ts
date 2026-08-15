/**
 * `ReadBehaviorDefinition` — BDEF의 소스와 메타데이터.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ReadBehaviorDefinition` · 구 소스
 * `engine/src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts:9-30`).
 *
 * 짝인 `GetBehaviorDefinition`과 **같은 오브젝트를 읽지만 같은 도구가 아니다.**
 * 구 트리에서 이쪽은 `readonly/`에 살고(그래서 `sets: ['readonly']`),
 * **서로 다른 두 엔드포인트로 GET을 두 번** 보내며, 어느 쪽이 실패해도
 * `success: true`로 답한다. 차이의 실측 근거는 `./internal/behaviorRead`의
 * 머리주석 표에 있다.
 *
 * 두 번째 GET(메타데이터)은 `?version=inactive`로 **고정**이다 — 감싸개가
 * 리터럴을 박아 넣기 때문이며(`AdtBehaviorDefinition.js:193`), `version=active`로
 * 불러도 그 요청만은 `inactive`로 나간다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { BEHAVIOR_DEFINITION, readBehavior } from './internal/behaviorRead';

export const readBehaviorDefinition = defineTool(
  {
    name: 'ReadBehaviorDefinition',
    description:
      '[read-only] Read ABAP behavior definition source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      behavior_definition_name: z
        .string()
        .describe('Behavior definition name (e.g., Z_MY_BDEF).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['behavior_definition_name'],
  },
  async (context, args) =>
    readBehavior(BEHAVIOR_DEFINITION, context, {
      name: args.behavior_definition_name,
      version: args.version,
    }),
);
