/**
 * `ReadTable` · `ReadStructure`가 함께 쓰는 DDIC 읽기 — 구는 **한 코드 경로**였다.
 *
 * 두 구 핸들러(`handlers/table/readonly/handleReadTable.ts` ·
 * `handlers/structure/readonly/handleReadStructure.ts`)는 이름만 다른 같은 흐름이고,
 * 실제 요청도 벤더의 같은 두 함수로 내려간다
 * (`@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js`의
 * `readObjectSource` · `readObjectMetadata` — 오브젝트 종류만 다른 인자다).
 * 그래서 여기 한 자리에 둔다. `rfc-read/ddicRead.ts`가 `GetTable`·`GetStructure`를
 * 한 자리에서 다루는 것과 같은 이유다.
 *
 * ## 와이어 근거
 *
 *  - **소스**: `AdtUtils.js:306-326` → `getObjectSourceUri`(`:743-778`) —
 *    `{뿌리}/{encodeURIComponent(이름)}/source/main?version={버전}`,
 *    Accept는 `text/plain`(`:315`), 타임아웃 default.
 *  - **메타데이터**: `AdtUtils.js:269-292` → `getObjectMetadataUri`(`:652-698`) —
 *    `{뿌리}/{encodeURIComponent(이름)}`, **질의 인자 없음**(구 핸들러가 옵션 없이
 *    부르므로 `version`이 붙지 않는다), Accept는 종류별 값
 *    (`getMetadataAcceptHeader` `:700-742` → `constants/contentTypes.js`).
 *  - 뿌리: 테이블 `/sap/bc/adt/ddic/tables` · 구조체 `/sap/bc/adt/ddic/structures`.
 *
 * ## 두 조회는 서로 독립이다 — 그것이 계약이다
 *
 * 구 핸들러는 두 조회를 **각각의 try/catch**로 감싸고, 실패하면 그 자리를 `null`로
 * 둔 채 **성공으로** 답한다(`handleReadTable.ts:46-75`). 벤더 쪽도 소스 404를
 * 오류가 아니라 "없음"으로 접는다(`core/table/AdtTable.js:115-121`). 한쪽이
 * 없다고 전체를 실패로 만들면 구와 다르다 — 그래서 여기서도 던지지 않는다.
 */

import type { AdtClient } from '../../../adt';
import type { ToolContext, ToolResult } from '../../../server/toolDefinition';
import { encodeObjectName, SOURCE_ACCEPT, type SourceVersion } from './adt';
import { messageOf, ok, returnError } from './results';

/** 한 종류가 알아야 하는 것 — 뿌리 경로와 메타데이터 Accept뿐이다. */
export interface DdicReadKind {
  /** ADT 컬렉션 뿌리. 예: `/sap/bc/adt/ddic/tables` */
  readonly root: string;
  /** 메타데이터 조회의 Accept — `getMetadataAcceptHeader`의 그 종류 값. */
  readonly metadataAccept: string;
  /** 인자·응답에 쓰이는 키. 예: `table_name` */
  readonly nameKey: string;
}

/** `constants/contentTypes.js:78` — `ACCEPT_TABLE`. */
export const TABLE_READ: DdicReadKind = {
  root: '/sap/bc/adt/ddic/tables',
  metadataAccept: 'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml',
  nameKey: 'table_name',
};

/** `constants/contentTypes.js:90` — `ACCEPT_STRUCTURE`. */
export const STRUCTURE_READ: DdicReadKind = {
  root: '/sap/bc/adt/ddic/structures',
  metadataAccept:
    'application/vnd.sap.adt.structures.v2+xml, application/vnd.sap.adt.structures.v1+xml',
  nameKey: 'structure_name',
};

/**
 * 실패를 던지지 않는 조회 한 벌. 못 읽으면 `null`이고, 그 이유는 경고로만 남는다.
 * 빈 본문도 `null`이다 — 구는 `readResult.data`가 falsy면 값을 넣지 않았다.
 */
async function readOrNull(
  client: AdtClient,
  request: Parameters<AdtClient['request']>[0],
  what: string,
  name: string,
  warn: (message: string) => void,
): Promise<string | null> {
  try {
    const response = await client.request(request);
    return response.body ? response.body : null;
  } catch (error) {
    warn(`Could not read ${what} for ${name}: ${messageOf(error)}`);
    return null;
  }
}

/**
 * DDIC 오브젝트 하나의 소스 + 메타데이터를 읽어 구와 같은 표로 접는다.
 *
 * 키 순서(`success` · `<종류>_name` · `version` · `source_code` · `metadata`)까지
 * 구 응답 그대로다.
 */
export async function readDdicSourceAndMetadata(
  kind: DdicReadKind,
  context: ToolContext,
  args: { readonly name: string; readonly version?: SourceVersion },
): Promise<ToolResult> {
  const rawName = (args.name ?? '').trim();
  if (!rawName) return returnError(new Error(`${kind.nameKey} is required`));

  const version: SourceVersion = args.version ?? 'active';
  const name = rawName.toUpperCase();
  const encoded = encodeObjectName(name);
  const warn = (message: string): void => context.logger.warn(message);

  try {
    const client = await context.getConnection();

    const sourceCode = await readOrNull(
      client,
      {
        method: 'GET',
        path: `${kind.root}/${encoded}/source/main`,
        params: { version },
        accept: SOURCE_ACCEPT,
        timeout: 'default',
      },
      'source',
      name,
      warn,
    );

    const metadata = await readOrNull(
      client,
      {
        method: 'GET',
        path: `${kind.root}/${encoded}`,
        accept: kind.metadataAccept,
        timeout: 'default',
      },
      'metadata',
      name,
      warn,
    );

    return ok(
      JSON.stringify(
        {
          success: true,
          [kind.nameKey]: name,
          version,
          source_code: sourceCode,
          metadata,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    // 여기까지 오는 것은 접속 자체를 못 얻은 경우다 — 두 조회는 던지지 않는다.
    return returnError(error);
  }
}
