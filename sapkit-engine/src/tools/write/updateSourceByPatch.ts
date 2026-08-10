/**
 * UpdateSourceByPatch — 전체 소스를 다시 보내는 대신 **부분 치환**으로 고친다.
 *
 * 흐름: 현재 소스를 읽는다 → `old_string`을 찾아 바꾼다 → 완성된 전체 소스를
 * **같은 쓰기 도구에 그대로 위임**한다. 위임이 요점이다 — 잠금·구문검사·PUT·
 * 해제·활성화가 UpdateClass/UpdateProgram/UpdateInclude를 직접 부른 것과 한
 * 글자도 다르지 않아야 한다. 구 핸들러
 * (`engine/src/handlers/common/high/handleUpdateSourceByPatch.ts`)도 그렇게 한다.
 *
 * 치환 판정은 순수 문자열 연산이고, 두 가지를 지킨다:
 *  - 못 찾으면 **아무것도 쓰지 않는다**.
 *  - 여러 곳에 걸리면 `replace_all` 없이는 **거부한다** — 어느 하나를 고르는
 *    추측이 곧 엉뚱한 자리를 고치는 것이다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server';
import type { SapTool, ToolContext, ToolResult } from '../../server';
import { describeFailure, encodeObjectName, errorResult, getSource, okResult } from './shared';
import { updateClass } from './updateClass';
import { updateInclude } from './updateInclude';
import { updateProgram } from './updateProgram';

const PATCH_TYPES = ['CLAS', 'PROG', 'INTF', 'INCL', 'FUNC'] as const;
type PatchType = (typeof PATCH_TYPES)[number];

/**
 * M1이 아직 짓지 않은 위임 대상. 스키마는 구 그대로 다섯 값을 발행하지만,
 * 이 둘은 위임할 쓰기 도구(UpdateInterface·UpdateFunctionModule)가 이 판에
 * 없다. **조용히 다른 경로로 새지 않고** 그 사실을 말한다.
 */
const NOT_YET_BUILT: Readonly<Record<string, string>> = {
  INTF: 'UpdateInterface',
  FUNC: 'UpdateFunctionModule',
};

export interface SourcePatchResult {
  readonly newSource: string;
  readonly occurrences: number;
  /** 원본에서 첫 일치가 시작하는 위치. */
  readonly firstMatchIndex: number;
}

export function findOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const indices: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    indices.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return indices;
}

export function applySourcePatch(
  source: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): SourcePatchResult {
  const indices = findOccurrences(source, oldString);
  const first = indices[0];
  if (first === undefined) throw new Error('old_string not found in current source');
  if (indices.length > 1 && !replaceAll) {
    throw new Error(
      `old_string matches ${indices.length} locations (not unique) — add more context to old_string, or pass replace_all: true to replace every occurrence`,
    );
  }
  if (replaceAll) {
    return {
      newSource: source.split(oldString).join(newString),
      occurrences: indices.length,
      firstMatchIndex: first,
    };
  }
  return {
    newSource: source.slice(0, first) + newString + source.slice(first + oldString.length),
    occurrences: 1,
    firstMatchIndex: first,
  };
}

/** 첫 치환 자리 주변만 보여 주는 압축 diff. 앞부분은 양쪽이 같으므로 줄번호가 맞는다. */
export function buildDiffPreview(
  oldSource: string,
  newSource: string,
  matchIndex: number,
  oldString: string,
  newString: string,
  contextLines = 2,
): string {
  const oldLines = oldSource.split('\n');
  const newLines = newSource.split('\n');

  const startLine = oldSource.slice(0, matchIndex).split('\n').length; // 1-based
  const oldBlock = oldString.split('\n').length;
  const newBlock = newString.split('\n').length;

  const oldStart = Math.max(1, startLine - contextLines);
  const oldEnd = Math.min(oldLines.length, startLine + oldBlock - 1 + contextLines);
  const newEnd = Math.min(newLines.length, startLine + newBlock - 1 + contextLines);

  const before = oldLines.slice(oldStart - 1, startLine - 1).map((line) => ` ${line}`);
  const removed = oldLines.slice(startLine - 1, startLine - 1 + oldBlock).map((line) => `-${line}`);
  const added = newLines.slice(startLine - 1, startLine - 1 + newBlock).map((line) => `+${line}`);
  const after = oldLines.slice(startLine - 1 + oldBlock, oldEnd).map((line) => ` ${line}`);

  const header = `@@ -${oldStart},${oldEnd - oldStart + 1} +${oldStart},${newEnd - oldStart + 1} @@`;
  return [header, ...before, ...removed, ...added, ...after].join('\n');
}

/**
 * 현재 소스를 읽는다. 읽기 URI는 구가 쓰던 것 그대로다 — 쓰기 URI와 대소문자
 * 규칙이 다르다(읽기는 이름을 대문자 그대로 싣는다).
 */
async function fetchCurrentSource(
  client: AdtClient,
  objectType: PatchType,
  objectName: string,
): Promise<string> {
  const encoded = encodeObjectName(objectName);
  if (objectType === 'INCL') {
    return getSource(client, `/sap/bc/adt/programs/includes/${encoded}`);
  }
  if (objectType === 'CLAS') {
    return getSource(client, `/sap/bc/adt/oo/classes/${encoded}`, 'active');
  }
  return getSource(client, `/sap/bc/adt/programs/programs/${encoded}`, 'active');
}

function delegateFor(objectType: PatchType): SapTool {
  if (objectType === 'CLAS') return updateClass;
  if (objectType === 'PROG') return updateProgram;
  return updateInclude;
}

function delegateArgs(
  objectType: PatchType,
  objectName: string,
  newSource: string,
  transportRequest: string | undefined,
  activate: boolean,
): Record<string, unknown> {
  const common = {
    source_code: newSource,
    transport_request: transportRequest,
    activate,
  };
  if (objectType === 'CLAS') return { class_name: objectName, ...common };
  if (objectType === 'PROG') return { program_name: objectName, ...common };
  return { include_name: objectName, ...common };
}

export const updateSourceByPatch = defineTool(
  {
    name: 'UpdateSourceByPatch',
    description:
      'Modify existing ABAP source code on SAP via a surgical string replacement (find old_string, replace with new_string) instead of resending the full source. Fetches the current source, applies the patch, then delegates the write to the same lock -> syntax-check -> update -> unlock -> (activate) flow used by UpdateClass/UpdateProgram/UpdateInterface/UpdateInclude/UpdateFunctionModule. Supported object_type values: CLAS (class), PROG (program, on-premise/legacy only), INTF (interface), INCL (include, on-premise/legacy only), FUNC (function module, requires function_group). old_string must match the current source exactly, including whitespace, and must be unique unless replace_all is true.',
    inputSchema: {
      object_type: z
        .enum(['CLAS', 'PROG', 'INTF', 'INCL', 'FUNC'])
        .describe(
          'ABAP object kind to patch: CLAS (class), PROG (program), INTF (interface), INCL (include), FUNC (function module).',
        ),
      object_name: z.string().describe('Name of the object to patch (e.g., ZCL_MY_CLASS).'),
      function_group: z
        .string()
        .describe("Function group name. Required when object_type is 'FUNC'.")
        .optional(),
      old_string: z
        .string()
        .describe(
          'Exact text to find in the current source (whitespace-sensitive). Must match exactly once unless replace_all is true.',
        ),
      new_string: z.string().describe('Replacement text.'),
      replace_all: z
        .boolean()
        .describe(
          'Replace every occurrence of old_string instead of requiring a unique match. Default: false.',
        )
        .optional(),
      transport_request: z
        .string()
        .describe('Transport request number, passed through to the delegated update handler.')
        .optional(),
      activate: z
        .boolean()
        .describe('Activate the object after the patched source is written. Default: false.')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
  },
  async (context: ToolContext, args) => {
    const { logger } = context;
    try {
      const objectType = args.object_type as PatchType | undefined;
      if (
        !objectType ||
        !args.object_name ||
        args.old_string === undefined ||
        args.new_string === undefined
      ) {
        return errorResult(
          'object_type, object_name, old_string, and new_string are required',
        );
      }
      if (!PATCH_TYPES.includes(objectType)) {
        return errorResult(
          `Unsupported object_type '${objectType}'. Must be one of: ${PATCH_TYPES.join(', ')}`,
        );
      }
      if (objectType === 'FUNC' && !args.function_group) {
        return errorResult('function_group is required when object_type is FUNC');
      }

      const delegateName = NOT_YET_BUILT[objectType];
      if (delegateName) {
        return errorResult(
          `object_type '${objectType}' is not available in this engine build — the write it delegates to (${delegateName}) is not implemented yet. Nothing was read from or written to SAP.`,
        );
      }

      const objectName = String(args.object_name).toUpperCase();
      const replaceAll = args.replace_all === true;
      const shouldActivate = args.activate === true;
      logger.info(
        `UpdateSourceByPatch: object_type=${objectType}, object_name=${objectName}, replace_all=${replaceAll}, activate=${shouldActivate}`,
      );

      const client = await context.getConnection();
      const currentSource = await fetchCurrentSource(client, objectType, objectName);

      let patch: SourcePatchResult;
      try {
        patch = applySourcePatch(currentSource, args.old_string, args.new_string, replaceAll);
      } catch (error) {
        return errorResult(
          `${describeFailure(error)} (object: ${objectType} ${objectName})`,
        );
      }

      const diffPreview = buildDiffPreview(
        currentSource,
        patch.newSource,
        patch.firstMatchIndex,
        args.old_string,
        args.new_string,
      );

      const delegate = delegateFor(objectType);
      const delegated: ToolResult = await delegate.handler(
        context,
        delegateArgs(
          objectType,
          objectName,
          patch.newSource,
          args.transport_request,
          shouldActivate,
        ),
      );
      // 위임된 실패는 그대로 올린다 — 구문검사 진단·잠금 충돌 문구가 이미 다
      // 들어 있고, 여기서 다시 포장하면 줄번호가 묻힌다.
      if (delegated.isError) return delegated;

      let activated = shouldActivate;
      let checkWarnings: unknown;
      try {
        const payload = JSON.parse(delegated.content.map((item) => item.text).join('')) as {
          activated?: unknown;
          check_warnings?: unknown;
        };
        if (typeof payload.activated === 'boolean') activated = payload.activated;
        if (payload.check_warnings) checkWarnings = payload.check_warnings;
      } catch {
        // 위임 응답이 JSON이 아니었다 — 계산해 둔 기본값을 쓴다.
      }

      return okResult({
        success: true,
        object_type: objectType,
        object_name: objectName,
        function_group: args.function_group ? String(args.function_group).toUpperCase() : undefined,
        occurrences_replaced: patch.occurrences,
        diff_preview: diffPreview,
        activated,
        check_warnings: checkWarnings,
        message: `${objectType} ${objectName} patched (${patch.occurrences} occurrence${
          patch.occurrences === 1 ? '' : 's'
        } replaced)${activated ? ' and activated' : ''}`,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`UpdateSourceByPatch failed: ${message}`);
      return errorResult(message);
    }
  },
);
