/**
 * GetFunctionModule — 함수모듈 소스 한 벌.
 *
 * 이 도구에는 조용한 파괴를 막는 장치가 하나 붙어 있다. 기본값
 * `version='active'`는 활성화되지 않은 편집이 있어도 **편집 전 소스**를 돌려주는데,
 * 그 위에 다시 쓰면 앞선 편집이 소리 없이 사라지고 어떤 게이트도 잡지 못한다.
 * 그래서 활성 판을 읽을 때 비활성 판을 한 번 더 읽어 다르면 `warning`을 붙인다.
 * 이 곁읽기는 **결코 실패하지 않고 본 읽기를 늦추지도 않는다** — 실패하면 그냥
 * 경고를 붙이지 않을 뿐이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import {
  adtStatusOf,
  functionModuleSourcePath,
  readSourceText,
  statusTextFor,
} from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

const INACTIVE_DIVERGENCE_WARNING =
  "An inactive (unactivated) version of this function module exists and differs from the active source returned here — re-read with version='inactive' before editing, or the pending edit will be silently overwritten.";

export const getFunctionModule = defineTool(
  {
    name: 'GetFunctionModule',
    description:
      "Retrieve ABAP function module definition. Supports reading active or inactive version. CAUTION: the default version='active' returns the pre-edit source when an unactivated edit exists — writing on top of it silently destroys the previous edit and no gate catches it. When re-editing, read version='inactive' first (or check GetInactiveObjects), and re-read after every write. A returned 'active' source is NOT proof the FM was ever successfully activated (never-activated FMs also return it).",
    inputSchema: {
      function_module_name: z
        .string()
        .describe('FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).'),
      function_group_name: z
        .string()
        .describe(
          'FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).',
        ),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
      check_inactive: z
        .boolean()
        .optional()
        .describe(
          "When reading the active version, also read the inactive version (one extra ADT call) and, if an unactivated version exists and its source differs, attach a 'warning' to the response. Default true. The extra read never fails or slows the main read. Set false to skip it.",
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const {
        function_module_name,
        function_group_name,
        version = 'active',
        check_inactive = true,
      } = args;

      if (!function_module_name || !function_group_name) {
        return returnError(
          new Error('function_module_name and function_group_name are required'),
        );
      }

      const client = await context.getConnection();
      const functionModuleName = function_module_name.toUpperCase();
      const functionGroupName = function_group_name.toUpperCase();
      const path = functionModuleSourcePath(functionGroupName, functionModuleName);

      context.logger.info(
        `Reading function module ${functionModuleName} in ${functionGroupName}, version: ${version}`,
      );

      try {
        const response = await readSourceText(client, path, version);
        const functionModuleData = response.body;

        let warning: string | undefined;
        if (version === 'active' && check_inactive !== false) {
          try {
            const inactive = await readSourceText(client, path, 'inactive');
            if (inactive.body != null && inactive.body !== functionModuleData) {
              warning = INACTIVE_DIVERGENCE_WARNING;
            }
          } catch (inactiveError) {
            context.logger.debug(
              `[GetFunctionModule] Inactive-version check skipped for ${functionModuleName}: ${messageOf(inactiveError)}`,
            );
          }
        }

        context.logger.info(
          `GetFunctionModule completed successfully: ${functionModuleName}`,
        );

        return ok(
          JSON.stringify(
            {
              success: true,
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              version,
              function_module_data: functionModuleData,
              status: response.status,
              status_text: statusTextFor(response.status),
              warning,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading function module ${functionModuleName}: ${messageOf(error)}`,
        );

        const status = adtStatusOf(error);
        const message =
          status === 404
            ? `FunctionModule ${functionModuleName} not found.`
            : status === 423
              ? `FunctionModule ${functionModuleName} is locked by another user.`
              : `Failed to read function module: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
