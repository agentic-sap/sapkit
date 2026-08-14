/**
 * GetIncludesList — 프로그램·인클루드 아래의 인클루드 이름 목록.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/include/readonly/handleGetIncludesList.ts:133-289`
 *  - 한 다리: `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:435-436`
 *    (`getUtils().fetchNodeStructure`)
 *  - 와이어 정본: 같은 패키지 `dist/core/shared/nodeStructure.js:29-56`
 *    (이 레포에서는 `internal/nodeStructure.ts`가 그 자리를 복원해 둔다)
 *
 * 거기서 확인한 것 셋:
 *  1. **요청이 둘이다.** 먼저 루트 마디(`node_id=000000`)를 물어 「인클루드」
 *     마디의 `NODE_ID`를 찾고, 그 번호로 한 번 더 묻는다. 겉만 읽으면 이 왕복이
 *     한 번으로 보인다.
 *  2. 부모 이름은 **대문자로 올려** 보내지만(`:164`) 응답 문구에는 호출자가 준
 *     원본 철자가 들어간다(`:208`). `object_type`은 손대지 않고 `parent_type`에
 *     그대로 실린다(`:165`).
 *  3. `timeout` 인자는 HTTP 타임아웃이 아니라 **`Promise.race`의 마감**이다
 *     (`:176-194`·`:215-233`). 기본 30000ms. 접속 계층의 타임아웃은 그대로
 *     `default`이고, 이 마감은 그 위에 얹힌다 — 인자가 선언만 있고 아무 일도
 *     하지 않는 상태로 두지 않으려면 이 갈래를 함께 지어야 한다.
 *
 * ## 구와 다른 것 — 장부 D3 (`harness/DIVERGENCES.md`, spec §2.4 사전 등재)
 *
 * 구는 **존재하지 않는 객체명을 인클루드 목록에 실었다**(실측: `ZUNIVR5120`의
 * 목록에 `ZUNIVI_H011` — `SearchObject` 0건. `HANDOFF.md` §6 항목 13-13). 원인은
 * `INCLUDE <name> IF FOUND.`라는 고객 확장 슬롯 관용구다: 그 이름은 선언돼 있을
 * 뿐 오브젝트가 없는데, 구는 노드 구조 응답의 `OBJECT_NAME`을 조건 없이 걷는다
 * (`:100-108`). 그 뒤 그 이름의 404가 도구 결함으로 오독됐다.
 *
 * 신 엔진은 **ADT가 주소(`OBJECT_URI`)를 주지 않은 마디를 실재하는 오브젝트로
 * 보지 않는다.** 판정 근거는 구 엔진 자신의 분류다 —
 * `engine/src/handlers/system/readonly/handleGetObjectInfo.ts:135-145`가 같은
 * 노드 구조 응답에서 `OBJECT_NAME` + `OBJECT_URI`를 가진 마디만 실물 잎으로 보고,
 * `OBJECT_URI`가 없는 마디는 주소 없는 묶음 마디로 가른다.
 *
 * 걸러 낸 이름은 버리지 않는다 — `detailed` 응답에 `unresolved_includes`로 싣되
 * **뺄 것이 없으면 그 키를 만들지 않는다**(구와 모양이 같아야 하는 흔한 경우를
 * 건드리지 않으려고). 대체 기대 시험은 `__tests__/getIncludesList.test.ts`의
 * 「장부 D3」 절이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *  - 인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다(장부 D34).
 *    문장 자체는 글자 그대로다.
 *  - 구는 `args.filePath`가 오면 결과를 파일로 떨궜다(`:258-260`). 그 인자는
 *    발행 스키마에 없어 표면으로 들어올 길이 없으므로 옮기지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { fetchNodeStructure } from './internal/nodeStructure';
import { ok, returnError } from './internal/results';

/** 구가 쓰던 기본 마감. `timeout` 인자가 없을 때 걸린다(`:159-160`). */
const DEFAULT_DEADLINE_MS = 30000;

/**
 * 마감 안에 끝나지 않으면 준 문구로 거절한다 — 구의 `Promise.race` 자리.
 *
 * 안쪽 약속에 미리 처리기를 달아 둔다. 마감이 먼저 이겼을 때 안쪽이 나중에
 * 깨져도 처리되지 않은 거절로 프로세스에 올라가지 않게 하려는 것이다.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  promise.catch(() => {});
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

/** 「인클루드」 마디 하나 — 구 `parseIncludesFromXml`(`:43-79`)이 찾던 것. */
export interface IncludesNodeInfo {
  readonly name: string;
  readonly node_id: string;
  readonly label: string;
}

/**
 * 루트 응답에서 PROG/I 마디의 번호를 찾는다.
 *
 * 구와 같이 `NODE_ID`와 `OBJECT_TYPE_LABEL`이 **둘 다** 있는 것만 본다.
 */
export function findIncludesNode(xmlData: string): IncludesNodeInfo | undefined {
  for (const block of xmlData.match(/<SEU_ADT_OBJECT_TYPE_INFO>(.*?)<\/SEU_ADT_OBJECT_TYPE_INFO>/gs) ?? []) {
    if (!block.includes('<OBJECT_TYPE>PROG/I</OBJECT_TYPE>')) continue;
    const nodeId = /<NODE_ID>(\d+)<\/NODE_ID>/.exec(block);
    const label = /<OBJECT_TYPE_LABEL>(.*?)<\/OBJECT_TYPE_LABEL>/.exec(block);
    if (nodeId && label) return { name: 'PROG/I', node_id: nodeId[1] as string, label: label[1] as string };
  }
  return undefined;
}

/** 인클루드 마디에서 걷은 한 항목. `uri`가 비면 ADT가 주소를 주지 않은 것이다. */
interface IncludeNode {
  readonly name: string;
  readonly uri: string;
}

export interface IncludeNames {
  /** 실재하는(주소가 있는) 인클루드 이름들. */
  readonly resolved: string[];
  /** 주소가 없어 목록에서 뺀 이름들 — 장부 D3. */
  readonly unresolved: string[];
}

const unique = (names: readonly string[]): string[] => [...new Set(names)];

/**
 * 인클루드 마디 응답에서 이름을 걷는다.
 *
 * 구(`:86-131`)와 같은 두 갈래다. PROG/I 마디가 하나라도 있으면 그것만 보고,
 * **하나도 없을 때만** 응답 안의 모든 `OBJECT_NAME`으로 흘러내린다. 폴백 판정은
 * 걸러 내기 **전**의 마디 수로 한다 — D3가 전부 걸러 냈다는 이유로 폴백이 켜지면
 * 그 폴백이 같은 이름을 도로 실어 온다.
 */
export function parseIncludeNames(xmlData: string): IncludeNames {
  const matched: IncludeNode[] = [];
  const fallback: string[] = [];

  try {
    for (const block of xmlData.match(/<SEU_ADT_REPOSITORY_OBJ_NODE>(.*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/gs) ??
      []) {
      if (!block.includes('<OBJECT_TYPE>PROG/I</OBJECT_TYPE>')) continue;
      const name = /<OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/.exec(block);
      if (!name?.[1]?.trim()) continue;
      const uri = /<OBJECT_URI>([^<]*)<\/OBJECT_URI>/.exec(block);
      matched.push({
        name: decodeURIComponent(name[1].trim()),
        uri: (uri?.[1] ?? '').trim(),
      });
    }

    if (matched.length === 0) {
      for (const match of xmlData.matchAll(/<OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/g)) {
        const name = (match[1] as string).trim();
        if (name.length > 0) fallback.push(decodeURIComponent(name));
      }
    }
  } catch {
    // 구도 파싱 실패를 삼키고 여기까지 모은 것을 돌려줬다(`:126-128`).
  }

  if (matched.length === 0) return { resolved: unique(fallback), unresolved: [] };
  return {
    resolved: unique(matched.filter((node) => node.uri !== '').map((node) => node.name)),
    unresolved: unique(matched.filter((node) => node.uri === '').map((node) => node.name)),
  };
}

export const getIncludesList = defineTool(
  {
    name: 'GetIncludesList',
    description:
      '[read-only] Recursively discover and list ALL include files within an ABAP program or include.',
    inputSchema: {
      object_name: z.string().describe('Name of the ABAP program or include'),
      object_type: z
        .enum(['PROG/P', 'PROG/I', 'FUGR', 'CLAS/OC'])
        .describe('[read-only] ADT object type (e.g. PROG/P, PROG/I, FUGR, CLAS/OC)'),
      detailed: z
        .boolean()
        .optional()
        .describe('[read-only] If true, returns structured JSON with metadata and raw XML.'),
      timeout: z.number().optional().describe('[read-only] Timeout in ms for each ADT request.'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['object_name'],
  },
  async (context, args) => {
    try {
      const { object_name, object_type, timeout, detailed } = args;

      // `object_type`은 발행 스키마가 enum + required라 서버가 먼저 거른다.
      // 구의 같은 자리 검사는 여기까지 오지 못하므로 옮기지 않았다.
      if (typeof object_name !== 'string' || object_name.trim() === '') {
        return returnError(new Error('Parameter "object_name" (string) is required and cannot be empty.'));
      }

      const deadlineMs = typeof timeout === 'number' ? timeout : DEFAULT_DEADLINE_MS;
      const isDetailed = detailed === true;

      const parentName = object_name.toUpperCase();
      const parentType = object_type;

      context.logger.info(
        `Starting includes discovery for ${parentName} (${parentType}), detailed=${isDetailed}`,
      );

      const client = await context.getConnection();

      const rootResponse = await withDeadline(
        fetchNodeStructure(client, { parentType, parentName, nodeId: '000000', withShortDescriptions: true }),
        deadlineMs,
        `Timeout after ${deadlineMs}ms while fetching root node structure for ${object_name}`,
      );

      const includesNode = findIncludesNode(rootResponse.body);
      if (!includesNode) {
        context.logger.info(`No includes found in ${object_type} '${object_name}'`);
        return ok(`No includes found in ${object_type} '${object_name}'.`);
      }

      const includesResponse = await withDeadline(
        fetchNodeStructure(client, {
          parentType,
          parentName,
          nodeId: includesNode.node_id,
          withShortDescriptions: true,
        }),
        deadlineMs,
        `Timeout after ${deadlineMs}ms while fetching includes list for ${object_name}`,
      );

      const { resolved, unresolved } = parseIncludeNames(includesResponse.body);

      if (isDetailed) {
        return ok(
          JSON.stringify(
            {
              object_name,
              object_type,
              detailed: true,
              total_includes: resolved.length,
              includes: resolved,
              // 장부 D3 — 뺄 것이 있을 때만 실린다.
              ...(unresolved.length > 0 ? { unresolved_includes: unresolved } : {}),
              includes_node_info: includesNode,
            },
            null,
            2,
          ),
        );
      }

      return ok(resolved.join('\n'));
    } catch (error) {
      context.logger.error(`Error getting includes list: ${String(error)}`);
      return returnError(error);
    }
  },
);
