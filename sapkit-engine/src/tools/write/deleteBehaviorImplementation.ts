/**
 * DeleteBehaviorImplementation — 동작 구현(BIMP)을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## BIMP는 **클래스다** — 그래서 삭제도 클래스 삭제다 (실측)
 *
 * 겉: `engine/src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts:52-141`.
 * 사슬: `…/dist/core/behaviorImplementation/AdtBehaviorImplementation.js`의
 * `delete()`가 하는 일은 `this.class.delete({ className, transportRequest })`
 * 한 줄뿐이다 — 즉 **`AdtClass.delete()`가 그대로 돈다.** 따라서:
 *
 *  - 주소는 `/sap/bc/adt/oo/classes/{대문자}` (`DeleteClass`와 **같다**)
 *  - 전문 배치는 표준, 삭제 걸음만 **stateful**
 *  - 거짓 성공 판정 라벨은 벤더가 넘기는 **`"Class"`** 다 —
 *    `BehaviorImplementation`이 아니다(`dist/core/class/delete.js:74`).
 *
 * 마지막 줄이 이 종의 함정이다. 겉 핸들러의 404·423 문구는
 * `BehaviorImplementation`을 쓰는데(`:120`·`:122`) 벤더가 던지는 문구는 `Class`로
 * 시작한다. **두 자리를 하나로 맞추면 구와 문구가 어긋난다.**
 *
 * BDEF(`DeleteBehaviorDefinition`)와는 완전히 다른 계열이다 — 그쪽은
 * `/sap/bc/adt/bo/behaviordefinitions/{소문자}`에 압축 배치다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { encodeObjectName, errorResult, okResult } from './shared';

/** BIMP 삭제 주소 — 클래스와 같다. **대문자 그대로.** */
export function behaviorImplementationDeletionUri(className: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(className)}`;
}

export const deleteBehaviorImplementation = defineTool(
  {
    name: 'DeleteBehaviorImplementation',
    description:
      'Delete an ABAP behavior implementation from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      behavior_implementation_name: z
        .string()
        .describe('BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['behavior_implementation_name'],
  },
  async (context, args) => {
    if (!args.behavior_implementation_name) {
      return errorResult('Error: behavior_implementation_name is required');
    }

    const behaviorImplementationName = args.behavior_implementation_name.toUpperCase();
    context.logger.info(
      `Starting behavior implementation deletion: ${behaviorImplementationName}`,
    );

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: behaviorImplementationDeletionUri(behaviorImplementationName),
        // 벤더가 넘기는 라벨은 `Class`다 — BIMP가 아니다.
        label: 'Class',
        transportRequest: args.transport_request,
        stateful: true,
      });

      context.logger.info(
        `DeleteBehaviorImplementation completed successfully: ${behaviorImplementationName}`,
      );
      return okResult({
        success: true,
        behavior_implementation_name: behaviorImplementationName,
        transport_request: args.transport_request || null,
        message: `BehaviorImplementation ${behaviorImplementationName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'behavior implementation',
        label: 'BehaviorImplementation',
        name: behaviorImplementationName,
      });
      context.logger.error(
        `Error deleting behavior implementation ${behaviorImplementationName}: ${message}`,
      );
      return errorResult(`Error: ${message}`);
    }
  },
);
