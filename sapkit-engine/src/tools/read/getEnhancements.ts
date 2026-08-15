/**
 * GetEnhancements — 오브젝트 하나에 붙은 인핸스먼트 **목록**.
 *
 * 묶음 세 도구의 갈림은 `getEnhancementSpot.ts` 머리주석에 적었다. 이 도구만
 * 스팟 이름을 모른 채 **오브젝트 이름**으로 출발하고, 그래서 이 도구만 본 요청
 * 앞에 **오브젝트 종류를 알아내는 왕복**이 최대 세 번 붙는다.
 *
 * ## 와이어 (구 `handleGetEnhancements.ts`)
 *
 * 1단계 — 종류 판별(`determineObjectTypeAndPath`, `:158-282`). 순서가 계약이다:
 *
 * | 순서 | 요청 | 200이면 |
 * |---|---|---|
 * | ① | `GET /sap/bc/adt/oo/classes/{name}` | `class` |
 * | ② | `GET /sap/bc/adt/programs/programs/{name}` | `program` |
 * | ③ | `GET /sap/bc/adt/programs/includes/{name}` | `include` |
 *
 * ①②는 **각자 try/catch에 싸여** 있어 실패하면 다음으로 넘어간다(`:188`·`:213`).
 * ③은 싸여 있지 않다 — 여기서 던지면 바깥 catch가 문장을 갈아 끼운다(`:272-281`).
 * 셋 다 타임아웃 선택자가 `'csrf'`인데, 이것은 **CSRF 취득 지시가 아니라 짧은
 * 타임아웃 값의 이름**이다(`engine/src/lib/utils.ts:906-911` — 넷째 인자는
 * `timeoutType`). GET이라 어느 쪽에서도 토큰 왕복은 일어나지 않는다.
 *
 * 2단계 — 본 요청(`getEnhancementsForSingleObject`, `:487-542`):
 * `GET {basePath}/source/main/enhancements/elements`, 타임아웃 `default`.
 * **인클루드일 때만** `?context=…`가 붙고, 그 값은 ③의 응답에서 캐낸
 * `include:contextRef … adtcore:uri="…"`다(`:243-251`).
 *
 * 복원 경로는 겉 핸들러 → `engine/src/lib/utils.ts:902-958` →
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-219`.
 * 거기서 확인한 것: URL은 `baseUrl + endpoint`(`:143`), 호출자가 `Accept`를 주지
 * 않으면 접속 계층 기본값이 붙는다(`:160-165`) — 신 엔진의 `DEFAULT_ACCEPT`
 * (`src/adt/client.ts:51`)가 같은 문자열이다.
 *
 * ①②③이 넘기는 `{ Accept: … }`는 **다섯째 인자(`data`)**라 헤더로 나가지
 * 않는다 — 장부 D76. 본 요청은 애초에 `Accept`를 주지 않는다.
 *
 * ## 선언에 없는 인자는 **구에서도 죽어 있었다** (차이가 아니다)
 *
 * 구 핸들러는 `program`·`include_nested`·`detailed`·`timeout`·`max_includes`·
 * `filePath`를 읽고, 그중 `include_nested`에는 인클루드 전체를 훑는 큰 갈래가
 * 달려 있다(`:677-799`). 그러나 **발행 선언(`inputSchema`)에는 그 여섯이 없다.**
 * 구 서버도 신 서버도 선언을 zod raw shape으로 SDK에 넘기고
 * (구 `BaseMcpServer.ts:469-505` → `lib/handlers/utils/schemaUtils.ts:56-209` /
 * 신 `src/server/core.ts:241-243`), SDK는 `z.object(shape)`으로 인자를 파싱한다
 * (`@modelcontextprotocol/sdk/dist/cjs/server/zod-compat.js:49-60`·`mcp.js:170-177`).
 * zod의 기본은 **모르는 키를 버리는 것**이라 그 여섯은 핸들러에 닿은 적이 없다.
 * 두 엔진의 SDK·zod 판이 같으므로(양쪽 `@modelcontextprotocol/sdk ^1.27.1` ·
 * `zod ^4.3.6`) 결론도 같다.
 *
 * 그래서 이 모듈은 **닿을 수 있는 길만** 짓는다: `include_nested` 없음 →
 * 단일 오브젝트, `detailed` 없음 → 축약 응답. 안 지은 것이 아니라 **없는 것**이므로
 * 장부에 올리지 않는다. 계약 시험의 「선언 밖 인자」 절이 이것을 못 박는다.
 *
 * ## `object_type`은 받지만 쓰지 않는다
 *
 * 발행 선언은 `object_type`을 **필수**로 잡는데(채록본 그대로), 구 핸들러는 그
 * 값을 한 번도 읽지 않는다 — 종류는 위 ①②③으로 직접 알아낸다. 선언은 채록본과
 * 글자 일치해야 하므로 지울 수 없고, 동작은 구 그대로 무시다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { failure, ok } from './internal/results';

type ObjectKind = 'program' | 'include' | 'class';

interface ResolvedObject {
  readonly kind: ObjectKind;
  readonly basePath: string;
  readonly context?: string;
}

interface EnhancementImplementation {
  name: string;
  type: string;
  sourceCode?: string;
}

/** 비전역 정규식 하나로 첫 포획을 꺼낸다. 매치가 없으면 `undefined`. */
function capture(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

/**
 * 인핸스먼트 표를 긁는다 — 구 `parseEnhancementsFromXml`
 * (`handleGetEnhancements.ts:60-150`).
 *
 * **구의 정규식은 이름을 거의 못 찾는다.** 그 성질을 그대로 옮겼다:
 *
 *  - 이름 후보 ①②③(`adtcore:name` · `enh:name` · `name`)은 전부 `[^>]*$`로
 *    끝난다. 매치 지점부터 `<enh:source` 직전까지 `>`가 하나도 없어야 한다는
 *    뜻인데, 부모 태그가 닫히려면 `>`가 반드시 낀다 — **정상 XML에서는 셋 다
 *    발화하지 않는다.**
 *  - 그래서 실제로 도는 것은 후보 ④뿐이고, 그것은 **앵커가 없다.** 비전역
 *    매치라 앞부분 전체에서 **첫** `<… enhancement … name="…" …>`를 잡으므로
 *    항목이 여럿이어도 **전부 같은 이름**을 받는다.
 *  - 종류(`type`) 후보는 셋 다 `[^>]*$` 앵커라 하나도 발화하지 않는다 —
 *    **`type`은 언제나 `'enhancement'`**다.
 *  - 후보 ④마저 없으면 이름은 `enhancement_1`, `enhancement_2` … 로 매겨진다.
 *
 * 고치지 않는 이유는 `GetTransaction`과 같다 — 다른 이름을 뽑는 것은 이식이
 * 아니라 새 기능이고, 무엇이 옳은지 판정할 실 시스템 근거가 이 판에 없다.
 * 계약 시험의 「이름·종류 규칙」 절이 이 성질을 글자로 붙잡는다.
 */
function parseEnhancements(xml: string): EnhancementImplementation[] {
  const enhancements: EnhancementImplementation[] = [];
  const sources = /<enh:source[^>]*>([^<]*)<\/enh:source>/g;

  let index = 0;
  for (let hit = sources.exec(xml); hit !== null; hit = sources.exec(xml)) {
    const before = xml.slice(0, hit.index);

    // `??`인 것은 의도다 — 구는 매치 **배열**의 유무로 다음 후보를 정하므로,
    // 포획이 빈 문자열이면 거기서 멈추고 기본값을 쓴다.
    const name =
      capture(before, /adtcore:name="([^"]*)"[^>]*$/) ??
      capture(before, /enh:name="([^"]*)"[^>]*$/) ??
      capture(before, /name="([^"]*)"[^>]*$/) ??
      capture(before, /<[^>]*enhancement[^>]*name="([^"]*)"[^>]*>/i);
    const type =
      capture(before, /adtcore:type="([^"]*)"[^>]*$/) ??
      capture(before, /enh:type="([^"]*)"[^>]*$/) ??
      capture(before, /type="([^"]*)"[^>]*$/);

    const enhancement: EnhancementImplementation = {
      name: name ? name : `enhancement_${index + 1}`,
      type: type ? type : 'enhancement',
    };

    const encoded = hit[1];
    if (encoded) enhancement.sourceCode = Buffer.from(encoded, 'base64').toString('utf-8');

    enhancements.push(enhancement);
    index += 1;
  }

  return enhancements;
}

/**
 * 오브젝트 종류와 인핸스먼트 경로를 알아낸다 — 구
 * `determineObjectTypeAndPath`(`:158-282`)를 옮겼다.
 *
 * 구는 자기 문장(`McpError`)과 남의 오류(axios)를 바깥 catch에서 `instanceof`로
 * 갈랐다(`:272-281`). 신 엔진에는 그 표식이 없으므로 **던지는 자리를 갈라** 같은
 * 결과를 낸다 — 문장 셋의 글자는 구 그대로다.
 */
async function resolveObject(client: AdtClient, objectName: string): Promise<ResolvedObject> {
  const encoded = encodeObjectName(objectName);

  try {
    const asClass = await client.request({
      method: 'GET',
      path: `/sap/bc/adt/oo/classes/${encoded}`,
      timeout: 'csrf',
    });
    if (asClass.status === 200) {
      return {
        kind: 'class',
        basePath: `/sap/bc/adt/oo/classes/${encoded}/source/main/enhancements/elements`,
      };
    }
  } catch {
    // 클래스가 아니다 — 프로그램으로 물어본다(구 `:188-191`).
  }

  try {
    const asProgram = await client.request({
      method: 'GET',
      path: `/sap/bc/adt/programs/programs/${encoded}`,
      timeout: 'csrf',
    });
    if (asProgram.status === 200) {
      return {
        kind: 'program',
        basePath: `/sap/bc/adt/programs/programs/${encoded}/source/main/enhancements/elements`,
      };
    }
  } catch {
    // 프로그램도 아니다 — 인클루드로 물어본다(구 `:213-216`).
  }

  let asInclude;
  try {
    asInclude = await client.request({
      method: 'GET',
      path: `/sap/bc/adt/programs/includes/${encoded}`,
      timeout: 'csrf',
    });
  } catch (error) {
    // 구는 이 실패를 바깥 catch에서 잡아 문장을 갈아 끼웠다(`:276-281`).
    throw new Error(
      `Failed to determine object type for: ${objectName}. ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (asInclude.status === 200) {
    // 구는 `program` 인자로 부모 문맥을 직접 줄 수 있게 지었지만 그 인자는 발행
    // 선언에 없어 핸들러에 닿지 않는다(머리주석 참조). 남는 길은 자동 판별뿐이다.
    const context = capture(asInclude.body, /include:contextRef[^>]+adtcore:uri="([^"]+)"/);
    if (!context) {
      throw new Error(
        `Could not determine parent program context for include: ${objectName}. ` +
          `No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
      );
    }
    return {
      kind: 'include',
      basePath: `/sap/bc/adt/programs/includes/${encoded}/source/main/enhancements/elements`,
      context,
    };
  }

  throw new Error(
    `Could not determine object type for: ${objectName}. ` +
      `Object is neither a valid class, program, nor include.`,
  );
}

/**
 * 축약 응답 — 구 `filterMinimalEnhancements`의 **단일 오브젝트 갈래**(`:576-597`).
 *
 * 소스는 500자 이하면 통째로, 넘으면 앞 200자 + `...[truncated]`다. 빈 소스는
 * 키 자체가 사라진다(구의 참 검사 → `undefined` → `JSON.stringify`에서 탈락).
 * `objects`가 달린 중첩 갈래는 `include_nested`로만 만들어지므로 여기 없다.
 */
function toMinimal(
  objectName: string,
  kind: ObjectKind,
  context: string | undefined,
  enhancements: readonly EnhancementImplementation[],
): Record<string, unknown> {
  return {
    object_name: objectName,
    object_type: kind,
    context,
    detailed: false,
    total_enhancements: enhancements.length,
    enhancements: enhancements.map((enhancement) => ({
      name: enhancement.name,
      type: enhancement.type,
      sourceCode: enhancement.sourceCode
        ? enhancement.sourceCode.length <= 500
          ? enhancement.sourceCode
          : `${enhancement.sourceCode.substring(0, 200)}...[truncated]`
        : undefined,
    })),
  };
}

export const getEnhancements = defineTool(
  {
    name: 'GetEnhancements',
    description: '[read-only] Retrieve a list of enhancements for a given ABAP object.',
    inputSchema: {
      object_name: z.string().describe('Name of the ABAP object'),
      object_type: z.string().describe('[read-only] Type of the ABAP object'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    // `object_type`은 종류지 이름이 아니다 — 대상 이름은 하나뿐이다.
    targetNames: ['object_name'],
  },
  async (context, args) => {
    try {
      // 스키마가 필수로 잡으므로 빈 문자열만이 이 갈래를 태운다(구 `:621-623`).
      if (!args.object_name) throw new Error('Object name is required');
      const objectName = args.object_name;

      const client = await context.getConnection();
      const resolved = await resolveObject(client, objectName);

      const response = await client.request({
        method: 'GET',
        path: resolved.basePath,
        // 구는 `url += '?context=' + encodeURIComponent(context)`로 붙였다(`:511`).
        // `buildAdtUrl`도 같은 인코딩을 쓰므로 나가는 질의 문자열이 같다.
        params: resolved.kind === 'include' && resolved.context ? { context: resolved.context } : undefined,
        timeout: 'default',
      });

      if (response.status !== 200 || response.body === '') {
        throw new Error(
          `Failed to retrieve enhancements for ${objectName}. Status: ${response.status}`,
        );
      }

      // 이 도구의 성공 응답은 구도 이미 `type: 'text'`였다(`:662-670`) —
      // 같은 묶음의 다른 둘(`type: 'json'`)과 다른 자리다.
      return ok(
        JSON.stringify(
          toMinimal(objectName, resolved.kind, resolved.context, parseEnhancements(response.body)),
        ),
      );
    } catch (error) {
      // 구와 같은 문구다 — 접두사 `ADT error: `가 계약의 일부(`:814-825`).
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
