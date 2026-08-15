/**
 * RuntimeGetGatewayErrorLog — /IWFND/ERROR_LOG 목록 또는 항목 상세.
 *
 * 겉 핸들러(`engine/src/handlers/system/readonly/handleRuntimeGetGatewayErrorLog.ts:56-124`)
 * 는 `error_url`의 유무로 두 모드를 가른다. 와이어와 파싱은 `internal/gatewayFeed.ts`가
 * 소유하고 근거도 거기 적었다.
 *
 * `available_in`이 `['onprem']` 하나인 것도 구 선언 그대로다(`:16`) — Gateway
 * 오류 로그는 온프렘 축에만 있다. 그래서 이 도구는 채록본의 **연결 조건 두
 * 곳에서만** 뜬다(`connected_default` · `connected_readonly`).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import {
  fetchGatewayErrorDetail,
  fetchGatewayErrorFeed,
  parseGatewayErrorDetail,
  parseGatewayErrors,
} from './internal/gatewayFeed';
import { okJson, returnError } from './internal/results';

export const runtimeGetGatewayErrorLog = defineTool(
  {
    name: 'RuntimeGetGatewayErrorLog',
    description:
      '[runtime] List SAP Gateway error log (/IWFND/ERROR_LOG) or get error detail. Returns structured entries with type, shortText, transactionId, dateTime, username. With error_url returns full detail including serviceInfo, errorContext, sourceCode, callStack.',
    inputSchema: {
      error_url: z
        .string()
        .describe(
          'Feed URL of a specific error entry (from a previous list response link field). When provided, returns detailed error info instead of listing.',
        )
        .optional(),
      user: z.string().describe('Filter errors by SAP username.').optional(),
      max_results: z.number().describe('Maximum number of errors to return.').optional(),
      from: z.string().describe('Start of time range in YYYYMMDDHHMMSS format.').optional(),
      to: z.string().describe('End of time range in YYYYMMDDHHMMSS format.').optional(),
    },
    available_in: ['onprem'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const client = await context.getConnection();

      if (args.error_url) {
        const response = await fetchGatewayErrorDetail(client, args.error_url);
        return okJson({
          success: true,
          mode: 'detail',
          error: parseGatewayErrorDetail(response.body),
        });
      }

      const response = await fetchGatewayErrorFeed(client, {
        user: args.user,
        maxResults: args.max_results,
        from: args.from,
        to: args.to,
      });
      const errors = parseGatewayErrors(response.body);

      return okJson({
        success: true,
        mode: 'list',
        count: errors.length,
        errors,
      });
    } catch (error) {
      context.logger.error(`Error reading gateway error log: ${String(error)}`);
      return returnError(error);
    }
  },
);
