/**
 * GetEnhancementSpot — 인핸스먼트 **스팟 하나**의 메타데이터.
 *
 * 이 묶음 세 도구의 갈림은 **무엇을 하나로 세는가**다.
 *  - `GetEnhancements`   — 오브젝트 하나에 붙은 인핸스먼트 **목록**(스팟을 모른다).
 *  - `GetEnhancementSpot` — **스팟 하나**의 선언·BAdI 정의·링크 (구현 소스가 아니다).
 *  - `GetEnhancementImpl` — 스팟 + 구현 이름으로 **구현 하나의 소스**.
 *
 * 주소도 셋이 서로 다르다. 이 도구만 `enhsxsb` 한 마디를 낀다 —
 * `GetEnhancementImpl`이 폴백으로 무는 스팟 주소는 그 마디가 **없는**
 * `/sap/bc/adt/enhancements/{spot}`이다(구 `handleGetEnhancementImpl.ts:171`).
 * 같은 개념에 주소가 둘이지만 구가 그렇게 지었고, 여기서 합치지 않는다.
 *
 * ## 와이어 동작을 어디서 복원했나
 *
 * 겉 핸들러 `engine/src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts:150-158`
 * → `engine/src/lib/utils.ts:902-921`(`makeAdtRequestWithTimeout`)
 * → `engine/src/lib/utils.ts:941-958`(`makeAdtRequest` → `connection.makeAdtRequest`)
 * → `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-219`.
 *
 * 거기서 확인한 것:
 *  - URL = `baseUrl + endpoint` (`:143`)
 *  - 호출자가 `Accept`를 주지 않으면 접속 계층의 기본 Accept가 붙는다(`:160-165`).
 *    신 엔진의 `DEFAULT_ACCEPT`(`src/adt/client.ts:51`)가 **같은 문자열**이다.
 *  - GET이라 CSRF 취득도 상태유지 세션 헤더도 붙지 않는다(`:146-159`·`:174-179`).
 *
 * ## 구가 준 `Accept`는 와이어에 나간 적이 없다 (장부 D76)
 *
 * 구 핸들러는 `{ Accept: 'application/vnd.sap.adt.enhancements.v1+xml' }`를 넘기는데,
 * 그 자리는 **다섯째 위치 인자 `data`**이지 일곱째 `headers`가 아니다
 * (`utils.ts:902-910`의 시그니처 — `(connection, url, method, timeoutType, data,
 * params, headers)`). 구 트리 전체에서 헤더를 제대로 넘기는 호출은
 * `undefined, undefined`를 끼워 일곱째에 놓는다(예:
 * `engine/src/handlers/atc/readonly/handleGetAtcFindings.ts:107-117`). 이 어긋남은
 * **인핸스먼트 묶음 세 파일의 다섯 호출에만** 있다.
 *
 * 그래서 구가 실제로 보낸 것은 ⑴ 기본 Accept와 ⑵ GET에 실린
 * `{"Accept":"…"}` JSON 본문이다(`AbstractAbapConnection.js:217-219` —
 * `data !== undefined`면 메서드와 무관하게 `requestConfig.data`에 실린다).
 * 신 엔진은 ⑴을 그대로 두고 ⑵만 보내지 않는다. 자세한 것은
 * `harness/DIVERGENCES.md`의 D76.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { failure, ok } from './internal/results';

/** 비전역 정규식 하나로 첫 포획을 꺼낸다. 매치가 없으면 `undefined`. */
function capture(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

interface BadiDefinition {
  readonly name: string | undefined;
  readonly shorttext: string | undefined;
  readonly interface: string | undefined;
}

interface SpotLink {
  readonly href: string | undefined;
  readonly rel: string | undefined;
  readonly type: string | undefined;
  readonly title: string | undefined;
}

/**
 * 스팟 XML에서 메타데이터를 긁는다 — 구 `parseEnhancementSpotMetadata`
 * (`handleGetEnhancementSpot.ts:44-110`)를 그대로 옮겼다.
 *
 * 정규식 파서라서 성질이 둘 있고, 둘 다 구의 성질이다:
 *  - `name`·`description`·`type`은 문서 **전체의 첫 매치**다. 루트 원소가 아니라
 *    어디에 있든 처음 나온 값이 실린다.
 *  - `interface`도 마찬가지라, 루트에 선언이 없고 BAdI 정의 안에만 있으면
 *    그 안쪽 값이 최상위 `interface`로 올라온다.
 *
 * 빈 문자열은 싣지 않는다(구의 `if (m?.[1])` 참 검사). 반대로 `badi_definitions`·
 * `links`의 원소는 항목별 매치 실패를 `undefined`로 남기며, 그 키는
 * `JSON.stringify`에서 사라진다 — 구도 같은 값을 같은 자리에서 잃었다.
 */
function parseSpotMetadata(xml: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  const name = capture(xml, /adtcore:name="([^"]*)"/);
  if (name) metadata['name'] = name;
  const description = capture(xml, /adtcore:description="([^"]*)"/);
  if (description) metadata['description'] = description;
  const type = capture(xml, /adtcore:type="([^"]*)"/);
  if (type) metadata['type'] = type;
  const packageName = capture(xml, /adtcore:packageRef[^>]+adtcore:name="([^"]*)"/);
  if (packageName) metadata['package'] = packageName;
  const interfaceName = capture(xml, /<enhs:interface[^>]*adtcore:name="([^"]*)"/);
  if (interfaceName) metadata['interface'] = interfaceName;

  const badiDefinitions: BadiDefinition[] = [];
  const badiBlocks = /<enhs:badiDefinition[\s\S]*?<\/enhs:badiDefinition>/g;
  for (let hit = badiBlocks.exec(xml); hit !== null; hit = badiBlocks.exec(xml)) {
    const block = hit[0];
    badiDefinitions.push({
      name: capture(block, /enhs:name="([^"]*)"/),
      shorttext: capture(block, /enhs:shorttext="([^"]*)"/),
      interface: capture(block, /<enhs:interface[^>]*adtcore:name="([^"]*)"/),
    });
  }
  if (badiDefinitions.length > 0) metadata['badi_definitions'] = badiDefinitions;

  const links: SpotLink[] = [];
  // 공백 하나와 자기닫음(`/>`)까지가 구의 형태다. `<atom:link>…</atom:link>`는 안 잡는다.
  const linkTags = /<atom:link ([^>]+)\/>/g;
  for (let hit = linkTags.exec(xml); hit !== null; hit = linkTags.exec(xml)) {
    const attributes = hit[1] ?? '';
    links.push({
      href: capture(attributes, /href="([^"]*)"/),
      rel: capture(attributes, /rel="([^"]*)"/),
      type: capture(attributes, /type="([^"]*)"/),
      title: capture(attributes, /title="([^"]*)"/),
    });
  }
  if (links.length > 0) metadata['links'] = links;

  return metadata;
}

export const getEnhancementSpot = defineTool(
  {
    name: 'GetEnhancementSpot',
    description:
      '[read-only] Retrieve metadata and list of implementations for a specific enhancement spot.',
    inputSchema: {
      enhancement_spot: z.string().describe('Name of the enhancement spot'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    // read에는 요구되지 않지만 구체적인 오브젝트 이름을 받으므로 적어 둔다 —
    // 녹화 사전 검사가 그만큼 넓어진다.
    targetNames: ['enhancement_spot'],
  },
  async (context, args) => {
    try {
      // 스키마가 필수로 잡으므로 빠진 인자는 여기 닿지 않는다. 빈 문자열만이
      // 이 갈래를 태우며, 그때 구도 같은 문장을 냈다(`:134-139`).
      if (!args.enhancement_spot) throw new Error('Enhancement spot is required');
      const enhancementSpot = args.enhancement_spot;

      const client = await context.getConnection();
      const response = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/enhancements/enhsxsb/${encodeObjectName(enhancementSpot)}`,
        timeout: 'default',
      });

      if (response.status !== 200 || response.body === '') {
        throw new Error(
          `Failed to retrieve metadata for enhancement spot ${enhancementSpot}. Status: ${response.status}`,
        );
      }

      // 구는 `{ type: 'json', json: … }`로 실었다(`:169-177`). `json`은 MCP 규약의
      // 콘텐츠 종류가 아니므로 규약대로 text 하나에 같은 객체를 싣는다 — 장부 D36.
      return ok(
        JSON.stringify({
          enhancement_spot: enhancementSpot,
          metadata: parseSpotMetadata(response.body),
        }),
      );
    } catch (error) {
      // 구와 같은 문구다 — 접두사 `ADT error: `가 계약의 일부(`:188-198`).
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
