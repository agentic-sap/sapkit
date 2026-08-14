/**
 * `GetAdtTypes` — 시스템이 아는 ADT 오브젝트 종류 목록.
 *
 * 구 핸들러: `engine/src/handlers/system/readonly/handleGetAllTypes.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getUtils().getAllTypes(999, '*', 'usedByProvider')` 한
 * 줄이고(`handleGetAllTypes.ts:83-85`), 실제 요청은 안쪽 패키지가 조립한다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:647-649`
 *   → `dist/core/shared/allTypes.js:20-35`
 *
 * 거기서 확인한 것:
 *
 * ```
 * GET /sap/bc/adt/repository/informationsystem/objecttypes
 *     ?maxItemCount=999&name=*&data=usedByProvider
 *     Accept: application/xml
 *     timeout: getTimeout('default')
 * ```
 *
 * 세 인자는 **겉 핸들러가 고정값으로 준다** — 발행 스키마의 `validate_type`은
 * 어느 인자에도 닿지 않는다(아래 「받아 놓고 쓰지 않는 인자」). GET이라 CSRF
 * 취득도 상태유지 헤더도 붙지 않는다.
 *
 * ## 받아 놓고 쓰지 않는 인자 — `validate_type` (구의 실측)
 *
 * 구 핸들러의 시그니처가 `(context, _args)`다(`:79`). 이름 앞의 밑줄이 그
 * 사실을 적어 둔 것이고, 본문 어디에도 `validate_type`이 나오지 않는다. 설명문의
 * "or validate a specific type name"은 **구현되지 않은 약속**이다. 발행 선언은
 * 채록본 글자 그대로 두어야 하므로 인자는 그대로 받고, **동작도 구 그대로**
 * 무시한다. 여기서 검증을 구현하면 구에 없던 기능이 생긴다.
 *
 * ## 파싱 — 두 파서 중 실제로 쓰이는 것은 하나다
 *
 * 구 파일에는 `_parseObjectTypesXml`(`opr:objectTypes`)과
 * `extractNamedItems`(`nameditem:namedItemList`) 둘이 있는데, 핸들러가 부르는
 * 것은 **`extractNamedItems` 하나**다(`:87`). 앞의 것은 이름 앞 밑줄이 말하듯
 * 죽은 코드라 옮기지 않았다.
 *
 * `extractNamedItems`가 뽑는 것은 `nameditem:namedItem` 하나당
 * `{ name: <nameditem:name>, description: <nameditem:description> }`이고,
 * 항목이 하나뿐이면 파서가 배열이 아니라 객체를 주므로 그 갈래를 따로 접는다
 * (`:63-75`). XML 파서 설정도 구 그대로다 — `ignoreAttributes: false` ·
 * `attributeNamePrefix: ''` · `parseAttributeValue: true` · `trimValues: true`.
 * **`parseTagValue`는 건드리지 않는다**(기본값 참) — 숫자처럼 생긴 본문이 수로
 * 바뀌는 것까지 구와 같아야 한다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 axios가 준 `response.data`를 파서에 넘겼고 신 접속 계층의 `body`는 언제나
 * 문자열이다. 이 엔드포인트는 XML을 돌려주므로 구에서도 문자열이었다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { ok, failure } from './internal/results';

/** `allTypes.js:31` — 질의 인자 뒤에 붙는 정보시스템 경로. */
export const OBJECT_TYPES_PATH = '/sap/bc/adt/repository/informationsystem/objecttypes';

/** `allTypes.js:34` — 겉 핸들러가 고정으로 주는 세 값(`handleGetAllTypes.ts:85`). */
export const OBJECT_TYPES_PARAMS = Object.freeze({
  maxItemCount: 999,
  name: '*',
  data: 'usedByProvider',
});

export const ACCEPT_OBJECT_TYPES = 'application/xml';

export interface AdtNamedItem {
  readonly name: unknown;
  readonly description: unknown;
}

/** 구 `extractNamedItems`(`handleGetAllTypes.ts:53-77`)와 같은 설정·같은 갈래. */
export function extractNamedItems(xml: string): AdtNamedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, any>;
  const items: AdtNamedItem[] = [];
  const namedItems = parsed?.['nameditem:namedItemList']?.['nameditem:namedItem'];
  if (Array.isArray(namedItems)) {
    for (const item of namedItems) {
      items.push({
        name: item?.['nameditem:name'],
        description: item?.['nameditem:description'],
      });
    }
  } else if (namedItems) {
    items.push({
      name: namedItems['nameditem:name'],
      description: namedItems['nameditem:description'],
    });
  }
  return items;
}

export const getAdtTypes = defineTool(
  {
    name: 'GetAdtTypes',
    description:
      '[read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.',
    inputSchema: {
      validate_type: z.string().describe('Type name to validate (optional)').optional(),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/system/readonly/`이고 채록본의 네 노출 조건 전부에 뜬다.
    sets: ['readonly'],
    kind: 'read',
  },
  async (context) => {
    try {
      const client = await context.getConnection();
      const response = await client.request({
        method: 'GET',
        path: OBJECT_TYPES_PATH,
        params: { ...OBJECT_TYPES_PARAMS },
        accept: ACCEPT_OBJECT_TYPES,
        timeout: 'default',
      });

      context.logger.info('Fetched ADT object types list');
      return ok(JSON.stringify(extractNamedItems(response.body)));
    } catch (error) {
      context.logger.error('Failed to fetch ADT object types');
      // 구 `:99-107` — `return_error`가 아니라 자기 문구다(`Error: ` 접두사가 없다).
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
