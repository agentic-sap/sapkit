/**
 * 클래스의 **로컬 인클루드** 4종을 읽는 자리.
 *
 * ABAP 클래스 하나는 소스 한 벌 말고도 네 개의 인클루드를 달고 있다. ADT는
 * 그것들을 클래스 URI 아래 별도 자원으로 낸다:
 *
 * | 인클루드 | 담는 것 | 도구 |
 * |---|---|---|
 * | `definitions`     | private 섹션이 쓰는 타입 선언 | `GetLocalDefinitions` |
 * | `macros`          | 매크로 (구형 릴리스에만 있다) | `GetLocalMacros` |
 * | `testclasses`     | ABAP Unit 로컬 테스트 클래스 | `GetLocalTestClass` |
 * | `implementations` | 로컬 헬퍼 클래스·인터페이스·타입 | `GetLocalTypes` |
 *
 * **`local types`가 `implementations`인 것은 오타가 아니다** — ADT의 자원
 * 이름과 도구 이름이 어긋나 있고, 그 어긋남이 구 엔진의 실측 동작이다
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/read.js:134-146`
 * 의 `getClassImplementationsInclude`를 `AdtLocalTypes.read()`가 부른다 —
 * `dist/core/class/AdtLocalTypes.js:130-150`).
 *
 * ## 와이어 근거
 *
 * 네 갈래 전부 `dist/core/class/read.js:77-146`이 같은 모양으로 조립한다:
 *
 * ```
 * GET /sap/bc/adt/oo/classes/{encodeURIComponent(NAME)}/includes/{type}?version={active|workingArea}
 * Accept: text/plain            (dist/constants/contentTypes.js:16 ACCEPT_SOURCE)
 * ```
 *
 * **`version`의 값이 인자와 다르다.** 도구가 받는 것은 `active|inactive`인데
 * 나가는 질의 인자는 `active|workingArea`다(`read.js:79`·`:98`·`:117`·`:136`).
 * 소스 읽기(`?version=inactive`)와 규칙이 다르므로 접어 넣지 않는다.
 *
 * 이름은 **대문자 그대로** 나간다 — 잠금·쓰기 쪽이 소문자로 보내는 것과
 * 다르다(`dist/core/class/includes.js:80`은 `.toLowerCase()`를 붙인다).
 * 읽기와 쓰기가 서로 다른 URL을 쓰는 것이 구의 실측이고, 합치면 슬래시가 든
 * 이름에서 보내는 주소가 달라진다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import { AdtError } from '../../../adt';
import { adtStatusOf, encodeObjectName } from './adt';
import type { SourceVersion } from './adt';
import { messageOf } from './results';

/** ADT가 클래스 아래 내주는 인클루드 자원 이름. */
export type ClassIncludeType = 'definitions' | 'macros' | 'testclasses' | 'implementations';

/** 소스 읽기가 쓰던 `ACCEPT_SOURCE`와 같은 값. */
export const CLASS_INCLUDE_ACCEPT = 'text/plain';

/** 도구 인자(`active|inactive`)를 ADT 질의 인자(`active|workingArea`)로 옮긴다. */
export function includeVersionParam(version: SourceVersion): string {
  return version === 'inactive' ? 'workingArea' : 'active';
}

export function classIncludePath(className: string, includeType: ClassIncludeType): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(className)}/includes/${includeType}`;
}

/**
 * 인클루드 하나를 읽는다. **404는 `undefined`로 접어 돌려준다** — 벤더의
 * `read()` 넷이 전부 그렇게 지어져 있고(`AdtLocalTypes.js:144-146` 외 3종),
 * 그 덕분에 호출자는 "없음"을 오류가 아닌 값으로 받는다.
 */
export async function readClassInclude(
  client: AdtClient,
  className: string,
  includeType: ClassIncludeType,
  version: SourceVersion,
): Promise<AdtResponse | undefined> {
  try {
    return await client.request({
      method: 'GET',
      path: classIncludePath(className, includeType),
      params: { version: includeVersionParam(version) },
      accept: CLASS_INCLUDE_ACCEPT,
      timeout: 'default',
    });
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/** HTTP 406 갈래를 구가 도구마다 다르게 지었다 — 그 셋을 그대로 옮긴다. */
export type UnsupportedStyle =
  /** 상태·URL·응답 조각까지 붙인다 (`GetLocalDefinitions`·`GetLocalTypes`). */
  | 'detailed'
  /** 한 줄로 끝낸다 (`GetLocalTestClass`). */
  | 'plain'
  /** 406을 따로 다루지 않는다 (`GetLocalMacros`). */
  | 'none';

export interface IncludeFailureTexts {
  /** `Failed to read ${what}: …`에 들어가는 소문자 서술. 예: `local types`. */
  readonly what: string;
  /** 문장을 여는 대문자 주어. 예: `Local types`. */
  readonly subject: string;
  readonly unsupported: UnsupportedStyle;
}

/**
 * 읽기 실패 하나를 구와 같은 문구로 옮긴다.
 *
 * **404 갈래가 여기 없는 것은 의도다.** 구 핸들러에도 `status === 404` 가지가
 * 적혀 있지만 벤더 `read()`가 404를 먼저 삼켜 `undefined`로 돌려주므로 그
 * 가지에는 영영 닿지 않는다. 실제로 나오는 문구는 호출자가 던지는
 * `${subject} for ${NAME} not found`가 아래 기본 가지에 실린 것이다. 닿지 않는
 * 가지를 옮겨 적으면 "구와 같다"는 말이 시험으로 확인되지 않는 자리가 생긴다.
 */
export function classIncludeFailure(
  error: unknown,
  className: string,
  texts: IncludeFailureTexts,
): string {
  const status = adtStatusOf(error);

  if (status === 423) return `Class ${className} is locked by another user.`;

  if (status === 406 && texts.unsupported === 'plain') {
    return `${texts.subject} read not supported on this system (HTTP 406).`;
  }

  if (status === 406 && texts.unsupported === 'detailed') {
    const url = error instanceof AdtError ? error.url : undefined;
    const raw = error instanceof AdtError ? error.rawBody : undefined;
    const snippet = raw === undefined ? '' : raw.slice(0, 800);
    return (
      `${texts.subject} read not supported on this system (HTTP ${status}). ` +
      `${url ? `URL: ${url}. ` : ''}${snippet ? `Response: ${snippet}` : ''}`
    );
  }

  return `Failed to read ${texts.what}: ${messageOf(error)}`;
}
