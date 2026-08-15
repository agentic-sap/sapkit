/**
 * GetSystemInfo — SID·클라이언트·로그온 언어·접속 사용자 + ADT 스택 "현대/구형" 힌트.
 *
 * **오류를 내지 않는 도구다.** 두 갈래 모두 응답하지 않으면 `{ supported: false, reason }`을
 * `isError:false`로 돌려준다 — `GetInstalledComponents`와 같은 이유다. 이 답이
 * 플랫폼 자동 판별의 입력이므로 "이 릴리스엔 그 엔드포인트가 없다"는 오류가
 * 아니라 **유효한 데이터**다(`engine/src/handlers/system/readonly/handleGetSystemInfo.ts:12-16`).
 *
 * ## 와이어 동작을 어디서 복원했나
 *
 * 겉 핸들러는 `lib/systemInfoParsers.ts:38-63`의 `tryAdtGet`만 부르고, 그 헬퍼는
 * `lib/utils.ts:902-921`의 `makeAdtRequestWithTimeout` → `lib/utils.ts:941-958`의
 * `makeAdtRequest` → `connection.makeAdtRequest`로 내려간다. 실제 요청이 조립되는
 * 자리는 안쪽 패키지다 —
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-234`:
 *
 *  - URL = `baseUrl + endpoint`, 질의 인자 없음.
 *  - **호출자가 준 `Accept`가 기본값을 이긴다**(`:160-169` — 기본값은 호출자가
 *    `Accept`를 주지 않았을 때만 붙는다). 세 요청 모두 `Accept`를 명시하므로
 *    그 값이 그대로 나간다.
 *  - 셋 다 GET이라 CSRF 취득도 상태유지 세션 헤더도 붙지 않는다(`:146-159`는
 *    POST/PUT/DELETE에서만 돈다).
 *
 * `tryAdtGet`은 비 2xx·네트워크 오류를 `{ ok:false }`로 접는다(axios가 던지는
 * 것을 catch). 신 엔진의 `AdtClient.request()`도 `status >= 400`에서 던지므로
 * (`src/adt/client.ts:296`) 같은 자리에서 같은 갈래가 갈린다.
 *
 * ## discovery 두 경로는 이 도구의 **자기 요청**이다
 *
 * `/sap/bc/adt/core/discovery`와 `/sap/bc/adt/discovery`는 접속 계층이 CSRF
 * 토큰을 긁어올 때 쓰는 경로이기도 하다(`src/adt/client.ts:43-46`). 하지만 여기서는
 * **도구가 스스로 부르는 요청**이고, GET이라 CSRF 취득은 애초에 일어나지 않는다.
 * 시험이 요청을 셀 때 `toolRequests()`(CSRF 왕복 제거)를 쓰면 이 두 건이 함께
 * 지워지므로, 그 시험은 걸러지지 않은 원본 목록을 본다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 axios가 content-type을 보고 JSON을 **객체로 파싱한 뒤** `response.data`로
 * 넘겼고, 신은 본문을 항상 문자열로 넘긴다. `parseSystemInformation`은 구에서도
 * 이미 문자열과 객체 양쪽을 받도록 지어져 있었으므로(`systemInfoParsers.ts:70-76`)
 * 진입점만 다르고 결과 표는 같다. 등재할 차이가 아니다.
 */

import { defineTool } from '../../server/toolDefinition';
import { ok } from './internal/results';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const DISCOVERY_MODERN_PATH = '/sap/bc/adt/core/discovery';
const DISCOVERY_LEGACY_PATH = '/sap/bc/adt/discovery';

const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
const DISCOVERY_ACCEPT = 'application/atomsvc+xml';

export type AdtStackType = 'modern' | 'legacy' | 'unknown';

export interface AdtSystemInformation {
  readonly systemId?: string;
  readonly client?: string;
  readonly language?: string;
  readonly userName?: string;
  readonly userFullName?: string;
}

/**
 * 구 `parseSystemInformation`(`systemInfoParsers.ts:65-88`) 그대로.
 *
 * `systemID`(대문자 D)를 먼저 보고 `systemId`로 물러나는 순서가 요점이다 — ADT가
 * 내주는 키가 그쪽이고, 그것을 놓치면 SID가 조용히 null이 된다.
 */
export function parseSystemInformation(body: string): AdtSystemInformation {
  let document: unknown;
  try {
    document = JSON.parse(body);
  } catch {
    return {};
  }
  if (document === null || typeof document !== 'object') return {};
  const record = document as Record<string, unknown>;
  const text = (value: unknown): string | undefined =>
    value === undefined || value === null ? undefined : String(value);
  return {
    systemId: text(record['systemID'] ?? record['systemId']),
    client: text(record['client']),
    language: text(record['language']),
    userName: text(record['userName']),
    userFullName: text(record['userFullName']),
  };
}

export const getSystemInfo = defineTool(
  {
    name: 'GetSystemInfo',
    description:
      '[read-only] Retrieve SAP system identity: system ID (SID), client, logon language, connected user, and an ADT-stack "modern vs legacy" hint. Returns { supported: false } instead of an error when the underlying ADT endpoints are absent on this release.',
    inputSchema: {},
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context) => {
    const client = await context.getConnection();

    /** 구 `tryAdtGet` — 던지지 않고 `{ok:false}`로 접는다. */
    const tryGet = async (
      path: string,
      accept: string,
    ): Promise<{ ok: true; body: string; contentType: string } | { ok: false }> => {
      try {
        const response = await client.request({ method: 'GET', path, accept, timeout: 'default' });
        return {
          ok: true,
          body: response.body,
          contentType: response.headers['content-type'] ?? '',
        };
      } catch {
        return { ok: false };
      }
    };

    // 구는 시스템 정보를 **먼저** 묻고, 그 성패와 무관하게 discovery도 묻는다.
    const info = await tryGet(SYSTEMINFO_PATH, SYSTEMINFO_ACCEPT);

    let adtStackType: AdtStackType = 'unknown';
    const modern = await tryGet(DISCOVERY_MODERN_PATH, DISCOVERY_ACCEPT);
    if (modern.ok && modern.contentType.includes('xml')) {
      adtStackType = 'modern';
    } else {
      // 현대 경로가 없거나 XML이 아니면 구형 경로를 본다. 200이어도 XML이
      // 아니면 스택 판정에 쓰지 않는 것이 구의 조건이다.
      const legacy = await tryGet(DISCOVERY_LEGACY_PATH, DISCOVERY_ACCEPT);
      if (legacy.ok && legacy.contentType.includes('xml')) {
        adtStackType = 'legacy';
      }
    }

    if (!info.ok && adtStackType === 'unknown') {
      context.logger.info('GetSystemInfo: no ADT system-info endpoint responded');
      return ok(
        JSON.stringify({
          supported: false,
          reason:
            'Neither /sap/bc/adt/core/http/systeminformation nor the ADT discovery document responded on this system.',
        }),
      );
    }

    const parsed = info.ok ? parseSystemInformation(info.body) : {};

    return ok(
      JSON.stringify({
        supported: true,
        system_id: parsed.systemId ?? null,
        client: parsed.client ?? null,
        language: parsed.language ?? null,
        user_name: parsed.userName ?? null,
        user_full_name: parsed.userFullName ?? null,
        adt_stack_type: adtStackType,
      }),
    );
  },
);
