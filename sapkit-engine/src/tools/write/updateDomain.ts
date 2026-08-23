/**
 * UpdateDomain — 이미 있는 도메인을 **통째로 덮어쓴다**.
 *
 * 발행 설명이 말하듯 "All provided parameters completely replace existing values"다.
 * 구 핸들러 `engine/src/handlers/domain/high/handleUpdateDomain.ts:138-309`.
 *
 * ## 사슬 — 구가 실제로 보내는 다섯 요청
 *
 * ```
 * ① 잠금    POST /sap/bc/adt/ddic/domains/{소문자}?_action=LOCK&accessMode=MODIFY
 * ② 읽기    GET  /sap/bc/adt/ddic/domains/{소문자}                 ┐ 읽기-수정-쓰기
 * ③ 쓰기    PUT  /sap/bc/adt/ddic/domains/{소문자}?lockHandle=…[&corrNr=…]  ┘
 * ④ 검사    POST /sap/bc/adt/checkruns?reporters=abapCheckRun      (**해제 앞**)
 * ⑤ 해제    POST /sap/bc/adt/ddic/domains/{소문자}?_action=UNLOCK&lockHandle=…
 * ⑥ 활성화  POST /sap/bc/adt/activation?method=activate&preauditRequested=true  (activate!==false)
 * ```
 *
 * **이름 검증 단계가 없다.** 구 핸들러 머리주석이 그 이유를 적어 둔다 — "No
 * validation step - lock will fail if domain doesn't exist"(`:7-8`). 짝인
 * `UpdateDataElement`에는 검증이 있다. 접어 합치지 않는다.
 *
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/core/domain/`의
 * `AdtDomain.js:190-221`(저수준 갱신 모드) · `update.js:78-106`(GET → 패치 → PUT) ·
 * `lock.js:57-79` · `unlock.js:16-24` · `check.js:22-70`(**무시 목록이 없다**) ·
 * `activation.js:12-17` → `utils/activationUtils.js:116-133`.
 *
 * ## 의도적 차이 D125 — 활성화 **거짓 성공**을 성공으로 접지 않는다
 *
 * **구 동작(실측)**: 벤더 `activateDomain`은 `activateObjectInSession`의 응답을
 * **그대로 돌려주고**(`domain/activation.js:15-17`), `AdtDomain.activate()`도 그것을
 * 상태에 담을 뿐 판정하지 않는다(`AdtDomain.js:390-406`). 겉 핸들러 역시 반환값을
 * 버린다(`handleUpdateDomain.ts:243-245`). **SAP은 활성화 실패도 HTTP 200으로
 * 답하며 `<chkl:msg type="E">`를 담으므로**, 활성화되지 않은 도메인이
 * `Domain … updated and activated successfully` · `status: "active"`로 보고된다.
 *
 * **짝인 데이터 엘리먼트는 구가 이미 판정한다**(`dataElement/activation.js:69-72` —
 * `chkl:properties`의 두 속성을 읽고 던진다). 같은 물결의 두 DDIC 오브젝트에서
 * 한쪽만 판정하는 것이 벤더의 실측 상태다.
 *
 * **신 동작**: 요청 바이트는 구 그대로 두고, 응답 본문의 `E`/`A`/`X`를 실패로
 * 되돌린다. 경고(`W`)만 있으면 구와 같이 성공이다.
 *
 * **왜 여기서 고치고 짝인 `CreateDomain`은 그대로인가**: `CreateDomain`은 요구 급이
 * `attended 실기`라 사람이 실물로 확인하는 관문이 남아 있고, 그 모듈이 그 판단을
 * 머리주석에 적어 두었다(무접촉 — 다른 묶음의 도구다). **이 도구는 요구 급이
 * `계약 시험`이라 이 시험이 유일한 증거**이고, 여기서 구를 재현하면 "활성화되지
 * 않았는데 활성화됐다"는 응답이 증거 있음으로 표시된 채 남는다. 선례는
 * D66(`UpdateView`) — 그쪽도 짝인 생성은 두고 갱신만 고쳤다.
 *
 * - 사람용 장부: `harness/DIVERGENCES.md` D125
 * - 대체 기대 시험: 이 도구 시험의 「D125」 절
 * - **기계 장부(`harness/replay/divergences.ts`) 미반영** — 이 묶음 과제는 그 파일이
 *   무접촉이다. 도구 응답이 `isError`째로 달라지므로 **기계 장부에 와야 한다.**
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * - 인자 오류·실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다 — 장부 D34.
 * - ECC 우회로가 없다 — 장부 D61(데이터 엘리먼트·도메인 계열 전체).
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import type { FixedValue } from './createDomain';
import {
  ACCEPT_DOMAIN,
  CT_ACTIVATION,
  CT_DOMAIN_PUT,
  ddicObjectUri,
  eccCreateUnsupported,
  isAlreadyCheckedMessage,
  isEcc,
  joinCheckErrors,
  messageOf,
  patchXmlAttribute,
  patchXmlBlock,
  patchXmlElement,
  responseBodyOf,
  runObjectCheck,
} from './dataElementDomainCreate';
import {
  activationErrors,
  errorResult,
  limitDescription,
  parseActivationMessages,
} from './shared';

const SEGMENT = 'domains';

export interface DomainUpdatePatchArgs {
  readonly description?: string;
  readonly datatype?: string;
  readonly length?: number;
  readonly decimals?: number;
  readonly conversionExit?: string;
  readonly lowercase?: boolean;
  readonly signExists?: boolean;
  readonly valueTable?: string;
  readonly fixedValues?: readonly FixedValue[];
}

/**
 * 벤더 `update.js:18-72`의 `patchDomainXml` 그대로.
 *
 * **짝인 `createDomain.ts`의 같은 이름 함수와 다르다.** 그쪽은 `datatype` ·
 * `length` · `decimals` · `signExists` · `lowercase`를 **언제나** 갈아 끼운다(생성
 * 경로에는 기본값이 늘 채워져 오기 때문). 갱신 경로는 벤더의 `patchIf`
 * (`utils/xmlPatch.js:93-97`)와 `!== undefined` 가드를 타므로 **주지 않은 값은
 * 손대지 않는다.** 접어 합치면 "설명만 바꾸려던" 호출이 값 범위를 통째로 덮어쓴다.
 */
export function patchDomainUpdateXml(
  currentXml: string,
  args: DomainUpdatePatchArgs,
): string {
  let xml = currentXml;

  if (args.description) {
    xml = patchXmlAttribute(xml, 'adtcore:description', limitDescription(args.description));
  }

  if (args.datatype !== undefined) {
    xml = patchXmlElement(xml, 'doma:datatype', args.datatype);
  }
  if (args.length !== undefined) {
    xml = patchXmlElement(xml, 'doma:length', String(args.length));
  }
  if (args.decimals !== undefined) {
    xml = patchXmlElement(xml, 'doma:decimals', String(args.decimals));
  }

  if (args.conversionExit !== undefined) {
    xml = patchXmlElement(xml, 'doma:conversionExit', args.conversionExit || '');
  }
  // 벤더는 signExists를 lowercase보다 **먼저** 쓴다(`update.js:36-41`).
  if (args.signExists !== undefined) {
    xml = patchXmlElement(xml, 'doma:signExists', String(args.signExists));
  }
  if (args.lowercase !== undefined) {
    xml = patchXmlElement(xml, 'doma:lowercase', String(args.lowercase));
  }

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

function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}

export const updateDomain = defineTool(
  {
    name: 'UpdateDomain',
    description: `Update an existing ABAP domain in SAP system.

Workflow:
1. Acquires lock on the domain
2. Updates domain with provided parameters (complete replacement)
3. Performs syntax check
4. Unlocks domain
5. Optionally activates domain (default: true)
6. Returns updated domain details

Note: All provided parameters completely replace existing values. Use GetDomain first to see current values if needed.`,
    inputSchema: {
      domain_name: z.string().describe('Domain name to update (e.g., ZZ_TEST_0001)'),
      description: z.string().describe('New domain description (optional)').optional(),
      package_name: z
        .string()
        .describe('Package name (e.g., ZOK_LOCAL, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      datatype: z
        .string()
        .describe(
          'Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
        )
        .optional(),
      length: z.number().describe('Field length (max depends on datatype)').optional(),
      decimals: z.number().describe('Decimal places (for DEC, CURR, QUAN types)').optional(),
      conversion_exit: z
        .string()
        .describe('Conversion exit routine name (without CONVERSION_EXIT_ prefix)')
        .optional(),
      lowercase: z.boolean().describe('Allow lowercase input').optional(),
      sign_exists: z.boolean().describe('Field has sign (+/-)').optional(),
      value_table: z
        .string()
        .describe('Value table name for foreign key relationship')
        .optional(),
      activate: z.boolean().describe('Activate domain after update (default: true)').optional(),
      fixed_values: z
        .array(
          z.object({
            low: z.string().describe("Fixed value (e.g., '001', 'A')"),
            text: z.string().describe('Description text for the fixed value'),
          }),
        )
        .describe('Array of fixed values for domain value range')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['domain_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    // 구는 이 둘을 `McpError(InvalidParams, …)`로 던진다 — 문장은 그대로, 접두사만
    // 빠진다(D34).
    if (!args.domain_name) return errorResult('Domain name is required');
    if (!args.package_name) return errorResult('Package name is required');

    const domainName = args.domain_name.toUpperCase();

    if (isEcc(context.profile.sapVersion)) {
      return errorResult(eccCreateUnsupported('UpdateDomain', 'ZSAPKIT_ADT_DDIC_DOMA', SEGMENT));
    }

    const shouldActivate = args.activate !== false;
    const packageName = args.package_name;
    const objectUri = ddicObjectUri(SEGMENT, domainName);

    logger.info(`Starting domain update: ${domainName}`);

    try {
      const client = await context.getConnection();

      // ①~⑤ 잠금 → 읽기-수정-쓰기 → **검사** → 해제. 이름 검증 단계는 없다.
      await client.withLock(objectUri, async (lock) => {
        const current = await client.request({
          method: 'GET',
          path: objectUri,
          accept: ACCEPT_DOMAIN,
        });
        // 갱신은 생성과 달리 **주지 않은 값에 기본값을 얹지 않는다**.
        const updatedXml = patchDomainUpdateXml(current.body, {
          // 구 핸들러는 설명이 비면 이름으로 채운다(`:198`) — 언제나 실린다.
          description: args.description || domainName,
          datatype: args.datatype,
          length: args.length,
          decimals: args.decimals,
          conversionExit: args.conversion_exit,
          lowercase: args.lowercase,
          signExists: args.sign_exists,
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

        // 검사는 **잠금 안**이다. 도메인에는 무시 목록이 없다 — 오류면 그대로 실패다.
        try {
          const verdict = await runObjectCheck(client, objectUri, 'inactive');
          if (verdict.hasErrors) {
            throw new Error(`Domain check failed: ${joinCheckErrors(verdict.errors)}`);
          }
        } catch (checkError) {
          if (!isAlreadyCheckedMessage(messageOf(checkError))) throw checkError;
          logger.debug(`Domain ${domainName} was already checked - continuing`);
        }
      });

      // ⑥ 활성화. **D125** — 구는 응답을 버렸다.
      if (shouldActivate) {
        const activation = await client.request({
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
        const failures = activationErrors(parseActivationMessages(activation.body));
        if (failures.length > 0) {
          throw new Error(
            `Activation failed: domain ${domainName} was not activated (${failures.length} error${
              failures.length === 1 ? '' : 's'
            }): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The domain update is on SAP as an inactive version; the active version is unchanged.`,
          );
        }
      } else {
        logger.debug(`Skipping activation for: ${domainName}`);
      }

      logger.info(`UpdateDomain completed: ${domainName}`);

      // 구는 여기서 **들여쓰기 없이** 직렬화한다(`:258-268`). `domain_details`는 갱신
      // 응답 본문이 객체일 때만 채워지는데 본문은 늘 문자열이라 언제나 `null`이다.
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
              message: `Domain ${domainName} updated${
                shouldActivate ? ' and activated' : ''
              } successfully`,
              domain_details: null,
            }),
          },
        ],
      };
    } catch (error) {
      const detail = messageOf(error);
      logger.error(`Error updating domain ${domainName}: ${detail}`);

      if (detail.includes('not found') || statusOf(error) === 404) {
        return errorResult(`Domain ${domainName} not found.`);
      }
      if (detail.includes('locked') || statusOf(error) === 403) {
        return errorResult(
          `Domain ${domainName} is locked by another user or session. Please try again later.`,
        );
      }
      return errorResult(
        `Failed to update domain ${domainName}: ${responseBodyOf(error) ?? detail}`,
      );
    }
  },
);
