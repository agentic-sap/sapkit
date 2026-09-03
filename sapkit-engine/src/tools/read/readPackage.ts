/**
 * `ReadPackage` — 패키지 하나를 **같은 문서를 두 번 물어서** 두 칸에 담는다.
 *
 * 구 핸들러: `engine/src/handlers/package/readonly/handleReadPackage.ts`.
 *
 * ## 이미 지어진 패키지 도구 셋과 무엇이 다른가 (실측)
 *
 * | 도구 | 요청 | 응답 |
 * |---|---|---|
 * | `GetPackage` | `GET /packages/{N}?version=…` **한 발** | 원문 XML + 레거시 주석 |
 * | **`ReadPackage`** | 같은 GET **두 발**(`version` → `active`) | `{success, package_name, version, source_code, metadata}` |
 * | `GetPackageContents` | `POST /repository/nodestructure` 여러 발 | 평평한 목록 |
 * | `GetPackageTree` | 같은 POST 여러 발 | 트리 한 덩이 |
 *
 * 안전 집합도 갈린다 — `GetPackage`는 `high`(구 `handlers/package/high/`)라
 * `--exposition=readonly` 표면에 뜨지 않고, 이 도구는 `readonly`라 뜬다.
 *
 * ## 왜 같은 요청이 두 번 나가는가
 *
 * 겉 핸들러가 `obj.read(...)`와 `obj.readMetadata(...)`를 차례로 부르는데
 * (`:48-73`), 벤더의 `readMetadata`는 **`read`와 같은 함수를 `'active'` 고정으로
 * 다시 부르는 것**이다(`@babamba2/…/dist/core/package/AdtPackage.js:182-212` —
 * 주석이 "패키지는 소스가 없어 read()가 이미 메타데이터"라고 적어 두었다).
 * 그래서 와이어는 이렇다:
 *
 * ```
 * ① GET /sap/bc/adt/packages/{NAME}?version={active|inactive}
 * ② GET /sap/bc/adt/packages/{NAME}?version=active            ← 언제나 active
 *    Accept: application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml
 *    timeout: getTimeout('default')
 * ```
 *
 * `version: 'inactive'`를 주면 두 응답이 실제로 갈린다. 요청을 하나로 접으면
 * 그 경우의 답이 달라지므로 접지 않았다.
 *
 * ## ⚠ 없는 패키지에도 `success: true`로 답한다 (구의 실측)
 *
 * ①의 404는 벤더가 예외가 아니라 `undefined`로 접어 준다(`AdtPackage.js:174-179`).
 * ②의 실패는 겉 핸들러의 `catch`가 **경고 로그만 남기고 삼킨다**(`:71-73`).
 * 그래서 두 칸이 `null`인 채 `success: true`가 나간다. 읽기 도구라 거짓 쓰기
 * 성공과 성격이 다르고, 이 모양이 구의 계약이므로 그대로 옮겼다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 *  - `safeStringify` 갈래(`:93-99`)가 죽는다. 구는 axios가 파싱해 둔 `data`가
 *    객체일 수 있었지만 신 접속 계층의 `body`는 언제나 문자열이다.
 *  - `406`/`415` 자동 재협상(`utils/acceptNegotiation.js`)이 없다 — 이미 등재된
 *    축소분(장부 D8).
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

const PACKAGE_ROOT = '/sap/bc/adt/packages';

/** `dist/constants/contentTypes.js:97`의 `ACCEPT_PACKAGE` 글자 그대로. */
const ACCEPT_PACKAGE =
  'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml';

/** 한 발. 실패는 `null`로 접힌다 — 구의 두 `catch`가 그렇게 한다. */
async function readPackageDocument(
  client: AdtClient,
  packageName: string,
  version: 'active' | 'inactive',
  warn: (message: string) => void,
  label: string,
): Promise<string | null> {
  try {
    const response = await client.request({
      method: 'GET',
      path: `${PACKAGE_ROOT}/${encodeObjectName(packageName)}`,
      params: { version },
      accept: ACCEPT_PACKAGE,
      timeout: 'default',
    });
    // 구는 `data`가 있을 때만 담는다(`:52`·`:65`) — 빈 본문은 `null`로 남는다.
    return response.body ? response.body : null;
  } catch (error) {
    warn(`Could not read ${label} for ${packageName}: ${messageOf(error)}`);
    return null;
  }
}

export const readPackage = defineTool(
  {
    name: 'ReadPackage',
    description:
      '[read-only] Read ABAP package definition and metadata (super-package, responsible, description, etc.). A package that does not exist still answers success: true with metadata: null — null metadata means the package is absent, not that it exists without attributes. GetPackage returns HTTP 400 for the same missing package; prefer it when the question is whether the package exists at all.',
    inputSchema: {
      package_name: z.string().describe('Package name (e.g., Z_MY_PACKAGE).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/package/readonly/`이고 `ReadOnlyHandlersGroup`에 등록됐다
    // (`engine/src/lib/handlers/groups/ReadOnlyHandlersGroup.ts:255`).
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['package_name'],
  },
  async (context, args) => {
    try {
      const { package_name, version = 'active' } = args;
      if (!package_name) return returnError(new Error('package_name is required'));

      const client = await context.getConnection();
      const packageName = package_name.toUpperCase();

      const source_code = await readPackageDocument(
        client,
        packageName,
        version,
        (message) => context.logger.warn(message),
        'source',
      );
      // 메타데이터 쪽은 **언제나 active**다 — 벤더 `readMetadata`가 고정으로 넘긴다.
      const metadata = await readPackageDocument(
        client,
        packageName,
        'active',
        (message) => context.logger.warn(message),
        'metadata',
      );

      return ok(
        JSON.stringify(
          {
            success: true,
            package_name: packageName,
            version,
            source_code,
            metadata,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
