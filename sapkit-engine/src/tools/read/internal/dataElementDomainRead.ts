/**
 * `GetDataElement`·`ReadDataElement`·`GetDomain`·`ReadDomain`의 공통 몸통.
 *
 * 네 도구는 같은 두 벌의 짝이다 — 오브젝트 종류(데이터 엘리먼트 / 도메인)가
 * 하나의 축이고, **`Get*`이냐 `Read*`이냐**가 다른 축이다. 낱말만 다른 부분은
 * {@link DdicTypeKind}가 주고, 두 갈래의 **실제로 다른 동작**은 이 파일의 두
 * 함수({@link getDdicType} · {@link readDdicType})가 각각 짓는다.
 *
 * ## `Get*` ↔ `Read*` — 실측된 차이 (구 소스·안쪽 패키지에서)
 *
 * | | `Get*` | `Read*` |
 * |---|---|---|
 * | 구 위치 | `handlers/<묶음>/high/` | `handlers/<묶음>/readonly/` |
 * | ECC 우회로 | 있다 (OData 브리지) | **없다** |
 * | 나가는 요청 | GET 1회 | **GET 2회** (`read` + `readMetadata`) |
 * | 실패 처리 | 오류로 올린다 | **삼킨다** — 늘 `success:true` |
 * | 응답 필드 | `<noun>_data`·`status`·`status_text` | `source_code`·`metadata` |
 *
 * GET이 두 번 나가는 것은 `readMetadata`가 **자기 안에서 `read()`를 다시 부르기**
 * 때문이다(`@babamba2/mcp-abap-adt-clients/dist/core/dataElement/AdtDataElement.js:154-194`
 * · `.../core/domain/AdtDomain.js:145-188` — 주석이 "데이터 엘리먼트/도메인은
 * 소스가 없으므로 read()가 이미 메타데이터다"라고 적어 둔 자리다). 그래서 성공한
 * `Read*`의 `source_code`와 `metadata`는 **같은 문자열**이다. 흉내가 아니라 실측이며,
 * 도구 응답에 그대로 드러나므로 여기서 접지 않는다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * - GET 주소·헤더:
 *   `@babamba2/mcp-abap-adt-clients/dist/core/dataElement/read.js:14-26` ·
 *   `.../core/domain/read.js:19-31`
 *   → `GET /sap/bc/adt/ddic/{dataelements|domains}/{encodeURIComponent(NAME)}`,
 *     `Accept`는 `.../constants/contentTypes.js:84,87`의 두 값,
 *     타임아웃은 `getTimeout('default')`(`.../utils/timeouts.js:26-33`).
 * - **`version`은 와이어에 실리지 않는다.** 감싸개 `read(config, _version, options)`가
 *   그 인자를 쓰지 않고(`AdtDataElement.js:128` · `AdtDomain.js:121` — 이름 앞의
 *   밑줄이 그 증거다), 저수준 `getDataElement`/`getDomain`은 `withLongPolling`이
 *   있을 때만 질의 인자를 붙인다. 네 도구 어느 쪽도 그 옵션을 주지 않는다 —
 *   그래서 `version=inactive`는 **응답의 메아리만 바꾸고 요청은 바꾸지 않는다.**
 *   (같은 DDIC 계열이라도 `GetTable`은 `.../source/main?version=…`으로 다르다 —
 *   `src/tools/rfc-read/ddicRead.ts` 참조. 접어 합치면 안 되는 이유가 이것이다.)
 * - 404 삼킴: `AdtDataElement.js:141-148` · `AdtDomain.js:132-139` —
 *   `read()`는 404에서 **`undefined`를 돌려준다**(던지지 않는다). 구 `Get*` 핸들러가
 *   그 빈손을 보고 `«Data element X not found»`를 던지면 자기 catch가
 *   `Failed to read …: ` 접두사를 붙인다. 구 핸들러에 적힌 마침표 있는
 *   `X not found.` 갈래는 그래서 read 경로에서 도달하지 않는다.
 *
 * ## 구와 다른 것 (차이가 아니다)
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

/** 네 도구가 갈리는 낱말 전부. */
export interface DdicTypeKind {
  /** 인자 이름이자 응답의 이름 필드 — `data_element_name` | `domain_name`. */
  readonly nameField: string;
  /** `Get*` 응답의 데이터 필드 — `data_element_data` | `domain_data`. */
  readonly dataField: string;
  /** ADT 경로 조각 — `dataelements` | `domains`. */
  readonly adtSegment: string;
  /** 요청의 `Accept`. 구 `ACCEPT_DATA_ELEMENT` / `ACCEPT_DOMAIN` 그대로. */
  readonly accept: string;
  /** 오류·로그 문구의 소문자 명사 — `data element` | `domain`. */
  readonly noun: string;
  /** 오류 문구의 대문자 명사 — `Data element` | `Domain`. */
  readonly label: string;
  /** ECC 우회로가 부르던 브리지 함수모듈 이름. 거절 문구가 이것을 지목한다. */
  readonly eccBridgeFm: string;
}

/** `ACCEPT_DATA_ELEMENT` — `constants/contentTypes.js:87`. */
export const ACCEPT_DATA_ELEMENT =
  'application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml';

/** `ACCEPT_DOMAIN` — `constants/contentTypes.js:84`. */
export const ACCEPT_DOMAIN =
  'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml';

export const DATA_ELEMENT: DdicTypeKind = {
  nameField: 'data_element_name',
  dataField: 'data_element_data',
  adtSegment: 'dataelements',
  accept: ACCEPT_DATA_ELEMENT,
  noun: 'data element',
  label: 'Data element',
  eccBridgeFm: 'ZSAPKIT_ADT_DDIC_DTEL_READ',
};

export const DOMAIN: DdicTypeKind = {
  nameField: 'domain_name',
  dataField: 'domain_data',
  adtSegment: 'domains',
  accept: ACCEPT_DOMAIN,
  noun: 'domain',
  label: 'Domain',
  eccBridgeFm: 'ZSAPKIT_ADT_DDIC_DOMA_READ',
};

export type DdicVersion = 'active' | 'inactive';

/** 구 게이트와 같은 판정 — 대문자화만 하고 trim 하지 않는다. */
function isEcc(sapVersion: string | null): boolean {
  return sapVersion?.toUpperCase() === 'ECC';
}

/**
 * ECC 우회로가 M1에 없다는 것을 **정직하게** 알린다 (차이 장부 D61).
 *
 * 그냥 ADT로 흘려보내면 ECC 커널에 없는 엔드포인트를 때려 404가 나고, 그 404는
 * "오브젝트가 없다"로 읽힌다 — 없는 것은 오브젝트가 아니라 엔드포인트인데.
 * 조용히 틀린 답보다 시끄럽게 못 하는 편이 낫다.
 */
function eccUnsupported(kind: DdicTypeKind, toolName: string): ToolResult {
  return returnError(
    new Error(
      `${toolName} on SAP_VERSION=ECC needs the ${kind.eccBridgeFm} OData bridge, which this engine does not implement yet (divergence D61). ` +
        `The ADT endpoint /sap/bc/adt/ddic/${kind.adtSegment} does not exist on ECC kernels (BASIS < 7.50), so falling through to it would fail as a misleading 404.`,
    ),
  );
}

/**
 * 감싸개 `read()` 하나 — **404는 `undefined`로 삼키고 나머지는 던진다.**
 * (`AdtDataElement.js:128-149` · `AdtDomain.js:121-140`)
 */
async function vendorRead(
  kind: DdicTypeKind,
  client: AdtClient,
  name: string,
): Promise<AdtResponse | undefined> {
  try {
    return await client.request({
      method: 'GET',
      path: `/sap/bc/adt/ddic/${kind.adtSegment}/${encodeObjectName(name)}`,
      accept: kind.accept,
      timeout: 'default',
    });
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/**
 * `Get*` — 한 번 읽고, 못 읽으면 **오류로 올린다.**
 *
 * 대조 원본: `engine/src/handlers/data_element/high/handleGetDataElement.ts:51-163`
 * · `engine/src/handlers/domain/high/handleGetDomain.ts:51-156`.
 */
export async function getDdicType(
  kind: DdicTypeKind,
  toolName: string,
  context: ToolContext,
  args: { readonly name?: string; readonly version?: DdicVersion },
): Promise<ToolResult> {
  try {
    const raw = args.name ?? '';
    if (!raw) return returnError(new Error(`${kind.nameField} is required`));

    const name = raw.toUpperCase();
    const version: DdicVersion = args.version === 'inactive' ? 'inactive' : 'active';

    // 구는 여기서 브리지로 갈라진다 — 접속을 만들기 전이다.
    if (isEcc(context.profile.sapVersion)) return eccUnsupported(kind, toolName);

    // 접속 획득은 안쪽 try 밖이다 — 구도 그렇고, 접속 실패에 "읽기 실패" 접두사를
    // 붙이면 원인이 바뀐다.
    const client = await context.getConnection();
    context.logger.info(`Reading ${kind.noun} ${name}, version: ${version}`);

    try {
      const response = await vendorRead(kind, client, name);
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
      // 타지 못하고 기본 접두사 갈래로 떨어진다.
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
 * 대조 원본: `engine/src/handlers/data_element/readonly/handleReadDataElement.ts:32-103`
 * · `engine/src/handlers/domain/readonly/handleReadDomain.ts:32-98`.
 *
 * 두 번째 GET은 `readMetadata`가 자기 안에서 `read()`를 다시 부르는 것이고, 그
 * 감싸개는 빈손일 때 `«… '이름' not found»`를 던진다 — 그 예외는 여기서 잡혀
 * `metadata: null`이 된다.
 */
export async function readDdicType(
  kind: DdicTypeKind,
  context: ToolContext,
  args: { readonly name?: string; readonly version?: DdicVersion },
): Promise<ToolResult> {
  try {
    const raw = args.name ?? '';
    if (!raw) return returnError(new Error(`${kind.nameField} is required`));

    const name = raw.toUpperCase();
    const version: DdicVersion = args.version === 'inactive' ? 'inactive' : 'active';

    // 접속 획득은 두 try 밖이다 — 구도 그렇다
    // (`handleReadDataElement.ts:42` · `handleReadDomain.ts:41`). 안쪽에 넣으면
    // **접속이 아예 없는 기동에서도 `success:true`가 나간다** — 삼키는 갈래가
    // 삼켜서는 안 될 것까지 삼키게 된다.
    const client = await context.getConnection();

    let sourceCode: string | null = null;
    try {
      const response = await vendorRead(kind, client, name);
      if (response && response.body) sourceCode = response.body;
    } catch (error) {
      context.logger.warn(`Could not read source for ${name}: ${messageOf(error)}`);
    }

    let metadata: string | null = null;
    try {
      const response = await vendorRead(kind, client, name);
      if (!response) throw new Error(`${kind.label} '${name}' not found`);
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
