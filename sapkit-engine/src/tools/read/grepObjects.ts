/**
 * GrepObjects — 오브젝트 여러 벌의 소스를 한 번에 정규식으로 훑는다.
 *
 * 오브젝트를 하나씩 읽어 클라이언트에서 거르는 대신 서버가 훑어 일치 줄만
 * 돌려준다. 소스를 못 가져온 오브젝트는 **훑기를 멈추지 않고** 이유와 함께
 * `skipped`로 남는다 — 한 벌의 실패가 나머지 49벌을 못 보게 하면 안 된다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server';
import {
  functionGroupPath,
  includeSourcePath,
  objectSourcePath,
  readSourceText,
} from './internal/adt';
import {
  aggregateGrepResults,
  compileGrepRegex,
  runWithConcurrency,
  type ObjectGrepInput,
} from './internal/grep';
import { failure, messageOf, ok } from './internal/results';

const MAX_OBJECTS = 50;
const FETCH_CONCURRENCY = 5;

type SourceObjectCode = 'CLAS' | 'PROG' | 'INTF' | 'INCL' | 'FUGR' | 'FUNC';

/**
 * 호출자가 준 타입 문자열을 이 도구가 아는 코드로 분류한다.
 * 독립 인클루드의 ADT 타입은 `PROG/I`이므로 일반 `PROG/`보다 **먼저** 본다.
 */
export function classifySourceType(rawType: string): SourceObjectCode | undefined {
  const type = (rawType ?? '').trim().toUpperCase();
  if (!type) return undefined;
  if (type === 'INCL' || type.startsWith('PROG/I')) return 'INCL';
  if (type === 'CLAS' || type.startsWith('CLAS/')) return 'CLAS';
  if (type === 'PROG' || type.startsWith('PROG/')) return 'PROG';
  if (type === 'INTF' || type.startsWith('INTF/')) return 'INTF';
  if (type === 'FUNC' || type === 'FUGR/FF') return 'FUNC';
  if (type === 'FUGR' || type.startsWith('FUGR/')) return 'FUGR';
  return undefined;
}

/** 오브젝트 하나의 소스. 실패는 던지지 않고 `skipReason`으로 돌아온다. */
async function fetchObjectSource(
  client: AdtClient,
  objectType: string,
  objectName: string,
  warn: (message: string) => void,
): Promise<{ source: string | null; skipReason?: string }> {
  const code = classifySourceType(objectType);
  const name = (objectName ?? '').trim().toUpperCase();

  if (!name) return { source: null, skipReason: 'object_name is required' };
  if (!code) {
    return {
      source: null,
      skipReason: `Unsupported object_type "${objectType}" for source search (supported: CLAS, PROG, INTF, INCL, FUGR)`,
    };
  }
  if (code === 'FUNC') {
    return {
      source: null,
      skipReason:
        'Function module source requires both function_module_name and function_group_name; not resolvable from object_name alone. Use object_type "FUGR" with the function group name to search the whole group instead.',
    };
  }

  try {
    if (code === 'INCL') {
      const response = await client.request({
        method: 'GET',
        path: includeSourcePath(name),
        timeout: 'default',
      });
      return { source: response.body };
    }
    if (code === 'FUGR') {
      const response = await client.request({
        method: 'GET',
        path: functionGroupPath(name),
        accept: '*/*',
        timeout: 'default',
      });
      return { source: response.body };
    }
    const kind = code === 'CLAS' ? 'class' : code === 'PROG' ? 'program' : 'interface';
    const response = await readSourceText(client, objectSourcePath(kind, name), 'active');
    return { source: response.body };
  } catch (error) {
    warn(`GrepObjects: could not fetch source for ${objectType} ${name}: ${messageOf(error)}`);
    return { source: null, skipReason: `Failed to fetch source: ${messageOf(error)}` };
  }
}

export const grepObjects = defineTool(
  {
    name: 'GrepObjects',
    description:
      '[read-only] Search ABAP source code for a regex pattern across multiple named objects in a single call — finds matching lines (with optional context) instead of reading each object one by one. Supports CLAS, PROG, INTF, INCL, and FUGR (function group). Individual function modules (FUNC) are not supported; use FUGR with the group name to search the whole group.',
    inputSchema: {
      objects: z
        .array(
          z.object({
            object_type: z
              .string()
              .describe('ABAP object type: CLAS, PROG, INTF, INCL, or FUGR.'),
            object_name: z.string().describe('Object name (e.g. ZCL_MY_CLASS).'),
          }),
        )
        .describe('Objects to search (1-50 entries).'),
      pattern: z
        .string()
        .describe('JavaScript regular expression source to search for (e.g. "SELECT\\\\s+\\\\*").'),
      case_insensitive: z
        .boolean()
        .optional()
        .describe('Case-insensitive match. Default: false.'),
      context_lines: z
        .number()
        .default(0)
        .describe('Number of lines of context before/after each match (0-5). Default: 0.'),
      max_results: z
        .number()
        .default(100)
        .describe('Maximum total matches to return across all objects. Default: 100.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      const requested = args.objects;
      if (!Array.isArray(requested) || requested.length === 0) {
        throw new Error('objects must be a non-empty array (1-50 entries)');
      }
      if (requested.length > MAX_OBJECTS) {
        throw new Error(`objects must contain at most ${MAX_OBJECTS} entries`);
      }

      const caseInsensitive = args.case_insensitive === true;
      // 나쁜 정규식은 SAP에 한 바이트도 나가기 전에 걸러진다.
      const regex = compileGrepRegex(args.pattern, caseInsensitive);

      const client = await context.getConnection();
      const inputs: ObjectGrepInput[] = new Array(requested.length);

      await runWithConcurrency(requested, FETCH_CONCURRENCY, async (item, index) => {
        const objectType = String(item?.object_type ?? '').trim();
        const objectName = String(item?.object_name ?? '').trim();
        if (!objectType || !objectName) {
          inputs[index] = {
            object_type: objectType || '(missing)',
            object_name: objectName || '(missing)',
            source: null,
            skip_reason: 'object_type and object_name are required',
          };
          return;
        }
        const { source, skipReason } = await fetchObjectSource(
          client,
          objectType,
          objectName,
          (message) => context.logger.warn(message),
        );
        inputs[index] = {
          object_type: objectType,
          object_name: objectName,
          source,
          skip_reason: skipReason,
        };
      });

      const aggregate = aggregateGrepResults(inputs, regex, {
        context_lines: args.context_lines ?? 0,
        max_results: args.max_results ?? 100,
      });

      return ok(JSON.stringify(aggregate, null, 2));
    } catch (error) {
      return failure(messageOf(error));
    }
  },
);
