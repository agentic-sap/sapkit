/**
 * 고전(Eclipse ADT) ABAP Unit 실행 — 전문 조립 · 발송 · 결과 캐시.
 *
 * 단위시험 네 종이 함께 쓰는 부품이다. **`RunUnitTest`가 SAP에 보내는 유일한
 * 요청**이 여기 있고, `GetUnitTest*` 세 종은 여기 캐시만 되읽는다.
 *
 * ## 왜 캐시가 필요한가 (구 엔진의 실측 결론)
 *
 * 구 `engine/src/lib/abapUnitClassic.ts:1-33`이 남긴 실측:
 *
 *  - 벤더 `AdtUnitTest`가 쓰는 `/sap/bc/adt/abapunit/runs`는 **없다** — 실 S/4HANA
 *    2021 온프렘과 BASIS 7.00 양쪽에서 `GET /sap/bc/adt/discovery`로 확인.
 *  - `AdtUnitTestLegacy`는 주소(`/testruns`)는 맞지만 `application/xml` 맨 본문에
 *    `<options>` 없이 보내서, SAP이 받아 놓고 **선택된 시험 0건**으로 조용히 끝난다
 *    (빈 `<aunit:runResult/>`).
 *  - discovery로 확인된 진짜 엔드포인트는 고전 AbapUnit API다:
 *
 *    ```
 *    POST /sap/bc/adt/abapunit/testruns
 *    Content-Type: application/vnd.sap.adt.abapunit.testruns.config.v1+xml
 *    <aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">…
 *    ```
 *
 * 이 엔드포인트는 **동기**다 — 같은 POST 응답에 `<aunit:runResult>`가 통째로 온다.
 * 서버측 run_id·폴링 개념이 아예 없다. 그런데 발행 표면은
 * `RunUnitTest` → `GetUnitTestStatus` → `GetUnitTestResult` 세 번의 도구 호출을
 * 계약으로 갖는다. 그래서 결과를 **접속 하나마다 메모리에** 담아 두고 생성한
 * run_id로 되찾게 다리를 놓는다. 구가 한 판단 그대로다.
 *
 * 열쇠가 접속인 것도 구 그대로다(`:177`의 `WeakMap<IAbapConnection, …>`) — http·sse
 * 전송에서는 세션마다 접속이 갈리므로, 한 세션이 다른 세션의 결과를 읽지 못한다.
 * stdio에서는 접속이 하나뿐이라 동작이 달라지지 않는다.
 *
 * ## 선택 단위는 컨테이너 클래스다
 *
 * `<adtcore:objectReference>`는 **고유 컨테이너 클래스마다 하나**다. 고전 전문에는
 * 한 클래스 안의 로컬 시험 클래스를 골라 담을 자리가 없어서, 참조된 클래스의 로컬
 * 시험이 전부 돈다. 걸러 내지 않고 전량을 돌려주는 것도 구와 같다 — 조용히 버리면
 * 사람이 안 본 실패가 생긴다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 `connection.makeAdtRequest({url, method, timeout, data, headers})`를 불렀고
 * (`engine/src/lib/utils.ts:940-956`), 여기서는 `AdtClient.request()`를 부른다.
 * 나가는 것은 같다 — 호출자가 `Accept`를 주지 않으면 구 접속 계층이
 * `application/xml, application/json, text/plain,` + 와일드카드를 붙이는데
 * (`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:159-165`),
 * 신 계층의 `DEFAULT_ACCEPT`(`src/adt/client.ts:51`)가 같은 문자열이다. CSRF 사전
 * 취득도 POST에서 양쪽 다 일어난다(같은 파일 `:144-158` ↔ `client.ts:280-282`).
 */

import { randomUUID } from 'node:crypto';

import type { AdtClient } from '../../../adt';

/** 고전 실행 설정 전문의 Content-Type. */
export const TESTRUNS_CONFIG_CONTENT_TYPE =
  'application/vnd.sap.adt.abapunit.testruns.config.v1+xml';

export const TESTRUNS_PATH = '/sap/bc/adt/abapunit/testruns';

/**
 * 고전 엔드포인트는 실행 전체를 POST 하나 안에서 끝낸다. 그래서 HTTP 타임아웃이
 * **시험 묶음 실행 시간을 덮어야** 한다 — `default`(45초)도 `long`(60초)도 ADT 한
 * 왕복을 재는 값이지 시험 실행을 재는 값이 아니다. 최소 5분을 쓰되, 운영자가
 * `SAP_TIMEOUT_LONG`을 더 크게 올렸으면 그쪽을 존중한다(구 `:64-71` 그대로).
 */
export const SYNC_RUN_MIN_TIMEOUT_MS = 5 * 60 * 1000;

/** 캐시 상한과 수명 — 구 `:174-175`. */
export const MAX_CACHED_RUNS = 200;
export const RUN_TTL_MS = 30 * 60 * 1000;

export interface UnitTestDefinition {
  readonly containerClass: string;
  readonly testClass: string;
}

export interface UnitTestRunOptions {
  readonly scope?: {
    readonly ownTests?: boolean;
    readonly foreignTests?: boolean;
    readonly addForeignTestsAsPreview?: boolean;
  };
  readonly riskLevel?: {
    readonly harmless?: boolean;
    readonly dangerous?: boolean;
    readonly critical?: boolean;
  };
  readonly duration?: {
    readonly short?: boolean;
    readonly medium?: boolean;
    readonly long?: boolean;
  };
}

function flag(value: boolean | undefined, fallback: boolean): string {
  return (value ?? fallback) ? 'true' : 'false';
}

/** XML 속성값 이스케이프. 구 `escapeXmlAttr`(`:77-83`)과 같은 네 글자. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 실행 설정 전문을 짓는다. 구 `buildRunConfigurationXml`(`:85-127`)의 글자 그대로다 —
 * 들여쓰기와 속성 순서까지 계약으로 본다(SAP이 순서를 따지지는 않지만, 전문이
 * 달라졌는지를 시험이 문자열로 붙잡는 편이 안전하다).
 */
export function buildRunConfigurationXml(
  tests: readonly UnitTestDefinition[],
  options?: UnitTestRunOptions,
): string {
  const scope = options?.scope;
  const risk = options?.riskLevel;
  const duration = options?.duration;

  const containerClasses = [...new Set(tests.map((test) => test.containerClass.toUpperCase()))];

  const objectRefs = containerClasses
    .map((name) => {
      // 벤더 `encodeSapObjectName`과 같은 인코딩 — 네임스페이스(`/ACME/ZCL_X`)의
      // 슬래시를 퍼센트 인코딩해 한 세그먼트로 남긴다.
      const uri = `/sap/bc/adt/oo/classes/${encodeURIComponent(name.toLowerCase())}`;
      return `        <adtcore:objectReference adtcore:uri="${escapeAttribute(uri)}"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?><aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external>
    <coverage active="false"/>
  </external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy appendAssignedTestsPreview="${flag(scope?.addForeignTestsAsPreview, true)}" assignedTests="${flag(scope?.foreignTests, false)}" sameProgram="${flag(scope?.ownTests, true)}"/>
    <testRiskLevels harmless="${flag(risk?.harmless, true)}" dangerous="${flag(risk?.dangerous, true)}" critical="${flag(risk?.critical, true)}"/>
    <testDurations short="${flag(duration?.short, true)}" medium="${flag(duration?.medium, true)}" long="${flag(duration?.long, true)}"/>
    <withNavigationUri enabled="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
${objectRefs}
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;
}

/** 네임스페이스 접두사를 따지지 않는 뿌리 검사 — 보통은 `<aunit:runResult …>`다. */
const RUN_RESULT_ROOT = /<(?:[\w.-]+:)?runResult[\s/>]/;

/**
 * 고전 엔드포인트로 시험을 돌리고 `<aunit:runResult>` XML을 **동기로** 돌려준다.
 * 200인데 runResult 문서가 아니면(예: HTML 오류 페이지) 던진다 — 구 `:135-159`.
 */
export async function runClassicUnitTest(
  client: AdtClient,
  tests: readonly UnitTestDefinition[],
  options: UnitTestRunOptions | undefined,
  timeoutMs: number,
): Promise<string> {
  if (tests.length === 0) throw new Error('At least one test definition is required');

  const response = await client.request({
    method: 'POST',
    path: TESTRUNS_PATH,
    body: buildRunConfigurationXml(tests, options),
    contentType: TESTRUNS_CONFIG_CONTENT_TYPE,
    timeout: timeoutMs,
  });

  const body = response.body;
  if (!RUN_RESULT_ROOT.test(body)) {
    throw new Error(
      `ABAP Unit run returned an unexpected response (HTTP ${response.status}, no runResult root). First 300 chars: ${body.slice(0, 300)}`,
    );
  }
  return body;
}

// ---------------------------------------------------------------------------
// 동기 응답을 run_id 계약으로 잇는 메모리 저장소.
// ---------------------------------------------------------------------------

interface CachedRun {
  readonly resultXml: string;
  readonly createdAt: number;
}

const runStores = new WeakMap<AdtClient, Map<string, CachedRun>>();

function isExpired(run: CachedRun, now: number): boolean {
  return run.createdAt < now - RUN_TTL_MS;
}

/** 만료분을 걷어내고, 그래도 상한이면 **가장 오래된 것부터** 버린다(구 `:183-193`). */
function evictStaleRuns(runStore: Map<string, CachedRun>): void {
  const now = Date.now();
  for (const [id, run] of runStore) {
    if (isExpired(run, now)) runStore.delete(id);
  }
  // Map은 삽입 순서로 돈다 — 앞의 열쇠가 가장 오래된 것이다.
  while (runStore.size >= MAX_CACHED_RUNS) {
    const oldest = runStore.keys().next().value;
    if (oldest === undefined) break;
    runStore.delete(oldest);
  }
}

/** 끝난 실행의 결과 XML을 담고 생성한 run_id를 돌려준다. */
export function storeUnitTestRun(client: AdtClient, resultXml: string): string {
  let runStore = runStores.get(client);
  if (!runStore) {
    runStore = new Map<string, CachedRun>();
    runStores.set(client, runStore);
  }
  evictStaleRuns(runStore);
  const runId = randomUUID();
  runStore.set(runId, { resultXml, createdAt: Date.now() });
  return runId;
}

/** run_id로 담아 둔 결과 XML을 되찾는다. 없거나 만료면 undefined. */
export function getUnitTestRun(client: AdtClient, runId: string): string | undefined {
  const runStore = runStores.get(client);
  const run = runStore?.get(runId);
  if (!run) return undefined;
  if (isExpired(run, Date.now())) {
    runStore?.delete(runId);
    return undefined;
  }
  return run.resultXml;
}

/**
 * 되읽기 세 종이 함께 쓰는 「모르는 run_id」 문구. 구 세 핸들러가 **같은 문장**을
 * 쓴다(`handleGetUnitTest.ts:60-66` · `handleGetUnitTestStatus.ts:64-70` ·
 * `handleGetUnitTestResult.ts:80-86`).
 */
export function unknownRunMessage(runId: string): string {
  return (
    `Unknown run_id "${runId}" — no cached result ` +
    '(invalid run_id, or the server process restarted since RunUnitTest was called).'
  );
}
