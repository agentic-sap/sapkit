/**
 * `CreateBehaviorImplementation` — BIMP 클래스의 **껍데기**를 만든다.
 *
 * 구 핸들러: `engine/src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`
 * (`high/`가 발행되는 쪽 — `low/`의 같은 이름은 `CreateBehaviorImplementationLow`라
 * 채록본에 없다). 구현 코드는 이 도구가 넣지 않는다
 * (`UpdateBehaviorImplementation`의 몫이고, 발행 설명이 그렇게 말한다).
 *
 * ## 짝인 `CreateBehaviorDefinition`과 무엇이 다른가 (전부 실측)
 *
 * | | BDEF | BIMP |
 * |---|---|---|
 * | 만드는 것 | `blue:blueSource` · `BDEF/BDO` | **`class:abapClass` · `CLAS/OC`** — 그냥 클래스다 |
 * | 주소 | `POST /sap/bc/adt/bo/behaviordefinitions` | `POST /sap/bc/adt/oo/classes` |
 * | 요청 수 | 생성·잠금·검사·해제·활성화 (최대 5) | **생성 전 1 + 생성 1 = 2** |
 * | 활성화 | 인자 `activate`로 켜짐(기본 참) | **인자 자체가 없다 · 활성화하지 않는다** |
 * | 소유자 속성 | 기동 때 캐시한 시스템 문맥 (신: env — D98) | **매 호출마다 SAP에 물어본다** |
 * | 안 쓰는 필수 인자 | `root_entity` | `behavior_definition` |
 *
 * 마지막 줄이 이 짝의 대칭이다. 발행 스키마가 `behavior_definition`을 필수로
 * 요구하고 구 핸들러도 없으면 거절하지만, **생성 페이로드에 그 값이 실리는 자리가
 * 없다** — `AdtBehaviorImplementation.create()`가 `AdtClass.create()`에 넘기는 것은
 * className·packageName·transportRequest·description·masterSystem·responsible뿐이다
 * (`dist/core/behaviorImplementation/AdtBehaviorImplementation.js:100-107`).
 * `behaviorDefinition`을 쓰는 것은 `validate()`와 `update()`인데 이 통로는 둘 다
 * 부르지 않는다. 응답의 메아리로만 살아 있다.
 *
 * ## 와이어 근거 (읽기 전용 참조 — `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist`)
 *
 * | 단계 | 요청 | 근거 |
 * |---|---|---|
 * | 시스템 정보 | `GET /sap/bc/adt/core/http/systeminformation?_={Date.now()}` · Accept `application/vnd.sap.adt.core.http.systeminformation.v1+json` | `utils/systemInfo.js:16-32` |
 * | 생성 | `POST /sap/bc/adt/oo/classes[?corrNr=…]` · CT=Accept `application/vnd.sap.adt.oo.classes.v4+xml` | `core/class/create.js:17-85` |
 *
 * `_={Date.now()}`는 Eclipse가 쓰던 캐시 무력화 인자다(벤더 주석). **값이 매번
 * 달라지는 요청**이므로 재생 대조가 이 자리를 변동값으로 다뤄야 한다.
 * 시스템 정보 조회가 실패하면 벤더는 `null`로 접고 생성을 계속한다 — 그 실패가
 * 생성 실패가 되어서는 안 된다.
 *
 * ## 구를 그대로 둔 자리
 *
 * - **언어를 EN으로 박는다.** `AdtBehaviorImplementation`이 `masterLanguage`를
 *   넘기지 않으므로 `create.js:43`의 기본값이 그대로 나간다. 클래스 생성 도구
 *   (`createClass.ts`)는 로그온 언어를 물어 채우지만 이 통로에는 그 호출이 없다 —
 *   없는 요청을 새로 만드는 것은 재현이 아니라 개선이다.
 * - **페이로드 조립기를 `createClass.ts`와 공유하지 않는다.** 그쪽은 클래스 묶음의
 *   파일이고 인자 축(`final`·`abstract`·`superclass`·`create_protected`)이 다르다.
 *   같은 벤더 문자열을 각자 옮겨 적은 것이며, 정본은 `core/class/create.js:44-64`다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { bimpObjectUri } from './behaviorUri';
import { describeFailure, errorResult, limitDescription, okResult } from './shared';

/** 구 `CT_CLASS` (`dist/constants/contentTypes.js:64`). Accept도 같은 값이다. */
const CT_CLASS = 'application/vnd.sap.adt.oo.classes.v4+xml';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';

/** 벤더가 넘기지 않아 저수준의 기본값이 그대로 쓰이는 자리(`create.js:43`). */
const PAYLOAD_LANGUAGE = 'EN';

interface SystemInformation {
  readonly systemID?: string;
  readonly userName?: string;
}

/**
 * `utils/systemInfo.js:16-59`의 `getSystemInformation` 그대로 — **실패도 JSON이
 * 아닌 응답도 `null`이다.** 이 조회가 생성을 멈추지 않는다.
 */
async function getSystemInformation(client: AdtClient): Promise<SystemInformation | null> {
  try {
    const response = await client.request({
      method: 'GET',
      path: SYSTEMINFO_PATH,
      // Eclipse가 쓰던 캐시 무력화 인자(`systemInfo.js:22-25`).
      params: { _: String(Date.now()) },
      accept: SYSTEMINFO_ACCEPT,
      timeout: 'default',
    });
    const parsed = JSON.parse(response.body) as unknown;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      return {
        systemID: typeof record.systemID === 'string' ? record.systemID : undefined,
        userName: typeof record.userName === 'string' ? record.userName : undefined,
      };
    }
    return null;
  } catch {
    // 엔드포인트가 없거나(온프렘) 오류거나 JSON이 아니다 — 구도 null이다.
    return null;
  }
}

/** `dist/core/class/create.js:44-64`의 문자열. 빈 줄 배치까지 그대로다. */
export function buildBehaviorImplementationPayload(input: {
  readonly className: string;
  readonly packageName: string;
  readonly description: string;
  readonly masterSystem: string;
  readonly responsible: string;
}): string {
  const ownerAttrs =
    (input.masterSystem ? ` adtcore:masterSystem="${input.masterSystem}"` : '') +
    (input.responsible ? ` adtcore:responsible="${input.responsible}"` : '');
  const header =
    `<?xml version="1.0" encoding="UTF-8"?><class:abapClass ` +
    `xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${input.description}" adtcore:language="${PAYLOAD_LANGUAGE}" ` +
    `adtcore:name="${input.className}" adtcore:type="CLAS/OC" ` +
    `adtcore:masterLanguage="${PAYLOAD_LANGUAGE}"${ownerAttrs} ` +
    `class:final="false" class:visibility="public">`;

  return [
    header,
    `  <adtcore:packageRef adtcore:name="${input.packageName}"/>`,
    // 템플릿 자리 — `template_xml`을 넘기는 통로가 없으므로 기본 `'\n\n'`이다.
    '  \n\n',
    '  <class:include adtcore:name="CLAS/OC" adtcore:type="CLAS/OC" class:includeType="testclasses"/>',
    '  <class:superClassRef/>',
    '</class:abapClass>',
  ].join('\n\n\n\n');
}

export const createBehaviorImplementation = defineTool(
  {
    name: 'CreateBehaviorImplementation',
    description:
      'Create a new ABAP behavior implementation class for a behavior definition. Creates the object in initial state. Use UpdateBehaviorImplementation to set implementation code afterwards.',
    inputSchema: {
      class_name: z
        .string()
        .describe(
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations).',
        ),
      behavior_definition: z
        .string()
        .describe(
          'Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist.',
        ),
      description: z
        .string()
        .describe('Class description. If not provided, class_name will be used.')
        .optional(),
      package_name: z
        .string()
        .describe('Package name (e.g., ZOK_LOCAL, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name', 'behavior_definition'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    // 구는 세 인자를 따로 거른다 — 문구도 따로다(`:77-85`).
    if (!args.class_name) return errorResult('Error: class_name is required');
    if (!args.behavior_definition) return errorResult('Error: behavior_definition is required');
    if (!args.package_name) return errorResult('Error: package_name is required');

    // `validateTransportRequest`는 구에서 본문이 빈 함수라 옮길 것이 없다.

    const className = args.class_name.toUpperCase();
    const behaviorDefinition = args.behavior_definition.toUpperCase();
    // 패키지 이름도 대문자로 올린다 — BDEF 쪽은 그대로 두는데 여기만 다르다(`:113`).
    const packageName = args.package_name.toUpperCase();

    logger.info(
      `Starting behavior implementation creation: ${className} for ${behaviorDefinition}`,
    );

    try {
      const client = await context.getConnection();
      const systemInfo = await getSystemInformation(client);

      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/oo/classes',
        params: { corrNr: args.transport_request },
        body: buildBehaviorImplementationPayload({
          className,
          packageName,
          description: limitDescription(args.description || className),
          masterSystem: systemInfo?.systemID ?? '',
          responsible: systemInfo?.userName ?? '',
        }),
        contentType: CT_CLASS,
        accept: CT_CLASS,
      });

      logger.info(`CreateBehaviorImplementation completed successfully: ${className}`);
      return okResult({
        success: true,
        class_name: className,
        behavior_definition: behaviorDefinition,
        package_name: packageName,
        transport_request: args.transport_request || null,
        type: 'CLAS/OC',
        message: `Behavior Implementation ${className} created successfully. Use UpdateBehaviorImplementation to set implementation code.`,
        uri: bimpObjectUri(className),
        steps_completed: ['create'],
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error creating behavior implementation ${className}: ${message}`);

      // 구가 먼저 보는 갈래(`:156-166`) — 문구도 그대로다.
      const status = error instanceof AdtError ? error.status : undefined;
      if (message.includes('already exists') || status === 409) {
        return errorResult(
          `Error: Behavior Implementation ${className} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(`Error: Failed to create behavior implementation: ${message}`);
    }
  },
);
