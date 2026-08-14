/**
 * GetSourceDiff — 오브젝트 두 벌의 활성 소스를 통합 diff로 견준다.
 *
 * 두 소스를 **동시에** 읽는다(구와 같다 — 순차로 바꾸면 왕복이 두 배가 된다).
 * 너무 크게 갈라져 안전하게 diff할 수 없으면 잘린 diff 대신
 * `{ identical:false, too_large:true, reason, stats }`를 돌려준다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { includeSourcePath, objectSourcePath, readSourceText } from './internal/adt';
import { computeUnifiedDiff } from './internal/diff';
import { ok, returnError } from './internal/results';

const SUPPORTED_TYPES = ['CLAS', 'PROG', 'INTF', 'INCL'] as const;

async function fetchSource(
  client: AdtClient,
  objectType: string,
  objectName: string,
): Promise<string> {
  const type = objectType.toUpperCase();
  const name = objectName.toUpperCase();

  if (type === 'INCL') {
    const response = await client.request({
      method: 'GET',
      path: includeSourcePath(name),
      timeout: 'default',
    });
    return response.body;
  }

  const kind = type === 'CLAS' ? 'class' : type === 'PROG' ? 'program' : 'interface';
  const response = await readSourceText(client, objectSourcePath(kind, name), 'active');
  return response.body;
}

export const getSourceDiff = defineTool(
  {
    name: 'GetSourceDiff',
    description:
      '[read-only] Compute a unified diff between the source code of two ABAP objects (e.g. compare ZCL_A vs ZCL_B, or a program vs a copy of itself). Supports CLAS, PROG, INTF, INCL. If the two sources differ too extensively to safely diff (after trimming common leading/trailing lines), returns { identical: false, too_large: true, reason, stats: { old_lines, new_lines } } instead of a diff.',
    inputSchema: {
      object_type_a: z
        .enum(['CLAS', 'PROG', 'INTF', 'INCL'])
        .describe('Object type of the first (left / "old") object.'),
      object_name_a: z.string().describe('Object name of the first (left / "old") object.'),
      object_type_b: z
        .enum(['CLAS', 'PROG', 'INTF', 'INCL'])
        .describe('Object type of the second (right / "new") object.'),
      object_name_b: z.string().describe('Object name of the second (right / "new") object.'),
      context_lines: z
        .number()
        .default(3)
        .describe('Number of unchanged context lines around each change.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['object_name_a', 'object_name_b'],
  },
  async (context, args) => {
    try {
      const {
        object_type_a,
        object_name_a,
        object_type_b,
        object_name_b,
        context_lines = 3,
      } = args;

      if (!object_type_a || !object_name_a || !object_type_b || !object_name_b) {
        throw new Error(
          'object_type_a, object_name_a, object_type_b, object_name_b are all required',
        );
      }

      const typeA = object_type_a.toUpperCase();
      const typeB = object_type_b.toUpperCase();
      if (
        !SUPPORTED_TYPES.includes(typeA as (typeof SUPPORTED_TYPES)[number]) ||
        !SUPPORTED_TYPES.includes(typeB as (typeof SUPPORTED_TYPES)[number])
      ) {
        throw new Error(`object_type must be one of ${SUPPORTED_TYPES.join(', ')}`);
      }

      const client = await context.getConnection();
      const [sourceA, sourceB] = await Promise.all([
        fetchSource(client, typeA, object_name_a),
        fetchSource(client, typeB, object_name_b),
      ]);

      const result = computeUnifiedDiff(sourceA, sourceB, {
        contextLines: context_lines,
        oldLabel: `${object_name_a.toUpperCase()} (${typeA})`,
        newLabel: `${object_name_b.toUpperCase()} (${typeB})`,
      });

      if ('too_large' in result) {
        return ok(
          JSON.stringify({
            identical: false,
            too_large: true,
            reason: result.reason,
            stats: result.stats,
          }),
        );
      }

      return ok(
        JSON.stringify({
          identical: result.identical,
          diff: result.diff,
          stats: result.stats,
        }),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
