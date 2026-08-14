/**
 * `CreateBehaviorDefinition` — RAP 동작 정의(BDEF)를 만들고 활성화까지 한다.
 *
 * 구 핸들러: `engine/src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts`.
 * **`high/`가 발행되는 쪽이다** — `low/`의 같은 이름 파일은 `TOOL_DEFINITION.name`이
 * `CreateBehaviorDefinitionLow`이고 그 이름은 채록본(186종)에 없다.
 *
 * ## 순서 (구 실측 · `handleCreateBehaviorDefinition.ts:99-192`)
 *
 * 생성 → 잠금 → 구문검사 → 해제 → (활성화). 인터페이스·클래스의 「생성만 하고
 * 소스는 Update가 넣는다」와 달리 **이 도구는 활성화까지 간다**(인자 `activate`의
 * 기본이 켜짐).
 *
 * | 단계 | 요청 | 근거 (읽기 전용 참조) |
 * |---|---|---|
 * | CREATE | `POST /sap/bc/adt/bo/behaviordefinitions[?corrNr=…]` · CT=Accept `application/vnd.sap.adt.blues.v1+xml` | `dist/core/behaviorDefinition/create.js:33-64` |
 * | LOCK | `POST {소문자 URI}?_action=LOCK&accessMode=MODIFY` · Accept `ACCEPT_LOCK` | `.../lock.js:28-53` |
 * | 검사 | `POST /sap/bc/adt/checkruns?reporters=abapCheckRun` · CT `…checkobjects+xml` · **Accept 없음** | `engine/src/lib/preCheckBeforeActivation.ts:278-287`·`503-533` |
 * | UNLOCK | `POST {소문자 URI}?_action=UNLOCK&lockHandle=…` | `.../unlock.js:28-34` |
 * | 활성화 | `POST /sap/bc/adt/activation?method=activate&preauditRequested=true` · CT `…activation+xml` · Accept `application/xml` | `dist/utils/activationUtils.js:116-132` |
 *
 * ## `root_entity`는 **와이어에 나가지 않는다** (실측)
 *
 * 발행 스키마가 `root_entity`를 필수로 요구하고 구 핸들러도 없으면 거절하지만,
 * 생성 페이로드에 그 값이 실리는 자리가 없다 — `AdtBehaviorDefinition.create()`가
 * 저수준 `create()`에 넘기는 것은 name·package·description·implementationType·
 * transportRequest·masterSystem·responsible뿐이다(`AdtBehaviorDefinition.js:114-122`).
 * `rootEntity`를 쓰는 것은 **`validate()`뿐인데 이 통로는 그것을 부르지 않는다.**
 * 그래서 인자는 "필수 가드"로만 살아 있다. 짝인 `CreateBehaviorImplementation`의
 * `behavior_definition`도 같은 모양이다.
 *
 * ## 언어를 EN으로 박는다 (구 그대로 — 개선하지 않았다)
 *
 * 저수준 `create.js:35`는 `params.language || 'EN'`인데 `AdtBehaviorDefinition`이
 * `language`를 아예 넘기지 않는다. 클래스·인터페이스 생성이 로그온 언어를 물어
 * 채워 넣는 것과 달리 이 계열에는 그 통로 자체가 없다 — 없는 요청을 새로 만드는
 * 것은 재현이 아니라 개선이므로 하지 않았다.
 *
 * ## 구와 다른 것 — 차이 장부에 등재됨
 *
 * - **D98** — `masterSystem`·`responsible`을 `context.env`에서만 읽는다(D62와
 *   같은 부류). 구는 기동 때 캐시한 시스템 문맥에서 가져왔다.
 * - **D99** — **활성화 응답을 읽는다.** 구는 `activate()`의 반환값을 어디에도
 *   쓰지 않고 곧장 성공을 만든다(`handleCreateBehaviorDefinition.ts:153-183`).
 *   SAP은 활성화 실패도 HTTP 200 + `<chkl:msg type="E">`로 답하므로 그 갈래는
 *   거짓 성공이다.
 * - **D101** — LOCK 요청에 구의 `asx:abap` 템플릿 본문을 싣지 않는다. 잠금
 *   수명주기를 접속 계층(`client.withLock`)이 소유하고, 그 통로에 본문 자리가
 *   아직 없다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { bdefCheckUri, bdefObjectUri, ownerAttributes, rawCheckRun } from './behaviorUri';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  describeFailure,
  errorResult,
  limitDescription,
  okResult,
  parseActivationMessages,
} from './shared';

/** 구 `CT_BEHAVIOR_DEFINITION` (`dist/constants/contentTypes.js:100`). */
const CT_BEHAVIOR_DEFINITION = 'application/vnd.sap.adt.blues.v1+xml';

/** 벤더가 넘기지 않아 저수준의 기본값이 그대로 쓰이는 자리(`create.js:35`). */
const PAYLOAD_LANGUAGE = 'EN';

/** `dist/core/behaviorDefinition/create.js:46-51`의 문자열. 들여쓰기까지 그대로다. */
export function buildBehaviorDefinitionPayload(input: {
  readonly name: string;
  readonly description: string;
  readonly packageName: string;
  readonly implementationType: string;
  readonly ownerAttrs: string;
}): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><blue:blueSource ` +
    `xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${input.description}" adtcore:language="${PAYLOAD_LANGUAGE}" ` +
    `adtcore:name="${input.name}" adtcore:type="BDEF/BDO" ` +
    `adtcore:masterLanguage="${PAYLOAD_LANGUAGE}"${input.ownerAttrs}>\n` +
    `    <adtcore:adtTemplate>\n` +
    `        <adtcore:adtProperty adtcore:key="implementation_type">${input.implementationType}</adtcore:adtProperty>\n` +
    `    </adtcore:adtTemplate>\n` +
    `    <adtcore:packageRef adtcore:name="${input.packageName}"/>\n` +
    `</blue:blueSource>`
  );
}

export const createBehaviorDefinition = defineTool(
  {
    name: 'CreateBehaviorDefinition',
    description:
      'Create a new ABAP Behavior Definition (BDEF) in SAP system. Defines RAP business object behavior: CRUD operations, validations, determinations, actions, and draft handling.',
    inputSchema: {
      name: z.string().describe('Behavior Definition name (usually same as Root Entity name)'),
      description: z.string().describe('Description').optional(),
      package_name: z.string().describe('Package name'),
      transport_request: z.string().describe('Transport request number').optional(),
      root_entity: z.string().describe('Root Entity name (CDS View name)'),
      implementation_type: z
        .enum(['Managed', 'Unmanaged', 'Abstract', 'Projection'])
        .describe("Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'"),
      activate: z.boolean().describe('Activate after creation. Default: true').optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    // 참조 인자도 함께 적는다 — `createInclude(['include_name','main_program'])` ·
    // `createFunctionModule(['…_name','function_group_name'])`와 같은 규약이다.
    // `root_entity`는 와이어에 나가지 않지만 이 오브젝트가 겨누는 대상이므로
    // 녹화 사전 검사가 그만큼 넓어진다.
    targetNames: ['name', 'root_entity'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    // 구는 네 인자를 한 문장으로 거른다(`handleCreateBehaviorDefinition.ts:79-86`).
    if (!args.name || !args.package_name || !args.root_entity || !args.implementation_type) {
      return errorResult('Error: Missing required parameters');
    }

    // `validateTransportRequest`는 구에서 **본문이 빈 함수**라 옮길 것이 없다
    // (`engine/src/utils/transportValidation.ts:10-18`).

    const name = args.name.toUpperCase();
    const objectUri = bdefObjectUri(name);
    // 인자를 주지 않으면 **켜진다** — 구 `args.activate !== false`.
    const shouldActivate = args.activate !== false;
    logger.info(`Starting BDEF creation: ${name}`);

    try {
      const client = await context.getConnection();

      // 전송요청은 빈 문자열이면 질의 인자 자체가 붙지 않는다
      // (`AdtBehaviorDefinition.js:119`가 `''`를 넘기고 `create.js:56`이 falsy로 건너뛴다).
      const transportRequest = args.transport_request || '';
      try {
        await client.request({
          method: 'POST',
          path: '/sap/bc/adt/bo/behaviordefinitions',
          params: { corrNr: transportRequest === '' ? undefined : transportRequest },
          body: buildBehaviorDefinitionPayload({
            name,
            description: limitDescription(args.description || name),
            packageName: args.package_name,
            implementationType: args.implementation_type,
            ownerAttrs: ownerAttributes(context),
          }),
          contentType: CT_BEHAVIOR_DEFINITION,
          accept: CT_BEHAVIOR_DEFINITION,
        });
      } catch (error) {
        // 저수준 `create.js:66-69`가 실패를 이 문구로 다시 싸서 던진다.
        throw new Error(
          `Failed to create behavior definition ${name}: ${describeFailure(error)}`,
        );
      }
      logger.info(`Behavior definition created: ${name}`);

      // 잠금 → 사후 구문검사 → 해제. 구는 잠금 뒤 실패하면 반드시 풀고 다시
      // 던진다(`:159-173`) — `withLock`이 같은 계약이다.
      await client.withLock(objectUri, async () => {
        const check = await rawCheckRun(client, bdefCheckUri(name), 'inactive');
        assertNoCheckErrors(check, 'Behavior Definition', name);
      });

      if (shouldActivate) {
        const body = await activateOne(client, objectUri, name, { contentType: CT_ACTIVATION });
        // D99 — 구는 이 본문을 읽지 않았다.
        const failures = activationErrors(parseActivationMessages(body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: behavior definition ${name} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The object exists on SAP as an inactive version.`,
            failures,
          );
        }
        logger.info(`Behavior definition activated: ${name}`);
      }

      logger.info(`CreateBehaviorDefinition completed successfully: ${name}`);
      return okResult({
        success: true,
        name,
        package_name: args.package_name,
        type: 'BDEF',
        message: shouldActivate
          ? `Behavior Definition ${name} created and activated successfully`
          : `Behavior Definition ${name} created successfully`,
      });
    } catch (error) {
      // 구는 `isPreCheckFailure` 갈래에서도 결국 `return_error(error)`를 부르므로
      // 두 갈래의 응답 모양이 같다 — `Error: ` 접두사가 그 함수의 계약이다
      // (`engine/src/lib/utils.ts:421-429`).
      const message = describeFailure(error);
      logger.error(`Error creating BDEF ${name}: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
