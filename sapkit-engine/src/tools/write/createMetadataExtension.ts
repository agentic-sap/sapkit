/**
 * `CreateMetadataExtension` — 메타데이터 확장(DDLX) 껍데기를 만들고 활성화한다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `CreateMetadataExtension` · 구 소스
 * `engine/src/handlers/ddlx/high/handleCreateMetadataExtension.ts:14-45`).
 * 몸통의 대조 원본은 같은 파일 `:55-168`. 와이어 근거는
 * `./internal/metadataExtension` 머리주석에 파일·줄로 모아 두었다.
 *
 * ## 사슬 — 구가 실제로 보내는 다섯 요청
 *
 * ```
 * ① GET  /sap/bc/adt/core/http/systeminformation        (로그온 언어)
 * ② POST /sap/bc/adt/ddic/ddlx/sources[?corrNr=…]       (껍데기 생성)
 * ③ POST /sap/bc/adt/ddic/ddlx/sources/{소문자}?_action=LOCK&accessMode=MODIFY
 * ④ POST /sap/bc/adt/checkruns?reporters=abapCheckRun   (인액티브 판 검사)
 * ⑤ POST /sap/bc/adt/ddic/ddlx/sources/{소문자}?_action=UNLOCK&lockHandle=…
 * ⑥ POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ```
 *
 * **이름 검증 왕복이 없다.** 벤더 `AdtMetadataExtension.validate()`가 있는데도 구
 * 핸들러는 그것을 부르지 않고 곧장 `create()`로 간다(`:88-94`). 서비스 정의·데이터
 * 엘리먼트가 검증부터 시작하는 것과 갈리는 자리이며, 여기서 검증을 새로 더하면
 * 그것이 구와의 차이가 된다.
 *
 * **소스를 올리지 않는다.** 발행 스키마에 `source_code`가 아예 없고, 사슬에도 PUT이
 * 없다. 소스를 넣는 통로는 `UpdateMetadataExtension`뿐이다.
 *
 * ## 전송요청이 페이로드의 **모양을 바꾼다** (실측)
 *
 * `create.js:49-58`은 `transportRequest`가 있으면 `packageRef`를 여는 태그로
 * 펼쳐 `abapLanguageVersion` 속성 블록과 `<adtcore:transportInfo><adtcore:localObject/>`
 * 를 함께 싣고, 없으면 자기 닫음 `<adtcore:packageRef …/>` 한 줄만 싣는다. 두
 * 갈래의 XML이 통째로 다르므로 접으면 안 된다. 구 핸들러가 넘기는 값은
 * `args.transport_request || ''`라 **전송요청이 없으면 빈 문자열**이고, 빈 문자열은
 * 거짓이므로 `corrNr`도 붙지 않는다.
 *
 * ## 패키지 이름을 대문자로 올리지 않는다 (실측)
 *
 * 구 핸들러는 `packageName: args.package_name`을 그대로 넘기고 벤더도 손대지
 * 않는다. 서비스 정의 쪽이 `.toUpperCase()`를 거는 것과 갈린다.
 *
 * ## 활성화 거짓 성공을 고친다 (차이 — `harness/DIVERGENCES.md` D103)
 *
 * 구는 활성화 응답을 아무도 읽지 않아 활성화되지 않은 DDLX가 "created and
 * activated successfully"로 보고된다. `E`/`A`/`X` 메시지를 실패로 되돌린다.
 *
 * ## 해제를 한 번만 보낸다 (차이 — `harness/DIVERGENCES.md` D104)
 *
 * 구는 `try` 안에서 해제한 뒤 활성화까지 하고, 활성화가 실패하면 `catch`가
 * **이미 풀린 핸들로 UNLOCK을 한 번 더** 보낸다(`:110-139`). 그 요청은 아무것도
 * 되돌리지 않고 거절당하며 구 스스로 그 실패를 삼킨다.
 *
 * ## 전송요청 검증은 구에서도 아무 일도 하지 않는다
 *
 * `validateTransportRequest`는 본문이 빈 no-op이다(`engine/src/utils/transportValidation.ts`).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  isAlreadyCheckedMessage,
  messageOf,
  resolveMasterLanguage,
  systemContextOf,
} from './dataElementDomainCreate';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activationErrors,
  assertNoCheckErrors,
  errorResult,
  limitDescription,
  okResult,
  parseActivationMessages,
} from './shared';
import {
  CT_METADATA_EXTENSION,
  DDLX_ROOT,
  checkStagedMetadataExtension,
  metadataExtensionCheckUri,
  metadataExtensionWriteUri,
  returnErrorText,
} from './internal/metadataExtension';

/**
 * 껍데기 생성 페이로드 — 벤더 `create.js:41-60`의 XML을 그대로 되짓는다.
 * 여백까지 그대로다: 루트 여는 태그 뒤 `\n    `, 닫는 태그 앞 `\n  \n`.
 */
export function buildMetadataExtensionPayload(args: {
  readonly name: string;
  readonly packageName: string;
  readonly description: string;
  readonly masterLanguage: string;
  readonly masterSystem: string;
  readonly responsible: string;
  readonly transportRequest?: string;
}): string {
  const masterSystemAttr = args.masterSystem
    ? ` adtcore:masterSystem="${args.masterSystem}"`
    : '';
  // 서비스 정의와 달리 **값이 있을 때만** 붙는다(`create.js:45-47`).
  const responsibleAttr = args.responsible
    ? ` adtcore:responsible="${args.responsible}"`
    : '';
  const packageBlock = args.transportRequest
    ? `<adtcore:packageRef adtcore:name="${args.packageName}">\n` +
      `    <adtcore:properties>\n` +
      `      <adtcore:property adtcore:name="abapLanguageVersion" adtcore:value=""/>\n` +
      `    </adtcore:properties>\n` +
      `  </adtcore:packageRef>\n` +
      `  <adtcore:transportInfo>\n` +
      `    <adtcore:localObject/>\n` +
      `  </adtcore:transportInfo>`
    : `<adtcore:packageRef adtcore:name="${args.packageName}"/>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?><ddlxsources:ddlxSource ` +
    `xmlns:ddlxsources="http://www.sap.com/adt/ddic/ddlxsources" ` +
    `xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${args.description}" ` +
    `adtcore:language="${args.masterLanguage}" ` +
    `adtcore:name="${args.name}" ` +
    `adtcore:type="DDLX/EX" ` +
    `adtcore:masterLanguage="${args.masterLanguage}"${masterSystemAttr}${responsibleAttr}>\n` +
    `    ${packageBlock}\n  \n</ddlxsources:ddlxSource>`
  );
}

export const createMetadataExtension = defineTool(
  {
    name: 'CreateMetadataExtension',
    description:
      'Create a new ABAP Metadata Extension (DDLX) in SAP system. Defines Fiori UI annotations, field labels, search help, and list/object page layout for CDS views.',
    inputSchema: {
      name: z.string().describe('Metadata Extension name'),
      description: z.string().describe('Description').optional(),
      package_name: z.string().describe('Package name'),
      transport_request: z.string().describe('Transport request number').optional(),
      activate: z.boolean().describe('Activate after creation. Default: true').optional(),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/ddlx/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.name || !args.package_name) {
      return errorResult('Error: Missing required parameters');
    }

    const name = args.name.toUpperCase();
    const uri = metadataExtensionWriteUri(name);
    const shouldActivate = args.activate !== false;
    // 구는 빈 전송요청을 `''`로 넘기고, 빈 문자열은 두 갈래 판정에서 거짓이다.
    const transportRequest = args.transport_request || '';

    logger.info(`Starting DDLX creation: ${name}`);

    try {
      const client = await context.getConnection();

      // ① 로그온 언어
      const masterLanguage = await resolveMasterLanguage(client);
      const { masterSystem, responsible } = systemContextOf(context);

      // ② 껍데기 생성. 이름 검증 왕복은 없다(머리주석 참조).
      await client.request({
        method: 'POST',
        path: DDLX_ROOT,
        params: { corrNr: transportRequest || undefined },
        body: buildMetadataExtensionPayload({
          name,
          packageName: args.package_name,
          description: limitDescription(args.description || name),
          masterLanguage,
          masterSystem,
          responsible,
          transportRequest,
        }),
        contentType: CT_METADATA_EXTENSION,
        accept: CT_METADATA_EXTENSION,
      });
      logger.debug(`DDLX created: ${name}`);

      // ③~⑤ 잠금 → 검사 → 해제. `withLock`이 이 창을 stateful로 묶는다.
      await client.withLock(uri, async () => {
        let check;
        try {
          check = await checkStagedMetadataExtension(client, metadataExtensionCheckUri(name));
        } catch (error) {
          if (!isAlreadyCheckedMessage(messageOf(error))) throw error;
          logger.debug(`${name} was already checked - continuing`);
          check = undefined;
        }
        if (check) assertNoCheckErrors(check, 'Metadata Extension', name);
      });

      // ⑥ 활성화. D103 — 구는 이 응답을 읽지 않았다.
      if (shouldActivate) {
        const activation = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: 'true' },
          body:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
            `  <adtcore:objectReference adtcore:uri="${uri}" adtcore:name="${name}"/>\n` +
            `</adtcore:objectReferences>`,
          contentType: CT_ACTIVATION,
          accept: 'application/xml',
        });

        const failures = activationErrors(parseActivationMessages(activation.body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: metadata extension ${name} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The DDLX shell is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        logger.info(`DDLX activated: ${name}`);
      }

      return okResult({
        success: true,
        name,
        // 구는 인자를 **그대로** 싣는다 — 대문자로 올리지 않는다.
        package_name: args.package_name,
        type: 'DDLX',
        message: shouldActivate
          ? `Metadata Extension ${name} created and activated successfully`
          : `Metadata Extension ${name} created successfully`,
      });
    } catch (error) {
      // 구문검사·활성화 실패는 진단을 그대로 실어 올린다(구 `:161-164`).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error creating DDLX ${name}: ${error.message}`);
        return errorResult(`Error: ${error.message}`);
      }
      const detail = returnErrorText(error);
      logger.error(`Error creating DDLX ${name}: ${detail}`);
      return errorResult(`Error: ${detail}`);
    }
  },
);
