/**
 * ReadInterface — 인터페이스의 **소스와 메타데이터 두 벌**을 한 번에.
 *
 * 구 핸들러: `engine/src/handlers/interface/readonly/handleReadInterface.ts`.
 *
 * ## `GetInterface`와 무엇이 다른가 (같게 지으면 안 되는 이유)
 *
 * 이름만 닮았을 뿐 계약이 다르다. 시험(`__tests__/readInterface.test.ts` ·
 * `__tests__/getInterface.test.ts`)이 이 넷을 못박는다.
 *
 * | | `GetInterface` | `ReadInterface` |
 * |---|---|---|
 * | 왕복 | 소스 1회 | 소스 + 메타데이터 **2회** |
 * | 소스 필드 | `interface_data` | `source_code` |
 * | 읽기 실패 | **오류로 올린다** | **성공 + 그 자리에 `null`** |
 * | 노출 | `high` | `readonly`(+`high`) — 읽기 전용 표면에 뜬다 |
 *
 * 세 번째 줄이 이 도구의 성격이다. 구는 두 왕복을 각각 `try/catch`로 감싸
 * 실패를 `logger.warn`으로만 남기고 `null`을 채운 뒤 언제나 `success: true`를
 * 돌려준다(`handleReadInterface.ts:46-89`). "없는 인터페이스"와 "메타데이터만
 * 못 읽은 인터페이스"가 같은 모양으로 나오는 것이 그 계약이다.
 *
 * ## 와이어 근거 (읽기 전용 참조 — `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist`)
 *
 * - **소스**: `obj.read({interfaceName}, version)`
 *   → `core/interface/AdtInterface.js:117-136`
 *   → `core/interface/read.js:28-30` → `core/shared/AdtUtils.js:306-325`
 *   → URI `AdtUtils.js:743-755` =
 *     `/sap/bc/adt/oo/interfaces/{encodeURIComponent(이름)}/source/main?version=…`,
 *     Accept `text/plain`(`AdtUtils.js:313`).
 * - **메타데이터**: `obj.readMetadata({interfaceName})`
 *   → `core/interface/AdtInterface.js:140-167` → `core/interface/read.js:21-23`
 *   → `core/shared/AdtUtils.js:269-291`
 *   → URI `AdtUtils.js:652-663` = `/sap/bc/adt/oo/interfaces/{encodeURIComponent(이름)}`
 *     (질의 인자 없음 — 호출자가 `version`도 `withLongPolling`도 넘기지 않는다),
 *     Accept는 `getMetadataAcceptHeader('interface')`(`AdtUtils.js:706-708`) =
 *     `ACCEPT_INTERFACE`(`constants/contentTypes.js` — v5~무버전 다섯 벌).
 *
 * 구와 다른 것 (**차이가 아니다**): 구는 axios가 준 값이 문자열이 아닐 수 있어
 * `safeStringify`로 접었다(`handleReadInterface.ts:53-56`·`66-69`). 신 접속
 * 계층의 `body`는 언제나 문자열이라 그 갈래가 사라진다. **빈 본문 취급은
 * 그대로다** — 구가 `if (data)`로 걸렀으므로 빈 문자열은 `null`이 된다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName, objectSourcePath, readSourceText } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

/**
 * 메타데이터 읽기의 Accept — 구 `ACCEPT_INTERFACE` 글자 그대로
 * (`@babamba2/mcp-abap-adt-clients/dist/constants/contentTypes.js`).
 * 버전 다섯 벌을 우선순위 순으로 나열하는 것이 ADT의 관행이다.
 */
const ACCEPT_INTERFACE =
  'application/vnd.sap.adt.oo.interfaces.v5+xml, application/vnd.sap.adt.oo.interfaces.v4+xml, application/vnd.sap.adt.oo.interfaces.v3+xml, application/vnd.sap.adt.oo.interfaces.v2+xml, application/vnd.sap.adt.oo.interfaces+xml';

/** 메타데이터가 앉는 오브젝트 URI — 소스 경로에서 `/source/main`을 뺀 자리. */
function interfaceMetadataPath(name: string): string {
  return `/sap/bc/adt/oo/interfaces/${encodeObjectName(name)}`;
}

export const readInterface = defineTool(
  {
    name: 'ReadInterface',
    description:
      '[read-only] Read ABAP interface source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      interface_name: z.string().describe('Interface name (e.g., ZIF_MY_INTERFACE).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['interface_name'],
  },
  async (context, args) => {
    try {
      const { interface_name, version = 'active' } = args;

      if (!interface_name) {
        return returnError(new Error('interface_name is required'));
      }

      const client = await context.getConnection();
      const interfaceName = interface_name.toUpperCase();

      let sourceCode: string | null = null;
      try {
        const response = await readSourceText(
          client,
          objectSourcePath('interface', interfaceName),
          version,
        );
        if (response.body) sourceCode = response.body;
      } catch (error) {
        context.logger.warn(
          `Could not read source for ${interfaceName}: ${messageOf(error)}`,
        );
      }

      let metadata: string | null = null;
      try {
        const response = await client.request({
          method: 'GET',
          path: interfaceMetadataPath(interfaceName),
          accept: ACCEPT_INTERFACE,
          timeout: 'default',
        });
        if (response.body) metadata = response.body;
      } catch (error) {
        context.logger.warn(
          `Could not read metadata for ${interfaceName}: ${messageOf(error)}`,
        );
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            interface_name: interfaceName,
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
  },
);
