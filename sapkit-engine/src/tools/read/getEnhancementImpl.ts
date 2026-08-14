/**
 * GetEnhancementImpl — 스팟 + 구현 이름으로 **구현 하나의 소스**.
 *
 * 묶음 세 도구의 갈림은 `getEnhancementSpot.ts` 머리주석에 적었다. 이 도구만
 * 인자를 **둘** 받고, 이 도구만 **소스 코드**를 돌려준다.
 *
 * ## 와이어 (구 `handleGetEnhancementImpl.ts`)
 *
 *  1. 본선 — `GET /sap/bc/adt/enhancements/{spot}/{name}/source/main` (`:132`),
 *     타임아웃 `default`, `Accept` 지정 없음 → 접속 계층 기본값.
 *  2. 폴백 — 본선이 200이 아니거나 본문이 비면 스팟 메타데이터를 한 번 더 문다:
 *     `GET /sap/bc/adt/enhancements/{spot}` (`:171`). **`enhsxsb`가 없다** —
 *     `GetEnhancementSpot`이 무는 주소(`/enhancements/enhsxsb/{spot}`)와 다르다.
 *
 * 복원 경로는 `getEnhancementSpot.ts`와 같다: 겉 핸들러 →
 * `engine/src/lib/utils.ts:902-958` →
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-219`.
 * 폴백 호출의 `{ Accept: … }`도 다섯째 인자(`data`)에 놓여 있어 헤더로 나가지
 * 않는다 — 장부 D76.
 *
 * ## 폴백이 실제로 언제 도는가 (구의 주석과 다르다)
 *
 * 구 주석은 "구현을 못 찾으면 스팟 메타데이터로 폴백한다"고 말하지만, 구의
 * 접속 계층은 axios라 **4xx·5xx에서 던진다**. 즉 진짜 not-found(404)는
 * 폴백에 닿지 못하고 `catch`로 빠져 `ADT error: …`가 된다. 폴백이 도는 것은
 * **200인데 본문이 빈** 경우(그리고 200이 아닌 2xx)뿐이다.
 *
 * 신 엔진의 `AdtClient.request()`도 `status >= 400`에서 던지므로
 * (`src/adt/client.ts:296`) 같은 자리에서 같은 갈래가 갈린다. 그래서 이 도구는
 * 그 좁은 조건을 **그대로** 옮겼다 — 넓히면 구가 내지 않던 응답을 내게 된다.
 * 계약 시험의 「폴백」 절이 그 조건을 못 박는다.
 *
 * ## 구와 다른 것 (등재된 차이)
 *
 * 구는 성공·폴백 응답을 `{ type: 'json', json: … }`로 실었다(`:153-161`·`:194-208`).
 * `json`은 MCP 규약의 콘텐츠 종류가 아니므로 같은 객체를 `JSON.stringify`해
 * text 하나에 싣는다 — 장부 D36.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { failure, ok } from './internal/results';

/**
 * 구현 소스를 꺼낸다 — 구 `parseEnhancementSourceFromXml`
 * (`handleGetEnhancementImpl.ts:45-84`).
 *
 * 갈래 셋을 순서대로 본다.
 *  1. `<source>`/`<enh:source>` 안의 **base64** — 디코드해서 돌려준다.
 *  2. 같은 태그 안의 **CDATA** — 그대로 돌려준다.
 *  3. 둘 다 아니면 **원문 XML 전체**를 돌려준다(구의 마지막 폴백).
 *
 * 구가 base64 디코드를 `try`로 감싼 것은 무의미하다 — `Buffer.from(…, 'base64')`는
 * 던지지 않고 알아볼 수 없는 글자를 버린다. 그래서 그 `catch`는 여기 없다.
 * **결과가 같은 구현 차이이므로 등재할 차이가 아니다.**
 */
function parseEnhancementSource(xml: string): string {
  const base64 = /<(?:source|enh:source)[^>]*>([^<]*)<\/(?:source|enh:source)>/.exec(xml);
  if (base64?.[1]) return Buffer.from(base64[1], 'base64').toString('utf-8');

  const cdata =
    /<(?:source|enh:source)[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/(?:source|enh:source)>/.exec(
      xml,
    );
  if (cdata?.[1]) return cdata[1];

  return xml;
}

export const getEnhancementImpl = defineTool(
  {
    name: 'GetEnhancementImpl',
    description:
      '[read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.',
    inputSchema: {
      enhancement_spot: z.string().describe('Name of the enhancement spot'),
      enhancement_name: z.string().describe('[read-only] Name of the enhancement implementation'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['enhancement_spot', 'enhancement_name'],
  },
  async (context, args) => {
    try {
      // 스키마가 둘 다 필수로 잡으므로 빈 문자열만이 이 갈래를 태운다. 문장은
      // 구 그대로다(`:109-121`) — 검사 순서도 spot이 먼저다.
      if (!args.enhancement_spot) throw new Error('Enhancement spot is required');
      if (!args.enhancement_name) throw new Error('Enhancement name is required');

      const enhancementSpot = args.enhancement_spot;
      const enhancementName = args.enhancement_name;
      const client = await context.getConnection();

      const response = await client.request({
        method: 'GET',
        path:
          `/sap/bc/adt/enhancements/${encodeObjectName(enhancementSpot)}` +
          `/${encodeObjectName(enhancementName)}/source/main`,
        timeout: 'default',
      });

      if (response.status === 200 && response.body !== '') {
        return ok(
          JSON.stringify({
            enhancement_spot: enhancementSpot,
            enhancement_name: enhancementName,
            source_code: parseEnhancementSource(response.body),
          }),
        );
      }

      // 폴백 — 스팟 자체의 메타데이터. 주소에 `enhsxsb`가 없는 것이 구다.
      const spotResponse = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/enhancements/${encodeObjectName(enhancementSpot)}`,
        timeout: 'default',
      });

      if (spotResponse.status === 200 && spotResponse.body !== '') {
        // 구는 **원소 형태** `<adtcore:description>…</adtcore:description>`만 본다
        // (`:187-192`). 실제 ADT 스팟 XML은 속성 형태(`adtcore:description="…"`)라
        // 이 자리는 대개 빈 객체로 남는다 — 구의 성질을 그대로 옮긴다.
        const metadata: { description?: string } = {};
        const description = /<adtcore:description>([^<]*)<\/adtcore:description>/.exec(
          spotResponse.body,
        )?.[1];
        if (description) metadata.description = description;

        return ok(
          JSON.stringify({
            enhancement_spot: enhancementSpot,
            enhancement_name: enhancementName,
            status: 'not_found',
            message: `Enhancement implementation ${enhancementName} not found in spot ${enhancementSpot}.`,
            spot_metadata: metadata,
          }),
        );
      }

      throw new Error(
        `Failed to retrieve enhancement ${enhancementName} from spot ${enhancementSpot}. ` +
          `Status: ${response.status}. Fallback to retrieve spot metadata also failed. ` +
          `Status: ${spotResponse.status}`,
      );
    } catch (error) {
      // 구와 같은 문구다 — 접두사 `ADT error: `가 계약의 일부(`:223-234`).
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
