/**
 * `CreateDomain` — 도메인 하나를 만들고(요청하면) 활성화한다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `CreateDomain` · 구 소스
 * `engine/src/handlers/domain/high/handleCreateDomain.ts:24-114`).
 *
 * ## 사슬 — 구가 실제로 보내는 요청
 *
 * ```
 * ① POST /sap/bc/adt/ddic/domains/validation?objtype=doma&objname=…&packagename=…&description=…
 * ② GET  /sap/bc/adt/core/http/systeminformation            (로그온 언어)
 * ③ POST /sap/bc/adt/ddic/domains[?corrNr=…]                (껍데기 생성)
 * ④ POST /sap/bc/adt/ddic/domains/{소문자}?_action=LOCK&accessMode=MODIFY
 * ⑤ GET  /sap/bc/adt/ddic/domains/{소문자}                  ┐ 읽기-수정-쓰기
 * ⑥ PUT  /sap/bc/adt/ddic/domains/{소문자}?lockHandle=…     ┘
 * ⑦ POST /sap/bc/adt/checkruns?reporters=abapCheckRun       (해제 **앞**)
 * ⑧ POST /sap/bc/adt/ddic/domains/{소문자}?_action=UNLOCK&lockHandle=…
 * ⑨ POST /sap/bc/adt/activation?method=activate&preauditRequested=true   (activate!==false)
 * ```
 *
 * **⑦이 해제 앞에 있는 것이 `CreateDataElement`와의 실측 차이다** — 그쪽은
 * 해제한 **뒤에** 검사한다(구 `handleCreateDataElement.ts:258-275` vs
 * `handleCreateDomain.ts:236-258`). 검사 실패를 무시하는 목록도 그쪽에만 있다.
 *
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/core/domain/`의
 * `validation.js:20-38` · `create.js:14-96` · `lock.js:52-78` ·
 * `update.js:78-106` · `check.js:23-70` · `unlock.js:14-23` ·
 * `activation.js:12-16` → `utils/activationUtils.js:116-133`.
 *
 * ## 지켜야 하는 두 자리
 *
 * 잠금부터 해제까지 stateful 유지, 그리고 생성 페이로드의 로그온 언어. 근거와
 * 계약 정본은 `./createDataElement`의 머리주석과 같다(구 엔진 자신의 시험 둘이
 * 두 도구를 한 가족으로 묶어 검사한다).
 *
 * ## 실측했지만 **고치지 않은** 것
 *
 * 도메인 활성화는 응답을 판정하지 않는다. 벤더 `domain/activation.js`가
 * `activateObjectInSession`의 응답을 그대로 돌려주고 구 핸들러도 보지 않으므로,
 * **SAP이 활성화를 거부해도 HTTP 200이면 성공으로 보고된다.** 데이터 엘리먼트
 * 쪽은 같은 자리에서 `chkl:properties`를 읽어 실패로 뒤집는다. 이 판은 구를
 * 그대로 짓는 것이 임무이므로 여기서 강화하지 않았다 — 요구 급이 `attended 실기`인
 * 이유이기도 하다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_DOMAIN,
  ACCEPT_VALIDATION,
  CT_ACTIVATION,
  CT_DOMAIN,
  CT_DOMAIN_PUT,
  createFailureDetail,
  ddicObjectUri,
  eccCreateUnsupported,
  isAlreadyCheckedMessage,
  isEcc,
  joinCheckErrors,
  looksAlreadyExists,
  messageOf,
  patchXmlAttribute,
  patchXmlBlock,
  patchXmlElement,
  resolveMasterLanguage,
  runObjectCheck,
  systemContextOf,
} from './dataElementDomainCreate';
import { errorResult, limitDescription } from './shared';

const SEGMENT = 'domains';

export interface FixedValue {
  readonly low: string;
  readonly text: string;
}

interface DomainCreateArgs {
  readonly domainName: string;
  readonly packageName: string;
  readonly description: string;
  readonly masterLanguage: string;
  readonly masterSystem: string;
  readonly responsible: string;
}

/**
 * 껍데기 생성 페이로드 — 벤더 `create.js:71-83`의 XML 그대로.
 *
 * 데이터 엘리먼트와 달리 **`adtcore:responsible`은 값이 없으면 속성 자체를 싣지
 * 않는다**(그쪽은 빈 문자열로라도 늘 싣는다). 그리고 `description`에
 * `limitDescription`을 걸지 않는다 — 벤더가 도메인에서는 그 손질을 하지 않는다.
 */
export function buildDomainCreatePayload(args: DomainCreateArgs): string {
  const masterSystemAttr = args.masterSystem
    ? ` adtcore:masterSystem="${args.masterSystem}"`
    : '';
  const responsibleAttr = args.responsible
    ? ` adtcore:responsible="${args.responsible}"`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain"
             xmlns:adtcore="http://www.sap.com/adt/core"
             adtcore:description="${args.description}"
             adtcore:language="${args.masterLanguage}"
             adtcore:name="${args.domainName.toUpperCase()}"
             adtcore:type="DOMA/DD"
             adtcore:masterLanguage="${args.masterLanguage}"${masterSystemAttr}${responsibleAttr}>
  <adtcore:packageRef adtcore:name="${args.packageName.toUpperCase()}"/>
</doma:domain>`;
}

export interface DomainPatchArgs {
  readonly description: string;
  readonly datatype: string;
  readonly length: number;
  readonly decimals: number;
  readonly conversionExit?: string;
  readonly lowercase: boolean;
  readonly signExists: boolean;
  readonly valueTable?: string;
  readonly fixedValues?: readonly FixedValue[];
}

/** 벤더 `update.js:18-72`의 `patchDomainXml` 그대로. */
export function patchDomainXml(currentXml: string, args: DomainPatchArgs): string {
  let xml = currentXml;

  if (args.description) {
    xml = patchXmlAttribute(xml, 'adtcore:description', limitDescription(args.description));
  }

  xml = patchXmlElement(xml, 'doma:datatype', args.datatype);
  xml = patchXmlElement(xml, 'doma:length', String(args.length));
  xml = patchXmlElement(xml, 'doma:decimals', String(args.decimals));

  if (args.conversionExit !== undefined) {
    xml = patchXmlElement(xml, 'doma:conversionExit', args.conversionExit || '');
  }
  xml = patchXmlElement(xml, 'doma:signExists', String(args.signExists));
  xml = patchXmlElement(xml, 'doma:lowercase', String(args.lowercase));

  if (args.valueTable !== undefined) {
    if (args.valueTable) {
      const table = String(args.valueTable);
      const uri = `/sap/bc/adt/ddic/tables/${table.toLowerCase()}`;
      xml = patchXmlBlock(
        xml,
        'doma:valueTableRef',
        `<doma:valueTableRef adtcore:uri="${uri}" adtcore:type="TABL/DT" adtcore:name="${table}"/>`,
      );
    } else {
      xml = patchXmlBlock(xml, 'doma:valueTableRef', '<doma:valueTableRef/>');
    }
  }

  if (args.fixedValues !== undefined) {
    if (args.fixedValues.length > 0) {
      const items = args.fixedValues
        .map(
          (value) =>
            `      <doma:fixValue>\n        <doma:low>${value.low}</doma:low>\n        <doma:text>${value.text}</doma:text>\n      </doma:fixValue>`,
        )
        .join('\n');
      xml = patchXmlBlock(xml, 'doma:fixValues', `<doma:fixValues>\n${items}\n    </doma:fixValues>`);
    } else {
      xml = patchXmlBlock(xml, 'doma:fixValues', '<doma:fixValues/>');
    }
  }

  return xml;
}

export const createDomain = defineTool(
  {
    name: 'CreateDomain',
    description:
      'Create a new ABAP domain in SAP system with all required steps: lock, create, check, unlock, activate, and verify.',
    inputSchema: {
      domain_name: z
        .string()
        .describe('Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.'),
      description: z
        .string()
        .describe('(optional) Domain description. If not provided, domain_name will be used.')
        .optional(),
      package_name: z
        .string()
        .describe('(optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)')
        .optional(),
      transport_request: z
        .string()
        .describe(
          '(optional) Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      datatype: z
        .string()
        .default('CHAR')
        .describe(
          '(optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
        ),
      length: z.number().default(100).describe('(optional) Field length (max depends on datatype)'),
      decimals: z
        .number()
        .default(0)
        .describe('(optional) Decimal places (for DEC, CURR, QUAN types)'),
      conversion_exit: z
        .string()
        .describe('(optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)')
        .optional(),
      lowercase: z.boolean().describe('(optional) Allow lowercase input').optional(),
      sign_exists: z.boolean().describe('(optional) Field has sign (+/-)').optional(),
      value_table: z
        .string()
        .describe('(optional) Value table name for foreign key relationship')
        .optional(),
      activate: z
        .boolean()
        .describe('(optional) Activate domain after creation (default: true)')
        .optional(),
      fixed_values: z
        .array(
          z.object({
            low: z.string().describe("Fixed value (e.g., '001', 'A')"),
            text: z.string().describe('Description text for the fixed value'),
          }),
        )
        .describe('(optional) Array of fixed values for domain value range')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['domain_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.domain_name) return errorResult('Domain name is required');
    // `package_name`은 발행 스키마의 `required`에 **없지만**(설명도 "(optional)")
    // 구 핸들러는 없으면 거절한다. 스키마와 핸들러가 어긋난 채로 실려 나갔고,
    // 여기서 어느 한쪽으로 맞추지 않는다 — 둘 다 그대로 옮긴다.
    if (!args.package_name) return errorResult('Package name is required');

    const domainName = args.domain_name.toUpperCase();

    if (isEcc(context.profile.sapVersion)) {
      return errorResult(eccCreateUnsupported('CreateDomain', 'ZMCP_ADT_DDIC_DOMA', SEGMENT));
    }

    const shouldActivate = args.activate !== false;
    const description = args.description || domainName;
    const packageName = args.package_name;
    const objectUri = ddicObjectUri(SEGMENT, domainName);

    logger.info(`Starting domain creation: ${domainName}`);

    try {
      const client = await context.getConnection();

      // ① 이름 검증. 구는 응답을 **읽지 않는다**.
      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/ddic/domains/validation',
        params: {
          objtype: 'doma',
          objname: domainName,
          packagename: packageName,
          description,
        },
        accept: ACCEPT_VALIDATION,
      });

      // ② 로그온 언어
      const masterLanguage = await resolveMasterLanguage(client);
      const { masterSystem, responsible } = systemContextOf(context);

      // ③ 껍데기 생성
      await client.request({
        method: 'POST',
        path: `/sap/bc/adt/ddic/${SEGMENT}`,
        params: { corrNr: args.transport_request },
        body: buildDomainCreatePayload({
          domainName,
          packageName,
          description,
          masterLanguage,
          masterSystem,
          responsible,
        }),
        contentType: CT_DOMAIN,
        accept: ACCEPT_DOMAIN,
      });

      // ④~⑧ 잠금 → 읽기-수정-쓰기 → **검사** → 해제.
      await client.withLock(objectUri, async (lock) => {
        const current = await client.request({
          method: 'GET',
          path: objectUri,
          accept: ACCEPT_DOMAIN,
        });
        const updatedXml = patchDomainXml(current.body, {
          description,
          datatype: args.datatype || 'CHAR',
          length: args.length || 100,
          decimals: args.decimals || 0,
          conversionExit: args.conversion_exit,
          lowercase: args.lowercase || false,
          signExists: args.sign_exists || false,
          valueTable: args.value_table,
          fixedValues: args.fixed_values,
        });
        await client.request({
          method: 'PUT',
          path: objectUri,
          params: { lockHandle: lock.handle, corrNr: args.transport_request },
          body: updatedXml,
          contentType: CT_DOMAIN_PUT,
          accept: ACCEPT_DOMAIN,
        });

        // 검사는 **잠금 안**이다 — 데이터 엘리먼트와 순서가 반대다.
        try {
          const verdict = await runObjectCheck(client, objectUri, 'inactive');
          // 도메인에는 무시 목록이 없다. 오류면 그대로 실패다.
          if (verdict.hasErrors) {
            throw new Error(`Domain check failed: ${joinCheckErrors(verdict.errors)}`);
          }
        } catch (checkError) {
          if (!isAlreadyCheckedMessage(messageOf(checkError))) throw checkError;
          logger.debug(`Domain ${domainName} was already checked - continuing`);
        }
      });

      // ⑨ 활성화 — 응답은 판정하지 않는다(머리주석 참조).
      if (shouldActivate) {
        await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: 'true' },
          body:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
            `  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${domainName}"/>\n` +
            `</adtcore:objectReferences>`,
          contentType: CT_ACTIVATION,
          accept: 'application/xml',
        });
      } else {
        logger.debug(`Skipping activation for: ${domainName}`);
      }

      logger.info(`CreateDomain completed: ${domainName}`);

      // 구는 여기서만 **들여쓰기 없이** 직렬화한다(`handleCreateDomain.ts:280-290`).
      // `domain_details`는 생성 응답 본문이 객체일 때만 채워지는데 본문은 늘
      // 문자열이라 언제나 `null`이다 — 구도 그렇다.
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              domain_name: domainName,
              package: packageName,
              transport_request: args.transport_request,
              status: shouldActivate ? 'active' : 'inactive',
              message: `Domain ${domainName} created${shouldActivate ? ' and activated' : ''} successfully`,
              domain_details: null,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error(`Error creating domain ${domainName}: ${messageOf(error)}`);
      if (looksAlreadyExists(error)) {
        return errorResult(
          `Domain ${domainName} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(`Failed to create domain ${domainName}: ${createFailureDetail(error)}`);
    }
  },
);
