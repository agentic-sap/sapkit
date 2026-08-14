/**
 * GetTypeInfo — DDIC 타입 하나를 후보 경로 넷(+폴백 하나)에서 차례로 찾는다.
 *
 * ## 와이어 동작을 어디서 복원했나
 *
 * 이 도구는 드물게 **겉 핸들러가 스스로 요청을 조립한다** — 구 핸들러 머리주석이
 * "이 핸들러는 makeAdtRequestWithTimeout을 직접 쓰며 adt-clients 모듈로 옮겨야
 * 한다"고 적어 둔 그대로다(`engine/src/handlers/system/readonly/handleGetTypeInfo.ts:1-9`).
 * 그래서 경로 다섯 개가 핸들러 소스에 글자로 박혀 있고(`:197-222`·`:243`),
 * 그 아래는 `lib/utils.ts:902-921` → `lib/utils.ts:941-958` →
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-234`다.
 *
 * **`Accept`를 주지 않는다**(`handleGetTypeInfo.ts:145-150` — 인자가 넷뿐이라
 * headers 자리가 비어 있다). 그러면 접속 계층의 기본값(xml·json·text·와일드카드를
 * 이 순서로 나열한 문자열)이 붙는다(`AbstractAbapConnection.js:160-165`).
 * 신 엔진의 기본값도 **같은 문자열**이므로(`src/adt/client.ts:51`의
 * `DEFAULT_ACCEPT` · `:519`에서 적용) `accept`를 생략하는 것이 곧 구의 재현이다.
 * 그 문자열의 정확한 형태는 이 도구의 시험이 글자로 붙잡는다.
 *
 * ## 후보 순서와 멈추는 조건
 *
 * 1. `/sap/bc/adt/ddic/domains/{encoded}/source/main`
 * 2. `/sap/bc/adt/ddic/dataelements/{encoded}`
 * 3. `/sap/bc/adt/ddic/tabletypes/{encoded}`
 * 4. `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri={encodedUri}`
 * 5. (폴백) `/sap/bc/adt/ddic/structures/{encoded}` — `include_structure_fallback`이
 *    거짓이 아닐 때만
 *
 * **1~4의 이름은 `encodeURIComponent(type_name)` 그대로**인데, 4의 `uri` 질의
 * 인자만은 `type_name.toLowerCase()`로 만든 경로를 다시 인코딩한다
 * (`handleGetTypeInfo.ts:192-195`). 대소문자가 이 한 자리에서만 갈리는 것은
 * 구의 실측이며, 고치면 4번 후보가 다른 오브젝트를 가리키게 된다.
 *
 * 각 후보는 **404이거나 「쓸 만한 결과」가 아니면** 다음으로 넘어간다. 404가 아닌
 * 오류는 **던져서** 바깥 catch가 `ADT error: …`로 접는다(`:161-166`) — 즉 401·500은
 * 다음 후보를 시도하지 않는다.
 *
 * ## 「쓸 만한 결과」의 정의가 파싱 결과에도 걸린다
 *
 * `hasUsableResult`(`:111-129`)는 응답 본문에도, **파싱한 payload에도** 적용된다.
 * 그래서 `{ raw: {} }`처럼 파서가 아무것도 못 알아본 결과는 「없음」으로 취급돼
 * 다음 후보로 넘어간다 — `raw` 키가 있으면 그 안이 비었는지까지 본다는 것이
 * 그 함수의 요점이다.
 *
 * ## 구와 다른 것 (등재된 차이)
 *
 * 구는 성공 응답을 `{ type: 'json', json: payload }`로 실었다(`:230`·`:249`).
 * `json`은 MCP 규약의 콘텐츠 종류가 아니다 — 신 엔진은 규약대로 text 하나에
 * JSON 문자열을 싣는다. 장부 등재분의 「콘텐츠 종류」 항목 참조.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { failure, ok } from './internal/results';

/** 구 파서 옵션 그대로 — 접두사 없는 속성명이라 속성과 자식 요소가 한 이름공간에 섞인다. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  trimValues: true,
});

/**
 * 구 `hasUsableResult`(`handleGetTypeInfo.ts:111-129`) 그대로.
 *
 * `raw` 키를 가진 객체는 **그 안이 비었으면 없는 것**으로 친다. 파서가 모양을
 * 못 알아봤을 때 `{ raw: {} }`가 나오기 때문이고, 그것을 답으로 인정하면 첫
 * 후보에서 멈춰 버린다.
 */
export function hasUsableResult(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('raw' in record) {
      const raw = record['raw'];
      return raw !== null && typeof raw === 'object' && Object.keys(raw).length > 0;
    }
    return Object.keys(record).length > 0;
  }
  return true;
}

const asString = (value: unknown): unknown => value;

/** 구 `parseTypeInfoXml`(`:44-89`) 그대로 — 데이터 요소 → 도메인 → 원문 순서. */
export function parseTypeInfoXml(xml: string): unknown {
  const result = parser.parse(xml) as Record<string, any>;

  // 데이터 요소 (DTEL/DE)
  const wb = result['blue:wbobj'];
  if (wb?.['dtel:dataElement']) {
    const dtel = wb['dtel:dataElement'];
    return {
      name: wb['adtcore:name'],
      objectType: 'data_element',
      description: wb['adtcore:description'],
      dataType: dtel['dtel:dataType'],
      // 구는 parseInt를 그대로 쓴다 — 값이 없으면 NaN이고, JSON에서는 null이 된다.
      length: parseInt(dtel['dtel:dataTypeLength'], 10),
      decimals: parseInt(dtel['dtel:dataTypeDecimals'], 10),
      domain: dtel['dtel:typeName'],
      package: wb['adtcore:packageRef']?.['adtcore:name'] || null,
      labels: {
        short: dtel['dtel:shortFieldLabel'],
        medium: dtel['dtel:mediumFieldLabel'],
        long: dtel['dtel:longFieldLabel'],
        heading: dtel['dtel:headingFieldLabel'],
      },
    };
  }

  // 도메인 (DOMA/DD) — repository informationsystem 응답
  const properties = result['opr:objectProperties'];
  if (properties?.['opr:object']) {
    const object = properties['opr:object'];
    return {
      name: object.name,
      objectType: 'domain',
      description: object.text,
      package: object.package,
      type: object.type,
    };
  }

  // 테이블 타입은 구에서도 미구현 — 원문을 그대로 돌려준다.
  return { raw: result };
}

/** 구 `parseStructureInfoXml`(`:91-109`) 그대로. */
export function parseStructureInfoXml(xml: string): unknown {
  const result = parser.parse(xml) as Record<string, any>;
  const wb = result['blue:wbobj'] || {};

  return {
    name: wb['adtcore:name'] || null,
    objectType: 'structure',
    description: wb['adtcore:description'] || null,
    package: wb['adtcore:packageRef']?.['adtcore:name'] || null,
    resolved_as: 'structure_fallback',
    raw: result,
  };
}

export const getTypeInfo = defineTool(
  {
    name: 'GetTypeInfo',
    description:
      '[read-only] Retrieve ABAP type information for domains (DOMA), data elements (DTEL), table types, and structures. Returns field definitions, value ranges, fixed values, and DDIC metadata.',
    inputSchema: {
      type_name: z.string().describe('Name of the ABAP type'),
      include_structure_fallback: z
        .boolean()
        .optional()
        .describe(
          'When true (default), tries DDIC structure lookup only if type lookup returns 404/empty.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    // read라 필수는 아니지만, 대상 이름을 받으므로 적어 둔다 — 녹화 사전 검사가
    // 그만큼 넓어진다(`ADDING-A-TOOL.md` 3단계).
    targetNames: ['type_name'],
  },
  async (context, args) => {
    // 구는 `include_structure_fallback !== false`를 **바깥에서** 먼저 읽는다.
    const includeStructureFallback = args.include_structure_fallback !== false;

    if (!args.type_name) {
      // 구는 McpError를 던져 자기 catch에서 `ADT error: ${String(error)}`로 접었다.
      // `String(McpError)`는 이름까지 붙은 이 문구가 된다.
      context.logger.error('Invalid parameters for GetTypeInfo');
      return failure('ADT error: McpError: MCP error -32602: Type name is required');
    }

    try {
      const client = await context.getConnection();
      const typeName = args.type_name;
      const encoded = encodeURIComponent(typeName);
      // 이 한 자리만 소문자다 — 구의 실측(`handleGetTypeInfo.ts:193-195`).
      const uri = encodeURIComponent(`/sap/bc/adt/ddic/domains/${typeName.toLowerCase()}`);

      /** 후보 하나를 물어본다. 404·빈 결과는 `null`, 그 밖의 오류는 던진다. */
      const tryLookup = async (
        path: string,
        parse: (xml: string) => unknown,
      ): Promise<unknown | null> => {
        let body: string;
        try {
          // `accept`를 주지 않는다 — 구가 그렇고, 기본값이 같은 문자열이다.
          const response = await client.request({ method: 'GET', path, timeout: 'default' });
          body = response.body;
        } catch (error) {
          if (error instanceof AdtError && error.status === 404) return null;
          throw error;
        }

        if (!hasUsableResult(asString(body))) return null;
        const payload = parse(body);
        if (!hasUsableResult(payload)) return null;
        return payload;
      };

      const lookups: readonly { label: string; path: string; parse: (xml: string) => unknown }[] = [
        { label: 'domain', path: `/sap/bc/adt/ddic/domains/${encoded}/source/main`, parse: parseTypeInfoXml },
        { label: 'data element', path: `/sap/bc/adt/ddic/dataelements/${encoded}`, parse: parseTypeInfoXml },
        { label: 'table type', path: `/sap/bc/adt/ddic/tabletypes/${encoded}`, parse: parseTypeInfoXml },
        {
          label: 'repository information system',
          path: `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${uri}`,
          parse: parseTypeInfoXml,
        },
      ];

      for (const lookup of lookups) {
        context.logger.debug(`Trying ${lookup.label} lookup for ${typeName}`);
        const payload = await tryLookup(lookup.path, lookup.parse);
        if (payload !== null) return ok(JSON.stringify(payload));
      }

      if (includeStructureFallback) {
        context.logger.debug(
          `Type lookups returned 404/empty for ${typeName}, trying structure fallback`,
        );
        const payload = await tryLookup(
          `/sap/bc/adt/ddic/structures/${encoded}`,
          parseStructureInfoXml,
        );
        if (payload !== null) return ok(JSON.stringify(payload));
      }

      return failure(
        `Type ${typeName} was not found as domain, data element, table type, or structure.`,
      );
    } catch (error) {
      context.logger.error(`Failed to resolve type info for ${args.type_name}`);
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
