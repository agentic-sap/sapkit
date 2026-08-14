/**
 * 클래스 **로컬 인클루드 쓰기**의 공용 사슬.
 *
 * `UpdateLocalTestClass`(testclasses)와 `UpdateLocalTypes`(implementations)가
 * 같은 사슬을 탄다. 읽기 짝은 `../read/internal/classIncludes.ts`.
 *
 * ## 사슬 (구 실측 순서)
 *
 * ```
 * 1. LOCK   POST /sap/bc/adt/oo/classes/{소문자}?_action=LOCK&accessMode=MODIFY
 * 2. CHECK  POST /sap/bc/adt/checkruns?reporters=abapCheckRun   (제안 소스를 base64로)
 * 3. PUT    PUT  /sap/bc/adt/oo/classes/{소문자}/includes/{종류}?lockHandle=…[&corrNr=…]
 * 4. UNLOCK POST /sap/bc/adt/oo/classes/{소문자}?_action=UNLOCK&lockHandle=…
 * ```
 *
 * 근거: `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/`
 * 아래 `AdtLocalTypes.js:156-227`(사슬) · `lock.js:18`(잠금 URL) ·
 * `unlock.js:16`(해제 URL) · `includes.js:73-97`(PUT) · `check.js:155-196`(검사).
 * `AdtLocalTestClass.js:168-252`도 같은 모양이고, PUT 자리만
 * `testclasses.js:20-44`로 갈린다 — **주소는 같고 인클루드 이름만 다르다.**
 *
 * ## 이름을 소문자로 만드는 순서가 자리마다 다르다
 *
 * - PUT·잠금·해제·활성 — `encodeURIComponent(이름).toLowerCase()`
 *   (`includes.js:80` · `lock.js:18`).
 * - 검사(`/checkruns`)의 오브젝트 URI — `encodeURIComponent(이름.toLowerCase())`
 *   (`check.js:159` · `dist/utils/checkRun.js:20`).
 *
 * ASCII 이름에서는 같지만 `/NS/ZCL_X`처럼 슬래시가 든 이름에서는 `%2F`와
 * `%2f`로 갈린다. **합치지 않는다** — 합치면 구가 보내던 주소와 달라진다.
 */

import type { AdtClient } from '../../adt';
import { classUri, encodeObjectName, parseCheckRun } from './shared';
import { ACCEPT_CHECK_MESSAGES, CT_CHECK_OBJECTS, CT_SOURCE, ACCEPT_SOURCE } from './shared';

/** 쓰기가 닿는 인클루드 — 읽기 쪽 4종 중 이 둘만 도구가 있다. */
export type WritableClassInclude = 'testclasses' | 'implementations';

/** 검사 요청이 base64 아티팩트에 붙이는 콘텐츠 타입(`check.js:155`의 기본값). */
const ARTIFACT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/** `/checkruns`의 오브젝트 URI — **먼저 소문자로 바꾸고** 인코딩한다. */
export function classCheckUri(className: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(className.toLowerCase())}`;
}

/**
 * 인클루드 제안 소스를 얹은 검사 요청 본문.
 *
 * `shared.ts`의 `buildInlineCheckObjectList`와 모양이 비슷하지만 **같지 않다** —
 * 그쪽은 `chkrun:version`이 `active`로 박혀 있고 XML 선언 뒤에 줄바꿈이 하나
 * 더 있다. 인클루드 검사는 `inactive`로 나가므로(`check.js:108`의 기본 version)
 * 여기서 따로 조립한다.
 */
export function buildIncludeCheckBody(
  className: string,
  includeType: WritableClassInclude,
  source: string,
): string {
  const objectUri = classCheckUri(className);
  const includeUri = `${objectUri}/includes/${includeType}`;
  const encoded = Buffer.from(source, 'utf-8').toString('base64');
  return (
    `<?xml version="1.0" encoding="UTF-8"?><chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n` +
    `  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="inactive">\n` +
    `    <chkrun:artifacts>\n` +
    `      <chkrun:artifact chkrun:contentType="${ARTIFACT_CONTENT_TYPE}" chkrun:uri="${includeUri}">\n` +
    `        <chkrun:content>${encoded}</chkrun:content>\n` +
    `      </chkrun:artifact>\n` +
    `    </chkrun:artifacts>\n` +
    `  </chkrun:checkObject>\n` +
    `</chkrun:checkObjectList>`
  );
}

/**
 * 인클루드 검사. 오류가 있으면 **던진다** — 구 `checkClassInclude`가 그렇게
 * 지어져 있고(`check.js:186-194`), 그 덕분에 깨진 소스가 PUT까지 가지 않는다.
 * 문구의 주어(`Test class` / `Local types`)도 구가 자리마다 다르게 넘긴 값이다.
 */
export async function checkClassInclude(
  client: AdtClient,
  className: string,
  includeType: WritableClassInclude,
  source: string,
  subject: string,
): Promise<void> {
  const response = await client.request({
    method: 'POST',
    path: '/sap/bc/adt/checkruns',
    params: { reporters: 'abapCheckRun' },
    body: buildIncludeCheckBody(className, includeType, source),
    contentType: CT_CHECK_OBJECTS,
    accept: ACCEPT_CHECK_MESSAGES,
  });

  const result = parseCheckRun(response.body);
  if (result.errors.length > 0) {
    throw new Error(`${subject} check failed: ${result.errors.map((e) => e.text).join('; ')}`);
  }
}

/** 인클루드 소스 PUT. 잠금 손잡이가 없으면 나가지 않는다. */
export async function putClassInclude(
  client: AdtClient,
  className: string,
  includeType: WritableClassInclude,
  source: string,
  lockHandle: string,
  transportRequest?: string,
): Promise<void> {
  await client.request({
    method: 'PUT',
    path: `${classUri(className)}/includes/${includeType}`,
    params: { lockHandle, corrNr: transportRequest },
    body: source,
    contentType: CT_SOURCE,
    accept: ACCEPT_SOURCE,
  });
}

/**
 * 잠금 → 검사 → PUT → 해제 한 벌.
 *
 * 잠금 수명주기는 접속 계층의 `withLock`이 진다 — 실패 경로에서도 해제를
 * 보장한다. 구는 그 정리를 `catch` 블록에서 손으로 했다(`AdtLocalTypes.js:213-223`).
 */
export async function writeClassInclude(
  client: AdtClient,
  input: {
    readonly className: string;
    readonly includeType: WritableClassInclude;
    readonly source: string;
    readonly subject: string;
    readonly transportRequest?: string;
  },
): Promise<void> {
  await client.withLock(classUri(input.className), async (lock) => {
    await checkClassInclude(
      client,
      input.className,
      input.includeType,
      input.source,
      input.subject,
    );
    await putClassInclude(
      client,
      input.className,
      input.includeType,
      input.source,
      lock.handle,
      input.transportRequest,
    );
  });
}
