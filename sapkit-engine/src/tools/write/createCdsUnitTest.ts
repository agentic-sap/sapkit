/**
 * CreateCdsUnitTest — CDS 단위시험용 전역 시험 클래스를 만든다(고 **선언된**) 도구.
 *
 * ## 실측 결론 먼저 — 이 도구는 구 엔진에서 **SAP에 한 바이트도 보내지 못한다**
 *
 * 구 핸들러(`engine/src/handlers/unit_test/high/handleCreateCdsUnitTest.ts:98-107`)는
 * 벤더에게 이렇게 넘긴다:
 *
 * ```
 *   cdsUnitTest.create({ className, packageName, cdsViewName,
 *                        classTemplate: class_template || '',
 *                        testClassSource: test_class_source || '', … })
 * ```
 *
 * 그런데 `class_template`·`test_class_source`는 **발행 스키마에 없다** — 채록본
 * (`harness/old-surface/m1-tools.json`의 `tools.CreateCdsUnitTest`)의 `properties`는
 * `class_name`·`package_name`·`cds_view_name`·`description`·`transport_request`
 * 다섯뿐이고, 구 서버도 그 스키마를 zod로 되돌려 등록했다
 * (`engine/src/server/BaseMcpServer.ts:469-503`). zod 객체는 모르는 키를 **버리므로**
 * 호출자가 몰래 실어 보낼 통로도 없다. 즉 두 값은 **언제나 빈 문자열**이다.
 *
 * 벤더 `AdtCdsUnitTest.create()`의 첫 갈림은
 * `if (config.className && config.classTemplate && config.testClassSource)`
 * 이다(`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/unitTest/AdtCdsUnitTest.js:82-84`).
 * 빈 문자열은 거짓이라 **시험 클래스 생성 가지에 영영 들어가지 못하고**, 아래의
 * 시험 실행 가지로 떨어진다(`:129-133`):
 *
 * ```
 *   if (!config.tests || config.tests.length === 0)
 *       throw new Error('At least one test definition is required for test run');
 * ```
 *
 * `tests`도 이 도구의 인자가 아니므로 **언제나 던진다.** 겉 핸들러의 catch가 그
 * 문구를 `return_error`로 접어 돌려준다(`:138-143`).
 *
 * 그래서 이 도구의 관찰 가능한 계약은 딱 둘이다:
 *   ⑴ 필수 인자 셋 중 하나라도 비면 `Missing required parameters: …`
 *   ⑵ 그 밖에는 **언제나** `At least one test definition is required for test run`
 * 그리고 **어느 쪽에서도 SAP 요청이 나가지 않는다.**
 *
 * 여기서 "고쳐서" 진짜 생성 사슬을 지으면 이름·인자는 같은데 **와이어가 통째로
 * 새로 생긴다** — 이 판의 하드 게이트(응답 형태 불변)와 정면으로 어긋나고, 근거로
 * 삼을 실측도 없다. 그래서 구를 글자 그대로 되살리고, 사연을 여기에 남긴다.
 * 요구 급이 `attended 실기`인 것도 이 자리를 사람이 한 번 봐야 하기 때문이다.
 *
 * ## 왜 `write/`에 사는가
 *
 * 성격이 「쓰기」다 — 선언대로라면 전역 클래스를 만든다. 지금 와이어가 비어 있는
 * 것은 구의 결함이지 성격이 아니다. 짝인 `UpdateCdsUnitTest`가 실제로 클래스
 * 인클루드를 갈아 끼우므로 둘을 같은 자리에 둔다.
 *
 * ## `targetNames`
 *
 * `class_name` 하나다. `cds_view_name`은 **만들 물건이 아니라 시험 대상**이며
 * 표준 CDS 뷰(`I_…`)일 수 있다 — 함께 선언하면 정상적인 녹화가 사전 검사에
 * 통째로 막힌다. `RunUnitTest`가 `test_class`를 뺀 것과 같은 판단이다
 * (`../runtime/runUnitTest.ts` 머리주석).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { errorResult } from './shared';

/**
 * 벤더 `AdtCdsUnitTest.create()`가 던지는 문구 그대로
 * (`.../dist/core/unitTest/AdtCdsUnitTest.js:132`). 겉 핸들러가 `return_error`로
 * 접으므로 `Error: ` 접두사가 붙는다(`engine/src/lib/utils.ts:431-437`).
 */
export const CDS_UNIT_TEST_CREATE_UNREACHABLE =
  'At least one test definition is required for test run';

export const createCdsUnitTest = defineTool(
  {
    name: 'CreateCdsUnitTest',
    description:
      'Create a CDS unit test class with CDS validation. Creates the test class in initial state.',
    inputSchema: {
      class_name: z.string().describe('Global test class name (e.g., ZCL_CDS_TEST).'),
      package_name: z.string().describe('Package name (e.g., ZOK_TEST_PKG_01, $TMP).'),
      cds_view_name: z.string().describe('CDS view name to validate for unit test doubles.'),
      description: z
        .string()
        .describe('Optional description for the global test class.')
        .optional(),
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

    if (!args.class_name || !args.package_name || !args.cds_view_name) {
      return errorResult(
        'Error: Missing required parameters: class_name, package_name, cds_view_name',
      );
    }

    const className = args.class_name.toUpperCase();
    const cdsViewName = args.cds_view_name.toUpperCase();

    // 구 `createAdtClient(connection, logger)`의 자리. 접속 객체를 얻는 것 자체는
    // SAP에 나가는 요청이 아니다(`src/adt/client.ts`의 생성자는 I/O를 하지 않는다).
    // 무프로파일 기동에서 여기서 던지는 것도 구와 같다 — 구도 관리 접속 없이는
    // 이 지점을 지나지 못했다.
    await context.getConnection();

    logger.info(`Creating CDS unit test class ${className} for CDS view ${cdsViewName}`);

    // 머리주석의 실측 — 벤더의 생성 가지에 닿을 수 없다.
    logger.error(
      `Error creating CDS unit test class ${className}: ${CDS_UNIT_TEST_CREATE_UNREACHABLE}`,
    );
    return errorResult(`Error: ${CDS_UNIT_TEST_CREATE_UNREACHABLE}`);
  },
);
