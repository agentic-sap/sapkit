/**
 * DeleteCdsUnitTest — CDS 단위시험 클래스(전역 클래스)를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어는 클래스 삭제 그대로다 (실측)
 *
 * 겉: `engine/src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts:46-113`.
 * 사슬: `…/dist/core/unitTest/AdtCdsUnitTest.js`의 `delete()` — `className`이 있으면
 * **부모의 `adtClass.delete()`를 그대로 부른다.** 그래서 나가는 요청은 `DeleteClass`와
 * 같은 두 개(검사 → 삭제)이고, 삭제 걸음만 stateful이며, 거짓 성공 판정 라벨도
 * 벤더가 넘기는 **`"Class"`** 다.
 *
 * `className`이 없으면 부모 `AdtUnitTest.delete()`로 떨어져 "지원하지 않는다"고
 * 던지지만, 이 도구의 발행 스키마는 `class_name`을 **필수**로 두므로 그 갈래에
 * 닿지 않는다(`DeleteUnitTest`가 그 갈래를 소유한다).
 *
 * ## 다른 삭제 12종과 갈리는 자리 둘 — **눈으로 옮기면 틀린다**
 *
 *  1. **응답에 `transport_request` 칸이 없다.** 인자로는 받지만 응답에 싣지 않는다
 *     (`:88-96`). 다른 종은 전부 `transport_request: … || null`을 싣는다.
 *  2. **오류를 상태 코드로 가르지 않는다.** 404·423·400 문구가 아예 없고
 *     `error?.message || String(error)`를 그대로 올린다(`:105-108`). 그래서 여기서는
 *     `deletionFailureMessage`를 쓰지 않는다 — 쓰면 구에 없던 문구가 생긴다.
 *     엔진 자체 진단 산문이 구와 다른 것은 이미 등재된 차이다(장부 D13).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { runDeletion } from './internal/deletion';
import { describeFailure, encodeObjectName, errorResult, okResult } from './shared';

/** CDS 단위시험 클래스 삭제 주소 — 클래스와 같다. **대문자 그대로.** */
export function cdsUnitTestDeletionUri(className: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(className)}`;
}

export const deleteCdsUnitTest = defineTool(
  {
    name: 'DeleteCdsUnitTest',
    description: 'Delete a CDS unit test class (global class).',
    inputSchema: {
      class_name: z.string().describe('Global test class name (e.g., ZCL_CDS_TEST).'),
      transport_request: z
        .string()
        .describe('Transport request number (required for transportable packages).')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name'],
  },
  async (context, args) => {
    if (!args.class_name) return errorResult('Error: class_name is required');

    const className = args.class_name.toUpperCase();
    context.logger.info(`Deleting CDS unit test class: ${className}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: cdsUnitTestDeletionUri(className),
        // 부모 클래스 삭제가 도는 것이므로 라벨도 벤더의 `Class`다.
        label: 'Class',
        transportRequest: args.transport_request,
        stateful: true,
      });

      context.logger.info(`DeleteCdsUnitTest completed successfully: ${className}`);
      // 이송번호 칸이 없다 — 구 응답 그대로.
      return okResult({
        success: true,
        class_name: className,
        message: `CDS unit test class ${className} deleted successfully.`,
      });
    } catch (error) {
      // 상태 코드로 가르지 않는다 — 구가 그렇게 지어져 있다.
      const message = describeFailure(error);
      context.logger.error(`Error deleting CDS unit test class ${className}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
