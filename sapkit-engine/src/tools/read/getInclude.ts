/**
 * GetInclude — 독립 인클루드 한 벌의 소스.
 *
 * 응답은 소스 텍스트 **그대로**다(JSON으로 싸지 않는다 — 구와 같다). 이름을
 * 대문자로 올리지도 않는다: 구가 받은 문자열을 그대로 인코딩해 보냈고, ADT
 * 경로는 대소문자를 가리지 않는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { includeSourcePath } from './internal/adt';
import { failure, messageOf, ok } from './internal/results';

export const getInclude = defineTool(
  {
    name: 'GetInclude',
    description: '[read-only] Retrieve source code of a specific ABAP include file.',
    inputSchema: {
      include_name: z.string().describe('Name of the ABAP Include'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['include_name'],
  },
  async (context, args) => {
    try {
      if (!args.include_name) {
        throw new Error('Include name is required');
      }

      const client = await context.getConnection();
      context.logger.info(`Fetching include: ${args.include_name}`);

      const response = await client.request({
        method: 'GET',
        path: includeSourcePath(args.include_name),
        timeout: 'default',
      });

      context.logger.info(`GetInclude completed: ${args.include_name}`);
      return ok(response.body);
    } catch (error) {
      context.logger.error(
        `Error getting include ${args.include_name ?? ''}: ${messageOf(error)}`,
      );
      return failure(messageOf(error));
    }
  },
);
