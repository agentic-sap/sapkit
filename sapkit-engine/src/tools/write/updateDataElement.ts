/**
 * UpdateDataElement — 이미 있는 데이터 엘리먼트를 **통째로 덮어쓴다**.
 *
 * 발행 설명이 말하듯 "All provided parameters completely replace existing values"다.
 * 구 핸들러 `engine/src/handlers/data_element/high/handleUpdateDataElement.ts:162-379`.
 *
 * ## 사슬 — 구가 실제로 보내는 여섯 요청
 *
 * ```
 * ① 이름 검증   POST /sap/bc/adt/ddic/dataelements/validation?objtype=dtel&objname=…&packagename=…&description=…
 *                (**"이미 있다"는 통과시킨다** — 갱신에서는 있는 것이 정상이다)
 * ② 잠금        POST /sap/bc/adt/ddic/dataelements/{소문자}?_action=LOCK&accessMode=MODIFY
 * ③ 읽기        GET  /sap/bc/adt/ddic/dataelements/{소문자}          ┐ 읽기-수정-쓰기
 * ④ 쓰기        PUT  /sap/bc/adt/ddic/dataelements/{소문자}?lockHandle=…[&corrNr=…]  ┘
 * ⑤ 검사        POST /sap/bc/adt/checkruns?reporters=abapCheckRun    (**해제 앞**)
 * ⑥ 해제        POST /sap/bc/adt/ddic/dataelements/{소문자}?_action=UNLOCK&lockHandle=…
 * ⑦ 활성화      POST /sap/bc/adt/activation?method=activate&preauditRequested=true   (activate!==false)
 * ```
 *
 * **⑤가 해제 앞인 것이 짝인 `CreateDataElement`와의 실측 차이다** — 그쪽은 해제한
 * **뒤에** 검사한다(`handleCreateDataElement.ts:258-275` vs 이 파일 `:280-309`의
 * `try … finally`). 도메인 갱신과는 같은 순서다. 접어 합치지 않는다.
 *
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/`의
 * `validation.js:20-38` · `AdtDataElement.js:200-241`(저수준 갱신 모드) ·
 * `update.js:162-219`(GET → 패치 → PUT) · `lock.js` · `unlock.js` ·
 * `check.js:24-105` · `activation.js:55-74`.
 *
 * ## 저수준 갱신 모드다 — 설명의 1단계는 **일어나지 않는다**
 *
 * 발행 설명은 "1. Gets domain info (if type_kind is 'domain')"로 시작하지만, 구
 * 핸들러는 잠금 손잡이를 손에 쥔 채 `update(…, { lockHandle })`을 부르고
 * (`:269-278`), 그 경로는 벤더의 **저수준 모드**라 `getDomainInfo()`를 부르지
 * 않는다(`AdtDataElement.js:210-241`). 즉 도메인 조회 왕복은 나가지 않는다.
 * 설명과 구현이 어긋난 채 실려 나갔고, 여기서 어느 한쪽으로 맞추지 않는다 — 둘 다
 * 그대로 옮긴다.
 *
 * ## 활성화는 **구가 이미 판정한다** — 이 계열에는 고칠 거짓 성공이 없다
 *
 * 벤더 `activateDataElement`(`activation.js:55-74`)가 응답의
 * `chkl:messages > chkl:properties`에서 `activationExecuted`·`checkExecuted`를 읽어
 * **둘 다 참이 아니면 던진다.** 짝인 도메인 쪽은 그 판정을 하지 않아 이 판에서
 * 고쳤지만(D125), 데이터 엘리먼트는 구가 이미 옳으므로 **그대로 승계**한다.
 * 판정 함수는 짝이 이미 지어 둔 `./createDataElement`의 `activationVerdict`를
 * 가져다 쓴다 — 같은 응답을 두 벌로 읽는 코드를 만들지 않는다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * - 인자 오류·실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다 — 장부 D34.
 *   문장 자체는 글자 그대로 보존한다.
 * - ECC 우회로가 없다 — 장부 D61(데이터 엘리먼트·도메인 계열 전체). 조용히 ADT로
 *   흘려보내지 않고 거절한다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { activationVerdict } from './createDataElement';
import {
  ACCEPT_DATA_ELEMENT,
  ACCEPT_VALIDATION,
  CT_DATA_ELEMENT_PUT,
  ddicObjectUri,
  eccCreateUnsupported,
  isAlreadyCheckedMessage,
  isEcc,
  joinCheckErrors,
  messageOf,
  patchXmlAttribute,
  patchXmlElement,
  responseBodyOf,
  runObjectCheck,
} from './dataElementDomainCreate';
import { errorResult, limitDescription } from './shared';

const SEGMENT = 'dataelements';

export interface DataElementUpdatePatchArgs {
  readonly description?: string;
  readonly typeKind?: string;
  readonly typeName?: string;
  readonly dataType?: string;
  readonly length?: number;
  readonly decimals?: number;
  readonly shortLabel?: string;
  readonly mediumLabel?: string;
  readonly longLabel?: string;
  readonly headingLabel?: string;
  readonly searchHelp?: string;
  readonly searchHelpParameter?: string;
  readonly setGetParameter?: string;
}

/**
 * 벤더 `update.js:85-156`의 `patchDataElementXml` 그대로.
 *
 * **짝인 `createDataElement.ts`의 같은 이름 함수와 다르다.** 그쪽은 `dataType` ·
 * `length` · `decimals`를 **언제나** 갈아 끼운다(생성 경로에는 기본값
 * `CHAR`/`100`/`0`이 늘 채워져 오기 때문). 갱신 경로는 벤더의 `patchIf`
 * (`utils/xmlPatch.js:93-97` — `undefined`/`null`이면 원본을 그대로 돌려준다)를
 * 타므로, **주지 않은 값은 손대지 않는다.** 접어 합치면 "설명만 바꾸려던" 호출이
 * 타입 정보를 통째로 덮어쓴다.
 */
export function patchDataElementUpdateXml(
  currentXml: string,
  args: DataElementUpdatePatchArgs,
): string {
  let xml = currentXml;

  if (args.description) {
    xml = patchXmlAttribute(xml, 'adtcore:description', limitDescription(args.description));
  }

  if (args.typeKind !== undefined) {
    xml = patchXmlElement(xml, 'dtel:typeKind', args.typeKind);
  }

  if (args.typeKind !== undefined || args.typeName !== undefined || args.dataType !== undefined) {
    let typeName = '';
    if (args.typeKind === 'domain') {
      typeName = (args.typeName || args.dataType || '').toUpperCase();
    } else if (args.typeName) {
      typeName = args.typeName.toUpperCase();
    }
    if (typeName) xml = patchXmlElement(xml, 'dtel:typeName', typeName);
  }

  if (args.dataType !== undefined) {
    xml = patchXmlElement(xml, 'dtel:dataType', args.dataType);
  }
  if (args.length !== undefined) {
    xml = patchXmlElement(xml, 'dtel:dataTypeLength', String(args.length).padStart(6, '0'));
  }
  if (args.decimals !== undefined) {
    xml = patchXmlElement(xml, 'dtel:dataTypeDecimals', String(args.decimals).padStart(6, '0'));
  }

  // 라벨은 주어졌을 때만 건드린다. 길이 요소가 라벨과 한 벌로 따라간다.
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

/**
 * 구 `check.js:70-77`이 실패로 치지 않는 세 갈래. 짝인 `createDataElement.ts`가
 * 같은 판정을 모듈 사설로 갖고 있어 여기서 다시 적는다 — 벤더 한 함수를 두 도구가
 * 함께 타므로 **판정이 갈리면 안 된다**.
 */
export function isIgnorableCheckNoise(joined: string): boolean {
  const lower = joined.toLowerCase();
  return (
    (lower.includes('importing') && lower.includes('database')) ||
    (lower.includes('no domain') && lower.includes('data type was defined')) ||
    lower.includes('datatype is expected')
  );
}

/**
 * 구 `isAlreadyExistsError`(`engine/src/lib/utils.ts`) 그대로.
 *
 * **갱신에서 "이미 있다"는 실패가 아니라 전제다.** 짝인 생성 쪽이 쓰는
 * `looksAlreadyExists`는 더 거친 검사(문구 + `ExceptionResourceAlreadyExists`)라
 * 여기서 쓸 수 없다 — 구 갱신 핸들러는 T100 열쇠(`SWB_TOOL/016`)와 독일어 문구까지
 * 보는 쪽을 쓴다(`:225`). 좁히면 정상 갱신이 검증 단계에서 죽는다.
 */
export function isAlreadyExistsError(error: unknown): boolean {
  const combined = `${messageOf(error)} ${responseBodyOf(error) ?? ''}`;

  // 1. 기계 식별자 (언어 무관) — 먼저 본다.
  const typeId = combined.match(/<type\s+id="([^"]*)"/)?.[1];
  if (typeId && /AlreadyExists/i.test(typeId)) return true;

  const t100Id = combined.match(/<entry\s+key="T100KEY-ID">([^<]*)<\/entry>/)?.[1];
  const t100No = combined.match(/<entry\s+key="T100KEY-NO">([^<]*)<\/entry>/)?.[1];
  if (t100Id === 'SWB_TOOL' && t100No === '016') return true;

  // 2. 폴백: 다국어 문구 대조.
  const lower = combined.toLowerCase();
  return (
    lower.includes('already exists') ||
    lower.includes('does already exist') ||
    lower.includes('resource already exists') ||
    lower.includes('object already exists') ||
    lower.includes('bereits vorhanden') ||
    lower.includes('existiert bereits')
  );
}

export const updateDataElement = defineTool(
  {
    name: 'UpdateDataElement',
    description: `Update an existing ABAP data element in SAP system.

Workflow:
1. Gets domain info (if type_kind is 'domain') to extract dataType/length/decimals
2. Acquires lock on the data element
3. Updates data element with provided parameters (complete replacement)
4. Unlocks data element
5. Optionally activates data element (default: true)
6. Returns updated data element details

Supported type_kind values:
- domain: Based on ABAP domain (requires type_name = domain name)
- predefinedAbapType: Direct ABAP type (requires data_type, length, decimals)
- refToPredefinedAbapType: Reference to ABAP type (requires data_type, length, decimals)
- refToDictionaryType: Reference to another data element (requires type_name = data element name)
- refToClifType: Reference to class (requires type_name = class name)

Note: All provided parameters completely replace existing values. Field labels are truncated to max lengths (10/20/40/55).`,
    inputSchema: {
      data_element_name: z
        .string()
        .describe('Data element name to update (e.g., ZZ_TEST_DTEL_01)'),
      description: z.string().describe('New data element description').optional(),
      package_name: z
        .string()
        .describe('Package name (e.g., ZOK_LOCAL, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
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
          'Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType',
        ),
      type_name: z
        .string()
        .describe(
          'Type name: domain name, data element name, or class name (depending on type_kind)',
        )
        .optional(),
      data_type: z
        .string()
        .describe(
          'Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType',
        )
        .optional(),
      length: z
        .number()
        .describe('Length - for predefinedAbapType or refToPredefinedAbapType')
        .optional(),
      decimals: z
        .number()
        .describe('Decimals - for predefinedAbapType or refToPredefinedAbapType')
        .optional(),
      field_label_short: z.string().describe('Short field label (max 10 chars)').optional(),
      field_label_medium: z.string().describe('Medium field label (max 20 chars)').optional(),
      field_label_long: z.string().describe('Long field label (max 40 chars)').optional(),
      field_label_heading: z.string().describe('Heading field label (max 55 chars)').optional(),
      search_help: z.string().describe('Search help name').optional(),
      search_help_parameter: z.string().describe('Search help parameter').optional(),
      set_get_parameter: z.string().describe('Set/Get parameter ID').optional(),
      activate: z
        .boolean()
        .describe('Activate data element after update (default: true)')
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['data_element_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    // 구는 이 둘을 `McpError(InvalidParams, …)`로 던진다 — 문장은 그대로, 접두사만
    // 빠진다(D34).
    if (!args.data_element_name) return errorResult('Data element name is required');
    if (!args.package_name) return errorResult('Package name is required');

    const dataElementName = args.data_element_name.toUpperCase();

    if (isEcc(context.profile.sapVersion)) {
      return errorResult(
        eccCreateUnsupported('UpdateDataElement', 'ZMCP_ADT_DDIC_DTEL', SEGMENT),
      );
    }

    const shouldActivate = args.activate !== false;
    const description = args.description || dataElementName;
    const packageName = args.package_name;
    const objectUri = ddicObjectUri(SEGMENT, dataElementName);

    logger.info(`Starting data element update: ${dataElementName}`);

    try {
      const client = await context.getConnection();

      // ① 이름 검증. 갱신에서는 **"이미 있다"가 정상**이므로 그것만 삼킨다.
      try {
        await client.request({
          method: 'POST',
          path: `/sap/bc/adt/ddic/${SEGMENT}/validation`,
          params: {
            objtype: 'dtel',
            objname: dataElementName,
            packagename: packageName,
            description,
          },
          accept: ACCEPT_VALIDATION,
        });
      } catch (validateError) {
        if (!isAlreadyExistsError(validateError)) throw validateError;
        logger.info(
          `Data element ${dataElementName} already exists - this is expected for update operation`,
        );
      }

      // ②~⑥ 잠금 → 읽기-수정-쓰기 → **검사** → 해제.
      await client.withLock(objectUri, async (lock) => {
        const current = await client.request({
          method: 'GET',
          path: objectUri,
          accept: ACCEPT_DATA_ELEMENT,
        });
        // 갱신은 생성과 달리 **주지 않은 값에 기본값을 얹지 않는다** — 벤더
        // `patchIf`가 `undefined`면 그 요소를 건드리지 않는다(`update.js:110-112`).
        const updatedXml = patchDataElementUpdateXml(current.body, {
          description,
          typeKind: args.type_kind,
          typeName: args.type_name?.toUpperCase(),
          dataType: args.data_type,
          length: args.length,
          decimals: args.decimals,
          shortLabel: args.field_label_short,
          mediumLabel: args.field_label_medium,
          longLabel: args.field_label_long,
          headingLabel: args.field_label_heading,
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

        // 검사는 **잠금 안**이다 — 짝인 생성과 순서가 반대다.
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
      });

      // ⑦ 활성화. **구가 이미 응답을 판정한다** — 200이어도 속성이 아니라고 하면 실패다.
      if (shouldActivate) {
        const activation = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: 'true' },
          body:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
            `  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${dataElementName}"/>\n` +
            `</adtcore:objectReferences>`,
          contentType: 'application/xml',
          accept: 'application/xml',
        });
        const verdict = activationVerdict(activation.body);
        if (!verdict.ok) {
          throw new Error(`Data element activation failed: ${verdict.message}`);
        }
      }

      logger.info(`UpdateDataElement completed: ${dataElementName}`);

      // 구는 여기서 **들여쓰기 없이** 직렬화한다(`:327-338`) — 짝인 생성 쪽은 두 칸을
      // 쓴다. `data_element_details`는 갱신 응답 본문이 객체일 때만 채워지는데 본문은
      // 늘 문자열이라 언제나 `null`이다.
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data_element_name: dataElementName,
              package: packageName,
              transport_request: args.transport_request,
              data_type: args.data_type || null,
              status: shouldActivate ? 'active' : 'inactive',
              message: `Data element ${dataElementName} updated${
                shouldActivate ? ' and activated' : ''
              } successfully`,
              data_element_details: null,
            }),
          },
        ],
      };
    } catch (error) {
      const detail = messageOf(error);
      logger.error(`Error updating data element ${dataElementName}: ${detail}`);

      if (detail.includes('not found') || statusOf(error) === 404) {
        return errorResult(`Data element ${dataElementName} not found.`);
      }
      if (detail.includes('locked') || statusOf(error) === 403) {
        return errorResult(
          `Data element ${dataElementName} is locked by another user or session. Please try again later.`,
        );
      }
      return errorResult(
        `Failed to update data element ${dataElementName}: ${responseBodyOf(error) ?? detail}`,
      );
    }
  },
);

function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}
