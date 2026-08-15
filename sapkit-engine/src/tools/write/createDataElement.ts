/**
 * `CreateDataElement` — 데이터 엘리먼트 하나를 만들고 활성화한다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `CreateDataElement` · 구 소스
 * `engine/src/handlers/data_element/high/handleCreateDataElement.ts:23-122`).
 *
 * ## 사슬 — 구가 실제로 보내는 일곱 요청
 *
 * ```
 * ① POST /sap/bc/adt/ddic/dataelements/validation?objtype=dtel&objname=…&packagename=…&description=…
 * ② GET  /sap/bc/adt/core/http/systeminformation            (로그온 언어)
 * ③ POST /sap/bc/adt/ddic/dataelements[?corrNr=…]           (껍데기 생성)
 * ④ POST /sap/bc/adt/ddic/dataelements/{소문자}?_action=LOCK&accessMode=MODIFY
 * ⑤ GET  /sap/bc/adt/ddic/dataelements/{소문자}             ┐ 읽기-수정-쓰기
 * ⑥ PUT  /sap/bc/adt/ddic/dataelements/{소문자}?lockHandle=…┘
 * ⑦ POST /sap/bc/adt/ddic/dataelements/{소문자}?_action=UNLOCK&lockHandle=…
 * ⑧ POST /sap/bc/adt/checkruns?reporters=abapCheckRun       (해제 **뒤**)
 * ⑨ POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 * ```
 *
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/`의
 * `validation.js:20-38` · `create.js:14-150` · `lock.js:16-40` ·
 * `update.js:162-219` · `unlock.js:14-24` · `check.js:23-100` ·
 * `activation.js:64-84`.
 *
 * ## 지켜야 하는 두 자리
 *
 * - **잠금부터 해제까지 모든 요청이 stateful이어야 한다.** 그 사이에 stateless
 *   요청이 하나라도 끼면 SAP이 세션을 접고 잠금이 증발해 PUT이 423
 *   "invalid lock handle"로 죽으며 **반쯤 만들어진 껍데기가 남는다**(IDES 실측).
 *   구는 `connection.setSessionType('stateful')`을 손으로 다시 걸어 막았고, 여기서는
 *   접속 계층의 `withLock`이 그 창을 통째로 stateful로 유지한다. 계약 정본은
 *   `engine/src/__tests__/unit/createHandlersStatefulSessionFamily.test.ts`.
 * - **생성 페이로드의 언어는 시스템 로그온 언어여야 한다.** EN을 박으면 로그온
 *   언어가 EN이 아닌 시스템에서 SAP이 설명을 버리고, 뒤따르는 읽기-수정-쓰기가
 *   "Die Beschreibung fehlt"로 죽는다. 계약 정본은
 *   `engine/src/__tests__/unit/createLogonLanguageConsistency.test.ts`.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * - 구 `DataElementArgs`에는 `activate`가 있지만 **발행 스키마에는 없다**
 *   (`m1-tools.json`의 `CreateDataElement` — `required`도 `properties`도 그 이름을
 *   담지 않는다). 구 서버도 그 스키마로 등록했으므로 인자가 도달할 통로가 없고,
 *   `shouldActivate = args.activate !== false`는 언제나 참이다. 짝인
 *   `CreateDomain`은 그 인자를 실제로 발행한다 — 여기서 맞춰 주지 않는다.
 * - `validateTransportRequest`는 구에서도 **아무 검사도 하지 않는다**
 *   (`engine/src/utils/transportValidation.ts` — 본문이 비어 있다). 옮기지 않았다.
 */

import * as z from 'zod';

import { XMLParser } from 'fast-xml-parser';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_DATA_ELEMENT,
  ACCEPT_VALIDATION,
  CT_DATA_ELEMENT,
  CT_DATA_ELEMENT_PUT,
  createFailureDetail,
  ddicObjectUri,
  eccCreateUnsupported,
  isAlreadyCheckedMessage,
  isEcc,
  joinCheckErrors,
  looksAlreadyExists,
  messageOf,
  patchXmlAttribute,
  patchXmlElement,
  resolveMasterLanguage,
  runObjectCheck,
  systemContextOf,
} from './dataElementDomainCreate';
import { errorResult, limitDescription, okResult } from './shared';

const SEGMENT = 'dataelements';

/** 구 `check.js:70-77`이 실패로 치지 않는 세 갈래. 갓 만든 껍데기의 잡음이다. */
function isIgnorableCheckNoise(joined: string): boolean {
  const lower = joined.toLowerCase();
  return (
    (lower.includes('importing') && lower.includes('database')) ||
    (lower.includes('no domain') && lower.includes('data type was defined')) ||
    lower.includes('datatype is expected')
  );
}

interface CreateArgs {
  readonly dataElementName: string;
  readonly packageName: string;
  readonly description: string;
  readonly transportRequest?: string;
  readonly typeKind: string;
  readonly typeName?: string;
  readonly dataType?: string;
  readonly length?: number;
  readonly decimals?: number;
  readonly masterLanguage: string;
  readonly masterSystem: string;
  readonly responsible: string;
}

/**
 * 껍데기 생성 페이로드 — 벤더 `create.js:98-140`의 XML을 그대로 되짓는다.
 *
 * 값이 빈 자리를 **자기 닫음 태그로 남기는 것까지** 구와 같다. SAP은 없는 태그와
 * 빈 태그를 다르게 읽으므로 접으면 안 된다.
 */
export function buildCreatePayload(args: CreateArgs): string {
  const typeName =
    args.typeKind === 'domain'
      ? (args.typeName || args.dataType || '').toUpperCase()
      : args.typeName
        ? args.typeName.toUpperCase()
        : '';
  const dataType = args.dataType || '';
  const length = args.length || 0;
  const decimals = args.decimals || 0;
  const masterSystemAttr = args.masterSystem
    ? ` adtcore:masterSystem="${args.masterSystem}"`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel"
            xmlns:adtcore="http://www.sap.com/adt/core"
            xmlns:atom="http://www.w3.org/2005/Atom"
            xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements"
            adtcore:description="${args.description}"
            adtcore:language="${args.masterLanguage}"
            adtcore:name="${args.dataElementName.toUpperCase()}"
            adtcore:type="DTEL/DE"
            adtcore:masterLanguage="${args.masterLanguage}"${masterSystemAttr}
            adtcore:responsible="${args.responsible}">
  <adtcore:packageRef adtcore:name="${args.packageName.toUpperCase()}"/>
  <dtel:dataElement>
    <dtel:typeKind>${args.typeKind}</dtel:typeKind>
    ${typeName ? `<dtel:typeName>${typeName}</dtel:typeName>` : '<dtel:typeName/>'}
    ${dataType ? `<dtel:dataType>${dataType}</dtel:dataType>` : '<dtel:dataType/>'}
    <dtel:dataTypeLength>${String(length).padStart(6, '0')}</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>${String(decimals).padStart(6, '0')}</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel></dtel:shortFieldLabel>
    <dtel:shortFieldLength>10</dtel:shortFieldLength>
    <dtel:shortFieldMaxLength>10</dtel:shortFieldMaxLength>
    <dtel:mediumFieldLabel></dtel:mediumFieldLabel>
    <dtel:mediumFieldLength>20</dtel:mediumFieldLength>
    <dtel:mediumFieldMaxLength>20</dtel:mediumFieldMaxLength>
    <dtel:longFieldLabel></dtel:longFieldLabel>
    <dtel:longFieldLength>40</dtel:longFieldLength>
    <dtel:longFieldMaxLength>40</dtel:longFieldMaxLength>
    <dtel:headingFieldLabel></dtel:headingFieldLabel>
    <dtel:headingFieldLength>55</dtel:headingFieldLength>
    <dtel:headingFieldMaxLength>55</dtel:headingFieldMaxLength>
    <dtel:searchHelp/>
    <dtel:searchHelpParameter/>
    <dtel:setGetParameter/>
    <dtel:defaultComponentName/>
    <dtel:deactivateInputHistory>false</dtel:deactivateInputHistory>
    <dtel:changeDocument>false</dtel:changeDocument>
    <dtel:leftToRightDirection>false</dtel:leftToRightDirection>
    <dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering>
  </dtel:dataElement>
</blue:wbobj>`;
}

// ── 읽기-수정-쓰기 패치 (벤더 `update.js:85-156`) ────────────────────────────

export interface UpdatePatchArgs {
  readonly description: string;
  readonly typeKind: string;
  readonly typeName?: string;
  readonly dataType: string;
  readonly length: number;
  readonly decimals: number;
  readonly shortLabel?: string;
  readonly mediumLabel?: string;
  readonly longLabel?: string;
  readonly headingLabel?: string;
  readonly searchHelp?: string;
  readonly searchHelpParameter?: string;
  readonly setGetParameter?: string;
}

/** 벤더 `update.js:85-156`의 `patchDataElementXml` 그대로. */
export function patchDataElementXml(currentXml: string, args: UpdatePatchArgs): string {
  let xml = currentXml;

  if (args.description) {
    xml = patchXmlAttribute(xml, 'adtcore:description', limitDescription(args.description));
  }

  xml = patchXmlElement(xml, 'dtel:typeKind', args.typeKind);

  const typeName =
    args.typeKind === 'domain'
      ? (args.typeName || args.dataType || '').toUpperCase()
      : args.typeName
        ? args.typeName.toUpperCase()
        : '';
  if (typeName) xml = patchXmlElement(xml, 'dtel:typeName', typeName);

  xml = patchXmlElement(xml, 'dtel:dataType', args.dataType);
  xml = patchXmlElement(xml, 'dtel:dataTypeLength', String(args.length).padStart(6, '0'));
  xml = patchXmlElement(xml, 'dtel:dataTypeDecimals', String(args.decimals).padStart(6, '0'));

  // 라벨은 **주어졌을 때만** 건드린다. 길이 요소가 라벨과 한 벌로 따라간다.
  const labels: ReadonlyArray<readonly [string | undefined, string, string, number]> = [
    [args.shortLabel, 'dtel:shortFieldLabel', 'dtel:shortFieldLength', 10],
    [args.mediumLabel, 'dtel:mediumFieldLabel', 'dtel:mediumFieldLength', 20],
    [args.longLabel, 'dtel:longFieldLabel', 'dtel:longFieldLength', 40],
    [args.headingLabel, 'dtel:headingFieldLabel', 'dtel:headingFieldLength', 55],
  ];
  for (const [value, labelTag, lengthTag, fallback] of labels) {
    if (value === undefined) continue;
    xml = patchXmlElement(xml, labelTag, value);
    xml = patchXmlElement(xml, lengthTag, String(value.length || fallback));
  }

  if (args.searchHelp !== undefined) xml = patchXmlElement(xml, 'dtel:searchHelp', args.searchHelp);
  if (args.searchHelpParameter !== undefined) {
    xml = patchXmlElement(xml, 'dtel:searchHelpParameter', args.searchHelpParameter);
  }
  if (args.setGetParameter !== undefined) {
    xml = patchXmlElement(xml, 'dtel:setGetParameter', args.setGetParameter);
  }
  return xml;
}

const activationParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/**
 * 활성화 응답 판정 — 벤더 `activation.js:19-56`의 `parseActivationResponse`.
 *
 * **SAP은 활성화 실패도 HTTP 200으로 답한다.** `chkl:messages > chkl:properties`의
 * `activationExecuted`와 `checkExecuted`가 **둘 다 참**이어야 성공이다. 속성 블록
 * 자체가 없으면 `Unknown activation status`로 실패다. 짝인 `CreateDomain`은 이
 * 판정을 **하지 않는다**(벤더 `domain/activation.js`가 응답을 그대로 돌려준다) —
 * 두 사슬의 실측 차이이므로 여기서 맞춰 주지 않는다.
 */
export function activationVerdict(body: string): { readonly ok: boolean; readonly message: string } {
  let document: Record<string, unknown>;
  try {
    document = activationParser.parse(body ?? '') as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      message: `Failed to parse activation response: ${messageOf(error)}`,
    };
  }
  const messages = document['chkl:messages'] as Record<string, unknown> | undefined;
  const properties = messages?.['chkl:properties'] as Record<string, unknown> | undefined;
  if (!properties) return { ok: false, message: 'Unknown activation status' };

  const activated = properties.activationExecuted === 'true';
  const checked = properties.checkExecuted === 'true';
  return {
    ok: activated && checked,
    message: activated ? 'Data element activated successfully' : 'Activation failed',
  };
}

export const createDataElement = defineTool(
  {
    name: 'CreateDataElement',
    description:
      'Create a new ABAP data element in SAP system with all required steps: create, activate, and verify.',
    inputSchema: {
      data_element_name: z
        .string()
        .describe(
          'Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.',
        ),
      description: z
        .string()
        .describe('Data element description. If not provided, data_element_name will be used.')
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
      data_type: z
        .string()
        .default('CHAR')
        .describe("Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'."),
      length: z.number().default(100).describe('Data type length. Usually inherited from domain.'),
      decimals: z.number().default(0).describe('Decimal places. Usually inherited from domain.'),
      short_label: z
        .string()
        .describe('Short field label (max 10 chars). Applied during update step after creation.')
        .optional(),
      medium_label: z
        .string()
        .describe('Medium field label (max 20 chars). Applied during update step after creation.')
        .optional(),
      long_label: z
        .string()
        .describe('Long field label (max 40 chars). Applied during update step after creation.')
        .optional(),
      heading_label: z
        .string()
        .describe('Heading field label (max 55 chars). Applied during update step after creation.')
        .optional(),
      type_kind: z
        .enum([
          'domain',
          'predefinedAbapType',
          'refToPredefinedAbapType',
          'refToDictionaryType',
          'refToClifType',
        ])
        .default('domain')
        .describe(
          "Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.",
        ),
      type_name: z
        .string()
        .describe(
          "Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')",
        )
        .optional(),
      search_help: z
        .string()
        .describe('Search help name. Applied during update step after creation.')
        .optional(),
      search_help_parameter: z
        .string()
        .describe('Search help parameter. Applied during update step after creation.')
        .optional(),
      set_get_parameter: z
        .string()
        .describe('Set/Get parameter ID. Applied during update step after creation.')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['data_element_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.data_element_name) return errorResult('Data element name is required');
    if (!args.package_name) return errorResult('Package name is required');

    const dataElementName = args.data_element_name.toUpperCase();

    if (isEcc(context.profile.sapVersion)) {
      return errorResult(
        eccCreateUnsupported('CreateDataElement', 'ZMCP_ADT_DDIC_DTEL', SEGMENT),
      );
    }

    const typeKind = args.type_kind;
    const description = args.description || dataElementName;
    const objectUri = ddicObjectUri(SEGMENT, dataElementName);

    logger.info(`Starting data element creation: ${dataElementName}`);

    try {
      // 벤더 `create.js:26-48`의 사전 검사 — 참조형은 이름이 있어야 한다.
      if (
        typeKind !== 'domain' &&
        typeKind !== 'predefinedAbapType' &&
        typeKind !== 'refToPredefinedAbapType' &&
        !args.type_name
      ) {
        throw new Error(
          `type_name is required when type_kind is '${typeKind}'. Provide ${
            typeKind === 'refToDictionaryType' ? 'data element name' : 'class name'
          }.`,
        );
      }

      const client = await context.getConnection();

      // ① 이름 검증. 구는 응답을 **읽지 않는다** — 보내고 넘어간다.
      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/ddic/dataelements/validation',
        params: {
          objtype: 'dtel',
          objname: dataElementName,
          packagename: args.package_name,
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
        body: buildCreatePayload({
          dataElementName,
          packageName: args.package_name,
          description: limitDescription(description),
          typeKind,
          typeName: args.type_name,
          dataType: args.data_type,
          length: args.length,
          decimals: args.decimals,
          masterLanguage,
          masterSystem,
          responsible,
        }),
        contentType: CT_DATA_ELEMENT,
        accept: ACCEPT_DATA_ELEMENT,
      });

      // ④~⑦ 잠금 → 읽기-수정-쓰기 → 해제. `withLock`이 이 창을 stateful로 묶는다.
      await client.withLock(objectUri, async (lock) => {
        const current = await client.request({
          method: 'GET',
          path: objectUri,
          accept: ACCEPT_DATA_ELEMENT,
        });
        const updatedXml = patchDataElementXml(current.body, {
          description,
          typeKind,
          typeName: args.type_name,
          dataType: args.data_type || 'CHAR',
          length: args.length || 100,
          decimals: args.decimals || 0,
          shortLabel: args.short_label,
          mediumLabel: args.medium_label,
          longLabel: args.long_label,
          headingLabel: args.heading_label,
          searchHelp: args.search_help,
          searchHelpParameter: args.search_help_parameter,
          setGetParameter: args.set_get_parameter,
        });
        await client.request({
          method: 'PUT',
          path: objectUri,
          params: { lockHandle: lock.handle, corrNr: args.transport_request },
          body: updatedXml,
          contentType: CT_DATA_ELEMENT_PUT,
          accept: ACCEPT_DATA_ELEMENT,
        });
      });

      // ⑧ 검사 — 해제 **뒤**다(도메인과 순서가 반대다).
      try {
        const verdict = await runObjectCheck(client, objectUri, 'inactive');
        if (verdict.hasErrors) {
          const joined = joinCheckErrors(verdict.errors);
          if (!isIgnorableCheckNoise(joined)) {
            throw new Error(`Data element check failed: ${joined}`);
          }
          logger.debug(`Ignoring known check noise for ${dataElementName}: ${joined}`);
        }
      } catch (checkError) {
        // "이미 검사됨"은 실패가 아니다 — 구 `safeCheckOperation`이 삼키던 갈래다.
        if (!isAlreadyCheckedMessage(messageOf(checkError))) throw checkError;
        logger.debug(`${dataElementName} was already checked - continuing`);
      }

      // ⑨ 활성화. 응답이 200이어도 속성이 아니라고 하면 실패다.
      const activation = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/activation',
        params: { method: 'activate', preauditRequested: 'true' },
        body:
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
          `  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${dataElementName}"/>\n` +
          `</adtcore:objectReferences>`,
        // 데이터 엘리먼트 활성화만 `application/xml`이다 — 도메인은
        // `activateObjectInSession`을 타서 `CT_ACTIVATION`을 싣는다.
        contentType: 'application/xml',
        accept: 'application/xml',
      });
      const verdict = activationVerdict(activation.body);
      if (!verdict.ok) {
        throw new Error(`Data element activation failed: ${verdict.message}`);
      }

      logger.info(`CreateDataElement completed: ${dataElementName}`);

      return okResult({
        success: true,
        data_element_name: dataElementName,
        package: args.package_name,
        transport_request: args.transport_request,
        data_type: args.data_type || null,
        // 구의 `shouldActivate ? … : …` 두 갈래 중 **비활성 쪽은 도달하지 않는다** —
        // `activate` 인자가 발행 스키마에 없기 때문이다(머리주석 참조).
        status: 'active',
        message: `Data element ${dataElementName} created and activated successfully`,
      });
    } catch (error) {
      logger.error(
        `Error creating data element ${dataElementName}: ${messageOf(error)}`,
      );
      if (looksAlreadyExists(error)) {
        return errorResult(
          `Data element ${dataElementName} already exists. Please delete it first or use a different name.`,
        );
      }
      return errorResult(
        `Failed to create data element ${dataElementName}: ${createFailureDetail(error)}`,
      );
    }
  },
);
