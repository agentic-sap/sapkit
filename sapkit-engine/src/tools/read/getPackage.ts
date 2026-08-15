/**
 * `GetPackage` — 패키지 하나의 메타데이터. 요청 **한 발**로 끝난다.
 *
 * 구 핸들러: `engine/src/handlers/package/high/handleGetPackage.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getPackage().read({packageName}, version)` 한 줄이고
 * (`handleGetPackage.ts:70-74`), 실제 요청은 안쪽 패키지에서 조립된다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/package/AdtPackage.js:163-182`
 *   → `dist/core/package/read.js:14-30`
 *   → `dist/utils/acceptNegotiation.js:104-160`(→ `connection.makeAdtRequest`)
 *
 * 거기서 확인한 것:
 *
 * ```
 * GET /sap/bc/adt/packages/{encodeURIComponent(name)}?version={active|inactive}
 *     Accept: application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml
 *     timeout: getTimeout('default')
 * ```
 *
 * `Accept`는 `dist/constants/contentTypes.js:97`의 `ACCEPT_PACKAGE`이고, 이름은
 * `dist/utils/internalUtils.js:19-21`의 `encodeSapObjectName` — `encodeURIComponent`
 * 한 겹뿐이다. `withLongPolling` 질의 인자는 겉 핸들러가 `options`를 넘기지
 * 않으므로 나가지 않는다. GET이라 CSRF 취득도 상태유지 헤더도 붙지 않는다.
 *
 * ## 404가 `not found`로 오는 경로 (구의 관측값)
 *
 * 핸들러의 `catch`에도 404 갈래가 있지만 **그 줄은 도달하지 않는다.** 벤더의
 * `AdtPackage.read()`가 404를 예외가 아니라 `undefined`로 접어 돌려주기 때문이다
 * (`AdtPackage.js:176-179`). 그래서 `!readResult` 갈래로 들어가 **try 안에서
 * `return`** 한다 — `GetView`와 달리 던지지 않으므로 문구가 이중으로 포장되지
 * 않고, 관측값은 `Error: Package X not found.`다(마침표 포함). 423은 벤더가
 * 그대로 되던지므로 잠금 갈래가 살아 있다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 *  - 구는 axios가 파싱해 둔 `data`가 객체면 `JSON.stringify`로 접었다
 *    (`handleGetPackage.ts:82-84`). 신 접속 계층의 `body`는 언제나 문자열이라
 *    그 갈래가 사라졌을 뿐 결과가 같다.
 *  - `status_text`는 구에서 axios가 준 HTTP 사유 문구였다. 신은 표준 표에서
 *    되살린다(`./internal/adt`의 `statusTextFor`) — 다른 읽기 도구와 같은 자리.
 *  - `406`/`415` 자동 재협상(`acceptNegotiation.js`)은 신 접속 계층에 없다.
 *    이미 등재된 축소분이다(`harness/DIVERGENCES.md` D8).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { adtStatusOf, encodeObjectName, statusTextFor } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

/** `dist/constants/contentTypes.js:97`의 `ACCEPT_PACKAGE` 글자 그대로. */
const ACCEPT_PACKAGE =
  'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml';

const PACKAGE_ROOT = '/sap/bc/adt/packages';

/**
 * `AdtPackageLegacy.read()`가 심는 표지. 구 핸들러가 **문자열 포함 검사**로
 * 잡아 두 키를 덧붙인다(`handleGetPackage.ts:89-91`) — 파싱하지 않는다.
 */
const LEGACY_LIMITED_MARK = 'pak:legacyLimited="true"';

const LEGACY_NOTE =
  'Legacy SAP system: only name/type/description are reliable. Super-package, application component, software component and transport metadata are not populated.';

export const getPackage = defineTool(
  {
    name: 'GetPackage',
    description:
      'Retrieve ABAP package metadata (description, super-package, etc.). Supports reading active or inactive version.',
    inputSchema: {
      package_name: z.string().describe('Package name (e.g., Z_MY_PACKAGE).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/package/high/`이고, 채록본 `exposures`에서도
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'read',
    targetNames: ['package_name'],
  },
  async (context, args) => {
    try {
      const { package_name, version = 'active' } = args;

      if (!package_name) {
        return returnError(new Error('package_name is required'));
      }

      const client = await context.getConnection();
      const packageName = package_name.toUpperCase();

      context.logger.info(`Reading package ${packageName}, version: ${version}`);

      try {
        const response = await client.request({
          method: 'GET',
          path: `${PACKAGE_ROOT}/${encodeObjectName(packageName)}`,
          params: { version },
          accept: ACCEPT_PACKAGE,
          timeout: 'default',
        });

        const packageData = response.body;
        const legacyLimited = packageData.includes(LEGACY_LIMITED_MARK);

        context.logger.info(`GetPackage completed successfully: ${packageName}`);

        return ok(
          JSON.stringify(
            {
              success: true,
              package_name: packageName,
              version,
              package_data: packageData,
              status: response.status,
              status_text: statusTextFor(response.status),
              ...(legacyLimited ? { legacy_limited: true, legacy_note: LEGACY_NOTE } : {}),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(`Error reading package ${packageName}: ${messageOf(error)}`);

        const status = adtStatusOf(error);
        // 벤더가 404를 `undefined`로 접으므로 이 갈래가 `!readResult`의 자리다.
        if (status === 404) return returnError(new Error(`Package ${packageName} not found.`));
        if (status === 423) {
          return returnError(new Error(`Package ${packageName} is locked by another user.`));
        }
        return returnError(new Error(`Failed to read package: ${messageOf(error)}`));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
