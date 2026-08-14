/**
 * `CreateTransport` — 이송요청 하나를 새로 만든다. **P4(이송) 등급이다.**
 *
 * 구 핸들러: `engine/src/handlers/transport/high/handleCreateTransport.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getRequest().create({...})` 한 줄이고(`:89-97`), 실제 요청은
 * 안쪽 패키지에서 조립된다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/transport/AdtRequest.js`의 `create()`
 *   → `dist/core/transport/create.js:60-90`
 *
 * ```
 * POST /sap/bc/adt/cts/transportrequests
 *      Accept: application/vnd.sap.adt.transportorganizer.v1+xml     ← 한 값뿐이다
 *      Content-Type: text/plain
 *      timeout: getTimeout('default')
 * ```
 *
 * 본문은 `create.js:14-27`의 템플릿 문자열 **글자 그대로**다(줄바꿈·들여쓰기 포함):
 *
 * ```
 * <?xml version="1.0" encoding="ASCII"?>
 * <tm:root xmlns:tm="…/cts/adt/tm" tm:useraction="newrequest">
 *   <tm:request tm:desc="…" tm:type="K|T" tm:target="…" tm:cts_project="">
 *     <tm:task tm:owner="…"/>
 *   </tm:request>
 * </tm:root>
 * ```
 *
 * 인자 변환 셋:
 *  - `transport_type`이 `'customizing'`이면 `tm:type="T"`, **그 밖에는 전부** `"K"`.
 *  - `target_system`은 앞뒤 슬래시로 감싼다(`/PRD/`). 값이 없거나 공백뿐이면
 *    `LOCAL`이다 — 감싸는 값은 **다듬지 않은 원본**이다(`create.js:20-22`).
 *  - `owner`가 없으면 `systemContext.responsible`(=`SAP_RESPONSIBLE || SAP_USERNAME`)로
 *    떨어지고, 그래도 없으면 **요청을 보내기 전에 던진다**(`create.js:66-70`).
 *    env에서만 읽는 것은 이미 등재된 결정이다(`harness/DIVERGENCES.md` D62).
 *
 * ## ⚠ 구는 만든 이송번호를 응답에서 잃었다 — 여기서 고쳤다 (D81)
 *
 * 구 핸들러는 벤더가 돌려준 객체를 `transportInfo`에 담고
 * (`handleCreateTransport.ts:145-147`) 거기서 **`transport_number`** 키를 읽는데
 * (`:163, 175`), 벤더가 채우는 키 이름은 **`transport_request`**다
 * (`create.js:78`). 폴백으로 쓰는 지역 변수 `transportNumber`는 `:106`에서 선언만
 * 되고 **값이 들어가는 자리가 없다.** 그래서 관측되는 응답은
 * `transport_request` 키가 통째로 빠진 채(`undefined`는 `JSON.stringify`가
 * 지운다) `message`가 **"Transport request unknown created successfully"**였다.
 *
 * 이송요청을 만들어 놓고 그 번호를 못 돌려주는 것은 호출자가 방금 만든 것을
 * 가리킬 수 없다는 뜻이고, 「성공이라고 답하지만 결과가 없다」는 이 레포가
 * 반복해 잡아 온 모양이다. 그래서 **수리**로 분류해 번호를 싣는다 — 근거·분류·
 * 대체 기대 시험은 `harness/DIVERGENCES.md` D81.
 *
 * `task_number`는 손대지 않았다. 벤더 응답에도 구의 죽은 XML 갈래에도 그 값을
 * 채우는 자리가 없어, 「없다」가 곧 관측값이다.
 *
 * ## 죽은 갈래 둘 (짓지 않았다)
 *
 *  - 구 핸들러의 `typeof createResult.data === 'string'` XML 파싱 갈래는 **도달하지
 *    않는다.** 벤더 `createTransport`는 언제나 객체를 돌려준다(`create.js:74-90`).
 *  - 벤더의 `description || 'Transport request created via MCP'` 폴백도 도달하지
 *    않는다 — 겉 핸들러가 빈 설명을 먼저 거절한다(`:72-77`).
 *
 * ## 레거시 시스템에서는 만들 수 없다 (구의 실측)
 *
 * `AdtRequestLegacy.create()`는 요청을 보내지 않고 던진다 — 레거시 CTS REST
 * 엔드포인트가 생성을 받지 않기 때문이다(`dist/core/transport/AdtRequestLegacy.js:25-35`).
 * 이 도구의 `available_in`에 `legacy`가 없는 것과 맞물리므로 그 갈래는 짓지 않았다.
 *
 * ## `kind: 'mutation'` · `targetNames: []` — 실측 근거
 *
 *  - 구 `readonlyGuard`는 `Create*`를 `READ_PREFIXES`에도 `READ_TOOLS`에도 넣지
 *    않아(`engine/src/lib/readonlyGuard.ts:42-74`) 마지막 fail-closed 갈래로
 *    떨어뜨린다 — **DEV 밖에서 전부 막힌다.**
 *  - `targetNames`는 `mutation`이라 필수인데, 이 도구는 **대상 객체 이름을 아예
 *    받지 않는다**(설명·이송종류·대상시스템·소유자뿐이다). 그래서 빈 배열이 맞다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { errorResult, okResult } from './shared';

const ROOT_PATH = '/sap/bc/adt/cts/transportrequests';

/** `dist/constants/contentTypes.js:36`의 `ACCEPT_TRANSPORT` — 한 값뿐이다. */
const ACCEPT_TRANSPORT = 'application/vnd.sap.adt.transportorganizer.v1+xml';
/** `create.js:71` — `text/plain`이다. 실제 본문은 XML인데도 그렇다. */
const CONTENT_TYPE = 'text/plain';

/** `create.js:31-35`의 파서 옵션 그대로. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
});

interface ParsedTransport {
  readonly transport_number?: string;
  readonly description?: string;
  readonly type?: string;
  readonly target_system?: string;
  readonly target_desc?: string;
  readonly cts_project?: string;
  readonly uri?: string;
}

/** 구 `buildCreateTransportXml`(`create.js:14-27`) — 줄바꿈·들여쓰기까지 그대로. */
export function buildCreateTransportXml(input: {
  readonly transportType: 'workbench' | 'customizing';
  readonly description: string;
  readonly targetSystem?: string;
  readonly owner: string;
}): string {
  const type = input.transportType === 'customizing' ? 'T' : 'K';
  // 감싸는 값은 **다듬지 않은 원본**이다 — 판정만 trim으로 한다(구 그대로).
  const target = input.targetSystem?.trim() ? `/${input.targetSystem}/` : 'LOCAL';
  return `<?xml version="1.0" encoding="ASCII"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">
  <tm:request tm:desc="${input.description}" tm:type="${type}" tm:target="${target}" tm:cts_project="">
    <tm:task tm:owner="${input.owner}"/>
  </tm:request>
</tm:root>`;
}

/** 구 `parseTransportResponse`(`create.js:31-57`). */
export function parseTransportResponse(xml: string): ParsedTransport {
  const result = parser.parse(xml) as Record<string, any>;
  const root = result['tm:root'] || result.root;
  if (!root) {
    throw new Error('Invalid transport response XML structure - no tm:root found');
  }
  const request = (root['tm:request'] || {}) as Record<string, any>;
  return {
    transport_number: request['tm:number'],
    description: request['tm:desc'] || request['tm:description'],
    type: request['tm:type'],
    target_system: request['tm:target'],
    target_desc: request['tm:target_desc'],
    cts_project: request['tm:cts_project'],
    uri: request['tm:uri'],
  };
}

/** 구 `e.response?.data ? … : e.message`의 자리(`create.js:92-97`). */
function failureDetail(error: unknown): string {
  if (error instanceof AdtError && error.rawBody) return error.rawBody;
  return error instanceof Error ? error.message : String(error);
}

/** 구 `getSystemContext().responsible`의 자리(D62 참조). */
function responsibleOf(env: ToolContext['env']): string | undefined {
  return env['SAP_RESPONSIBLE'] || env['SAP_USERNAME'] || undefined;
}

/**
 * 벤더 `createTransport` + `AdtRequest.create`를 한 자리로 접은 것. 두 계층이
 * 각각 감싸던 오류 문구는 **두 겹 그대로** 살린다.
 */
async function sendCreate(
  client: AdtClient,
  input: {
    readonly transportType: 'workbench' | 'customizing';
    readonly description: string;
    readonly targetSystem?: string;
    readonly owner?: string;
  },
): Promise<{ readonly parsed: ParsedTransport; readonly owner: string }> {
  const owner = input.owner;
  if (!owner) {
    // 요청을 보내기 **전에**, 그리고 벤더의 `try` **밖에서** 던진다
    // (`create.js:62-70`) — 그래서 `Failed to create transport request: ` 겹이
    // 붙지 않고 겉 핸들러의 한 겹만 붙는다.
    throw new Error(
      'Cannot create transport request: owner is required. Please provide owner in params.',
    );
  }

  let parsed: ParsedTransport;
  try {
    const response = await client.request({
      method: 'POST',
      path: ROOT_PATH,
      body: buildCreateTransportXml({ ...input, owner }),
      accept: ACCEPT_TRANSPORT,
      contentType: CONTENT_TYPE,
      timeout: 'default',
    });
    parsed = parseTransportResponse(response.body);
  } catch (error) {
    throw new Error(`Failed to create transport request: ${failureDetail(error)}`);
  }

  // 번호 없는 응답은 성공이 아니다(`AdtRequest.js`의 `create()`).
  if (!parsed.transport_number) {
    throw new Error('Failed to create transport request: transport number not returned');
  }
  return { parsed, owner };
}

export const createTransport = defineTool(
  {
    name: 'CreateTransport',
    description:
      'Create a new ABAP transport request in SAP system for development objects.',
    inputSchema: {
      transport_type: z
        .enum(['workbench', 'customizing'])
        .default('workbench')
        .describe("Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)"),
      description: z.string().describe('Transport request description (mandatory)'),
      target_system: z
        .string()
        .optional()
        .describe(
          "Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'",
        ),
      owner: z.string().optional().describe('Transport owner (optional, defaults to current user)'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/transport/high/`이고, 채록본 exposures에서도
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    // 대상 객체 이름을 아예 받지 않는다는 명시 선언 — 위 머리주석 참조.
    targetNames: [],
  },
  async (context, args) => {
    try {
      if (!args.description) {
        // 구는 `McpError(InvalidParams, …)`였다 — 문장은 그대로, 접두사만 빠진다(D34).
        return errorResult('Transport description is required');
      }

      context.logger.info(`Starting transport creation: ${args.description}`);

      const client = await context.getConnection();
      // 구는 `'customizing'`만 customizing으로 보고 나머지는 전부 workbench다.
      const transportType = args.transport_type === 'customizing' ? 'customizing' : 'workbench';

      try {
        const { parsed, owner } = await sendCreate(client, {
          transportType,
          description: args.description,
          targetSystem: args.target_system,
          owner: args.owner || responsibleOf(context.env),
        });

        context.logger.info('CreateTransport completed successfully');

        // 키와 폴백 순서는 구 그대로다(`handleCreateTransport.ts:158-179`).
        // 다른 것은 `transport_request`·`message`가 **번호를 싣는다**는 것뿐이다(D81).
        return okResult({
          success: true,
          transport_request: parsed.transport_number,
          description: parsed.description || args.description,
          type: parsed.type || (transportType === 'customizing' ? 'T' : 'K'),
          target_system: parsed.target_system || args.target_system || 'LOCAL',
          target_desc: parsed.target_desc,
          cts_project: parsed.cts_project,
          owner: owner || args.owner,
          uri: parsed.uri,
          message: `Transport request ${parsed.transport_number} created successfully`,
        });
      } catch (error) {
        context.logger.error('Error creating transport');
        // 겉 핸들러가 한 겹 더 감싼다 — 두 겹이 관측값이다.
        return errorResult(
          `Failed to create transport: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);
