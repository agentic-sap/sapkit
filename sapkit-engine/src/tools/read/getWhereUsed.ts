/**
 * GetWhereUsed — 오브젝트 하나를 쓰는 곳(교차참조)을 찾는다.
 *
 * ## 두 단계다 — Eclipse ADT와 같은 순서
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleGetWhereUsed.ts:71-79`)는
 * `createAdtClient(...).getUtils().getWhereUsedList(...)` 한 줄이고, 실제 왕복은
 * 안쪽 패키지에 있다 —
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:217-219` →
 * `dist/core/shared/whereUsed.js:159-330`. **POST가 두 번** 나간다.
 *
 * 1. **범위(scope) 질의** — `POST /sap/bc/adt/repository/informationsystem/usageReferences/scope?uri=…`
 *    (`whereUsed.js:170-179`). SAP이 "이 오브젝트는 어떤 종류들 안에서 찾을 수
 *    있고 그중 무엇이 기본 선택인가"를 XML로 돌려준다.
 * 2. **검색** — `POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=…`
 *    (`whereUsed.js:210-228`). 1의 응답을 **본문에 끼워** 보낸다.
 *
 * `uri` 질의 인자는 axios `params`가 아니라 `encodeURIComponent(objectUri)`로
 * 손수 이어 붙인 것이라 경로 구분자까지 전부 인코딩된다(`:169`·`:210`).
 *
 * ## `enable_all_types`가 하는 일 — 범위 XML을 통째로 뒤집는다
 *
 * 참이면 1의 응답에서 **`isSelected="false"`를 전부 `"true"`로 바꾼다**
 * (`whereUsed.js:50-53` — 정규식 전역 치환이다). Eclipse의 "select all"과 같은
 * 뜻이고, 거짓이면 SAP이 준 기본 선택을 그대로 쓴다. 어느 쪽이든 왕복 수는
 * 둘로 같다 — 참일 때는 바깥에서 범위를 받아 고쳐 넘기고(`:262-268`), 거짓일 때는
 * 검색 단계가 스스로 받아 온다(`:202-207`).
 *
 * ## 범위 응답을 검색 본문에 끼우는 방식 (글자 그대로 옮겼다)
 *
 * `whereUsed.js:213-217` — XML 선언을 지우고, 바깥 요소 이름만
 * `usageScopeResult` → `scope`로 갈아 끼운다. **여는 태그의 속성·이름공간 선언은
 * `[^>]*`에 먹혀 함께 사라진다.** 셋 다 `/g`가 없어 **첫 번째만** 바뀐다.
 * 이것이 의도인지 실수인지는 알 수 없으나 구의 실측이므로 그대로 옮겼다.
 *
 * ## 응답 파싱
 *
 * `XMLParser({ attributeNamePrefix: '@_', parseAttributeValue: false })`
 * (`whereUsed.js:14-18`) — 속성이 **문자열 그대로** 남으므로 `isResult`를
 * `=== 'true'`로 견준다(`:317`).
 *
 * 두 가지가 요점이다.
 *  - **뿌리 요소가 없어도 오류가 아니다**(`:279-288`). 빈 결과를 만들어 돌려준다.
 *  - **`DEVC/K`(패키지) 항목은 목록에서 빠지지만 `numberOfResults`에는 남는다**
 *    (`:307-308`). 그래서 `total_references >= references.length`가 정상이다.
 *    총계를 배열 길이로 다시 계산하면 구와 달라진다 — 하지 않는다.
 *
 * `object_name`·`object_type`은 **입력을 그대로 되비추는 값**이지 응답에서 온
 * 것이 아니다(`:324-325`).
 *
 * ## 구와 다른 것 (등재된 차이)
 *
 * 구는 `{ type: 'json', json: … }`로 실었다(`handleGetWhereUsed.ts:102-110`).
 * `json`은 MCP 규약의 콘텐츠 종류가 아니다 — 신 엔진은 규약대로 text 하나에
 * JSON 문자열을 싣는다. 장부 등재분의 「콘텐츠 종류」 항목 참조.
 *
 * 구는 결과를 `objectsListCache`에도 넣었다(`:111`). 신 엔진에는 그 캐시가 없다 —
 * `SearchObject`를 지을 때 이미 빠졌고, 그 캐시를 읽던 `GetObjectNodeFromCache`는
 * 아직 짓지 않은 도구다. 그 도구를 짓는 판이 캐시를 함께 결정해야 한다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { failure, ok } from './internal/results';

const SCOPE_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences/scope';
const SEARCH_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences';

/** `dist/constants/contentTypes.js:53-56`의 넷. */
const CT_SCOPE_REQUEST =
  'application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml';
const ACCEPT_SCOPE_RESPONSE =
  'application/vnd.sap.adt.repository.usagereferences.scope.response.v1+xml';
const CT_SEARCH_REQUEST = 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml';
const ACCEPT_SEARCH_RESULT = 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml';

const SCOPE_REQUEST_BODY =
  '<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageScopeRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageScopeRequest>';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
});

/**
 * 구 `buildObjectUri`(`whereUsed.js:83-130`) 그대로.
 *
 * 타입 이름은 소문자로 견주고, 같은 자리에 별칭이 둘씩 붙어 있다(`class`와
 * `clas/oc` 등). 목록에 없는 타입은 **던진다** — 조용히 넘어가지 않는다.
 */
export function buildObjectUri(objectName: string, objectType: string): string {
  const encoded = encodeURIComponent(objectName);
  switch (objectType.toLowerCase()) {
    case 'class':
    case 'clas/oc':
      return `/sap/bc/adt/oo/classes/${encoded}`;
    case 'program':
    case 'prog/p':
      return `/sap/bc/adt/programs/programs/${encoded}`;
    case 'include':
      return `/sap/bc/adt/programs/includes/${encoded}`;
    case 'function':
    case 'functiongroup':
    case 'fugr':
      return `/sap/bc/adt/functions/groups/${encoded}`;
    case 'functionmodule':
    case 'function_module':
    case 'fugr/ff': {
      // 함수모듈만 이름 하나에 둘이 들어 있다 — `GROUP|FM_NAME`.
      if (objectName.includes('|')) {
        const [group = '', fm = ''] = objectName.split('|');
        return `/sap/bc/adt/functions/groups/${encodeURIComponent(group)}/fmodules/${encodeURIComponent(fm)}`;
      }
      throw new Error('Function module name must be in format GROUP|FM_NAME');
    }
    case 'interface':
    case 'intf/if':
      return `/sap/bc/adt/oo/interfaces/${encoded}`;
    case 'package':
    case 'devc/k':
      return `/sap/bc/adt/packages/${encoded}`;
    case 'table':
    case 'tabl/dt':
      return `/sap/bc/adt/ddic/tables/${encoded}`;
    case 'structure':
    case 'stru/dt':
      return `/sap/bc/adt/ddic/structures/${encoded}`;
    case 'domain':
    case 'doma/dd':
      return `/sap/bc/adt/ddic/domains/${encoded}`;
    case 'dataelement':
    case 'dtel':
      return `/sap/bc/adt/ddic/dataelements/${encoded}`;
    case 'view':
    case 'ddls/df':
      return `/sap/bc/adt/ddic/ddl/sources/${encoded}`;
    default:
      throw new Error(`Unsupported object type for where-used: ${objectType}`);
  }
}

/** 구 `modifyWhereUsedScope(…, { enableAll: true })`(`whereUsed.js:50-53`). */
export function enableAllScopeTypes(scopeXml: string): string {
  return scopeXml.replace(/isSelected="false"/g, 'isSelected="true"');
}

/**
 * 범위 응답을 검색 본문에 끼울 조각으로 바꾼다(`whereUsed.js:213-216`).
 * 정규식 셋 다 `/g`가 없어 **첫 번째 일치만** 바뀐다 — 구 그대로다.
 */
export function scopeToRequestFragment(scopeXml: string): string {
  return scopeXml
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<usagereferences:usageScopeResult[^>]*>/, '<usagereferences:scope>')
    .replace(/<\/usagereferences:usageScopeResult>/, '</usagereferences:scope>');
}

export interface WhereUsedReference {
  readonly name: string;
  readonly type: string;
  readonly uri: string;
  readonly package_name?: string;
  readonly responsible?: string;
  readonly usage_information?: string;
}

/** 구 `parseWhereUsedXml`(`whereUsed.js:275-330`) + 핸들러의 필드 이름 바꾸기. */
export function parseWhereUsed(xml: string): {
  totalReferences: number;
  resultDescription: string;
  references: WhereUsedReference[];
} {
  const parsed = parser.parse(xml) as Record<string, any>;
  const root = parsed['usagereferences:usageReferenceResult'];

  // 뿌리가 없으면 빈 결과다. 오류가 아니다.
  if (!root) return { totalReferences: 0, resultDescription: '', references: [] };

  const totalReferences = parseInt(root['@_numberOfResults'] || '0', 10);
  const resultDescription = root['@_resultDescription'] || '';

  const container = root['usagereferences:referencedObjects'];
  const raw = container?.['usagereferences:referencedObject'];
  const items: any[] = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw];

  const references: WhereUsedReference[] = [];
  for (const item of items) {
    const adtObject = item?.['usagereferences:adtObject'];
    if (!adtObject) continue;
    const type = adtObject['@_adtcore:type'] || '';
    // 패키지는 담는 그릇이지 사용처가 아니다 — 목록에서 뺀다. 총계에는 남는다.
    if (type === 'DEVC/K') continue;
    const packageRef = adtObject['adtcore:packageRef'];
    references.push({
      name: adtObject['@_adtcore:name'] || '',
      type,
      uri: item['@_uri'] || '',
      package_name: packageRef?.['@_adtcore:name'],
      responsible: adtObject['@_adtcore:responsible'],
      usage_information: item['@_usageInformation'],
    });
  }

  return { totalReferences, resultDescription, references };
}

export const getWhereUsed = defineTool(
  {
    name: 'GetWhereUsed',
    description:
      '[read-only] Find where-used references (cross-references, usages, dependencies) for ABAP objects — classes, interfaces, tables, data elements, programs, function modules, etc. Returns list of all referencing objects with their types and packages.',
    inputSchema: {
      object_name: z.string().describe('Name of the ABAP object'),
      object_type: z
        .string()
        .describe('Type of the ABAP object (class, interface, program, table, etc.)'),
      enable_all_types: z
        .boolean()
        .optional()
        .describe(
          "If true, searches in all available object types (Eclipse 'select all' behavior). Default: false (uses SAP default scope)",
        ),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['object_name'],
  },
  async (context, args) => {
    try {
      // 구는 McpError를 던져 자기 catch에서 `ADT error: ${String(error)}`로 접었다.
      if (!args.object_name) {
        throw new Error('MCP_INVALID_PARAMS:Object name is required');
      }
      if (!args.object_type) {
        throw new Error('MCP_INVALID_PARAMS:Object type is required');
      }

      const client = await context.getConnection();
      context.logger.info(
        `Resolving where-used list for ${args.object_type}/${args.object_name}`,
      );

      const objectUri = buildObjectUri(args.object_name, args.object_type);
      const uriParam = encodeURIComponent(objectUri);

      // ① 범위 질의.
      const scopeResponse = await client.request({
        method: 'POST',
        path: `${SCOPE_PATH}?uri=${uriParam}`,
        body: SCOPE_REQUEST_BODY,
        contentType: CT_SCOPE_REQUEST,
        accept: ACCEPT_SCOPE_RESPONSE,
        timeout: 'default',
      });

      // `enable_all_types`면 선택을 전부 켠다. 아니면 SAP의 기본 선택 그대로.
      const scopeXml = args.enable_all_types
        ? enableAllScopeTypes(scopeResponse.body)
        : scopeResponse.body;

      // ② 검색 — 범위를 본문에 끼워 보낸다.
      const searchResponse = await client.request({
        method: 'POST',
        path: `${SEARCH_PATH}?uri=${uriParam}`,
        body:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
          '<usagereferences:affectedObjects/>' +
          scopeToRequestFragment(scopeXml) +
          '</usagereferences:usageReferenceRequest>',
        contentType: CT_SEARCH_REQUEST,
        accept: ACCEPT_SEARCH_RESULT,
        timeout: 'default',
      });

      const parsed = parseWhereUsed(searchResponse.body);
      context.logger.debug(
        `Where-used search completed for ${args.object_type}/${args.object_name}: ${parsed.totalReferences} references`,
      );

      return ok(
        JSON.stringify({
          // 입력을 되비추는 값이다 — 응답에서 온 것이 아니다.
          object_name: args.object_name,
          object_type: args.object_type,
          enable_all_types: args.enable_all_types || false,
          total_references: parsed.totalReferences,
          result_description: parsed.resultDescription,
          references: parsed.references,
        }),
      );
    } catch (error) {
      context.logger.error('Failed to resolve where-used references');
      // 인자 검증 실패만은 구의 McpError 문구를 그대로 되살린다.
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('MCP_INVALID_PARAMS:')) {
        const detail = message.slice('MCP_INVALID_PARAMS:'.length);
        return failure(`ADT error: McpError: MCP error -32602: ${detail}`);
      }
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
