/**
 * DeleteBehaviorDefinition — 동작 정의(BDEF)를 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 와이어 근거
 *
 * 겉: `engine/src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts:50-139`.
 * 사슬: `…/dist/core/behaviorDefinition/AdtBehaviorDefinition.js`의 `delete()` —
 * 검사 → 삭제, **세션 무접촉**("no stateful needed - no lock/unlock").
 * 전문: `…/dist/core/behaviorDefinition/delete.js:28-89`.
 *
 * ## 이 종만 **전문 배치가 다르다** (실측 — 이 묶음에서 유일하다)
 *
 * 다른 11종은 XML 선언 뒤에 줄바꿈이 있고 들여쓰기가 2·4칸인데, BDEF는
 * **선언과 루트가 한 줄로 붙고** 들여쓰기가 **4·8칸**이다. 이송번호 판정도
 * 갈린다 — 다른 종은 `transport_request?.trim()`이라 공백뿐이면 빈 태그를 넣지만,
 * BDEF는 그냥 truthy라 **공백도 값으로 실린다**(`delete.js:68-70`). 눈에 안 띄는
 * 차이지만 채록·재생 대조의 대상이므로 접어 합치지 않았다
 * (`./internal/deletion.ts`의 `compact` 배치).
 *
 * ## 이름은 **소문자 · 인코딩 없음**
 *
 * `/sap/bc/adt/bo/behaviordefinitions/{name.toLowerCase()}` — `encodeURIComponent`을
 * 거치지 않는다(`delete.js:29`·`:67`). 이미 지어진 `./behaviorUri.ts`의 표가
 * BDEF의 자리별 표기 실측 정본이고, 삭제도 그 표의 `bdefObjectUri`와 같은 규칙이라
 * 그것을 그대로 쓴다. **구문검사 URI만 인코딩 뒤 소문자**라는 함정도 그 표에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { bdefObjectUri } from './behaviorUri';
import { deletionFailureMessage, runDeletion } from './internal/deletion';
import { errorResult, okResult } from './shared';

export const deleteBehaviorDefinition = defineTool(
  {
    name: 'DeleteBehaviorDefinition',
    description:
      'Delete an ABAP behavior definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      behavior_definition_name: z
        .string()
        .describe('BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).'),
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
    targetNames: ['behavior_definition_name'],
  },
  async (context, args) => {
    if (!args.behavior_definition_name) {
      return errorResult('Error: behavior_definition_name is required');
    }

    const behaviorDefinitionName = args.behavior_definition_name.toUpperCase();
    context.logger.info(`Starting behavior definition deletion: ${behaviorDefinitionName}`);

    try {
      const client = await context.getConnection();
      await runDeletion(client, {
        objectUri: bdefObjectUri(behaviorDefinitionName),
        label: 'Behavior definition',
        transportRequest: args.transport_request,
        layout: 'compact',
      });

      context.logger.info(
        `DeleteBehaviorDefinition completed successfully: ${behaviorDefinitionName}`,
      );
      return okResult({
        success: true,
        behavior_definition_name: behaviorDefinitionName,
        transport_request: args.transport_request || null,
        message: `BehaviorDefinition ${behaviorDefinitionName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'behavior definition',
        label: 'BehaviorDefinition',
        name: behaviorDefinitionName,
      });
      context.logger.error(
        `Error deleting behavior definition ${behaviorDefinitionName}: ${message}`,
      );
      return errorResult(`Error: ${message}`);
    }
  },
);
