/**
 * `ReleaseTransport` — 이송요청 또는 태스크 하나를 ADT CTS 릴리스 액션으로 푼다.
 *
 * 구 핸들러: `engine/src/handlers/transport/high/handleReleaseTransport.ts`.
 * **위임형이 아니다** — 벤더 클라이언트를 거치지 않고 엔진이 직접
 * `makeAdtRequestWithTimeout`(`engine/src/lib/utils.ts:902-921`)을 부른다.
 *
 * ```
 * POST /sap/bc/adt/cts/transportrequests/<trkorr>/newreleasejobs
 *      Accept: application/vnd.sap.adt.transportorganizer.v1+xml, …organizertree.v1+xml
 *      timeout: getTimeout('long')      본문 없음
 * ```
 *
 * `Accept`는 `GetTransport`와 같은 두 값짜리 한 줄이고(`:30-31`), 타임아웃만
 * `'long'`이다(`:193`) — 릴리스는 백그라운드 작업을 띄우므로 오래 걸린다.
 *
 * ## 이 도구의 계약 정본은 **구 엔진 자신의 시험**이다
 *
 * `engine/src/__tests__/unit/releaseTransport.test.ts`가 다섯을 못박아 두었다:
 * POST · URL에 `/newreleasejobs`와 이송번호 · 왕복 **한 번** · 성공 payload의
 * `success`/`supported`/`status` · **HTTP 404면 오류가 아니라 `{supported:false}`**.
 * 신 엔진의 시험이 그 다섯을 그대로 받는다.
 *
 * ## 없는 엔드포인트는 오류가 아니다
 *
 * 이 액션은 이 레포가 채록한 `adt-discovery.xml`에 없어서 릴리스별 존재 여부가
 * 불확실하다. 그래서 404/405는 **성공 payload** `{ supported: false, … }`로 접는다
 * (`:199-220`) — `GetInstalledComponents`와 같은 판별 패턴이다. 그 갈래만
 * `JSON.stringify`에 들여쓰기가 없다(`:210`). 다른 실패는 전부 오류다.
 *
 * ## 순서는 이 도구가 지키지 않는다
 *
 * 태스크를 부모 요청보다 먼저 풀어야 한다는 CTS 규칙은 **호출자 몫**이다
 * (`:17-19`). 이 도구는 받은 trkorr 하나를 풀 뿐이다.
 *
 * ## `kind: 'mutation'` · `targetNames: []` — 실측 근거
 *
 *  - 구 `readonlyGuard`는 `Release*`를 `READ_PREFIXES`에도 `READ_TOOLS`에도 넣지
 *    않는다(`engine/src/lib/readonlyGuard.ts:42-74`). 실행 계열 두 집합에도 없다.
 *    그래서 마지막 fail-closed 갈래(`:118-122`)로 떨어져 **DEV 밖에서 전부 막힌다.**
 *    신 엔진에서 그 판정을 재현하는 값이 `mutation`이다. 이름이 `DANGEROUS_NAME_RE`
 *    (`src/safety/tier.ts`)에도 걸리므로 잘못 `read`로 적으면 교차검사가 잡는다 —
 *    그러나 **교차검사에 기대지 않는다.** 선언 자체가 맞아야 한다.
 *  - `targetNames`는 `mutation`이라 **선언이 필수**다. 이 도구가 받는 이름은
 *    이송번호 하나뿐이고, 녹화 사전 검사의 `isCustomerObject`
 *    (`harness/targetGuard.ts:99-105`)는 `Z`·`Y`로 시작하는지만 본다. `DEVK900123`
 *    꼴은 그 검사를 통과할 수 없으므로 선언하면 **정상 릴리스 녹화가 전부 막힌다.**
 *    그래서 **빈 배열**이 맞는 선언이다 — `src/server/toolDefinition.ts`가 그 자리를
 *    "이송번호만 받는 것"으로 명시해 두었다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 본문 없는 POST에 Content-Type을 스스로 정하지 않고 접속 계층에 맡겼다
 * (`utils.ts:941-957`은 통과 전달일 뿐이다). 신도 같다 — 도구가 헤더를 정하지 않는다.
 *
 * 실패 문구는 `Error: ` 접두사(구 `return_error`의 계약)를 지키되 뒤따르는 진단
 * 산문은 이 레포의 오류 계층이 새로 쓴 것이다 — 이미 등재된 항목이다
 * (`harness/DIVERGENCES.md` D13). SAP이 돌려준 텍스트 자체는 보존된다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from '../read/internal/adt';
import { describeFailure, errorResult, okResult } from './shared';

const ROOT_PATH = '/sap/bc/adt/cts/transportrequests';

/** `handleReleaseTransport.ts:30-31` — `GetTransport`와 같은 두 값짜리 한 줄. */
const ACCEPT_ORGANIZER_V1 =
  'application/vnd.sap.adt.transportorganizer.v1+xml, application/vnd.sap.adt.transportorganizertree.v1+xml';

/** 응답 모양을 알아보지 못했을 때 남기는 원문 발췌 길이(`:130`). */
const RAW_EXCERPT_LIMIT = 500;

export interface ReleaseJobResult {
  status: string | null;
  statusText: string | null;
  messages: string[];
}

/**
 * 구 파서 옵션 그대로(`:81-85`). **접두사가 `@_`다** — 같은 묶음의 다른 두 도구가
 * 쓰는 빈 접두사와 다르고, `parseAttributeValue`도 켜지 않는다.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

/** 구 `pickText`(`:139-149`). */
function pickText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return pickText((value as Record<string, unknown>)['#text']);
  }
  return null;
}

/** 구 `collectMessages`(`:151-169`) — 문자열이면 그대로, 객체면 네 키를 차례로. */
function collectMessages(node: unknown, out: string[]): void {
  if (!node) return;
  for (const item of Array.isArray(node) ? node : [node]) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) out.push(text);
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const message =
        pickText(record['tm:message']) ??
        pickText(record['chkrun:shortText']) ??
        pickText(record['@_tm:message']) ??
        pickText(record['#text']);
      if (message) out.push(message);
    }
  }
}

/**
 * 구 `parseReleaseJobResponse`(`:69-137`).
 *
 * SAP이 릴리스마다 다른 모양으로 답하므로 셋을 차례로 본다 — ⓐ 갱신된
 * `tm:request` 노드 ⓑ 릴리스 보고/작업 확인 ⓒ 뿌리의 상태 속성. 셋 다 빈손이면
 * **원문 발췌를 메시지로 남긴다** — 응답을 조용히 버리지 않는다.
 */
export function parseReleaseJobResponse(xml: string): ReleaseJobResult {
  const result: ReleaseJobResult = { status: null, statusText: null, messages: [] };
  if (!xml || typeof xml !== 'string' || xml.trim().length === 0) return result;

  try {
    const parsed = parser.parse(xml) as Record<string, any>;
    const root = parsed['tm:root'] || parsed.root || parsed;

    // ⓐ 갱신된 요청 노드가 새 상태를 직접 싣는다.
    const request = root?.['tm:request'];
    const requestNode = Array.isArray(request) ? request[0] : request;
    if (requestNode) {
      result.status =
        pickText(requestNode['@_tm:status']) ?? pickText(requestNode['tm:status']) ?? result.status;
      result.statusText =
        pickText(requestNode['@_tm:status_text']) ??
        pickText(requestNode['tm:status_text']) ??
        result.statusText;
    }

    // ⓑ 보고 목록은 한 겹 더 싸여 있을 수 있다(tm:releasereports > tm:releasereport).
    const container =
      root?.['tm:releasereports'] || root?.['tm:releasereport'] || root?.['tm:releasejob'];
    const reports = (container && container['tm:releasereport']) || container;
    collectMessages(reports, result.messages);
    collectMessages(root?.['chkrun:messages'], result.messages);

    // ⓒ 뿌리의 상태 속성.
    result.status =
      result.status ?? pickText(root?.['@_tm:status']) ?? pickText(root?.['@_state']) ?? null;
    result.statusText = result.statusText ?? pickText(root?.['@_tm:status_text']) ?? null;

    if (result.status === null && result.statusText === null && result.messages.length === 0) {
      result.messages.push(xml.trim().slice(0, RAW_EXCERPT_LIMIT));
    }
  } catch {
    result.messages.push(xml.trim().slice(0, RAW_EXCERPT_LIMIT));
  }

  return result;
}

export const releaseTransport = defineTool(
  {
    name: 'ReleaseTransport',
    description:
      'Release an ABAP transport request or task via the ADT CTS release action. Tasks must be released before their parent request. Returns the release status reported by SAP; on systems where the ADT release action is unavailable, returns { supported: false } instead of failing.',
    inputSchema: {
      transport_number: z
        .string()
        .describe('Transport request or task number to release (e.g., E19K905635, DEVK905123).'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/transport/high/`이고, 채록본 exposures에서도
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    // 대상 이름 인자가 **없다**는 명시 선언 — 위 머리주석 참조.
    targetNames: [],
  },
  async (context, args) => {
    try {
      if (!args.transport_number) {
        // 구는 `McpError(InvalidParams, …)`였다 — 문장은 그대로, 접두사만 빠진다(D34).
        return errorResult('Transport number is required');
      }

      const trNumber = args.transport_number;
      const path = `${ROOT_PATH}/${encodeObjectName(trNumber)}/newreleasejobs`;
      context.logger.info(`ReleaseTransport: releasing ${trNumber} via ${path}`);

      const client = await context.getConnection();

      let body: string;
      try {
        const response = await client.request({
          method: 'POST',
          path,
          accept: ACCEPT_ORGANIZER_V1,
          timeout: 'long',
        });
        body = response.body;
      } catch (error) {
        const status = error instanceof AdtError ? error.status : undefined;
        if (status === 404 || status === 405) {
          context.logger.info(
            `ReleaseTransport: ADT release action not available (HTTP ${String(status)})`,
          );
          // 이 갈래만 들여쓰기가 없다 — 구 그대로다.
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  supported: false,
                  transport_number: trNumber,
                  hint: 'ADT transport release action not available on this system — release via SE09/SE10 or STMS.',
                }),
              },
            ],
          };
        }
        throw error;
      }

      const parsed = parseReleaseJobResponse(body);
      context.logger.info(
        `ReleaseTransport: ${trNumber} release submitted (status=${parsed.status ?? 'unknown'})`,
      );

      return okResult({
        success: true,
        supported: true,
        transport_number: trNumber,
        status: parsed.status,
        status_text: parsed.statusText,
        messages: parsed.messages,
        message: `Release action submitted for ${trNumber}${
          parsed.status ? ` (status: ${parsed.status})` : ''
        }. Verify final state with GetTransport.`,
      });
    } catch (error) {
      // 구는 `return_error`로 접었다 — `Error: ` 접두사가 계약이다.
      return errorResult(`Error: ${describeFailure(error)}`);
    }
  },
);
