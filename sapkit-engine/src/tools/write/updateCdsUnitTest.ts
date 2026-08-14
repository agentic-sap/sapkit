/**
 * UpdateCdsUnitTest — CDS 시험 클래스의 **로컬 시험 클래스 소스**를 갈아 끼운다.
 *
 * ## 실체는 `UpdateLocalTestClass`의 사슬이다 — 다만 활성화가 **강제**다
 *
 * 구 핸들러(`engine/src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts:75-79`)는
 * `cdsUnitTest.update({ className, testClassSource, transportRequest })`를 부르고,
 * 벤더 `AdtCdsUnitTest.update()`
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/unitTest/AdtCdsUnitTest.js:146-171`)
 * 가 그것을 **그대로 `adtLocalTestClass.update(…, { activateOnUpdate: true })`로
 * 넘긴다.** 즉 와이어는 `UpdateLocalTestClass`와 같은 사슬이고, 다른 것은
 * `activate_on_update` 인자가 없이 **언제나 활성화한다**는 점뿐이다.
 *
 * ```
 * 1. LOCK   POST /sap/bc/adt/oo/classes/{소문자}?_action=LOCK&accessMode=MODIFY
 * 2. CHECK  POST /sap/bc/adt/checkruns?reporters=abapCheckRun   (제안 소스를 base64로)
 * 3. PUT    PUT  /sap/bc/adt/oo/classes/{소문자}/includes/testclasses?lockHandle=…[&corrNr=…]
 * 4. UNLOCK POST /sap/bc/adt/oo/classes/{소문자}?_action=UNLOCK&lockHandle=…
 * 5. ACTIVATE POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ```
 *
 * 사슬의 와이어 근거(주소·대소문자 규칙·검사 본문)는 `classIncludeWrite.ts`
 * 머리주석이 파일·줄로 갖고 있고, 5단계는 벤더
 * `.../core/class/AdtLocalTestClass.js:227-235`다. **활성화는 해제 뒤**이며
 * (잠긴 채로 활성화하면 SAP이 거부한다) 그 순서도 벤더 그대로다.
 *
 * 사슬 조각을 `writeClassInclude` 한 덩이로 부르지 않고 여기서 펼친 이유는
 * **응답이 잠금 손잡이를 싣기 때문**이다(아래 「응답」). 공용 헬퍼를 고치는
 * 대신 이미 내보내진 두 조각(`checkClassInclude`·`putClassInclude`)을 쓴다.
 *
 * ## 의도적 차이 D120 — 활성화 **거짓 성공**을 성공으로 접지 않는다
 *
 * **구 동작(실측)**: 벤더는 활성화 요청을 보내기는 한다. 그런데 그 **응답 본문을
 * 읽지 않는다** — `AdtClass.activate()`가 `activateObjectInSession`의 응답을 그대로
 * 돌려주고(`.../utils/activationUtils.js:116-133`), HTTP 4xx에서만 던진다
 * (`AdtClass.js:436-468`). **SAP은 활성화 실패도 HTTP 200으로 답하며
 * `<chkl:msg type="E">`를 담는다.** 그래서 깨진 시험 클래스가
 * "updated successfully"로 보고됐다.
 *
 * **신 동작**: 응답 본문을 갈라 `E`/`A`/`X`가 있으면 실패로 되돌린다. 선례는
 * D2(`UpdateLocalTypes`)·D41(`UpdateLocalTestClass`) — **같은 사슬의 같은 자리**이며,
 * 여기만 구를 재현하면 한 엔진 안에서 같은 실패에 두 도구가 다르게 답한다.
 * 이 도구의 요구 급이 `계약 시험`이라 사람 실기로 뒤늦게 잡을 기회도 없다.
 *
 * - 사람용 장부: `harness/DIVERGENCES.md` D120
 * - 대체 기대 시험: 이 도구 시험의 「D120」 절
 * - **기계 장부(`harness/replay/divergences.ts`) 미반영** — 이 묶음 과제는 그 파일이
 *   무접촉이다. 도구 응답이 `isError`째로 달라지므로 **기계 장부에 와야 한다.**
 *   오케스트레이터가 묶음 병합 뒤에 옮긴다.
 *
 * ## 응답 — 구가 싣던 것 그대로
 *
 * 구는 벤더가 돌려준 `testClassState`에서 세 키만 골라 싣는다
 * (`handleUpdateCdsUnitTest.ts:89-95`). 그중 `testClassCode`는 그 상태 객체에 없는
 * 키라 **언제나 `undefined`**여서 직렬화에서 사라지고, `lockHandle`은 1단계에서
 * 받은 손잡이가 그대로 남아 실린다(벤더 `AdtLocalTestClass.js:198` — 지역 변수만
 * 비우고 상태는 비우지 않는다). `errors`는 빈 배열이다. 그래서 실제로 나가는
 * 모양은 `{ lockHandle, errors: [] }` 하나뿐이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 실패 문구의 세부는 구 `extractAdtErrorMessage` 대신 이 묶음의 `describeFailure`가
 * 만든다 — 엔진 자체 저작 진단 문구이며 장부 D13이 덮는 자리다. SAP이 돌려준
 * 원문은 양쪽 다 보존한다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { checkClassInclude, putClassInclude } from './classIncludeWrite';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  classUri,
  describeFailure,
  errorResult,
  okResult,
  parseActivationMessages,
} from './shared';

export const updateCdsUnitTest = defineTool(
  {
    name: 'UpdateCdsUnitTest',
    description: 'Update a CDS unit test class local test class source code.',
    inputSchema: {
      class_name: z.string().describe('Global test class name (e.g., ZCL_CDS_TEST).'),
      test_class_source: z
        .string()
        .describe('Updated local test class ABAP source code.'),
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
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.class_name || !args.test_class_source) {
      return errorResult('Error: Missing required parameters: class_name, test_class_source');
    }

    const className = args.class_name.toUpperCase();
    logger.info(`Updating CDS unit test class source: ${className}`);

    try {
      const client = await context.getConnection();

      // 1~4. 잠금 → 검사 → PUT → 해제. 손잡이를 응답에 실어야 해서 펼쳐 둔다.
      const lockHandle = await client.withLock(classUri(className), async (lock) => {
        await checkClassInclude(
          client,
          className,
          'testclasses',
          args.test_class_source,
          'Test class',
        );
        await putClassInclude(
          client,
          className,
          'testclasses',
          args.test_class_source,
          lock.handle,
          args.transport_request,
        );
        return lock.handle;
      });

      // 5. 활성화 — 이 도구에는 끄는 인자가 없다. **해제 뒤**여야 한다.
      const body = await activateOne(client, classUri(className), className, {
        contentType: CT_ACTIVATION,
      });
      // D120 — 200으로 돌아온 실패를 여기서 잡는다.
      const failures = activationErrors(parseActivationMessages(body));
      if (failures.length > 0) {
        throw new SourceCheckFailure(
          `Activation failed: class ${className} was not activated (${failures.length} error${
            failures.length === 1 ? '' : 's'
          }): ${failures
            .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
            .join(' | ')}. The test class update is on SAP as an inactive version; the active version is unchanged.`,
          failures,
        );
      }

      logger.info(`UpdateCdsUnitTest completed successfully: ${className}`);

      return okResult({
        success: true,
        class_name: className,
        test_class_state: { lockHandle, errors: [] },
        message: `CDS unit test class ${className} updated successfully.`,
      });
    } catch (error) {
      const detail = describeFailure(error);
      logger.error(`Error updating CDS unit test class ${className}: ${detail}`);
      return errorResult(`Error: ${detail}`);
    }
  },
);
