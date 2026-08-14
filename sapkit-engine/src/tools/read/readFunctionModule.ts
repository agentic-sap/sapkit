/**
 * ReadFunctionModule — 함수모듈의 **소스와 메타데이터를 한 벌로** 읽는다.
 *
 * ## `GetFunctionModule`과 무엇이 다른가 (실측)
 *
 * 이름이 한 글자 차이라 같은 도구로 착각하기 쉽지만 넷이 다르다. 구 트리의 자리가
 * 그 차이의 요약이다 — 이쪽은 `handlers/function_module/readonly/`, 저쪽은
 * `handlers/function_module/high/`.
 *
 *  1. **노출 집합** — `readonly`. 읽기 전용 표면(`--exposition=readonly`)에는 이
 *     도구만 뜨고 `GetFunctionModule`은 뜨지 않는다.
 *  2. **메타데이터를 함께 읽는다** — 소스 GET 뒤에 오브젝트 메타데이터를 한 번 더
 *     GET 한다(패키지·책임자·설명). `GetFunctionModule`은 소스만 읽는다.
 *  3. **곁읽기가 옵트인이다** — `check_inactive` 기본값이 **false**다
 *     (`GetFunctionModule`은 true). 이쪽이 대량 읽기 표면이라 FM마다 드는 추가
 *     왕복을 기본으로 물리지 않는다는 것이 구 주석의 근거다.
 *  4. **오류를 데이터로 접는다** — 소스·메타데이터 읽기가 실패해도 오류가 아니라
 *     그 자리가 `null`이다. `GetFunctionModule`은 404·423을 오류 문구로 올린다.
 *
 * 그래서 응답의 키도 다르다: 이쪽은 `source_code` + `metadata`,
 * 저쪽은 `function_module_data` + `status` + `status_text`.
 *
 * ## 와이어 근거 (전부 읽기 전용 참고)
 *
 *  - 구 핸들러 — `engine/src/handlers/function_module/readonly/handleReadFunctionModule.ts:65-152`
 *  - 위임 — `engine/src/lib/clients.ts:15-32`(createAdtClient) →
 *    `@babamba2/mcp-abap-adt-clients/dist/core/functionModule/AdtFunctionModule.js:117-178`
 *    (`read` 는 404를 `undefined`로 접고, `readMetadata`는 던진다)
 *  - 저수준 — 같은 패키지 `core/functionModule/read.js:22-33` →
 *    `core/shared/AdtUtils.js:306-326`(소스: 질의 인자 `version`, Accept `text/plain`) ·
 *    `AdtUtils.js:269-292`(메타데이터: 질의 인자 없음) ·
 *    `AdtUtils.js:743-763`(소스 URI) · `AdtUtils.js:652-671`(메타데이터 URI) ·
 *    `AdtUtils.js:700-741`(메타데이터 Accept = `ACCEPT_FUNCTION_MODULE`)
 *  - Accept 상수 — 같은 패키지 `constants/contentTypes.js:75`
 *  - 계약 정본(구 엔진 자체 시험) — `engine/src/__tests__/handleReadFunctionModule.test.ts`
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 axios가 파싱해 둔 `data`가 문자열이 아닐 수 있어 `safeStringify`로 접었다.
 * 신 접속 계층의 `body`는 언제나 문자열이라 그 갈래가 사라진다. 빈 본문을 `null`로
 * 접는 판정(구의 truthy 검사)은 그대로 옮겼다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName, functionModuleSourcePath, readSourceText } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

/**
 * 메타데이터 읽기가 싣는 Accept. 구 벤더 상수 `ACCEPT_FUNCTION_MODULE`
 * (`constants/contentTypes.js:75`) 그대로 — 세 판을 한 줄에 늘어놓는다.
 */
export const ACCEPT_FUNCTION_MODULE =
  'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml';

/** 소스가 아니라 오브젝트 자체의 URI. 소스 경로에서 `/source/main`을 뗀 자리다. */
function functionModuleMetadataPath(groupName: string, moduleName: string): string {
  return (
    `/sap/bc/adt/functions/groups/${encodeObjectName(groupName)}` +
    `/fmodules/${encodeObjectName(moduleName)}`
  );
}

const INACTIVE_DIVERGENCE_WARNING =
  "An inactive (unactivated) version of this function module exists and differs from the active source returned here — re-read with version='inactive' before editing, or the pending edit will be silently overwritten.";

/** 구의 truthy 검사(`if (readResult?.readResult?.data)`) — 빈 본문은 없는 것이다. */
function textOrNull(body: string): string | null {
  return body ? body : null;
}

export const readFunctionModule = defineTool(
  {
    name: 'ReadFunctionModule',
    description:
      "[read-only] Read ABAP function module source code and metadata (package, responsible, description, etc.). CAUTION: default version='active' returns the pre-edit source when an unactivated edit exists — when re-editing, read version='inactive' first, or the previous edit is silently lost on the next write. 'Active' source being returned is not proof of successful activation.",
    inputSchema: {
      function_module_name: z.string().describe('Function module name (e.g., Z_MY_FM).'),
      function_group_name: z
        .string()
        .describe('Function group name containing the function module (e.g., Z_MY_FG).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
      check_inactive: z
        .boolean()
        .optional()
        .describe(
          'Opt-in (default false). When reading the active version, also read the inactive version and, if an unactivated version exists and its source differs, attach a "warning" to the response. Costs one extra ADT call; recommended before re-editing an FM. The extra read never fails or slows the main read.',
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    // 함수그룹 이름은 대상이 아니라 좌표다 — 소스를 실어 오는 것은 FM 쪽이다.
    targetNames: ['function_module_name'],
  },
  async (context, args) => {
    try {
      const {
        function_module_name,
        function_group_name,
        version = 'active',
        check_inactive = false,
      } = args;

      if (!function_module_name || !function_group_name) {
        return returnError(
          new Error('function_module_name and function_group_name are required'),
        );
      }

      const client = await context.getConnection();
      const functionModuleName = function_module_name.toUpperCase();
      const functionGroupName = function_group_name.toUpperCase();
      const sourcePath = functionModuleSourcePath(functionGroupName, functionModuleName);

      let sourceCode: string | null = null;
      try {
        const response = await readSourceText(client, sourcePath, version);
        sourceCode = textOrNull(response.body);
      } catch (error) {
        context.logger.warn(
          `Could not read source for ${functionModuleName}: ${messageOf(error)}`,
        );
      }

      let metadata: string | null = null;
      try {
        const response = await client.request({
          method: 'GET',
          path: functionModuleMetadataPath(functionGroupName, functionModuleName),
          accept: ACCEPT_FUNCTION_MODULE,
          timeout: 'default',
        });
        metadata = textOrNull(response.body);
      } catch (error) {
        context.logger.warn(
          `Could not read metadata for ${functionModuleName}: ${messageOf(error)}`,
        );
      }

      // 옵트인 곁읽기. 본 읽기가 빈손이면 견줄 것이 없으므로 아예 묻지 않는다 —
      // 구의 `source_code != null` 조건이 그 자리다.
      let warning: string | undefined;
      if (version === 'active' && check_inactive === true && sourceCode != null) {
        try {
          const inactive = await readSourceText(client, sourcePath, 'inactive');
          if (inactive.body !== sourceCode) {
            warning = INACTIVE_DIVERGENCE_WARNING;
          }
        } catch (error) {
          context.logger.debug(
            `Inactive-version check skipped for ${functionModuleName}: ${messageOf(error)}`,
          );
        }
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            function_module_name: functionModuleName,
            function_group_name: functionGroupName,
            version,
            source_code: sourceCode,
            metadata,
            warning,
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
