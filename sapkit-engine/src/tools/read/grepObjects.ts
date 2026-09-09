/**
 * GrepObjects — 오브젝트 여러 벌의 소스를 한 번에 정규식으로 훑는다.
 *
 * 오브젝트를 하나씩 읽어 클라이언트에서 거르는 대신 서버가 훑어 일치 줄만
 * 돌려준다. 소스를 못 가져온 오브젝트는 **훑기를 멈추지 않고** 이유와 함께
 * `skipped`로 남는다 — 한 벌의 실패가 나머지 49벌을 못 보게 하면 안 된다.
 *
 * 소스를 가져오는 분배기는 `internal/objectSource.ts`에 있다 — 구에서도
 * `GrepPackages`와 공용이었다(`engine/src/lib/objectSourceFetch.ts`). 두 도구의
 * 차이는 `grepPackages.ts` 머리주석이 표로 적어 두었다.
 *
 * ## FUGR는 전개해서 훑는다 (차이 — `harness/DIVERGENCES.md` D151)
 *
 * 구의 FUGR 갈래는 함수그룹 **메타데이터**를 읽어 훑었다 — 거기에 소스가 없으므로
 * FM 본문의 실재하는 문자열에도 `total_matches: 0 · skipped: []`였다(2026-07-28·30·31
 * 실측). 지금은 그룹을 함수모듈(`FUGR/FF`)·인클루드(`FUGR/I`)로 전개해 각각 훑고
 * **구성원 이름으로** 보고한다(`function_group`이 그룹을 가리킨다). 전개가 불가하면
 * 조용한 0이 아니라 `skipped`에 이유를 싣는다. `GrepPackages`의 FUGR 갈래는 이 판에서
 * 손대지 않았다 — 같은 결함이 그쪽에도 있다(보고에 적었다). 실기 미검증.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import {
  aggregateGrepResults,
  compileGrepRegex,
  runWithConcurrency,
  type ObjectGrepInput,
} from './internal/grep';
import {
  type FunctionGroupMember,
  classifySourceType,
  expandFunctionGroup,
  fetchFunctionGroupMemberSource,
  fetchObjectSource,
} from './internal/objectSource';
import { failure, messageOf, ok } from './internal/results';

const MAX_OBJECTS = 50;
/**
 * D151 — 요청 항목을 전개한 뒤 **실제로 훑는 오브젝트**의 상한(리뷰 R1b 권고 1). `MAX_OBJECTS`는
 * 요청 항목에만 걸리므로 큰 함수그룹 하나가 수백 왕복을 만들 수 있었다. 넘치는 그룹은 읽지
 * 않고 `skipped`에 구성원 수와 함께 이유를 싣는다 — 요청 순서로 앞의 항목이 먼저 예산을 쓴다.
 */
export const MAX_SCANNED_OBJECTS = 200;
const FETCH_CONCURRENCY = 5;

/** D151 — 함수그룹 하나의 전개 결과: 구성원 목록, 또는 그대로 `skipped`가 될 입력. */
type GroupExpansion =
  | { readonly kind: 'members'; readonly members: FunctionGroupMember[] }
  | { readonly kind: 'skipped'; readonly input: ObjectGrepInput };

async function expandForGrep(
  client: AdtClient,
  objectType: string,
  objectName: string,
  warn: (message: string) => void,
): Promise<GroupExpansion> {
  const groupName = objectName.toUpperCase();
  const skipped = (reason: string): GroupExpansion => ({
    kind: 'skipped',
    input: { object_type: objectType, object_name: objectName, source: null, skip_reason: reason },
  });
  let members: FunctionGroupMember[];
  try {
    members = await expandFunctionGroup(client, groupName);
  } catch (error) {
    warn(`GrepObjects: could not expand function group ${groupName}: ${messageOf(error)}`);
    return skipped(
      `Could not expand function group ${groupName} into its function modules and includes (repository node structure): ${messageOf(error)}. Nothing in the group was scanned.`,
    );
  }
  if (members.length === 0) {
    return skipped(
      `Function group ${groupName} expanded to no function modules or includes (the repository node structure returned no FUGR/FF or FUGR/I leaf with an address) — nothing was scanned.`,
    );
  }
  return { kind: 'members', members };
}

/** 전개된 구성원의 소스를 읽어 훑을 입력으로. 못 읽은 구성원은 그룹 이름과 함께 `skipped`가 된다. */
async function fetchMemberInputs(
  client: AdtClient,
  groupName: string,
  members: readonly FunctionGroupMember[],
  warn: (message: string) => void,
): Promise<ObjectGrepInput[]> {
  const inputs: ObjectGrepInput[] = new Array(members.length);
  await runWithConcurrency(members, FETCH_CONCURRENCY, async (member, index) => {
    try {
      const response = await fetchFunctionGroupMemberSource(client, member);
      inputs[index] = {
        object_type: member.type,
        object_name: member.name,
        function_group: groupName,
        source: response.body,
      };
    } catch (error) {
      warn(`GrepObjects: could not fetch source for ${member.type} ${member.name} (in ${groupName}): ${messageOf(error)}`);
      inputs[index] = {
        object_type: member.type,
        object_name: member.name,
        function_group: groupName,
        source: null,
        skip_reason: `Failed to fetch source: ${messageOf(error)}`,
      };
    }
  });
  return inputs;
}

export const grepObjects = defineTool(
  {
    name: 'GrepObjects',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json`) — D151 · 백로그 13-8 ⓒ.
    description:
      '[read-only] Search ABAP source code for a regex pattern across multiple named objects in a single call — finds matching lines (with optional context) instead of reading each object one by one. Supports CLAS, PROG, INTF, INCL, and FUGR (function group). Individual function modules (FUNC) are not supported; use FUGR with the group name to search the whole group.' +
      ' Matching is case-sensitive unless case_insensitive is true — 0 matches means "this pattern found nothing", not "the code is absent". CLAS searches source/main only: local types and the implementations include (CCIMP, where behavior-pool handlers and local classes live) are not scanned and no skipped entry is written for them; read those with GetLocalTypes. FUGR is expanded to the group\'s function modules and includes (each reported under its own name); if the group cannot be expanded, the reason is listed under skipped instead of a silent 0. GrepObjects reads the active version — before reading 0 matches as "the source does not contain it", check GetInactiveObjects: a pending inactive version is not scanned. After FUGR expansion at most 200 objects are scanned per call; a group that would exceed that cap is listed under skipped with its member count instead of being scanned partially.',
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
    targetNames: [{ arg: 'objects', element: 'object_name' }],
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
      const warn = (message: string): void => context.logger.warn(message);

      // 1단계 — 요청 항목을 전개한다(FUGR는 구성원 목록까지, 나머지는 소스까지). 순서는 요청 순서다.
      type Expanded =
        | { readonly kind: 'inputs'; readonly inputs: ObjectGrepInput[] }
        | {
            readonly kind: 'group';
            readonly objectType: string;
            readonly objectName: string;
            readonly members: FunctionGroupMember[];
          };
      const expanded: Expanded[] = new Array(requested.length);

      await runWithConcurrency(requested, FETCH_CONCURRENCY, async (item, index) => {
        const objectType = String(item?.object_type ?? '').trim();
        const objectName = String(item?.object_name ?? '').trim();
        if (!objectType || !objectName) {
          expanded[index] = {
            kind: 'inputs',
            inputs: [
              {
                object_type: objectType || '(missing)',
                object_name: objectName || '(missing)',
                source: null,
                skip_reason: 'object_type and object_name are required',
              },
            ],
          };
          return;
        }
        if (classifySourceType(objectType) === 'FUGR') {
          const expansion = await expandForGrep(client, objectType, objectName, warn);
          expanded[index] =
            expansion.kind === 'members'
              ? { kind: 'group', objectType, objectName, members: expansion.members }
              : { kind: 'inputs', inputs: [expansion.input] };
          return;
        }
        const { source, skipReason } = await fetchObjectSource(
          client,
          'GrepObjects',
          objectType,
          objectName,
          warn,
        );
        expanded[index] = {
          kind: 'inputs',
          inputs: [{ object_type: objectType, object_name: objectName, source, skip_reason: skipReason }],
        };
      });

      // 2단계 — 상한(`MAX_SCANNED_OBJECTS`): 전개된 구성원까지 센다. 넘치는 그룹은 구성원을 읽지
      // 않고 `skipped`에 이유를 싣는다 — 부분만 훑어 「봤는데 없다」로 읽히는 것보다 낫다.
      const inputsByItem: ObjectGrepInput[][] = new Array(requested.length);
      let scanned = 0;
      for (const [index, entry] of expanded.entries()) {
        if (entry.kind === 'inputs') {
          scanned += entry.inputs.length;
          inputsByItem[index] = entry.inputs;
          continue;
        }
        const groupName = entry.objectName.toUpperCase();
        if (scanned + entry.members.length > MAX_SCANNED_OBJECTS) {
          inputsByItem[index] = [
            {
              object_type: entry.objectType,
              object_name: entry.objectName,
              source: null,
              skip_reason: `Function group ${groupName} expands to ${entry.members.length} function modules and includes, which would exceed the cap of ${MAX_SCANNED_OBJECTS} scanned objects per call (${scanned} already counted from earlier entries) — nothing in the group was scanned. Search it in a call of its own or split the request.`,
            },
          ];
          continue;
        }
        scanned += entry.members.length;
        // 3단계 — 통과한 그룹의 구성원 소스(그룹 안에서는 동시에, 그룹끼리는 차례로).
        inputsByItem[index] = await fetchMemberInputs(client, groupName, entry.members, warn);
      }
      const inputs = inputsByItem.flat();

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
