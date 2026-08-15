/**
 * `GetBehaviorDefinition`·`ReadBehaviorDefinition`·`GetBehaviorImplementation`·
 * `ReadBehaviorImplementation`의 공통 몸통.
 *
 * 네 도구는 두 축으로 갈린다 — 오브젝트 종류(BDEF / BIMP)가 하나, **`Get*`이냐
 * `Read*`이냐**가 다른 하나다. 종류별로 다른 낱말과 주소는 {@link BehaviorKind}가
 * 주고, 두 갈래의 **실제로 다른 동작**은 이 파일의 두 함수
 * ({@link getBehavior} · {@link readBehavior})가 각각 짓는다.
 *
 * ## 구 트리의 `high` / `low` 중 어느 쪽인가 — 실측 결론
 *
 * 구 트리에는 `handlers/behavior_definition/{high,low,readonly}/`가 있고 같은
 * 파일 이름이 `high`와 `low` 양쪽에 있다. **발행되는 것은 `high`와 `readonly`뿐이다.**
 * 근거는 `TOOL_DEFINITION.name`이다 — `low/` 쪽 8개는 전부 이름이
 * `…Low`로 끝나고(`CreateBehaviorDefinitionLow`·`UpdateBehaviorDefinitionLow`·
 * `LockBehaviorDefinitionLow`·`CheckBdefLow` …), 그 이름은 채록본
 * `harness/old-surface/m1-tools.json`의 `tools`(186종) 어디에도 없다. 반대로
 * `high/`의 네 이름(`Create`·`Get`·`Update`·`Delete`)과 `readonly/`의
 * `Read…`는 채록본에 그대로 있다. 그래서 이 묶음은 `high` + `readonly`만 옮긴다.
 *
 * ## `Get*` ↔ `Read*` — 실측된 차이
 *
 * | | `Get*` | `Read*` |
 * |---|---|---|
 * | 구 위치 | `handlers/<묶음>/high/` | `handlers/<묶음>/readonly/` |
 * | `sets` | `high` (채록본의 `*_default` 두 조건) | `readonly` (네 조건 전부) |
 * | 나가는 요청 | GET 1회 (소스) | **GET 2회** (소스 + 메타데이터) |
 * | 실패 처리 | 오류로 올린다 | **삼킨다** — 늘 `success:true` |
 * | 응답 필드 | `<noun>_data`·`status`·`status_text` | `source_code`·`metadata` |
 *
 * `Read*`의 두 번째 GET은 감싸개 `readMetadata()`이고, `read()`와 **다른
 * 엔드포인트**다(같은 주소를 두 번 치는 데이터 엘리먼트 계열과 여기가 다르다).
 *
 * ## BDEF ↔ BIMP — 실측된 차이
 *
 * | | BDEF | BIMP |
 * |---|---|---|
 * | 소스 주소 | `/sap/bc/adt/bo/behaviordefinitions/{이름}/source/main` | `/sap/bc/adt/oo/classes/{이름}/source/main` — **BIMP는 클래스다** |
 * | 이름 표기 | `name.toLowerCase()` · **인코딩 없음** | `encodeURIComponent(name)` · **대문자 그대로** |
 * | 메타데이터 주소 | 같은 오브젝트 URI + `?version=inactive` | 같은 오브젝트 URI · **질의 인자 없음** |
 * | 메타데이터 Accept | `application/vnd.sap.adt.blues.v1+xml` | `ACCEPT_CLASS`(v4~v1 네 값) |
 * | 인자 이름 | `behavior_definition_name` | `behavior_implementation_name` |
 *
 * **메타데이터의 `version`은 인자를 따르지 않는다(BDEF).** 감싸개가 `'inactive'`를
 * 박아 넣는다 — 응답의 `version` 메아리는 인자를 따르지만 두 번째 요청은 따르지
 * 않는다.
 *
 * ## 와이어 근거 (파일·줄 — 읽기 전용 참조)
 *
 * - BDEF 소스: `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/behaviorDefinition/AdtBehaviorDefinition.js:154-176`
 *   (`read()`는 `readSource`를 부른다) → `.../core/behaviorDefinition/read.js:59-71`
 *   → `GET /sap/bc/adt/bo/behaviordefinitions/{name.toLowerCase()}/source/main?version={version}`,
 *   Accept `ACCEPT_SOURCE`(`dist/constants/contentTypes.js:16` = `text/plain`),
 *   타임아웃 `getTimeout('default')`.
 * - BDEF 메타데이터: `AdtBehaviorDefinition.js:180-208` (`readMetadata()`는 `read`를
 *   부르며 version 자리에 **`'inactive'` 리터럴**을 넘긴다) → `read.js:29-41`
 *   → `GET /sap/bc/adt/bo/behaviordefinitions/{name.toLowerCase()}?version=inactive`,
 *   Accept `CT_BEHAVIOR_DEFINITION`(`contentTypes.js:100`).
 * - BIMP 소스: `.../core/behaviorImplementation/AdtBehaviorImplementation.js:121-143`
 *   → `.../core/behaviorImplementation/read.js:64-66` `getBehaviorImplementationSource`
 *   → `.../core/shared/AdtUtils.js:306-327` `readObjectSource('class', …)`
 *   → 같은 파일 `:743-748` `getObjectSourceUri` =
 *   `/sap/bc/adt/oo/classes/{encodeSapObjectName(NAME)}/source/main?version={version}`,
 *   Accept는 `AdtUtils.js:316`의 기본값 `'text/plain'`.
 * - BIMP 메타데이터: `AdtBehaviorImplementation.js:147-174` → `read.js:55-57`
 *   `getBehaviorImplementationMetadata` → `AdtUtils.js:269-293` `readObjectMetadata`
 *   → 같은 파일 `:652-656` = `/sap/bc/adt/oo/classes/{encodeSapObjectName(NAME)}`
 *   (호출자가 `options`를 주지 않으므로 질의 인자가 하나도 붙지 않는다),
 *   Accept는 `:700-704`가 고르는 `ACCEPT_CLASS`(`contentTypes.js:63`).
 * - 404 삼킴은 **소스 쪽에만 있다**: `AdtBehaviorDefinition.js:166-170` ·
 *   `AdtBehaviorImplementation.js:133-137`이 `e.response?.status === 404`에서
 *   `undefined`를 돌려준다. `readMetadata`에는 그 갈래가 없어 **404도 던진다** —
 *   그래서 `Read*`에서 소스 404는 조용하고 메타데이터 404는 `warn` 한 줄을 남긴다.
 *
 * ## 구와 다른 것 (**차이가 아니다**)
 *
 * - 응답 본문이 문자열이다. 구는 axios가 넘긴 `data`가 객체일 수 있어
 *   `typeof … === 'string' ? … : JSON.stringify(…)`로 접었다. 신 접속 계층의
 *   `body`는 언제나 문자열이므로 그 갈래가 사라질 뿐 결과는 같다.
 * - `status_text`를 표준 사유 구절로 되세운다(`statusTextFor`). 구는 axios의
 *   `statusText`를 그대로 실었다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';
import type { ToolContext, ToolResult } from '../../../server/toolDefinition';
import { adtStatusOf, encodeObjectName, statusTextFor } from './adt';
import { messageOf, ok, returnError } from './results';

export type BehaviorVersion = 'active' | 'inactive';

/** 소스 읽기의 Accept — 구 `ACCEPT_SOURCE`(`contentTypes.js:16`). */
export const ACCEPT_SOURCE = 'text/plain';

/** `CT_BEHAVIOR_DEFINITION` — `contentTypes.js:100`. */
export const CT_BEHAVIOR_DEFINITION = 'application/vnd.sap.adt.blues.v1+xml';

/** `ACCEPT_CLASS` — `contentTypes.js:63`. BIMP의 메타데이터가 이걸 쓴다. */
export const ACCEPT_CLASS =
  'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, ' +
  'application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml';

/** 두 오브젝트 종류가 갈리는 낱말과 주소 전부. */
export interface BehaviorKind {
  /** 인자 이름이자 응답의 이름 필드. */
  readonly nameField: string;
  /** `Get*` 응답의 데이터 필드. */
  readonly dataField: string;
  /** 오류·로그 문구의 소문자 명사. */
  readonly noun: string;
  /** 오류 문구의 대문자 명사 — 구가 쓰던 붙임말 그대로. */
  readonly label: string;
  /** 소스 경로. 질의 인자는 붙이지 않는다. */
  sourcePath(name: string): string;
  /** 메타데이터 경로. */
  metadataPath(name: string): string;
  /** 메타데이터 요청의 질의 인자. BIMP는 없다. */
  readonly metadataParams?: Readonly<Record<string, string>>;
  /** 메타데이터 요청의 Accept. */
  readonly metadataAccept: string;
}

/** BDEF의 오브젝트 URI — **소문자, 인코딩 없음**(`read.js:31`·`:61`). */
export function behaviorDefinitionUri(name: string): string {
  return `/sap/bc/adt/bo/behaviordefinitions/${name.toLowerCase()}`;
}

/** BIMP를 **읽을 때**의 오브젝트 URI — 인코딩만 하고 대소문자는 그대로 둔다. */
export function behaviorImplementationReadUri(name: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(name)}`;
}

export const BEHAVIOR_DEFINITION: BehaviorKind = {
  nameField: 'behavior_definition_name',
  dataField: 'behavior_definition_data',
  noun: 'behavior definition',
  label: 'BehaviorDefinition',
  sourcePath: (name) => `${behaviorDefinitionUri(name)}/source/main`,
  metadataPath: (name) => behaviorDefinitionUri(name),
  // 감싸개가 박아 넣는 리터럴이다 — 인자의 version을 따르지 않는다.
  metadataParams: { version: 'inactive' },
  metadataAccept: CT_BEHAVIOR_DEFINITION,
};

export const BEHAVIOR_IMPLEMENTATION: BehaviorKind = {
  nameField: 'behavior_implementation_name',
  dataField: 'behavior_implementation_data',
  noun: 'behavior implementation',
  label: 'BehaviorImplementation',
  sourcePath: (name) => `${behaviorImplementationReadUri(name)}/source/main`,
  metadataPath: (name) => behaviorImplementationReadUri(name),
  metadataAccept: ACCEPT_CLASS,
};

/**
 * 감싸개 `read()` 하나 — **404는 `undefined`로 삼키고 나머지는 던진다.**
 * (`AdtBehaviorDefinition.js:161-175` · `AdtBehaviorImplementation.js:128-142`)
 */
async function vendorReadSource(
  kind: BehaviorKind,
  client: AdtClient,
  name: string,
  version: BehaviorVersion,
): Promise<AdtResponse | undefined> {
  try {
    return await client.request({
      method: 'GET',
      path: kind.sourcePath(name),
      params: { version },
      accept: ACCEPT_SOURCE,
      timeout: 'default',
    });
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/** 감싸개 `readMetadata()` — **404를 삼키지 않는다.** */
function vendorReadMetadata(
  kind: BehaviorKind,
  client: AdtClient,
  name: string,
): Promise<AdtResponse> {
  return client.request({
    method: 'GET',
    path: kind.metadataPath(name),
    params: kind.metadataParams,
    accept: kind.metadataAccept,
    timeout: 'default',
  });
}

/** 인자의 `version`을 두 값 중 하나로 좁힌다. 구는 `= 'active'` 기본값만 썼다. */
function normalizeVersion(version: string | undefined): BehaviorVersion {
  return version === 'inactive' ? 'inactive' : 'active';
}

/**
 * `Get*` — 소스를 한 번 읽고, 못 읽으면 **오류로 올린다.**
 *
 * 대조 원본: `engine/src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts:50-128`
 * · `engine/src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts:51-132`.
 */
export async function getBehavior(
  kind: BehaviorKind,
  toolName: string,
  context: ToolContext,
  args: { readonly name?: string; readonly version?: string },
): Promise<ToolResult> {
  try {
    const raw = args.name ?? '';
    if (!raw) return returnError(new Error(`${kind.nameField} is required`));

    const name = raw.toUpperCase();
    const version = normalizeVersion(args.version);

    // 접속 획득은 안쪽 try 밖이다 — 구도 그렇고(`…:67`·`:67`), 접속 실패에
    // "읽기 실패" 접두사를 붙이면 원인이 바뀐다.
    const client = await context.getConnection();
    context.logger.info(`Reading ${kind.noun} ${name}, version: ${version}`);

    try {
      const response = await vendorReadSource(kind, client, name, version);
      // 감싸개가 404를 삼켜 빈손으로 돌아온 자리. 구는 여기서 던진다.
      if (!response) throw new Error(`${kind.label} ${name} not found`);

      context.logger.info(`${toolName} completed successfully: ${name}`);
      return ok(
        JSON.stringify(
          {
            success: true,
            [kind.nameField]: name,
            version,
            [kind.dataField]: response.body,
            status: response.status,
            status_text: statusTextFor(response.status),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      context.logger.error(`Error reading ${kind.noun} ${name}: ${messageOf(error)}`);

      // 위에서 우리가 던진 Error에는 HTTP 상태가 없다 — 구도 그래서 404 갈래를
      // 타지 못하고 기본 접두사 갈래로 떨어진다(마침표 있는 `… not found.`는
      // 이 경로에서 도달하지 않는다).
      const status = adtStatusOf(error);
      const message =
        status === 404
          ? `${kind.label} ${name} not found.`
          : status === 423
            ? `${kind.label} ${name} is locked by another user.`
            : `Failed to read ${kind.noun}: ${messageOf(error)}`;
      return returnError(new Error(message));
    }
  } catch (error) {
    return returnError(error);
  }
}

/**
 * `Read*` — 소스와 메타데이터를 따로 집고, **둘 다 실패해도 성공으로 답한다.**
 *
 * 대조 원본: `engine/src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts:32-100`
 * · `engine/src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts:32-103`.
 */
export async function readBehavior(
  kind: BehaviorKind,
  context: ToolContext,
  args: { readonly name?: string; readonly version?: string },
): Promise<ToolResult> {
  try {
    const raw = args.name ?? '';
    if (!raw) return returnError(new Error(`${kind.nameField} is required`));

    const name = raw.toUpperCase();
    const version = normalizeVersion(args.version);

    // 접속 획득은 두 try 밖이다 — 구도 그렇다. 안쪽에 넣으면 **접속이 아예 없는
    // 기동에서도 `success:true`가 나간다.**
    const client = await context.getConnection();

    let sourceCode: string | null = null;
    try {
      const response = await vendorReadSource(kind, client, name, version);
      // 구의 falsy 판정 그대로 — 빈 본문은 "없음"이다. 404는 감싸개가 삼켜
      // 빈손으로 오므로 여기서 경고가 남지 않는다.
      if (response && response.body) sourceCode = response.body;
    } catch (error) {
      context.logger.warn(`Could not read source for ${name}: ${messageOf(error)}`);
    }

    let metadata: string | null = null;
    try {
      const response = await vendorReadMetadata(kind, client, name);
      if (response.body) metadata = response.body;
    } catch (error) {
      context.logger.warn(`Could not read metadata for ${name}: ${messageOf(error)}`);
    }

    return ok(
      JSON.stringify(
        {
          success: true,
          [kind.nameField]: name,
          version,
          source_code: sourceCode,
          metadata,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    return returnError(error);
  }
}
