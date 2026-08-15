/**
 * `GetTransport` — 이송요청 하나의 메타데이터·오브젝트·태스크.
 *
 * 구 핸들러: `engine/src/handlers/transport/readonly/handleGetTransport.ts`.
 * **이 도구는 위임형이 아니다** — 벤더 클라이언트를 거치지 않고 엔진이 직접
 * `makeAdtRequestWithTimeout`(`engine/src/lib/utils.ts:902-921`)으로 두 주소를
 * 물어본다. 그래서 와이어의 정본이 겉 핸들러 자신이다.
 *
 * ## ADT의 이송 엔드포인트 둘 (구 머리주석 `:4-20`의 실측)
 *
 * ```
 * ① 경로 단건 읽기 : GET /sap/bc/adt/cts/transportrequests/<번호>
 *    S/4 — 그 이송을 그대로 준다  ({tm:root adtcore:name=<번호>} > tm:request)
 *    ECC — 경로 조각이 사실상 무시되고 **세션 사용자 목록**이 온다
 *          ({tm:root adtcore:name=<사용자>} > tm:workbench > tm:modifiable > tm:request[])
 * ② 사용자 목록   : GET /sap/bc/adt/cts/transportrequests?user=<owner>
 * ```
 *
 * 둘 다 `Accept`는 같은 한 줄이다(`:33-34`) — 미디어 타입 둘을 쉼표로 이었다.
 * 전략은 ①을 먼저 보내고, **거기서 못 찾았고 `owner`가 세션 사용자와 다를 때만**
 * ②로 한 발 더 간다. `owner`를 안 주면 폴백은 없다.
 *
 * 세션 사용자는 구에서 `getSystemContext().responsible || SAP_USERNAME || ''`이고
 * (`:271-273`), 그 `responsible`은 다시 `SAP_RESPONSIBLE || SAP_USERNAME`이다
 * (`engine/src/lib/systemContext.ts:63-66`). 여기서는 env에서만 읽는다 — 이미
 * 등재된 결정이다(`harness/DIVERGENCES.md` D62).
 *
 * ## 파서 옵션은 구 그대로다 — 수 변환도 그대로
 *
 * `parseAttributeValue: true`라(`:76-92`) `tm:source_client="100"`이 **수 100**으로
 * 파싱되고 응답의 `client`에도 수로 실린다. 고치지 않았다.
 *
 * ## 대상-이름 선언을 하지 않는 이유 (실측)
 *
 * 이 도구가 받는 이름은 이송번호(`DEVK900123` 꼴)와 SAP 사용자다. 녹화 사전
 * 검사의 `isCustomerObject`(`harness/targetGuard.ts:99-105`)는 이름이 `Z`·`Y`로
 * 시작하는지만 보므로, 이송번호를 대상으로 선언하면 **정상 녹화가 전부 막힌다.**
 * `kind: 'read'`라 선언이 필수도 아니므로 다른 무(無)대상 읽기 도구
 * (`GetInstalledComponents`·`GetSystemInfo`·`GetSession`)와 같이 선언하지 않는다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { failure, ok, returnError } from './internal/results';

const ROOT_PATH = '/sap/bc/adt/cts/transportrequests';

/** `handleGetTransport.ts:33-34` — 두 미디어 타입을 쉼표로 이은 한 줄. */
const ACCEPT_ORGANIZER_V1 =
  'application/vnd.sap.adt.transportorganizer.v1+xml, application/vnd.sap.adt.transportorganizertree.v1+xml';

/** 구 `makeParser()`(`:75-92`) — 옵션도 배열 강제 목록도 그대로. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '_text',
  parseAttributeValue: true,
  isArray: (name) =>
    ['tm:request', 'tm:task', 'tm:abap_object', 'tm:object', 'object', 'task'].includes(name),
});

type Node = Record<string, any>;

/** 뜻이 없는 값을 걸러 낸다 — 구는 `if (!x)`로 같은 일을 한다. */
const asArray = (value: unknown): Node[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value as Node];

/**
 * 구 `findRequestInListView`(`:98-126`) — 두 갈래(workbench·customizing) × 두
 * 상태(modifiable·released)를 훑고, 못 찾으면 뿌리에 평평하게 달린 것도 본다.
 */
function findRequestInListView(root: Node | undefined | null, number: string): Node | null {
  if (!root) return null;
  for (const catKey of ['tm:workbench', 'tm:customizing']) {
    const category = root[catKey] as Node | undefined;
    if (!category) continue;
    for (const statusKey of ['tm:modifiable', 'tm:released']) {
      const group = category[statusKey] as Node | undefined;
      if (!group) continue;
      for (const request of asArray(group['tm:request'])) {
        if (request && request['tm:number'] === number) return request;
      }
    }
  }
  // 구 back-compat: 일부 릴리스는 뿌리 밑에 평평하게 단다.
  for (const request of asArray(root['tm:request'])) {
    if (request && request['tm:number'] === number) return request;
  }
  return null;
}

/** 파싱 실패를 알리는 오류 — 구는 `McpError(InternalError, …)`를 던졌다. */
class TransportXmlError extends Error {}

/** 구 `extractRequest`(`:132-158`). */
function extractRequest(
  xml: string,
  requestedNumber: string,
): { request: Node; viewType: 'single-tr' | 'list' } | null {
  const result = parser.parse(xml) as Node;
  const root = (result['tm:root'] || result.root) as Node | undefined;
  if (!root) {
    throw new TransportXmlError('Invalid transport XML structure - no tm:root found');
  }
  // S/4 단일 응답: `adtcore:name`이 이송번호이고 `tm:request`가 바로 자식이다.
  if (root['adtcore:name'] === requestedNumber && root['tm:request']) {
    const request = asArray(root['tm:request'])[0];
    if (request && request['tm:number'] === requestedNumber) {
      return { request, viewType: 'single-tr' };
    }
  }
  const hit = findRequestInListView(root, requestedNumber);
  return hit ? { request: hit, viewType: 'list' } : null;
}

/** 구 `buildTransportData`(`:160-249`) — 키 이름과 폴백 순서를 그대로 옮겼다. */
function buildTransportData(request: Node, includeObjects: boolean, includeTasks: boolean): Node {
  const transportInfo = {
    number: request['tm:number'],
    description: request['tm:desc'] || request['tm:description'],
    type: request['tm:type'],
    status: request['tm:status'],
    status_text: request['tm:status_text'],
    owner: request['tm:owner'],
    target_system: request['tm:target'],
    target_desc: request['tm:target_desc'],
    created_at: request['tm:createdAt'] || request['tm:lastchanged_timestamp'],
    created_by: request['tm:createdBy'] || request['tm:owner'],
    changed_at: request['tm:changedAt'] || request['tm:lastchanged_timestamp'],
    changed_by: request['tm:changedBy'],
    release_date: request['tm:releaseDate'],
    client: request['tm:source_client'],
    cts_project: request['tm:cts_project'],
    cts_project_desc: request['tm:cts_project_desc'],
  };

  let objects: Node[] = [];
  if (includeObjects) {
    if (request['tm:all_objects']) {
      objects = asArray(request['tm:all_objects']['tm:abap_object']);
    }
    // `tm:all_objects`가 비었을 때만 태스크 밑을 긁는다 — 구의 순서다.
    if (objects.length === 0 && request['tm:task']) {
      for (const task of asArray(request['tm:task'])) {
        objects.push(...asArray(task && task['tm:abap_object']));
      }
    }
    objects = objects.map((object) => ({
      name: object['tm:name'],
      type: object['tm:type'],
      wbtype: object['tm:wbtype'],
      pgmid: object['tm:pgmid'],
      description: object['tm:obj_desc'],
      position: object['tm:position'],
      lock_status: object['tm:lock_status'],
      info: object['tm:obj_info'],
    }));
  }

  let tasks: Node[] = [];
  if (includeTasks && request['tm:task']) {
    tasks = asArray(request['tm:task']).map((task) => ({
      number: task['tm:number'],
      parent: task['tm:parent'],
      description: task['tm:desc'],
      type: task['tm:type'],
      status: task['tm:status'],
      status_text: task['tm:status_text'],
      owner: task['tm:owner'],
      target: task['tm:target'],
      target_desc: task['tm:target_desc'],
      client: task['tm:source_client'],
      created_at: task['tm:lastchanged_timestamp'],
      objects: asArray(task['tm:abap_object']).map((object) => ({
        name: object['tm:name'],
        type: object['tm:type'],
        wbtype: object['tm:wbtype'],
        description: object['tm:obj_desc'],
        position: object['tm:position'],
      })),
    }));
  }

  return {
    transport: transportInfo,
    objects: includeObjects ? objects : undefined,
    tasks: includeTasks ? tasks : undefined,
    object_count: objects.length,
    task_count: tasks.length,
  };
}

/** 구 `getSystemContext().responsible || SAP_USERNAME || ''`의 자리(D62 참조). */
function sessionUserOf(env: ToolContext['env']): string {
  return env['SAP_RESPONSIBLE'] || env['SAP_USERNAME'] || '';
}

function readTransportXml(client: AdtClient, path: string, user?: string) {
  return client.request({
    method: 'GET',
    path,
    params: user === undefined ? undefined : { user },
    accept: ACCEPT_ORGANIZER_V1,
    timeout: 'default',
  });
}

export const getTransport = defineTool(
  {
    name: 'GetTransport',
    description:
      '[read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.',
    inputSchema: {
      transport_number: z
        .string()
        .describe('Transport request number (e.g., E19K905635, DEVK905123)'),
      owner: z
        .string()
        .optional()
        .describe(
          "SAP user who owns the transport. On ECC the session-user-scoped path endpoint silently filters out other users' TRs — pass `owner` to retry via the list endpoint. On S/4 usually unnecessary, but provide it if the path read is rejected by authorization.",
        ),
      include_objects: z
        .boolean()
        .optional()
        .describe('Include list of objects in transport (default: true)'),
      include_tasks: z
        .boolean()
        .optional()
        .describe('Include list of tasks in transport (default: true)'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/transport/readonly/`이고 채록본 exposures 네 조건 전부에 뜬다.
    sets: ['readonly'],
    // 구 `readonlyGuard`의 READ_PREFIXES에 `Get`이 있어 읽기다
    // (`engine/src/lib/readonlyGuard.ts:42-54, 95-100`).
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.transport_number) {
        // 구는 `McpError(InvalidParams, …)`를 던져 프로토콜 오류로 올렸다 —
        // 문장은 그대로, 접두사만 빠진다(D34).
        return failure('Transport number is required');
      }

      const trNumber = args.transport_number;
      const includeObjects = args.include_objects !== false;
      const includeTasks = args.include_tasks !== false;
      const owner = args.owner || '';
      const sessionUser = sessionUserOf(context.env);

      const client = await context.getConnection();

      // ① 경로 단건 읽기.
      const pathUrl = `${ROOT_PATH}/${encodeObjectName(trNumber)}`;
      context.logger.debug(`GetTransport: path URL attempt — ${pathUrl}`);
      const pathResponse = await readTransportXml(client, pathUrl);

      let found = extractRequest(pathResponse.body, trNumber);
      let resolvedVia: 'path' | 'list' = 'path';
      let usedOwner = sessionUser;

      // ② 목록 폴백 — 경로 읽기가 못 찾았고 **다른 사용자**가 명시됐을 때만.
      if (!found && owner && owner !== sessionUser) {
        context.logger.debug(`GetTransport: list-by-owner fallback — ${ROOT_PATH}?user=${owner}`);
        const listResponse = await readTransportXml(client, ROOT_PATH, owner);
        found = extractRequest(listResponse.body, trNumber);
        if (found) {
          resolvedVia = 'list';
          usedOwner = owner;
        }
      }

      if (!found) {
        return failure(
          `Transport ${trNumber} not found via path read${
            owner ? ` or owner=${owner} list` : ''
          }. If this TR belongs to a different user, pass 'owner'.`,
        );
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            transport_number: trNumber,
            resolved_via: resolvedVia,
            view_type: found.viewType,
            owner_scope: usedOwner,
            ...buildTransportData(found.request, includeObjects, includeTasks),
            message: `Transport ${trNumber} retrieved successfully (${resolvedVia} read, ${found.viewType} view)`,
          },
          null,
          2,
        ),
      );
      // 구는 `return_response`의 status/headers 자리에 마지막 응답을 실었지만
      // 그 값은 발행 본문에 나타나지 않는다 — 신은 본문만 싣는다(차이가 아니다).
    } catch (error) {
      // 구는 `McpError`면 그대로 던지고(프로토콜 오류) 나머지만 `return_error`로
      // 접었다. 신 엔진에는 도구가 코드를 고르는 통로가 없으므로 문장만 보존한다.
      if (error instanceof TransportXmlError) return failure(error.message);
      return returnError(error);
    }
  },
);
