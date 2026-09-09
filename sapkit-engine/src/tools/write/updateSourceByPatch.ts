/**
 * UpdateSourceByPatch — 전체 소스를 다시 보내는 대신 **부분 치환**으로 고친다.
 *
 * 흐름: 현재 소스를 읽는다 → `old_string`을 찾아 바꾼다 → 완성된 전체 소스를
 * **같은 쓰기 도구에 그대로 위임**한다. 위임이 요점이다 — 잠금·구문검사·PUT·
 * 해제·활성화가 UpdateClass/UpdateProgram/UpdateInclude/UpdateInterface/
 * UpdateFunctionModule을 직접 부른 것과 한 글자도 다르지 않아야 한다. 구 핸들러
 * (`engine/src/handlers/common/high/handleUpdateSourceByPatch.ts`)도 그렇게 한다.
 *
 * 치환 판정은 순수 문자열 연산이고, 두 가지를 지킨다:
 *  - 못 찾으면 **아무것도 쓰지 않는다**.
 *  - 여러 곳에 걸리면 `replace_all` 없이는 **거부한다** — 어느 하나를 고르는
 *    추측이 곧 엉뚱한 자리를 고치는 것이다.
 *
 * ## 실사용이 고친 다섯 자리 (D-147 · 장부 D142 · D143)
 *
 * 1. **읽는 판** — 비활성 판을 먼저 읽고 없으면(404·400) 활성으로 떨어진다. 구는
 *    언제나 활성을 읽어 `activate:false` 연속 패치의 앞 패치가 조용히 사라졌다
 *    (2시스템·5회 이상 실증 · 통제실험 2026-08-19 — `sapkit-feedback.md`). 응답의
 *    `source_version_read`가 어느 판을 읽었는지 말한다.
 * 2. **줄바꿈** — SAP 소스는 CRLF, 인자는 LF라 여러 줄 `old_string`은 원리적으로
 *    안 맞았다(2026-07-29 · 08-03). 매칭은 LF로 정규화해 하고, 되쓸 때 소스의 원래
 *    EOL로 복원한다 — 혼합 EOL 파일을 만들지 않는다(구는 새 줄만 LF로 심었다).
 * 3. **유일성 오류의 정보량** — 각 일치의 줄 번호와 그 줄 원문을 싣는다
 *    (`PERFORM do_show.`가 `FORM do_show.`의 부분문자열로 걸린 사례 2026-08-04 ·
 *    들여쓰기만 다른 같은 문장 17곳 2026-08-06).
 * 4. **`match_whole_line`** — 켜면 `old_string`의 각 줄이 소스 한 줄 전체와(양끝
 *    공백 제외) 일치해야 한다. 기본은 끔 = 구 그대로 부분문자열.
 * 5. **FUNC·INTF 배선** — 스키마에 있던 두 값이 즉시 거부되던 것을(2026-08-31)
 *    `UpdateFunctionModule`·`UpdateInterface`로 위임한다. 두 도구는 이미 있었다.
 *
 * 함수그룹 인클루드(`LZ…F01`)의 잠금 주소는 위임받는 `UpdateInclude`가 이름에서
 * 유도한다(`shared.ts`의 `includeWriteUri` · 장부 D143). 읽기는 독립 주소로 해도
 * 소스가 온다(실측 2026-07-30).
 *
 * **실기 미검증** — 위 다섯은 전부 오프라인 시험으로만 닫혔다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { SapTool, ToolContext, ToolResult } from '../../server/toolDefinition';
import { describeFailure, encodeObjectName, errorResult, getSource, okResult } from './shared';
import { updateClass } from './updateClass';
import { updateFunctionModule } from './updateFunctionModule';
import { updateInclude } from './updateInclude';
import { updateInterface } from './updateInterface';
import { updateProgram } from './updateProgram';

const PATCH_TYPES = ['CLAS', 'PROG', 'INTF', 'INCL', 'FUNC'] as const;
type PatchType = (typeof PATCH_TYPES)[number];

export type SourceVersionRead = 'inactive' | 'active';

// ── 줄바꿈 ──────────────────────────────────────────────────────────────────

export type LineEnding = '\r\n' | '\n';

/** 소스가 CRLF를 하나라도 갖고 있으면 CRLF 파일로 본다 — 되쓸 때 전부 그 EOL로 맞춘다. */
export function detectLineEnding(source: string): LineEnding {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** LF 텍스트를 소스 원래 EOL로 되돌린다. */
export function restoreLineEndings(text: string, eol: LineEnding): string {
  return eol === '\n' ? text : text.replace(/\n/g, '\r\n');
}

// ── 매칭 ────────────────────────────────────────────────────────────────────

export interface MatchRange {
  /** 시작 오프셋(LF 정규화본 기준). */
  readonly start: number;
  /** 끝 오프셋(배타). */
  readonly end: number;
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

function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source[i] === '\n') starts.push(i + 1);
  return starts;
}

/**
 * 줄 전체 일치 — `old_string`의 각 줄이 소스 한 줄과 **양끝 공백을 뺀 채** 같아야
 * 한다. 앞뒤의 빈 줄은 앵커가 아니다(`old_string`이 개행으로 끝나는 흔한 모양을
 * 허용한다). 일치 구간은 첫 줄 시작부터 마지막 줄 끝(개행 제외)까지다.
 */
export function findWholeLineMatches(source: string, oldString: string): MatchRange[] {
  const wanted = oldString.split('\n').map((line) => line.trim());
  while (wanted.length > 1 && wanted[wanted.length - 1] === '') wanted.pop();
  while (wanted.length > 1 && wanted[0] === '') wanted.shift();
  if (wanted.length === 1 && wanted[0] === '') return [];

  const lines = source.split('\n');
  const starts = lineStartOffsets(source);
  const matches: MatchRange[] = [];
  for (let i = 0; i + wanted.length <= lines.length; i += 1) {
    let same = true;
    for (let j = 0; j < wanted.length; j += 1) {
      if ((lines[i + j] ?? '').trim() !== wanted[j]) {
        same = false;
        break;
      }
    }
    if (!same) continue;
    const last = i + wanted.length - 1;
    matches.push({ start: starts[i] ?? 0, end: (starts[last] ?? 0) + (lines[last] ?? '').length });
    i = last; // 겹치지 않게 다음 후보로
  }
  return matches;
}

/** 부분문자열 일치(구 그대로) 또는 줄 전체 일치. */
export function findMatches(source: string, oldString: string, wholeLine: boolean): MatchRange[] {
  if (wholeLine) return findWholeLineMatches(source, oldString);
  return findOccurrences(source, oldString).map((start) => ({ start, end: start + oldString.length }));
}

/** 오프셋 → 1부터 세는 줄 번호. */
export function lineNumberAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

const LISTED_MATCHES = 8;

/** 유일성 오류에 싣는 목록 — 각 일치의 줄 번호와 그 줄 원문(뒤 공백 제거). */
export function describeMatches(source: string, matches: readonly MatchRange[]): string {
  const lines = source.split('\n');
  const shown = matches.slice(0, LISTED_MATCHES).map((match) => {
    const line = lineNumberAt(source, match.start);
    return `L${line}: ${JSON.stringify((lines[line - 1] ?? '').trimEnd())}`;
  });
  const more = matches.length - shown.length;
  return shown.join(', ') + (more > 0 ? `, … and ${more} more` : '');
}

export interface SourcePatchOptions {
  readonly replaceAll: boolean;
  readonly matchWholeLine: boolean;
}

export interface SourcePatchResult {
  readonly newSource: string;
  readonly occurrences: number;
  /** 원본(LF 정규화본)에서 첫 일치가 시작하는 위치. */
  readonly firstMatchIndex: number;
}

/**
 * 치환 본체. 입력은 전부 **LF 정규화본**이어야 한다(호출자가 맞춘다).
 *
 * 줄 전체 일치에서는 `old_string`과 `new_string`이 둘 다 개행으로 끝나면 그 개행을
 * 짝으로 떼어 낸다(일치 구간이 개행을 안 담으므로 그대로 두면 빈 줄이 하나 는다).
 * 그렇게 해서 대체문이 비면 — 줄을 지우는 패치 — 뒤따르는 개행까지 함께 지운다.
 */
export function applySourcePatch(
  source: string,
  oldString: string,
  newString: string,
  options: SourcePatchOptions,
): SourcePatchResult {
  const matches = findMatches(source, oldString, options.matchWholeLine);
  const first = matches[0];
  if (first === undefined) throw new Error('old_string not found in current source');
  if (matches.length > 1 && !options.replaceAll) {
    throw new Error(
      `old_string matches ${matches.length} locations (not unique) — ${describeMatches(
        source,
        matches,
      )} — add more context to old_string, pass match_whole_line: true to require whole-line matches, or pass replace_all: true to replace every occurrence`,
    );
  }

  let replacement = newString;
  if (options.matchWholeLine && oldString.endsWith('\n') && replacement.endsWith('\n')) {
    replacement = replacement.slice(0, -1);
  }

  const chosen = options.replaceAll ? matches : [first];
  let out = source;
  // 뒤에서부터 바꿔야 앞 구간의 오프셋이 흔들리지 않는다.
  for (let i = chosen.length - 1; i >= 0; i -= 1) {
    const range = chosen[i]!;
    let end = range.end;
    if (options.matchWholeLine && replacement === '' && out[end] === '\n') end += 1;
    out = out.slice(0, range.start) + replacement + out.slice(end);
  }
  return { newSource: out, occurrences: chosen.length, firstMatchIndex: first.start };
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

// ── 읽기 ────────────────────────────────────────────────────────────────────

/**
 * 읽기 URI — 구가 쓰던 것 그대로 **이름을 대문자로** 싣는다(쓰기 URI는 소문자다).
 * 함수모듈은 그룹·모듈 둘 다 대문자(`read/internal/adt.ts`의 `functionModuleSourcePath`와
 * 같은 모양). 함수그룹 인클루드도 독립 인클루드 주소로 읽는다 — 실측(2026-07-30)에서
 * 그 주소의 읽기는 성공했고 잠금만 403이었다.
 */
function sourceObjectUri(objectType: PatchType, objectName: string, functionGroup: string): string {
  const encoded = encodeObjectName(objectName);
  switch (objectType) {
    case 'INCL':
      return `/sap/bc/adt/programs/includes/${encoded}`;
    case 'CLAS':
      return `/sap/bc/adt/oo/classes/${encoded}`;
    case 'INTF':
      return `/sap/bc/adt/oo/interfaces/${encoded}`;
    case 'FUNC':
      return `/sap/bc/adt/functions/groups/${encodeObjectName(functionGroup)}/fmodules/${encoded}`;
    default:
      return `/sap/bc/adt/programs/programs/${encoded}`;
  }
}

interface CurrentSource {
  readonly source: string;
  readonly version: SourceVersionRead;
}

/**
 * 비활성 판을 먼저, 없으면 활성 판을 읽는다(머리주석 1).
 *
 * 「없다」는 404, 그리고 `version=inactive`를 모르는 구형 시스템의 400으로 본다.
 * 그 밖의 실패(권한·잠금·네트워크)는 그대로 올린다 — 폴백이 원인을 가리면 안 된다.
 */
async function fetchCurrentSource(client: AdtClient, uri: string): Promise<CurrentSource> {
  try {
    return { source: await getSource(client, uri, 'inactive'), version: 'inactive' };
  } catch (error) {
    const status = error instanceof AdtError ? error.status : undefined;
    if (status !== 404 && status !== 400) throw error;
  }
  return { source: await getSource(client, uri, 'active'), version: 'active' };
}

// ── 위임 ────────────────────────────────────────────────────────────────────

function delegateFor(objectType: PatchType): SapTool {
  switch (objectType) {
    case 'CLAS':
      return updateClass;
    case 'PROG':
      return updateProgram;
    case 'INTF':
      return updateInterface;
    case 'FUNC':
      return updateFunctionModule;
    default:
      return updateInclude;
  }
}

function delegateArgs(
  objectType: PatchType,
  objectName: string,
  functionGroup: string,
  newSource: string,
  transportRequest: string | undefined,
  activate: boolean,
): Record<string, unknown> {
  const common = {
    source_code: newSource,
    transport_request: transportRequest,
    activate,
  };
  switch (objectType) {
    case 'CLAS':
      return { class_name: objectName, ...common };
    case 'PROG':
      return { program_name: objectName, ...common };
    case 'INTF':
      return { interface_name: objectName, ...common };
    case 'FUNC':
      return { function_group_name: functionGroup, function_module_name: objectName, ...common };
    default:
      return { include_name: objectName, ...common };
  }
}

export const updateSourceByPatch = defineTool(
  {
    name: 'UpdateSourceByPatch',
    description:
      'Modify existing ABAP source code on SAP via a surgical string replacement (find old_string, replace with new_string) instead of resending the full source. Fetches the current source, applies the patch, then delegates the write to the same lock -> syntax-check -> update -> unlock -> (activate) flow used by UpdateClass/UpdateProgram/UpdateInterface/UpdateInclude/UpdateFunctionModule. Supported object_type values: CLAS (class), PROG (program, on-premise/legacy only), INTF (interface), INCL (include, on-premise/legacy only), FUNC (function module, requires function_group). old_string must match the current source exactly, including whitespace, and must be unique unless replace_all is true. Reads the inactive version first and falls back to the active one (source_version_read in the response says which), so consecutive activate:false patches no longer overwrite each other. Line endings are normalized for matching (multi-line old_string works on CRLF sources) and the source\'s own line ending is restored on write. A non-unique old_string is rejected with the line number and text of every match; set match_whole_line to require whole-line matches. Function-group includes (L<group>TOP, L<group>F01, ...) are written through the function-group include address.',
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
      match_whole_line: z
        .boolean()
        .describe(
          'Require every line of old_string to match a whole source line (leading/trailing whitespace ignored) instead of a substring match. Use it when a short anchor is also part of another statement (FORM x. inside PERFORM x.) or differs only by indentation. Default: false.',
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
    targetNames: ['object_name'],
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

      const objectName = String(args.object_name).toUpperCase();
      const functionGroup = args.function_group ? String(args.function_group).toUpperCase() : '';
      const replaceAll = args.replace_all === true;
      const matchWholeLine = args.match_whole_line === true;
      const shouldActivate = args.activate === true;
      logger.info(
        `UpdateSourceByPatch: object_type=${objectType}, object_name=${objectName}, replace_all=${replaceAll}, match_whole_line=${matchWholeLine}, activate=${shouldActivate}`,
      );

      const client = await context.getConnection();
      const current = await fetchCurrentSource(
        client,
        sourceObjectUri(objectType, objectName, functionGroup),
      );

      // 매칭은 LF에서 한다 — SAP 소스는 CRLF, 인자는 LF다(머리주석 2).
      const eol = detectLineEnding(current.source);
      const source = normalizeLineEndings(current.source);
      const oldString = normalizeLineEndings(args.old_string);
      const newString = normalizeLineEndings(args.new_string);

      let patch: SourcePatchResult;
      try {
        patch = applySourcePatch(source, oldString, newString, { replaceAll, matchWholeLine });
      } catch (error) {
        return errorResult(
          `${describeFailure(error)} (object: ${objectType} ${objectName}, ${current.version} version read)`,
        );
      }

      const diffPreview = buildDiffPreview(
        source,
        patch.newSource,
        patch.firstMatchIndex,
        oldString,
        newString,
      );

      const delegate = delegateFor(objectType);
      const delegated: ToolResult = await delegate.handler(
        context,
        delegateArgs(
          objectType,
          objectName,
          functionGroup,
          restoreLineEndings(patch.newSource, eol),
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
        function_group: functionGroup || undefined,
        source_version_read: current.version,
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
