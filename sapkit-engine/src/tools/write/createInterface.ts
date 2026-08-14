/**
 * CreateInterface — 새 ABAP 인터페이스의 **껍데기**를 만든다.
 *
 * 구 핸들러: `engine/src/handlers/interface/high/handleCreateInterface.ts`.
 * 소스는 이 도구가 넣지 않는다(`UpdateInterface`의 몫) — 발행 설명 자신이
 * 그렇게 약속한다.
 *
 * ## 와이어 근거 (읽기 전용 참조)
 *
 * `handleCreateInterface.ts:99-105`의 `client.getInterface().create(...)`
 * → `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/interface/AdtInterface.js:61-113`
 * → `core/interface/create.js:31-94`. 거기서 확인한 것:
 *
 *  - `POST /sap/bc/adt/oo/interfaces` — 전송요청이 있으면 `?corrNr=<번호>`
 *    (`create.js:57`). 없으면 질의 인자 자체가 붙지 않는다.
 *  - `Content-Type` = `Accept` = `CT_INTERFACE`
 *    (`create.js:58-61` → `constants/contentTypes.js`의
 *    `application/vnd.sap.adt.oo.interfaces.v5+xml`). 읽기의 `ACCEPT_INTERFACE`
 *    (다섯 벌 나열)와 **다른 값**이다.
 *  - 본문은 `intf:abapInterface` 한 장(`create.js:48-56`). 빈 줄까지 그대로
 *    옮겼다 — 구가 실제로 보내던 바이트다.
 *  - 설명은 60자에서 잘린다(`create.js:35` → `utils/internalUtils.js:28-30`).
 *  - **`create()`는 세션을 stateful로 올리지 않는다.** 파일 머리의 주석은
 *    "호출자가 올려야 한다"고 적었지만 구 핸들러는 올리지 않으므로
 *    (`handleCreateInterface.ts:89-105`) 이 POST는 stateless로 나간다.
 *  - 2xx라도 201/200이 아니면 오류다(`create.js:71-78`).
 *
 * 로그온 언어는 SAP에 물어서 채운다(`handleCreateInterface.ts:96` →
 * `engine/src/lib/adtLogonLanguage.ts`). EN을 박아 넣으면 로그온 언어가 EN이
 * 아닌 시스템에서 설명이 빈 채로 되읽힌다.
 *
 * ## 생성 후 구문검사가 **치명적이지 않은** 이유 (구 실측)
 *
 * 구는 검사 실패를 `logger.warn`으로 삼키고 성공으로 답한다
 * (`handleCreateInterface.ts:127-139`). 겉보기에는 `isPreCheckFailure`면
 * 오류로 올리는 갈래가 있지만, 그 플래그는 `assertNoCheckErrors`만 세우고
 * (`preCheckBeforeActivation.ts:877-881`) 그 앞의 벤더 `checkInterface`가
 * **오류를 먼저 던지므로**(`core/interface/check.js:11-18`) 거기까지 가지
 * 않는다. 즉 구가 실제로 하던 일은 "검사가 실패하면 `steps_completed`에
 * `check`를 적지 않고 넘어간다"이고, 여기서도 그대로다. 오브젝트는 이미
 * 만들어져 있으므로 실패로 되돌릴 대상도 없다.
 *
 * ## 구와 다른 것
 *
 * - 페이로드에 `adtcore:masterSystem`·`adtcore:responsible`을 싣지 않는다
 *   (구는 `SAP_RESPONSIBLE`/`SAP_USERNAME`에서 채워 넣었다). 차이 장부 **D71**.
 * - `validateTransportRequest`(`engine/src/utils/transportValidation.ts`)는 구에서
 *   **본문이 빈 함수**라 옮길 것이 없다. 전송요청 필요 여부는 SAP이 판정한다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { interfaceObjectUri, interfaceStoredCheckUri } from './interfaceUri';
import {
  type CheckMessage,
  assertNoCheckErrors,
  checkStored,
  describeFailure,
  errorResult,
  limitDescription,
  okResult,
} from './shared';

/** 생성 요청의 Content-Type·Accept — 구 `CT_INTERFACE` 글자 그대로. */
const CT_INTERFACE = 'application/vnd.sap.adt.oo.interfaces.v5+xml';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
const DEFAULT_MASTER_LANGUAGE = 'EN';

/**
 * 접속된 시스템의 로그온/마스터 언어. 조회가 안 되면 `EN`으로 떨어진다 —
 * 이 조회 실패가 생성 실패가 되어서는 안 된다(구 `resolveLogonLanguage`와 같은
 * 계약, `engine/src/lib/adtLogonLanguage.ts:52-80`).
 */
async function resolveMasterLanguage(client: AdtClient): Promise<string> {
  try {
    const response = await client.request({
      method: 'GET',
      path: SYSTEMINFO_PATH,
      accept: SYSTEMINFO_ACCEPT,
    });
    const parsed = JSON.parse(response.body) as { language?: unknown };
    const language = typeof parsed.language === 'string' ? parsed.language.trim().toUpperCase() : '';
    // ADT 언어 코드는 1~3자다. 모양이 다르면 쓰지 않는다.
    if (/^[A-Z]{1,3}$/.test(language)) return language;
  } catch {
    // 조회 불가 — 기본값으로.
  }
  return DEFAULT_MASTER_LANGUAGE;
}

/** 구 `create.js:48-56`의 본문. 빈 줄 배치까지 그대로다. */
export function buildInterfacePayload(
  interfaceName: string,
  description: string,
  packageName: string,
  masterLanguage: string,
): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><intf:abapInterface ` +
    `xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${description}" adtcore:language="${masterLanguage}" ` +
    `adtcore:name="${interfaceName}" adtcore:type="INTF/OI" ` +
    `adtcore:masterLanguage="${masterLanguage}">\n\n\n\n` +
    `  <adtcore:packageRef adtcore:name="${packageName}"/>\n\n\n\n` +
    `</intf:abapInterface>`
  );
}

export const createInterface = defineTool(
  {
    name: 'CreateInterface',
    description:
      'Create a new ABAP interface in SAP system. Creates the interface object in initial state. Use UpdateInterface to set source code afterwards.',
    inputSchema: {
      interface_name: z
        .string()
        .describe(
          'Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y).',
        ),
      description: z
        .string()
        .describe('Interface description. If not provided, interface_name will be used.')
        .optional(),
      package_name: z.string().describe('Package name (e.g., ZOK_LAB, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['interface_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    // 구는 두 인자를 따로 거른다 — 문구도 따로다.
    if (!args.interface_name) return errorResult('Error: interface_name is required');
    if (!args.package_name) return errorResult('Error: package_name is required');

    const interfaceName = args.interface_name.toUpperCase();
    const packageName = args.package_name;
    const transportRequest = args.transport_request || '';
    const description = limitDescription(args.description || interfaceName);

    logger.info(`Starting interface creation: ${interfaceName}`);

    try {
      const client = await context.getConnection();
      const masterLanguage = await resolveMasterLanguage(client);

      const response = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/oo/interfaces',
        params: { corrNr: transportRequest === '' ? undefined : transportRequest },
        body: buildInterfacePayload(interfaceName, description, packageName, masterLanguage),
        contentType: CT_INTERFACE,
        accept: CT_INTERFACE,
      });
      // 접속 계층이 4xx/5xx를 이미 던지므로 여기 남는 것은 2xx뿐이다. 구는
      // 그중에서도 201/200만 성공으로 본다(`create.js:71-78`).
      if (response.status !== 201 && response.status !== 200) {
        throw new Error(
          `Interface creation returned status ${response.status} instead of 201`,
        );
      }
      logger.info(`Interface created: ${interfaceName}`);

      // 껍데기에 대한 사후 확인. 실패해도 오브젝트는 이미 만들어졌으므로
      // 치명적이지 않다 — 머리주석의 「생성 후 구문검사」 절 참조.
      const stepsCompleted = ['create'];
      let checkWarnings: CheckMessage[] = [];
      try {
        const check = await checkStored(
          client,
          interfaceStoredCheckUri(interfaceName),
          'inactive',
        );
        assertNoCheckErrors(check, 'Interface', interfaceName);
        checkWarnings = [...check.warnings];
        stepsCompleted.push('check');
      } catch (checkError) {
        logger.warn(
          `Post-create check had issues for ${interfaceName}: ${describeFailure(checkError)}`,
        );
      }

      return okResult({
        success: true,
        interface_name: interfaceName,
        package_name: packageName,
        transport_request: transportRequest || null,
        type: 'INTF/OI',
        message: `Interface ${interfaceName} created successfully. Use UpdateInterface to set source code.`,
        uri: interfaceObjectUri(interfaceName),
        steps_completed: stepsCompleted,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Interface creation failed: ${message}`);
      // 구는 이 자리에서 `return_error(error)`만 한다 — 별도 문장을 앞에 두지
      // 않는다. `Error: ` 접두사는 그 함수의 계약이다(`engine/src/lib/utils.ts:421-429`).
      return errorResult(`Error: ${message}`);
    }
  },
);
