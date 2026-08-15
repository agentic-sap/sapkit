/**
 * CreateClass — 새 ABAP 클래스의 **껍데기**를 만든다. 소스는 넣지 않는다
 * (`UpdateClass`의 몫이고, 발행 설명이 그렇게 말한다).
 *
 * ## 와이어 근거 (겉 핸들러 → 안쪽 패키지)
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleCreateClass.ts:76-285`가
 * `AdtClass.create()`를 부른다. 그 안
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtClass.js:117-172`)
 * 에서 **실제로 나가는 요청은 POST 하나뿐이다** — 핸들러 주석은
 * "validate → create → check → lock → …"라고 적고 있지만 `create()`의 본문은
 * 세션을 stateful로 돌리고 `create.js`를 한 번 부른 뒤 stateless로 되돌릴
 * 뿐이다. 그래서 `VALIDATION_FAILED` 분기와 "이미 있으면 already_exists로
 * 답한다"는 갈래는 이 통로에서 발동하지 않는다. **주석이 아니라 본문이 계약이다.**
 *
 * 생성 요청(`dist/core/class/create.js:17-100`):
 *
 * ```
 * POST /sap/bc/adt/oo/classes[?corrNr=<TR>]
 * Content-Type: application/vnd.sap.adt.oo.classes.v4+xml   (constants/contentTypes.js:64 CT_CLASS)
 * Accept:       application/vnd.sap.adt.oo.classes.v4+xml
 * ```
 *
 * 엔진은 `contentTypes` 옵션을 넘기지 않으므로(`engine/src/lib/clients.ts:30-31`)
 * 위 기본값이 그대로 나간다.
 *
 * 그 뒤 생성 후 구문검사(`handleCreateClass.ts:230-252`) →
 * `engine/src/lib/preCheckBeforeActivation.ts:202-219`(kind `class`, 소스 없음)
 * → 벤더 `checkClass` → `dist/utils/checkRun.js:247-264` `runCheckRun` =
 * `POST /sap/bc/adt/checkruns?reporters=abapCheckRun`. 그 요청의 오브젝트 URI는
 * `dist/utils/checkRun.js:19-23` `getObjectUri` = `encodeURIComponent(이름을
 * 먼저 소문자로)`이므로 `internal/adt.ts`의 `checkUriName` 규칙 쪽이다.
 *
 * ## 마스터 언어를 EN으로 박지 않는다
 *
 * 벤더 페이로드는 `EN`을 하드코딩하지만, 엔진이 `master_language`를 주입해
 * 덮어쓴다(`create.js:43` · `handleCreateClass.ts:101`). 로그온 언어가 EN이 아닌
 * 시스템에서 EN 고정 페이로드는 설명이 빈 채로 되읽히거나 생성이 400으로
 * 막힌다. 조회가 안 되면 `EN`으로 떨어지되 **생성을 멈추지는 않는다.**
 *
 * ## 구를 그대로 둔 자리 둘 (개선하지 않았다)
 *
 *  - **`abstract` 인자는 받기만 하고 페이로드에 나가지 않는다.** 벤더
 *    `create.js:44-64`가 조립하는 속성은 `class:final`과 `class:visibility`
 *    둘뿐이고 abstract 자리가 아예 없다. 고치려면 올바른 ADT 속성 이름을
 *    실측해야 하는데 이 판은 SAP에 붙지 않는다 — **와이어를 추측하지 않는다**는
 *    규칙이 이겨서 재현했다. 발행 스키마의 설명은 채록본 글자 그대로라
 *    "Mark class as abstract"라고 말하지만 실제로는 아무 일도 하지 않는다.
 *  - **생성 후 구문검사가 오류를 내도 생성 성공은 성공이다.** 벤더 `checkClass`
 *    (`dist/core/class/check.js:73-76`)가 오류에서 던지고, 핸들러는 그 예외에
 *    `isPreCheckFailure`가 없으므로 경고만 남기고 계속한다
 *    (`handleCreateClass.ts:240-252`). 오브젝트는 실제로 만들어졌으므로 이
 *    갈래는 거짓 성공이 아니다 — 만들어진 것을 안 만들어졌다고 말하는 쪽이
 *    오히려 거짓이다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  type CheckMessage,
  checkStored,
  describeFailure,
  encodeObjectName,
  errorResult,
  limitDescription,
  okResult,
} from './shared';

/** 구 `CT_CLASS` (`dist/constants/contentTypes.js:64`). Accept도 같은 값이다. */
const CT_CLASS = 'application/vnd.sap.adt.oo.classes.v4+xml';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
const DEFAULT_MASTER_LANGUAGE = 'EN';

/**
 * 접속된 시스템의 로그온/마스터 언어. 조회가 안 되면 `EN`으로 떨어진다.
 *
 * `createProgram.ts`에 같은 모양의 헬퍼가 있지만 합치지 않았다 — 그쪽은 M1에서
 * 이미 지어져 도는 파일이고, 이 묶음의 작업이 그 파일을 건드릴 이유가 없다.
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
    // ADT 언어 코드는 1~3자다. 모양이 다르면 페이로드에 넣지 않는다.
    if (/^[A-Z]{1,3}$/.test(language)) return language;
  } catch {
    // 조회 불가 — 기본값으로. 이 실패가 생성 실패가 되어서는 안 된다.
  }
  return DEFAULT_MASTER_LANGUAGE;
}

/** 구 `getSystemContext()`가 채우던 두 값의 자리(`engine/src/lib/systemContext.ts:63-65`). */
function ownerAttributes(env: ToolContext['env']): string {
  const masterSystem = env['SAP_MASTER_SYSTEM'] ?? '';
  const responsible = env['SAP_RESPONSIBLE'] ?? env['SAP_USERNAME'] ?? '';
  return (
    (masterSystem ? ` adtcore:masterSystem="${masterSystem}"` : '') +
    (responsible ? ` adtcore:responsible="${responsible}"` : '')
  );
}

/**
 * 생성 페이로드 — `dist/core/class/create.js:44-64`의 문자열을 **줄바꿈까지**
 * 그대로 옮긴 것이다. 사이의 빈 줄들은 의미가 없어 보이지만 채록 대조의
 * 대상이므로 손대지 않는다.
 *
 * `template_xml` 갈래는 없다. 그 인자를 넘기는 통로가 `CreateClass`의 발행
 * 스키마에 없으므로(`handleCreateClass.ts:110-126`이 넘기지 않는다) 벤더의
 * 기본값 — 네임스페이스 없음 · 템플릿 자리에 빈 두 줄 — 만 나간다.
 */
function buildCreatePayload(input: {
  readonly className: string;
  readonly packageName: string;
  readonly description: string;
  readonly masterLanguage: string;
  readonly superclass?: string;
  readonly final: boolean;
  readonly createProtected: boolean;
  readonly ownerAttrs: string;
}): string {
  const superClassXml = input.superclass
    ? `<class:superClassRef adtcore:name="${input.superclass}"/>`
    : '<class:superClassRef/>';
  const header =
    `<?xml version="1.0" encoding="UTF-8"?><class:abapClass ` +
    `xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${input.description}" adtcore:language="${input.masterLanguage}" ` +
    `adtcore:name="${input.className}" adtcore:type="CLAS/OC" ` +
    `adtcore:masterLanguage="${input.masterLanguage}"${input.ownerAttrs} ` +
    `class:final="${input.final ? 'true' : 'false'}" ` +
    `class:visibility="${input.createProtected ? 'protected' : 'public'}">`;

  return [
    header,
    `  <adtcore:packageRef adtcore:name="${input.packageName}"/>`,
    // 템플릿 자리 — 벤더의 기본 `templateSection`은 `'\n\n'`이라 들여쓰기 두 칸
    // 뒤에 빈 줄 둘이 남는다(`create.js:36-37`·`:52`).
    '  \n\n',
    '  <class:include adtcore:name="CLAS/OC" adtcore:type="CLAS/OC" class:includeType="testclasses"/>',
    `  ${superClassXml}`,
    '</class:abapClass>',
  ].join('\n\n\n\n');
}

export const createClass = defineTool(
  {
    name: 'CreateClass',
    description:
      'Create a new ABAP class in SAP system. Creates the class object in initial state. Use UpdateClass to set source code afterwards.',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_TEST_CLASS_001).'),
      description: z.string().describe('Class description (defaults to class_name).').optional(),
      package_name: z.string().describe('Package name (e.g., ZOK_LAB, $TMP).'),
      transport_request: z
        .string()
        .describe('Transport request number (required for transportable packages).')
        .optional(),
      superclass: z.string().describe('Optional superclass name.').optional(),
      final: z.boolean().describe('Mark class as final. Default: false').optional(),
      abstract: z.boolean().describe('Mark class as abstract. Default: false').optional(),
      create_protected: z.boolean().describe('Protected constructor. Default: false').optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.class_name || !args.package_name) {
      return errorResult('Missing required parameters: class_name and package_name');
    }

    const className = args.class_name.toUpperCase();
    const packageName = args.package_name;
    logger.info(`Starting class creation: ${className}`);

    try {
      const client = await context.getConnection();
      const masterLanguage = await resolveMasterLanguage(client);

      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/oo/classes',
        params: { corrNr: args.transport_request },
        body: buildCreatePayload({
          className,
          packageName,
          description: limitDescription(args.description || className),
          masterLanguage,
          superclass: args.superclass,
          final: args.final === true,
          createProtected: args.create_protected === true,
          ownerAttrs: ownerAttributes(context.env),
        }),
        contentType: CT_CLASS,
        accept: CT_CLASS,
      });
      logger.info(`CreateClass completed successfully: ${className}`);

      // 생성 후 확인. 구는 이 검사의 실패를 생성 실패로 접지 않았다 — 머리주석의
      // 「구를 그대로 둔 자리 둘」 참조.
      let checkWarnings: CheckMessage[] = [];
      try {
        const check = await checkStored(
          client,
          `/sap/bc/adt/oo/classes/${encodeObjectName(className.toLowerCase())}`,
          'inactive',
        );
        if (check.errors.length > 0) {
          throw new Error(`Class check failed: ${check.errors.map((e) => e.text).join('; ')}`);
        }
        checkWarnings = [...check.warnings];
      } catch (error) {
        logger.warn(`Post-create check had issues for ${className}: ${describeFailure(error)}`);
      }

      return okResult({
        success: true,
        data: {
          class_name: className,
          package_name: packageName,
          transport_request: args.transport_request || null,
          activated: false,
          errors: [],
        },
        class_name: className,
        package_name: packageName,
        transport_request: args.transport_request || null,
        activated: false,
        errors: [],
        message: `Class ${className} created successfully. Use UpdateClass to set source code.`,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Class creation failed: ${className} - ${message}`);
      return errorResult(message);
    }
  },
);
