/**
 * `GetScreensList`·`GetGuiStatusList`의 공통 몸통.
 *
 * 화면(dynpro)에도 GUI 상태에도 **ADT REST 하위 자원이 없다** — `/dynpros`나
 * `/gui_statuses` 같은 주소는 존재하지 않는다(구 두 핸들러의 머리주석
 * `engine/src/handlers/screen/readonly/handleGetScreensList.ts:4-5` ·
 * `engine/src/handlers/gui_status/readonly/handleGetGuiStatusList.ts:4-5`).
 * 그래서 둘 다 프로젝트 탐색기의 **오브젝트 구조**를 읽어 마디를 걸러 낸다.
 *
 * 두 도구가 갈리는 것은 낱말 넷뿐이라(마디 타입 · 결과 필드 이름 · 총계 필드
 * 이름 · 진단 문구) 여기 한 벌로 두고 도구 모듈이 그 넷을 준다 —
 * `src/tools/rfc-read/ddicRead.ts`가 같은 이유로 같은 모양이다.
 *
 * ## 와이어 (실측)
 *
 * 겉 핸들러(`:57-60`)는 `createAdtClient(...).getUtils().getObjectStructure('PROG/P', name)`
 * 하나만 부른다. 요청이 조립되는 자리는 안쪽 패키지다 —
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/objectStructure.js:27-45`:
 *
 *  - `GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=…`
 *  - 질의 문자열을 **손으로 이어 붙인다** — 인자 순서가 `objecttype` → `objectname`
 *    으로 고정된다.
 *  - `Accept: application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml`
 *  - **오브젝트 이름은 두 겹으로 인코딩된다** — `encodeURIComponent(encodeSapObjectName(name))`
 *    이고 `encodeSapObjectName` 자체가 `encodeURIComponent`다
 *    (`dist/utils/internalUtils.js:19-21`). 타입은 한 겹이다(`PROG/P` → `PROG%2FP`).
 *    구의 실측이므로 그대로 옮긴다 — `src/tools/read/getObjectStructure.ts`의
 *    같은 자리와 같은 판단이다.
 *
 * ## 걸러 내기 (실측)
 *
 * 마디의 `objecttype`이 찾는 값이고 `isfolder`가 참이 아닌 것만 고른다. **이름은
 * `objectname`이 아니라 `description`에 들어 있다**(`:96-97` — "Screen number is
 * in the description field"). 빈 문자열은 버린다.
 *
 * `parseTagValue` 기본값(참)이 문제가 되지 않는 이유: 읽는 것이 **속성**이고
 * `parseAttributeValue`의 기본값은 거짓이라 `"0100"`이 수 `100`으로 접히지 않는다.
 * 구도 같은 옵션 두 개만 주므로 결과가 같다.
 */

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient } from '../../../adt';
import type { ToolContext, ToolResult } from '../../../server/toolDefinition';
import { adtStatusOf } from './adt';
import { messageOf, ok, returnError } from './results';

/** 구 파서 옵션 그대로 — 속성 접두사가 없어 `objecttype` 등이 그대로 키가 된다. */
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export const OBJECT_STRUCTURE_ACCEPT =
  'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml';

/** 두 도구가 갈리는 낱말 전부. */
export interface ProgramNodeKind {
  /** 발행된 도구 이름. 진단 문구에만 쓴다. */
  readonly toolName: string;
  /** 찾는 마디의 ADT 오브젝트 타입 — `PROG/PS`(화면) | `PROG/PC`(GUI 상태). */
  readonly nodeType: string;
  /** 결과 원소의 키 — `screen_number` | `status_name`. */
  readonly itemField: string;
  /** 총계 필드 이름 — `total_screens` | `total_statuses`. */
  readonly totalField: string;
  /** 결과 배열 필드 이름 — `screens` | `statuses`. */
  readonly listField: string;
  /** 진단 문구의 명사구 — `screens` | `GUI statuses`. */
  readonly noun: string;
  /** 완료 로그의 단위 — `screens` | `statuses`. */
  readonly unit: string;
}

/**
 * 프로그램 하나의 오브젝트 구조에서 한 종류의 마디 이름을 걷는다.
 *
 * 실패를 밖으로 던지지 않는다 — 구와 같은 계약이다.
 */
export async function listProgramNodes(
  kind: ProgramNodeKind,
  context: ToolContext,
  rawProgramName: string | undefined,
): Promise<ToolResult> {
  try {
    if (!rawProgramName) {
      return returnError(new Error('program_name is required'));
    }

    const programName = rawProgramName.toUpperCase();
    context.logger.info(`Listing ${kind.noun} for program: ${programName}`);

    const client: AdtClient = await context.getConnection();
    // 두 겹 인코딩은 의도가 아니라 구의 실측이다 — 위 머리주석 참조.
    const encodedName = encodeURIComponent(encodeURIComponent(programName));
    const response = await client.request({
      method: 'GET',
      path:
        `/sap/bc/adt/repository/objectstructure` +
        `?objecttype=${encodeURIComponent('PROG/P')}&objectname=${encodedName}`,
      accept: OBJECT_STRUCTURE_ACCEPT,
      timeout: 'default',
    });

    const items: Array<Record<string, string>> = [];
    if (response.body) {
      const parsed = parser.parse(response.body) as Record<string, any>;
      const raw = parsed['projectexplorer:objectstructure']?.['projectexplorer:node'];
      // 마디가 하나도 없으면 구는 **빈 목록으로 성공**한다. 오류가 아니다.
      if (raw) {
        const nodes: unknown[] = Array.isArray(raw) ? raw : [raw];
        for (const node of nodes) {
          const record = (node ?? {}) as Record<string, unknown>;
          if (record['objecttype'] !== kind.nodeType) continue;
          if (record['isfolder'] === 'true' || record['isfolder'] === true) continue;
          // 이름은 `objectname`이 아니라 `description`에 들어 있다.
          const value = String(record['description'] ?? '').trim();
          if (value) items.push({ [kind.itemField]: value });
        }
      }
    }

    context.logger.info(
      `✅ ${kind.toolName} completed: ${programName} (${items.length} ${kind.unit})`,
    );

    return ok(
      JSON.stringify(
        {
          success: true,
          program_name: programName,
          [kind.totalField]: items.length,
          [kind.listField]: items,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    // 404는 구가 자기 문구로 갈아 끼우던 자리다 — **원문 인자 이름 그대로**이며
    // 대문자로 올리지 않는다(`handleGetScreensList.ts:125-127`).
    const message =
      adtStatusOf(error) === 404
        ? `Program ${rawProgramName} not found.`
        : messageOf(error);
    context.logger.error(`Error listing ${kind.noun}: ${message}`);
    return returnError(new Error(message));
  }
}
